"""Stable source identity tests through the public inventory seam."""

from __future__ import annotations

import os
from dataclasses import FrozenInstanceError
from pathlib import Path

import pytest
from hypothesis import given
from hypothesis import strategies as st

from ai_coding_template_ja.openspec_gsd_handoff import source_identity as identity
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


def test_inventory_rejects_markdown_outside_canonical_spec_artifacts(
    tmp_path: Path,
) -> None:
    repository, source_path = _write_source(
        tmp_path,
        b"### Requirement: Wrong artifact\nBody.\n",
        source_path="openspec/changes/fixture/design.md",
    )

    result = read_source_inventory(repository, [source_path])

    assert isinstance(result, Failure)
    assert result.issue.code == "source-path-noncanonical"


def test_inventory_rejects_symlink_escape_without_following_it(tmp_path: Path) -> None:
    repository = tmp_path / "repository"
    outside = tmp_path / "outside.md"
    outside.write_text("### Requirement: Outside\nBody.\n", encoding="utf-8")
    source_path = "openspec/changes/fixture/specs/link/spec.md"
    link = repository / source_path
    link.parent.mkdir(parents=True)
    link.symlink_to(outside)

    result = read_source_inventory(repository, [source_path])

    assert isinstance(result, Failure)
    assert result.issue.code == "source-path-symlink"


def test_inventory_rejects_parent_swap_before_source_open(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repository, source_path = _write_source(
        tmp_path,
        b"### Requirement: Inside\nInside body.\n",
    )
    source = repository / source_path
    source_parent = source.parent
    detached_parent = tmp_path / "detached-lifecycle"
    outside_parent = tmp_path / "outside-lifecycle"
    outside_parent.mkdir()
    (outside_parent / "spec.md").write_text(
        "### Requirement: Outside\nOutside body.\n",
        encoding="utf-8",
    )

    original_path_open = Path.open
    original_os_open = os.open
    swapped = False

    def swap_parent_once() -> None:
        nonlocal swapped
        if swapped:
            return
        swapped = True
        source_parent.rename(detached_parent)
        source_parent.symlink_to(outside_parent, target_is_directory=True)

    def racing_path_open(self: Path, *args: object, **kwargs: object):  # type: ignore[no-untyped-def]
        if self == source:
            swap_parent_once()
        return original_path_open(self, *args, **kwargs)

    def racing_os_open(
        path: str | bytes,
        flags: int,
        mode: int = 0o777,
        *,
        dir_fd: int | None = None,
    ) -> int:
        if path == source_parent.name and dir_fd is not None:
            swap_parent_once()
        return original_os_open(path, flags, mode, dir_fd=dir_fd)

    monkeypatch.setattr(Path, "open", racing_path_open)
    monkeypatch.setattr(os, "open", racing_os_open)

    result = read_source_inventory(repository, [source_path])

    assert swapped
    assert isinstance(result, Failure)
    assert result.issue.code in {"source-path-symlink", "source-path-identity-changed"}
    assert not hasattr(result, "value")


@pytest.mark.parametrize(
    ("first_path", "second_path"),
    [
        (
            "openspec/changes/fixture/specs/Café/spec.md",
            "openspec/changes/fixture/specs/Café/spec.md",
        ),
        (
            "openspec/changes/fixture/specs/Case/spec.md",
            "openspec/changes/fixture/specs/case/spec.md",
        ),
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


def _empty_source_state() -> identity.SourceIdentityState:
    return identity.SourceIdentityState(
        next_requirement_id=1,
        next_scenario_id=1,
        active=(),
        tombstones=(),
    )


def _active_requirement(
    source_id: str = "REQ-000001",
) -> identity.ActiveSourceItem:
    return identity.ActiveSourceItem(
        id=source_id,
        category=SourceCategory.REQUIREMENT,
        source_path=SOURCE_PATH,
        raw_heading="### Requirement: Existing",
        parent_id=None,
        fingerprint="1" * 64,
    )


def _requirement_observation(
    name: str,
    *,
    block: str = "Body.\n",
    source_path: str = SOURCE_PATH,
) -> identity.SourceObservation:
    return identity.SourceObservation(
        category=SourceCategory.REQUIREMENT,
        source_path=source_path,
        raw_heading=f"### Requirement: {name}",
        normalized_heading=f"Requirement: {name}",
        normalized_block=block,
        parent_locator=None,
    )


def _scenario_observation(
    name: str,
    *,
    parent_name: str,
    source_path: str = SOURCE_PATH,
) -> identity.SourceObservation:
    return identity.SourceObservation(
        category=SourceCategory.SCENARIO,
        source_path=source_path,
        raw_heading=f"#### Scenario: {name}",
        normalized_heading=f"Scenario: {name}",
        normalized_block="Steps.\n",
        parent_locator=identity.SourceParentLocator(
            source_path=source_path,
            normalized_heading=f"Requirement: {parent_name}",
        ),
    )


def test_reconcile_allocates_namespaced_ids_in_canonical_identity_order(
    tmp_path: Path,
) -> None:
    repository, source_path = _write_source(tmp_path, _canonical_bytes())
    inventory = read_source_inventory(repository, [source_path])
    assert isinstance(inventory, Success)

    result = identity.reconcile_source_items(inventory.value, _empty_source_state())

    assert isinstance(result, Success)
    assert result.value.state.next_requirement_id == 3
    assert result.value.state.next_scenario_id == 2
    assert result.value.created == (
        "REQ-000001",
        "REQ-000002",
        "SCN-000001",
    )
    assert result.value.updated == ()
    assert result.value.tombstoned == ()
    assert result.value.exclusions == ()
    assert tuple(item.id for item in result.value.state.active) == result.value.created
    first, second, scenario = result.value.state.active
    assert first.raw_heading == "### Requirement:\tCafé launch   ###"
    assert second.raw_heading == "### Requirement: Secondary"
    assert first.parent_id is None
    assert second.parent_id is None
    assert scenario.parent_id == "REQ-000001"


@pytest.mark.parametrize("counter", [0, True, 1_000_001])
def test_reconcile_rejects_invalid_counter_without_partial_state(
    counter: object,
) -> None:
    previous = identity.SourceIdentityState(
        next_requirement_id=counter,  # type: ignore[arg-type]
        next_scenario_id=1,
        active=(),
        tombstones=(),
    )

    result = identity.reconcile_source_items(
        identity.SourceInventory(
            items=(
                identity.SourceObservation(
                    category=SourceCategory.REQUIREMENT,
                    source_path=SOURCE_PATH,
                    raw_heading="### Requirement: New",
                    normalized_heading="Requirement: New",
                    normalized_block="Body.\n",
                    parent_locator=None,
                ),
            )
        ),
        previous,
    )

    assert isinstance(result, Failure)
    assert result.issue.code == "source-state-counter-invalid"
    assert not hasattr(result, "value")


def test_reconcile_rejects_noncanonical_id_and_suffix_at_counter() -> None:
    malformed_id = identity.SourceIdentityState(
        next_requirement_id=2,
        next_scenario_id=1,
        active=(_active_requirement("REQ-000000"),),
        tombstones=(),
    )
    suffix_at_counter = identity.SourceIdentityState(
        next_requirement_id=1,
        next_scenario_id=1,
        active=(_active_requirement(),),
        tombstones=(),
    )
    empty_inventory = identity.SourceInventory(items=())

    malformed_result = identity.reconcile_source_items(empty_inventory, malformed_id)
    counter_result = identity.reconcile_source_items(empty_inventory, suffix_at_counter)

    assert isinstance(malformed_result, Failure)
    assert malformed_result.issue.code == "source-state-id-invalid"
    assert isinstance(counter_result, Failure)
    assert counter_result.issue.code == "source-state-counter-invalid"


def test_reconcile_rejects_invalid_parent_and_duplicate_ids() -> None:
    parented_requirement = identity.ActiveSourceItem(
        id="REQ-000001",
        category=SourceCategory.REQUIREMENT,
        source_path=SOURCE_PATH,
        raw_heading="### Requirement: Existing",
        parent_id="REQ-000001",
        fingerprint="1" * 64,
    )
    orphan_scenario = identity.ActiveSourceItem(
        id="SCN-000001",
        category=SourceCategory.SCENARIO,
        source_path=SOURCE_PATH,
        raw_heading="#### Scenario: Existing",
        parent_id="REQ-000999",
        fingerprint="2" * 64,
    )
    duplicate_tombstone = identity.SourceTombstone(
        id="REQ-000001",
        category=SourceCategory.REQUIREMENT,
        last_source_path=SOURCE_PATH,
        last_raw_heading="### Requirement: Removed",
        last_parent_id=None,
        fingerprint="3" * 64,
    )
    empty_inventory = identity.SourceInventory(items=())

    parent_result = identity.reconcile_source_items(
        empty_inventory,
        identity.SourceIdentityState(
            next_requirement_id=2,
            next_scenario_id=1,
            active=(parented_requirement,),
            tombstones=(),
        ),
    )
    orphan_result = identity.reconcile_source_items(
        empty_inventory,
        identity.SourceIdentityState(
            next_requirement_id=1,
            next_scenario_id=2,
            active=(orphan_scenario,),
            tombstones=(),
        ),
    )
    duplicate_result = identity.reconcile_source_items(
        empty_inventory,
        identity.SourceIdentityState(
            next_requirement_id=2,
            next_scenario_id=1,
            active=(_active_requirement(),),
            tombstones=(duplicate_tombstone,),
        ),
    )

    assert isinstance(parent_result, Failure)
    assert parent_result.issue.code == "source-state-parent-invalid"
    assert isinstance(orphan_result, Failure)
    assert orphan_result.issue.code == "source-state-parent-invalid"
    assert isinstance(duplicate_result, Failure)
    assert duplicate_result.issue.code == "source-state-id-duplicate"


def test_reconcile_refuses_allocation_at_exhausted_sentinel() -> None:
    inventory = identity.SourceInventory(
        items=(
            identity.SourceObservation(
                category=SourceCategory.REQUIREMENT,
                source_path=SOURCE_PATH,
                raw_heading="### Requirement: New",
                normalized_heading="Requirement: New",
                normalized_block="Body.\n",
                parent_locator=None,
            ),
        )
    )
    previous = identity.SourceIdentityState(
        next_requirement_id=1_000_000,
        next_scenario_id=1,
        active=(),
        tombstones=(),
    )

    result = identity.reconcile_source_items(inventory, previous)

    assert isinstance(result, Failure)
    assert result.issue.code == "source-counter-exhausted"
    assert not hasattr(result, "value")


def test_reconcile_retains_exact_identity_and_updates_changed_fingerprint() -> None:
    initial = identity.reconcile_source_items(
        identity.SourceInventory(items=(_requirement_observation("Stable"),)),
        _empty_source_state(),
    )
    assert isinstance(initial, Success)

    changed = identity.reconcile_source_items(
        identity.SourceInventory(
            items=(
                _requirement_observation(
                    "Stable",
                    block="Changed body.\n",
                ),
            )
        ),
        initial.value.state,
    )

    assert isinstance(changed, Success)
    assert changed.value.created == ()
    assert changed.value.updated == ("REQ-000001",)
    assert changed.value.tombstoned == ()
    assert changed.value.state.active[0].id == "REQ-000001"
    assert (
        changed.value.state.active[0].fingerprint
        != initial.value.state.active[0].fingerprint
    )


def test_reconcile_requires_explicit_unique_match_for_renamed_identity() -> None:
    initial = identity.reconcile_source_items(
        identity.SourceInventory(items=(_requirement_observation("Original"),)),
        _empty_source_state(),
    )
    assert isinstance(initial, Success)
    renamed = _requirement_observation("Renamed")
    renamed_inventory = identity.SourceInventory(items=(renamed,))

    unmatched = identity.reconcile_source_items(
        renamed_inventory,
        initial.value.state,
    )
    matched = identity.reconcile_source_items(
        renamed_inventory,
        initial.value.state,
        explicit_matches=(
            identity.ExplicitSourceMatch(
                source_path=renamed.source_path,
                normalized_heading=renamed.normalized_heading,
                parent_locator=None,
                source_id="REQ-000001",
            ),
        ),
    )

    assert isinstance(unmatched, Success)
    assert unmatched.value.created == ("REQ-000002",)
    assert unmatched.value.tombstoned == ("REQ-000001",)
    assert isinstance(matched, Success)
    assert matched.value.created == ()
    assert matched.value.updated == ("REQ-000001",)
    assert matched.value.tombstoned == ()
    assert matched.value.state.active[0].id == "REQ-000001"


def test_reconcile_tombstones_parent_and_children_with_last_parent_evidence(
    tmp_path: Path,
) -> None:
    repository, source_path = _write_source(tmp_path, _canonical_bytes())
    inventory = read_source_inventory(repository, [source_path])
    assert isinstance(inventory, Success)
    initial = identity.reconcile_source_items(
        inventory.value,
        _empty_source_state(),
    )
    assert isinstance(initial, Success)

    removed = identity.reconcile_source_items(
        identity.SourceInventory(items=()),
        initial.value.state,
    )

    assert isinstance(removed, Success)
    assert removed.value.state.active == ()
    assert removed.value.tombstoned == (
        "REQ-000001",
        "REQ-000002",
        "SCN-000001",
    )
    requirement_ids = {
        item.id
        for item in removed.value.state.tombstones
        if item.category is SourceCategory.REQUIREMENT
    }
    scenario = next(
        item
        for item in removed.value.state.tombstones
        if item.category is SourceCategory.SCENARIO
    )
    assert scenario.last_parent_id == "REQ-000001"
    assert scenario.last_parent_id in requirement_ids


def test_reconcile_rejects_reintroduced_tombstone_locator_without_reallocation() -> (
    None
):
    observation = _requirement_observation("Removed")
    initial = identity.reconcile_source_items(
        identity.SourceInventory(items=(observation,)),
        _empty_source_state(),
    )
    assert isinstance(initial, Success)

    removed = identity.reconcile_source_items(
        identity.SourceInventory(items=()),
        initial.value.state,
    )
    assert isinstance(removed, Success)
    removed_state = removed.value.state

    reintroduced = identity.reconcile_source_items(
        identity.SourceInventory(items=(observation,)),
        removed_state,
    )

    assert isinstance(reintroduced, Failure)
    assert reintroduced.issue.code == "source-tombstone-identity-collision"
    assert not hasattr(reintroduced, "value")
    assert removed_state.next_requirement_id == 2
    assert tuple(item.id for item in removed_state.tombstones) == ("REQ-000001",)


def test_reconcile_rejects_many_to_one_and_unknown_explicit_matches() -> None:
    initial = identity.reconcile_source_items(
        identity.SourceInventory(items=(_requirement_observation("Original"),)),
        _empty_source_state(),
    )
    assert isinstance(initial, Success)
    first = _requirement_observation("First")
    second = _requirement_observation("Second")
    inventory = identity.SourceInventory(items=(first, second))

    many_to_one = identity.reconcile_source_items(
        inventory,
        initial.value.state,
        explicit_matches=(
            identity.ExplicitSourceMatch(
                first.source_path,
                first.normalized_heading,
                None,
                "REQ-000001",
            ),
            identity.ExplicitSourceMatch(
                second.source_path,
                second.normalized_heading,
                None,
                "REQ-000001",
            ),
        ),
    )
    unknown = identity.reconcile_source_items(
        identity.SourceInventory(items=(first,)),
        initial.value.state,
        explicit_matches=(
            identity.ExplicitSourceMatch(
                first.source_path,
                first.normalized_heading,
                None,
                "REQ-000999",
            ),
        ),
    )
    two_initial = identity.reconcile_source_items(
        identity.SourceInventory(
            items=(
                _requirement_observation("Original"),
                _requirement_observation("Other"),
            )
        ),
        _empty_source_state(),
    )
    assert isinstance(two_initial, Success)
    one_to_many = identity.reconcile_source_items(
        identity.SourceInventory(items=(first,)),
        two_initial.value.state,
        explicit_matches=(
            identity.ExplicitSourceMatch(
                first.source_path,
                first.normalized_heading,
                None,
                "REQ-000001",
            ),
            identity.ExplicitSourceMatch(
                first.source_path,
                first.normalized_heading,
                None,
                "REQ-000002",
            ),
        ),
    )

    assert isinstance(many_to_one, Failure)
    assert many_to_one.issue.code == "source-explicit-match-ambiguous"
    assert isinstance(one_to_many, Failure)
    assert one_to_many.issue.code == "source-explicit-match-ambiguous"
    assert isinstance(unknown, Failure)
    assert unknown.issue.code == "source-explicit-match-invalid"


def test_reconcile_requires_explicit_match_for_path_and_parent_changes() -> None:
    other_path = "openspec/changes/fixture/specs/other/spec.md"
    initial_inventory = identity.SourceInventory(
        items=(
            _requirement_observation("First"),
            _requirement_observation("Second"),
            _scenario_observation("Runs", parent_name="First"),
        )
    )
    initial = identity.reconcile_source_items(
        initial_inventory,
        _empty_source_state(),
    )
    assert isinstance(initial, Success)

    moved_requirement = _requirement_observation(
        "First",
        source_path=other_path,
    )
    parent_changed_scenario = _scenario_observation(
        "Runs",
        parent_name="Second",
    )
    changed_inventory = identity.SourceInventory(
        items=(
            moved_requirement,
            _requirement_observation("Second"),
            parent_changed_scenario,
        )
    )
    without_matches = identity.reconcile_source_items(
        changed_inventory,
        initial.value.state,
    )
    with_matches = identity.reconcile_source_items(
        changed_inventory,
        initial.value.state,
        explicit_matches=(
            identity.ExplicitSourceMatch(
                moved_requirement.source_path,
                moved_requirement.normalized_heading,
                None,
                "REQ-000001",
            ),
            identity.ExplicitSourceMatch(
                parent_changed_scenario.source_path,
                parent_changed_scenario.normalized_heading,
                parent_changed_scenario.parent_locator,
                "SCN-000001",
            ),
        ),
    )

    assert isinstance(without_matches, Success)
    assert without_matches.value.created == ("REQ-000003", "SCN-000002")
    assert without_matches.value.tombstoned == ("REQ-000001", "SCN-000001")
    assert isinstance(with_matches, Success)
    assert with_matches.value.created == ()
    assert with_matches.value.updated == ("REQ-000001", "SCN-000001")
    assert with_matches.value.tombstoned == ()
    assert {item.id for item in with_matches.value.state.active} == {
        "REQ-000001",
        "REQ-000002",
        "SCN-000001",
    }
    scenario = next(
        item
        for item in with_matches.value.state.active
        if item.category is SourceCategory.SCENARIO
    )
    assert scenario.parent_id == "REQ-000002"


@given(
    names=st.lists(
        st.from_regex(r"[A-Za-z]{1,12}", fullmatch=True).filter(
            lambda value: value != "Added"
        ),
        min_size=2,
        max_size=8,
        unique=True,
    )
)
def test_allocator_property_is_order_independent_idempotent_and_never_reuses(
    names: list[str],
) -> None:
    observations = tuple(_requirement_observation(name) for name in names)
    forward = identity.reconcile_source_items(
        identity.SourceInventory(items=observations),
        _empty_source_state(),
    )
    reverse = identity.reconcile_source_items(
        identity.SourceInventory(items=tuple(reversed(observations))),
        _empty_source_state(),
    )
    assert isinstance(forward, Success)
    assert isinstance(reverse, Success)
    assert forward.value.state == reverse.value.state
    assert forward.value.state.next_requirement_id == len(names) + 1

    removed_name = sorted(names)[0]
    retained = tuple(
        observation
        for observation in observations
        if observation.normalized_heading != f"Requirement: {removed_name}"
    )
    removed = identity.reconcile_source_items(
        identity.SourceInventory(items=tuple(reversed(retained))),
        forward.value.state,
    )
    assert isinstance(removed, Success)
    assert len(removed.value.state.tombstones) == 1
    removed_id = removed.value.state.tombstones[0].id
    assert removed.value.state.next_requirement_id == len(names) + 1

    rerun = identity.reconcile_source_items(
        identity.SourceInventory(items=retained),
        removed.value.state,
    )
    assert isinstance(rerun, Success)
    assert rerun.value.state == removed.value.state
    assert rerun.value.created == ()
    assert rerun.value.updated == ()
    assert rerun.value.tombstoned == ()

    added = identity.reconcile_source_items(
        identity.SourceInventory(items=(*retained, _requirement_observation("Added"))),
        rerun.value.state,
    )
    assert isinstance(added, Success)
    assert added.value.created == (f"REQ-{len(names) + 1:06d}",)
    assert added.value.created[0] != removed_id
    assert added.value.state.tombstones == removed.value.state.tombstones
    assert added.value.state.next_requirement_id == len(names) + 2
