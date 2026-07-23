"""Public-seam examples for the shared lifecycle admission gate."""

from __future__ import annotations

import hashlib
from dataclasses import replace
from pathlib import Path
from typing import Any, cast

import pytest
from ai_coding_template_ja.openspec_gsd_handoff.lifecycle_gate import (
    CapabilityObservation,
    LifecycleGateLimits,
    LifecycleGateState,
    LifecycleObservationBoundary,
    LifecycleOperation,
    PhaseGraphObservation,
    PhaseNodeObservation,
    SourceCommitObservation,
    gate_lifecycle_operation,
)

from ai_coding_template_ja.openspec_gsd_handoff.execution_mapping import (
    EvidenceDeclaration,
    MappingOperation,
    PhaseAssignment,
    PhaseDeclaration,
    PlanDeclaration,
    PlanningInventory,
)
from ai_coding_template_ja.openspec_gsd_handoff.lifecycle_drift import (
    CanonicalSourceObservation,
    observe_canonical_source,
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
    Success,
)
from ai_coding_template_ja.openspec_gsd_handoff.source_identity import (
    SourceCategory,
    SourceIdentityState,
)

CHANGE_ID = "fixture-change"
SOURCE_COMMIT = "1" * 40
PROPOSAL_PATH = f"openspec/changes/{CHANGE_ID}/proposal.md"
DESIGN_PATH = f"openspec/changes/{CHANGE_ID}/design.md"
TASKS_PATH = f"openspec/changes/{CHANGE_ID}/tasks.md"
SPEC_PATH = f"openspec/changes/{CHANGE_ID}/specs/lifecycle/spec.md"
MANIFEST_PATH = f".planning/openspec/{CHANGE_ID}/handoff.json"

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
            entrypoint="gsd-tools.cjs",
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
            phase_path=f".planning/phases/{phase_id}-lifecycle-{phase_id}",
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
    phase_plan = next(item for item in inventory.plans if item.phase_id == "03")
    plan_evidence = next(
        item for item in inventory.evidence if item.plan_path == phase_plan.path
    )
    return tuple(
        ManifestMapping(
            source_id=assignment.source_id,
            phase_id="03",
            phase_path=phase.phase_path,
            plan_paths=(phase_plan.path,),
            evidence_paths=tuple(
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
        PhaseNodeObservation("03", ".planning/phases/03-lifecycle-03", ()),
        PhaseNodeObservation("04", ".planning/phases/04-lifecycle-04", ("03",)),
        PhaseNodeObservation("05", ".planning/phases/05-lifecycle-05", ("04",)),
        PhaseNodeObservation("06", ".planning/phases/06-lifecycle-06", ("05",)),
    )


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


@pytest.mark.parametrize(
    ("operation", "target_phase", "mapping_operation"),
    [
        (LifecycleOperation.PLAN, "03", MappingOperation.PLAN),
        (LifecycleOperation.EXECUTE, "03", MappingOperation.EXECUTE),
        (LifecycleOperation.RESUME, "03", MappingOperation.EXECUTE),
        (LifecycleOperation.VERIFY, "03", MappingOperation.VERIFY),
        (LifecycleOperation.FINALIZE, None, MappingOperation.FINALIZE),
    ],
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


@pytest.mark.parametrize(
    ("operation", "target_phase", "expected_code"),
    [
        ("unknown", "03", "lifecycle-operation-invalid"),
        (LifecycleOperation.FINALIZE, "03", "lifecycle-target-phase-invalid"),
        (LifecycleOperation.PLAN, None, "lifecycle-target-phase-required"),
        (LifecycleOperation.EXECUTE, None, "lifecycle-target-phase-required"),
        (LifecycleOperation.RESUME, None, "lifecycle-target-phase-required"),
        (LifecycleOperation.VERIFY, None, "lifecycle-target-phase-required"),
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
    assert decision.changed_source_item_ids == ()
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

    decision = gate_lifecycle_operation(
        repository,
        CHANGE_ID,
        LifecycleOperation.EXECUTE,
        "03",
        boundary=boundary,
    )

    assert decision.state is LifecycleGateState.DRIFTED
    assert not decision.admitted
    assert decision.changed_source_item_ids == ("SCN-000004",)
    assert decision.revalidation_targets == (
        "phase-path:.planning/phases/03-lifecycle-03",
    )
    assert decision.replanning_targets == ("03", "04", "05", "06")
    assert decision.next_action_codes == (
        "replan-affected-phases",
        "revalidate-mapping",
        "revalidate-source",
    )


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
    else:  # pragma: no cover - table is exhaustive
        raise AssertionError(case)

    limits = LifecycleGateLimits(max_phase_nodes=4)
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
    assert decision.changed_source_item_ids == ()
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
