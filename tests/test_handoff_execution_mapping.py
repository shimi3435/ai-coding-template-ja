"""Fixed examples for explicit source-to-execution mapping."""

from __future__ import annotations

from dataclasses import FrozenInstanceError, replace
from pathlib import Path

import pytest

from ai_coding_template_ja.openspec_gsd_handoff.execution_mapping import (
    PhaseAssignment,
    PhaseDeclaration,
    build_manifest_mappings,
    read_planning_inventory,
)
from ai_coding_template_ja.openspec_gsd_handoff.manifest_v2 import (
    parse_manifest_v2_bytes,
)
from ai_coding_template_ja.openspec_gsd_handoff.models import Failure, Success
from ai_coding_template_ja.openspec_gsd_handoff.policy_reference import (
    observe_policy_sections,
    read_policy_reference_registry,
)
from ai_coding_template_ja.openspec_gsd_handoff.source_identity import (
    SourceIdentityState,
    SourceTombstone,
    read_source_inventory,
    reconcile_source_items,
)

REPOSITORY_ROOT = Path(__file__).parents[1]
ASSIGNMENT_FIXTURE = (
    "tests/fixtures/openspec_gsd_handoff/mapping/hardening-phase-assignments.json"
)
HANDOFF_PATH = ".planning/openspec/harden-openspec-gsd-handoff-lifecycle/handoff.json"
POLICY_REGISTRY_PATH = "docs/agents/adaptive-change-execution.references.json"
SOURCE_PATH = (
    "openspec/changes/harden-openspec-gsd-handoff-lifecycle/specs/"
    "openspec-gsd-handoff-lifecycle-hardening/spec.md"
)


def _current_source_items():
    previous = parse_manifest_v2_bytes((REPOSITORY_ROOT / HANDOFF_PATH).read_bytes())
    assert isinstance(previous, Success)
    inventory = read_source_inventory(REPOSITORY_ROOT, (SOURCE_PATH,))
    assert isinstance(inventory, Success)
    reconciled = reconcile_source_items(inventory.value, previous.value.source_items)
    assert isinstance(reconciled, Success)
    assert len(reconciled.value.state.active) == 49
    assert reconciled.value.state.tombstones == ()
    return reconciled.value.state


def _policy_evidence():
    registry = read_policy_reference_registry(REPOSITORY_ROOT, POLICY_REGISTRY_PATH)
    assert isinstance(registry, Success)
    observations = observe_policy_sections(REPOSITORY_ROOT, registry.value)
    assert isinstance(observations, Success)
    return registry.value, observations.value


def test_fixed_inventory_builds_exact_sorted_49_mapping_baseline() -> None:
    source_items = _current_source_items()
    registry, observations = _policy_evidence()
    inventory = read_planning_inventory(
        REPOSITORY_ROOT,
        ASSIGNMENT_FIXTURE,
        policy_observations=observations,
    )
    assert isinstance(inventory, Success)

    result = build_manifest_mappings(source_items, inventory.value, registry)

    assert isinstance(result, Success)
    assert len(result.value) == 49
    assert tuple(mapping.source_id for mapping in result.value) == tuple(
        sorted(item.id for item in source_items.active)
    )
    assert len({mapping.source_id for mapping in result.value}) == 49
    assert not {mapping.source_id for mapping in result.value} & {
        item.id for item in source_items.tombstones
    }
    assert sum(mapping.phase_id == "02" for mapping in result.value) == 10
    assert all(mapping.plan_paths == () for mapping in result.value)
    assert all(mapping.evidence_paths == () for mapping in result.value)


def _baseline():
    source_items = _current_source_items()
    registry, observations = _policy_evidence()
    inventory = read_planning_inventory(
        REPOSITORY_ROOT,
        ASSIGNMENT_FIXTURE,
        policy_observations=observations,
    )
    assert isinstance(inventory, Success)
    return source_items, registry, inventory.value


def test_planning_inventory_values_are_immutable() -> None:
    _, _, inventory = _baseline()

    with pytest.raises(FrozenInstanceError):
        inventory.change_id = "other-change"  # type: ignore[misc]


@pytest.mark.parametrize(
    ("case", "expected_code"),
    [
        ("missing", "mapping-source-coverage-incomplete"),
        ("extra", "mapping-source-unknown"),
        ("duplicate", "mapping-source-duplicate"),
        ("tombstone", "mapping-tombstone-reference"),
        ("phase-conflict", "mapping-phase-conflict"),
        ("phase-path-conflict", "mapping-phase-path-conflict"),
        ("path-alias", "mapping-path-alias"),
        ("cross-change", "mapping-cross-change-reference"),
        ("policy-id", "mapping-policy-reference-invalid"),
        ("limit", "mapping-inventory-limit-exceeded"),
    ],
)
def test_builder_rejects_invalid_declarations_without_partial_mappings(
    case: str,
    expected_code: str,
) -> None:
    source_items, registry, inventory = _baseline()
    if case == "missing":
        inventory = replace(inventory, assignments=inventory.assignments[:-1])
    elif case == "extra":
        inventory = replace(
            inventory,
            assignments=(
                *inventory.assignments[:-1],
                replace(inventory.assignments[-1], source_id="SCN-999999"),
            ),
        )
    elif case == "duplicate":
        inventory = replace(
            inventory,
            assignments=(*inventory.assignments, inventory.assignments[0]),
        )
    elif case == "tombstone":
        removed = source_items.active[0]
        source_items = SourceIdentityState(
            next_requirement_id=source_items.next_requirement_id,
            next_scenario_id=source_items.next_scenario_id,
            active=source_items.active[1:],
            tombstones=(
                SourceTombstone(
                    id=removed.id,
                    category=removed.category,
                    last_source_path=removed.source_path,
                    last_raw_heading=removed.raw_heading,
                    last_parent_id=removed.parent_id,
                    fingerprint=removed.fingerprint,
                ),
            ),
        )
    elif case == "phase-conflict":
        inventory = replace(
            inventory,
            phases=(
                *inventory.phases,
                replace(
                    inventory.phases[0],
                    phase_path=".planning/phases/01-conflicting-path",
                ),
            ),
        )
    elif case == "phase-path-conflict":
        inventory = replace(
            inventory,
            phases=(
                *inventory.phases,
                PhaseDeclaration(
                    change_id=inventory.change_id,
                    phase_id="07",
                    phase_path=inventory.phases[0].phase_path,
                ),
            ),
        )
    elif case == "path-alias":
        inventory = replace(
            inventory,
            phases=(
                *inventory.phases,
                PhaseDeclaration(
                    change_id=inventory.change_id,
                    phase_id="07",
                    phase_path=".planning/phases/01-Stable-Identity-and-Migration",
                ),
            ),
        )
    elif case == "cross-change":
        inventory = replace(inventory, change_id="other-change")
    elif case == "policy-id":
        assignment = inventory.assignments[0]
        inventory = replace(
            inventory,
            assignments=(
                replace(
                    assignment,
                    policy_references=(*assignment.policy_references, "not-valid"),
                ),
                *inventory.assignments[1:],
            ),
        )
    elif case == "limit":
        inventory = replace(
            inventory,
            assignments=tuple(
                PhaseAssignment(
                    change_id=inventory.change_id,
                    source_id=f"SCN-{index:06d}",
                    phase_id="01",
                    policy_references=(),
                )
                for index in range(1, 4098)
            ),
        )
    else:  # pragma: no cover - parametrization is exhaustive
        raise AssertionError(case)

    result = build_manifest_mappings(source_items, inventory, registry)

    assert isinstance(result, Failure)
    assert result.issue.code == expected_code
    assert not hasattr(result, "value")
