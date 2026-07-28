"""Fixed examples for explicit source-to-execution mapping."""

from __future__ import annotations

import ast
import inspect
from dataclasses import FrozenInstanceError, replace
from pathlib import Path
from typing import Any, cast

import pytest

from ai_coding_template_ja.openspec_gsd_handoff import execution_mapping
from ai_coding_template_ja.openspec_gsd_handoff.execution_mapping import (
    EvidenceDeclaration,
    MappingIssue,
    MappingOperation,
    PhaseAssignment,
    PhaseDeclaration,
    PlanDeclaration,
    PlanningInventory,
    build_manifest_mappings,
    read_planning_inventory,
    validate_mapping_readiness,
)
from ai_coding_template_ja.openspec_gsd_handoff.manifest_v2 import (
    ManifestMapping,
    parse_manifest_v2_bytes,
)
from ai_coding_template_ja.openspec_gsd_handoff.models import Failure, Success
from ai_coding_template_ja.openspec_gsd_handoff.policy_reference import (
    PolicySectionObservation,
    observe_policy_sections,
    read_policy_reference_registry,
)
from ai_coding_template_ja.openspec_gsd_handoff.source_identity import (
    SourceCategory,
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


def _unsafe_replace(value: Any, /, **changes: object) -> Any:
    copy = replace(value)
    for field, item in changes.items():
        object.__setattr__(copy, field, item)
    return copy


def _source_state_with_tombstone(
    state: SourceIdentityState,
) -> SourceIdentityState:
    scenario = next(
        item for item in state.active if item.category is SourceCategory.SCENARIO
    )
    requirement = next(item for item in state.active if item.id == scenario.parent_id)
    requirement_suffix = int(requirement.id.removeprefix("REQ-"))
    scenario_suffix = int(scenario.id.removeprefix("SCN-"))
    return SourceIdentityState(
        next_requirement_id=requirement_suffix + 2,
        next_scenario_id=scenario_suffix + 1,
        active=(requirement, scenario),
        tombstones=(
            SourceTombstone(
                id=f"REQ-{requirement_suffix + 1:06d}",
                category=SourceCategory.REQUIREMENT,
                last_source_path=requirement.source_path,
                last_raw_heading="### Requirement: Retired mapping admission",
                last_parent_id=None,
                fingerprint=requirement.fingerprint,
            ),
        ),
    )


def _malformed_mapping_source_states(
    state: SourceIdentityState,
) -> tuple[tuple[str, object], ...]:
    state = _source_state_with_tombstone(state)
    requirement, scenario = state.active
    tombstone = state.tombstones[0]
    requirement_suffix = int(requirement.id.removeprefix("REQ-"))
    aliased_path_parts = requirement.source_path.split("/")
    aliased_path_parts[-2] = aliased_path_parts[-2].upper()
    duplicate = replace(
        requirement,
        id=f"REQ-{state.next_requirement_id:06d}",
    )
    oversized = replace(
        requirement,
        raw_heading="### Requirement: " + "x" * 8_388_609,
    )
    return (
        ("active-member-none", replace(state, active=(None, scenario))),
        ("outer", object()),
        ("next-requirement-type", replace(state, next_requirement_id="3")),
        ("next-scenario-boolean", replace(state, next_scenario_id=True)),
        ("counter-bound", replace(state, next_requirement_id=1_000_001)),
        ("active-container", replace(state, active=list(state.active))),
        ("tombstone-container", replace(state, tombstones=list(state.tombstones))),
        ("active-member-class", replace(state, active=(tombstone, scenario))),
        ("tombstone-member", replace(state, tombstones=(None,))),
        ("tombstone-member-class", replace(state, tombstones=(requirement,))),
        (
            "active-id-field",
            replace(state, active=(replace(requirement, id=1), scenario)),
        ),
        (
            "active-category-field",
            replace(
                state,
                active=(replace(requirement, category="requirement"), scenario),
            ),
        ),
        (
            "active-path-field",
            replace(state, active=(replace(requirement, source_path=None), scenario)),
        ),
        (
            "active-heading-field",
            replace(state, active=(replace(requirement, raw_heading=None), scenario)),
        ),
        (
            "active-parent-field",
            replace(
                state, active=(requirement, replace(scenario, parent_id="REQ-999999"))
            ),
        ),
        (
            "active-fingerprint-field",
            replace(state, active=(replace(requirement, fingerprint=None), scenario)),
        ),
        (
            "tombstone-id-field",
            replace(state, tombstones=(replace(tombstone, id=2),)),
        ),
        (
            "tombstone-category-field",
            replace(
                state,
                tombstones=(replace(tombstone, category="requirement"),),
            ),
        ),
        (
            "tombstone-path-field",
            replace(
                state,
                tombstones=(replace(tombstone, last_source_path=None),),
            ),
        ),
        (
            "tombstone-heading-field",
            replace(
                state,
                tombstones=(replace(tombstone, last_raw_heading=None),),
            ),
        ),
        (
            "tombstone-parent-field",
            replace(
                state,
                tombstones=(replace(tombstone, last_parent_id=requirement.id),),
            ),
        ),
        (
            "tombstone-fingerprint-field",
            replace(state, tombstones=(replace(tombstone, fingerprint=None),)),
        ),
        (
            "duplicate-id",
            replace(state, tombstones=(replace(tombstone, id=requirement.id),)),
        ),
        (
            "duplicate-identity",
            replace(
                state,
                next_requirement_id=state.next_requirement_id + 1,
                active=(*state.active, duplicate),
            ),
        ),
        (
            "path-alias",
            replace(
                state,
                next_requirement_id=state.next_requirement_id + 1,
                active=(
                    *state.active,
                    replace(
                        duplicate,
                        source_path="/".join(aliased_path_parts),
                        raw_heading="### Requirement: Aliased mapping admission",
                    ),
                ),
            ),
        ),
        ("item-limit", replace(state, active=state.active * 2049)),
        ("byte-limit", replace(state, active=(oversized, scenario))),
        (
            "requirement-counter-order",
            replace(state, next_requirement_id=requirement_suffix),
        ),
        (
            "scenario-counter-order",
            replace(
                state,
                next_scenario_id=int(scenario.id.removeprefix("SCN-")),
            ),
        ),
    )


def test_builder_and_readiness_reject_malformed_source_identity_state() -> None:
    source_items, registry, inventory = _baseline()
    mappings = _mappings(source_items, registry, inventory)

    for case, malformed in _malformed_mapping_source_states(source_items):
        builder = build_manifest_mappings(cast(Any, malformed), inventory, registry)
        readiness = validate_mapping_readiness(
            REPOSITORY_ROOT,
            cast(Any, malformed),
            mappings,
            inventory,
            operation=MappingOperation.PLAN,
            target_phase_id="02",
        )

        for result in (builder, readiness):
            assert isinstance(result, Failure), case
            assert result.issue.code == "mapping-input-invalid", case
            assert not hasattr(result, "value"), case


def _replace_inventory_member(
    inventory: PlanningInventory,
    collection: str,
    member: object,
) -> PlanningInventory:
    values = cast(tuple[object, ...], getattr(inventory, collection))
    return _unsafe_replace(inventory, **{collection: (member, *values[1:])})


def _malformed_inventory_cases(
    inventory: PlanningInventory,
) -> tuple[tuple[str, object, str], ...]:
    phase = inventory.phases[0]
    assignment = inventory.assignments[0]
    plan = inventory.plans[0]
    evidence = inventory.evidence[0]
    observation = inventory.policy_observations[0]
    cases: list[tuple[str, object, str]] = [
        ("outer", object(), "mapping-input-invalid"),
        (
            "version-type",
            _unsafe_replace(inventory, version=1),
            "mapping-inventory-value-invalid",
        ),
        (
            "change-id-type",
            _unsafe_replace(inventory, change_id=1),
            "mapping-inventory-value-invalid",
        ),
    ]
    for collection in (
        "phases",
        "assignments",
        "plans",
        "evidence",
        "policy_observations",
    ):
        values = cast(tuple[object, ...], getattr(inventory, collection))
        cases.extend(
            (
                (
                    f"{collection}-container",
                    _unsafe_replace(inventory, **{collection: list(values)}),
                    "mapping-inventory-value-invalid",
                ),
                (
                    f"{collection}-limit",
                    _unsafe_replace(
                        inventory,
                        **{collection: (values[0],) * 4097},
                    ),
                    "mapping-inventory-limit-exceeded",
                ),
                (
                    f"{collection}-member",
                    _replace_inventory_member(inventory, collection, None),
                    "mapping-inventory-value-invalid",
                ),
            )
        )
    member_fields = (
        ("phases-change-id", "phases", phase, "change_id"),
        ("phases-phase-id", "phases", phase, "phase_id"),
        ("phases-phase-path", "phases", phase, "phase_path"),
        ("assignments-change-id", "assignments", assignment, "change_id"),
        ("assignments-source-id", "assignments", assignment, "source_id"),
        ("assignments-phase-id", "assignments", assignment, "phase_id"),
        ("plans-change-id", "plans", plan, "change_id"),
        ("plans-phase-id", "plans", plan, "phase_id"),
        ("plans-path", "plans", plan, "path"),
        ("evidence-change-id", "evidence", evidence, "change_id"),
        ("evidence-phase-id", "evidence", evidence, "phase_id"),
        ("evidence-path", "evidence", evidence, "path"),
        ("evidence-source-id", "evidence", evidence, "source_id"),
        ("evidence-plan-path", "evidence", evidence, "plan_path"),
        (
            "policy-reference-id",
            "policy_observations",
            observation,
            "reference_id",
        ),
        (
            "policy-raw-source-path",
            "policy_observations",
            observation,
            "raw_source_path",
        ),
        (
            "policy-source-path",
            "policy_observations",
            observation,
            "source_path",
        ),
        (
            "policy-raw-heading",
            "policy_observations",
            observation,
            "raw_heading",
        ),
        (
            "policy-normalized-heading",
            "policy_observations",
            observation,
            "normalized_heading",
        ),
        (
            "policy-normalized-body",
            "policy_observations",
            observation,
            "normalized_body",
        ),
        (
            "policy-body-length",
            "policy_observations",
            observation,
            "body_length",
        ),
        ("policy-sha256", "policy_observations", observation, "sha256"),
    )
    cases.extend(
        (
            case,
            _replace_inventory_member(
                inventory,
                collection,
                _unsafe_replace(member, **{field: 1}),
            ),
            "mapping-inventory-value-invalid",
        )
        for case, collection, member, field in member_fields
    )
    cases.extend(
        (
            (
                "assignment-policy-container",
                _replace_inventory_member(
                    inventory,
                    "assignments",
                    _unsafe_replace(
                        assignment,
                        policy_references=list(assignment.policy_references),
                    ),
                ),
                "mapping-inventory-value-invalid",
            ),
            (
                "assignment-policy-member",
                _replace_inventory_member(
                    inventory,
                    "assignments",
                    _unsafe_replace(assignment, policy_references=(1,)),
                ),
                "mapping-inventory-value-invalid",
            ),
            (
                "policy-body-length-mismatch",
                _replace_inventory_member(
                    inventory,
                    "policy_observations",
                    replace(observation, body_length=observation.body_length + 1),
                ),
                "mapping-inventory-value-invalid",
            ),
        )
    )
    return tuple(cases)


def test_planning_inventory_runtime_validation_rejects_every_malformed_family() -> None:
    source_items, registry, baseline = _baseline()
    inventory = _inventory_with_execution_declarations(baseline)
    validator = getattr(execution_mapping, "validate_planning_inventory", None)
    assert validator is not None
    valid = validator(inventory)
    assert isinstance(valid, Success)
    assert valid.value is inventory

    for case, malformed, expected_code in _malformed_inventory_cases(inventory):
        validated = validator(malformed)
        assert isinstance(validated, Failure), case
        assert validated.issue.code == expected_code, case
        built = build_manifest_mappings(
            source_items,
            cast(PlanningInventory, malformed),
            registry,
        )
        assert isinstance(built, Failure), case
        assert built.issue.code == expected_code, case
        assert not hasattr(built, "value"), case


def test_readiness_rejects_malformed_inventory_without_partial_result(
    tmp_path: Path,
) -> None:
    source_items, _, baseline = _baseline()
    inventory = _inventory_with_execution_declarations(baseline)

    for case, malformed, expected_code in _malformed_inventory_cases(inventory):
        result = validate_mapping_readiness(
            tmp_path,
            source_items,
            (),
            cast(PlanningInventory, malformed),
            operation=MappingOperation.PLAN,
            target_phase_id="02",
        )
        assert isinstance(result, Failure), case
        assert result.issue.code == expected_code, case
        assert not hasattr(result, "value"), case


def test_planning_inventory_runtime_validation_covers_reader_policy_evidence() -> None:
    result = read_planning_inventory(
        REPOSITORY_ROOT,
        ASSIGNMENT_FIXTURE,
        policy_observations=cast(tuple[PolicySectionObservation, ...], (None,)),
    )

    assert isinstance(result, Failure)
    assert result.issue.code == "mapping-inventory-value-invalid"


def test_planning_inventory_values_are_immutable() -> None:
    _, _, inventory = _baseline()

    with pytest.raises(FrozenInstanceError):
        inventory.change_id = "other-change"  # type: ignore[misc]


def test_planning_inventory_rejects_noncanonical_and_symlink_paths(
    tmp_path: Path,
) -> None:
    repository = tmp_path / "repository"
    target = repository / "inventory.json"
    target.parent.mkdir()
    target.write_bytes((REPOSITORY_ROOT / ASSIGNMENT_FIXTURE).read_bytes())
    symlink = repository / "inventory-link.json"
    symlink.symlink_to(target)

    unsafe_paths = (
        str(target),
        "nested/../inventory.json",
        "./inventory.json",
        "inventory\\.json",
        "inventory\0.json",
        "Cafe\u0301.json",
        "inventory-link.json",
    )

    for unsafe_path in unsafe_paths:
        result = read_planning_inventory(repository, unsafe_path)
        assert isinstance(result, Failure), unsafe_path
        assert result.issue.code == "mapping-inventory-path-invalid"


def test_planning_inventory_rejects_identity_change_during_bounded_read(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repository = tmp_path / "repository"
    target = repository / "inventory.json"
    target.parent.mkdir()
    target.write_bytes((REPOSITORY_ROOT / ASSIGNMENT_FIXTURE).read_bytes())
    replacement = tmp_path / "replacement.json"
    replacement.write_bytes(target.read_bytes())
    original_read = execution_mapping.os.read
    swapped = False

    def swap_after_read(descriptor: int, size: int) -> bytes:
        nonlocal swapped
        data = original_read(descriptor, size)
        if not swapped:
            swapped = True
            target.unlink()
            target.symlink_to(replacement)
        return data

    monkeypatch.setattr(execution_mapping.os, "read", swap_after_read)

    result = read_planning_inventory(repository, "inventory.json")

    assert isinstance(result, Failure)
    assert result.issue.code == "mapping-inventory-path-invalid"


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
        removed = next(
            item
            for item in reversed(source_items.active)
            if item.category is SourceCategory.SCENARIO
        )
        source_items = SourceIdentityState(
            next_requirement_id=source_items.next_requirement_id,
            next_scenario_id=source_items.next_scenario_id,
            active=tuple(item for item in source_items.active if item.id != removed.id),
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


def _inventory_with_execution_declarations(inventory, phase_ids=("02",)):
    plans = tuple(
        PlanDeclaration(
            change_id=inventory.change_id,
            phase_id=phase_id,
            path=next(
                phase.phase_path
                for phase in inventory.phases
                if phase.phase_id == phase_id
            )
            + f"/{phase_id}-01-PLAN.md",
        )
        for phase_id in phase_ids
    )
    evidence = tuple(
        EvidenceDeclaration(
            change_id=inventory.change_id,
            phase_id=assignment.phase_id,
            path=f".planning/evidence/{assignment.source_id}.json",
            source_id=assignment.source_id,
        )
        for assignment in inventory.assignments
        if assignment.phase_id in phase_ids
    ) + tuple(
        EvidenceDeclaration(
            change_id=inventory.change_id,
            phase_id=plan.phase_id,
            path=f".planning/evidence/plan-{plan.phase_id}.json",
            plan_path=plan.path,
        )
        for plan in plans
    )
    return replace(inventory, plans=plans, evidence=evidence)


def _write_declared_paths(repository: Path, inventory, *, evidence: bool) -> None:
    for phase in inventory.phases:
        (repository / phase.phase_path).mkdir(parents=True, exist_ok=True)
    for plan in inventory.plans:
        path = repository / plan.path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("plan\n", encoding="utf-8")
    if evidence:
        for declaration in inventory.evidence:
            path = repository / declaration.path
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("evidence\n", encoding="utf-8")


def _mappings(source_items, registry, inventory):
    result = build_manifest_mappings(source_items, inventory, registry)
    assert isinstance(result, Success)
    return result.value


def _replace_mapping(
    mappings: tuple[ManifestMapping, ...],
    mapping: object,
) -> tuple[ManifestMapping, ...]:
    return cast(tuple[ManifestMapping, ...], (mapping, *mappings[1:]))


def test_readiness_rejects_manifest_mapping_outer_container_and_member_families(
    tmp_path: Path,
) -> None:
    source_items, registry, baseline = _baseline()
    inventory = _inventory_with_execution_declarations(baseline)
    mappings = _mappings(source_items, registry, inventory)
    first = mappings[0]
    cases: tuple[tuple[str, object], ...] = (
        (
            "source-id-list",
            _replace_mapping(mappings, _unsafe_replace(first, source_id=[])),
        ),
        ("outer-list", list(mappings)),
        ("outer-limit", (first,) * 4097),
        ("member-class", _replace_mapping(mappings, None)),
        (
            "source-id-type",
            _replace_mapping(mappings, _unsafe_replace(first, source_id=1)),
        ),
        (
            "phase-id-type",
            _replace_mapping(mappings, _unsafe_replace(first, phase_id=2)),
        ),
        (
            "phase-path-type",
            _replace_mapping(mappings, _unsafe_replace(first, phase_path=None)),
        ),
    )

    for case, malformed in cases:
        result = validate_mapping_readiness(
            tmp_path,
            source_items,
            cast(Any, malformed),
            inventory,
            operation=MappingOperation.PLAN,
            target_phase_id="02",
        )

        assert isinstance(result, Failure), case
        assert result.issue.code == "mapping-set-invalid", case
        assert not hasattr(result, "value"), case


def _malformed_mapping_nested_cases(
    mappings: tuple[ManifestMapping, ...],
) -> tuple[tuple[str, tuple[ManifestMapping, ...]], ...]:
    first = mappings[0]
    phase_plan_path = f"{first.phase_path}/02-01-PLAN.md"
    invalid_scalar = "\ud800"
    cases: list[tuple[str, tuple[ManifestMapping, ...]]] = []
    for field, valid_path in (
        ("plan_paths", phase_plan_path),
        ("evidence_paths", ".planning/evidence/REQ-000001.json"),
        ("policy_references", "ACE-S2-OPEN-SPEC-AUTHORITY"),
    ):
        families: tuple[tuple[str, object], ...] = (
            ("container", [valid_path]),
            ("limit", (valid_path,) * 4097),
            ("member", (1,)),
            ("unicode", (invalid_scalar,)),
            ("unsorted", (valid_path + "-b", valid_path + "-a")),
            ("duplicate", (valid_path, valid_path)),
        )
        if field != "policy_references":
            families += (
                ("alias", (valid_path, valid_path.swapcase())),
                ("noncanonical", ("../outside",)),
            )
        else:
            families += (("syntax", ("not-a-policy-reference",)),)
        for family, value in families:
            cases.append(
                (
                    f"{field}-{family}",
                    _replace_mapping(
                        mappings,
                        _unsafe_replace(first, **{field: value}),
                    ),
                )
            )

    outer_cases = (
        ("source-order", (mappings[1], mappings[0], *mappings[2:])),
        (
            "source-duplicate",
            (
                mappings[0],
                replace(mappings[1], source_id=mappings[0].source_id),
                *mappings[2:],
            ),
        ),
        (
            "source-syntax",
            _replace_mapping(mappings, replace(first, source_id="REQ-1")),
        ),
        (
            "phase-syntax",
            _replace_mapping(mappings, replace(first, phase_id="2")),
        ),
        (
            "phase-path-shape",
            _replace_mapping(mappings, replace(first, phase_path="phases/02-wrong")),
        ),
        (
            "phase-path-consistency",
            _replace_mapping(
                mappings,
                replace(first, phase_path=".planning/phases/03-wrong"),
            ),
        ),
        (
            "plan-phase-consistency",
            _replace_mapping(
                mappings,
                replace(
                    first,
                    plan_paths=(".planning/phases/03-wrong/03-01-PLAN.md",),
                ),
            ),
        ),
        (
            "aggregate-byte-limit",
            _replace_mapping(
                mappings,
                replace(
                    first,
                    phase_path=".planning/phases/02-" + "x" * 8_388_609,
                ),
            ),
        ),
    )
    cases.extend(outer_cases)
    return tuple(cases)


def test_readiness_rejects_manifest_mapping_field_tuple_order_uniqueness_and_path_families(  # noqa: E501
    tmp_path: Path,
) -> None:
    source_items, registry, baseline = _baseline()
    inventory = _inventory_with_execution_declarations(baseline)
    mappings = _mappings(source_items, registry, inventory)

    for case, malformed in _malformed_mapping_nested_cases(mappings):
        result = validate_mapping_readiness(
            tmp_path,
            source_items,
            malformed,
            inventory,
            operation=MappingOperation.PLAN,
            target_phase_id="02",
        )

        assert isinstance(result, Failure), case
        assert result.issue.code == "mapping-set-invalid", case
        assert not hasattr(result, "value"), case


def test_builder_and_readiness_share_canonical_mapping_projection() -> None:
    source_items, registry, baseline = _baseline()
    compact_state = _source_state_with_tombstone(source_items)
    compact_ids = {item.id for item in compact_state.active}
    inventory = replace(
        baseline,
        assignments=tuple(
            assignment
            for assignment in baseline.assignments
            if assignment.source_id in compact_ids
        ),
    )
    expected = (
        ManifestMapping(
            source_id="REQ-000001",
            phase_id="02",
            phase_path=".planning/phases/02-source-to-execution-mapping",
            plan_paths=(),
            evidence_paths=(),
            policy_references=(
                "ACE-S2-OPEN-SPEC-AUTHORITY",
                "ACE-S4-CONTEXT-PARITY",
            ),
        ),
        ManifestMapping(
            source_id="SCN-000001",
            phase_id="01",
            phase_path=".planning/phases/01-stable-identity-and-migration",
            plan_paths=(),
            evidence_paths=(),
            policy_references=(),
        ),
    )

    built = build_manifest_mappings(compact_state, inventory, registry)
    assert isinstance(built, Success)
    assert built.value == expected

    ready = validate_mapping_readiness(
        REPOSITORY_ROOT,
        compact_state,
        expected,
        inventory,
        operation=MappingOperation.PLAN,
        target_phase_id="02",
    )
    assert isinstance(ready, Success)
    assert ready.value.ready

    module = ast.parse(inspect.getsource(execution_mapping))
    functions = {
        node.name: node
        for node in module.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }
    for public_name in ("build_manifest_mappings", "validate_mapping_readiness"):
        helper_calls = [
            node
            for node in ast.walk(functions[public_name])
            if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id == "_project_canonical_manifest_mappings"
        ]
        assert len(helper_calls) == 1, public_name
    constructors = {
        name
        for name, function in functions.items()
        if any(
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id == "ManifestMapping"
            for node in ast.walk(function)
        )
    }
    assert constructors == {"_project_canonical_manifest_mappings"}


def test_plan_requires_only_complete_assignments_and_selected_phase(
    tmp_path: Path,
) -> None:
    source_items, registry, inventory = _baseline()
    mappings = _mappings(source_items, registry, inventory)
    selected = next(phase for phase in inventory.phases if phase.phase_id == "02")
    (tmp_path / selected.phase_path).mkdir(parents=True)

    result = validate_mapping_readiness(
        tmp_path,
        source_items,
        mappings,
        inventory,
        operation=MappingOperation.PLAN,
        target_phase_id="02",
    )

    assert isinstance(result, Success)
    assert result.value.ready
    assert result.value.issues == ()


def test_readiness_rejects_phase_directory_renamed_after_descriptor_open(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source_items, registry, inventory = _baseline()
    mappings = _mappings(source_items, registry, inventory)
    selected = next(phase for phase in inventory.phases if phase.phase_id == "02")
    selected_path = tmp_path / selected.phase_path
    selected_path.mkdir(parents=True)
    detached_path = tmp_path / "detached-phase"
    original_open = execution_mapping.os.open
    renamed = False

    def rename_after_open(
        path: str | bytes | Path,
        flags: int,
        mode: int = 0o777,
        *,
        dir_fd: int | None = None,
    ) -> int:
        nonlocal renamed
        descriptor = original_open(path, flags, mode, dir_fd=dir_fd)
        if (
            not renamed
            and path == selected_path.name
            and dir_fd is not None
            and flags & execution_mapping.os.O_DIRECTORY
        ):
            selected_path.rename(detached_path)
            renamed = True
        return descriptor

    monkeypatch.setattr(execution_mapping.os, "open", rename_after_open)

    result = validate_mapping_readiness(
        tmp_path,
        source_items,
        mappings,
        inventory,
        operation=MappingOperation.PLAN,
        target_phase_id="02",
    )

    assert renamed
    assert isinstance(result, Success)
    assert not result.value.ready
    assert MappingIssue("mapping-path-identity-changed", selected.phase_path) in (
        result.value.issues
    )


def test_execute_requires_declared_plan_but_not_evidence(tmp_path: Path) -> None:
    source_items, registry, baseline = _baseline()
    empty = _mappings(source_items, registry, baseline)
    missing_declaration = validate_mapping_readiness(
        tmp_path,
        source_items,
        empty,
        baseline,
        operation=MappingOperation.EXECUTE,
        target_phase_id="02",
    )
    assert isinstance(missing_declaration, Success)
    assert not missing_declaration.value.ready
    assert MappingIssue("mapping-plan-declarations-empty", "02") in (
        missing_declaration.value.issues
    )

    inventory = _inventory_with_execution_declarations(baseline)
    mappings = _mappings(source_items, registry, inventory)
    _write_declared_paths(tmp_path, inventory, evidence=False)
    result = validate_mapping_readiness(
        tmp_path,
        source_items,
        mappings,
        inventory,
        operation=MappingOperation.EXECUTE,
        target_phase_id="02",
    )

    assert isinstance(result, Success)
    assert result.value.ready


def test_verify_requires_every_selected_source_and_plan_evidence(
    tmp_path: Path,
) -> None:
    source_items, registry, baseline = _baseline()
    inventory = _inventory_with_execution_declarations(baseline)
    mappings = _mappings(source_items, registry, inventory)
    _write_declared_paths(tmp_path, inventory, evidence=True)

    ready = validate_mapping_readiness(
        tmp_path,
        source_items,
        mappings,
        inventory,
        operation=MappingOperation.VERIFY,
        target_phase_id="02",
    )
    assert isinstance(ready, Success)
    assert ready.value.ready

    missing_path = tmp_path / inventory.evidence[0].path
    missing_path.unlink()
    not_ready = validate_mapping_readiness(
        tmp_path,
        source_items,
        mappings,
        inventory,
        operation=MappingOperation.VERIFY,
        target_phase_id="02",
    )
    assert isinstance(not_ready, Success)
    assert not not_ready.value.ready
    assert MappingIssue("mapping-path-missing", inventory.evidence[0].path) in (
        not_ready.value.issues
    )


def test_readiness_rejects_evidence_removed_during_bounded_read(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source_items, registry, baseline = _baseline()
    inventory = _inventory_with_execution_declarations(baseline)
    mappings = _mappings(source_items, registry, inventory)
    _write_declared_paths(tmp_path, inventory, evidence=True)
    declared_path = inventory.evidence[0].path
    evidence_path = tmp_path / declared_path
    original_read = execution_mapping.os.read
    removed = False

    def remove_evidence_after_read(descriptor: int, size: int) -> bytes:
        nonlocal removed
        data = original_read(descriptor, size)
        if not removed:
            try:
                opened_path = Path(
                    execution_mapping.os.readlink(f"/proc/self/fd/{descriptor}")
                )
            except OSError:
                return data
            if opened_path == evidence_path:
                evidence_path.unlink()
                removed = True
        return data

    monkeypatch.setattr(execution_mapping.os, "read", remove_evidence_after_read)

    result = validate_mapping_readiness(
        tmp_path,
        source_items,
        mappings,
        inventory,
        operation=MappingOperation.VERIFY,
        target_phase_id="02",
    )

    assert removed
    assert isinstance(result, Success)
    assert not result.value.ready
    assert MappingIssue("mapping-path-identity-changed", declared_path) in (
        result.value.issues
    )


def test_readiness_rejects_earlier_evidence_removed_while_later_path_is_read(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source_items, registry, baseline = _baseline()
    inventory = _inventory_with_execution_declarations(baseline)
    mappings = _mappings(source_items, registry, inventory)
    _write_declared_paths(tmp_path, inventory, evidence=True)
    victim_path = inventory.evidence[0].path
    victim = tmp_path / victim_path
    later_evidence = tmp_path / ".planning/evidence/plan-02.json"
    original_read = execution_mapping.os.read
    removed = False

    def remove_earlier_evidence(descriptor: int, size: int) -> bytes:
        nonlocal removed
        data = original_read(descriptor, size)
        if not removed:
            try:
                opened_path = Path(
                    execution_mapping.os.readlink(f"/proc/self/fd/{descriptor}")
                )
            except OSError:
                return data
            if opened_path == later_evidence:
                victim.unlink()
                removed = True
        return data

    monkeypatch.setattr(execution_mapping.os, "read", remove_earlier_evidence)

    result = validate_mapping_readiness(
        tmp_path,
        source_items,
        mappings,
        inventory,
        operation=MappingOperation.VERIFY,
        target_phase_id="02",
    )

    assert removed
    assert isinstance(result, Success)
    assert not result.value.ready
    assert MappingIssue("mapping-path-identity-changed", victim_path) in (
        result.value.issues
    )


def test_finalize_requires_nonempty_declarations_for_every_phase(
    tmp_path: Path,
) -> None:
    source_items, registry, baseline = _baseline()
    baseline_mappings = _mappings(source_items, registry, baseline)
    not_ready = validate_mapping_readiness(
        tmp_path,
        source_items,
        baseline_mappings,
        baseline,
        operation=MappingOperation.FINALIZE,
    )
    assert isinstance(not_ready, Success)
    assert not not_ready.value.ready
    assert MappingIssue("mapping-plan-declarations-empty", "01") in (
        not_ready.value.issues
    )

    inventory = _inventory_with_execution_declarations(
        baseline, tuple(phase.phase_id for phase in baseline.phases)
    )
    mappings = _mappings(source_items, registry, inventory)
    _write_declared_paths(tmp_path, inventory, evidence=True)
    ready = validate_mapping_readiness(
        tmp_path,
        source_items,
        mappings,
        inventory,
        operation=MappingOperation.FINALIZE,
    )
    assert isinstance(ready, Success)
    assert ready.value.ready


@pytest.mark.parametrize(
    ("operation", "target_phase_id", "expected_code"),
    [
        ("unknown", "02", "mapping-operation-invalid"),
        (MappingOperation.PLAN, "99", "mapping-phase-unknown"),
    ],
)
def test_readiness_rejects_unknown_operation_or_phase(
    tmp_path: Path, operation, target_phase_id: str, expected_code: str
) -> None:
    source_items, registry, inventory = _baseline()
    mappings = _mappings(source_items, registry, inventory)

    result = validate_mapping_readiness(
        tmp_path,
        source_items,
        mappings,
        inventory,
        operation=operation,
        target_phase_id=target_phase_id,
    )

    assert isinstance(result, Failure)
    assert result.issue.code == expected_code


@pytest.mark.parametrize("path_kind", ["symlink", "directory", "limit-plus-one"])
def test_verify_rejects_unsafe_evidence_observation(
    tmp_path: Path, path_kind: str
) -> None:
    source_items, registry, baseline = _baseline()
    inventory = _inventory_with_execution_declarations(baseline)
    mappings = _mappings(source_items, registry, inventory)
    _write_declared_paths(tmp_path, inventory, evidence=True)
    evidence_path = tmp_path / inventory.evidence[0].path
    evidence_path.unlink()
    if path_kind == "symlink":
        evidence_path.symlink_to(tmp_path / inventory.evidence[1].path)
        expected_code = "mapping-path-symlink"
    elif path_kind == "directory":
        evidence_path.mkdir()
        expected_code = "mapping-path-non-regular"
    else:
        evidence_path.write_bytes(b"x" * (8_388_608 + 1))
        expected_code = "mapping-path-byte-limit-exceeded"

    result = validate_mapping_readiness(
        tmp_path,
        source_items,
        mappings,
        inventory,
        operation=MappingOperation.VERIFY,
        target_phase_id="02",
    )

    assert isinstance(result, Success)
    assert not result.value.ready
    assert (
        MappingIssue(expected_code, inventory.evidence[0].path) in result.value.issues
    )
