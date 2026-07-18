"""Fixed examples for explicit source-to-execution mapping."""

from __future__ import annotations

from pathlib import Path

from ai_coding_template_ja.openspec_gsd_handoff.execution_mapping import (
    build_manifest_mappings,
    read_planning_inventory,
)

from ai_coding_template_ja.openspec_gsd_handoff.manifest_v2 import (
    parse_manifest_v2_bytes,
)
from ai_coding_template_ja.openspec_gsd_handoff.models import Success
from ai_coding_template_ja.openspec_gsd_handoff.policy_reference import (
    observe_policy_sections,
    read_policy_reference_registry,
)
from ai_coding_template_ja.openspec_gsd_handoff.source_identity import (
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
