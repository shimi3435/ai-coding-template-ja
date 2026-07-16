"""Source-bound manifest migration preview and approved atomic apply."""

from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import stat
import unicodedata
from collections.abc import Sequence
from dataclasses import dataclass, replace
from enum import StrEnum
from pathlib import Path

from .manifest import (
    MAX_MANIFEST_BYTES,
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
    parse_manifest_v2_bytes,
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
from .progress import parse_task_progress
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


class MigrationFailurePoint(StrEnum):
    """Stable approval and persistence failure boundaries."""

    APPROVAL = "approval"
    STATE_GUARD = "state-guard"
    CREATE = "create"
    WRITE = "write"
    REREAD = "reread"
    VALIDATE = "validate"
    REPLACE = "replace"


class MigrationTargetState(StrEnum):
    """What a failed apply proved about the schema-1 target."""

    V1_PRESERVED = "v1-preserved"
    UNKNOWN = "unknown"


class MigrationStagingState(StrEnum):
    """What a failed apply proved about its staging file."""

    ABSENT = "absent"
    UNKNOWN = "unknown"
    INVALID = "invalid"
    VALIDATED = "validated"


class MigrationCleanupOutcome(StrEnum):
    """Evidence from at most one staging cleanup attempt."""

    NOT_NEEDED = "not-needed"
    REMOVED = "removed"
    FAILED = "failed"


@dataclass(frozen=True)
class ManifestMigrationIssue:
    """Structured migration failure evidence without a recovery claim."""

    code: str
    failure_point: MigrationFailurePoint
    target_state: MigrationTargetState
    staging_state: MigrationStagingState
    cleanup_outcome: MigrationCleanupOutcome


@dataclass(frozen=True)
class ManifestMigrationFailure:
    """A failed migration apply with no partial success value."""

    issue: ManifestMigrationIssue


type ManifestMigrationResult = Success[HandoffManifestV2] | ManifestMigrationFailure


@dataclass(frozen=True)
class _MigrationDirectoryAnchor:
    path: Path
    descriptor: int
    device: int
    inode: int


class ManifestMigrationFileOperations(ManifestFileOperations):
    """No-follow bounded reads and durable staging writes for migration apply."""

    @staticmethod
    def _open_flags(base: int) -> int:
        return base | getattr(os, "O_NOFOLLOW", 0)

    def read_bounded_bytes(
        self, path: Path, *, limit: int = MAX_MANIFEST_BYTES
    ) -> bytes:
        descriptor = os.open(path, self._open_flags(os.O_RDONLY))
        try:
            if not stat.S_ISREG(os.fstat(descriptor).st_mode):
                raise OSError("migration path is not a regular file")
            with os.fdopen(descriptor, "rb", closefd=False) as stream:
                data = stream.read(limit + 1)
        finally:
            os.close(descriptor)
        if len(data) > limit:
            raise ManifestSizeLimitExceeded
        return data

    def write_bytes(self, path: Path, data: bytes) -> None:
        if len(data) > MAX_MANIFEST_BYTES:
            raise ManifestSizeLimitExceeded
        descriptor = os.open(
            path,
            self._open_flags(os.O_WRONLY | os.O_TRUNC),
        )
        try:
            if not stat.S_ISREG(os.fstat(descriptor).st_mode):
                raise OSError("migration staging path is not a regular file")
            with os.fdopen(descriptor, "wb", closefd=False) as stream:
                stream.write(data)
                stream.flush()
                os.fsync(descriptor)
        finally:
            os.close(descriptor)

    def open_parent_directory(
        self,
        repository: Path,
        relative_parent: Path,
    ) -> _MigrationDirectoryAnchor:
        """Open one repository-owned parent without following path components."""

        directory_flags = self._open_flags(os.O_RDONLY | os.O_DIRECTORY)
        descriptor = os.open(repository, directory_flags)
        try:
            for component in relative_parent.parts:
                child = os.open(component, directory_flags, dir_fd=descriptor)
                os.close(descriptor)
                descriptor = child
            observed = os.fstat(descriptor)
            anchor = _MigrationDirectoryAnchor(
                path=repository.joinpath(*relative_parent.parts),
                descriptor=descriptor,
                device=observed.st_dev,
                inode=observed.st_ino,
            )
            if not self.parent_directory_is_current(anchor, repository):
                raise OSError("migration parent directory identity changed")
        except BaseException:
            os.close(descriptor)
            raise
        return anchor

    def close_parent_directory(self, anchor: _MigrationDirectoryAnchor) -> None:
        os.close(anchor.descriptor)

    def parent_directory_is_current(
        self,
        anchor: _MigrationDirectoryAnchor,
        repository: Path,
    ) -> bool:
        try:
            descriptor_state = os.fstat(anchor.descriptor)
            path_state = os.stat(anchor.path, follow_symlinks=False)
            resolved_parent = anchor.path.resolve(strict=True)
        except OSError:
            return False
        descriptor_identity = (descriptor_state.st_dev, descriptor_state.st_ino)
        path_identity = (path_state.st_dev, path_state.st_ino)
        return (
            stat.S_ISDIR(descriptor_state.st_mode)
            and stat.S_ISDIR(path_state.st_mode)
            and descriptor_identity == (anchor.device, anchor.inode)
            and path_identity == descriptor_identity
            and resolved_parent == anchor.path
            and resolved_parent.is_relative_to(repository)
        )

    def create_staging_at(
        self,
        parent_descriptor: int,
        parent: Path,
    ) -> str:
        del parent
        flags = self._open_flags(os.O_WRONLY | os.O_CREAT | os.O_EXCL)
        for _ in range(128):
            name = f".handoff.{secrets.token_hex(8)}.tmp"
            try:
                descriptor = os.open(
                    name,
                    flags,
                    0o600,
                    dir_fd=parent_descriptor,
                )
            except FileExistsError:
                continue
            try:
                if not stat.S_ISREG(os.fstat(descriptor).st_mode):
                    raise OSError("migration staging path is not a regular file")
            finally:
                os.close(descriptor)
            return name
        raise OSError("could not allocate migration staging file")

    def read_bounded_bytes_at(
        self,
        parent_descriptor: int,
        name: str,
        *,
        limit: int = MAX_MANIFEST_BYTES,
    ) -> bytes:
        descriptor = os.open(
            name,
            self._open_flags(os.O_RDONLY),
            dir_fd=parent_descriptor,
        )
        try:
            if not stat.S_ISREG(os.fstat(descriptor).st_mode):
                raise OSError("migration path is not a regular file")
            with os.fdopen(descriptor, "rb", closefd=False) as stream:
                data = stream.read(limit + 1)
        finally:
            os.close(descriptor)
        if len(data) > limit:
            raise ManifestSizeLimitExceeded
        return data

    def write_bytes_at(
        self,
        parent_descriptor: int,
        name: str,
        data: bytes,
    ) -> None:
        if len(data) > MAX_MANIFEST_BYTES:
            raise ManifestSizeLimitExceeded
        descriptor = os.open(
            name,
            self._open_flags(os.O_WRONLY | os.O_TRUNC),
            dir_fd=parent_descriptor,
        )
        try:
            if not stat.S_ISREG(os.fstat(descriptor).st_mode):
                raise OSError("migration staging path is not a regular file")
            with os.fdopen(descriptor, "wb", closefd=False) as stream:
                stream.write(data)
                stream.flush()
                os.fsync(descriptor)
        finally:
            os.close(descriptor)

    def before_replace_at(
        self,
        parent_descriptor: int,
        parent: Path,
        source_name: str,
        target_name: str,
    ) -> None:
        """Test seam immediately before the final directory identity guard."""

    def replace_at(
        self,
        parent_descriptor: int,
        source_name: str,
        target_name: str,
    ) -> None:
        os.replace(
            source_name,
            target_name,
            src_dir_fd=parent_descriptor,
            dst_dir_fd=parent_descriptor,
        )

    def unlink_at(self, parent_descriptor: int, name: str) -> None:
        os.unlink(name, dir_fd=parent_descriptor)


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


def _preview_machine_view(preview: ManifestMigrationPreview) -> dict[str, object]:
    return {
        "repository_root": preview.repository_root,
        "target_path": preview.target_path,
        "observed_source_commit": preview.observed_source_commit,
        "current_source_commit": preview.current_source_commit,
        "v1_sha256": preview.v1_sha256,
        "current_artifacts_sha256": preview.current_artifacts_sha256,
        "current_progress_sha256": preview.current_progress_sha256,
        "source_paths": list(preview.source_paths),
        "v2_sha256": preview.v2_sha256,
        "changes": [_change_object(change) for change in preview.changes],
        "exclusions": list(preview.exclusions),
    }


def _preview_identity(preview: ManifestMigrationPreview) -> str:
    return _sha256(_compact_json(_preview_machine_view(preview)))


def _migration_failure(
    code: str,
    failure_point: MigrationFailurePoint,
    target_state: MigrationTargetState,
    staging_state: MigrationStagingState,
    cleanup_outcome: MigrationCleanupOutcome = MigrationCleanupOutcome.NOT_NEEDED,
) -> ManifestMigrationFailure:
    return ManifestMigrationFailure(
        ManifestMigrationIssue(
            code=code,
            failure_point=failure_point,
            target_state=target_state,
            staging_state=staging_state,
            cleanup_outcome=cleanup_outcome,
        )
    )


def _preview_is_consistent(preview: ManifestMigrationPreview) -> bool:
    artifact_snapshot = [
        _artifact_object(artifact) for artifact in preview.current_artifacts
    ]
    progress_snapshot = _progress_object(preview.current_progress)
    if (
        _sha256(_compact_json(artifact_snapshot)) != preview.current_artifacts_sha256
        or _sha256(_compact_json(progress_snapshot)) != preview.current_progress_sha256
        or _sha256(preview.candidate_bytes) != preview.v2_sha256
        or preview.candidate_manifest.artifacts != preview.current_artifacts
        or preview.candidate_manifest.progress != preview.current_progress
        or preview.candidate_manifest.source_commit != preview.current_source_commit
    ):
        return False
    parsed = parse_manifest_v2_bytes(preview.candidate_bytes)
    if isinstance(parsed, Failure) or parsed.value != preview.candidate_manifest:
        return False
    serialized = serialize_manifest_v2(preview.candidate_manifest)
    return (
        isinstance(serialized, Success) and serialized.value == preview.candidate_bytes
    )


def _cleanup_staging_at(
    operations: ManifestMigrationFileOperations,
    parent_descriptor: int,
    staging_name: str,
) -> MigrationCleanupOutcome:
    try:
        operations.unlink_at(parent_descriptor, staging_name)
    except OSError:
        return MigrationCleanupOutcome.FAILED
    return MigrationCleanupOutcome.REMOVED


def _observe_target_state_at(
    operations: ManifestMigrationFileOperations,
    parent_descriptor: int,
    target_name: str,
    expected_v1_sha256: str,
) -> MigrationTargetState:
    try:
        target_bytes = operations.read_bounded_bytes_at(
            parent_descriptor,
            target_name,
        )
    except (ManifestSizeLimitExceeded, OSError):
        return MigrationTargetState.UNKNOWN
    if _sha256(target_bytes) == expected_v1_sha256:
        return MigrationTargetState.V1_PRESERVED
    return MigrationTargetState.UNKNOWN


def _observe_target_state_path(
    operations: ManifestMigrationFileOperations,
    target: Path,
    expected_v1_sha256: str,
) -> MigrationTargetState:
    try:
        target_bytes = operations.read_bounded_bytes(target)
    except (ManifestSizeLimitExceeded, OSError):
        return MigrationTargetState.UNKNOWN
    if _sha256(target_bytes) == expected_v1_sha256:
        return MigrationTargetState.V1_PRESERVED
    return MigrationTargetState.UNKNOWN


def _migration_failure_after_staging_at(
    code: str,
    failure_point: MigrationFailurePoint,
    staging_state: MigrationStagingState,
    *,
    operations: ManifestMigrationFileOperations,
    parent_descriptor: int,
    target_name: str,
    expected_v1_sha256: str,
    staging_name: str | None,
) -> ManifestMigrationFailure:
    cleanup = (
        MigrationCleanupOutcome.NOT_NEEDED
        if staging_name is None
        else _cleanup_staging_at(operations, parent_descriptor, staging_name)
    )
    return _migration_failure(
        code,
        failure_point,
        _observe_target_state_at(
            operations,
            parent_descriptor,
            target_name,
            expected_v1_sha256,
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
) -> Result[tuple[tuple[ManifestArtifact, ...], Progress]]:
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
    tasks = tuple(
        artifact for artifact in observed.value if artifact.kind is ArtifactKind.TASKS
    )
    if len(tasks) != 1:
        return _failure("migration-progress-snapshot-invalid")
    progress = parse_task_progress(tasks[0].content)
    if isinstance(progress, Failure):
        return progress
    return Success(
        (
            tuple(
                ManifestArtifact(
                    kind=artifact.kind.value,
                    path=artifact.path,
                    sha256=artifact.sha256,
                )
                for artifact in observed.value
            ),
            progress.value,
        )
    )


def _validate_source_snapshot(
    repository: Path,
    source_paths: Sequence[str],
    artifacts: Sequence[ManifestArtifact],
    progress: Progress,
    *,
    change_id: str,
    limits: SourceIdentityLimits,
) -> Result[SourceInventory]:
    first_artifacts = _read_artifact_snapshot(repository, change_id, artifacts)
    if isinstance(first_artifacts, Failure):
        return first_artifacts
    if first_artifacts.value[0] != tuple(artifacts):
        return _failure("migration-artifact-snapshot-mismatch")
    if first_artifacts.value[1] != progress:
        return _failure("migration-progress-snapshot-mismatch")
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
        current_progress,
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
    preview = ManifestMigrationPreview(
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
        preview_sha256="",
    )
    return Success(replace(preview, preview_sha256=_preview_identity(preview)))


def _apply_anchored_manifest_migration(
    preview: ManifestMigrationPreview,
    *,
    operations: ManifestMigrationFileOperations,
    anchor: _MigrationDirectoryAnchor,
    repository: Path,
    resolved_target: tuple[Path, str, str],
) -> ManifestMigrationResult:
    target_name = Path(preview.target_path).name
    try:
        anchored_target = operations.read_bounded_bytes_at(
            anchor.descriptor,
            target_name,
        )
    except (ManifestSizeLimitExceeded, OSError):
        return _migration_failure(
            "migration-target-reread-failed",
            MigrationFailurePoint.STATE_GUARD,
            MigrationTargetState.UNKNOWN,
            MigrationStagingState.ABSENT,
        )
    if _sha256(anchored_target) != preview.v1_sha256:
        return _migration_failure(
            "migration-target-changed",
            MigrationFailurePoint.STATE_GUARD,
            MigrationTargetState.UNKNOWN,
            MigrationStagingState.ABSENT,
        )

    try:
        staging_name = operations.create_staging_at(
            anchor.descriptor,
            anchor.path,
        )
    except OSError:
        return _migration_failure_after_staging_at(
            "migration-staging-create-failed",
            MigrationFailurePoint.CREATE,
            MigrationStagingState.UNKNOWN,
            operations=operations,
            parent_descriptor=anchor.descriptor,
            target_name=target_name,
            expected_v1_sha256=preview.v1_sha256,
            staging_name=None,
        )
    if not _staging_name_is_safe(staging_name, target_name):
        return _migration_failure_after_staging_at(
            "migration-staging-path-unsafe",
            MigrationFailurePoint.CREATE,
            MigrationStagingState.UNKNOWN,
            operations=operations,
            parent_descriptor=anchor.descriptor,
            target_name=target_name,
            expected_v1_sha256=preview.v1_sha256,
            staging_name=staging_name,
        )
    try:
        operations.write_bytes_at(
            anchor.descriptor,
            staging_name,
            preview.candidate_bytes,
        )
    except (ManifestSizeLimitExceeded, OSError):
        return _migration_failure_after_staging_at(
            "migration-staging-write-failed",
            MigrationFailurePoint.WRITE,
            MigrationStagingState.UNKNOWN,
            operations=operations,
            parent_descriptor=anchor.descriptor,
            target_name=target_name,
            expected_v1_sha256=preview.v1_sha256,
            staging_name=staging_name,
        )
    try:
        staged_bytes = operations.read_bounded_bytes_at(
            anchor.descriptor,
            staging_name,
        )
    except (ManifestSizeLimitExceeded, OSError):
        return _migration_failure_after_staging_at(
            "migration-staging-reread-failed",
            MigrationFailurePoint.REREAD,
            MigrationStagingState.UNKNOWN,
            operations=operations,
            parent_descriptor=anchor.descriptor,
            target_name=target_name,
            expected_v1_sha256=preview.v1_sha256,
            staging_name=staging_name,
        )
    staged = parse_manifest_v2_bytes(staged_bytes)
    if (
        staged_bytes != preview.candidate_bytes
        or isinstance(staged, Failure)
        or staged.value != preview.candidate_manifest
    ):
        return _migration_failure_after_staging_at(
            "migration-staging-validation-failed",
            MigrationFailurePoint.VALIDATE,
            MigrationStagingState.INVALID,
            operations=operations,
            parent_descriptor=anchor.descriptor,
            target_name=target_name,
            expected_v1_sha256=preview.v1_sha256,
            staging_name=staging_name,
        )

    confirmed = _resolve_target(
        repository,
        Path(preview.target_path),
        operations=operations,
    )
    snapshot_before_replace = _validate_source_snapshot(
        repository,
        preview.source_paths,
        preview.current_artifacts,
        preview.current_progress,
        change_id=preview.candidate_manifest.change_id,
        limits=DEFAULT_SOURCE_IDENTITY_LIMITS,
    )
    try:
        target_before_replace = operations.read_bounded_bytes_at(
            anchor.descriptor,
            target_name,
        )
    except (ManifestSizeLimitExceeded, OSError):
        target_before_replace = b""
    if (
        isinstance(confirmed, Failure)
        or confirmed.value != resolved_target
        or isinstance(snapshot_before_replace, Failure)
        or not operations.parent_directory_is_current(anchor, repository)
        or _sha256(target_before_replace) != preview.v1_sha256
    ):
        return _migration_failure_after_staging_at(
            "migration-state-changed-before-replace",
            MigrationFailurePoint.STATE_GUARD,
            MigrationStagingState.VALIDATED,
            operations=operations,
            parent_descriptor=anchor.descriptor,
            target_name=target_name,
            expected_v1_sha256=preview.v1_sha256,
            staging_name=staging_name,
        )

    try:
        operations.before_replace_at(
            anchor.descriptor,
            anchor.path,
            staging_name,
            target_name,
        )
    except OSError:
        return _migration_failure_after_staging_at(
            "migration-replace-guard-failed",
            MigrationFailurePoint.STATE_GUARD,
            MigrationStagingState.VALIDATED,
            operations=operations,
            parent_descriptor=anchor.descriptor,
            target_name=target_name,
            expected_v1_sha256=preview.v1_sha256,
            staging_name=staging_name,
        )
    confirmed_at_replace = _resolve_target(
        repository,
        Path(preview.target_path),
        operations=operations,
    )
    try:
        target_at_replace = operations.read_bounded_bytes_at(
            anchor.descriptor,
            target_name,
        )
    except (ManifestSizeLimitExceeded, OSError):
        target_at_replace = b""
    if (
        isinstance(confirmed_at_replace, Failure)
        or confirmed_at_replace.value != resolved_target
        or not operations.parent_directory_is_current(anchor, repository)
        or _sha256(target_at_replace) != preview.v1_sha256
    ):
        return _migration_failure_after_staging_at(
            "migration-target-parent-changed-before-replace",
            MigrationFailurePoint.STATE_GUARD,
            MigrationStagingState.VALIDATED,
            operations=operations,
            parent_descriptor=anchor.descriptor,
            target_name=target_name,
            expected_v1_sha256=preview.v1_sha256,
            staging_name=staging_name,
        )
    try:
        operations.replace_at(
            anchor.descriptor,
            staging_name,
            target_name,
        )
    except OSError:
        return _migration_failure_after_staging_at(
            "migration-replace-failed",
            MigrationFailurePoint.REPLACE,
            MigrationStagingState.VALIDATED,
            operations=operations,
            parent_descriptor=anchor.descriptor,
            target_name=target_name,
            expected_v1_sha256=preview.v1_sha256,
            staging_name=staging_name,
        )
    return Success(preview.candidate_manifest)


def apply_manifest_migration(
    preview: ManifestMigrationPreview,
    *,
    approved_preview_sha256: str,
    approved: bool,
    operations: ManifestMigrationFileOperations | None = None,
) -> ManifestMigrationResult:
    """Apply only the exact approved preview through validated atomic replacement."""

    filesystem = operations or ManifestMigrationFileOperations()
    if (
        approved is not True
        or approved_preview_sha256 != preview.preview_sha256
        or preview.preview_sha256 != _preview_identity(preview)
    ):
        return _migration_failure(
            "migration-approval-rejected",
            MigrationFailurePoint.APPROVAL,
            MigrationTargetState.UNKNOWN,
            MigrationStagingState.ABSENT,
        )
    if not _preview_is_consistent(preview):
        return _migration_failure(
            "migration-preview-invalid",
            MigrationFailurePoint.STATE_GUARD,
            MigrationTargetState.UNKNOWN,
            MigrationStagingState.ABSENT,
        )

    resolved = _resolve_target(
        Path(preview.repository_root),
        Path(preview.target_path),
        operations=filesystem,
    )
    if isinstance(resolved, Failure):
        return _migration_failure(
            resolved.issue.code,
            MigrationFailurePoint.STATE_GUARD,
            MigrationTargetState.UNKNOWN,
            MigrationStagingState.ABSENT,
        )
    repository, canonical_target, target_change_id = resolved.value
    if (
        str(repository) != preview.repository_root
        or canonical_target != preview.target_path
        or target_change_id != preview.candidate_manifest.change_id
    ):
        return _migration_failure(
            "migration-preview-target-mismatch",
            MigrationFailurePoint.STATE_GUARD,
            MigrationTargetState.UNKNOWN,
            MigrationStagingState.ABSENT,
        )
    target = repository.joinpath(*Path(canonical_target).parts)
    try:
        target_bytes = filesystem.read_bounded_bytes(target)
    except (ManifestSizeLimitExceeded, OSError):
        return _migration_failure(
            "migration-target-reread-failed",
            MigrationFailurePoint.STATE_GUARD,
            MigrationTargetState.UNKNOWN,
            MigrationStagingState.ABSENT,
        )
    if _sha256(target_bytes) != preview.v1_sha256:
        return _migration_failure(
            "migration-target-changed",
            MigrationFailurePoint.STATE_GUARD,
            MigrationTargetState.UNKNOWN,
            MigrationStagingState.ABSENT,
        )
    parsed_target = parse_versioned_manifest_bytes(
        target_bytes,
        requested_schema_version=2,
    )
    if (
        isinstance(parsed_target, Failure)
        or not isinstance(parsed_target.value, HandoffManifest)
        or parsed_target.value.change_id != target_change_id
        or parsed_target.value.source_commit != preview.observed_source_commit
    ):
        return _migration_failure(
            "migration-target-schema-changed",
            MigrationFailurePoint.STATE_GUARD,
            MigrationTargetState.UNKNOWN,
            MigrationStagingState.ABSENT,
        )

    source_snapshot = _validate_source_snapshot(
        repository,
        preview.source_paths,
        preview.current_artifacts,
        preview.current_progress,
        change_id=preview.candidate_manifest.change_id,
        limits=DEFAULT_SOURCE_IDENTITY_LIMITS,
    )
    if isinstance(source_snapshot, Failure):
        return _migration_failure(
            "migration-current-snapshot-changed",
            MigrationFailurePoint.STATE_GUARD,
            _observe_target_state_path(filesystem, target, preview.v1_sha256),
            MigrationStagingState.ABSENT,
        )
    confirmed = _resolve_target(
        repository,
        Path(preview.target_path),
        operations=filesystem,
    )
    if isinstance(confirmed, Failure) or confirmed.value != resolved.value:
        return _migration_failure(
            "migration-target-identity-changed",
            MigrationFailurePoint.STATE_GUARD,
            _observe_target_state_path(filesystem, target, preview.v1_sha256),
            MigrationStagingState.ABSENT,
        )

    try:
        anchor = filesystem.open_parent_directory(
            repository,
            Path(canonical_target).parent,
        )
    except OSError:
        return _migration_failure(
            "migration-target-parent-open-failed",
            MigrationFailurePoint.STATE_GUARD,
            _observe_target_state_path(filesystem, target, preview.v1_sha256),
            MigrationStagingState.ABSENT,
        )
    try:
        return _apply_anchored_manifest_migration(
            preview,
            operations=filesystem,
            anchor=anchor,
            repository=repository,
            resolved_target=resolved.value,
        )
    finally:
        filesystem.close_parent_directory(anchor)
