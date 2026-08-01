"""Source-bound manifest migration preview and approved atomic apply."""

from __future__ import annotations

import fcntl
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
    NormalizedTask,
    Progress,
    Result,
    Success,
)
from .progress import parse_task_progress
from .reader import DEFAULT_ARTIFACT_LIMITS
from .source_identity import (
    DEFAULT_SOURCE_IDENTITY_LIMITS,
    ExplicitSourceMatch,
    SourceCategory,
    SourceIdentityLimits,
    SourceIdentityState,
    SourceInventory,
    SourceReconciliation,
    reconcile_source_items,
    source_inventory_from_bytes,
    validate_source_identity_state,
)
from .versioned_manifest import parse_versioned_manifest_bytes

_CHANGE_ID = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")
_HEX_40 = re.compile(r"[0-9a-f]{40}\Z")
_HEX_64 = re.compile(r"[0-9a-f]{64}\Z")
_SOURCE_ID = re.compile(r"(?:REQ|SCN)-[0-9]{6}\Z")
_MAX_PREVIEW_ITEMS = 4096
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
    previous_source_items: SourceIdentityState
    explicit_matches: tuple[ExplicitSourceMatch, ...]
    source_context_sha256: str
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


@dataclass
class _WriterLockToken:
    """One operations-owned lock on an anchored change-directory inode."""

    descriptor: int
    device: int
    inode: int
    released: bool = False


class _ReplaceOutcome(StrEnum):
    """Conditional replacement outcomes that do not imply recovery."""

    REPLACED = "replaced"
    TARGET_CHANGED = "target-changed"
    LOCK_UNAVAILABLE = "lock-unavailable"


class _StagingCreationError(OSError):
    """A post-open staging failure with adapter-owned cleanup evidence."""

    def __init__(
        self,
        staging_name: str,
        cleanup_outcome: MigrationCleanupOutcome,
    ) -> None:
        super().__init__("migration staging creation failed after open")
        self.staging_name = staging_name
        self.cleanup_outcome = cleanup_outcome


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

    def open_directory_at(
        self,
        repository_anchor: _MigrationDirectoryAnchor,
        relative_path: Path,
        repository: Path,
    ) -> _MigrationDirectoryAnchor:
        """Open a repository child directory from an already anchored root."""

        descriptor = os.dup(repository_anchor.descriptor)
        directory_flags = self._open_flags(os.O_RDONLY | os.O_DIRECTORY)
        try:
            for component in relative_path.parts:
                child = os.open(component, directory_flags, dir_fd=descriptor)
                os.close(descriptor)
                descriptor = child
            observed = os.fstat(descriptor)
            anchor = _MigrationDirectoryAnchor(
                path=repository_anchor.path.joinpath(*relative_path.parts),
                descriptor=descriptor,
                device=observed.st_dev,
                inode=observed.st_ino,
            )
            if not self.parent_directory_is_current(anchor, repository):
                raise OSError("migration child directory identity changed")
        except BaseException:
            os.close(descriptor)
            raise
        return anchor

    def close_parent_directory(self, anchor: _MigrationDirectoryAnchor) -> None:
        os.close(anchor.descriptor)

    def acquire_writer_lock_at(
        self,
        anchor: _MigrationDirectoryAnchor,
        repository: Path,
    ) -> _WriterLockToken | None:
        """Take one non-blocking lock on the anchored change directory."""

        descriptor: int | None = None
        locked = False
        try:
            if not self.parent_directory_is_current(anchor, repository):
                return None
            descriptor = os.dup(anchor.descriptor)
            observed = os.fstat(descriptor)
            if not stat.S_ISDIR(observed.st_mode) or (
                observed.st_dev,
                observed.st_ino,
            ) != (anchor.device, anchor.inode):
                return None
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
            locked = True
            observed = os.fstat(descriptor)
            if (
                not stat.S_ISDIR(observed.st_mode)
                or (observed.st_dev, observed.st_ino) != (anchor.device, anchor.inode)
                or not self.parent_directory_is_current(anchor, repository)
            ):
                return None
            token = _WriterLockToken(
                descriptor=descriptor,
                device=observed.st_dev,
                inode=observed.st_ino,
            )
            tokens = getattr(self, "_writer_lock_tokens", None)
            if tokens is None:
                tokens = {}
                self._writer_lock_tokens = tokens
            tokens[id(token)] = token
            descriptor = None
            return token
        except (OSError, ValueError):
            return None
        finally:
            if descriptor is not None:
                if locked:
                    try:
                        fcntl.flock(descriptor, fcntl.LOCK_UN)
                    except OSError:
                        pass
                try:
                    os.close(descriptor)
                except OSError:
                    pass

    def release_writer_lock(self, token: _WriterLockToken) -> bool:
        """Unlock and close one live operations-owned token exactly once."""

        tokens = getattr(self, "_writer_lock_tokens", {})
        if (
            type(token) is not _WriterLockToken
            or token.released
            or tokens.get(id(token)) is not token
        ):
            return False
        tokens.pop(id(token), None)
        token.released = True
        descriptor = token.descriptor
        token.descriptor = -1
        succeeded = True
        try:
            fcntl.flock(descriptor, fcntl.LOCK_UN)
        except OSError:
            succeeded = False
        try:
            os.close(descriptor)
        except OSError:
            succeeded = False
        return succeeded

    def _writer_lock_is_live(
        self,
        token: _WriterLockToken,
        parent_descriptor: int,
    ) -> bool:
        tokens = getattr(self, "_writer_lock_tokens", {})
        if (
            type(token) is not _WriterLockToken
            or token.released
            or tokens.get(id(token)) is not token
        ):
            return False
        try:
            token_state = os.fstat(token.descriptor)
            parent_state = os.fstat(parent_descriptor)
        except OSError:
            return False
        identity = (token.device, token.inode)
        return (
            stat.S_ISDIR(token_state.st_mode)
            and stat.S_ISDIR(parent_state.st_mode)
            and (token_state.st_dev, token_state.st_ino) == identity
            and (parent_state.st_dev, parent_state.st_ino) == identity
        )

    def parent_directory_is_current(
        self,
        anchor: _MigrationDirectoryAnchor,
        repository: Path,
    ) -> bool:
        try:
            descriptor_state = os.fstat(anchor.descriptor)
            path_state = os.stat(anchor.path, follow_symlinks=False)
            resolved_parent = anchor.path.resolve(strict=True)
        except (OSError, RuntimeError):
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
            creation_error: OSError | None = None
            try:
                created = os.fstat(descriptor)
                if not stat.S_ISREG(created.st_mode) or created.st_nlink != 1:
                    raise OSError("migration staging path is not a regular file")
                identities = getattr(self, "_staging_identities", None)
                if identities is None:
                    identities = {}
                    self._staging_identities = identities
                identities[(parent_descriptor, name)] = (
                    created.st_dev,
                    created.st_ino,
                )
            except OSError as error:
                creation_error = error
            try:
                os.close(descriptor)
            except OSError as error:
                if creation_error is None:
                    creation_error = error
            if creation_error is not None:
                try:
                    self.unlink_at(parent_descriptor, name)
                except OSError:
                    cleanup_outcome = MigrationCleanupOutcome.FAILED
                else:
                    cleanup_outcome = MigrationCleanupOutcome.REMOVED
                raise _StagingCreationError(
                    name,
                    cleanup_outcome,
                ) from creation_error
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
            opened = os.fstat(descriptor)
            expected = getattr(self, "_staging_identities", {}).get(
                (parent_descriptor, name)
            )
            if not stat.S_ISREG(opened.st_mode) or (
                expected is not None
                and (
                    opened.st_nlink != 1
                    or (opened.st_dev, opened.st_ino) != expected
                    or not self._entry_is_current(
                        parent_descriptor,
                        name,
                        descriptor,
                    )
                )
            ):
                raise OSError("migration path is not a regular file")
            with os.fdopen(descriptor, "rb", closefd=False) as stream:
                data = stream.read(limit + 1)
            if expected is not None and not self._entry_is_current(
                parent_descriptor,
                name,
                descriptor,
            ):
                raise OSError("migration staging identity changed")
        finally:
            os.close(descriptor)
        if len(data) > limit:
            raise ManifestSizeLimitExceeded
        return data

    @staticmethod
    def _entry_is_current(parent_descriptor: int, name: str, descriptor: int) -> bool:
        try:
            linked = os.stat(name, dir_fd=parent_descriptor, follow_symlinks=False)
            opened = os.fstat(descriptor)
        except OSError:
            return False
        return not stat.S_ISLNK(linked.st_mode) and (
            linked.st_dev,
            linked.st_ino,
            stat.S_IFMT(linked.st_mode),
        ) == (opened.st_dev, opened.st_ino, stat.S_IFMT(opened.st_mode))

    def read_repository_bytes_at(
        self,
        repository_anchor: _MigrationDirectoryAnchor,
        relative_path: Path,
        *,
        limit: int,
    ) -> bytes:
        """Read one regular repository file without resolving path aliases."""

        if relative_path.is_absolute() or any(
            part in {"", ".", ".."} for part in relative_path.parts
        ):
            raise OSError("migration repository path is invalid")
        directories: list[tuple[int, str, int]] = []
        parent_descriptor = repository_anchor.descriptor
        file_descriptor: int | None = None
        directory_flags = self._open_flags(os.O_RDONLY | os.O_DIRECTORY)
        try:
            for component in relative_path.parts[:-1]:
                descriptor = os.open(
                    component,
                    directory_flags,
                    dir_fd=parent_descriptor,
                )
                if not self._entry_is_current(
                    parent_descriptor,
                    component,
                    descriptor,
                ):
                    os.close(descriptor)
                    raise OSError("migration repository directory identity changed")
                directories.append((parent_descriptor, component, descriptor))
                parent_descriptor = descriptor
            filename = relative_path.parts[-1]
            file_descriptor = os.open(
                filename,
                self._open_flags(os.O_RDONLY),
                dir_fd=parent_descriptor,
            )
            if not stat.S_ISREG(
                os.fstat(file_descriptor).st_mode
            ) or not self._entry_is_current(
                parent_descriptor,
                filename,
                file_descriptor,
            ):
                raise OSError("migration repository path is not a stable file")
            chunks: list[bytes] = []
            remaining = limit + 1
            while remaining:
                chunk = os.read(file_descriptor, remaining)
                if not chunk:
                    break
                chunks.append(chunk)
                remaining -= len(chunk)
            data = b"".join(chunks)
            if not self._entry_is_current(
                parent_descriptor,
                filename,
                file_descriptor,
            ) or any(
                not self._entry_is_current(parent, name, descriptor)
                for parent, name, descriptor in directories
            ):
                raise OSError("migration repository path identity changed")
        finally:
            if file_descriptor is not None:
                os.close(file_descriptor)
            for _, _, descriptor in reversed(directories):
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
            self._open_flags(os.O_WRONLY),
            dir_fd=parent_descriptor,
        )
        try:
            opened = os.fstat(descriptor)
            expected = getattr(self, "_staging_identities", {}).get(
                (parent_descriptor, name)
            )
            if (
                expected is None
                or not stat.S_ISREG(opened.st_mode)
                or opened.st_nlink != 1
                or (opened.st_dev, opened.st_ino) != expected
                or not self._entry_is_current(parent_descriptor, name, descriptor)
            ):
                raise OSError("migration staging identity changed")
            os.ftruncate(descriptor, 0)
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

    def after_locked_target_validation_at(
        self,
        parent_descriptor: int,
        parent: Path,
        source_name: str,
        target_name: str,
    ) -> None:
        """Test seam after the first locked target validation."""

    def replace_at(
        self,
        parent_descriptor: int,
        parent: Path,
        source_name: str,
        target_name: str,
        *,
        lock_token: _WriterLockToken,
        expected_target_sha256: str,
    ) -> _ReplaceOutcome:
        if _HEX_64.fullmatch(
            expected_target_sha256
        ) is None or not self._writer_lock_is_live(lock_token, parent_descriptor):
            return _ReplaceOutcome.LOCK_UNAVAILABLE
        descriptor = os.open(
            source_name,
            self._open_flags(os.O_RDONLY),
            dir_fd=parent_descriptor,
        )
        try:
            opened = os.fstat(descriptor)
            expected = getattr(self, "_staging_identities", {}).get(
                (parent_descriptor, source_name)
            )
            if (
                expected is None
                or opened.st_nlink != 1
                or (opened.st_dev, opened.st_ino) != expected
                or not self._entry_is_current(
                    parent_descriptor, source_name, descriptor
                )
            ):
                raise OSError("migration staging identity changed")
        finally:
            os.close(descriptor)
        if not self._writer_lock_is_live(lock_token, parent_descriptor):
            return _ReplaceOutcome.LOCK_UNAVAILABLE
        try:
            target_bytes = self.read_bounded_bytes_at(
                parent_descriptor,
                target_name,
            )
        except (ManifestSizeLimitExceeded, OSError):
            return _ReplaceOutcome.TARGET_CHANGED
        if _sha256(target_bytes) != expected_target_sha256:
            return _ReplaceOutcome.TARGET_CHANGED
        self.after_locked_target_validation_at(
            parent_descriptor,
            parent,
            source_name,
            target_name,
        )
        if not self._writer_lock_is_live(lock_token, parent_descriptor):
            return _ReplaceOutcome.LOCK_UNAVAILABLE
        try:
            target_bytes = self.read_bounded_bytes_at(
                parent_descriptor,
                target_name,
            )
        except (ManifestSizeLimitExceeded, OSError):
            return _ReplaceOutcome.TARGET_CHANGED
        if _sha256(target_bytes) != expected_target_sha256:
            return _ReplaceOutcome.TARGET_CHANGED
        os.replace(
            source_name,
            target_name,
            src_dir_fd=parent_descriptor,
            dst_dir_fd=parent_descriptor,
        )
        getattr(self, "_staging_identities", {}).pop(
            (parent_descriptor, source_name), None
        )
        os.fsync(parent_descriptor)
        return _ReplaceOutcome.REPLACED

    def unlink_at(self, parent_descriptor: int, name: str) -> None:
        identities = getattr(self, "_staging_identities", {})
        expected = identities.get((parent_descriptor, name))
        if expected is None:
            raise OSError("migration staging cleanup identity unavailable")
        descriptor = os.open(
            name,
            self._open_flags(os.O_RDONLY),
            dir_fd=parent_descriptor,
        )
        try:
            opened = os.fstat(descriptor)
            if (
                not stat.S_ISREG(opened.st_mode)
                or opened.st_nlink != 1
                or (opened.st_dev, opened.st_ino) != expected
                or not self._entry_is_current(
                    parent_descriptor,
                    name,
                    descriptor,
                )
            ):
                raise OSError("migration staging cleanup identity changed")
        finally:
            try:
                os.close(descriptor)
            except OSError:
                # Identity was already proved; an open inode remains safe
                # to unlink.
                pass
        os.unlink(name, dir_fd=parent_descriptor)
        identities.pop((parent_descriptor, name), None)


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


def _source_state_object(state: SourceIdentityState) -> dict[str, object]:
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


def _explicit_match_object(match: ExplicitSourceMatch) -> dict[str, object]:
    parent = match.parent_locator
    return {
        "source_path": match.source_path,
        "normalized_heading": match.normalized_heading,
        "parent_locator": (
            None
            if parent is None
            else {
                "source_path": parent.source_path,
                "normalized_heading": parent.normalized_heading,
            }
        ),
        "source_id": match.source_id,
    }


def _source_context_object(preview: ManifestMigrationPreview) -> dict[str, object]:
    return {
        "previous_source_items": _source_state_object(preview.previous_source_items),
        "explicit_matches": [
            _explicit_match_object(match) for match in preview.explicit_matches
        ],
    }


def _bounded_preview_text(value: object, *, allow_empty: bool = False) -> bool:
    if type(value) is not str or (not allow_empty and not value):
        return False
    try:
        return len(value.encode("utf-8")) <= MAX_MANIFEST_BYTES
    except UnicodeEncodeError:
        return False


def _preview_has_valid_shape(preview: object) -> bool:
    if type(preview) is not ManifestMigrationPreview:
        return False
    scalar_text = (
        preview.repository_root,
        preview.target_path,
        preview.observed_source_commit,
        preview.current_source_commit,
        preview.current_artifacts_sha256,
        preview.current_progress_sha256,
        preview.v1_sha256,
        preview.v2_sha256,
        preview.source_context_sha256,
    )
    if not all(_bounded_preview_text(value) for value in scalar_text):
        return False
    if (
        _HEX_40.fullmatch(preview.observed_source_commit) is None
        or _HEX_40.fullmatch(preview.current_source_commit) is None
        or any(
            _HEX_64.fullmatch(value) is None
            for value in (
                preview.current_artifacts_sha256,
                preview.current_progress_sha256,
                preview.v1_sha256,
                preview.v2_sha256,
            )
        )
        or type(preview.candidate_bytes) is not bytes
        or not preview.candidate_bytes
        or len(preview.candidate_bytes) > MAX_MANIFEST_BYTES
        or type(preview.candidate_manifest) is not HandoffManifestV2
        or type(preview.explicit_matches) is not tuple
        or len(preview.explicit_matches) > _MAX_PREVIEW_ITEMS
        or type(preview.current_artifacts) is not tuple
        or not 1 <= len(preview.current_artifacts) <= 64
        or type(preview.current_progress) is not Progress
        or type(preview.current_progress.tasks) is not tuple
        or not 1 <= len(preview.current_progress.tasks) <= _MAX_PREVIEW_ITEMS
        or type(preview.source_paths) is not tuple
        or not 1 <= len(preview.source_paths) <= _MAX_PREVIEW_ITEMS
        or type(preview.changes) is not tuple
        or len(preview.changes) > _MAX_PREVIEW_ITEMS
        or type(preview.exclusions) is not tuple
        or len(preview.exclusions) > _MAX_PREVIEW_ITEMS
    ):
        return False
    if not isinstance(
        validate_source_identity_state(preview.previous_source_items),
        Success,
    ):
        return False
    if any(
        type(artifact) is not ManifestArtifact
        or not all(
            _bounded_preview_text(value)
            for value in (artifact.kind, artifact.path, artifact.sha256)
        )
        or _HEX_64.fullmatch(artifact.sha256) is None
        for artifact in preview.current_artifacts
    ):
        return False
    if any(
        type(task) is not NormalizedTask
        or not _bounded_preview_text(task.id)
        or not _bounded_preview_text(task.description)
        or type(task.done) is not bool
        for task in preview.current_progress.tasks
    ):
        return False
    if any(
        not _bounded_preview_text(source_path) for source_path in preview.source_paths
    ):
        return False
    if any(
        type(change) is not MigrationCandidateChange
        or change.kind not in {"created", "updated", "tombstoned"}
        or type(change.category) is not SourceCategory
        or not _bounded_preview_text(change.source_id)
        or _SOURCE_ID.fullmatch(change.source_id) is None
        or not _bounded_preview_text(change.source_path)
        or (
            change.previous_fingerprint is not None
            and (
                type(change.previous_fingerprint) is not str
                or _HEX_64.fullmatch(change.previous_fingerprint) is None
            )
        )
        or type(change.candidate_fingerprint) is not str
        or _HEX_64.fullmatch(change.candidate_fingerprint) is None
        or not _bounded_preview_text(change.reason)
        for change in preview.changes
    ):
        return False
    if any(
        type(match) is not ExplicitSourceMatch for match in preview.explicit_matches
    ):
        return False
    if not all(_bounded_preview_text(exclusion) for exclusion in preview.exclusions):
        return False

    text_values = list(scalar_text)
    for artifact in preview.current_artifacts:
        text_values.extend((artifact.kind, artifact.path, artifact.sha256))
    for task in preview.current_progress.tasks:
        text_values.extend((task.id, task.description))
    text_values.extend(preview.source_paths)
    for change in preview.changes:
        text_values.extend(
            (
                change.kind,
                change.source_id,
                change.source_path,
                change.candidate_fingerprint,
                change.reason,
            )
        )
        if change.previous_fingerprint is not None:
            text_values.append(change.previous_fingerprint)
    text_values.extend(preview.exclusions)
    aggregate_bytes = 0
    for value in text_values:
        aggregate_bytes += len(value.encode("utf-8"))
        if aggregate_bytes > MAX_MANIFEST_BYTES:
            return False
    return len(set(preview.source_paths)) == len(preview.source_paths)


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
        "source_context_sha256": preview.source_context_sha256,
        "changes": [_change_object(change) for change in preview.changes],
        "exclusions": list(preview.exclusions),
    }


def _preview_identity(preview: object) -> str | None:
    """Return one validated preview identity without leaking input exceptions."""

    try:
        if (
            not isinstance(preview, ManifestMigrationPreview)
            or not _preview_has_valid_shape(preview)
            or not _preview_is_consistent(preview)
        ):
            return None
        machine_bytes = _compact_json(_preview_machine_view(preview))
    except Exception:
        return None
    if len(machine_bytes) > MAX_MANIFEST_BYTES:
        return None
    return _sha256(machine_bytes)


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
        or _sha256(_compact_json(_source_context_object(preview)))
        != preview.source_context_sha256
        or preview.candidate_manifest.artifacts != preview.current_artifacts
        or preview.candidate_manifest.progress != preview.current_progress
        or preview.candidate_manifest.source_commit != preview.current_source_commit
    ):
        return False
    parsed = parse_manifest_v2_bytes(preview.candidate_bytes)
    if isinstance(parsed, Failure) or parsed.value != preview.candidate_manifest:
        return False
    serialized = serialize_manifest_v2(preview.candidate_manifest)
    serializable_previous_source_items = SourceIdentityState(
        next_requirement_id=preview.previous_source_items.next_requirement_id,
        next_scenario_id=preview.previous_source_items.next_scenario_id,
        active=preview.previous_source_items.active,
        tombstones=preview.previous_source_items.tombstones,
    )
    previous_validation = serialize_manifest_v2(
        replace(
            preview.candidate_manifest,
            source_items=serializable_previous_source_items,
        )
    )
    expected_changes = _candidate_changes_from_states(
        preview.previous_source_items,
        preview.candidate_manifest.source_items,
    )
    return (
        isinstance(serialized, Success)
        and serialized.value == preview.candidate_bytes
        and isinstance(previous_validation, Success)
        and expected_changes is not None
        and preview.changes == expected_changes
        and preview.exclusions == ()
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
    except (OSError, RuntimeError):
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
    try:
        target_is_safe = target_guard._target_parent_is_safe(parts[2])
    except RuntimeError:
        target_is_safe = False
    if not target_is_safe:
        return _failure("manifest-target-unsafe")
    return Success((repository, target_path.as_posix(), parts[2]))


def _read_artifact_snapshot(
    repository: Path,
    repository_anchor: _MigrationDirectoryAnchor,
    change_id: str,
    artifacts: Sequence[ManifestArtifact],
    *,
    operations: ManifestMigrationFileOperations,
) -> Result[
    tuple[
        tuple[ManifestArtifact, ...],
        Progress,
        tuple[tuple[str, bytes], ...],
    ]
]:
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
    if not claims or len(claims) > DEFAULT_ARTIFACT_LIMITS.max_files:
        return _failure("migration-artifact-snapshot-invalid")
    observed: list[tuple[ArtifactKind, str, str, str, bytes]] = []
    aggregate_bytes = 0
    seen_paths: set[str] = set()
    for claim in claims:
        raw_path = str(claim.path)
        parts = claim.path.parts
        root = ("openspec", "changes", change_id)
        expected_singleton = {
            ArtifactKind.PROPOSAL: (*root, "proposal.md"),
            ArtifactKind.DESIGN: (*root, "design.md"),
            ArtifactKind.TASKS: (*root, "tasks.md"),
        }.get(claim.kind)
        is_canonical_spec = (
            claim.kind is ArtifactKind.SPEC
            and len(parts) == 6
            and parts[:3] == root
            and parts[3] == "specs"
            and bool(parts[4])
            and parts[5] == "spec.md"
        )
        if (
            claim.path.is_absolute()
            or "\\" in raw_path
            or "\0" in raw_path
            or raw_path != unicodedata.normalize("NFC", raw_path)
            or any(part in {"", ".", ".."} for part in parts)
            or (expected_singleton is None and not is_canonical_spec)
            or (expected_singleton is not None and parts != expected_singleton)
            or raw_path in seen_paths
        ):
            return _failure("artifact-path-noncanonical")
        seen_paths.add(raw_path)
        try:
            content_bytes = operations.read_repository_bytes_at(
                repository_anchor,
                claim.path,
                limit=DEFAULT_ARTIFACT_LIMITS.bytes_per_file,
            )
        except ManifestSizeLimitExceeded:
            return _failure("artifact-file-limit-exceeded")
        except OSError:
            return _failure("artifact-read-failed")
        aggregate_bytes += len(content_bytes)
        if aggregate_bytes > DEFAULT_ARTIFACT_LIMITS.bytes_total:
            return _failure("artifact-total-limit-exceeded")
        try:
            content = content_bytes.decode("utf-8")
        except UnicodeDecodeError:
            return _failure("artifact-utf8-invalid")
        observed.append(
            (claim.kind, raw_path, _sha256(content_bytes), content, content_bytes)
        )
    tasks = tuple(
        artifact for artifact in observed if artifact[0] is ArtifactKind.TASKS
    )
    if len(tasks) != 1:
        return _failure("migration-progress-snapshot-invalid")
    progress = parse_task_progress(tasks[0][3])
    if isinstance(progress, Failure):
        return progress
    return Success(
        (
            tuple(
                ManifestArtifact(
                    kind=kind.value,
                    path=path,
                    sha256=sha256,
                )
                for kind, path, sha256, _, _ in observed
            ),
            progress.value,
            tuple(
                (path, content_bytes)
                for kind, path, _, _, content_bytes in observed
                if kind is ArtifactKind.SPEC
            ),
        )
    )


def _validate_source_snapshot(
    repository: Path,
    repository_anchor: _MigrationDirectoryAnchor,
    source_paths: Sequence[str],
    artifacts: Sequence[ManifestArtifact],
    progress: Progress,
    *,
    change_id: str,
    limits: SourceIdentityLimits,
    operations: ManifestMigrationFileOperations,
) -> Result[SourceInventory]:
    first_artifacts = _read_artifact_snapshot(
        repository,
        repository_anchor,
        change_id,
        artifacts,
        operations=operations,
    )
    if isinstance(first_artifacts, Failure):
        return first_artifacts
    if first_artifacts.value[0] != tuple(artifacts):
        return _failure("migration-artifact-snapshot-mismatch")
    if first_artifacts.value[1] != progress:
        return _failure("migration-progress-snapshot-mismatch")
    inventory = source_inventory_from_bytes(
        first_artifacts.value[2],
        limits=limits,
    )
    if isinstance(inventory, Failure):
        return inventory
    confirmed_artifacts = _read_artifact_snapshot(
        repository,
        repository_anchor,
        change_id,
        artifacts,
        operations=operations,
    )
    if isinstance(confirmed_artifacts, Failure):
        return confirmed_artifacts
    if (
        confirmed_artifacts.value != first_artifacts.value
        or not operations.parent_directory_is_current(
            repository_anchor,
            repository,
        )
    ):
        return _failure("migration-source-changed-during-preview")

    spec_paths = {artifact.path for artifact in artifacts if artifact.kind == "spec"}
    if len(source_paths) != len(spec_paths) or spec_paths != set(source_paths):
        return _failure("migration-source-snapshot-mismatch")
    return inventory


def _candidate_changes(
    reconciliation: SourceReconciliation,
    previous: SourceIdentityState,
) -> tuple[MigrationCandidateChange, ...]:
    changes = _candidate_changes_from_states(previous, reconciliation.state)
    if changes is None:  # pragma: no cover - reconciliation guarantees this transition
        raise AssertionError("source reconciliation produced an invalid transition")
    return changes


def _candidate_changes_from_states(
    previous: SourceIdentityState,
    candidate: SourceIdentityState,
) -> tuple[MigrationCandidateChange, ...] | None:
    previous_active = {item.id: item for item in previous.active}
    previous_tombstones = {item.id: item for item in previous.tombstones}
    candidate_active = {item.id: item for item in candidate.active}
    candidate_tombstones = {item.id: item for item in candidate.tombstones}
    if (
        len(previous_active) != len(previous.active)
        or len(previous_tombstones) != len(previous.tombstones)
        or len(candidate_active) != len(candidate.active)
        or len(candidate_tombstones) != len(candidate.tombstones)
        or any(
            candidate_tombstones.get(key) != value
            for key, value in previous_tombstones.items()
        )
    ):
        return None
    created = candidate_active.keys() - previous_active.keys()
    updated = {
        source_id
        for source_id in candidate_active.keys() & previous_active.keys()
        if candidate_active[source_id] != previous_active[source_id]
    }
    tombstoned = previous_active.keys() - candidate_active.keys()
    for source_id in tombstoned:
        prior = previous_active[source_id]
        current = candidate_tombstones.get(source_id)
        if current is None or (
            current.category != prior.category
            or current.last_source_path != prior.source_path
            or current.last_raw_heading != prior.raw_heading
            or current.last_parent_id != prior.parent_id
            or current.fingerprint != prior.fingerprint
        ):
            return None
    changes: list[MigrationCandidateChange] = []
    for source_id in created:
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
    for source_id in updated:
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
    for source_id in tombstoned:
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


def _read_preview_snapshot_at_root(
    repository: Path,
    repository_anchor: _MigrationDirectoryAnchor,
    canonical_target: str,
    target_change_id: str,
    *,
    artifacts: tuple[ManifestArtifact, ...],
    current_progress: Progress,
    source_paths: tuple[str, ...],
    requested_schema_version: int,
    limits: SourceIdentityLimits,
    operations: ManifestMigrationFileOperations,
) -> Result[tuple[bytes, HandoffManifest, SourceInventory]]:
    try:
        target_anchor = operations.open_directory_at(
            repository_anchor,
            Path(canonical_target).parent,
            repository,
        )
    except OSError:
        return _failure("manifest-target-unsafe")
    target_snapshot: Result[bytes]
    try:
        try:
            v1_bytes = operations.read_bounded_bytes_at(
                target_anchor.descriptor,
                Path(canonical_target).name,
            )
        except ManifestSizeLimitExceeded:
            target_snapshot = _failure("manifest-size-limit-exceeded")
        except OSError:
            target_snapshot = _failure("manifest-read-failed")
        else:
            if not operations.parent_directory_is_current(
                target_anchor, repository
            ) or not operations.parent_directory_is_current(
                repository_anchor,
                repository,
            ):
                target_snapshot = _failure("manifest-target-unsafe")
            else:
                target_snapshot = Success(v1_bytes)
    except BaseException:
        try:
            operations.close_parent_directory(target_anchor)
        except OSError:
            pass
        raise
    try:
        operations.close_parent_directory(target_anchor)
    except OSError:
        return _failure("migration-target-close-failed")
    if isinstance(target_snapshot, Failure):
        return target_snapshot
    v1_bytes = target_snapshot.value

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
    source_snapshot = _validate_source_snapshot(
        repository,
        repository_anchor,
        source_paths,
        artifacts,
        current_progress,
        change_id=source_manifest.change_id,
        limits=limits,
        operations=operations,
    )
    if isinstance(source_snapshot, Failure):
        return source_snapshot
    return Success((v1_bytes, source_manifest, source_snapshot.value))


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
    operations: ManifestMigrationFileOperations | None = None,
) -> Result[ManifestMigrationPreview]:
    """Build complete approval evidence without creating or changing any path."""

    filesystem = ManifestMigrationFileOperations() if operations is None else operations
    resolved = _resolve_target(
        repository_root,
        target_path,
        operations=filesystem,
    )
    if isinstance(resolved, Failure):
        return resolved
    repository, canonical_target, target_change_id = resolved.value
    try:
        repository_anchor = filesystem.open_parent_directory(repository, Path())
    except OSError:
        return _failure("migration-repository-unreadable", category=IssueCategory.INPUT)
    artifacts = tuple(current_artifacts)
    canonical_source_paths = tuple(str(path) for path in source_paths)
    snapshot: Result[tuple[bytes, HandoffManifest, SourceInventory]]
    try:
        snapshot = _read_preview_snapshot_at_root(
            repository,
            repository_anchor,
            canonical_target,
            target_change_id,
            artifacts=artifacts,
            current_progress=current_progress,
            source_paths=canonical_source_paths,
            requested_schema_version=requested_schema_version,
            limits=limits,
            operations=filesystem,
        )
    finally:
        try:
            filesystem.close_parent_directory(repository_anchor)
        except OSError:
            snapshot = _failure("migration-repository-unreadable")
    if isinstance(snapshot, Failure):
        return snapshot
    v1_bytes, source_manifest, source_inventory = snapshot.value
    previous = (
        _EMPTY_SOURCE_ITEMS if previous_source_items is None else previous_source_items
    )
    frozen_explicit_matches = tuple(explicit_matches)
    reconciliation = reconcile_source_items(
        source_inventory,
        previous,
        explicit_matches=frozen_explicit_matches,
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
        previous_source_items=previous,
        explicit_matches=frozen_explicit_matches,
        source_context_sha256="",
        changes=changes,
        exclusions=reconciliation.value.exclusions,
        preview_sha256="",
    )
    preview = replace(
        preview,
        source_context_sha256=_sha256(_compact_json(_source_context_object(preview))),
    )
    preview_identity = _preview_identity(preview)
    if preview_identity is None:
        return _failure("migration-preview-invalid")
    return Success(replace(preview, preview_sha256=preview_identity))


def _replace_locked_manifest_migration(
    preview: ManifestMigrationPreview,
    *,
    operations: ManifestMigrationFileOperations,
    repository_anchor: _MigrationDirectoryAnchor,
    anchor: _MigrationDirectoryAnchor,
    repository: Path,
    resolved_target: tuple[Path, str, str],
    staging_name: str,
) -> ManifestMigrationFailure | None:
    target_name = Path(preview.target_path).name
    lock_token = operations.acquire_writer_lock_at(anchor, repository)
    if lock_token is None:
        return _migration_failure_after_staging_at(
            "migration-writer-lock-unavailable",
            MigrationFailurePoint.STATE_GUARD,
            MigrationStagingState.VALIDATED,
            operations=operations,
            parent_descriptor=anchor.descriptor,
            target_name=target_name,
            expected_v1_sha256=preview.v1_sha256,
            staging_name=staging_name,
        )
    try:
        confirmed = _resolve_target(
            repository,
            Path(preview.target_path),
            operations=operations,
        )
        snapshot_before_replace = _validate_source_snapshot(
            repository,
            repository_anchor,
            preview.source_paths,
            preview.current_artifacts,
            preview.current_progress,
            change_id=preview.candidate_manifest.change_id,
            limits=DEFAULT_SOURCE_IDENTITY_LIMITS,
            operations=operations,
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
        snapshot_at_replace = _validate_source_snapshot(
            repository,
            repository_anchor,
            preview.source_paths,
            preview.current_artifacts,
            preview.current_progress,
            change_id=preview.candidate_manifest.change_id,
            limits=DEFAULT_SOURCE_IDENTITY_LIMITS,
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
            or isinstance(snapshot_at_replace, Failure)
            or not operations.parent_directory_is_current(
                repository_anchor,
                repository,
            )
            or not operations.parent_directory_is_current(anchor, repository)
            or _sha256(target_at_replace) != preview.v1_sha256
        ):
            return _migration_failure_after_staging_at(
                "migration-state-changed-at-replace",
                MigrationFailurePoint.STATE_GUARD,
                MigrationStagingState.VALIDATED,
                operations=operations,
                parent_descriptor=anchor.descriptor,
                target_name=target_name,
                expected_v1_sha256=preview.v1_sha256,
                staging_name=staging_name,
            )
        try:
            outcome = operations.replace_at(
                anchor.descriptor,
                anchor.path,
                staging_name,
                target_name,
                lock_token=lock_token,
                expected_target_sha256=preview.v1_sha256,
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
        if outcome is _ReplaceOutcome.TARGET_CHANGED:
            return _migration_failure_after_staging_at(
                "migration-state-changed-at-replace",
                MigrationFailurePoint.STATE_GUARD,
                MigrationStagingState.VALIDATED,
                operations=operations,
                parent_descriptor=anchor.descriptor,
                target_name=target_name,
                expected_v1_sha256=preview.v1_sha256,
                staging_name=staging_name,
            )
        if outcome is not _ReplaceOutcome.REPLACED:
            return _migration_failure_after_staging_at(
                "migration-writer-lock-unavailable",
                MigrationFailurePoint.STATE_GUARD,
                MigrationStagingState.VALIDATED,
                operations=operations,
                parent_descriptor=anchor.descriptor,
                target_name=target_name,
                expected_v1_sha256=preview.v1_sha256,
                staging_name=staging_name,
            )
        return None
    finally:
        operations.release_writer_lock(lock_token)


def _apply_anchored_manifest_migration(
    preview: ManifestMigrationPreview,
    *,
    operations: ManifestMigrationFileOperations,
    repository_anchor: _MigrationDirectoryAnchor,
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
    except _StagingCreationError as error:
        return _migration_failure(
            "migration-staging-create-failed",
            MigrationFailurePoint.CREATE,
            _observe_target_state_at(
                operations,
                anchor.descriptor,
                target_name,
                preview.v1_sha256,
            ),
            (
                MigrationStagingState.ABSENT
                if error.cleanup_outcome is MigrationCleanupOutcome.REMOVED
                else MigrationStagingState.UNKNOWN
            ),
            error.cleanup_outcome,
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

    replacement_failure = _replace_locked_manifest_migration(
        preview,
        operations=operations,
        repository_anchor=repository_anchor,
        anchor=anchor,
        repository=repository,
        resolved_target=resolved_target,
        staging_name=staging_name,
    )
    if replacement_failure is not None:
        return replacement_failure
    try:
        installed_bytes = operations.read_bounded_bytes_at(
            anchor.descriptor,
            target_name,
        )
    except (ManifestSizeLimitExceeded, OSError):
        return _migration_failure(
            "migration-replaced-target-reread-failed",
            MigrationFailurePoint.REREAD,
            MigrationTargetState.UNKNOWN,
            MigrationStagingState.ABSENT,
        )
    installed = parse_manifest_v2_bytes(installed_bytes)
    if (
        installed_bytes != preview.candidate_bytes
        or isinstance(installed, Failure)
        or installed.value != preview.candidate_manifest
    ):
        return _migration_failure(
            "migration-replaced-target-validation-failed",
            MigrationFailurePoint.VALIDATE,
            MigrationTargetState.UNKNOWN,
            MigrationStagingState.ABSENT,
        )

    repository_is_current = operations.parent_directory_is_current(
        repository_anchor,
        repository,
    )
    target_parent_is_current = operations.parent_directory_is_current(
        anchor,
        repository,
    )
    try:
        fresh_anchor = operations.open_directory_at(
            repository_anchor,
            Path(preview.target_path).parent,
            repository,
        )
    except OSError:
        return _migration_failure(
            "migration-replaced-target-identity-changed",
            MigrationFailurePoint.STATE_GUARD,
            MigrationTargetState.UNKNOWN,
            MigrationStagingState.ABSENT,
        )
    fresh_bytes: bytes | None = None
    fresh_parent_is_current = False
    try:
        try:
            fresh_bytes = operations.read_bounded_bytes_at(
                fresh_anchor.descriptor,
                target_name,
            )
        except (ManifestSizeLimitExceeded, OSError):
            pass
        fresh_parent_is_current = operations.parent_directory_is_current(
            fresh_anchor,
            repository,
        )
    finally:
        try:
            operations.close_parent_directory(fresh_anchor)
        except OSError:
            # Candidate bytes and directory identity were already observed.
            pass

    same_parent_identity = (fresh_anchor.device, fresh_anchor.inode) == (
        anchor.device,
        anchor.inode,
    )
    if (
        not repository_is_current
        or not target_parent_is_current
        or not fresh_parent_is_current
        or not same_parent_identity
    ):
        return _migration_failure(
            "migration-replaced-target-identity-changed",
            MigrationFailurePoint.STATE_GUARD,
            MigrationTargetState.UNKNOWN,
            MigrationStagingState.ABSENT,
        )
    if fresh_bytes is None:
        return _migration_failure(
            "migration-replaced-canonical-target-reread-failed",
            MigrationFailurePoint.REREAD,
            MigrationTargetState.UNKNOWN,
            MigrationStagingState.ABSENT,
        )
    fresh_installed = parse_manifest_v2_bytes(fresh_bytes)
    if (
        fresh_bytes != preview.candidate_bytes
        or isinstance(fresh_installed, Failure)
        or fresh_installed.value != preview.candidate_manifest
    ):
        return _migration_failure(
            "migration-replaced-canonical-target-validation-failed",
            MigrationFailurePoint.VALIDATE,
            MigrationTargetState.UNKNOWN,
            MigrationStagingState.ABSENT,
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

    filesystem = ManifestMigrationFileOperations() if operations is None else operations
    preview_identity = _preview_identity(preview)
    if (
        preview_identity is None
        or type(preview.preview_sha256) is not str
        or _HEX_64.fullmatch(preview.preview_sha256) is None
    ):
        return _migration_failure(
            "migration-preview-invalid",
            MigrationFailurePoint.STATE_GUARD,
            MigrationTargetState.UNKNOWN,
            MigrationStagingState.ABSENT,
        )
    if (
        approved is not True
        or approved_preview_sha256 != preview.preview_sha256
        or preview.preview_sha256 != preview_identity
    ):
        return _migration_failure(
            "migration-approval-rejected",
            MigrationFailurePoint.APPROVAL,
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
    try:
        repository_anchor = filesystem.open_parent_directory(repository, Path())
    except OSError:
        return _migration_failure(
            "migration-repository-open-failed",
            MigrationFailurePoint.STATE_GUARD,
            MigrationTargetState.UNKNOWN,
            MigrationStagingState.ABSENT,
        )
    result: ManifestMigrationResult | None = None
    anchor: _MigrationDirectoryAnchor | None = None
    try:
        try:
            anchor = filesystem.open_directory_at(
                repository_anchor,
                Path(canonical_target).parent,
                repository,
            )
        except OSError:
            return _migration_failure(
                "migration-target-parent-open-failed",
                MigrationFailurePoint.STATE_GUARD,
                MigrationTargetState.UNKNOWN,
                MigrationStagingState.ABSENT,
            )
        target_name = Path(canonical_target).name
        try:
            target_bytes = filesystem.read_bounded_bytes_at(
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
                _observe_target_state_at(
                    filesystem,
                    anchor.descriptor,
                    target_name,
                    preview.v1_sha256,
                ),
                MigrationStagingState.ABSENT,
            )
        source_snapshot = _validate_source_snapshot(
            repository,
            repository_anchor,
            preview.source_paths,
            preview.current_artifacts,
            preview.current_progress,
            change_id=preview.candidate_manifest.change_id,
            limits=DEFAULT_SOURCE_IDENTITY_LIMITS,
            operations=filesystem,
        )
        if isinstance(source_snapshot, Failure):
            return _migration_failure(
                "migration-current-snapshot-changed",
                MigrationFailurePoint.STATE_GUARD,
                _observe_target_state_at(
                    filesystem,
                    anchor.descriptor,
                    target_name,
                    preview.v1_sha256,
                ),
                MigrationStagingState.ABSENT,
            )
        current_reconciliation = reconcile_source_items(
            source_snapshot.value,
            preview.previous_source_items,
            explicit_matches=preview.explicit_matches,
        )
        if (
            isinstance(current_reconciliation, Failure)
            or current_reconciliation.value.state
            != preview.candidate_manifest.source_items
            or _candidate_changes(
                current_reconciliation.value,
                preview.previous_source_items,
            )
            != preview.changes
            or current_reconciliation.value.exclusions != preview.exclusions
        ):
            return _migration_failure(
                "migration-preview-source-evidence-changed",
                MigrationFailurePoint.STATE_GUARD,
                _observe_target_state_at(
                    filesystem,
                    anchor.descriptor,
                    target_name,
                    preview.v1_sha256,
                ),
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
                _observe_target_state_at(
                    filesystem,
                    anchor.descriptor,
                    target_name,
                    preview.v1_sha256,
                ),
                MigrationStagingState.ABSENT,
            )
        result = _apply_anchored_manifest_migration(
            preview,
            operations=filesystem,
            repository_anchor=repository_anchor,
            anchor=anchor,
            repository=repository,
            resolved_target=resolved.value,
        )
    finally:
        if anchor is not None:
            try:
                filesystem.close_parent_directory(anchor)
            except OSError:
                # The anchored result includes bounded post-replace evidence.
                pass
        try:
            filesystem.close_parent_directory(repository_anchor)
        except OSError:
            pass
    if result is None:  # pragma: no cover - an exception bypasses this statement
        raise AssertionError("anchored migration returned no result")
    return result
