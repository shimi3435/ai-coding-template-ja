"""Stable source identity tests through the public inventory seam."""

from __future__ import annotations

from dataclasses import FrozenInstanceError
from pathlib import Path

import pytest
from ai_coding_template_ja.openspec_gsd_handoff.source_identity import (
    SourceCategory,
    SourceObservation,
    fingerprint_source_observation,
    read_source_inventory,
)

from ai_coding_template_ja.openspec_gsd_handoff.models import Failure, Success

FIXTURE_ROOT = Path(__file__).parent / "fixtures" / "openspec_gsd_handoff" / "identity"
SOURCE_PATH = "openspec/changes/fixture/specs/lifecycle/spec.md"


def _write_source(
    tmp_path: Path,
    content: bytes,
    *,
    source_path: str = SOURCE_PATH,
) -> tuple[Path, str]:
    repository = tmp_path / "repository"
    target = repository / source_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)
    return repository, source_path


def _canonical_bytes() -> bytes:
    return (FIXTURE_ROOT / "canonical-spec.md").read_bytes()


def _fingerprint(observation: SourceObservation, parent_id: str | None) -> str:
    result = fingerprint_source_observation(observation, parent_id=parent_id)
    assert isinstance(result, Success)
    return result.value


def _normalized_projection(
    observation: SourceObservation,
) -> tuple[SourceCategory, str, str, object]:
    return (
        observation.category,
        observation.source_path,
        observation.normalized_heading,
        observation.parent_locator,
    )


def test_inventory_normalizes_supported_atx_blocks_and_fingerprints_literals(
    tmp_path: Path,
) -> None:
    repository, source_path = _write_source(tmp_path, _canonical_bytes())

    result = read_source_inventory(repository, [source_path])

    assert isinstance(result, Success)
    assert len(result.value.items) == 3
    requirement, scenario, secondary = result.value.items

    assert requirement.category is SourceCategory.REQUIREMENT
    assert requirement.source_path == SOURCE_PATH
    assert requirement.raw_heading == "### Requirement:\tCafé launch   ###"
    assert requirement.normalized_heading == "Requirement: Café launch"
    assert requirement.parent_locator is None
    assert requirement.normalized_block == (
        "Lead line with trailing spaces\n"
        "\n"
        "#### Scenario:  Prepare\t safely ##\n"
        "Do thing.\n"
        "```markdown\n"
        "### Requirement: ignored\n"
        "#### Scenario: ignored\n"
        "```\n"
        "Final.\n"
    )

    assert scenario.category is SourceCategory.SCENARIO
    assert scenario.raw_heading == "#### Scenario:  Prepare\t safely ##"
    assert scenario.normalized_heading == "Scenario: Prepare safely"
    assert scenario.parent_locator is not None
    assert scenario.parent_locator.source_path == SOURCE_PATH
    assert scenario.parent_locator.normalized_heading == "Requirement: Café launch"
    assert scenario.normalized_block == (
        "Do thing.\n"
        "```markdown\n"
        "### Requirement: ignored\n"
        "#### Scenario: ignored\n"
        "```\n"
        "Final.\n"
    )

    assert secondary.category is SourceCategory.REQUIREMENT
    assert secondary.raw_heading == "### Requirement: Secondary"
    assert secondary.normalized_heading == "Requirement: Secondary"
    assert secondary.parent_locator is None
    assert secondary.normalized_block == "Body.\n"

    assert _fingerprint(requirement, None) == (
        "7e8197a8ecc4bab70461a3b4b3280a6be468722b681ef28eb63d85c29826d203"
    )
    assert _fingerprint(scenario, "REQ-000001") == (
        "d253aa9eb12729b7846ac59cee9c9e0045150df9c2da66dfdb5caa22afe2c05f"
    )
    assert _fingerprint(secondary, None) == (
        "171e75a7657543d61adfacea8b091e0e991a884140670717d04f7f8f704ea871"
    )

    with pytest.raises(FrozenInstanceError):
        requirement.source_path = "changed.md"  # type: ignore[misc]


@pytest.mark.parametrize("line_ending", [b"\n", b"\r\n", b"\r"])
def test_equivalent_line_endings_nfc_and_display_heading_space_keep_identity(
    tmp_path: Path,
    line_ending: bytes,
) -> None:
    canonical = _canonical_bytes()
    equivalent = canonical.replace("Café".encode(), "Café".encode())
    equivalent = equivalent.replace(
        b"### Requirement:\t",
        "###\u00a0Requirement:   ".encode(),
    )
    equivalent = equivalent.replace(
        b"#### Scenario:  Prepare\t safely ##",
        "####\tScenario:\u00a0Prepare   safely\t###".encode(),
    )
    equivalent = line_ending.join(equivalent.split(b"\n"))
    repository, source_path = _write_source(tmp_path, equivalent)

    result = read_source_inventory(repository, [source_path])

    assert isinstance(result, Success)
    canonical_repository, canonical_path = _write_source(
        tmp_path / "canonical",
        canonical,
    )
    canonical_result = read_source_inventory(
        canonical_repository,
        [canonical_path],
    )
    assert isinstance(canonical_result, Success)
    assert tuple(map(_normalized_projection, result.value.items)) == tuple(
        map(_normalized_projection, canonical_result.value.items)
    )
    result_fingerprints = [
        _fingerprint(
            item, "REQ-000001" if item.category is SourceCategory.SCENARIO else None
        )
        for item in result.value.items
    ]
    canonical_fingerprints = [
        _fingerprint(
            item, "REQ-000001" if item.category is SourceCategory.SCENARIO else None
        )
        for item in canonical_result.value.items
    ]
    assert result_fingerprints[0] != canonical_fingerprints[0]
    assert result_fingerprints[1:] == canonical_fingerprints[1:]
    assert (
        result.value.items[0].raw_heading != canonical_result.value.items[0].raw_heading
    )


def test_source_order_and_return_order_do_not_change_identity_mapping(
    tmp_path: Path,
) -> None:
    repository, source_path = _write_source(tmp_path, _canonical_bytes())
    second_path = "openspec/changes/fixture/specs/other/spec.md"
    (repository / second_path).parent.mkdir(parents=True)
    (repository / second_path).write_text(
        "### Requirement: Other\nOther body.\n",
        encoding="utf-8",
    )

    forward = read_source_inventory(repository, [source_path, second_path])
    reverse = read_source_inventory(repository, [second_path, source_path])

    assert isinstance(forward, Success)
    assert isinstance(reverse, Success)

    def mapping(
        observations: tuple[SourceObservation, ...],
    ) -> dict[tuple[SourceCategory, str, str], str]:
        return {
            (item.category, item.source_path, item.normalized_heading): _fingerprint(
                item,
                "REQ-000001" if item.category is SourceCategory.SCENARIO else None,
            )
            for item in observations
        }

    assert mapping(forward.value.items) == mapping(reverse.value.items)
    assert mapping(forward.value.items) == mapping(tuple(reversed(forward.value.items)))


def test_block_content_change_keeps_normalized_identity_and_updates_fingerprint(
    tmp_path: Path,
) -> None:
    original_repository, source_path = _write_source(tmp_path, _canonical_bytes())
    changed_repository, changed_path = _write_source(
        tmp_path / "changed",
        _canonical_bytes().replace(b"Do thing.", b"Do another thing."),
    )

    original = read_source_inventory(original_repository, [source_path])
    changed = read_source_inventory(changed_repository, [changed_path])

    assert isinstance(original, Success)
    assert isinstance(changed, Success)
    original_requirement = original.value.items[0]
    changed_requirement = changed.value.items[0]
    assert (
        original_requirement.category,
        original_requirement.source_path,
        original_requirement.normalized_heading,
        original_requirement.parent_locator,
    ) == (
        changed_requirement.category,
        changed_requirement.source_path,
        changed_requirement.normalized_heading,
        changed_requirement.parent_locator,
    )
    assert _fingerprint(original_requirement, None) != _fingerprint(
        changed_requirement,
        None,
    )


def test_fingerprint_rejects_parent_mismatch_without_partial_value(
    tmp_path: Path,
) -> None:
    repository, source_path = _write_source(tmp_path, _canonical_bytes())
    inventory = read_source_inventory(repository, [source_path])
    assert isinstance(inventory, Success)

    requirement, scenario, _ = inventory.value.items
    requirement_result = fingerprint_source_observation(
        requirement,
        parent_id="REQ-000001",
    )
    scenario_result = fingerprint_source_observation(scenario, parent_id=None)

    assert isinstance(requirement_result, Failure)
    assert requirement_result.issue.code == "source-parent-id-invalid"
    assert isinstance(scenario_result, Failure)
    assert scenario_result.issue.code == "source-parent-id-invalid"
