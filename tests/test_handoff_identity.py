"""Stable source identity tests through the public inventory seam."""

from __future__ import annotations

from dataclasses import FrozenInstanceError
from pathlib import Path

import pytest

from ai_coding_template_ja.openspec_gsd_handoff.models import Failure, Success
from ai_coding_template_ja.openspec_gsd_handoff.source_identity import (
    SourceCategory,
    SourceIdentityLimits,
    SourceObservation,
    fingerprint_source_observation,
    read_source_inventory,
)

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


@pytest.mark.parametrize(
    ("fixture_name", "code"),
    [
        ("duplicate-heading.md", "source-identity-duplicate"),
        ("unclosed-fence.md", "source-fence-unclosed"),
    ],
)
def test_inventory_rejects_ambiguous_fixture_without_partial_items(
    tmp_path: Path,
    fixture_name: str,
    code: str,
) -> None:
    repository, source_path = _write_source(
        tmp_path,
        (FIXTURE_ROOT / fixture_name).read_bytes(),
    )

    result = read_source_inventory(repository, [source_path])

    assert isinstance(result, Failure)
    assert result.issue.code == code
    assert not hasattr(result, "value")


@pytest.mark.parametrize(
    ("content", "code"),
    [
        (b"", "source-items-empty"),
        (b"\xff", "source-utf8-invalid"),
        (b"   ### Requirement: Indented\nBody.\n", "source-heading-unsupported"),
        (b"###Requirement: Missing separator\nBody.\n", "source-heading-unsupported"),
        (b"## Requirement: Wrong level\nBody.\n", "source-heading-unsupported"),
        (b"#### Scenario: Missing parent\nBody.\n", "source-scenario-parent-missing"),
    ],
)
def test_inventory_rejects_incomplete_or_unsupported_markdown(
    tmp_path: Path,
    content: bytes,
    code: str,
) -> None:
    repository, source_path = _write_source(tmp_path, content)

    result = read_source_inventory(repository, [source_path])

    assert isinstance(result, Failure)
    assert result.issue.code == code


@pytest.mark.parametrize(
    "source_path",
    [
        "",
        "/absolute/spec.md",
        "./spec.md",
        "../spec.md",
        "specs/../spec.md",
        "specs\\spec.md",
        "specs/\0spec.md",
    ],
)
def test_inventory_rejects_noncanonical_source_paths(
    tmp_path: Path,
    source_path: str,
) -> None:
    repository = tmp_path / "repository"
    repository.mkdir()

    result = read_source_inventory(repository, [source_path])

    assert isinstance(result, Failure)
    assert result.issue.code == "source-path-invalid"


def test_inventory_rejects_symlink_escape_without_following_it(tmp_path: Path) -> None:
    repository = tmp_path / "repository"
    repository.mkdir()
    outside = tmp_path / "outside.md"
    outside.write_text("### Requirement: Outside\nBody.\n", encoding="utf-8")
    link = repository / "spec.md"
    link.symlink_to(outside)

    result = read_source_inventory(repository, ["spec.md"])

    assert isinstance(result, Failure)
    assert result.issue.code == "source-path-symlink"


@pytest.mark.parametrize(
    ("first_path", "second_path"),
    [
        ("specs/Café/spec.md", "specs/Café/spec.md"),
        ("specs/Case/spec.md", "specs/case/spec.md"),
    ],
)
def test_inventory_rejects_unicode_and_case_path_aliases(
    tmp_path: Path,
    first_path: str,
    second_path: str,
) -> None:
    repository, _ = _write_source(
        tmp_path,
        b"### Requirement: First\nBody.\n",
        source_path=first_path,
    )
    second = repository / second_path
    second.parent.mkdir(parents=True, exist_ok=True)
    second.write_text("### Requirement: Second\nBody.\n", encoding="utf-8")

    result = read_source_inventory(repository, [first_path, second_path])

    assert isinstance(result, Failure)
    assert result.issue.code == "source-path-alias"


def test_inventory_enforces_item_file_and_total_limit_plus_one(
    tmp_path: Path,
) -> None:
    canonical = _canonical_bytes()
    repository, source_path = _write_source(tmp_path, canonical)
    other_path = "openspec/changes/fixture/specs/other/spec.md"
    other = repository / other_path
    other.parent.mkdir(parents=True)
    other.write_bytes(b"### Requirement: Other\nBody.\n")

    item_limit = read_source_inventory(
        repository,
        [source_path],
        limits=SourceIdentityLimits(
            max_items=2,
            bytes_per_file=len(canonical),
            bytes_total=len(canonical),
        ),
    )
    file_limit = read_source_inventory(
        repository,
        [source_path],
        limits=SourceIdentityLimits(
            max_items=10,
            bytes_per_file=len(canonical) - 1,
            bytes_total=len(canonical),
        ),
    )
    total_limit = read_source_inventory(
        repository,
        [source_path, other_path],
        limits=SourceIdentityLimits(
            max_items=10,
            bytes_per_file=len(canonical),
            bytes_total=len(canonical) + len(other.read_bytes()) - 1,
        ),
    )

    assert isinstance(item_limit, Failure)
    assert item_limit.issue.code == "source-item-limit-exceeded"
    assert isinstance(file_limit, Failure)
    assert file_limit.issue.code == "source-file-limit-exceeded"
    assert isinstance(total_limit, Failure)
    assert total_limit.issue.code == "source-total-limit-exceeded"


def test_later_source_failure_does_not_expose_earlier_observations(
    tmp_path: Path,
) -> None:
    repository, source_path = _write_source(tmp_path, _canonical_bytes())
    invalid_path = "openspec/changes/fixture/specs/invalid/spec.md"
    invalid = repository / invalid_path
    invalid.parent.mkdir(parents=True)
    invalid.write_bytes(b"\xff")

    result = read_source_inventory(repository, [source_path, invalid_path])

    assert isinstance(result, Failure)
    assert result.issue.code == "source-utf8-invalid"
    assert not hasattr(result, "value")
