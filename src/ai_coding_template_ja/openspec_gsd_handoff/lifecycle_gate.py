"""Fresh fail-closed admission decisions for every handoff lifecycle operation."""

from __future__ import annotations

import hashlib
import os
import re
import stat
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path, PurePosixPath
from typing import Protocol

from .execution_mapping import (
    MappingOperation,
    MappingReadiness,
    PlanningInventory,
    validate_mapping_readiness,
)
from .lifecycle_drift import (
    CanonicalSourceDriftDecision,
    CanonicalSourceObservation,
    DriftState,
    classify_canonical_source_drift,
    observe_canonical_source,
)
from .manifest import MAX_MANIFEST_BYTES, ManifestCapabilities
from .manifest_v2 import HandoffManifestV2, parse_manifest_v2_bytes
from .models import (
    ArtifactClaim,
    ArtifactKind,
    ClassifiedIssue,
    Failure,
    IssueCategory,
    KnownState,
    Result,
    Success,
)
from .reader import DEFAULT_ARTIFACT_LIMITS, ArtifactLimits

_CHANGE_ID = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")
_COMMIT = re.compile(r"[0-9a-f]{40}\Z")
_PHASE_ID = re.compile(r"[0-9]{2}\Z")


class LifecycleOperation(StrEnum):
    """Operations protected by the single lifecycle admission seam."""

    PLAN = "plan"
    EXECUTE = "execute"
    RESUME = "resume"
    VERIFY = "verify"
    FINALIZE = "finalize"


class LifecycleGateState(StrEnum):
    """Whole-operation lifecycle admission outcomes."""

    CLEAN = "clean"
    DRIFTED = "drifted"
    UNKNOWN = "unknown"


@dataclass(frozen=True)
class LifecycleGateLimits:
    """Bounds applied before a complete lifecycle observation is constructed."""

    max_manifest_bytes: int = MAX_MANIFEST_BYTES
    max_phase_nodes: int = 4096
    max_phase_edges: int = 4096
    max_aggregate_bytes: int = MAX_MANIFEST_BYTES
    artifact_limits: ArtifactLimits = DEFAULT_ARTIFACT_LIMITS


DEFAULT_LIFECYCLE_GATE_LIMITS = LifecycleGateLimits()


@dataclass(frozen=True)
class SourceCommitObservation:
    """Complete Git/source-commit evidence including canonical source bytes."""

    repository_root: str
    change_id: str
    source_commit: str
    canonical_source: CanonicalSourceObservation


@dataclass(frozen=True)
class PhaseNodeObservation:
    """One phase identity, canonical path, and dependency declaration."""

    phase_id: str
    phase_path: str
    depends_on: tuple[str, ...]


@dataclass(frozen=True)
class PhaseGraphObservation:
    """Source-pinned and current phase graphs plus mapping declarations."""

    change_id: str
    source_commit: str
    expected_nodes: tuple[PhaseNodeObservation, ...]
    observed_nodes: tuple[PhaseNodeObservation, ...]
    planning_inventory: PlanningInventory


@dataclass(frozen=True)
class CapabilityObservation:
    """One complete current OpenSpec, GSD, and host capability observation."""

    change_id: str
    source_commit: str
    capabilities: ManifestCapabilities


@dataclass(frozen=True)
class LifecycleGateObservation:
    """All complete admission evidence gathered once for one operation."""

    operation: LifecycleOperation
    target_phase: str | None
    mapping_operation: MappingOperation
    manifest_sha256: str
    manifest: HandoffManifestV2
    source_commit: SourceCommitObservation
    source_decision: CanonicalSourceDriftDecision
    mapping_readiness: MappingReadiness
    phase_graph: PhaseGraphObservation
    capabilities: CapabilityObservation


@dataclass(frozen=True)
class LifecycleGateDecision:
    """Immutable whole-operation decision with deterministic remediation data."""

    operation: LifecycleOperation | None
    target_phase: str | None
    mapping_operation: MappingOperation | None
    state: LifecycleGateState
    admitted: bool
    issue_codes: tuple[str, ...]
    changed_source_item_ids: tuple[str, ...]
    revalidation_targets: tuple[str, ...]
    replanning_targets: tuple[str, ...]
    next_action_codes: tuple[str, ...]
    decision_identity: str | None
    manifest_sha256: str | None


class LifecycleObservationBoundary(Protocol):
    """Narrow boundary for bounded Git, phase, and capability observations."""

    def observe_source_commit(
        self,
        repository_root: Path,
        change_id: str,
        source_commit: str,
        claims: tuple[ArtifactClaim, ...],
        *,
        limits: LifecycleGateLimits,
    ) -> Result[SourceCommitObservation]: ...

    def observe_phase_graph(
        self,
        repository_root: Path,
        change_id: str,
        source_commit: str,
        *,
        limits: LifecycleGateLimits,
    ) -> Result[PhaseGraphObservation]: ...

    def observe_capabilities(
        self,
        repository_root: Path,
        change_id: str,
        source_commit: str,
        *,
        limits: LifecycleGateLimits,
    ) -> Result[CapabilityObservation]: ...


def _failure(code: str) -> Failure:
    return Failure(
        ClassifiedIssue(
            category=IssueCategory.PREFLIGHT,
            code=code,
            known_state=KnownState.UNKNOWN,
        )
    )


def _utf8_sorted(values: set[str] | list[str] | tuple[str, ...]) -> tuple[str, ...]:
    return tuple(sorted(set(values), key=str.encode))


def _valid_limits(limits: LifecycleGateLimits) -> bool:
    return (
        isinstance(limits, LifecycleGateLimits)
        and all(
            type(value) is int and value > 0
            for value in (
                limits.max_manifest_bytes,
                limits.max_phase_nodes,
                limits.max_phase_edges,
                limits.max_aggregate_bytes,
            )
        )
        and isinstance(limits.artifact_limits, ArtifactLimits)
    )


def _mapping_operation(operation: LifecycleOperation) -> MappingOperation:
    return {
        LifecycleOperation.PLAN: MappingOperation.PLAN,
        LifecycleOperation.EXECUTE: MappingOperation.EXECUTE,
        LifecycleOperation.RESUME: MappingOperation.EXECUTE,
        LifecycleOperation.VERIFY: MappingOperation.VERIFY,
        LifecycleOperation.FINALIZE: MappingOperation.FINALIZE,
    }[operation]


def _validate_operation_target(
    operation: object,
    target_phase: object,
) -> tuple[LifecycleOperation, str | None] | Failure:
    if not isinstance(operation, LifecycleOperation):
        return _failure("lifecycle-operation-invalid")
    if operation is LifecycleOperation.FINALIZE:
        if target_phase is not None:
            return _failure("lifecycle-target-phase-invalid")
        return operation, None
    if type(target_phase) is not str or _PHASE_ID.fullmatch(target_phase) is None:
        code = (
            "lifecycle-target-phase-required"
            if target_phase is None
            else "lifecycle-target-phase-invalid"
        )
        return _failure(code)
    return operation, target_phase


def _same_identity(left: os.stat_result, right: os.stat_result) -> bool:
    return (left.st_dev, left.st_ino, stat.S_IFMT(left.st_mode)) == (
        right.st_dev,
        right.st_ino,
        stat.S_IFMT(right.st_mode),
    )


def _read_manifest_bytes(path: Path, limit: int) -> Result[bytes]:
    descriptor: int | None = None
    try:
        before = os.stat(path, follow_symlinks=False)
        if stat.S_ISLNK(before.st_mode) or not stat.S_ISREG(before.st_mode):
            return _failure("lifecycle-manifest-unreadable")
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
        opened = os.fstat(descriptor)
        if not _same_identity(before, opened) or not stat.S_ISREG(opened.st_mode):
            return _failure("lifecycle-manifest-identity-changed")
        chunks: list[bytes] = []
        remaining = limit + 1
        while remaining:
            chunk = os.read(descriptor, remaining)
            if not chunk:
                break
            chunks.append(chunk)
            remaining -= len(chunk)
        content = b"".join(chunks)
        after = os.stat(path, follow_symlinks=False)
        if not _same_identity(after, opened):
            return _failure("lifecycle-manifest-identity-changed")
        if len(content) > limit:
            return _failure("lifecycle-manifest-size-limit-exceeded")
        return Success(content)
    except (OSError, ValueError):
        return _failure("lifecycle-manifest-read-failed")
    finally:
        if descriptor is not None:
            try:
                os.close(descriptor)
            except OSError:
                pass


def _claims_from_manifest(
    manifest: HandoffManifestV2,
) -> tuple[ArtifactClaim, ...] | Failure:
    claims: list[ArtifactClaim] = []
    try:
        for artifact in manifest.artifacts:
            claims.append(
                ArtifactClaim(ArtifactKind(artifact.kind), Path(artifact.path))
            )
    except (TypeError, ValueError):
        return _failure("lifecycle-manifest-artifacts-invalid")
    return tuple(
        sorted(claims, key=lambda item: (item.kind.value, item.path.as_posix()))
    )


def _canonical_phase_path(value: str, phase_id: str) -> bool:
    try:
        path = PurePosixPath(value)
    except (TypeError, ValueError):
        return False
    parts = path.parts
    return (
        value == path.as_posix()
        and not path.is_absolute()
        and len(parts) == 3
        and parts[:2] == (".planning", "phases")
        and parts[2].startswith(f"{phase_id}-")
    )


def _validate_phase_nodes(
    nodes: object,
    *,
    limits: LifecycleGateLimits,
) -> bool:
    if type(nodes) is not tuple or len(nodes) > limits.max_phase_nodes:
        return False
    if any(not isinstance(node, PhaseNodeObservation) for node in nodes):
        return False
    typed_nodes = nodes
    if typed_nodes != tuple(
        sorted(typed_nodes, key=lambda node: node.phase_id.encode())
    ):
        return False
    phase_ids = {node.phase_id for node in typed_nodes}
    if len(phase_ids) != len(typed_nodes):
        return False
    edge_count = sum(len(node.depends_on) for node in typed_nodes)
    if edge_count > limits.max_phase_edges:
        return False
    aggregate_values: list[str] = []
    for node in typed_nodes:
        if (
            _PHASE_ID.fullmatch(node.phase_id) is None
            or not _canonical_phase_path(node.phase_path, node.phase_id)
            or type(node.depends_on) is not tuple
            or node.depends_on != _utf8_sorted(node.depends_on)
            or node.phase_id in node.depends_on
            or any(dependency not in phase_ids for dependency in node.depends_on)
        ):
            return False
        aggregate_values.extend((node.phase_id, node.phase_path, *node.depends_on))
    try:
        aggregate_bytes = sum(len(value.encode("utf-8")) for value in aggregate_values)
    except UnicodeEncodeError:
        return False
    return aggregate_bytes <= limits.max_aggregate_bytes


def _validate_source_commit(
    value: object,
    *,
    root: Path,
    change_id: str,
) -> bool:
    return (
        isinstance(value, SourceCommitObservation)
        and value.repository_root == str(root)
        and value.change_id == change_id
        and _COMMIT.fullmatch(value.source_commit) is not None
        and isinstance(value.canonical_source, CanonicalSourceObservation)
    )


def _validate_phase_graph(
    value: object,
    *,
    change_id: str,
    limits: LifecycleGateLimits,
) -> bool:
    if (
        not isinstance(value, PhaseGraphObservation)
        or value.change_id != change_id
        or _COMMIT.fullmatch(value.source_commit) is None
        or not isinstance(value.planning_inventory, PlanningInventory)
        or value.planning_inventory.change_id != change_id
        or not _validate_phase_nodes(value.expected_nodes, limits=limits)
        or not _validate_phase_nodes(value.observed_nodes, limits=limits)
    ):
        return False
    observed_paths = {node.phase_id: node.phase_path for node in value.observed_nodes}
    return all(
        observed_paths.get(phase.phase_id) == phase.phase_path
        for phase in value.planning_inventory.phases
    )


def _validate_capabilities(value: object, *, change_id: str) -> bool:
    return (
        isinstance(value, CapabilityObservation)
        and value.change_id == change_id
        and _COMMIT.fullmatch(value.source_commit) is not None
        and isinstance(value.capabilities, ManifestCapabilities)
    )


def _boundary_result[ObservationT](
    callable_result: Result[ObservationT], code: str
) -> Result[ObservationT]:
    if isinstance(callable_result, Failure):
        return callable_result
    if isinstance(callable_result, Success):
        return callable_result
    return _failure(code)


def observe_lifecycle_operation(
    repository_root: Path,
    change_id: str,
    operation: LifecycleOperation,
    target_phase: str | None,
    *,
    boundary: LifecycleObservationBoundary,
    limits: LifecycleGateLimits = DEFAULT_LIFECYCLE_GATE_LIMITS,
) -> Result[LifecycleGateObservation]:
    """Freshly gather every admission domain and return no partial observation."""

    operation_target = _validate_operation_target(operation, target_phase)
    if isinstance(operation_target, Failure):
        return operation_target
    operation, target_phase = operation_target
    if (
        type(change_id) is not str
        or _CHANGE_ID.fullmatch(change_id) is None
        or not _valid_limits(limits)
    ):
        return _failure("lifecycle-input-invalid")
    try:
        root = repository_root.resolve(strict=True)
        if not root.is_dir():
            raise OSError
    except (OSError, RuntimeError, ValueError):
        return _failure("lifecycle-repository-root-invalid")

    manifest_bytes_result = _read_manifest_bytes(
        root / ".planning" / "openspec" / change_id / "handoff.json",
        limits.max_manifest_bytes,
    )
    if isinstance(manifest_bytes_result, Failure):
        return manifest_bytes_result
    parsed_manifest = parse_manifest_v2_bytes(manifest_bytes_result.value)
    if isinstance(parsed_manifest, Failure):
        return _failure(parsed_manifest.issue.code)
    manifest = parsed_manifest.value
    if manifest.change_id != change_id:
        return _failure("lifecycle-manifest-change-mismatch")
    claims = _claims_from_manifest(manifest)
    if isinstance(claims, Failure):
        return claims

    try:
        source_result = _boundary_result(
            boundary.observe_source_commit(
                root,
                change_id,
                manifest.source_commit,
                claims,
                limits=limits,
            ),
            "lifecycle-source-commit-observation-invalid",
        )
        phase_result = _boundary_result(
            boundary.observe_phase_graph(
                root,
                change_id,
                manifest.source_commit,
                limits=limits,
            ),
            "lifecycle-phase-observation-invalid",
        )
        capability_result = _boundary_result(
            boundary.observe_capabilities(
                root,
                change_id,
                manifest.source_commit,
                limits=limits,
            ),
            "lifecycle-capability-observation-invalid",
        )
    except Exception:
        return _failure("lifecycle-boundary-observation-failed")
    if isinstance(source_result, Failure):
        return _failure(source_result.issue.code)
    if isinstance(phase_result, Failure):
        return _failure(phase_result.issue.code)
    if isinstance(capability_result, Failure):
        return _failure(capability_result.issue.code)

    source_commit = source_result.value
    phase_graph = phase_result.value
    capabilities = capability_result.value
    if not _validate_source_commit(
        source_commit,
        root=root,
        change_id=change_id,
    ):
        return _failure("lifecycle-source-commit-observation-incomplete")
    if not _validate_phase_graph(
        phase_graph,
        change_id=change_id,
        limits=limits,
    ):
        return _failure("lifecycle-phase-observation-incomplete")
    if not _validate_capabilities(capabilities, change_id=change_id):
        return _failure("lifecycle-capability-observation-incomplete")

    current_source = observe_canonical_source(
        root,
        change_id,
        claims,
        expected_source_items=manifest.source_items,
        limits=limits.artifact_limits,
    )
    if isinstance(current_source, Failure):
        return _failure(current_source.issue.code)
    source_decision = classify_canonical_source_drift(
        Success(source_commit.canonical_source),
        current_source,
    )
    if source_decision.state is DriftState.UNKNOWN:
        return _failure(source_decision.issue_code or "lifecycle-source-unknown")

    mapping_operation = _mapping_operation(operation)
    mapping_result = validate_mapping_readiness(
        root,
        manifest.source_items,
        manifest.mappings,
        phase_graph.planning_inventory,
        operation=mapping_operation,
        target_phase_id=target_phase,
    )
    if isinstance(mapping_result, Failure):
        return _failure(mapping_result.issue.code)
    if operation is not LifecycleOperation.FINALIZE and not any(
        node.phase_id == target_phase for node in phase_graph.observed_nodes
    ):
        return _failure("lifecycle-target-phase-unknown")

    return Success(
        LifecycleGateObservation(
            operation=operation,
            target_phase=target_phase,
            mapping_operation=mapping_operation,
            manifest_sha256=hashlib.sha256(manifest_bytes_result.value).hexdigest(),
            manifest=manifest,
            source_commit=source_commit,
            source_decision=source_decision,
            mapping_readiness=mapping_result.value,
            phase_graph=phase_graph,
            capabilities=capabilities,
        )
    )


def _phase_changes(
    graph: PhaseGraphObservation,
) -> tuple[set[str], list[str], set[str]]:
    expected = {node.phase_id: node for node in graph.expected_nodes}
    observed = {node.phase_id: node for node in graph.observed_nodes}
    affected: set[str] = set()
    issues: list[str] = []
    targets: set[str] = set()
    for phase_id in _utf8_sorted(set(expected) | set(observed)):
        before = expected.get(phase_id)
        after = observed.get(phase_id)
        if before is None:
            issues.append(f"phase-added:{phase_id}")
        elif after is None:
            issues.append(f"phase-removed:{phase_id}")
        elif before.phase_path != after.phase_path:
            issues.append(f"phase-path-changed:{phase_id}")
        elif before.depends_on != after.depends_on:
            issues.append(f"phase-dependencies-changed:{phase_id}")
        else:
            continue
        affected.add(phase_id)
        targets.add(f"phase:{phase_id}")
    return affected, issues, targets


def _capability_changes(
    expected: ManifestCapabilities,
    observed: ManifestCapabilities,
) -> tuple[list[str], set[str]]:
    fields = (
        ("openspec.version", expected.openspec.version, observed.openspec.version),
        ("openspec.probe", expected.openspec.probe, observed.openspec.probe),
        (
            "openspec.schema_name",
            expected.openspec.schema_name,
            observed.openspec.schema_name,
        ),
        (
            "openspec.input_route",
            expected.openspec.input_route,
            observed.openspec.input_route,
        ),
        ("gsd.version", expected.gsd.version, observed.gsd.version),
        ("gsd.probe", expected.gsd.probe, observed.gsd.probe),
        (
            "gsd.project_initialized",
            expected.gsd.project_initialized,
            observed.gsd.project_initialized,
        ),
        ("gsd.entrypoint", expected.gsd.entrypoint, observed.gsd.entrypoint),
        (
            "host.spawn_agent_schema",
            expected.host.spawn_agent_schema,
            observed.host.spawn_agent_schema,
        ),
        ("host.dispatch", expected.host.dispatch, observed.host.dispatch),
        (
            "host.agent_role_source",
            expected.host.agent_role_source,
            observed.host.agent_role_source,
        ),
    )
    changed = [name for name, before, after in fields if before != after]
    return (
        [f"capability-changed:{name}" for name in changed],
        {f"capability:{name}" for name in changed},
    )


def _downstream_phases(
    graph: PhaseGraphObservation,
    directly_affected: set[str],
) -> set[str]:
    affected = set(directly_affected)
    changed = True
    while changed:
        changed = False
        for node in graph.observed_nodes:
            if node.phase_id not in affected and any(
                dependency in affected for dependency in node.depends_on
            ):
                affected.add(node.phase_id)
                changed = True
    return affected


def _manifest_consistency_issues(
    observation: LifecycleGateObservation,
) -> list[str]:
    issues: list[str] = []
    manifest = observation.manifest
    commit = observation.source_commit
    if commit.source_commit != manifest.source_commit:
        issues.append("manifest-source-commit-mismatch")
    expected_artifacts = tuple(
        (artifact.kind.value, artifact.path, artifact.raw_sha256)
        for artifact in commit.canonical_source.artifacts
    )
    manifest_artifacts = tuple(
        (artifact.kind, artifact.path, artifact.sha256)
        for artifact in manifest.artifacts
    )
    if expected_artifacts != manifest_artifacts:
        issues.append("manifest-artifacts-mismatch")
    if commit.canonical_source.source_items != manifest.source_items:
        issues.append("manifest-source-items-mismatch")
    if commit.canonical_source.progress != manifest.progress:
        issues.append("manifest-progress-mismatch")
    if observation.phase_graph.source_commit != manifest.source_commit:
        issues.append("phase-source-commit-mismatch")
    if observation.capabilities.source_commit != manifest.source_commit:
        issues.append("capability-source-commit-mismatch")
    return issues


def _decision_from_observation(
    observation: LifecycleGateObservation,
) -> LifecycleGateDecision:
    issues = _manifest_consistency_issues(observation)
    revalidation_targets: set[str] = set()
    replanning_seeds: set[str] = set()
    actions: set[str] = set()

    source = observation.source_decision
    if source.state is DriftState.DRIFTED:
        issues.append("canonical-source-drift")
        for source_id in source.changed_source_item_ids:
            for mapping in observation.manifest.mappings:
                if mapping.source_id != source_id:
                    continue
                if mapping.phase_path:
                    revalidation_targets.add(f"phase-path:{mapping.phase_path}")
                revalidation_targets.update(
                    f"plan-path:{path}" for path in mapping.plan_paths if path
                )
                revalidation_targets.update(
                    f"evidence-path:{path}" for path in mapping.evidence_paths if path
                )
                replanning_seeds.add(mapping.phase_id)
        actions.update(("revalidate-source", "revalidate-mapping"))
        if replanning_seeds:
            actions.add("replan-affected-phases")

    if not observation.mapping_readiness.ready:
        issues.extend(issue.code for issue in observation.mapping_readiness.issues)
        actions.add("revalidate-mapping")

    phase_affected, phase_issues, phase_targets = _phase_changes(
        observation.phase_graph
    )
    if phase_affected:
        issues.extend(phase_issues)
        revalidation_targets.update(phase_targets)
        replanning_seeds.update(phase_affected)
        actions.update(("revalidate-mapping", "replan-affected-phases"))

    capability_issues, capability_targets = _capability_changes(
        observation.manifest.capabilities,
        observation.capabilities.capabilities,
    )
    if capability_issues:
        issues.extend(capability_issues)
        revalidation_targets.update(capability_targets)
        actions.add("reprobe-capabilities")

    if any(issue.startswith("manifest-") for issue in issues):
        actions.add("migrate-manifest")
    if any(issue.endswith("source-commit-mismatch") for issue in issues):
        actions.add("revalidate-source")

    replanning_targets = _downstream_phases(
        observation.phase_graph,
        replanning_seeds,
    )
    state = LifecycleGateState.DRIFTED if issues else LifecycleGateState.CLEAN
    return LifecycleGateDecision(
        operation=observation.operation,
        target_phase=observation.target_phase,
        mapping_operation=observation.mapping_operation,
        state=state,
        admitted=state is LifecycleGateState.CLEAN,
        issue_codes=_utf8_sorted(issues),
        changed_source_item_ids=_utf8_sorted(
            observation.source_decision.changed_source_item_ids
        ),
        revalidation_targets=_utf8_sorted(revalidation_targets),
        replanning_targets=_utf8_sorted(replanning_targets),
        next_action_codes=_utf8_sorted(actions),
        decision_identity=None,
        manifest_sha256=observation.manifest_sha256,
    )


def _unknown_decision(
    operation: object,
    target_phase: object,
    code: str,
) -> LifecycleGateDecision:
    return LifecycleGateDecision(
        operation=operation if isinstance(operation, LifecycleOperation) else None,
        target_phase=target_phase if type(target_phase) is str else None,
        mapping_operation=(
            _mapping_operation(operation)
            if isinstance(operation, LifecycleOperation)
            else None
        ),
        state=LifecycleGateState.UNKNOWN,
        admitted=False,
        issue_codes=(code,),
        changed_source_item_ids=(),
        revalidation_targets=(),
        replanning_targets=(),
        next_action_codes=(),
        decision_identity=None,
        manifest_sha256=None,
    )


def gate_lifecycle_operation(
    repository_root: Path,
    change_id: str,
    operation: LifecycleOperation,
    target_phase: str | None,
    *,
    boundary: LifecycleObservationBoundary,
    prior_decision_identity: str | None = None,
    limits: LifecycleGateLimits = DEFAULT_LIFECYCLE_GATE_LIMITS,
) -> LifecycleGateDecision:
    """Re-observe every input and return the sole lifecycle admission decision."""

    del prior_decision_identity  # Identity and replay handling are added by Task 2.
    observation = observe_lifecycle_operation(
        repository_root,
        change_id,
        operation,
        target_phase,
        boundary=boundary,
        limits=limits,
    )
    if isinstance(observation, Failure):
        return _unknown_decision(
            operation,
            target_phase,
            observation.issue.code,
        )
    return _decision_from_observation(observation.value)
