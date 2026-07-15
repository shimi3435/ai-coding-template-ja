"""Bounded, strictly read-only OpenSpec/GSD compatibility smoke."""

from __future__ import annotations

import errno
import hashlib
import json
import os
import stat
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .discovery import discover_openspec_artifacts
from .models import Artifact, Failure, InputRoute
from .preflight import (
    CommandResult,
    collect_gsd_probe,
    collect_openspec_probe,
    parse_gsd_capability,
    subprocess_runner,
)

_READ_ONLY_COMMANDS = (
    "openspec --version",
    "openspec instructions apply --change {change_id} --json",
    "node ${GSD_HOME}/gsd-core/bin/gsd-tools.cjs init progress --raw",
)
_UNVERIFIED = (
    "actual-host-prompt",
    "generic-agent-spawn",
    "real-gsd-mutation",
    "route-specific-postconditions",
)


@dataclass(frozen=True)
class SnapshotLimits:
    """Independent inventory bounds; canonical artifact limits do not apply."""

    max_entries: int = 1_000_000
    max_metadata_bytes: int = 256 * 1024 * 1024
    max_encoded_path_bytes: int = 64 * 1024
    read_chunk_bytes: int = 1024 * 1024
    timeout_seconds: float = 120.0


_DEFAULT_SNAPSHOT_LIMITS = SnapshotLimits()


@dataclass(frozen=True)
class RepositorySnapshot:
    """Constant-size identity of every non-administrative repository entry."""

    entry_count: int
    metadata_bytes: int
    root_digest: str


@dataclass(frozen=True)
class SnapshotIssue:
    """Stable smoke-boundary snapshot failure."""

    code: str


@dataclass(frozen=True)
class SnapshotSuccess:
    """A complete stable repository snapshot."""

    value: RepositorySnapshot


@dataclass(frozen=True)
class SnapshotFailure:
    """A snapshot failure without a partial digest."""

    issue: SnapshotIssue


type SnapshotResult = SnapshotSuccess | SnapshotFailure


@dataclass(frozen=True)
class ArtifactEvidence:
    """Canonical identity without canonical Markdown content."""

    kind: str
    path: str
    sha256: str


@dataclass(frozen=True)
class SmokeEvidence:
    """All observed success evidence, kept immutable until rendering."""

    artifacts: tuple[ArtifactEvidence, ...]
    progress_total: int
    progress_complete: int
    progress_remaining: int
    gsd_probe: str
    gsd_initialized: bool
    gsd_entrypoint: str
    snapshot: RepositorySnapshot


@dataclass(frozen=True)
class SmokeResult:
    """A whole-operation result; failures never carry partial success evidence."""

    ok: bool
    code: str
    change_id: str
    executed_commands: tuple[str, ...]
    evidence: SmokeEvidence | None = None


def _snapshot_failure(code: str) -> SnapshotFailure:
    return SnapshotFailure(SnapshotIssue(code))


def _same_scan_identity(before: os.stat_result, after: os.stat_result) -> bool:
    return (
        before.st_dev,
        before.st_ino,
        before.st_mode,
        before.st_size,
        before.st_mtime_ns,
    ) == (
        after.st_dev,
        after.st_ino,
        after.st_mode,
        after.st_size,
        after.st_mtime_ns,
    )


def _digest_record(root_digest: Any, *parts: bytes) -> None:
    for part in parts:
        root_digest.update(len(part).to_bytes(8, "big"))
        root_digest.update(part)


def _special_entry_type(mode: int) -> bytes:
    if stat.S_ISFIFO(mode):
        return b"fifo"
    if stat.S_ISSOCK(mode):
        return b"socket"
    if stat.S_ISBLK(mode):
        return b"block-device"
    if stat.S_ISCHR(mode):
        return b"character-device"
    return b"unknown-special"


def snapshot_repository(
    repository: Path,
    *,
    limits: SnapshotLimits = _DEFAULT_SNAPSHOT_LIMITS,
    clock: Callable[[], float] = time.monotonic,
) -> SnapshotResult:
    """Fingerprint all ignored-inclusive entries without following symlinks."""

    required_descriptor_flags = (
        "O_PATH",
        "O_NOFOLLOW",
        "O_DIRECTORY",
        "O_NONBLOCK",
        "O_CLOEXEC",
    )
    if any(not hasattr(os, name) for name in required_descriptor_flags):
        return _snapshot_failure("repository-snapshot-unreadable")
    if (
        limits.max_entries < 1
        or limits.max_metadata_bytes < 1
        or limits.max_encoded_path_bytes < 1
        or limits.read_chunk_bytes < 1
        or limits.timeout_seconds <= 0
    ):
        return _snapshot_failure("repository-metadata-limit-exceeded")
    started = clock()
    root_digest = hashlib.sha256()
    entry_count = 0
    metadata_bytes = 0

    def deadline_exceeded() -> bool:
        return clock() - started > limits.timeout_seconds

    def add_metadata(*values: bytes) -> SnapshotFailure | None:
        nonlocal metadata_bytes
        if any(len(value) > limits.max_encoded_path_bytes for value in values):
            return _snapshot_failure("repository-metadata-limit-exceeded")
        metadata_bytes += sum(len(value) for value in values)
        if metadata_bytes > limits.max_metadata_bytes:
            return _snapshot_failure("repository-metadata-limit-exceeded")
        return None

    def path_identity(directory_descriptor: int, name: str) -> os.stat_result | None:
        try:
            return os.stat(name, dir_fd=directory_descriptor, follow_symlinks=False)
        except OSError:
            return None

    def open_race_failure(error: OSError) -> SnapshotFailure:
        if error.errno in {errno.ELOOP, errno.ENOENT, errno.ENOTDIR}:
            return _snapshot_failure("repository-snapshot-unstable")
        return _snapshot_failure("repository-snapshot-unreadable")

    def scan(
        directory_descriptor: int, relative_parent: Path
    ) -> SnapshotFailure | None:
        nonlocal entry_count
        if deadline_exceeded():
            return _snapshot_failure("repository-snapshot-timeout")
        try:
            with os.scandir(directory_descriptor) as iterator:
                entries = sorted(iterator, key=lambda item: item.name)
        except (OSError, UnicodeError):
            return _snapshot_failure("repository-snapshot-unreadable")
        try:
            for entry in entries:
                if relative_parent == Path() and entry.name == ".git":
                    continue
                if deadline_exceeded():
                    return _snapshot_failure("repository-snapshot-timeout")
                relative = relative_parent / entry.name
                try:
                    relative_bytes = relative.as_posix().encode("utf-8")
                except UnicodeError:
                    return _snapshot_failure("repository-snapshot-unreadable")
                bound_failure = add_metadata(relative_bytes)
                if bound_failure is not None:
                    return bound_failure
                entry_count += 1
                if entry_count > limits.max_entries:
                    return _snapshot_failure("repository-inventory-limit-exceeded")
                try:
                    before = os.stat(
                        entry.name,
                        dir_fd=directory_descriptor,
                        follow_symlinks=False,
                    )
                except OSError:
                    return _snapshot_failure("repository-snapshot-unreadable")
                mode = str(stat.S_IMODE(before.st_mode)).encode("ascii")
                if stat.S_ISREG(before.st_mode):
                    content_digest = hashlib.sha256()
                    try:
                        path_descriptor = os.open(
                            entry.name,
                            os.O_PATH | os.O_NOFOLLOW | os.O_CLOEXEC,
                            dir_fd=directory_descriptor,
                        )
                    except OSError as error:
                        return open_race_failure(error)
                    try:
                        descriptor_before = os.fstat(path_descriptor)
                        if not stat.S_ISREG(
                            descriptor_before.st_mode
                        ) or not _same_scan_identity(before, descriptor_before):
                            return _snapshot_failure("repository-snapshot-unstable")
                        try:
                            stream_descriptor = os.open(
                                f"/proc/self/fd/{path_descriptor}",
                                os.O_RDONLY | os.O_NONBLOCK | os.O_CLOEXEC,
                            )
                        except OSError:
                            return _snapshot_failure("repository-snapshot-unreadable")
                        try:
                            stream_before = os.fstat(stream_descriptor)
                            if not stat.S_ISREG(
                                stream_before.st_mode
                            ) or not _same_scan_identity(
                                descriptor_before, stream_before
                            ):
                                return _snapshot_failure("repository-snapshot-unstable")
                            while True:
                                if deadline_exceeded():
                                    return _snapshot_failure(
                                        "repository-snapshot-timeout"
                                    )
                                chunk = os.read(
                                    stream_descriptor, limits.read_chunk_bytes
                                )
                                if not chunk:
                                    break
                                content_digest.update(chunk)
                            stream_after = os.fstat(stream_descriptor)
                        finally:
                            os.close(stream_descriptor)
                        descriptor_after = os.fstat(path_descriptor)
                    except (OSError, UnicodeError):
                        return _snapshot_failure("repository-snapshot-unreadable")
                    finally:
                        os.close(path_descriptor)
                    after = path_identity(directory_descriptor, entry.name)
                    if (
                        after is None
                        or not _same_scan_identity(before, stream_after)
                        or not _same_scan_identity(before, descriptor_after)
                        or not _same_scan_identity(before, after)
                    ):
                        return _snapshot_failure("repository-snapshot-unstable")
                    _digest_record(
                        root_digest,
                        relative_bytes,
                        b"regular",
                        mode,
                        str(before.st_size).encode("ascii"),
                        content_digest.digest(),
                    )
                elif stat.S_ISDIR(before.st_mode):
                    try:
                        nested_descriptor = os.open(
                            entry.name,
                            os.O_RDONLY
                            | os.O_DIRECTORY
                            | os.O_NOFOLLOW
                            | os.O_NONBLOCK
                            | os.O_CLOEXEC,
                            dir_fd=directory_descriptor,
                        )
                    except OSError as error:
                        return open_race_failure(error)
                    try:
                        descriptor_before = os.fstat(nested_descriptor)
                        if not stat.S_ISDIR(
                            descriptor_before.st_mode
                        ) or not _same_scan_identity(before, descriptor_before):
                            return _snapshot_failure("repository-snapshot-unstable")
                        _digest_record(root_digest, relative_bytes, b"directory", mode)
                        nested_failure = scan(nested_descriptor, relative)
                        if nested_failure is not None:
                            return nested_failure
                        descriptor_after = os.fstat(nested_descriptor)
                    except (OSError, UnicodeError):
                        return _snapshot_failure("repository-snapshot-unreadable")
                    finally:
                        os.close(nested_descriptor)
                    after = path_identity(directory_descriptor, entry.name)
                    if (
                        after is None
                        or not _same_scan_identity(before, descriptor_after)
                        or not _same_scan_identity(before, after)
                    ):
                        return _snapshot_failure("repository-snapshot-unstable")
                elif stat.S_ISLNK(before.st_mode):
                    try:
                        link_descriptor = os.open(
                            entry.name,
                            os.O_PATH | os.O_NOFOLLOW | os.O_CLOEXEC,
                            dir_fd=directory_descriptor,
                        )
                    except OSError as error:
                        return open_race_failure(error)
                    try:
                        descriptor_before = os.fstat(link_descriptor)
                        if not stat.S_ISLNK(
                            descriptor_before.st_mode
                        ) or not _same_scan_identity(before, descriptor_before):
                            return _snapshot_failure("repository-snapshot-unstable")
                        target_bytes = os.fsencode(
                            os.readlink("", dir_fd=link_descriptor)
                        )
                        descriptor_after = os.fstat(link_descriptor)
                    except (OSError, UnicodeError):
                        return _snapshot_failure("repository-snapshot-unreadable")
                    finally:
                        os.close(link_descriptor)
                    after = path_identity(directory_descriptor, entry.name)
                    bound_failure = add_metadata(target_bytes)
                    if bound_failure is not None:
                        return bound_failure
                    if (
                        after is None
                        or not _same_scan_identity(before, descriptor_after)
                        or not _same_scan_identity(before, after)
                    ):
                        return _snapshot_failure("repository-snapshot-unstable")
                    _digest_record(
                        root_digest,
                        relative_bytes,
                        b"symlink",
                        mode,
                        target_bytes,
                    )
                else:
                    _digest_record(
                        root_digest,
                        relative_bytes,
                        _special_entry_type(before.st_mode),
                        mode,
                    )
        except (OSError, UnicodeError):
            return _snapshot_failure("repository-snapshot-unreadable")
        return None

    try:
        root_descriptor = os.open(
            repository,
            os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC,
        )
    except OSError:
        return _snapshot_failure("repository-snapshot-unreadable")
    try:
        failure = scan(root_descriptor, Path())
    finally:
        os.close(root_descriptor)
    if failure is not None:
        return failure
    return SnapshotSuccess(
        RepositorySnapshot(
            entry_count=entry_count,
            metadata_bytes=metadata_bytes,
            root_digest=root_digest.hexdigest(),
        )
    )


def _failure(
    change_id: str, code: str, executed_commands: tuple[str, ...]
) -> SmokeResult:
    return SmokeResult(False, code, change_id, executed_commands)


def _artifact_evidence(artifacts: tuple[Artifact, ...]) -> tuple[ArtifactEvidence, ...]:
    return tuple(
        ArtifactEvidence(artifact.kind.value, artifact.path, artifact.sha256)
        for artifact in artifacts
    )


def run_smoke(
    *,
    repository: Path,
    change_id: str,
    gsd_home: Path,
    runner: Callable[..., CommandResult] = subprocess_runner,
    snapshotter: Callable[[Path], SnapshotResult] = snapshot_repository,
) -> SmokeResult:
    """Run only the pinned read-only probes and reject any repository write."""

    executed: list[str] = []
    before = snapshotter(repository)
    if isinstance(before, SnapshotFailure):
        return _failure(change_id, before.issue.code, ())

    pending_code = "ok"
    evidence_values: (
        tuple[tuple[ArtifactEvidence, ...], int, int, int, str, bool, str] | None
    ) = None
    try:
        openspec_probe = collect_openspec_probe(runner, repository, change_id)
        executed.extend(
            (
                _READ_ONLY_COMMANDS[0],
                _READ_ONLY_COMMANDS[1].format(change_id=change_id),
            )
        )
        discovery = discover_openspec_artifacts(repository, change_id, openspec_probe)
        if isinstance(discovery, Failure):
            pending_code = discovery.issue.code
        elif discovery.route is not InputRoute.JSON:
            pending_code = "openspec-json-route-required"
        else:
            gsd_evidence = collect_gsd_probe(runner, repository, gsd_home)
            executed.append(_READ_ONLY_COMMANDS[2])
            gsd = parse_gsd_capability(repository, gsd_evidence)
            if isinstance(gsd, Failure):
                pending_code = gsd.issue.code
            else:
                evidence_values = (
                    _artifact_evidence(discovery.value.artifacts),
                    discovery.value.progress.total,
                    discovery.value.progress.complete,
                    discovery.value.progress.remaining,
                    gsd.value.probe,
                    gsd.value.project_initialized,
                    gsd.value.entrypoint,
                )
    except (OSError, UnicodeError, ValueError):
        pending_code = "read-only-probe-failed"

    after = snapshotter(repository)
    if isinstance(after, SnapshotFailure):
        return _failure(change_id, after.issue.code, tuple(executed))
    if before.value != after.value:
        return _failure(change_id, "repository-write-detected", tuple(executed))
    if pending_code != "ok" or evidence_values is None:
        return _failure(change_id, pending_code, tuple(executed))
    artifacts, total, complete, remaining, probe, initialized, entrypoint = (
        evidence_values
    )
    return SmokeResult(
        ok=True,
        code="ok",
        change_id=change_id,
        executed_commands=tuple(executed),
        evidence=SmokeEvidence(
            artifacts=artifacts,
            progress_total=total,
            progress_complete=complete,
            progress_remaining=remaining,
            gsd_probe=probe,
            gsd_initialized=initialized,
            gsd_entrypoint=entrypoint,
            snapshot=after.value,
        ),
    )


def _result_payload(result: SmokeResult) -> Mapping[str, object]:
    base: dict[str, object] = {
        "change_id": result.change_id,
        "code": result.code,
        "commands": list(result.executed_commands),
        "ok": result.ok,
    }
    evidence = result.evidence
    if not result.ok or evidence is None:
        return base
    base.update(
        {
            "artifacts": [
                {"kind": item.kind, "path": item.path, "sha256": item.sha256}
                for item in evidence.artifacts
            ],
            "gsd": {
                "entrypoint": evidence.gsd_entrypoint,
                "entrypoint_dry_run": False,
                "probe": evidence.gsd_probe,
                "project_initialized": evidence.gsd_initialized,
                "version": "1.5.0",
            },
            "openspec": {"route": "json", "version": "1.3.1"},
            "progress": {
                "complete": evidence.progress_complete,
                "remaining": evidence.progress_remaining,
                "total": evidence.progress_total,
            },
            "repository": {
                "entry_count": evidence.snapshot.entry_count,
                "metadata_bytes": evidence.snapshot.metadata_bytes,
                "root_digest": evidence.snapshot.root_digest,
                "write_detected": False,
            },
            "unverified": [
                {"item": item, "reason": "no-safe-dry-run"} for item in _UNVERIFIED
            ],
        }
    )
    return base


def render_json_result(result: SmokeResult) -> str:
    """Render one deterministic, bounded JSON object without local roots."""

    return json.dumps(
        _result_payload(result),
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def render_human_result(result: SmokeResult) -> str:
    """Render one concise status line without canonical or local path content."""

    status = "PASS" if result.ok else "FAIL"
    return f"[{status}] OpenSpec/GSD read-only smoke: {result.code}"
