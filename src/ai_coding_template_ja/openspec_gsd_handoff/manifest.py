"""Deterministic minimal manifest values and atomic local persistence."""

from __future__ import annotations

import json
import os
import re
import stat
import tempfile
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path, PurePosixPath
from typing import cast

from .models import (
    ClassifiedIssue,
    Failure,
    HandoffState,
    HostCapabilityInput,
    HostDispatch,
    HostSpawnSchema,
    IssueCategory,
    KnownState,
    NormalizedTask,
    Progress,
    Result,
    Success,
)
from .reader import DEFAULT_ARTIFACT_LIMITS

_CHANGE_ID = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
_HEX_40 = re.compile(r"[0-9a-f]{40}")
_HEX_64 = re.compile(r"[0-9a-f]{64}")
_ROOT_FIELDS = {
    "schema_version",
    "change_id",
    "handoff_state",
    "artifacts",
    "source_commit",
    "progress",
    "capabilities",
}
# A manifest can expand the bounded 1 MiB tasks Markdown through JSON escaping;
# eight source-file units leave room for the fixed 4096-task/64-artifact envelope.
MAX_MANIFEST_BYTES = DEFAULT_ARTIFACT_LIMITS.bytes_per_file * 8
MAX_TASK_DESCRIPTION_BYTES = DEFAULT_ARTIFACT_LIMITS.bytes_per_file


@dataclass(frozen=True)
class ManifestArtifact:
    """Content identity persisted without canonical artifact bodies."""

    kind: str
    path: str
    sha256: str


@dataclass(frozen=True)
class OpenSpecCapability:
    """Supported OpenSpec probe evidence."""

    version: str
    probe: str
    schema_name: str
    input_route: str


@dataclass(frozen=True)
class GsdCapability:
    """Supported GSD probe evidence and selected entrypoint."""

    version: str
    probe: str
    project_initialized: bool
    entrypoint: str


@dataclass(frozen=True)
class ManifestCapabilities:
    """Independent OpenSpec, GSD, and visible-host evidence."""

    openspec: OpenSpecCapability
    gsd: GsdCapability
    host: HostCapabilityInput


@dataclass(frozen=True)
class HandoffManifest:
    """The complete timestamp-free MVP persistence value."""

    schema_version: int
    change_id: str
    handoff_state: HandoffState
    artifacts: tuple[ManifestArtifact, ...]
    source_commit: str
    progress: Progress
    capabilities: ManifestCapabilities


class FailurePoint(StrEnum):
    """Stable persistence failure points."""

    STATE_GUARD = "state-guard"
    WRITE = "write"
    VALIDATE = "validate"
    REPLACE = "replace"


class StagingKnownState(StrEnum):
    """What is known about a staging file after an operation."""

    ABSENT = "absent"
    UNKNOWN = "unknown"
    INVALID = "invalid"
    VALIDATED = "validated"


class CleanupOutcome(StrEnum):
    """Evidence from one best-effort staging cleanup attempt."""

    NOT_NEEDED = "not-needed"
    REMOVED = "removed"
    FAILED = "failed"


@dataclass(frozen=True)
class ManifestPersistenceIssue:
    """Caller-visible persistence evidence without a recovery claim."""

    code: str
    failure_point: FailurePoint
    target_state: KnownState
    staging_state: StagingKnownState
    cleanup_outcome: CleanupOutcome


@dataclass(frozen=True)
class ManifestPersistenceFailure:
    """A failed persistence operation with no partial success value."""

    issue: ManifestPersistenceIssue


type ManifestPersistenceResult = Success[HandoffManifest] | ManifestPersistenceFailure


def _failure(code: str, *, known_state: KnownState = KnownState.UNKNOWN) -> Failure:
    return Failure(
        ClassifiedIssue(
            category=IssueCategory.PERSISTENCE,
            code=code,
            known_state=known_state,
        )
    )


def _exact_fields(value: object, fields: set[str]) -> Mapping[object, object] | None:
    if not isinstance(value, Mapping) or set(value) != fields:
        return None
    return value


def _parse_artifacts(
    value: object, change_id: str
) -> tuple[ManifestArtifact, ...] | None:
    if (
        not isinstance(value, Sequence)
        or isinstance(value, (str, bytes))
        or not 1 <= len(value) <= 64
    ):
        return None
    expected_root = PurePosixPath("openspec", "changes", change_id)
    artifacts: list[ManifestArtifact] = []
    canonical_paths: set[PurePosixPath] = set()
    for raw in value:
        item = _exact_fields(raw, {"kind", "path", "sha256"})
        if item is None:
            return None
        kind, path, sha256 = item["kind"], item["path"], item["sha256"]
        if (
            type(kind) is not str
            or kind not in {"proposal", "design", "spec", "tasks"}
            or type(path) is not str
            or type(sha256) is not str
            or _HEX_64.fullmatch(sha256) is None
        ):
            return None
        pure_path = PurePosixPath(path)
        if (
            path != pure_path.as_posix()
            or pure_path.is_absolute()
            or ".." in pure_path.parts
            or not pure_path.is_relative_to(expected_root)
            or pure_path.suffix != ".md"
        ):
            return None
        relative = pure_path.relative_to(expected_root)
        singleton_path = {
            "proposal": PurePosixPath("proposal.md"),
            "design": PurePosixPath("design.md"),
            "tasks": PurePosixPath("tasks.md"),
        }.get(kind)
        if singleton_path is not None and relative != singleton_path:
            return None
        if kind == "spec" and not (
            len(relative.parts) == 3
            and relative.parts[0] == "specs"
            and relative.parts[2] == "spec.md"
        ):
            return None
        if pure_path in canonical_paths:
            return None
        canonical_paths.add(pure_path)
        artifacts.append(ManifestArtifact(kind, pure_path.as_posix(), sha256))
    result = tuple(artifacts)
    if result != tuple(
        sorted(
            result,
            key=lambda artifact: (artifact.kind, PurePosixPath(artifact.path)),
        )
    ):
        return None
    kinds = [artifact.kind for artifact in result]
    if kinds.count("proposal") != 1 or kinds.count("design") != 1:
        return None
    if kinds.count("tasks") != 1 or kinds.count("spec") < 1:
        return None
    return result


def _parse_progress(value: object) -> Progress | None:
    progress = _exact_fields(value, {"total", "complete", "remaining", "tasks"})
    if progress is None:
        return None
    total = progress["total"]
    complete = progress["complete"]
    remaining = progress["remaining"]
    raw_tasks = progress["tasks"]
    if (
        type(total) is not int
        or type(complete) is not int
        or type(remaining) is not int
        or not 1 <= total <= 4096
        or complete < 0
        or remaining < 0
        or total != complete + remaining
        or not isinstance(raw_tasks, Sequence)
        or isinstance(raw_tasks, (str, bytes))
        or len(raw_tasks) != total
    ):
        return None
    tasks: list[NormalizedTask] = []
    description_bytes = 0
    for index, raw in enumerate(raw_tasks, start=1):
        item = _exact_fields(raw, {"id", "description", "done"})
        if item is None:
            return None
        task_id, description, done = item["id"], item["description"], item["done"]
        if (
            task_id != str(index)
            or type(description) is not str
            or not description.strip()
            or type(done) is not bool
        ):
            return None
        try:
            description_bytes += len(description.encode("utf-8"))
        except UnicodeEncodeError:
            return None
        if description_bytes > MAX_TASK_DESCRIPTION_BYTES:
            return None
        tasks.append(
            NormalizedTask(
                cast(str, task_id),
                cast(str, description),
                cast(bool, done),
            )
        )
    if sum(task.done for task in tasks) != complete:
        return None
    return Progress(total, complete, remaining, tuple(tasks))


def _parse_capabilities(value: object) -> ManifestCapabilities | None:
    capabilities = _exact_fields(value, {"openspec", "gsd", "host"})
    if capabilities is None:
        return None
    openspec = _exact_fields(
        capabilities["openspec"],
        {"version", "probe", "schema_name", "input_route"},
    )
    gsd = _exact_fields(
        capabilities["gsd"],
        {"version", "probe", "project_initialized", "entrypoint"},
    )
    host = _exact_fields(
        capabilities["host"],
        {"spawn_agent_schema", "dispatch", "agent_role_source"},
    )
    if openspec is None or gsd is None or host is None:
        return None
    route = openspec["input_route"]
    initialized = gsd["project_initialized"]
    entrypoint = gsd["entrypoint"]
    role_source = host["agent_role_source"]
    try:
        spawn_schema = HostSpawnSchema(host["spawn_agent_schema"])
        dispatch = HostDispatch(host["dispatch"])
    except (ValueError, TypeError):
        return None
    if (
        openspec["version"] != "1.3.1"
        or openspec["probe"] != "instructions-apply-json"
        or openspec["schema_name"] != "spec-driven"
        or route not in {"json", "markdown-fallback"}
        or gsd["version"] != "1.5.0"
        or gsd["probe"] != "init-progress-raw"
        or type(initialized) is not bool
        or type(entrypoint) is not str
        or entrypoint != ("gsd-phase" if initialized else "gsd-new-project-auto")
        or (role_source is not None and type(role_source) is not str)
    ):
        return None
    if spawn_schema is HostSpawnSchema.TYPED:
        if dispatch is not HostDispatch.TYPED or role_source is not None:
            return None
    elif dispatch is not HostDispatch.GENERIC_AGENT_WORKAROUND or role_source != "toml":
        return None
    return ManifestCapabilities(
        openspec=OpenSpecCapability(
            "1.3.1", "instructions-apply-json", "spec-driven", cast(str, route)
        ),
        gsd=GsdCapability("1.5.0", "init-progress-raw", initialized, entrypoint),
        host=HostCapabilityInput(True, spawn_schema, dispatch, role_source),
    )


def parse_manifest_bytes(data: bytes) -> Result[HandoffManifest]:
    """Parse only the complete MVP schema; unknown fields fail closed."""

    if len(data) > MAX_MANIFEST_BYTES:
        return _failure("manifest-size-limit-exceeded")
    try:
        raw = json.loads(data)
    except (json.JSONDecodeError, UnicodeDecodeError, TypeError):
        return _failure("manifest-json-invalid")
    root = _exact_fields(raw, _ROOT_FIELDS)
    if root is None:
        return _failure("manifest-fields-invalid")
    if root["schema_version"] != 1 or type(root["schema_version"]) is not int:
        return _failure("manifest-schema-unsupported")
    change_id = root["change_id"]
    source_commit = root["source_commit"]
    try:
        state = HandoffState(root["handoff_state"])
    except (ValueError, TypeError):
        return _failure("manifest-state-invalid")
    if (
        type(change_id) is not str
        or _CHANGE_ID.fullmatch(change_id) is None
        or len(change_id.encode("ascii")) > 128
        or type(source_commit) is not str
        or _HEX_40.fullmatch(source_commit) is None
    ):
        return _failure("manifest-identity-invalid")
    artifacts = _parse_artifacts(root["artifacts"], change_id)
    progress = _parse_progress(root["progress"])
    capabilities = _parse_capabilities(root["capabilities"])
    if artifacts is None or progress is None or capabilities is None:
        return _failure("manifest-value-invalid")
    return Success(
        HandoffManifest(
            schema_version=1,
            change_id=change_id,
            handoff_state=state,
            artifacts=artifacts,
            source_commit=source_commit,
            progress=progress,
            capabilities=capabilities,
        )
    )


def _json_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def serialize_manifest(manifest: HandoffManifest) -> Result[bytes]:
    """Return canonical fixture-compatible bytes after complete validation."""

    host = manifest.capabilities.host
    openspec = manifest.capabilities.openspec
    gsd = manifest.capabilities.gsd
    lines = [
        "{",
        f'  "schema_version": {manifest.schema_version},',
        f'  "change_id": {_json_string(manifest.change_id)},',
        f'  "handoff_state": {_json_string(manifest.handoff_state.value)},',
        '  "artifacts": [',
    ]
    for index, artifact in enumerate(manifest.artifacts):
        comma = "," if index + 1 < len(manifest.artifacts) else ""
        lines.extend(
            [
                "    {",
                f'      "kind": {_json_string(artifact.kind)},',
                f'      "path": {_json_string(artifact.path)},',
                f'      "sha256": {_json_string(artifact.sha256)}',
                f"    }}{comma}",
            ]
        )
    lines.extend(
        [
            "  ],",
            f'  "source_commit": {_json_string(manifest.source_commit)},',
            '  "progress": {',
            f'    "total": {manifest.progress.total},',
            f'    "complete": {manifest.progress.complete},',
            f'    "remaining": {manifest.progress.remaining},',
            '    "tasks": [',
        ]
    )
    for index, task in enumerate(manifest.progress.tasks):
        comma = "," if index + 1 < len(manifest.progress.tasks) else ""
        task_json = json.dumps(
            {"id": task.id, "description": task.description, "done": task.done},
            ensure_ascii=False,
            separators=(", ", ": "),
        )
        lines.append(f"      {task_json}{comma}")
    lines.extend(
        [
            "    ]",
            "  },",
            '  "capabilities": {',
            '    "openspec": {',
            f'      "version": {_json_string(openspec.version)},',
            f'      "probe": {_json_string(openspec.probe)},',
            f'      "schema_name": {_json_string(openspec.schema_name)},',
            f'      "input_route": {_json_string(openspec.input_route)}',
            "    },",
            '    "gsd": {',
            f'      "version": {_json_string(gsd.version)},',
            f'      "probe": {_json_string(gsd.probe)},',
            f'      "project_initialized": {str(gsd.project_initialized).lower()},',
            f'      "entrypoint": {_json_string(gsd.entrypoint)}',
            "    },",
            '    "host": {',
            '      "spawn_agent_schema": '
            f"{_json_string(host.spawn_agent_schema.value)},",
            f'      "dispatch": {_json_string(host.dispatch.value)},',
            '      "agent_role_source": '
            + (
                "null"
                if host.agent_role_source is None
                else _json_string(host.agent_role_source)
            ),
            "    }",
            "  }",
            "}",
        ]
    )
    data = ("\n".join(lines) + "\n").encode()
    parsed = parse_manifest_bytes(data)
    if isinstance(parsed, Failure) or parsed.value != manifest:
        return _failure("manifest-serialization-invalid")
    return Success(data)


class ManifestFileOperations:
    """Small injectable filesystem boundary for atomic-write fault tests."""

    def make_parent(self, path: Path) -> None:
        path.mkdir(parents=True, exist_ok=True)

    def exists(self, path: Path) -> bool:
        return path.exists()

    def read_bounded_bytes(
        self, path: Path, *, limit: int = MAX_MANIFEST_BYTES
    ) -> bytes:
        with path.open("rb") as stream:
            data = stream.read(limit + 1)
        if len(data) > limit:
            raise ManifestSizeLimitExceeded
        return data

    def create_staging(self, parent: Path) -> Path:
        descriptor, name = tempfile.mkstemp(
            prefix=".handoff.", suffix=".tmp", dir=parent
        )
        os.close(descriptor)
        return Path(name)

    def write_bytes(self, path: Path, data: bytes) -> None:
        path.write_bytes(data)

    def replace(self, source: Path, target: Path) -> None:
        os.replace(source, target)

    def unlink(self, path: Path) -> None:
        path.unlink()


class ManifestSizeLimitExceeded(ValueError):
    """A manifest crossed the source-derived in-memory parsing envelope."""


def read_manifest_file(
    path: Path, *, operations: ManifestFileOperations | None = None
) -> Result[HandoffManifest]:
    """Read one manifest with limit-plus-one before attempting JSON parsing."""

    filesystem = operations or ManifestFileOperations()
    try:
        data = filesystem.read_bounded_bytes(path)
    except ManifestSizeLimitExceeded:
        return _failure("manifest-size-limit-exceeded")
    except OSError:
        return _failure("manifest-read-failed")
    return parse_manifest_bytes(data)


def _known_state(
    manifest: HandoffManifest | None, *, unreadable: bool = False
) -> KnownState:
    if unreadable:
        return KnownState.UNKNOWN
    if manifest is None:
        return KnownState.MANIFEST_ABSENT
    if manifest.handoff_state is HandoffState.PREPARED:
        return KnownState.PREPARED
    return KnownState.STARTED


class ManifestRepository:
    """Guard state, validate closed staging bytes, then atomically replace."""

    def __init__(
        self, target: Path, *, operations: ManifestFileOperations | None = None
    ) -> None:
        self.target = target
        self.operations = operations or ManifestFileOperations()

    def _failure(
        self,
        code: str,
        point: FailurePoint,
        target_state: KnownState,
        staging_state: StagingKnownState,
        staging: Path | None,
    ) -> ManifestPersistenceFailure:
        cleanup = CleanupOutcome.NOT_NEEDED
        if staging is not None:
            try:
                self.operations.unlink(staging)
            except OSError:
                cleanup = CleanupOutcome.FAILED
            else:
                cleanup = CleanupOutcome.REMOVED
        return ManifestPersistenceFailure(
            ManifestPersistenceIssue(
                code=code,
                failure_point=point,
                target_state=target_state,
                staging_state=staging_state,
                cleanup_outcome=cleanup,
            )
        )

    def _existing(
        self,
    ) -> tuple[HandoffManifest | None, KnownState, str | None]:
        if not self.operations.exists(self.target):
            return None, KnownState.MANIFEST_ABSENT, None
        parsed = read_manifest_file(self.target, operations=self.operations)
        if isinstance(parsed, Failure):
            return None, KnownState.UNKNOWN, parsed.issue.code
        return parsed.value, _known_state(parsed.value), None

    def _target_parent_is_safe(self, change_id: str) -> bool:
        """Reject static symlink escapes before any persistence mutation."""

        expected_tail = (".planning", "openspec", change_id, "handoff.json")
        if tuple(self.target.parts[-4:]) != expected_tail:
            return False
        repository_root = self.target.parents[3]
        try:
            resolved_root = repository_root.resolve(strict=True)
        except OSError:
            return False
        current = repository_root
        for component in expected_tail[:-1]:
            current /= component
            try:
                mode = current.lstat().st_mode
            except FileNotFoundError:
                break
            except OSError:
                return False
            if stat.S_ISLNK(mode) or not stat.S_ISDIR(mode):
                return False
        try:
            if self.target.is_symlink():
                return False
            resolved_parent = self.target.parent.resolve(strict=False)
        except OSError:
            return False
        return resolved_parent.is_relative_to(resolved_root)

    def persist(
        self,
        manifest: HandoffManifest,
        *,
        expected_existing: HandoffState | None = None,
    ) -> ManifestPersistenceResult:
        """Persist prepared or one caller-authorized prepared-to-started transition."""

        if not self._target_parent_is_safe(manifest.change_id):
            return self._failure(
                "manifest-target-unsafe",
                FailurePoint.STATE_GUARD,
                KnownState.UNKNOWN,
                StagingKnownState.ABSENT,
                None,
            )
        serialized = serialize_manifest(manifest)
        if isinstance(serialized, Failure):
            return self._failure(
                serialized.issue.code,
                FailurePoint.STATE_GUARD,
                KnownState.UNKNOWN,
                StagingKnownState.ABSENT,
                None,
            )
        existing, target_state, existing_issue = self._existing()
        if existing_issue is not None:
            return self._failure(
                existing_issue,
                FailurePoint.STATE_GUARD,
                target_state,
                StagingKnownState.ABSENT,
                None,
            )
        valid_prepare = (
            existing is None
            and target_state is KnownState.MANIFEST_ABSENT
            and expected_existing is None
            and manifest.handoff_state is HandoffState.PREPARED
        )
        valid_start = (
            existing is not None
            and expected_existing is HandoffState.PREPARED
            and existing.handoff_state is HandoffState.PREPARED
            and manifest.handoff_state is HandoffState.STARTED
            and manifest
            == HandoffManifest(
                schema_version=existing.schema_version,
                change_id=existing.change_id,
                handoff_state=HandoffState.STARTED,
                artifacts=existing.artifacts,
                source_commit=existing.source_commit,
                progress=existing.progress,
                capabilities=existing.capabilities,
            )
        )
        if not (valid_prepare or valid_start):
            return self._failure(
                "manifest-state-guard-rejected",
                FailurePoint.STATE_GUARD,
                target_state,
                StagingKnownState.ABSENT,
                None,
            )

        staging: Path | None = None
        try:
            self.operations.make_parent(self.target.parent)
            staging = self.operations.create_staging(self.target.parent)
            self.operations.write_bytes(staging, serialized.value)
        except OSError:
            return self._failure(
                "manifest-staging-write-failed",
                FailurePoint.WRITE,
                target_state,
                StagingKnownState.UNKNOWN,
                staging,
            )
        try:
            staged = parse_manifest_bytes(self.operations.read_bounded_bytes(staging))
        except (ManifestSizeLimitExceeded, OSError):
            staged = _failure("manifest-staging-read-failed")
        if isinstance(staged, Failure) or staged.value != manifest:
            return self._failure(
                "manifest-staging-validation-failed",
                FailurePoint.VALIDATE,
                target_state,
                StagingKnownState.INVALID,
                staging,
            )
        try:
            self.operations.replace(staging, self.target)
        except OSError:
            return self._failure(
                "manifest-replace-failed",
                FailurePoint.REPLACE,
                target_state,
                StagingKnownState.VALIDATED,
                staging,
            )
        return Success(manifest)
