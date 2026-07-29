"""Public-seam examples for the shared lifecycle admission gate."""

from __future__ import annotations

import hashlib
import json
import re
import tempfile
from dataclasses import replace
from pathlib import Path, PurePosixPath
from typing import Any, cast

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from ai_coding_template_ja.openspec_gsd_handoff import lifecycle_gate
from ai_coding_template_ja.openspec_gsd_handoff.execution_mapping import (
    EvidenceDeclaration,
    MappingOperation,
    PhaseAssignment,
    PhaseDeclaration,
    PlanDeclaration,
    PlanningInventory,
    read_planning_inventory,
)
from ai_coding_template_ja.openspec_gsd_handoff.lifecycle_drift import (
    CanonicalSourceObservation,
    DriftState,
    classify_canonical_source_drift,
    normalize_tasks_specification,
    observe_canonical_source,
)
from ai_coding_template_ja.openspec_gsd_handoff.lifecycle_gate import (
    CapabilityObservation,
    LifecycleGateDecision,
    LifecycleGateLimits,
    LifecycleGateState,
    LifecycleObservationBoundary,
    LifecycleOperation,
    PhaseGraphObservation,
    PhaseNodeObservation,
    SourceCommitObservation,
    gate_lifecycle_operation,
)
from ai_coding_template_ja.openspec_gsd_handoff.manifest import (
    MAX_MANIFEST_BYTES,
    GsdCapability,
    ManifestArtifact,
    ManifestCapabilities,
    OpenSpecCapability,
)
from ai_coding_template_ja.openspec_gsd_handoff.manifest_v2 import (
    HandoffManifestV2,
    ManifestLifecycle,
    ManifestMapping,
    ManifestOwnership,
    parse_manifest_v2_bytes,
    serialize_manifest_v2,
)
from ai_coding_template_ja.openspec_gsd_handoff.models import (
    ArtifactClaim,
    ArtifactKind,
    ClassifiedIssue,
    Failure,
    HandoffState,
    HostCapabilityInput,
    HostDispatch,
    HostSpawnSchema,
    IssueCategory,
    KnownState,
    Progress,
    Success,
)
from ai_coding_template_ja.openspec_gsd_handoff.policy_reference import (
    PolicySectionObservation,
    observe_policy_sections,
    read_policy_reference_registry,
)
from ai_coding_template_ja.openspec_gsd_handoff.preflight import (
    COMMAND_TIMEOUT_SECONDS,
    subprocess_runner,
)
from ai_coding_template_ja.openspec_gsd_handoff.progress import (
    MAX_TASKS,
    parse_task_progress,
)
from ai_coding_template_ja.openspec_gsd_handoff.reader import (
    DEFAULT_ARTIFACT_LIMITS,
)
from ai_coding_template_ja.openspec_gsd_handoff.source_identity import (
    SourceCategory,
    SourceIdentityLimits,
    SourceIdentityState,
    SourceTombstone,
)

CHANGE_ID = "fixture-change"
SOURCE_COMMIT = "1" * 40
PROPOSAL_PATH = f"openspec/changes/{CHANGE_ID}/proposal.md"
DESIGN_PATH = f"openspec/changes/{CHANGE_ID}/design.md"
TASKS_PATH = f"openspec/changes/{CHANGE_ID}/tasks.md"
SPEC_PATH = f"openspec/changes/{CHANGE_ID}/specs/lifecycle/spec.md"
MANIFEST_PATH = f".planning/openspec/{CHANGE_ID}/handoff.json"

REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
REAL_CHANGE_ID = "harden-openspec-gsd-handoff-lifecycle"
REAL_HANDOFF_PATH = f".planning/openspec/{REAL_CHANGE_ID}/handoff.json"
REAL_ASSIGNMENT_PATH = (
    "tests/fixtures/openspec_gsd_handoff/mapping/hardening-phase-assignments.json"
)
REAL_POLICY_REGISTRY_PATH = "docs/agents/adaptive-change-execution.references.json"
EXPECTED_EVIDENCE_PATH = (
    "tests/fixtures/openspec_gsd_handoff/lifecycle/expected-lifecycle-evidence.json"
)
TRACKED_EVIDENCE_PATH = (
    ".planning/phases/03-lifecycle-drift-gate/03-LIFECYCLE-EVIDENCE.json"
)
SOURCE_COMMIT_PATTERN = re.compile(r"[0-9a-f]{40}\Z")

CANONICAL_CONTENT = {
    PROPOSAL_PATH: "# Proposal\n\nUse one lifecycle gate.\n",
    DESIGN_PATH: "# Design\n\nObserve every admission input.\n",
    TASKS_PATH: "## Tasks\n\n- [x] 1. Build the gate\n",
    SPEC_PATH: (
        "# Lifecycle\n\n"
        "### Requirement: Shared admission\n"
        "Every operation uses one gate.\n\n"
        "#### Scenario: Complete evidence is admitted\n"
        "- **WHEN** every observation is complete\n"
        "- **THEN** the operation is admitted\n"
    ),
}


def _failure(code: str) -> Failure:
    return Failure(
        ClassifiedIssue(
            category=IssueCategory.PREFLIGHT,
            code=code,
            known_state=KnownState.UNKNOWN,
        )
    )


def _capabilities(*, gsd_probe: str = "init-progress-raw") -> ManifestCapabilities:
    return ManifestCapabilities(
        openspec=OpenSpecCapability(
            version="1.3.1",
            probe="instructions-apply-json",
            schema_name="spec-driven",
            input_route="json",
        ),
        gsd=GsdCapability(
            version="1.5.0",
            probe=gsd_probe,
            project_initialized=True,
            entrypoint="gsd-phase",
        ),
        host=HostCapabilityInput(
            inspected=True,
            spawn_agent_schema=HostSpawnSchema.TYPED,
            dispatch=HostDispatch.TYPED,
            agent_role_source=None,
        ),
    )


def _claims() -> tuple[ArtifactClaim, ...]:
    return (
        ArtifactClaim(ArtifactKind.DESIGN, Path(DESIGN_PATH)),
        ArtifactClaim(ArtifactKind.PROPOSAL, Path(PROPOSAL_PATH)),
        ArtifactClaim(ArtifactKind.SPEC, Path(SPEC_PATH)),
        ArtifactClaim(ArtifactKind.TASKS, Path(TASKS_PATH)),
    )


def _empty_source_state() -> SourceIdentityState:
    return SourceIdentityState(
        next_requirement_id=1,
        next_scenario_id=1,
        active=(),
        tombstones=(),
    )


SOURCE_STATE_MALFORMED_CASES = (
    "outer-wrong-type",
    "next-requirement-non-integer",
    "next-scenario-boolean",
    "counter-out-of-range",
    "active-not-tuple",
    "tombstones-not-tuple",
    "active-member-none",
    "active-member-wrong-class",
    "tombstone-member-none",
    "tombstone-member-wrong-class",
    "active-id-invalid",
    "active-category-invalid",
    "active-path-invalid",
    "active-heading-invalid",
    "active-parent-invalid",
    "active-fingerprint-invalid",
    "tombstone-id-invalid",
    "tombstone-category-invalid",
    "tombstone-path-invalid",
    "tombstone-heading-invalid",
    "tombstone-parent-invalid",
    "tombstone-fingerprint-invalid",
    "duplicate-id",
    "duplicate-identity",
    "path-alias",
    "item-count-limit",
    "aggregate-byte-limit",
    "next-requirement-not-above-id",
    "next-scenario-not-above-id",
)


def _source_state_with_tombstone(state: SourceIdentityState) -> SourceIdentityState:
    requirement = state.active[0]
    return replace(
        state,
        next_requirement_id=3,
        tombstones=(
            SourceTombstone(
                id="REQ-000002",
                category=SourceCategory.REQUIREMENT,
                last_source_path=requirement.source_path,
                last_raw_heading="### Requirement: Retired admission",
                last_parent_id=None,
                fingerprint=requirement.fingerprint,
            ),
        ),
    )


def _malformed_source_state(
    state: SourceIdentityState,
    case: str,
) -> object:
    if case == "outer-wrong-type":
        return object()
    state = _source_state_with_tombstone(state)
    requirement, scenario = state.active
    tombstone = state.tombstones[0]
    invalid: Any
    if case == "next-requirement-non-integer":
        invalid = "3"
        return replace(state, next_requirement_id=invalid)
    if case == "next-scenario-boolean":
        invalid = True
        return replace(state, next_scenario_id=invalid)
    if case == "counter-out-of-range":
        return replace(state, next_requirement_id=1_000_001)
    if case == "active-not-tuple":
        invalid = list(state.active)
        return replace(state, active=invalid)
    if case == "tombstones-not-tuple":
        invalid = list(state.tombstones)
        return replace(state, tombstones=invalid)
    if case == "active-member-none":
        invalid = (None, scenario)
        return replace(state, active=invalid)
    if case == "active-member-wrong-class":
        invalid = (tombstone, scenario)
        return replace(state, active=invalid)
    if case == "tombstone-member-none":
        invalid = (None,)
        return replace(state, tombstones=invalid)
    if case == "tombstone-member-wrong-class":
        invalid = (requirement,)
        return replace(state, tombstones=invalid)
    if case.startswith("active-"):
        field, value = {
            "active-id-invalid": ("id", 1),
            "active-category-invalid": ("category", "requirement"),
            "active-path-invalid": ("source_path", None),
            "active-heading-invalid": ("raw_heading", None),
            "active-parent-invalid": ("parent_id", "REQ-999999"),
            "active-fingerprint-invalid": ("fingerprint", None),
        }[case]
        invalid = value
        active_item = scenario if field == "parent_id" else requirement
        replacement = replace(active_item, **{field: invalid})
        other = requirement if active_item is scenario else scenario
        active = (
            (other, replacement) if active_item is scenario else (replacement, other)
        )
        return replace(state, active=active)
    if case.startswith("tombstone-"):
        field, value = {
            "tombstone-id-invalid": ("id", 2),
            "tombstone-category-invalid": ("category", "requirement"),
            "tombstone-path-invalid": ("last_source_path", None),
            "tombstone-heading-invalid": ("last_raw_heading", None),
            "tombstone-parent-invalid": ("last_parent_id", "REQ-000001"),
            "tombstone-fingerprint-invalid": ("fingerprint", None),
        }[case]
        invalid = value
        return replace(
            state,
            tombstones=(replace(tombstone, **{field: invalid}),),
        )
    if case == "duplicate-id":
        return replace(
            state,
            tombstones=(replace(tombstone, id=requirement.id),),
        )
    if case == "duplicate-identity":
        duplicate = replace(requirement, id="REQ-000003")
        return replace(
            state,
            next_requirement_id=4,
            active=(*state.active, duplicate),
        )
    if case == "path-alias":
        source_path_parts = requirement.source_path.split("/")
        source_path_parts[-2] = source_path_parts[-2].upper()
        aliased = replace(
            requirement,
            id="REQ-000003",
            source_path="/".join(source_path_parts),
            raw_heading="### Requirement: Aliased admission",
        )
        return replace(
            state,
            next_requirement_id=4,
            active=(*state.active, aliased),
        )
    if case == "item-count-limit":
        invalid = state.active * 2049
        return replace(state, active=invalid)
    if case == "aggregate-byte-limit":
        oversized = replace(
            requirement,
            raw_heading="### Requirement: " + "x" * 8_388_609,
        )
        return replace(state, active=(oversized, scenario))
    if case == "next-requirement-not-above-id":
        return replace(state, next_requirement_id=1)
    if case == "next-scenario-not-above-id":
        return replace(
            state,
            next_scenario_id=int(scenario.id.removeprefix("SCN-")),
        )
    raise AssertionError(case)


def _write_canonical_source(repository: Path) -> None:
    for relative_path, content in CANONICAL_CONTENT.items():
        path = repository / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")


def _stable_source_observation(repository: Path) -> CanonicalSourceObservation:
    allocated = observe_canonical_source(
        repository,
        CHANGE_ID,
        _claims(),
        expected_source_items=_empty_source_state(),
    )
    assert isinstance(allocated, Success)
    requirement = next(
        item
        for item in allocated.value.source_items.active
        if item.category is SourceCategory.REQUIREMENT
    )
    scenario = next(
        item
        for item in allocated.value.source_items.active
        if item.category is SourceCategory.SCENARIO
    )
    stable_state = SourceIdentityState(
        next_requirement_id=2,
        next_scenario_id=5,
        active=(
            requirement,
            replace(scenario, id="SCN-000004", parent_id=requirement.id),
        ),
        tombstones=(),
    )
    stable = observe_canonical_source(
        repository,
        CHANGE_ID,
        _claims(),
        expected_source_items=stable_state,
    )
    assert isinstance(stable, Success)
    assert stable.value.changed_source_item_ids == ()
    return stable.value


def _inventory() -> PlanningInventory:
    phases = tuple(
        PhaseDeclaration(
            change_id=CHANGE_ID,
            phase_id=phase_id,
            phase_path=(
                ".planning/phases/03-lifecycle-drift-gate"
                if phase_id == "03"
                else f".planning/phases/{phase_id}-lifecycle-{phase_id}"
            ),
        )
        for phase_id in ("03", "04", "05", "06")
    )
    assignments = (
        PhaseAssignment(CHANGE_ID, "REQ-000001", "03", ()),
        PhaseAssignment(CHANGE_ID, "SCN-000004", "03", ()),
    )
    plans = tuple(
        PlanDeclaration(
            CHANGE_ID,
            phase.phase_id,
            f"{phase.phase_path}/{phase.phase_id}-01-PLAN.md",
        )
        for phase in phases
    )
    evidence = tuple(
        EvidenceDeclaration(
            CHANGE_ID,
            assignment.phase_id,
            f".planning/evidence/{assignment.source_id}.json",
            source_id=assignment.source_id,
        )
        for assignment in assignments
    ) + tuple(
        EvidenceDeclaration(
            CHANGE_ID,
            plan.phase_id,
            f".planning/evidence/plan-{plan.phase_id}.json",
            plan_path=plan.path,
        )
        for plan in plans
    )
    return PlanningInventory(
        version="openspec-gsd-planning-inventory-v1",
        change_id=CHANGE_ID,
        phases=phases,
        assignments=assignments,
        plans=plans,
        evidence=evidence,
    )


def _mappings(inventory: PlanningInventory) -> tuple[ManifestMapping, ...]:
    phase = next(item for item in inventory.phases if item.phase_id == "03")
    phase_plan = next((item for item in inventory.plans if item.phase_id == "03"), None)
    plan_evidence = (
        next(item for item in inventory.evidence if item.plan_path == phase_plan.path)
        if phase_plan is not None
        else None
    )
    return tuple(
        ManifestMapping(
            source_id=assignment.source_id,
            phase_id="03",
            phase_path=phase.phase_path,
            plan_paths=((phase_plan.path,) if phase_plan is not None else ()),
            evidence_paths=(
                tuple(
                    sorted(
                        (
                            next(
                                item.path
                                for item in inventory.evidence
                                if item.source_id == assignment.source_id
                            ),
                            plan_evidence.path,
                        ),
                        key=str.encode,
                    )
                )
                if plan_evidence is not None
                else ()
            ),
            policy_references=(),
        )
        for assignment in inventory.assignments
    )


def _write_mapping_paths(repository: Path, inventory: PlanningInventory) -> None:
    for phase in inventory.phases:
        (repository / phase.phase_path).mkdir(parents=True, exist_ok=True)
    for declaration in (*inventory.plans, *inventory.evidence):
        path = repository / declaration.path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("complete\n", encoding="utf-8")


def _phase_nodes() -> tuple[PhaseNodeObservation, ...]:
    return (
        PhaseNodeObservation("03", ".planning/phases/03-lifecycle-drift-gate", ()),
        PhaseNodeObservation("04", ".planning/phases/04-lifecycle-04", ("03",)),
        PhaseNodeObservation("05", ".planning/phases/05-lifecycle-05", ("04",)),
        PhaseNodeObservation("06", ".planning/phases/06-lifecycle-06", ("05",)),
    )


def _inventory_for_phase_nodes(
    inventory: PlanningInventory,
    nodes: tuple[PhaseNodeObservation, ...],
) -> PlanningInventory:
    phase_ids = {node.phase_id for node in nodes}
    phase_paths = {node.phase_id: node.phase_path for node in nodes}
    original_phase_paths = {
        phase.phase_id: phase.phase_path for phase in inventory.phases
    }
    phases = tuple(
        PhaseDeclaration(CHANGE_ID, node.phase_id, node.phase_path) for node in nodes
    )
    assignments = tuple(
        item for item in inventory.assignments if item.phase_id in phase_ids
    )
    plans = tuple(
        plan
        for plan in inventory.plans
        if plan.phase_id in phase_ids
        and phase_paths[plan.phase_id] == original_phase_paths.get(plan.phase_id)
    )
    plan_paths = {plan.path for plan in plans}
    source_ids = {item.source_id for item in assignments}
    evidence = tuple(
        item
        for item in inventory.evidence
        if item.phase_id in phase_ids
        and (item.source_id is None or item.source_id in source_ids)
        and (item.plan_path is None or item.plan_path in plan_paths)
    )
    return replace(
        inventory,
        phases=phases,
        assignments=assignments,
        plans=plans,
        evidence=evidence,
    )


def _malformed_phase_nodes(case: str) -> object:
    nodes = list(_phase_nodes())
    if case == "non-tuple-container":
        return nodes
    if case == "invalid-node":
        nodes[0] = cast(Any, None)
    elif case == "invalid-phase-id":
        nodes[0] = replace(nodes[0], phase_id=cast(Any, 3))
    elif case == "invalid-phase-path":
        nodes[0] = replace(nodes[0], phase_path=cast(Any, b"phase"))
    elif case == "non-tuple-dependencies":
        nodes[1] = replace(nodes[1], depends_on=cast(Any, ["03"]))
    elif case == "invalid-dependency":
        nodes[1] = replace(nodes[1], depends_on=("03", cast(Any, 3)))
    elif case == "duplicate-node-id":
        nodes[1] = replace(nodes[1], phase_id="03")
    else:  # pragma: no cover - table is exhaustive
        raise AssertionError(case)
    return tuple(nodes)


def _cyclic_phase_nodes(case: str) -> tuple[PhaseNodeObservation, ...]:
    nodes = list(_phase_nodes())
    if case == "two-node":
        nodes[0] = replace(nodes[0], depends_on=("04",))
    elif case == "longer":
        nodes[0] = replace(nodes[0], depends_on=("05",))
    else:  # pragma: no cover - table is exhaustive
        raise AssertionError(case)
    return tuple(nodes)


class FakeBoundary(LifecycleObservationBoundary):
    def __init__(
        self,
        *,
        repository: Path,
        canonical_source: CanonicalSourceObservation,
        inventory: PlanningInventory,
        expected_nodes: tuple[PhaseNodeObservation, ...] | None = None,
        observed_nodes: tuple[PhaseNodeObservation, ...] | None = None,
        capabilities: ManifestCapabilities | None = None,
        source_result: Any = None,
        phase_result: Any = None,
        capability_result: Any = None,
        mutate_before_second_current_read: bool = False,
    ) -> None:
        self.repository = repository
        self.canonical_source = canonical_source
        self.inventory = inventory
        self.expected_nodes = expected_nodes or _phase_nodes()
        self.observed_nodes = observed_nodes or self.expected_nodes
        self.capabilities = capabilities or _capabilities()
        self.source_result = source_result
        self.phase_result = phase_result
        self.capability_result = capability_result
        self.mutate_before_second_current_read = mutate_before_second_current_read
        self.source_calls = 0
        self.phase_calls = 0
        self.capability_calls = 0

    def observe_source_commit(
        self,
        repository_root: Path,
        change_id: str,
        source_commit: str,
        claims: tuple[ArtifactClaim, ...],
        *,
        limits: LifecycleGateLimits,
    ):
        del claims, limits
        self.source_calls += 1
        if self.mutate_before_second_current_read and self.source_calls == 2:
            path = repository_root / SPEC_PATH
            path.write_text(
                CANONICAL_CONTENT[SPEC_PATH].replace(
                    "the operation is admitted", "the operation is stopped"
                ),
                encoding="utf-8",
            )
        if self.source_result is not None:
            return self.source_result
        return Success(
            SourceCommitObservation(
                repository_root=str(repository_root.resolve()),
                change_id=change_id,
                source_commit=source_commit,
                canonical_source=self.canonical_source,
            )
        )

    def observe_phase_graph(
        self,
        repository_root: Path,
        change_id: str,
        source_commit: str,
        *,
        limits: LifecycleGateLimits,
    ):
        del repository_root, limits
        self.phase_calls += 1
        if self.phase_result is not None:
            return self.phase_result
        return Success(
            PhaseGraphObservation(
                change_id=change_id,
                source_commit=source_commit,
                expected_nodes=self.expected_nodes,
                observed_nodes=self.observed_nodes,
                planning_inventory=self.inventory,
            )
        )

    def observe_capabilities(
        self,
        repository_root: Path,
        change_id: str,
        source_commit: str,
        *,
        limits: LifecycleGateLimits,
    ):
        del repository_root, limits
        self.capability_calls += 1
        if self.capability_result is not None:
            return self.capability_result
        return Success(
            CapabilityObservation(
                change_id=change_id,
                source_commit=source_commit,
                capabilities=self.capabilities,
            )
        )


def _fixture(tmp_path: Path) -> tuple[Path, FakeBoundary]:
    repository = tmp_path / "repository"
    repository.mkdir()
    _write_canonical_source(repository)
    canonical_source = _stable_source_observation(repository)
    inventory = _inventory()
    _write_mapping_paths(repository, inventory)
    manifest = HandoffManifestV2(
        schema_version=2,
        change_id=CHANGE_ID,
        handoff_state=HandoffState.STARTED,
        artifacts=tuple(
            ManifestArtifact(
                kind=artifact.kind.value,
                path=artifact.path,
                sha256=artifact.raw_sha256,
            )
            for artifact in canonical_source.artifacts
        ),
        source_commit=SOURCE_COMMIT,
        progress=canonical_source.progress,
        capabilities=_capabilities(),
        source_items=canonical_source.source_items,
        mappings=_mappings(inventory),
        ownership=ManifestOwnership(owned=(), referenced=()),
        lifecycle=ManifestLifecycle(checkpoints=(), receipts=(), archives=()),
    )
    serialized = serialize_manifest_v2(manifest)
    assert isinstance(serialized, Success)
    manifest_path = repository / MANIFEST_PATH
    manifest_path.parent.mkdir(parents=True)
    manifest_path.write_bytes(serialized.value)
    return repository, FakeBoundary(
        repository=repository,
        canonical_source=canonical_source,
        inventory=inventory,
    )


def _unsafe_replace(value: Any, /, **changes: object) -> Any:
    copy = replace(value)
    for field, item in changes.items():
        object.__setattr__(copy, field, item)
    return copy


def _inventory_with_policy_observation(
    inventory: PlanningInventory,
) -> PlanningInventory:
    body = "policy body\n"
    return replace(
        inventory,
        policy_observations=(
            PolicySectionObservation(
                reference_id="ACE-R1",
                raw_source_path="docs/agents/workflow.md",
                source_path="docs/agents/workflow.md",
                raw_heading="### Runtime validation",
                normalized_heading="Runtime validation",
                normalized_body=body,
                body_length=len(body.encode()),
                sha256="a" * 64,
            ),
        ),
    )


def _replace_inventory_member(
    inventory: PlanningInventory,
    collection: str,
    member: object,
) -> PlanningInventory:
    values = cast(tuple[object, ...], getattr(inventory, collection))
    return _unsafe_replace(inventory, **{collection: (member, *values[1:])})


def _malformed_boundary_inventory_cases(
    inventory: PlanningInventory,
) -> tuple[tuple[str, object], ...]:
    phase = inventory.phases[0]
    assignment = inventory.assignments[0]
    plan = inventory.plans[0]
    evidence = inventory.evidence[0]
    observation = inventory.policy_observations[0]
    cases: list[tuple[str, object]] = [
        ("outer", object()),
        ("version", _unsafe_replace(inventory, version=1)),
        ("change-id", _unsafe_replace(inventory, change_id=1)),
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
                ),
                (
                    f"{collection}-limit",
                    _unsafe_replace(
                        inventory,
                        **{collection: (values[0],) * 4097},
                    ),
                ),
                (
                    f"{collection}-member",
                    _replace_inventory_member(inventory, collection, None),
                ),
            )
        )
    member_fields = (
        ("phase-change-id", "phases", phase, "change_id"),
        ("phase-id", "phases", phase, "phase_id"),
        ("phase-path", "phases", phase, "phase_path"),
        ("assignment-change-id", "assignments", assignment, "change_id"),
        ("assignment-source-id", "assignments", assignment, "source_id"),
        ("assignment-phase-id", "assignments", assignment, "phase_id"),
        ("plan-change-id", "plans", plan, "change_id"),
        ("plan-phase-id", "plans", plan, "phase_id"),
        ("plan-path", "plans", plan, "path"),
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
        ("policy-source-path", "policy_observations", observation, "source_path"),
        ("policy-raw-heading", "policy_observations", observation, "raw_heading"),
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
            ),
            (
                "assignment-policy-member",
                _replace_inventory_member(
                    inventory,
                    "assignments",
                    _unsafe_replace(assignment, policy_references=(1,)),
                ),
            ),
            (
                "policy-body-length-mismatch",
                _replace_inventory_member(
                    inventory,
                    "policy_observations",
                    replace(observation, body_length=observation.body_length + 1),
                ),
            ),
        )
    )
    return tuple(cases)


def _assert_wholly_unknown(
    decision: LifecycleGateDecision,
    code: str,
) -> None:
    assert decision.issue_codes == (code,)
    assert decision.state is LifecycleGateState.UNKNOWN
    assert not decision.admitted
    assert decision.drifted_artifact_paths == ()
    assert decision.changed_source_item_ids == ()
    assert decision.progress_update_candidate is None
    assert decision.revalidation_targets == ()
    assert decision.replanning_targets == ()
    assert decision.next_action_codes == ()
    assert decision.decision_identity is None


def test_source_pinned_reconciliation_changes_are_wholly_unknown(
    tmp_path: Path,
) -> None:
    repository, boundary = _fixture(tmp_path)
    boundary.source_result = Success(
        SourceCommitObservation(
            repository_root=str(repository.resolve()),
            change_id=CHANGE_ID,
            source_commit=SOURCE_COMMIT,
            canonical_source=replace(
                boundary.canonical_source,
                changed_source_item_ids=("REQ-000001",),
            ),
        )
    )

    decision = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.EXECUTE,
        "03",
        boundary=boundary,
    )

    _assert_wholly_unknown(decision, "source-reconciliation-incomplete")


@pytest.mark.parametrize("dimension", ["source", "capability"])
def test_malformed_boundary_commit_is_dimension_unknown(
    tmp_path: Path,
    dimension: str,
) -> None:
    repository, boundary = _fixture(tmp_path)
    if dimension == "source":
        boundary.source_result = Success(
            SourceCommitObservation(
                repository_root=str(repository.resolve()),
                change_id=CHANGE_ID,
                source_commit=cast(Any, 1),
                canonical_source=boundary.canonical_source,
            )
        )
        expected_code = "lifecycle-source-commit-observation-incomplete"
    else:
        boundary.capability_result = Success(
            CapabilityObservation(
                change_id=CHANGE_ID,
                source_commit=cast(Any, 1),
                capabilities=boundary.capabilities,
            )
        )
        expected_code = "lifecycle-capability-observation-incomplete"

    decision = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.EXECUTE,
        "03",
        boundary=boundary,
    )

    _assert_wholly_unknown(decision, expected_code)


def test_malformed_boundary_inventory_is_phase_unknown(
    tmp_path: Path,
) -> None:
    repository, boundary = _fixture(tmp_path)
    inventory = _inventory_with_policy_observation(boundary.inventory)

    for _case, malformed in _malformed_boundary_inventory_cases(inventory):
        boundary.phase_result = Success(
            PhaseGraphObservation(
                change_id=CHANGE_ID,
                source_commit=SOURCE_COMMIT,
                expected_nodes=boundary.expected_nodes,
                observed_nodes=boundary.observed_nodes,
                planning_inventory=cast(PlanningInventory, malformed),
            )
        )
        decision = gate_lifecycle_operation(
            repository,
            CHANGE_ID,
            LifecycleOperation.EXECUTE,
            "03",
            boundary=boundary,
        )

        _assert_wholly_unknown(
            decision,
            "lifecycle-phase-observation-incomplete",
        )


MALFORMED_CANONICAL_NESTED_CASES = (
    "progress-total",
    "progress-complete",
    "progress-remaining",
    "progress-count-invariant",
    "progress-tasks-container",
    "progress-task-member",
    "progress-task-id",
    "progress-task-description",
    "progress-task-done",
    "changed-ids-container",
    "changed-id-member",
    *(f"source-state:{case}" for case in SOURCE_STATE_MALFORMED_CASES),
)


def _malformed_canonical_observation(
    observation: CanonicalSourceObservation,
    case: str,
) -> CanonicalSourceObservation:
    progress = observation.progress
    task = progress.tasks[0]
    invalid: Any
    if case == "progress-total":
        invalid = True
        return replace(observation, progress=replace(progress, total=invalid))
    if case == "progress-complete":
        invalid = "1"
        return replace(observation, progress=replace(progress, complete=invalid))
    if case == "progress-remaining":
        invalid = -1
        return replace(observation, progress=replace(progress, remaining=invalid))
    if case == "progress-count-invariant":
        return replace(
            observation,
            progress=replace(progress, total=progress.total + 1),
        )
    if case == "progress-tasks-container":
        invalid = list(progress.tasks)
        return replace(observation, progress=replace(progress, tasks=invalid))
    if case == "progress-task-member":
        invalid = (None,)
        return replace(observation, progress=replace(progress, tasks=invalid))
    if case == "progress-task-id":
        invalid = replace(task, id=1)
        return replace(observation, progress=replace(progress, tasks=(invalid,)))
    if case == "progress-task-description":
        invalid = replace(task, description=None)
        return replace(observation, progress=replace(progress, tasks=(invalid,)))
    if case == "progress-task-done":
        invalid = replace(task, done=1)
        return replace(observation, progress=replace(progress, tasks=(invalid,)))
    if case == "changed-ids-container":
        invalid = list(observation.changed_source_item_ids)
        return replace(observation, changed_source_item_ids=invalid)
    if case == "changed-id-member":
        invalid = ("REQ-000001", 1)
        return replace(observation, changed_source_item_ids=invalid)
    if case.startswith("source-state:"):
        invalid = _malformed_source_state(
            observation.source_items,
            case.removeprefix("source-state:"),
        )
        return replace(observation, source_items=invalid)
    raise AssertionError(case)


@pytest.mark.parametrize("case", MALFORMED_CANONICAL_NESTED_CASES)
def test_malformed_canonical_nested_state_public_gate_is_wholly_unknown(
    tmp_path: Path,
    case: str,
) -> None:
    repository, boundary = _fixture(tmp_path)
    malformed = _malformed_canonical_observation(
        boundary.canonical_source,
        case,
    )
    boundary.source_result = Success(
        SourceCommitObservation(
            repository_root=str(repository.resolve()),
            change_id=CHANGE_ID,
            source_commit=SOURCE_COMMIT,
            canonical_source=malformed,
        )
    )

    decision = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.EXECUTE,
        "03",
        boundary=boundary,
    )

    assert decision.issue_codes == ("canonical-observation-incomplete",)
    assert decision.state is LifecycleGateState.UNKNOWN
    assert not decision.admitted
    assert decision.drifted_artifact_paths == ()
    assert decision.changed_source_item_ids == ()
    assert decision.progress_update_candidate is None
    assert decision.revalidation_targets == ()
    assert decision.replanning_targets == ()
    assert decision.next_action_codes == ()
    assert decision.decision_identity is None


def _with_malformed_canonical_string(
    observation: CanonicalSourceObservation,
    field: str,
) -> CanonicalSourceObservation:
    if field == "artifact-path":
        artifact = observation.artifacts[0]
        return replace(
            observation,
            artifacts=(
                replace(artifact, path=artifact.path + "\ud800"),
                *observation.artifacts[1:],
            ),
        )
    if field in {"task-id", "task-description"}:
        task = observation.progress.tasks[0]
        attribute = field.removeprefix("task-")
        malformed_task = replace(
            task,
            **{attribute: getattr(task, attribute) + "\ud800"},
        )
        return replace(
            observation,
            progress=replace(
                observation.progress,
                tasks=(malformed_task, *observation.progress.tasks[1:]),
            ),
        )
    if field == "changed-source-id":
        return replace(
            observation,
            changed_source_item_ids=("REQ-000001\ud800",),
        )
    raise AssertionError(field)


def _with_task_count(
    observation: CanonicalSourceObservation,
    count: int,
) -> CanonicalSourceObservation:
    task = observation.progress.tasks[0]
    tasks = tuple(
        replace(task, id=f"{index:06d}", description=f"task-{index}", done=False)
        for index in range(1, count + 1)
    )
    return replace(
        observation,
        progress=replace(
            observation.progress,
            total=count,
            complete=0,
            remaining=count,
            tasks=tasks,
        ),
    )


def _canonical_aggregate_bytes(observation: CanonicalSourceObservation) -> int:
    values = [
        value
        for artifact in observation.artifacts
        for value in (
            artifact.path,
            artifact.raw_sha256,
            artifact.specification_sha256,
        )
    ]
    values.extend(
        value
        for task in observation.progress.tasks
        for value in (task.id, task.description)
    )
    values.extend(observation.changed_source_item_ids)
    return sum(len(value.encode("utf-8")) for value in values)


def _with_aggregate_bytes(
    observation: CanonicalSourceObservation,
    target: int,
) -> CanonicalSourceObservation:
    current = _canonical_aggregate_bytes(observation)
    assert current <= target
    task = observation.progress.tasks[0]
    malformed_task = replace(
        task, description=task.description + "x" * (target - current)
    )
    return replace(
        observation,
        progress=replace(
            observation.progress,
            tasks=(malformed_task, *observation.progress.tasks[1:]),
        ),
    )


def _canonical_gate_mutation(
    observation: CanonicalSourceObservation,
    mutation: str,
) -> CanonicalSourceObservation:
    if mutation in {
        "artifact-path",
        "task-id",
        "task-description",
        "changed-source-id",
    }:
        return _with_malformed_canonical_string(observation, mutation)
    if mutation == "tasks-4097":
        return _with_task_count(observation, MAX_TASKS + 1)
    if mutation == "aggregate-limit-plus-one":
        return _with_aggregate_bytes(
            observation,
            DEFAULT_ARTIFACT_LIMITS.bytes_total + 1,
        )
    if mutation == "changed-source-ids-4097":
        return replace(
            observation,
            changed_source_item_ids=tuple(
                f"REQ-{index:06d}"
                for index in range(1, SourceIdentityLimits().max_items + 2)
            ),
        )
    raise AssertionError(mutation)


@pytest.mark.parametrize("canonical_side", ["expected", "observed"])
@pytest.mark.parametrize(
    "mutation",
    [
        "artifact-path",
        "task-id",
        "task-description",
        "changed-source-id",
        "tasks-4097",
        "aggregate-limit-plus-one",
        "changed-source-ids-4097",
    ],
)
def test_malformed_unicode_and_over_limit_canonical_observation_is_wholly_unknown(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    canonical_side: str,
    mutation: str,
) -> None:
    repository, boundary = _fixture(tmp_path)
    malformed = _canonical_gate_mutation(boundary.canonical_source, mutation)
    if canonical_side == "expected":
        boundary.source_result = Success(
            SourceCommitObservation(
                repository_root=str(repository.resolve()),
                change_id=CHANGE_ID,
                source_commit=SOURCE_COMMIT,
                canonical_source=malformed,
            )
        )
    else:
        monkeypatch.setattr(
            lifecycle_gate,
            "observe_canonical_source",
            lambda *args, **kwargs: Success(malformed),
        )

    decision = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.EXECUTE,
        "03",
        boundary=boundary,
    )

    _assert_wholly_unknown(decision, "canonical-observation-incomplete")


def _rewrite_manifest(
    repository: Path,
    transform,
) -> HandoffManifestV2:
    path = repository / MANIFEST_PATH
    parsed = parse_manifest_v2_bytes(path.read_bytes())
    assert isinstance(parsed, Success)
    manifest = transform(parsed.value)
    serialized = serialize_manifest_v2(manifest)
    assert isinstance(serialized, Success)
    path.write_bytes(serialized.value)
    return manifest


def _pin_fixed_scenario_drift(
    repository: Path,
    boundary: FakeBoundary,
) -> None:
    observed = observe_canonical_source(
        repository,
        CHANGE_ID,
        _claims(),
        expected_source_items=boundary.canonical_source.source_items,
    )
    assert isinstance(observed, Success)
    current_requirement = next(
        item for item in observed.value.source_items.active if item.id == "REQ-000001"
    )
    pinned_items = tuple(
        replace(item, fingerprint=current_requirement.fingerprint)
        if item.id == "REQ-000001"
        else item
        for item in boundary.canonical_source.source_items.active
    )
    pinned_state = replace(
        boundary.canonical_source.source_items,
        active=pinned_items,
    )
    boundary.canonical_source = replace(
        boundary.canonical_source,
        source_items=pinned_state,
    )
    plan_only_inventory = replace(boundary.inventory, plans=(), evidence=())
    boundary.inventory = plan_only_inventory

    def transform(manifest: HandoffManifestV2) -> HandoffManifestV2:
        return replace(
            manifest,
            source_items=pinned_state,
            mappings=_mappings(plan_only_inventory),
        )

    _rewrite_manifest(repository, transform)


OPERATION_CASES = (
    (LifecycleOperation.PLAN, "03", MappingOperation.PLAN),
    (LifecycleOperation.EXECUTE, "03", MappingOperation.EXECUTE),
    (LifecycleOperation.RESUME, "03", MappingOperation.EXECUTE),
    (LifecycleOperation.VERIFY, "03", MappingOperation.VERIFY),
    (LifecycleOperation.FINALIZE, None, MappingOperation.FINALIZE),
)


@pytest.mark.parametrize(
    ("operation", "target_phase", "mapping_operation"),
    OPERATION_CASES,
)
def test_operation_matrix_uses_one_complete_gate(
    tmp_path: Path,
    operation: LifecycleOperation,
    target_phase: str | None,
    mapping_operation: MappingOperation,
) -> None:
    repository, boundary = _fixture(tmp_path)

    decision = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        operation,
        target_phase,
        boundary=boundary,
    )

    assert decision.state is LifecycleGateState.CLEAN
    assert decision.admitted
    assert decision.mapping_operation is mapping_operation
    assert decision.issue_codes == ()
    assert boundary.source_calls == 1
    assert boundary.phase_calls == 1
    assert boundary.capability_calls == 1


def _decision_view(decision: LifecycleGateDecision) -> dict[str, object]:
    return {
        "operation": decision.operation.value
        if decision.operation is not None
        else None,
        "target_phase": decision.target_phase,
        "mapping_operation": (
            decision.mapping_operation.value
            if decision.mapping_operation is not None
            else None
        ),
        "state": decision.state.value,
        "admitted": decision.admitted,
        "issue_codes": list(decision.issue_codes),
        "drifted_artifact_paths": list(decision.drifted_artifact_paths),
        "changed_source_item_ids": list(decision.changed_source_item_ids),
        "progress_update_candidate": (
            _progress_view(decision.progress_update_candidate)
            if decision.progress_update_candidate is not None
            else None
        ),
        "revalidation_targets": list(decision.revalidation_targets),
        "replanning_targets": list(decision.replanning_targets),
        "next_action_codes": list(decision.next_action_codes),
        "decision_identity_present": decision.decision_identity is not None,
        "manifest_sha256": decision.manifest_sha256,
    }


def _progress_view(progress: Progress) -> dict[str, object]:
    return {
        "total": progress.total,
        "complete": progress.complete,
        "remaining": progress.remaining,
        "tasks": [
            {
                "id": task.id,
                "done": task.done,
            }
            for task in progress.tasks
        ],
    }


def _compact_json(value: object) -> bytes:
    return (
        json.dumps(
            value,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
        + b"\n"
    )


def _read_bounded_bytes(path: Path, limit: int) -> bytes:
    with path.open("rb") as stream:
        content = stream.read(limit + 1)
    assert len(content) <= limit
    return content


def _assert_canonical_manifest_path(path: str, change_id: str) -> PurePosixPath:
    pure = PurePosixPath(path)
    assert path == pure.as_posix()
    assert not pure.is_absolute()
    assert "." not in pure.parts and ".." not in pure.parts
    assert pure.parts[:3] == ("openspec", "changes", change_id)
    return pure


def _read_source_commit_blobs(
    repository_root: Path,
    manifest: HandoffManifestV2,
) -> tuple[tuple[ArtifactClaim, ...], dict[str, bytes]]:
    source_commit = manifest.source_commit
    assert SOURCE_COMMIT_PATTERN.fullmatch(source_commit) is not None

    def git(*arguments: str, output_limit: int) -> bytes:
        result = subprocess_runner(
            ("git", *arguments),
            cwd=repository_root,
            timeout=COMMAND_TIMEOUT_SECONDS,
            output_limit=output_limit,
        )
        assert result.return_code == 0, (result.argv, result.stderr)
        return result.stdout

    git("cat-file", "-e", f"{source_commit}^{{commit}}", output_limit=4096)
    root_bytes = git("rev-parse", "--show-toplevel", output_limit=4096)
    observed_root = Path(root_bytes.decode("utf-8").strip()).resolve(strict=True)
    assert observed_root == repository_root.resolve(strict=True)

    claims: list[ArtifactClaim] = []
    blobs: dict[str, bytes] = {}
    for artifact in manifest.artifacts:
        relative_path = _assert_canonical_manifest_path(
            artifact.path,
            manifest.change_id,
        )
        blob = git(
            "cat-file",
            "-p",
            f"{source_commit}:{artifact.path}",
            output_limit=DEFAULT_ARTIFACT_LIMITS.bytes_per_file,
        )
        blob.decode("utf-8")
        assert hashlib.sha256(blob).hexdigest() == artifact.sha256
        claims.append(ArtifactClaim(ArtifactKind(artifact.kind), Path(relative_path)))
        blobs[artifact.path] = blob
    return (
        tuple(sorted(claims, key=lambda item: (item.kind.value, item.path.as_posix()))),
        blobs,
    )


def _real_planning_inventory(repository_root: Path) -> PlanningInventory:
    registry = read_policy_reference_registry(
        repository_root,
        REAL_POLICY_REGISTRY_PATH,
    )
    assert isinstance(registry, Success)
    observations = observe_policy_sections(repository_root, registry.value)
    assert isinstance(observations, Success)
    inventory = read_planning_inventory(
        repository_root,
        REAL_ASSIGNMENT_PATH,
        policy_observations=observations.value,
    )
    assert isinstance(inventory, Success)
    return inventory.value


def _real_phase_nodes(
    inventory: PlanningInventory,
) -> tuple[PhaseNodeObservation, ...]:
    ordered = sorted(inventory.phases, key=lambda item: item.phase_id.encode())
    return tuple(
        PhaseNodeObservation(
            phase.phase_id,
            phase.phase_path,
            (() if index == 0 else (ordered[index - 1].phase_id,)),
        )
        for index, phase in enumerate(ordered)
    )


def _checkbox_only_progress_evidence(
    repository_root: Path,
    tmp_path: Path,
) -> dict[str, object]:
    tmp_path.mkdir(parents=True, exist_ok=True)
    handoff_bytes = _read_bounded_bytes(
        repository_root / REAL_HANDOFF_PATH,
        MAX_MANIFEST_BYTES,
    )
    parsed = parse_manifest_v2_bytes(handoff_bytes)
    assert isinstance(parsed, Success)
    manifest = parsed.value
    assert manifest.schema_version == 2
    assert manifest.change_id == REAL_CHANGE_ID

    claims, pinned_blobs = _read_source_commit_blobs(repository_root, manifest)
    pinned_root = tmp_path / "source-pinned"
    pinned_root.mkdir()
    for relative_path, blob in pinned_blobs.items():
        target = pinned_root.joinpath(
            *_assert_canonical_manifest_path(relative_path, REAL_CHANGE_ID).parts
        )
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(blob)

    working_root = tmp_path / "checkbox-only-working-tree"
    working_root.mkdir()
    for relative_path, blob in pinned_blobs.items():
        working_blob = blob
        if relative_path.endswith("/tasks.md"):
            marker = b"- [ ] 3.1 "
            assert working_blob.count(marker) == 1
            working_blob = working_blob.replace(marker, b"- [x] 3.1 ", 1)
        target = working_root.joinpath(
            *_assert_canonical_manifest_path(relative_path, REAL_CHANGE_ID).parts
        )
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(working_blob)
    working_manifest = working_root / REAL_HANDOFF_PATH
    working_manifest.parent.mkdir(parents=True, exist_ok=True)
    working_manifest.write_bytes(handoff_bytes)

    source_pinned = observe_canonical_source(
        pinned_root,
        REAL_CHANGE_ID,
        claims,
        expected_source_items=manifest.source_items,
        limits=DEFAULT_ARTIFACT_LIMITS,
    )
    working_tree = observe_canonical_source(
        working_root,
        REAL_CHANGE_ID,
        claims,
        expected_source_items=manifest.source_items,
        limits=DEFAULT_ARTIFACT_LIMITS,
    )
    assert isinstance(source_pinned, Success)
    assert isinstance(working_tree, Success)
    classification = classify_canonical_source_drift(source_pinned, working_tree)

    tasks_artifact = next(
        artifact
        for artifact in manifest.artifacts
        if artifact.kind == ArtifactKind.TASKS.value
    )
    pinned_tasks = pinned_blobs[tasks_artifact.path]
    current_tasks = _read_bounded_bytes(
        working_root / tasks_artifact.path,
        DEFAULT_ARTIFACT_LIMITS.bytes_per_file,
    )
    pinned_text = pinned_tasks.decode("utf-8")
    current_text = current_tasks.decode("utf-8")
    pinned_normalized = normalize_tasks_specification(pinned_text)
    current_normalized = normalize_tasks_specification(current_text)
    pinned_progress = parse_task_progress(pinned_text)
    current_progress = parse_task_progress(current_text)
    assert isinstance(pinned_normalized, Success)
    assert isinstance(current_normalized, Success)
    assert isinstance(pinned_progress, Success)
    assert isinstance(current_progress, Success)

    pinned_raw_sha256 = hashlib.sha256(pinned_tasks).hexdigest()
    current_raw_sha256 = hashlib.sha256(current_tasks).hexdigest()
    pinned_specification_sha256 = hashlib.sha256(pinned_normalized.value).hexdigest()
    current_specification_sha256 = hashlib.sha256(current_normalized.value).hexdigest()
    assert tasks_artifact.sha256 == pinned_raw_sha256
    assert pinned_raw_sha256 != current_raw_sha256
    assert pinned_normalized.value == current_normalized.value
    assert pinned_specification_sha256 == current_specification_sha256
    assert pinned_progress.value != current_progress.value
    assert classification.state is DriftState.CLEAN
    assert classification.drifted_artifact_paths == ()
    assert classification.changed_source_item_ids == ()
    assert classification.progress_update_candidate == current_progress.value

    inventory = _real_planning_inventory(repository_root)
    for phase in inventory.phases:
        (working_root / phase.phase_path).mkdir(parents=True, exist_ok=True)
    phase_nodes = _real_phase_nodes(inventory)
    boundary = FakeBoundary(
        repository=working_root,
        canonical_source=source_pinned.value,
        inventory=inventory,
        expected_nodes=phase_nodes,
        observed_nodes=phase_nodes,
        capabilities=manifest.capabilities,
    )
    decision = gate_lifecycle_operation(
        working_root,
        REAL_CHANGE_ID,
        LifecycleOperation.PLAN,
        "03",
        boundary=boundary,
    )
    assert decision.state is LifecycleGateState.CLEAN
    assert decision.admitted

    return {
        **_decision_view(decision),
        "source_commit": manifest.source_commit,
        "canonical_tasks_path": tasks_artifact.path,
        "handoff_claimed_raw_sha256": tasks_artifact.sha256,
        "source_pinned_raw_sha256": pinned_raw_sha256,
        "working_tree_raw_sha256": current_raw_sha256,
        "source_pinned_specification_sha256": pinned_specification_sha256,
        "working_tree_specification_sha256": current_specification_sha256,
        "source_pinned_progress": _progress_view(pinned_progress.value),
        "working_tree_progress": _progress_view(current_progress.value),
        "classification_state": classification.state.value,
        "drifted_artifact_paths": list(classification.drifted_artifact_paths),
        "changed_source_item_ids": list(classification.changed_source_item_ids),
    }


def _operation_coverage(
    tmp_path: Path,
) -> tuple[list[dict[str, object]], dict[LifecycleOperation, LifecycleGateDecision]]:
    rows: list[dict[str, object]] = []
    decisions: dict[LifecycleOperation, LifecycleGateDecision] = {}
    for operation, target_phase, mapping_operation in OPERATION_CASES:
        operation_root = tmp_path / operation.value
        operation_root.mkdir(parents=True)
        repository, boundary = _fixture(operation_root)
        decision = gate_lifecycle_operation(
            repository,
            CHANGE_ID,
            operation,
            target_phase,
            boundary=boundary,
        )
        assert decision.state is LifecycleGateState.CLEAN
        assert decision.admitted
        assert decision.mapping_operation is mapping_operation
        rows.append(_decision_view(decision))
        decisions[operation] = decision
    return rows, decisions


def _canonical_drift_evidence(tmp_path: Path) -> dict[str, object]:
    tmp_path.mkdir(parents=True, exist_ok=True)
    repository, boundary = _fixture(tmp_path)
    spec_path = repository / SPEC_PATH
    spec_path.write_text(
        CANONICAL_CONTENT[SPEC_PATH].replace(
            "the operation is admitted", "the operation is stopped"
        ),
        encoding="utf-8",
    )
    _pin_fixed_scenario_drift(repository, boundary)
    decision = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.PLAN,
        "03",
        boundary=boundary,
    )
    assert decision.state is LifecycleGateState.DRIFTED
    return _decision_view(decision)


def _unknown_evidence(tmp_path: Path) -> dict[str, object]:
    tmp_path.mkdir(parents=True, exist_ok=True)
    repository, boundary = _fixture(tmp_path)
    boundary.source_result = _failure("canonical-source-unknown")
    decision = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.EXECUTE,
        "03",
        boundary=boundary,
    )
    assert decision.state is LifecycleGateState.UNKNOWN
    assert decision.decision_identity is None
    return _decision_view(decision)


def _phase_capability_stale_evidence(tmp_path: Path) -> dict[str, object]:
    tmp_path.mkdir(parents=True, exist_ok=True)
    repository, clean_boundary = _fixture(tmp_path)
    previous = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.EXECUTE,
        "03",
        boundary=clean_boundary,
    )
    assert previous.state is LifecycleGateState.CLEAN
    assert previous.decision_identity is not None

    changed_nodes = tuple(
        replace(node, depends_on=()) if node.phase_id == "04" else node
        for node in _phase_nodes()
    )
    changed_boundary = FakeBoundary(
        repository=repository,
        canonical_source=clean_boundary.canonical_source,
        inventory=clean_boundary.inventory,
        observed_nodes=changed_nodes,
        capabilities=_capabilities(gsd_probe="changed-probe"),
    )
    stale = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.EXECUTE,
        "03",
        boundary=changed_boundary,
        prior_decision_identity=previous.decision_identity,
    )
    assert stale.state is LifecycleGateState.DRIFTED
    assert not stale.admitted
    assert "lifecycle-decision-stale" in stale.issue_codes
    return _decision_view(stale)


def _repository_identity_relations(tmp_path: Path) -> dict[str, bool]:
    first_root = tmp_path / "first-root"
    second_root = tmp_path / "second-root"
    first_root.mkdir(parents=True)
    second_root.mkdir(parents=True)
    first_repository, first_boundary = _fixture(first_root)
    second_repository, second_boundary = _fixture(second_root)

    first = gate_lifecycle_operation(
        first_repository,
        CHANGE_ID,
        LifecycleOperation.PLAN,
        "03",
        boundary=first_boundary,
    )
    repeated = gate_lifecycle_operation(
        first_repository,
        CHANGE_ID,
        LifecycleOperation.PLAN,
        "03",
        boundary=first_boundary,
        prior_decision_identity=first.decision_identity,
    )
    second = gate_lifecycle_operation(
        second_repository,
        CHANGE_ID,
        LifecycleOperation.PLAN,
        "03",
        boundary=second_boundary,
    )
    foreign = gate_lifecycle_operation(
        second_repository,
        CHANGE_ID,
        LifecycleOperation.PLAN,
        "03",
        boundary=second_boundary,
        prior_decision_identity=first.decision_identity,
    )
    assert first.decision_identity is not None
    assert repeated.decision_identity is not None
    assert second.decision_identity is not None
    return {
        "same_root_identity_stable": (
            repeated.admitted and repeated.decision_identity == first.decision_identity
        ),
        "cross_root_identities_distinct": (
            second.decision_identity != first.decision_identity
        ),
        "foreign_root_prior_identity_rejected": (
            foreign.state is LifecycleGateState.DRIFTED
            and not foreign.admitted
            and "lifecycle-decision-stale" in foreign.issue_codes
        ),
    }


def _protected_input_hashes(repository_root: Path) -> list[dict[str, str]]:
    handoff_path = repository_root / REAL_HANDOFF_PATH
    handoff_bytes = _read_bounded_bytes(handoff_path, MAX_MANIFEST_BYTES)
    parsed = parse_manifest_v2_bytes(handoff_bytes)
    assert isinstance(parsed, Success)
    rows = [
        {
            "kind": artifact.kind,
            "path": artifact.path,
            "sha256": hashlib.sha256(
                _read_bounded_bytes(
                    repository_root / artifact.path,
                    DEFAULT_ARTIFACT_LIMITS.bytes_per_file,
                )
            ).hexdigest(),
        }
        for artifact in parsed.value.artifacts
    ]
    rows.append(
        {
            "kind": "handoff",
            "path": REAL_HANDOFF_PATH,
            "sha256": hashlib.sha256(handoff_bytes).hexdigest(),
        }
    )
    return rows


def _staging_paths(repository_root: Path) -> list[str]:
    handoff_directory = repository_root / ".planning" / "openspec" / REAL_CHANGE_ID
    return sorted(
        path.relative_to(repository_root).as_posix()
        for path in handoff_directory.glob(".handoff.*.tmp")
    )


def _repository_root_lifecycle_evidence(
    repository_root: Path,
    tmp_path: Path,
) -> bytes:
    before = _protected_input_hashes(repository_root)
    staging_before = _staging_paths(repository_root)
    assert staging_before == []

    operation_rows, operation_decisions = _operation_coverage(
        tmp_path / "operation-coverage"
    )
    outcomes = {
        "clean": _decision_view(operation_decisions[LifecycleOperation.PLAN]),
        "canonical_drift": _canonical_drift_evidence(tmp_path / "canonical-drift"),
        "unknown": _unknown_evidence(tmp_path / "unknown"),
        "checkbox_only_progress": _checkbox_only_progress_evidence(
            repository_root,
            tmp_path / "checkbox-only",
        ),
        "phase_capability_stale": _phase_capability_stale_evidence(
            tmp_path / "phase-capability-stale"
        ),
    }
    repository_identity_relations = _repository_identity_relations(
        tmp_path / "repository-identity-relations"
    )

    after = _protected_input_hashes(repository_root)
    staging_after = _staging_paths(repository_root)
    assert after == before
    assert staging_after == []
    protected_inputs = [
        {
            "kind": before_row["kind"],
            "path": before_row["path"],
            "before_sha256": before_row["sha256"],
            "after_sha256": after_row["sha256"],
            "unchanged": before_row["sha256"] == after_row["sha256"],
        }
        for before_row, after_row in zip(before, after, strict=True)
    ]
    tracked_handoff = next(
        item for item in protected_inputs if item["kind"] == "handoff"
    )
    manifest = parse_manifest_v2_bytes(
        _read_bounded_bytes(
            repository_root / REAL_HANDOFF_PATH,
            MAX_MANIFEST_BYTES,
        )
    )
    assert isinstance(manifest, Success)
    return _compact_json(
        {
            "schema_version": "lifecycle-evidence-v2",
            "producer_version": "repository-portable-lifecycle-evidence-v2",
            "source_authority": {
                "change_id": REAL_CHANGE_ID,
                "source_commit": manifest.value.source_commit,
                "tracked_handoff_sha256": tracked_handoff["before_sha256"],
            },
            "operation_coverage": operation_rows,
            "outcomes": outcomes,
            "repository_identity_relations": repository_identity_relations,
            "protected_inputs": protected_inputs,
            "staging_paths_before": staging_before,
            "staging_paths_after": staging_after,
            "mutation_operations": [],
        }
    )


def test_fixed_canonical_evidence_matches_independent_golden(
    tmp_path: Path,
) -> None:
    produced = _repository_root_lifecycle_evidence(REPOSITORY_ROOT, tmp_path)
    expected = (REPOSITORY_ROOT / EXPECTED_EVIDENCE_PATH).read_bytes()

    assert json.loads(produced) == json.loads(expected)


def test_repository_root_lifecycle_evidence_matches_tracked_record(
    tmp_path: Path,
) -> None:
    first = _repository_root_lifecycle_evidence(
        REPOSITORY_ROOT,
        tmp_path / "first",
    )
    second = _repository_root_lifecycle_evidence(
        REPOSITORY_ROOT,
        tmp_path / "second",
    )
    tracked = (REPOSITORY_ROOT / TRACKED_EVIDENCE_PATH).read_bytes()
    independent_golden = (REPOSITORY_ROOT / EXPECTED_EVIDENCE_PATH).read_bytes()

    assert first == second == tracked
    assert json.loads(first) == json.loads(independent_golden)
    evidence = json.loads(first)
    assert evidence["schema_version"] == "lifecycle-evidence-v2"
    assert evidence["producer_version"] == "repository-portable-lifecycle-evidence-v2"
    assert evidence["repository_identity_relations"] == {
        "same_root_identity_stable": True,
        "cross_root_identities_distinct": True,
        "foreign_root_prior_identity_rejected": True,
    }
    decision_rows = [
        *evidence["operation_coverage"],
        *evidence["outcomes"].values(),
    ]
    assert all("drifted_artifact_paths" in row for row in decision_rows)
    assert all("progress_update_candidate" in row for row in decision_rows)
    assert all("decision_identity" not in row for row in decision_rows)
    assert all("prior_decision_identity" not in row for row in decision_rows)
    assert str(tmp_path).encode() not in first
    assert evidence["mutation_operations"] == []
    assert evidence["staging_paths_before"] == []
    assert evidence["staging_paths_after"] == []
    assert all(item["unchanged"] for item in evidence["protected_inputs"])


@pytest.mark.parametrize(
    ("operation", "target_phase", "expected_code"),
    [
        ("unknown", "03", "lifecycle-operation-invalid"),
        (LifecycleOperation.FINALIZE, "03", "lifecycle-target-phase-invalid"),
    ],
)
def test_incomplete_dimension_rejects_invalid_operation_target_pairs(
    tmp_path: Path,
    operation: Any,
    target_phase: str | None,
    expected_code: str,
) -> None:
    repository, boundary = _fixture(tmp_path)

    decision = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        operation,
        target_phase,
        boundary=boundary,
    )

    assert decision.state is LifecycleGateState.UNKNOWN
    assert not decision.admitted
    assert decision.issue_codes == (expected_code,)
    assert decision.drifted_artifact_paths == ()
    assert decision.changed_source_item_ids == ()
    assert decision.progress_update_candidate is None
    assert decision.revalidation_targets == ()
    assert decision.replanning_targets == ()
    assert decision.next_action_codes == ()
    assert decision.decision_identity is None


def test_drift_dimension_canonical_source_has_exact_remediation(
    tmp_path: Path,
) -> None:
    repository, boundary = _fixture(tmp_path)
    spec_path = repository / SPEC_PATH
    spec_path.write_text(
        CANONICAL_CONTENT[SPEC_PATH].replace(
            "the operation is admitted", "the operation is stopped"
        ),
        encoding="utf-8",
    )
    _pin_fixed_scenario_drift(repository, boundary)

    decision = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.PLAN,
        "03",
        boundary=boundary,
    )

    assert decision.state is LifecycleGateState.DRIFTED
    assert not decision.admitted
    assert decision.drifted_artifact_paths == (SPEC_PATH,)
    assert decision.changed_source_item_ids == ("SCN-000004",)
    assert decision.revalidation_targets == (
        "phase-path:.planning/phases/03-lifecycle-drift-gate",
    )
    assert decision.replanning_targets == ("03", "04", "05", "06")
    assert decision.next_action_codes == (
        "replan-affected-phases",
        "revalidate-mapping",
        "revalidate-source",
    )


def test_checkbox_progress_public_decision_preserves_current_progress(
    tmp_path: Path,
) -> None:
    repository, boundary = _fixture(tmp_path)
    current_tasks = CANONICAL_CONTENT[TASKS_PATH].replace("- [x]", "- [ ]")
    (repository / TASKS_PATH).write_text(current_tasks, encoding="utf-8")
    expected_progress = parse_task_progress(current_tasks)
    assert isinstance(expected_progress, Success)

    decision = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.PLAN,
        "03",
        boundary=boundary,
    )

    assert decision.state is LifecycleGateState.CLEAN
    assert decision.admitted
    assert decision.drifted_artifact_paths == ()
    assert decision.changed_source_item_ids == ()
    assert decision.progress_update_candidate == expected_progress.value


def test_drift_dimension_phase_and_capability_has_exact_remediation(
    tmp_path: Path,
) -> None:
    repository, clean_boundary = _fixture(tmp_path)
    changed_nodes = tuple(
        replace(node, depends_on=()) if node.phase_id == "04" else node
        for node in _phase_nodes()
    )
    boundary = FakeBoundary(
        repository=repository,
        canonical_source=clean_boundary.canonical_source,
        inventory=clean_boundary.inventory,
        observed_nodes=changed_nodes,
        capabilities=_capabilities(gsd_probe="changed-probe"),
    )

    decision = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.EXECUTE,
        "03",
        boundary=boundary,
    )

    assert decision.state is LifecycleGateState.DRIFTED
    assert not decision.admitted
    assert decision.changed_source_item_ids == ()
    assert decision.revalidation_targets == (
        "capability:gsd.probe",
        "phase:04",
    )
    assert decision.replanning_targets == ("04", "05", "06")
    assert decision.next_action_codes == (
        "replan-affected-phases",
        "reprobe-capabilities",
        "revalidate-mapping",
    )


def test_uninspected_host_is_incomplete_capability_evidence(tmp_path: Path) -> None:
    repository, boundary = _fixture(tmp_path)
    boundary.capabilities = replace(
        boundary.capabilities,
        host=replace(boundary.capabilities.host, inspected=False),
    )

    decision = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.EXECUTE,
        "03",
        boundary=boundary,
    )

    assert decision.state is LifecycleGateState.UNKNOWN
    assert not decision.admitted
    assert decision.issue_codes == ("lifecycle-capability-observation-incomplete",)
    assert decision.changed_source_item_ids == ()
    assert decision.revalidation_targets == ()
    assert decision.replanning_targets == ()
    assert decision.next_action_codes == ()
    assert decision.decision_identity is None


@pytest.mark.parametrize(
    ("field_name", "invalid_value"),
    [
        (field_name, invalid_value)
        for field_name in (
            "max_files",
            "bytes_per_file",
            "bytes_total",
            "change_id_bytes",
        )
        for invalid_value in ("invalid", True, 0, -1)
    ],
)
def test_malformed_nested_limits_fail_before_boundary_observation(
    tmp_path: Path,
    field_name: str,
    invalid_value: object,
) -> None:
    repository, boundary = _fixture(tmp_path)
    artifact_limits = replace(
        DEFAULT_ARTIFACT_LIMITS,
        **{field_name: cast(Any, invalid_value)},
    )

    decision = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.EXECUTE,
        "03",
        boundary=boundary,
        limits=LifecycleGateLimits(artifact_limits=artifact_limits),
    )

    assert decision.state is LifecycleGateState.UNKNOWN
    assert not decision.admitted
    assert decision.issue_codes == ("lifecycle-input-invalid",)
    assert boundary.source_calls == 0
    assert boundary.phase_calls == 0
    assert boundary.capability_calls == 0


def test_host_inspected_drift_is_explicit_capability_drift(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repository, boundary = _fixture(tmp_path)
    parsed = parse_manifest_v2_bytes((repository / MANIFEST_PATH).read_bytes())
    assert isinstance(parsed, Success)
    expected_capabilities = replace(
        parsed.value.capabilities,
        host=replace(parsed.value.capabilities.host, inspected=False),
    )
    manifest = replace(parsed.value, capabilities=expected_capabilities)
    monkeypatch.setattr(
        lifecycle_gate,
        "parse_manifest_v2_bytes",
        lambda _data: Success(manifest),
    )

    decision = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.EXECUTE,
        "03",
        boundary=boundary,
    )

    assert decision.state is LifecycleGateState.DRIFTED
    assert not decision.admitted
    assert decision.issue_codes == ("capability-changed:host.inspected",)
    assert decision.revalidation_targets == ("capability:host.inspected",)
    assert decision.next_action_codes == ("reprobe-capabilities",)


@pytest.mark.parametrize("side", ["expected", "observed"])
@pytest.mark.parametrize(
    "case",
    [
        "non-tuple-container",
        "invalid-node",
        "invalid-phase-id",
        "invalid-phase-path",
        "non-tuple-dependencies",
        "invalid-dependency",
        "duplicate-node-id",
    ],
)
def test_malformed_phase_graph_is_unknown_without_raising(
    tmp_path: Path,
    side: str,
    case: str,
) -> None:
    repository, boundary = _fixture(tmp_path)
    malformed = _malformed_phase_nodes(case)
    if side == "expected":
        boundary.expected_nodes = cast(Any, malformed)
    else:
        boundary.observed_nodes = cast(Any, malformed)

    decision = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.EXECUTE,
        "03",
        boundary=boundary,
    )

    assert decision.state is LifecycleGateState.UNKNOWN
    assert not decision.admitted
    assert decision.issue_codes == ("lifecycle-phase-observation-incomplete",)
    assert decision.changed_source_item_ids == ()
    assert decision.revalidation_targets == ()
    assert decision.replanning_targets == ()
    assert decision.next_action_codes == ()
    assert decision.decision_identity is None


@pytest.mark.parametrize("side", ["expected", "observed"])
def test_duplicate_phase_edge_is_rejected_before_normalization(
    tmp_path: Path,
    side: str,
) -> None:
    repository, boundary = _fixture(tmp_path)
    nodes = list(_phase_nodes())
    nodes[1] = replace(nodes[1], depends_on=("03", "03"))
    if side == "expected":
        boundary.expected_nodes = tuple(nodes)
    else:
        boundary.observed_nodes = tuple(nodes)

    decision = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.EXECUTE,
        "03",
        boundary=boundary,
    )

    assert decision.state is LifecycleGateState.UNKNOWN
    assert not decision.admitted
    assert decision.issue_codes == ("lifecycle-phase-observation-incomplete",)
    assert decision.decision_identity is None


@pytest.mark.parametrize("side", ["expected", "observed"])
@pytest.mark.parametrize("case", ["two-node", "longer"])
def test_cyclic_phase_graph_is_unknown_and_never_admitted(
    tmp_path: Path,
    side: str,
    case: str,
) -> None:
    repository, boundary = _fixture(tmp_path)
    nodes = _cyclic_phase_nodes(case)
    if side == "expected":
        boundary.expected_nodes = nodes
    else:
        boundary.observed_nodes = nodes

    decision = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.EXECUTE,
        "03",
        boundary=boundary,
    )

    assert decision.state is LifecycleGateState.UNKNOWN
    assert not decision.admitted
    assert decision.issue_codes == ("lifecycle-phase-observation-incomplete",)
    assert decision.changed_source_item_ids == ()
    assert decision.revalidation_targets == ()
    assert decision.replanning_targets == ()
    assert decision.next_action_codes == ()
    assert decision.decision_identity is None


@pytest.mark.parametrize(
    ("case", "operation", "target_phase"),
    [
        ("inventory-only", LifecycleOperation.EXECUTE, "03"),
        ("observed-graph-only", LifecycleOperation.EXECUTE, "03"),
        ("observed-path-mismatch", LifecycleOperation.EXECUTE, "03"),
        ("same-extra-both-graphs", LifecycleOperation.EXECUTE, "03"),
        ("same-extra-both-graphs", LifecycleOperation.FINALIZE, None),
    ],
)
def test_phase_graph_and_inventory_membership_paths_must_match_exactly(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    case: str,
    operation: LifecycleOperation,
    target_phase: str | None,
) -> None:
    repository, boundary = _fixture(tmp_path)
    extra_phase_path = ".planning/phases/07-lifecycle-07"
    extra_node = PhaseNodeObservation("07", extra_phase_path, ("06",))
    if case == "inventory-only":
        boundary.inventory = replace(
            boundary.inventory,
            phases=(
                *boundary.inventory.phases,
                PhaseDeclaration(CHANGE_ID, "07", extra_phase_path),
            ),
        )
    elif case == "expected-graph-only":
        boundary.expected_nodes = (*boundary.expected_nodes, extra_node)
    elif case == "observed-graph-only":
        boundary.observed_nodes = (*boundary.observed_nodes, extra_node)
    elif case == "expected-path-mismatch":
        boundary.expected_nodes = (
            replace(
                boundary.expected_nodes[0],
                phase_path=".planning/phases/03-alternate",
            ),
            *boundary.expected_nodes[1:],
        )
    elif case == "observed-path-mismatch":
        boundary.observed_nodes = (
            replace(
                boundary.observed_nodes[0],
                phase_path=".planning/phases/03-alternate",
            ),
            *boundary.observed_nodes[1:],
        )
    elif case == "same-extra-both-graphs":
        boundary.expected_nodes = (*boundary.expected_nodes, extra_node)
        boundary.observed_nodes = (*boundary.observed_nodes, extra_node)
    else:  # pragma: no cover - table is exhaustive
        raise AssertionError(case)

    original_mapping_readiness = lifecycle_gate.validate_mapping_readiness
    original_decision_identity = lifecycle_gate._decision_identity
    mapping_readiness_calls = 0
    decision_identity_calls = 0

    def record_mapping_readiness(*args: Any, **kwargs: Any):
        nonlocal mapping_readiness_calls
        mapping_readiness_calls += 1
        return original_mapping_readiness(*args, **kwargs)

    def record_decision_identity(*args: Any, **kwargs: Any) -> str:
        nonlocal decision_identity_calls
        decision_identity_calls += 1
        return original_decision_identity(*args, **kwargs)

    monkeypatch.setattr(
        lifecycle_gate,
        "validate_mapping_readiness",
        record_mapping_readiness,
    )
    monkeypatch.setattr(
        lifecycle_gate,
        "_decision_identity",
        record_decision_identity,
    )

    decision = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        operation,
        target_phase,
        boundary=boundary,
    )

    assert decision.state is LifecycleGateState.UNKNOWN
    assert not decision.admitted
    assert decision.issue_codes == ("lifecycle-phase-observation-incomplete",)
    assert decision.drifted_artifact_paths == ()
    assert decision.changed_source_item_ids == ()
    assert decision.progress_update_candidate is None
    assert decision.revalidation_targets == ()
    assert decision.replanning_targets == ()
    assert decision.next_action_codes == ()
    assert decision.decision_identity is None
    assert decision.manifest_sha256 is None
    assert mapping_readiness_calls == 0
    assert decision_identity_calls == 0


@pytest.mark.parametrize(
    "case",
    [
        "phase-added",
        "phase-removed",
        "phase-path",
        "phase-dependencies",
        "phase-path-and-dependencies",
        "simultaneous",
        "both-empty",
        "expected-empty",
        "observed-empty",
        "one-phase",
        "all-removed",
    ],
)
def test_a_e_graph_complete_phase_graph_cases_never_become_incomplete(
    tmp_path: Path,
    case: str,
) -> None:
    repository, boundary = _fixture(tmp_path)
    expected = _phase_nodes()
    observed = _phase_nodes()
    operation = LifecycleOperation.EXECUTE
    target_phase: str | None = "03"
    if case == "phase-added":
        observed = (
            *observed,
            PhaseNodeObservation("07", ".planning/phases/07-lifecycle-07", ("06",)),
        )
    elif case == "phase-removed":
        expected = (
            *expected,
            PhaseNodeObservation("07", ".planning/phases/07-lifecycle-07", ("06",)),
        )
    elif case == "phase-path":
        observed = tuple(
            replace(node, phase_path=".planning/phases/04-renamed")
            if node.phase_id == "04"
            else node
            for node in observed
        )
    elif case == "phase-dependencies":
        observed = tuple(
            replace(node, depends_on=()) if node.phase_id == "04" else node
            for node in observed
        )
    elif case == "phase-path-and-dependencies":
        observed = tuple(
            replace(
                node,
                phase_path=".planning/phases/04-renamed",
                depends_on=(),
            )
            if node.phase_id == "04"
            else node
            for node in observed
        )
    elif case == "simultaneous":
        expected = (
            *expected,
            PhaseNodeObservation("07", ".planning/phases/07-lifecycle-07", ("06",)),
        )
        observed = (
            *tuple(
                replace(node, depends_on=()) if node.phase_id == "04" else node
                for node in observed
            ),
            PhaseNodeObservation("08", ".planning/phases/08-lifecycle-08", ("06",)),
        )
    elif case == "both-empty":
        expected = ()
        observed = ()
        operation = LifecycleOperation.FINALIZE
        target_phase = None
    elif case == "expected-empty":
        expected = ()
    elif case in {"observed-empty", "all-removed"}:
        observed = ()
        operation = LifecycleOperation.FINALIZE
        target_phase = None
    elif case == "one-phase":
        expected = expected[:1]
        observed = observed[:1]
    else:  # pragma: no cover - table is exhaustive
        raise AssertionError(case)
    boundary.expected_nodes = expected
    boundary.observed_nodes = observed
    boundary.inventory = _inventory_for_phase_nodes(boundary.inventory, observed)

    decision = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        operation,
        target_phase,
        boundary=boundary,
    )

    assert decision.issue_codes != ("lifecycle-phase-observation-incomplete",)
    assert decision.state in {LifecycleGateState.CLEAN, LifecycleGateState.DRIFTED}
    assert decision.decision_identity is not None
    if case == "phase-path-and-dependencies":
        assert "phase-path-changed:04" in decision.issue_codes
        assert "phase-dependencies-changed:04" in decision.issue_codes


def test_a_e_graph_removed_phase_uses_old_edges_and_observed_replanning_set(
    tmp_path: Path,
) -> None:
    repository, boundary = _fixture(tmp_path)
    boundary.expected_nodes = (
        PhaseNodeObservation("03", ".planning/phases/03-lifecycle-drift-gate", ()),
        PhaseNodeObservation("04", ".planning/phases/04-lifecycle-04", ("03",)),
        PhaseNodeObservation("05", ".planning/phases/05-lifecycle-05", ("04",)),
        PhaseNodeObservation("06", ".planning/phases/06-lifecycle-06", ("05",)),
    )
    boundary.observed_nodes = (
        boundary.expected_nodes[0],
        replace(boundary.expected_nodes[2], depends_on=()),
        boundary.expected_nodes[3],
    )
    boundary.inventory = _inventory_for_phase_nodes(
        boundary.inventory, boundary.observed_nodes
    )

    decision = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.EXECUTE,
        "03",
        boundary=boundary,
    )

    assert decision.issue_codes == (
        "phase-dependencies-changed:05",
        "phase-removed:04",
    )
    assert decision.revalidation_targets == ("phase:04", "phase:05")
    assert decision.replanning_targets == ("05", "06")
    assert decision.next_action_codes == (
        "replan-affected-phases",
        "revalidate-mapping",
    )


@pytest.mark.parametrize(
    ("target", "relation", "expected_state", "issues", "actions", "identity"),
    [
        (
            "06",
            "expected-only",
            LifecycleGateState.DRIFTED,
            ("phase-removed:06",),
            ("lifecycle-target-phase-removed", "revalidate-mapping"),
            True,
        ),
        (
            "06",
            "observed-only",
            LifecycleGateState.DRIFTED,
            ("phase-added:06",),
            ("replan-affected-phases", "revalidate-mapping"),
            True,
        ),
        (
            "03",
            "both",
            LifecycleGateState.CLEAN,
            (),
            (),
            True,
        ),
        (
            "07",
            "neither",
            LifecycleGateState.UNKNOWN,
            (),
            ("lifecycle-target-phase-unknown",),
            False,
        ),
    ],
)
def test_a_e_target_phase_relation_precedes_mapping_readiness(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    target: str,
    relation: str,
    expected_state: LifecycleGateState,
    issues: tuple[str, ...],
    actions: tuple[str, ...],
    identity: bool,
) -> None:
    repository, boundary = _fixture(tmp_path)
    if relation == "expected-only":
        boundary.observed_nodes = boundary.observed_nodes[:-1]
    elif relation == "observed-only":
        boundary.expected_nodes = boundary.expected_nodes[:-1]
    boundary.inventory = _inventory_for_phase_nodes(
        boundary.inventory, boundary.observed_nodes
    )
    readiness_calls = 0
    original = lifecycle_gate.validate_mapping_readiness

    def record_readiness(*args: Any, **kwargs: Any):
        nonlocal readiness_calls
        readiness_calls += 1
        return original(*args, **kwargs)

    monkeypatch.setattr(lifecycle_gate, "validate_mapping_readiness", record_readiness)

    decision = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.EXECUTE,
        target,
        boundary=boundary,
    )

    assert decision.state is expected_state
    assert decision.issue_codes == issues
    assert decision.next_action_codes == actions
    assert (decision.decision_identity is not None) is identity
    assert readiness_calls == (0 if relation in {"expected-only", "neither"} else 1)


@pytest.mark.parametrize("target", [None, "", "invalid", object()])
def test_a_e_target_malformed_phase_is_action_only_unknown(
    tmp_path: Path,
    target: object,
) -> None:
    repository, boundary = _fixture(tmp_path)

    decision = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.EXECUTE,
        cast(Any, target),
        boundary=boundary,
    )

    assert decision.state is LifecycleGateState.UNKNOWN
    assert decision.issue_codes == ()
    assert decision.next_action_codes == ("lifecycle-input-invalid",)
    assert decision.decision_identity is None
    assert boundary.source_calls == 0


@st.composite
def _small_graph_permutations(
    draw: st.DrawFn,
) -> tuple[
    tuple[PhaseNodeObservation, ...],
    tuple[PhaseNodeObservation, ...],
    tuple[PhaseNodeObservation, ...],
    tuple[PhaseNodeObservation, ...],
]:
    count = draw(st.integers(min_value=2, max_value=4))
    nodes = _phase_nodes()[:count]
    changed_index = draw(st.integers(min_value=1, max_value=count - 1))
    observed = list(nodes)
    observed[changed_index] = replace(observed[changed_index], depends_on=())
    expected_permuted = tuple(reversed(nodes)) if draw(st.booleans()) else nodes
    observed_tuple = tuple(observed)
    observed_permuted = (
        tuple(reversed(observed_tuple)) if draw(st.booleans()) else observed_tuple
    )
    return nodes, observed_tuple, expected_permuted, observed_permuted


@settings(
    max_examples=12,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
@given(graphs=_small_graph_permutations())
def test_a_p_graph_public_projection_is_order_invariant_and_deterministic(
    tmp_path: Path,
    graphs: tuple[
        tuple[PhaseNodeObservation, ...],
        tuple[PhaseNodeObservation, ...],
        tuple[PhaseNodeObservation, ...],
        tuple[PhaseNodeObservation, ...],
    ],
) -> None:
    expected, observed, expected_permuted, observed_permuted = graphs
    with tempfile.TemporaryDirectory(dir=tmp_path) as example_directory:
        repository, boundary = _fixture(Path(example_directory))
        inventory = _inventory_for_phase_nodes(boundary.inventory, observed)
        boundary.expected_nodes = expected
        boundary.observed_nodes = observed
        boundary.inventory = inventory
        baseline = gate_lifecycle_operation(
            repository,
            CHANGE_ID,
            LifecycleOperation.EXECUTE,
            "03",
            boundary=boundary,
        )
        permuted = FakeBoundary(
            repository=repository,
            canonical_source=boundary.canonical_source,
            inventory=inventory,
            expected_nodes=expected_permuted,
            observed_nodes=observed_permuted,
        )
        repeated = gate_lifecycle_operation(
            repository,
            CHANGE_ID,
            LifecycleOperation.EXECUTE,
            "03",
            boundary=permuted,
        )

    assert baseline.state is LifecycleGateState.DRIFTED
    assert repeated.state is LifecycleGateState.DRIFTED
    assert repeated.issue_codes == baseline.issue_codes
    assert repeated.revalidation_targets == baseline.revalidation_targets
    assert repeated.replanning_targets == baseline.replanning_targets
    assert repeated.next_action_codes == baseline.next_action_codes
    assert repeated.decision_identity == baseline.decision_identity


@pytest.mark.parametrize(
    "component",
    [
        ".planning",
        ".planning/openspec",
        f".planning/openspec/{CHANGE_ID}",
    ],
)
def test_manifest_intermediate_symlink_is_unknown_and_never_admitted(
    tmp_path: Path,
    component: str,
) -> None:
    repository, boundary = _fixture(tmp_path)
    linked_component = repository / component
    external_component = tmp_path / f"external-{component.replace('/', '-')}"
    linked_component.rename(external_component)
    linked_component.symlink_to(external_component, target_is_directory=True)

    decision = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.EXECUTE,
        "03",
        boundary=boundary,
    )

    assert decision.state is LifecycleGateState.UNKNOWN
    assert not decision.admitted
    assert decision.issue_codes == ("lifecycle-manifest-unreadable",)
    assert decision.drifted_artifact_paths == ()
    assert decision.changed_source_item_ids == ()
    assert decision.progress_update_candidate is None
    assert decision.revalidation_targets == ()
    assert decision.replanning_targets == ()
    assert decision.next_action_codes == ()
    assert decision.decision_identity is None
    assert decision.manifest_sha256 is None
    assert boundary.source_calls == 0
    assert boundary.phase_calls == 0
    assert boundary.capability_calls == 0


@pytest.mark.parametrize(
    "component",
    [
        ".",
        ".planning",
        ".planning/openspec",
        f".planning/openspec/{CHANGE_ID}",
        MANIFEST_PATH,
    ],
)
def test_manifest_parent_identity_change_is_unknown_and_never_admitted(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    component: str,
) -> None:
    repository, boundary = _fixture(tmp_path)
    manifest_path = repository / MANIFEST_PATH
    selected_component = repository if component == "." else repository / component
    detached_component = tmp_path / f"detached-{component.replace('/', '-')}"
    original_open = lifecycle_gate.os.open
    original_close = lifecycle_gate.os.close
    opened_descriptors: set[int] = set()
    closed_descriptors: set[int] = set()
    replaced = False

    def replace_parent_after_manifest_open(
        path: str | bytes | Path,
        flags: int,
        mode: int = 0o777,
        *,
        dir_fd: int | None = None,
    ) -> int:
        nonlocal replaced
        descriptor = original_open(path, flags, mode, dir_fd=dir_fd)
        opened_descriptors.add(descriptor)
        absolute_path = Path(path.decode() if isinstance(path, bytes) else path)
        manifest_opened = (dir_fd is None and absolute_path == manifest_path) or (
            dir_fd is not None and path == "handoff.json"
        )
        if not replaced and manifest_opened:
            selected_component.rename(detached_component)
            selected_component.symlink_to(
                detached_component,
                target_is_directory=component != MANIFEST_PATH,
            )
            replaced = True
        return descriptor

    def record_close(descriptor: int) -> None:
        closed_descriptors.add(descriptor)
        original_close(descriptor)

    monkeypatch.setattr(lifecycle_gate.os, "open", replace_parent_after_manifest_open)
    monkeypatch.setattr(lifecycle_gate.os, "close", record_close)

    decision = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.EXECUTE,
        "03",
        boundary=boundary,
    )

    assert replaced
    assert decision.state is LifecycleGateState.UNKNOWN
    assert not decision.admitted
    assert decision.issue_codes == ("lifecycle-manifest-identity-changed",)
    assert decision.drifted_artifact_paths == ()
    assert decision.changed_source_item_ids == ()
    assert decision.progress_update_candidate is None
    assert decision.revalidation_targets == ()
    assert decision.replanning_targets == ()
    assert decision.next_action_codes == ()
    assert decision.decision_identity is None
    assert decision.manifest_sha256 is None
    assert boundary.source_calls == 0
    assert boundary.phase_calls == 0
    assert boundary.capability_calls == 0
    assert opened_descriptors <= closed_descriptors


@pytest.mark.parametrize(
    "case",
    [
        "source-failure",
        "manifest-missing",
        "manifest-malformed",
        "manifest-v1",
        "manifest-over-limit",
        "git-timeout",
        "git-truncated",
        "mapping-failure",
        "phase-over-limit",
        "capability-incomplete",
        "capability-over-limit",
    ],
)
def test_incomplete_dimension_is_wholly_unknown(tmp_path: Path, case: str) -> None:
    repository, boundary = _fixture(tmp_path)
    manifest_path = repository / MANIFEST_PATH
    if case == "source-failure":
        boundary.source_result = _failure("canonical-source-unknown")
    elif case == "manifest-missing":
        manifest_path.unlink()
    elif case == "manifest-malformed":
        manifest_path.write_bytes(b"{")
    elif case == "manifest-v1":
        manifest_path.write_bytes(
            manifest_path.read_bytes().replace(
                b'"schema_version": 2', b'"schema_version": 1'
            )
        )
    elif case == "manifest-over-limit":
        manifest_path.write_bytes(b"x" * (MAX_MANIFEST_BYTES + 1))
    elif case == "git-timeout":
        boundary.source_result = _failure("source-commit-timeout")
    elif case == "git-truncated":
        boundary.source_result = _failure("source-commit-truncated")
    elif case == "mapping-failure":
        boundary.inventory = replace(boundary.inventory, change_id="other-change")
    elif case == "phase-over-limit":
        boundary.observed_nodes = boundary.observed_nodes + tuple(
            PhaseNodeObservation(f"x{index}", f"phase/{index}", ())
            for index in range(5)
        )
    elif case == "capability-incomplete":
        boundary.capability_result = Success(
            CapabilityObservation(
                change_id=CHANGE_ID,
                source_commit=SOURCE_COMMIT,
                capabilities=cast(Any, None),
            )
        )
    elif case == "capability-over-limit":
        boundary.capabilities = _capabilities(gsd_probe="x" * 1025)
    else:  # pragma: no cover - table is exhaustive
        raise AssertionError(case)

    limits = LifecycleGateLimits(
        max_phase_nodes=4,
        max_aggregate_bytes=(
            1024 if case == "capability-over-limit" else MAX_MANIFEST_BYTES
        ),
    )
    decision = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.EXECUTE,
        "03",
        boundary=boundary,
        limits=limits,
    )

    assert decision.state is LifecycleGateState.UNKNOWN
    assert not decision.admitted
    assert decision.drifted_artifact_paths == ()
    assert decision.changed_source_item_ids == ()
    assert decision.progress_update_candidate is None
    assert decision.revalidation_targets == ()
    assert decision.replanning_targets == ()
    assert decision.next_action_codes == ()
    assert decision.decision_identity is None


def test_gate_reobserves_when_source_changes_between_calls(tmp_path: Path) -> None:
    repository, original = _fixture(tmp_path)
    boundary = FakeBoundary(
        repository=repository,
        canonical_source=original.canonical_source,
        inventory=original.inventory,
        mutate_before_second_current_read=True,
    )

    first = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.EXECUTE,
        "03",
        boundary=boundary,
    )
    second = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.EXECUTE,
        "03",
        boundary=boundary,
    )

    assert first.state is LifecycleGateState.CLEAN
    assert first.admitted
    assert second.state is LifecycleGateState.DRIFTED
    assert not second.admitted
    assert boundary.source_calls == 2


def test_drift_dimension_complete_manifest_source_commit_mismatch(
    tmp_path: Path,
) -> None:
    repository, boundary = _fixture(tmp_path)
    boundary.source_result = Success(
        SourceCommitObservation(
            repository_root=str(repository.resolve()),
            change_id=CHANGE_ID,
            source_commit="2" * 40,
            canonical_source=boundary.canonical_source,
        )
    )

    decision = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.EXECUTE,
        "03",
        boundary=boundary,
    )

    assert decision.state is LifecycleGateState.DRIFTED
    assert not decision.admitted
    assert "manifest-source-commit-mismatch" in decision.issue_codes


def test_drift_dimension_mapping_non_readiness_is_not_partial_green(
    tmp_path: Path,
) -> None:
    repository, boundary = _fixture(tmp_path)
    missing_plan = repository / boundary.inventory.plans[0].path
    missing_plan.unlink()

    decision = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.EXECUTE,
        "03",
        boundary=boundary,
    )

    assert decision.state is LifecycleGateState.DRIFTED
    assert not decision.admitted
    assert "mapping-path-missing" in decision.issue_codes
    assert decision.next_action_codes == ("revalidate-mapping",)


def test_manifest_digest_is_bound_to_exact_bounded_bytes(tmp_path: Path) -> None:
    repository, boundary = _fixture(tmp_path)
    raw = (repository / MANIFEST_PATH).read_bytes()

    decision = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.PLAN,
        "03",
        boundary=boundary,
    )

    assert decision.manifest_sha256 == hashlib.sha256(raw).hexdigest()


def test_repository_root_identity_is_stable_separate_and_not_replayable(
    tmp_path: Path,
) -> None:
    first_root = tmp_path / "first"
    second_root = tmp_path / "second"
    first_root.mkdir()
    second_root.mkdir()
    first_repository, first_boundary = _fixture(first_root)
    second_repository, second_boundary = _fixture(second_root)

    first = gate_lifecycle_operation(
        first_repository,
        CHANGE_ID,
        LifecycleOperation.PLAN,
        "03",
        boundary=first_boundary,
    )
    repeated = gate_lifecycle_operation(
        first_repository,
        CHANGE_ID,
        LifecycleOperation.PLAN,
        "03",
        boundary=first_boundary,
        prior_decision_identity=first.decision_identity,
    )
    second = gate_lifecycle_operation(
        second_repository,
        CHANGE_ID,
        LifecycleOperation.PLAN,
        "03",
        boundary=second_boundary,
    )
    foreign = gate_lifecycle_operation(
        second_repository,
        CHANGE_ID,
        LifecycleOperation.PLAN,
        "03",
        boundary=second_boundary,
        prior_decision_identity=first.decision_identity,
    )

    assert first.decision_identity is not None
    assert re.fullmatch(r"[0-9a-f]{64}", first.decision_identity) is not None
    assert repeated.state is LifecycleGateState.CLEAN
    assert repeated.admitted
    assert repeated.decision_identity == first.decision_identity
    assert second.decision_identity is not None
    assert re.fullmatch(r"[0-9a-f]{64}", second.decision_identity) is not None
    assert second.decision_identity != first.decision_identity
    assert foreign.state is LifecycleGateState.DRIFTED
    assert not foreign.admitted
    assert "lifecycle-decision-stale" in foreign.issue_codes


def test_identity_ignores_semantically_irrelevant_phase_tuple_order(
    tmp_path: Path,
) -> None:
    repository, boundary = _fixture(tmp_path)
    first = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.PLAN,
        "03",
        boundary=boundary,
    )
    reordered = FakeBoundary(
        repository=repository,
        canonical_source=boundary.canonical_source,
        inventory=boundary.inventory,
        expected_nodes=tuple(reversed(boundary.expected_nodes)),
        observed_nodes=tuple(reversed(boundary.observed_nodes)),
    )

    second = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.PLAN,
        "03",
        boundary=reordered,
    )

    assert second.state is LifecycleGateState.CLEAN
    assert second.decision_identity == first.decision_identity


@pytest.mark.parametrize(
    "domain",
    [
        "operation",
        "target-phase",
        "canonical-progress",
        "manifest-bytes",
        "manifest-state",
        "source-commit",
        "mapping-result",
        "phase-graph",
        "capability",
    ],
)
def test_identity_changes_when_one_bound_domain_changes(
    tmp_path: Path,
    domain: str,
) -> None:
    repository, boundary = _fixture(tmp_path)
    operation = (
        LifecycleOperation.EXECUTE
        if domain == "mapping-result"
        else LifecycleOperation.PLAN
    )
    target_phase = "03"
    baseline = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        operation,
        target_phase,
        boundary=boundary,
    )
    changed_boundary = boundary

    if domain == "operation":
        operation = LifecycleOperation.EXECUTE
    elif domain == "target-phase":
        target_phase = "04"
    elif domain == "canonical-progress":
        tasks = repository / TASKS_PATH
        tasks.write_text(
            CANONICAL_CONTENT[TASKS_PATH].replace("- [x]", "- [ ]"),
            encoding="utf-8",
        )
    elif domain == "manifest-bytes":
        manifest_path = repository / MANIFEST_PATH
        manifest_path.write_bytes(manifest_path.read_bytes() + b" \n")
    elif domain == "manifest-state":
        _rewrite_manifest(
            repository,
            lambda manifest: replace(manifest, handoff_state=HandoffState.PREPARED),
        )
    elif domain == "source-commit":
        changed_boundary = FakeBoundary(
            repository=repository,
            canonical_source=boundary.canonical_source,
            inventory=boundary.inventory,
            source_result=Success(
                SourceCommitObservation(
                    repository_root=str(repository.resolve()),
                    change_id=CHANGE_ID,
                    source_commit="2" * 40,
                    canonical_source=boundary.canonical_source,
                )
            ),
        )
    elif domain == "mapping-result":
        (repository / boundary.inventory.plans[0].path).unlink()
    elif domain == "phase-graph":
        changed_nodes = tuple(
            replace(node, depends_on=()) if node.phase_id == "04" else node
            for node in boundary.observed_nodes
        )
        changed_boundary = FakeBoundary(
            repository=repository,
            canonical_source=boundary.canonical_source,
            inventory=boundary.inventory,
            observed_nodes=changed_nodes,
        )
    elif domain == "capability":
        changed_boundary = FakeBoundary(
            repository=repository,
            canonical_source=boundary.canonical_source,
            inventory=boundary.inventory,
            capabilities=_capabilities(gsd_probe="changed-probe"),
        )
    else:  # pragma: no cover - table is exhaustive
        raise AssertionError(domain)

    changed = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        operation,
        target_phase,
        boundary=changed_boundary,
    )

    assert baseline.decision_identity is not None
    assert changed.decision_identity is not None
    assert changed.decision_identity != baseline.decision_identity


def test_identity_current_reuse_is_accepted_after_fresh_observation(
    tmp_path: Path,
) -> None:
    repository, boundary = _fixture(tmp_path)
    current = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.PLAN,
        "03",
        boundary=boundary,
    )

    repeated = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.PLAN,
        "03",
        boundary=boundary,
        prior_decision_identity=current.decision_identity,
    )

    assert repeated.state is LifecycleGateState.CLEAN
    assert repeated.admitted
    assert repeated.decision_identity == current.decision_identity
    assert boundary.source_calls == 2


def test_identity_stale_reuse_is_rejected_after_bound_input_changes(
    tmp_path: Path,
) -> None:
    repository, boundary = _fixture(tmp_path)
    previous = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.PLAN,
        "03",
        boundary=boundary,
    )
    manifest_path = repository / MANIFEST_PATH
    manifest_path.write_bytes(manifest_path.read_bytes() + b" \n")

    stale = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.PLAN,
        "03",
        boundary=boundary,
        prior_decision_identity=previous.decision_identity,
    )

    assert stale.state is LifecycleGateState.DRIFTED
    assert not stale.admitted
    assert "lifecycle-decision-stale" in stale.issue_codes
    assert stale.decision_identity != previous.decision_identity


def test_stale_rejection_identity_cannot_be_replayed_into_admission(
    tmp_path: Path,
) -> None:
    repository, boundary = _fixture(tmp_path)
    initial = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.PLAN,
        "03",
        boundary=boundary,
    )
    manifest_path = repository / MANIFEST_PATH
    manifest_path.write_bytes(manifest_path.read_bytes() + b" \n")

    first_stale = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.PLAN,
        "03",
        boundary=boundary,
        prior_decision_identity=initial.decision_identity,
    )
    repeated_stale = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.PLAN,
        "03",
        boundary=boundary,
        prior_decision_identity=first_stale.decision_identity,
    )

    assert initial.state is LifecycleGateState.CLEAN
    assert initial.admitted
    assert initial.decision_identity is not None
    assert first_stale.state is LifecycleGateState.DRIFTED
    assert not first_stale.admitted
    assert first_stale.issue_codes == ("lifecycle-decision-stale",)
    assert first_stale.decision_identity is not None
    assert re.fullmatch(r"[0-9a-f]{64}", first_stale.decision_identity) is not None
    assert first_stale.decision_identity != initial.decision_identity
    assert repeated_stale.state is LifecycleGateState.DRIFTED
    assert not repeated_stale.admitted
    assert repeated_stale.issue_codes == ("lifecycle-decision-stale",)
    assert repeated_stale.decision_identity == first_stale.decision_identity


@pytest.mark.parametrize("malformed", ["", "A" * 64, "0" * 63, "g" * 64])
def test_identity_malformed_text_is_unknown(
    tmp_path: Path,
    malformed: str,
) -> None:
    repository, boundary = _fixture(tmp_path)

    decision = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.PLAN,
        "03",
        boundary=boundary,
        prior_decision_identity=malformed,
    )

    assert decision.state is LifecycleGateState.UNKNOWN
    assert not decision.admitted
    assert decision.issue_codes == ("lifecycle-decision-identity-invalid",)
    assert decision.decision_identity is None


def test_identity_incomplete_observation_has_no_reusable_digest(
    tmp_path: Path,
) -> None:
    repository, boundary = _fixture(tmp_path)
    clean = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.PLAN,
        "03",
        boundary=boundary,
    )
    boundary.source_result = _failure("source-commit-timeout")

    incomplete = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.PLAN,
        "03",
        boundary=boundary,
        prior_decision_identity=clean.decision_identity,
    )

    assert incomplete.state is LifecycleGateState.UNKNOWN
    assert not incomplete.admitted
    assert incomplete.decision_identity is None
