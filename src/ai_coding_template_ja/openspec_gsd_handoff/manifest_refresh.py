"""Complete read-only refresh previews for started schema-2 manifests."""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from collections.abc import Sequence
from dataclasses import dataclass, replace
from enum import StrEnum
from pathlib import Path, PurePosixPath

from .execution_mapping import (
    MappingOperation,
    PlanningInventory,
    build_manifest_mappings,
    read_planning_inventory,
    validate_mapping_readiness,
)
from .manifest import (
    MAX_MANIFEST_BYTES,
    ManifestArtifact,
    ManifestSizeLimitExceeded,
)
from .manifest_migration import (
    ManifestMigrationFileOperations,
    MigrationCleanupOutcome,
    _StagingCreationError,
)
from .manifest_v2 import (
    HandoffManifestV2,
    ManifestMapping,
    parse_manifest_v2_bytes,
    serialize_manifest_v2,
)
from .models import (
    ClassifiedIssue,
    Failure,
    HandoffState,
    IssueCategory,
    KnownState,
    Progress,
    Result,
    Success,
)
from .policy_reference import (
    PolicyReferenceRegistry,
    observe_policy_sections,
    read_policy_reference_registry,
)
from .preflight import COMMAND_TIMEOUT_SECONDS, CommandResult, subprocess_runner
from .progress import parse_task_progress
from .source_identity import (
    ExplicitSourceMatch,
    SourceCategory,
    SourceIdentityState,
    read_source_inventory,
    reconcile_source_items,
)

_HEX_40 = re.compile(r"[0-9a-f]{40}\Z")
_TARGET = re.compile(r"\.planning/openspec/([a-z0-9]+(?:-[a-z0-9]+)*)/handoff\.json\Z")
_EXPECTED_CREATED = tuple(f"SCN-{number:06d}" for number in range(37, 44))
_EXPECTED_UPDATED = ("REQ-000001", "SCN-000018")
_ASSIGNMENT_PATH = (
    "tests/fixtures/openspec_gsd_handoff/mapping/hardening-phase-assignments.json"
)
_POLICY_REGISTRY_PATH = "docs/agents/adaptive-change-execution.references.json"


@dataclass(frozen=True)
class RefreshLimits:
    """Independent completeness bounds for every preview byte surface."""

    target_bytes: int = MAX_MANIFEST_BYTES
    artifact_bytes: int = MAX_MANIFEST_BYTES
    candidate_bytes: int = MAX_MANIFEST_BYTES
    preview_bytes: int = MAX_MANIFEST_BYTES


DEFAULT_REFRESH_LIMITS = RefreshLimits()


@dataclass(frozen=True)
class RefreshCandidateChange:
    """One exact source-state difference in refresh approval evidence."""

    kind: str
    source_id: str
    category: SourceCategory
    source_path: str
    previous_fingerprint: str | None
    candidate_fingerprint: str
    reason: str


@dataclass(frozen=True)
class ProtectedSubtreeEvidence:
    """Canonical before/after hash equality for one protected subtree."""

    name: str
    previous_sha256: str
    candidate_sha256: str


@dataclass(frozen=True)
class ManifestRefreshPreview:
    """Immutable complete review evidence; it exposes no apply operation."""

    repository_root: str
    target_path: str
    observed_source_commit: str
    current_source_commit: str
    current_artifacts: tuple[ManifestArtifact, ...]
    current_progress: Progress
    source_paths: tuple[str, ...]
    planning_inventory: PlanningInventory
    policy_registry: PolicyReferenceRegistry
    explicit_matches: tuple[ExplicitSourceMatch, ...]
    old_target_sha256: str
    previous_artifacts_sha256: str
    current_artifacts_sha256: str
    previous_progress_sha256: str
    current_progress_sha256: str
    previous_source_items_sha256: str
    candidate_source_items_sha256: str
    previous_mappings_sha256: str
    candidate_mappings_sha256: str
    assignment_inventory_sha256: str
    policy_evidence_sha256: str
    previous_manifest: HandoffManifestV2
    previous_source_items: SourceIdentityState
    candidate_source_items: SourceIdentityState
    previous_mappings: tuple[ManifestMapping, ...]
    candidate_mappings: tuple[ManifestMapping, ...]
    candidate_bytes: bytes
    candidate_manifest: HandoffManifestV2
    candidate_sha256: str
    changes: tuple[RefreshCandidateChange, ...]
    exclusions: tuple[str, ...]
    protected_subtrees: tuple[ProtectedSubtreeEvidence, ...]
    no_op: bool
    preview_sha256: str


class RefreshFailurePoint(StrEnum):
    """Stable approval, guard, and persistence failure boundaries."""

    APPROVAL = "approval"
    STATE_GUARD = "state-guard"
    CREATE = "create"
    WRITE = "write"
    REREAD = "reread"
    VALIDATE = "validate"
    REPLACE = "replace"


class RefreshTargetState(StrEnum):
    """What a failed apply proved about the previewed schema-2 target."""

    V2_PRESERVED = "v2-preserved"
    UNKNOWN = "unknown"


class RefreshStagingState(StrEnum):
    """What a failed apply proved about its staging file."""

    ABSENT = "absent"
    UNKNOWN = "unknown"
    INVALID = "invalid"
    VALIDATED = "validated"


class RefreshCleanupOutcome(StrEnum):
    """Evidence from at most one staging cleanup attempt."""

    NOT_NEEDED = "not-needed"
    REMOVED = "removed"
    FAILED = "failed"


@dataclass(frozen=True)
class ManifestRefreshIssue:
    """Structured refresh failure evidence without a recovery claim."""

    code: str
    failure_point: RefreshFailurePoint
    target_state: RefreshTargetState
    staging_state: RefreshStagingState
    cleanup_outcome: RefreshCleanupOutcome


@dataclass(frozen=True)
class ManifestRefreshFailure:
    """A failed refresh apply with no partial success value."""

    issue: ManifestRefreshIssue


type ManifestRefreshResult = Success[HandoffManifestV2] | ManifestRefreshFailure


class ManifestRefreshFileOperations(ManifestMigrationFileOperations):
    """Refresh-specific durable no-follow filesystem boundary."""


def _failure(code: str, category: IssueCategory = IssueCategory.PERSISTENCE) -> Failure:
    return Failure(ClassifiedIssue(category, code, KnownState.UNKNOWN))


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _compact(value: object) -> bytes:
    return (
        json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n"
    ).encode()


def _valid_limits(limits: RefreshLimits) -> bool:
    return type(limits) is RefreshLimits and all(
        type(value) is int and value > 0
        for value in (
            limits.target_bytes,
            limits.artifact_bytes,
            limits.candidate_bytes,
            limits.preview_bytes,
        )
    )


def _canonical_relative_path(value: str) -> PurePosixPath | None:
    if not value or value.startswith("/") or "\\" in value or "\0" in value:
        return None
    path = PurePosixPath(value)
    if path.as_posix() != value or any(
        part in {"", ".", ".."} or unicodedata.normalize("NFC", part) != part
        for part in path.parts
    ):
        return None
    return path


def _read_bounded(
    repository: Path,
    relative: str,
    limit: int,
    operations: ManifestRefreshFileOperations,
) -> bytes:
    pure = _canonical_relative_path(relative)
    if pure is None:
        raise OSError("invalid relative path")
    anchor = operations.open_parent_directory(repository, Path())
    try:
        data = operations.read_repository_bytes_at(
            anchor,
            Path(*pure.parts),
            limit=limit,
        )
        if not operations.parent_directory_is_current(anchor, repository):
            raise OSError("repository identity changed")
        return data
    except ManifestSizeLimitExceeded as error:
        raise OverflowError from error
    finally:
        operations.close_parent_directory(anchor)


def _source_pin_matches(
    repository: Path,
    source_commit: str,
    artifact_bytes: dict[str, bytes],
    *,
    artifact_limit: int,
) -> bool:
    """Observe one historical commit and its exact canonical artifact blobs."""

    def git(
        *arguments: str,
        output_limit: int | None = None,
    ) -> CommandResult:
        return subprocess_runner(
            ("git", *arguments),
            cwd=repository,
            timeout=COMMAND_TIMEOUT_SECONDS,
            output_limit=output_limit,
        )

    if _HEX_40.fullmatch(source_commit) is None:
        return False
    commit = git("cat-file", "-e", f"{source_commit}^{{commit}}")
    if commit.return_code != 0:
        return False
    root = git("rev-parse", "--show-toplevel")
    if root.return_code != 0:
        return False
    try:
        observed_root = Path(root.stdout.decode("utf-8").strip()).resolve(strict=True)
    except (OSError, UnicodeDecodeError):
        return False
    if observed_root != repository:
        return False
    for path, expected in artifact_bytes.items():
        if _canonical_relative_path(path) is None:
            return False
        blob = git(
            "cat-file",
            "-p",
            f"{source_commit}:{path}",
            output_limit=artifact_limit,
        )
        if blob.return_code != 0 or blob.stdout != expected:
            return False
    return True


def _artifact_object(item: ManifestArtifact) -> dict[str, object]:
    return {"kind": item.kind, "path": item.path, "sha256": item.sha256}


def _progress_object(progress: Progress) -> dict[str, object]:
    return {
        "total": progress.total,
        "complete": progress.complete,
        "remaining": progress.remaining,
        "tasks": [
            {"id": item.id, "description": item.description, "done": item.done}
            for item in progress.tasks
        ],
    }


def _source_object(state: SourceIdentityState) -> dict[str, object]:
    return {
        "next_requirement_id": state.next_requirement_id,
        "next_scenario_id": state.next_scenario_id,
        "active": [
            {
                "id": item.id,
                "category": item.category.value,
                "source_path": item.source_path,
                "raw_heading": item.raw_heading,
                "parent_id": item.parent_id,
                "fingerprint": item.fingerprint,
            }
            for item in state.active
        ],
        "tombstones": [
            {
                "id": item.id,
                "category": item.category.value,
                "last_source_path": item.last_source_path,
                "last_raw_heading": item.last_raw_heading,
                "last_parent_id": item.last_parent_id,
                "fingerprint": item.fingerprint,
            }
            for item in state.tombstones
        ],
    }


def _mapping_object(item: ManifestMapping) -> dict[str, object]:
    return {
        "source_id": item.source_id,
        "phase_id": item.phase_id,
        "phase_path": item.phase_path,
        "plan_paths": list(item.plan_paths),
        "evidence_paths": list(item.evidence_paths),
        "policy_references": list(item.policy_references),
    }


def _inventory_object(inventory: PlanningInventory) -> dict[str, object]:
    return {
        "version": inventory.version,
        "change_id": inventory.change_id,
        "phases": [vars(item) for item in inventory.phases],
        "assignments": [
            {
                "change_id": item.change_id,
                "source_id": item.source_id,
                "phase_id": item.phase_id,
                "policy_references": list(item.policy_references),
            }
            for item in inventory.assignments
        ],
        "plans": [vars(item) for item in inventory.plans],
        "evidence": [vars(item) for item in inventory.evidence],
    }


def _explicit_match_object(item: ExplicitSourceMatch) -> dict[str, object]:
    parent = item.parent_locator
    return {
        "source_path": item.source_path,
        "normalized_heading": item.normalized_heading,
        "parent_locator": (
            None
            if parent is None
            else {
                "source_path": parent.source_path,
                "normalized_heading": parent.normalized_heading,
            }
        ),
        "source_id": item.source_id,
    }


def _policy_object(
    registry: PolicyReferenceRegistry, inventory: PlanningInventory
) -> dict[str, object]:
    return {
        "version": registry.version,
        "references": [vars(item) for item in registry.references],
        "observations": [vars(item) for item in inventory.policy_observations],
    }


def _normalized_inventory(inventory: PlanningInventory) -> PlanningInventory:
    """Normalize declaration order before candidate and approval binding."""

    return replace(
        inventory,
        phases=tuple(sorted(inventory.phases, key=lambda item: item.phase_id)),
        assignments=tuple(
            sorted(inventory.assignments, key=lambda item: item.source_id)
        ),
        plans=tuple(sorted(inventory.plans, key=lambda item: item.path.encode())),
        evidence=tuple(sorted(inventory.evidence, key=lambda item: item.path.encode())),
        policy_observations=tuple(
            sorted(
                inventory.policy_observations,
                key=lambda item: item.reference_id.encode(),
            )
        ),
    )


def _protected_objects(manifest: HandoffManifestV2) -> tuple[tuple[str, object], ...]:
    encoded = json.loads(serialize_manifest_v2(manifest).value)  # type: ignore[union-attr]
    return tuple(
        (name, encoded[name])
        for name in ("handoff_state", "capabilities", "ownership", "lifecycle")
    )


def _changes(
    previous: SourceIdentityState, candidate: SourceIdentityState
) -> tuple[RefreshCandidateChange, ...]:
    old = {item.id: item for item in previous.active}
    result: list[RefreshCandidateChange] = []
    for item in candidate.active:
        prior = old.get(item.id)
        if prior is None:
            result.append(
                RefreshCandidateChange(
                    "created",
                    item.id,
                    item.category,
                    item.source_path,
                    None,
                    item.fingerprint,
                    "new-source-identity",
                )
            )
        elif prior != item:
            result.append(
                RefreshCandidateChange(
                    "updated",
                    item.id,
                    item.category,
                    item.source_path,
                    prior.fingerprint,
                    item.fingerprint,
                    "source-content-changed",
                )
            )
    return tuple(
        sorted(result, key=lambda item: (item.kind != "created", item.source_id))
    )


def _machine_view(preview: ManifestRefreshPreview) -> dict[str, object]:
    return {
        "repository_root": preview.repository_root,
        "target_path": preview.target_path,
        "observed_source_commit": preview.observed_source_commit,
        "current_source_commit": preview.current_source_commit,
        "old_target_sha256": preview.old_target_sha256,
        "previous_artifacts": [
            _artifact_object(item) for item in preview.previous_manifest.artifacts
        ],
        "previous_artifacts_sha256": preview.previous_artifacts_sha256,
        "current_artifacts": [
            _artifact_object(item) for item in preview.current_artifacts
        ],
        "current_artifacts_sha256": preview.current_artifacts_sha256,
        "previous_progress": _progress_object(preview.previous_manifest.progress),
        "previous_progress_sha256": preview.previous_progress_sha256,
        "current_progress": _progress_object(preview.current_progress),
        "current_progress_sha256": preview.current_progress_sha256,
        "source_paths": list(preview.source_paths),
        "explicit_matches": [
            _explicit_match_object(item) for item in preview.explicit_matches
        ],
        "previous_source_items": _source_object(preview.previous_source_items),
        "previous_source_items_sha256": preview.previous_source_items_sha256,
        "candidate_source_items": _source_object(preview.candidate_source_items),
        "candidate_source_items_sha256": preview.candidate_source_items_sha256,
        "previous_mappings": [
            _mapping_object(item) for item in preview.previous_mappings
        ],
        "previous_mappings_sha256": preview.previous_mappings_sha256,
        "candidate_mappings": [
            _mapping_object(item) for item in preview.candidate_mappings
        ],
        "candidate_mappings_sha256": preview.candidate_mappings_sha256,
        "assignment_inventory": _inventory_object(preview.planning_inventory),
        "assignment_inventory_sha256": preview.assignment_inventory_sha256,
        "policy_evidence": _policy_object(
            preview.policy_registry, preview.planning_inventory
        ),
        "policy_evidence_sha256": preview.policy_evidence_sha256,
        "candidate_sha256": preview.candidate_sha256,
        "candidate_bytes_utf8": preview.candidate_bytes.decode(),
        "changes": [
            {
                "kind": item.kind,
                "source_id": item.source_id,
                "category": item.category.value,
                "source_path": item.source_path,
                "previous_fingerprint": item.previous_fingerprint,
                "candidate_fingerprint": item.candidate_fingerprint,
                "reason": item.reason,
            }
            for item in preview.changes
        ],
        "exclusions": list(preview.exclusions),
        "protected_subtrees": [vars(item) for item in preview.protected_subtrees],
        "no_op": preview.no_op,
    }


def serialize_manifest_refresh_preview(
    preview: ManifestRefreshPreview,
) -> Result[bytes]:
    """Serialize the exact fixed-order machine view without its digest field."""

    try:
        data = _compact(_machine_view(preview))
    except (AttributeError, TypeError, ValueError, UnicodeError):
        return _failure("refresh-preview-invalid")
    return Success(data)


def preview_manifest_refresh(
    repository_root: Path,
    target_path: Path,
    *,
    current_source_commit: str,
    current_artifacts: Sequence[ManifestArtifact],
    current_progress: Progress,
    source_paths: Sequence[str | Path],
    planning_inventory: PlanningInventory,
    policy_registry: PolicyReferenceRegistry,
    explicit_matches: Sequence[ExplicitSourceMatch] = (),
    limits: RefreshLimits = DEFAULT_REFRESH_LIMITS,
    operations: ManifestRefreshFileOperations | None = None,
) -> Result[ManifestRefreshPreview]:
    """Build a complete started-v2 candidate without any filesystem mutation."""

    filesystem = ManifestRefreshFileOperations() if operations is None else operations
    if not isinstance(filesystem, ManifestRefreshFileOperations):
        return _failure("refresh-input-invalid", IssueCategory.INPUT)
    if not _valid_limits(limits) or _HEX_40.fullmatch(current_source_commit) is None:
        return _failure("refresh-input-invalid", IssueCategory.INPUT)
    try:
        repository = repository_root.resolve(strict=True)
        if not repository.is_dir():
            raise OSError
        canonical_target = target_path.as_posix()
        match = _TARGET.fullmatch(canonical_target)
        if match is None:
            return _failure("refresh-target-path-invalid", IssueCategory.INPUT)
        target_bytes = _read_bounded(
            repository,
            canonical_target,
            limits.target_bytes,
            filesystem,
        )
    except OverflowError:
        return _failure("refresh-target-limit-exceeded")
    except (OSError, RuntimeError, ValueError):
        return _failure("refresh-target-unreadable")
    parsed = parse_manifest_v2_bytes(target_bytes)
    if isinstance(parsed, Failure) or parsed.value.change_id != match.group(1):
        return _failure("refresh-target-schema-invalid")
    previous = parsed.value
    if previous.handoff_state is not HandoffState.STARTED:
        return _failure("refresh-target-not-started")

    try:
        artifacts = tuple(current_artifacts)
        paths = tuple(sorted((str(path) for path in source_paths), key=str.encode))
        if isinstance(explicit_matches, (str, bytes)) or not all(
            isinstance(item, ExplicitSourceMatch) for item in explicit_matches
        ):
            raise TypeError
        matches = tuple(
            sorted(
                explicit_matches,
                key=lambda item: (
                    item.source_id,
                    item.source_path.encode(),
                    item.normalized_heading.encode(),
                ),
            )
        )
        normalized_inventory = _normalized_inventory(planning_inventory)
    except (AttributeError, TypeError, UnicodeError):
        return _failure("refresh-input-invalid", IssueCategory.INPUT)
    try:
        observed_artifacts: list[ManifestArtifact] = []
        artifact_bytes: dict[str, bytes] = {}
        for artifact in artifacts:
            data = _read_bounded(
                repository,
                artifact.path,
                limits.artifact_bytes,
                filesystem,
            )
            artifact_bytes[artifact.path] = data
            observed_artifacts.append(replace(artifact, sha256=_sha256(data)))
    except OverflowError:
        return _failure("refresh-artifact-limit-exceeded", IssueCategory.ARTIFACT)
    except (AttributeError, OSError, RuntimeError, ValueError):
        return _failure("refresh-artifact-unreadable", IssueCategory.ARTIFACT)
    if tuple(observed_artifacts) != artifacts:
        return _failure("refresh-artifact-hash-mismatch", IssueCategory.ARTIFACT)
    if not _source_pin_matches(
        repository,
        current_source_commit,
        artifact_bytes,
        artifact_limit=limits.artifact_bytes,
    ):
        return _failure("refresh-source-pin-invalid", IssueCategory.ARTIFACT)
    if tuple((item.kind, item.path) for item in artifacts) != tuple(
        (item.kind, item.path) for item in previous.artifacts
    ):
        return _failure("refresh-artifact-set-mismatch", IssueCategory.ARTIFACT)
    tasks = next((item for item in artifacts if item.kind == "tasks"), None)
    if tasks is None:
        return _failure("refresh-tasks-missing", IssueCategory.ARTIFACT)
    try:
        progress = parse_task_progress(artifact_bytes[tasks.path].decode("utf-8"))
    except UnicodeDecodeError:
        return _failure("refresh-tasks-utf8-invalid", IssueCategory.PROGRESS)
    if isinstance(progress, Failure) or progress.value != current_progress:
        return _failure("refresh-progress-mismatch", IssueCategory.PROGRESS)

    inventory = read_source_inventory(repository, paths)
    if isinstance(inventory, Failure):
        return _failure(f"refresh-{inventory.issue.code}", inventory.issue.category)
    reconciliation = reconcile_source_items(
        inventory.value, previous.source_items, explicit_matches=matches
    )
    if isinstance(reconciliation, Failure):
        return _failure(
            f"refresh-{reconciliation.issue.code}", reconciliation.issue.category
        )
    source_items = reconciliation.value.state
    changes = _changes(previous.source_items, source_items)
    if len(previous.source_items.active) == 42 and (
        len(source_items.active) != 49
        or source_items.tombstones
        or source_items.next_requirement_id != 7
        or source_items.next_scenario_id != 44
        or reconciliation.value.created != _EXPECTED_CREATED
        or reconciliation.value.updated != _EXPECTED_UPDATED
        or reconciliation.value.tombstoned
    ):
        return _failure("refresh-pinned-reconciliation-mismatch", IssueCategory.INPUT)
    if len(previous.source_items.active) not in {42, 49}:
        return _failure("refresh-canonical-snapshot-stale", IssueCategory.INPUT)

    mappings = build_manifest_mappings(
        source_items, normalized_inventory, policy_registry
    )
    if isinstance(mappings, Failure):
        return _failure(f"refresh-{mappings.issue.code}", mappings.issue.category)
    readiness = validate_mapping_readiness(
        repository,
        source_items,
        mappings.value,
        normalized_inventory,
        operation=MappingOperation.PLAN,
        target_phase_id="02",
    )
    if isinstance(readiness, Failure):
        return _failure(f"refresh-{readiness.issue.code}", readiness.issue.category)
    if not readiness.value.ready:
        return _failure("refresh-mapping-not-ready", IssueCategory.INPUT)

    candidate = replace(
        previous,
        artifacts=artifacts,
        source_commit=current_source_commit,
        progress=current_progress,
        source_items=source_items,
        mappings=mappings.value,
    )
    serialized = serialize_manifest_v2(candidate)
    if isinstance(serialized, Failure):
        return _failure("refresh-candidate-invalid")
    if len(serialized.value) > limits.candidate_bytes:
        return _failure("refresh-candidate-limit-exceeded")
    protected: list[ProtectedSubtreeEvidence] = []
    for (name, old_value), (_, new_value) in zip(
        _protected_objects(previous), _protected_objects(candidate), strict=True
    ):
        old_hash = _sha256(_compact(old_value))
        new_hash = _sha256(_compact(new_value))
        if old_hash != new_hash:
            return _failure("refresh-protected-subtree-changed")
        protected.append(ProtectedSubtreeEvidence(name, old_hash, new_hash))

    source_before = _compact(_source_object(previous.source_items))
    source_after = _compact(_source_object(source_items))
    mappings_before = _compact([_mapping_object(item) for item in previous.mappings])
    mappings_after = _compact([_mapping_object(item) for item in mappings.value])
    inventory_bytes = _compact(_inventory_object(normalized_inventory))
    policy_bytes = _compact(_policy_object(policy_registry, normalized_inventory))
    preview = ManifestRefreshPreview(
        repository_root=str(repository),
        target_path=canonical_target,
        observed_source_commit=previous.source_commit,
        current_source_commit=current_source_commit,
        current_artifacts=artifacts,
        current_progress=current_progress,
        source_paths=paths,
        planning_inventory=normalized_inventory,
        policy_registry=policy_registry,
        explicit_matches=matches,
        old_target_sha256=_sha256(target_bytes),
        previous_artifacts_sha256=_sha256(
            _compact([_artifact_object(item) for item in previous.artifacts])
        ),
        current_artifacts_sha256=_sha256(
            _compact([_artifact_object(item) for item in artifacts])
        ),
        previous_progress_sha256=_sha256(_compact(_progress_object(previous.progress))),
        current_progress_sha256=_sha256(_compact(_progress_object(current_progress))),
        previous_source_items_sha256=_sha256(source_before),
        candidate_source_items_sha256=_sha256(source_after),
        previous_mappings_sha256=_sha256(mappings_before),
        candidate_mappings_sha256=_sha256(mappings_after),
        assignment_inventory_sha256=_sha256(inventory_bytes),
        policy_evidence_sha256=_sha256(policy_bytes),
        previous_manifest=previous,
        previous_source_items=previous.source_items,
        candidate_source_items=source_items,
        previous_mappings=previous.mappings,
        candidate_mappings=mappings.value,
        candidate_bytes=serialized.value,
        candidate_manifest=candidate,
        candidate_sha256=_sha256(serialized.value),
        changes=changes,
        exclusions=reconciliation.value.exclusions,
        protected_subtrees=tuple(protected),
        no_op=serialized.value == target_bytes,
        preview_sha256="",
    )
    machine = serialize_manifest_refresh_preview(preview)
    if isinstance(machine, Failure) or len(machine.value) > limits.preview_bytes:
        return _failure("refresh-preview-limit-exceeded")

    # Reobserve all approval inputs. Any mixed snapshot is non-success.
    try:
        if (
            _read_bounded(
                repository,
                canonical_target,
                limits.target_bytes,
                filesystem,
            )
            != target_bytes
        ):
            return _failure("refresh-target-changed")
        for artifact in artifacts:
            if (
                _read_bounded(
                    repository,
                    artifact.path,
                    limits.artifact_bytes,
                    filesystem,
                )
                != artifact_bytes[artifact.path]
            ):
                return _failure("refresh-artifact-changed", IssueCategory.ARTIFACT)
    except (OSError, OverflowError, RuntimeError, ValueError):
        return _failure("refresh-reobservation-failed")
    second_inventory = read_source_inventory(repository, paths)
    if (
        isinstance(second_inventory, Failure)
        or second_inventory.value != inventory.value
    ):
        return _failure("refresh-source-changed", IssueCategory.ARTIFACT)
    if not _source_pin_matches(
        repository,
        current_source_commit,
        artifact_bytes,
        artifact_limit=limits.artifact_bytes,
    ):
        return _failure("refresh-source-pin-invalid", IssueCategory.ARTIFACT)
    return Success(replace(preview, preview_sha256=_sha256(machine.value)))


def _refresh_failure(
    code: str,
    failure_point: RefreshFailurePoint,
    target_state: RefreshTargetState,
    staging_state: RefreshStagingState,
    cleanup_outcome: RefreshCleanupOutcome = RefreshCleanupOutcome.NOT_NEEDED,
) -> ManifestRefreshFailure:
    return ManifestRefreshFailure(
        ManifestRefreshIssue(
            code=code,
            failure_point=failure_point,
            target_state=target_state,
            staging_state=staging_state,
            cleanup_outcome=cleanup_outcome,
        )
    )


def _preview_identity(preview: object) -> str | None:
    if type(preview) is not ManifestRefreshPreview:
        return None
    try:
        machine = serialize_manifest_refresh_preview(preview)
        parsed = parse_manifest_v2_bytes(preview.candidate_bytes)
        serialized = serialize_manifest_v2(preview.candidate_manifest)
        if (
            isinstance(machine, Failure)
            or isinstance(parsed, Failure)
            or parsed.value != preview.candidate_manifest
            or isinstance(serialized, Failure)
            or serialized.value != preview.candidate_bytes
            or _sha256(preview.candidate_bytes) != preview.candidate_sha256
            or _HEX_40.fullmatch(preview.observed_source_commit) is None
            or _HEX_40.fullmatch(preview.current_source_commit) is None
            or re.fullmatch(r"[0-9a-f]{64}", preview.old_target_sha256) is None
        ):
            return None
    except (AttributeError, TypeError, ValueError, UnicodeError, RecursionError):
        return None
    return _sha256(machine.value)


def _current_preview(
    preview: ManifestRefreshPreview,
    *,
    operations: ManifestRefreshFileOperations,
) -> Result[ManifestRefreshPreview]:
    repository = Path(preview.repository_root)
    registry = read_policy_reference_registry(repository, _POLICY_REGISTRY_PATH)
    if isinstance(registry, Failure) or registry.value != preview.policy_registry:
        return _failure("refresh-policy-changed", IssueCategory.INPUT)
    observations = observe_policy_sections(repository, registry.value)
    if isinstance(observations, Failure):
        return _failure("refresh-policy-changed", IssueCategory.INPUT)
    inventory = read_planning_inventory(
        repository,
        _ASSIGNMENT_PATH,
        policy_observations=observations.value,
    )
    if isinstance(inventory, Failure) or inventory.value != preview.planning_inventory:
        return _failure("refresh-assignment-changed", IssueCategory.INPUT)
    return preview_manifest_refresh(
        repository,
        Path(preview.target_path),
        current_source_commit=preview.current_source_commit,
        current_artifacts=preview.current_artifacts,
        current_progress=preview.current_progress,
        source_paths=preview.source_paths,
        planning_inventory=inventory.value,
        policy_registry=registry.value,
        explicit_matches=preview.explicit_matches,
        operations=operations,
    )


def _cleanup_staging(
    operations: ManifestRefreshFileOperations,
    parent_descriptor: int,
    staging_name: str,
) -> RefreshCleanupOutcome:
    try:
        operations.unlink_at(parent_descriptor, staging_name)
    except OSError:
        return RefreshCleanupOutcome.FAILED
    return RefreshCleanupOutcome.REMOVED


def _observe_target_state(
    operations: ManifestRefreshFileOperations,
    parent_descriptor: int,
    target_name: str,
    expected_sha256: str,
) -> RefreshTargetState:
    try:
        target_bytes = operations.read_bounded_bytes_at(
            parent_descriptor,
            target_name,
        )
    except (ManifestSizeLimitExceeded, OSError):
        return RefreshTargetState.UNKNOWN
    return (
        RefreshTargetState.V2_PRESERVED
        if _sha256(target_bytes) == expected_sha256
        else RefreshTargetState.UNKNOWN
    )


def _failure_after_staging(
    code: str,
    failure_point: RefreshFailurePoint,
    staging_state: RefreshStagingState,
    *,
    operations: ManifestRefreshFileOperations,
    parent_descriptor: int,
    target_name: str,
    expected_sha256: str,
    staging_name: str | None,
) -> ManifestRefreshFailure:
    cleanup = (
        RefreshCleanupOutcome.NOT_NEEDED
        if staging_name is None
        else _cleanup_staging(operations, parent_descriptor, staging_name)
    )
    return _refresh_failure(
        code,
        failure_point,
        _observe_target_state(
            operations,
            parent_descriptor,
            target_name,
            expected_sha256,
        ),
        staging_state,
        cleanup,
    )


def _staging_name_is_safe(staging_name: str, target_name: str) -> bool:
    return (
        staging_name != target_name
        and Path(staging_name).name == staging_name
        and staging_name.startswith(".handoff.")
        and staging_name.endswith(".tmp")
    )


def apply_manifest_refresh(
    preview: ManifestRefreshPreview,
    *,
    approved_preview_sha256: str,
    approved: bool,
    operations: ManifestRefreshFileOperations | None = None,
) -> ManifestRefreshResult:
    """Apply only one exact freshly approved refresh preview."""

    filesystem = ManifestRefreshFileOperations() if operations is None else operations
    if not isinstance(filesystem, ManifestRefreshFileOperations):
        return _refresh_failure(
            "refresh-operations-invalid",
            RefreshFailurePoint.STATE_GUARD,
            RefreshTargetState.UNKNOWN,
            RefreshStagingState.ABSENT,
        )
    preview_identity = _preview_identity(preview)
    if preview_identity is None or not isinstance(preview, ManifestRefreshPreview):
        return _refresh_failure(
            "refresh-preview-invalid",
            RefreshFailurePoint.STATE_GUARD,
            RefreshTargetState.UNKNOWN,
            RefreshStagingState.ABSENT,
        )
    if (
        approved is not True
        or approved_preview_sha256 != preview.preview_sha256
        or preview.preview_sha256 != preview_identity
    ):
        return _refresh_failure(
            "refresh-approval-rejected",
            RefreshFailurePoint.APPROVAL,
            RefreshTargetState.UNKNOWN,
            RefreshStagingState.ABSENT,
        )
    try:
        repository = Path(preview.repository_root).resolve(strict=True)
    except (OSError, RuntimeError):
        return _refresh_failure(
            "refresh-repository-unreadable",
            RefreshFailurePoint.STATE_GUARD,
            RefreshTargetState.UNKNOWN,
            RefreshStagingState.ABSENT,
        )
    target_match = _TARGET.fullmatch(preview.target_path)
    if (
        str(repository) != preview.repository_root
        or not repository.is_dir()
        or target_match is None
        or target_match.group(1) != preview.candidate_manifest.change_id
    ):
        return _refresh_failure(
            "refresh-preview-target-mismatch",
            RefreshFailurePoint.STATE_GUARD,
            RefreshTargetState.UNKNOWN,
            RefreshStagingState.ABSENT,
        )
    current = _current_preview(preview, operations=filesystem)
    if isinstance(current, Failure) or current.value != preview:
        return _refresh_failure(
            "refresh-current-snapshot-changed",
            RefreshFailurePoint.STATE_GUARD,
            RefreshTargetState.UNKNOWN,
            RefreshStagingState.ABSENT,
        )

    try:
        repository_anchor = filesystem.open_parent_directory(repository, Path())
    except OSError:
        return _refresh_failure(
            "refresh-repository-open-failed",
            RefreshFailurePoint.STATE_GUARD,
            RefreshTargetState.UNKNOWN,
            RefreshStagingState.ABSENT,
        )
    target_anchor = None
    try:
        try:
            target_anchor = filesystem.open_directory_at(
                repository_anchor,
                Path(preview.target_path).parent,
                repository,
            )
        except OSError:
            return _refresh_failure(
                "refresh-target-parent-open-failed",
                RefreshFailurePoint.STATE_GUARD,
                RefreshTargetState.UNKNOWN,
                RefreshStagingState.ABSENT,
            )
        target_name = Path(preview.target_path).name
        try:
            target_bytes = filesystem.read_bounded_bytes_at(
                target_anchor.descriptor,
                target_name,
            )
        except (ManifestSizeLimitExceeded, OSError):
            return _refresh_failure(
                "refresh-target-reread-failed",
                RefreshFailurePoint.STATE_GUARD,
                RefreshTargetState.UNKNOWN,
                RefreshStagingState.ABSENT,
            )
        if _sha256(target_bytes) != preview.old_target_sha256:
            return _refresh_failure(
                "refresh-target-changed",
                RefreshFailurePoint.STATE_GUARD,
                RefreshTargetState.UNKNOWN,
                RefreshStagingState.ABSENT,
            )
        if preview.no_op:
            return Success(preview.candidate_manifest)

        try:
            staging_name = filesystem.create_staging_at(
                target_anchor.descriptor,
                target_anchor.path,
            )
        except _StagingCreationError as error:
            cleanup = RefreshCleanupOutcome(error.cleanup_outcome.value)
            return _refresh_failure(
                "refresh-staging-create-failed",
                RefreshFailurePoint.CREATE,
                _observe_target_state(
                    filesystem,
                    target_anchor.descriptor,
                    target_name,
                    preview.old_target_sha256,
                ),
                (
                    RefreshStagingState.ABSENT
                    if error.cleanup_outcome is MigrationCleanupOutcome.REMOVED
                    else RefreshStagingState.UNKNOWN
                ),
                cleanup,
            )
        except OSError:
            return _failure_after_staging(
                "refresh-staging-create-failed",
                RefreshFailurePoint.CREATE,
                RefreshStagingState.UNKNOWN,
                operations=filesystem,
                parent_descriptor=target_anchor.descriptor,
                target_name=target_name,
                expected_sha256=preview.old_target_sha256,
                staging_name=None,
            )
        if not _staging_name_is_safe(staging_name, target_name):
            return _failure_after_staging(
                "refresh-staging-path-unsafe",
                RefreshFailurePoint.CREATE,
                RefreshStagingState.UNKNOWN,
                operations=filesystem,
                parent_descriptor=target_anchor.descriptor,
                target_name=target_name,
                expected_sha256=preview.old_target_sha256,
                staging_name=staging_name,
            )
        try:
            filesystem.write_bytes_at(
                target_anchor.descriptor,
                staging_name,
                preview.candidate_bytes,
            )
        except (ManifestSizeLimitExceeded, OSError):
            return _failure_after_staging(
                "refresh-staging-write-failed",
                RefreshFailurePoint.WRITE,
                RefreshStagingState.UNKNOWN,
                operations=filesystem,
                parent_descriptor=target_anchor.descriptor,
                target_name=target_name,
                expected_sha256=preview.old_target_sha256,
                staging_name=staging_name,
            )
        try:
            staged_bytes = filesystem.read_bounded_bytes_at(
                target_anchor.descriptor,
                staging_name,
            )
        except (ManifestSizeLimitExceeded, OSError):
            return _failure_after_staging(
                "refresh-staging-reread-failed",
                RefreshFailurePoint.REREAD,
                RefreshStagingState.UNKNOWN,
                operations=filesystem,
                parent_descriptor=target_anchor.descriptor,
                target_name=target_name,
                expected_sha256=preview.old_target_sha256,
                staging_name=staging_name,
            )
        staged = parse_manifest_v2_bytes(staged_bytes)
        if (
            staged_bytes != preview.candidate_bytes
            or isinstance(staged, Failure)
            or staged.value != preview.candidate_manifest
        ):
            return _failure_after_staging(
                "refresh-staging-validation-failed",
                RefreshFailurePoint.VALIDATE,
                RefreshStagingState.INVALID,
                operations=filesystem,
                parent_descriptor=target_anchor.descriptor,
                target_name=target_name,
                expected_sha256=preview.old_target_sha256,
                staging_name=staging_name,
            )

        try:
            filesystem.before_replace_at(
                target_anchor.descriptor,
                target_anchor.path,
                staging_name,
                target_name,
            )
        except OSError:
            return _failure_after_staging(
                "refresh-replace-guard-failed",
                RefreshFailurePoint.STATE_GUARD,
                RefreshStagingState.VALIDATED,
                operations=filesystem,
                parent_descriptor=target_anchor.descriptor,
                target_name=target_name,
                expected_sha256=preview.old_target_sha256,
                staging_name=staging_name,
            )
        current_at_replace = _current_preview(preview, operations=filesystem)
        try:
            target_at_replace = filesystem.read_bounded_bytes_at(
                target_anchor.descriptor,
                target_name,
            )
        except (ManifestSizeLimitExceeded, OSError):
            target_at_replace = b""
        if (
            isinstance(current_at_replace, Failure)
            or current_at_replace.value != preview
            or not filesystem.parent_directory_is_current(
                repository_anchor,
                repository,
            )
            or not filesystem.parent_directory_is_current(target_anchor, repository)
            or _sha256(target_at_replace) != preview.old_target_sha256
        ):
            return _failure_after_staging(
                "refresh-state-changed-before-replace",
                RefreshFailurePoint.STATE_GUARD,
                RefreshStagingState.VALIDATED,
                operations=filesystem,
                parent_descriptor=target_anchor.descriptor,
                target_name=target_name,
                expected_sha256=preview.old_target_sha256,
                staging_name=staging_name,
            )
        try:
            filesystem.replace_at(
                target_anchor.descriptor,
                staging_name,
                target_name,
            )
        except OSError:
            return _failure_after_staging(
                "refresh-replace-failed",
                RefreshFailurePoint.REPLACE,
                RefreshStagingState.VALIDATED,
                operations=filesystem,
                parent_descriptor=target_anchor.descriptor,
                target_name=target_name,
                expected_sha256=preview.old_target_sha256,
                staging_name=staging_name,
            )
        try:
            installed_bytes = filesystem.read_bounded_bytes_at(
                target_anchor.descriptor,
                target_name,
            )
        except (ManifestSizeLimitExceeded, OSError):
            return _refresh_failure(
                "refresh-replaced-target-reread-failed",
                RefreshFailurePoint.REREAD,
                RefreshTargetState.UNKNOWN,
                RefreshStagingState.ABSENT,
            )
        installed = parse_manifest_v2_bytes(installed_bytes)
        if (
            installed_bytes != preview.candidate_bytes
            or isinstance(installed, Failure)
            or installed.value != preview.candidate_manifest
        ):
            return _refresh_failure(
                "refresh-replaced-target-validation-failed",
                RefreshFailurePoint.VALIDATE,
                RefreshTargetState.UNKNOWN,
                RefreshStagingState.ABSENT,
            )
        return Success(preview.candidate_manifest)
    finally:
        if target_anchor is not None:
            try:
                filesystem.close_parent_directory(target_anchor)
            except OSError:
                pass
        try:
            filesystem.close_parent_directory(repository_anchor)
        except OSError:
            pass
