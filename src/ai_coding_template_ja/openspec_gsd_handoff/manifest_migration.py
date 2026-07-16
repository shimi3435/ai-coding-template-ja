"""Read-only, source-bound manifest migration previews."""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from .manifest import (
    HandoffManifest,
    ManifestArtifact,
    ManifestFileOperations,
    ManifestRepository,
    ManifestSizeLimitExceeded,
)
from .manifest_v2 import (
    HandoffManifestV2,
    ManifestLifecycle,
    ManifestOwnership,
    serialize_manifest_v2,
)
from .models import (
    ArtifactClaim,
    ArtifactKind,
    ClassifiedIssue,
    Failure,
    IssueCategory,
    KnownState,
    Progress,
    Result,
    Success,
)
from .reader import read_canonical_artifacts
from .source_identity import (
    DEFAULT_SOURCE_IDENTITY_LIMITS,
    ExplicitSourceMatch,
    SourceCategory,
    SourceIdentityLimits,
    SourceIdentityState,
    SourceInventory,
    SourceReconciliation,
    read_source_inventory,
    reconcile_source_items,
)
from .versioned_manifest import parse_versioned_manifest_bytes

_CHANGE_ID = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")
_EMPTY_SOURCE_ITEMS = SourceIdentityState(
    next_requirement_id=1,
    next_scenario_id=1,
    active=(),
    tombstones=(),
)


@dataclass(frozen=True)
class MigrationCandidateChange:
    """One stable source-state change included in approval evidence."""

    kind: str
    source_id: str
    category: SourceCategory
    source_path: str
    previous_fingerprint: str | None
    candidate_fingerprint: str
    reason: str


@dataclass(frozen=True)
class ManifestMigrationPreview:
    """Complete immutable evidence for one schema-1 to schema-2 candidate."""

    repository_root: str
    target_path: str
    observed_source_commit: str
    current_source_commit: str
    current_artifacts: tuple[ManifestArtifact, ...]
    current_progress: Progress
    source_paths: tuple[str, ...]
    current_artifacts_sha256: str
    current_progress_sha256: str
    v1_sha256: str
    v2_sha256: str
    candidate_bytes: bytes
    candidate_manifest: HandoffManifestV2
    changes: tuple[MigrationCandidateChange, ...]
    exclusions: tuple[str, ...]
    preview_sha256: str


def _failure(code: str, *, category: IssueCategory = IssueCategory.PERSISTENCE):
    return Failure(
        ClassifiedIssue(
            category=category,
            code=code,
            known_state=KnownState.UNKNOWN,
        )
    )


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _compact_json(value: object) -> bytes:
    return (
        json.dumps(
            value,
            ensure_ascii=False,
            separators=(",", ":"),
        )
        + "\n"
    ).encode()


def _artifact_object(artifact: ManifestArtifact) -> dict[str, str]:
    return {
        "kind": artifact.kind,
        "path": artifact.path,
        "sha256": artifact.sha256,
    }


def _progress_object(progress: Progress) -> dict[str, object]:
    return {
        "total": progress.total,
        "complete": progress.complete,
        "remaining": progress.remaining,
        "tasks": [
            {
                "id": task.id,
                "description": task.description,
                "done": task.done,
            }
            for task in progress.tasks
        ],
    }


def _change_object(change: MigrationCandidateChange) -> dict[str, object]:
    return {
        "kind": change.kind,
        "source_id": change.source_id,
        "category": change.category.value,
        "source_path": change.source_path,
        "previous_fingerprint": change.previous_fingerprint,
        "candidate_fingerprint": change.candidate_fingerprint,
        "reason": change.reason,
    }


def _resolve_target(
    repository_root: Path,
    target_path: Path,
    *,
    operations: ManifestFileOperations,
) -> Result[tuple[Path, str, str]]:
    try:
        repository = repository_root.resolve(strict=True)
    except OSError:
        return _failure("migration-repository-unreadable", category=IssueCategory.INPUT)
    if not repository.is_dir():
        return _failure("migration-repository-invalid", category=IssueCategory.INPUT)

    raw_target = str(target_path)
    if (
        not raw_target
        or target_path.is_absolute()
        or "\\" in raw_target
        or "\0" in raw_target
        or raw_target != unicodedata.normalize("NFC", raw_target)
    ):
        return _failure("migration-target-invalid", category=IssueCategory.INPUT)
    parts = target_path.parts
    if (
        len(parts) != 4
        or parts[:2] != (".planning", "openspec")
        or _CHANGE_ID.fullmatch(parts[2]) is None
        or parts[3] != "handoff.json"
        or any(part in {"", ".", ".."} for part in parts)
    ):
        return _failure("migration-target-invalid", category=IssueCategory.INPUT)
    logical_target = repository.joinpath(*parts)
    target_guard = ManifestRepository(logical_target, operations=operations)
    if not target_guard._target_parent_is_safe(parts[2]):
        return _failure("manifest-target-unsafe")
    return Success((repository, target_path.as_posix(), parts[2]))


def _read_artifact_snapshot(
    repository: Path,
    change_id: str,
    artifacts: Sequence[ManifestArtifact],
) -> Result[tuple[ManifestArtifact, ...]]:
    try:
        claims = tuple(
            ArtifactClaim(
                kind=ArtifactKind(artifact.kind),
                path=Path(artifact.path),
            )
            for artifact in artifacts
        )
    except ValueError:
        return _failure("migration-artifact-snapshot-invalid")
    observed = read_canonical_artifacts(repository, change_id, claims)
    if isinstance(observed, Failure):
        return observed
    return Success(
        tuple(
            ManifestArtifact(
                kind=artifact.kind.value,
                path=artifact.path,
                sha256=artifact.sha256,
            )
            for artifact in observed.value
        )
    )


def _validate_source_snapshot(
    repository: Path,
    source_paths: Sequence[str],
    artifacts: Sequence[ManifestArtifact],
    *,
    change_id: str,
    limits: SourceIdentityLimits,
) -> Result[SourceInventory]:
    first_artifacts = _read_artifact_snapshot(repository, change_id, artifacts)
    if isinstance(first_artifacts, Failure):
        return first_artifacts
    if first_artifacts.value != tuple(artifacts):
        return _failure("migration-artifact-snapshot-mismatch")
    inventory = read_source_inventory(repository, source_paths, limits=limits)
    if isinstance(inventory, Failure):
        return inventory
    confirmed_inventory = read_source_inventory(repository, source_paths, limits=limits)
    if isinstance(confirmed_inventory, Failure):
        return confirmed_inventory
    confirmed_artifacts = _read_artifact_snapshot(
        repository,
        change_id,
        artifacts,
    )
    if isinstance(confirmed_artifacts, Failure):
        return confirmed_artifacts
    if (
        confirmed_inventory.value != inventory.value
        or confirmed_artifacts.value != first_artifacts.value
    ):
        return _failure("migration-source-changed-during-preview")

    spec_paths = {artifact.path for artifact in artifacts if artifact.kind == "spec"}
    if spec_paths != set(source_paths):
        return _failure("migration-source-snapshot-mismatch")
    return inventory


def _candidate_changes(
    reconciliation: SourceReconciliation,
    previous: SourceIdentityState,
) -> tuple[MigrationCandidateChange, ...]:
    previous_active = {item.id: item for item in previous.active}
    candidate_active = {item.id: item for item in reconciliation.state.active}
    candidate_tombstones = {item.id: item for item in reconciliation.state.tombstones}
    changes: list[MigrationCandidateChange] = []
    for source_id in reconciliation.created:
        current = candidate_active[source_id]
        changes.append(
            MigrationCandidateChange(
                kind="created",
                source_id=source_id,
                category=current.category,
                source_path=current.source_path,
                previous_fingerprint=None,
                candidate_fingerprint=current.fingerprint,
                reason="source-identity-allocated",
            )
        )
    for source_id in reconciliation.updated:
        prior = previous_active[source_id]
        current = candidate_active[source_id]
        changes.append(
            MigrationCandidateChange(
                kind="updated",
                source_id=source_id,
                category=current.category,
                source_path=current.source_path,
                previous_fingerprint=prior.fingerprint,
                candidate_fingerprint=current.fingerprint,
                reason="source-observation-updated",
            )
        )
    for source_id in reconciliation.tombstoned:
        prior = previous_active[source_id]
        current = candidate_tombstones[source_id]
        changes.append(
            MigrationCandidateChange(
                kind="tombstoned",
                source_id=source_id,
                category=current.category,
                source_path=current.last_source_path,
                previous_fingerprint=prior.fingerprint,
                candidate_fingerprint=current.fingerprint,
                reason="source-observation-removed",
            )
        )
    return tuple(
        sorted(
            changes,
            key=lambda change: (
                change.source_id.encode(),
                change.kind.encode(),
            ),
        )
    )


def preview_manifest_migration(
    repository_root: Path,
    target_path: Path,
    *,
    current_source_commit: str,
    current_artifacts: Sequence[ManifestArtifact],
    current_progress: Progress,
    source_paths: Sequence[str | Path],
    previous_source_items: SourceIdentityState | None = None,
    explicit_matches: Sequence[ExplicitSourceMatch] = (),
    requested_schema_version: int = 2,
    limits: SourceIdentityLimits = DEFAULT_SOURCE_IDENTITY_LIMITS,
    operations: ManifestFileOperations | None = None,
) -> Result[ManifestMigrationPreview]:
    """Build complete approval evidence without creating or changing any path."""

    filesystem = operations or ManifestFileOperations()
    resolved = _resolve_target(
        repository_root,
        target_path,
        operations=filesystem,
    )
    if isinstance(resolved, Failure):
        return resolved
    repository, canonical_target, target_change_id = resolved.value
    target = repository.joinpath(*Path(canonical_target).parts)
    try:
        v1_bytes = filesystem.read_bounded_bytes(target)
    except ManifestSizeLimitExceeded:
        return _failure("manifest-size-limit-exceeded")
    except OSError:
        return _failure("manifest-read-failed")

    parsed = parse_versioned_manifest_bytes(
        v1_bytes,
        requested_schema_version=requested_schema_version,
    )
    if isinstance(parsed, Failure):
        return parsed
    if not isinstance(parsed.value, HandoffManifest):
        return _failure("migration-source-schema-invalid")
    if requested_schema_version != 2:
        return _failure("migration-target-schema-invalid", category=IssueCategory.INPUT)
    source_manifest = parsed.value
    if source_manifest.change_id != target_change_id:
        return _failure("migration-target-change-mismatch")

    artifacts = tuple(current_artifacts)
    canonical_source_paths = tuple(str(path) for path in source_paths)
    source_snapshot = _validate_source_snapshot(
        repository,
        canonical_source_paths,
        artifacts,
        change_id=source_manifest.change_id,
        limits=limits,
    )
    if isinstance(source_snapshot, Failure):
        return source_snapshot
    previous = previous_source_items or _EMPTY_SOURCE_ITEMS
    reconciliation = reconcile_source_items(
        source_snapshot.value,
        previous,
        explicit_matches=explicit_matches,
    )
    if isinstance(reconciliation, Failure):
        return reconciliation

    candidate = HandoffManifestV2(
        schema_version=2,
        change_id=source_manifest.change_id,
        handoff_state=source_manifest.handoff_state,
        artifacts=artifacts,
        source_commit=current_source_commit,
        progress=current_progress,
        capabilities=source_manifest.capabilities,
        source_items=reconciliation.value.state,
        mappings=(),
        ownership=ManifestOwnership(owned=(), referenced=()),
        lifecycle=ManifestLifecycle(checkpoints=(), receipts=(), archives=()),
    )
    serialized = serialize_manifest_v2(candidate)
    if isinstance(serialized, Failure):
        return serialized
    v2_sha256 = _sha256(serialized.value)
    changes = _candidate_changes(reconciliation.value, previous)
    artifact_snapshot = [_artifact_object(artifact) for artifact in artifacts]
    progress_snapshot = _progress_object(current_progress)
    artifacts_sha256 = _sha256(_compact_json(artifact_snapshot))
    progress_sha256 = _sha256(_compact_json(progress_snapshot))
    machine_view = {
        "repository_root": str(repository),
        "target_path": canonical_target,
        "observed_source_commit": source_manifest.source_commit,
        "current_source_commit": current_source_commit,
        "v1_sha256": _sha256(v1_bytes),
        "current_artifacts_sha256": artifacts_sha256,
        "current_progress_sha256": progress_sha256,
        "source_paths": list(canonical_source_paths),
        "v2_sha256": v2_sha256,
        "changes": [_change_object(change) for change in changes],
        "exclusions": list(reconciliation.value.exclusions),
    }
    return Success(
        ManifestMigrationPreview(
            repository_root=str(repository),
            target_path=canonical_target,
            observed_source_commit=source_manifest.source_commit,
            current_source_commit=current_source_commit,
            current_artifacts=artifacts,
            current_progress=current_progress,
            source_paths=canonical_source_paths,
            current_artifacts_sha256=artifacts_sha256,
            current_progress_sha256=progress_sha256,
            v1_sha256=_sha256(v1_bytes),
            v2_sha256=v2_sha256,
            candidate_bytes=serialized.value,
            candidate_manifest=candidate,
            changes=changes,
            exclusions=reconciliation.value.exclusions,
            preview_sha256=_sha256(_compact_json(machine_view)),
        )
    )
