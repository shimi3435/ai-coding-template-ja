"""Fixed and property evidence for the read-only started-v2 refresh preview."""

from __future__ import annotations

import fcntl
import hashlib
import json
import os
import shutil
import subprocess
from dataclasses import replace
from pathlib import Path
from typing import Any, cast

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from ai_coding_template_ja.openspec_gsd_handoff.execution_mapping import (
    read_planning_inventory,
)
from ai_coding_template_ja.openspec_gsd_handoff.manifest import (
    HandoffManifest,
    serialize_manifest,
)
from ai_coding_template_ja.openspec_gsd_handoff.manifest_migration import (
    ManifestMigrationFailure,
    ManifestMigrationFileOperations,
    MigrationCleanupOutcome,
    MigrationFailurePoint,
    MigrationStagingState,
    MigrationTargetState,
    _ReplaceOutcome,
    _WriterLockToken,
    apply_manifest_migration,
    preview_manifest_migration,
)
from ai_coding_template_ja.openspec_gsd_handoff.manifest_refresh import (
    ManifestRefreshFailure,
    ManifestRefreshFileOperations,
    RefreshCandidateChange,
    RefreshCleanupOutcome,
    RefreshFailurePoint,
    RefreshLimits,
    RefreshStagingState,
    RefreshTargetState,
    apply_manifest_refresh,
    preview_manifest_refresh,
    serialize_manifest_refresh_preview,
)
from ai_coding_template_ja.openspec_gsd_handoff.manifest_v2 import (
    parse_manifest_v2_bytes,
    serialize_manifest_v2,
)
from ai_coding_template_ja.openspec_gsd_handoff.models import (
    ClassifiedIssue,
    Failure,
    HandoffState,
    IssueCategory,
    KnownState,
    Success,
)
from ai_coding_template_ja.openspec_gsd_handoff.policy_reference import (
    observe_policy_sections,
    read_policy_reference_registry,
)
from ai_coding_template_ja.openspec_gsd_handoff.progress import parse_task_progress
from ai_coding_template_ja.openspec_gsd_handoff.source_identity import (
    ExplicitSourceMatch,
    SourceCategory,
)

REPOSITORY_ROOT = Path(__file__).parents[1]
CHANGE_ID = "harden-openspec-gsd-handoff-lifecycle"
HANDOFF_PATH = f".planning/openspec/{CHANGE_ID}/handoff.json"
TASKS_PATH = f"openspec/changes/{CHANGE_ID}/tasks.md"
SOURCE_PATH = (
    f"openspec/changes/{CHANGE_ID}/specs/"
    "openspec-gsd-handoff-lifecycle-hardening/spec.md"
)
ASSIGNMENT_PATH = (
    "tests/fixtures/openspec_gsd_handoff/mapping/hardening-phase-assignments.json"
)
POLICY_REGISTRY_PATH = "docs/agents/adaptive-change-execution.references.json"
SOURCE_COMMIT = "9a7a313d06ae6df1c102f2515a3ad4bd5c0ca901"
ALTERNATE_SOURCE_COMMIT = "41b853fa81d2387647bf18dc1a1d8a5dd21a308c"
HISTORICAL_HANDOFF_SHA256 = (
    "6cc9bcf4caa3f9f839742f6d86660a8039c2370cf5cf7d054ba04199e3775fc5"
)
PUBLISHED_HANDOFF_SHA256 = (
    "d2425591c60355594e65253cf2bcc56424160ab677ccd93605f8606f6a940b48"
)
TRACKED_TASKS_SHA256 = (
    "c12d93a780b03bcf8b1c8a3c1df888f53433b5f5399528d3f1f23699f11a3935"
)
HISTORICAL_ASSIGNMENT_SHA256 = (
    "73443cb463a83ff8c37af80670bcb444371687bf9cda3c947556b28f3e1b550f"
)
POST_SOURCE_COMMIT_TASK_IDS: tuple[str, ...] = ()
REFRESH_EVIDENCE_PATH = (
    ".planning/phases/03-lifecycle-drift-gate/03-REFRESH-PREVIEW.json"
)
EXPECTED = json.loads(
    (
        REPOSITORY_ROOT
        / "tests/fixtures/openspec_gsd_handoff/manifest/expected-refresh-preview.json"
    ).read_text(encoding="utf-8")
)


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _compact_json(value: object) -> bytes:
    return (
        json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n"
    ).encode()


def _refresh_evidence() -> dict[str, object]:
    value = json.loads((REPOSITORY_ROOT / REFRESH_EVIDENCE_PATH).read_bytes())
    assert isinstance(value, dict)
    return value


def _source_pinned_tasks_bytes(tasks_bytes: bytes | None = None) -> bytes:
    current = (
        (REPOSITORY_ROOT / TASKS_PATH).read_bytes()
        if tasks_bytes is None
        else tasks_bytes
    )
    for task_id in POST_SOURCE_COMMIT_TASK_IDS:
        checked_marker = f"- [x] {task_id} ".encode()
        unchecked_marker = f"- [ ] {task_id} ".encode()
        assert current.count(checked_marker) + current.count(unchecked_marker) == 1
        current = current.replace(checked_marker, unchecked_marker, 1)
    assert _sha256(current) == TRACKED_TASKS_SHA256
    return current


def _published_manifest():
    evidence = _refresh_evidence()
    preview = evidence["preview"]
    assert isinstance(preview, dict)
    candidate_bytes = preview["candidate_bytes_utf8"].encode()
    assert _sha256(candidate_bytes) == PUBLISHED_HANDOFF_SHA256
    parsed = parse_manifest_v2_bytes(candidate_bytes)
    assert isinstance(parsed, Success)
    return parsed.value


def _historical_manifest_bytes() -> bytes:
    evidence = _refresh_evidence()
    preview = evidence["preview"]
    assert isinstance(preview, dict)
    assert preview["observed_source_commit"] == (
        "4d8b5b173927ed518d39dee18a29b0271628afbd"
    )
    raw = json.loads(preview["candidate_bytes_utf8"])
    raw["artifacts"] = preview["previous_artifacts"]
    raw["source_commit"] = preview["observed_source_commit"]
    raw["progress"] = preview["previous_progress"]
    raw["source_items"] = preview["previous_source_items"]
    raw["mappings"] = preview["previous_mappings"]
    parsed = parse_manifest_v2_bytes(_compact_json(raw))
    assert isinstance(parsed, Success)
    serialized = serialize_manifest_v2(parsed.value)
    assert isinstance(serialized, Success)
    assert _sha256(serialized.value) == HISTORICAL_HANDOFF_SHA256
    return serialized.value


def _inputs():
    manifest = _published_manifest()
    artifacts = manifest.artifacts
    for artifact in artifacts:
        artifact_bytes = (
            _source_pinned_tasks_bytes()
            if artifact.path == TASKS_PATH
            else (REPOSITORY_ROOT / artifact.path).read_bytes()
        )
        assert _sha256(artifact_bytes) == artifact.sha256
    progress = parse_task_progress(_source_pinned_tasks_bytes().decode("utf-8"))
    assert isinstance(progress, Success)
    assert progress.value == manifest.progress
    registry = read_policy_reference_registry(REPOSITORY_ROOT, POLICY_REGISTRY_PATH)
    assert isinstance(registry, Success)
    observations = observe_policy_sections(REPOSITORY_ROOT, registry.value)
    assert isinstance(observations, Success)
    inventory = read_planning_inventory(
        REPOSITORY_ROOT,
        ASSIGNMENT_PATH,
        policy_observations=observations.value,
    )
    assert isinstance(inventory, Success)
    return manifest, artifacts, progress.value, inventory.value, registry.value


def _repository(
    tmp_path: Path,
    manifest_bytes: bytes | None = None,
    *,
    seed_source_commit: bool = True,
) -> tuple[Path, Path]:
    repository = tmp_path / "repository"
    manifest, _, _, _, _ = _inputs()
    for artifact in manifest.artifacts:
        target = repository / artifact.path
        target.parent.mkdir(parents=True, exist_ok=True)
        artifact_bytes = (
            _source_pinned_tasks_bytes()
            if artifact.path == TASKS_PATH
            else (REPOSITORY_ROOT / artifact.path).read_bytes()
        )
        assert _sha256(artifact_bytes) == artifact.sha256
        target.write_bytes(artifact_bytes)
    registry = read_policy_reference_registry(REPOSITORY_ROOT, POLICY_REGISTRY_PATH)
    assert isinstance(registry, Success)
    for relative_path in {
        POLICY_REGISTRY_PATH,
        ASSIGNMENT_PATH,
        *(item.source_path for item in registry.value.references),
    }:
        source = REPOSITORY_ROOT / relative_path
        destination = repository / relative_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
    target = repository / HANDOFF_PATH
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(
        manifest_bytes if manifest_bytes is not None else _historical_manifest_bytes()
    )
    (repository / ".planning/phases/02-source-to-execution-mapping").mkdir(
        parents=True, exist_ok=True
    )
    if seed_source_commit:
        subprocess.run(  # noqa: S603 - fixed Git argv against isolated test paths
            ("git", "init", "--quiet", repository),
            check=True,
        )
        subprocess.run(  # noqa: S603 - fixed Git argv against isolated test paths
            (
                "git",
                "-C",
                repository,
                "fetch",
                "--quiet",
                "--no-tags",
                REPOSITORY_ROOT,
                SOURCE_COMMIT,
                ALTERNATE_SOURCE_COMMIT,
            ),
            check=True,
        )
    return repository, target


class MutationRecordingRefreshOperations(ManifestRefreshFileOperations):
    """Use real isolated persistence while recording every mutating boundary."""

    def __init__(self) -> None:
        self.mutations: list[str] = []
        self.repository_reads: list[str] = []

    def read_repository_bytes_at(
        self,
        repository_anchor,
        relative_path: Path,
        *,
        limit: int,
    ) -> bytes:
        self.repository_reads.append(relative_path.as_posix())
        return super().read_repository_bytes_at(
            repository_anchor,
            relative_path,
            limit=limit,
        )

    def create_staging_at(self, parent_descriptor: int, parent: Path) -> str:
        self.mutations.append("create")
        return super().create_staging_at(parent_descriptor, parent)

    def write_bytes_at(self, parent_descriptor: int, name: str, data: bytes) -> None:
        self.mutations.append("write")
        super().write_bytes_at(parent_descriptor, name, data)

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
        self.mutations.append("replace")
        return super().replace_at(
            parent_descriptor,
            parent,
            source_name,
            target_name,
            lock_token=lock_token,
            expected_target_sha256=expected_target_sha256,
        )

    def unlink_at(self, parent_descriptor: int, name: str) -> None:
        self.mutations.append("unlink")
        super().unlink_at(parent_descriptor, name)


class RepositoryResolutionProbe:
    def __init__(self) -> None:
        self.probes = 0

    def resolve(self, *, strict: bool = False) -> Path:
        self.probes += 1
        raise AssertionError("repository resolution must not be reached")


class FilesystemForbiddenRefreshOperations(ManifestRefreshFileOperations):
    def __init__(self) -> None:
        self.probes = 0

    def __getattribute__(self, name: str) -> Any:
        if name == "probes":
            return object.__getattribute__(self, name)
        probes = object.__getattribute__(self, "probes")
        object.__setattr__(self, "probes", probes + 1)
        raise AssertionError(f"filesystem operation must not be reached: {name}")


class FaultInjectingRefreshOperations(MutationRecordingRefreshOperations):
    """Inject exactly one refresh persistence fault in an isolated repository."""

    def __init__(self, fault: str, target: Path) -> None:
        super().__init__()
        self.fault = fault
        self.target = target
        self.staging_name: str | None = None

    def create_staging_at(self, parent_descriptor: int, parent: Path) -> str:
        if self.fault == "create":
            self.mutations.append("create")
            raise OSError("injected refresh create failure")
        name = super().create_staging_at(parent_descriptor, parent)
        self.staging_name = name
        return name

    def write_bytes_at(self, parent_descriptor: int, name: str, data: bytes) -> None:
        if self.fault in {"write", "cleanup"}:
            self.mutations.append("write")
            ManifestRefreshFileOperations.write_bytes_at(
                self, parent_descriptor, name, b"{"
            )
            raise OSError("injected refresh write failure")
        if self.fault == "validate":
            self.mutations.append("write")
            ManifestRefreshFileOperations.write_bytes_at(
                self, parent_descriptor, name, b"{}"
            )
            return
        super().write_bytes_at(parent_descriptor, name, data)

    def read_bounded_bytes_at(
        self,
        parent_descriptor: int,
        name: str,
        *,
        limit: int = 8 * 1024 * 1024,
    ) -> bytes:
        if self.fault == "reread" and name == self.staging_name:
            raise OSError("injected refresh staging reread failure")
        return super().read_bounded_bytes_at(parent_descriptor, name, limit=limit)

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
        if self.fault.startswith("replace-"):
            self.mutations.append("replace")
            if self.fault == "replace-changed":
                self.target.write_bytes(b"changed during refresh replace")
            elif self.fault == "replace-unreadable":
                self.target.unlink()
            elif self.fault == "replace-oversized":
                self.target.write_bytes(b"x" * (8 * 1024 * 1024 + 1))
            raise OSError("injected refresh replace failure")
        return super().replace_at(
            parent_descriptor,
            parent,
            source_name,
            target_name,
            lock_token=lock_token,
            expected_target_sha256=expected_target_sha256,
        )

    def unlink_at(self, parent_descriptor: int, name: str) -> None:
        if self.fault == "cleanup":
            self.mutations.append("unlink")
            raise OSError("injected refresh cleanup failure")
        super().unlink_at(parent_descriptor, name)


class FalseyFaultInjectingRefreshOperations(FaultInjectingRefreshOperations):
    """A valid refresh adapter whose truth value must not control injection."""

    def __bool__(self) -> bool:
        return False


class DriftAtReplaceRefreshOperations(MutationRecordingRefreshOperations):
    """Change one preview-bound file after staging and before replacement."""

    def __init__(self, path: Path) -> None:
        super().__init__()
        self.path = path

    def before_replace_at(
        self,
        parent_descriptor: int,
        parent: Path,
        source_name: str,
        target_name: str,
    ) -> None:
        del parent_descriptor, parent, source_name, target_name
        if self.path.is_dir():
            shutil.rmtree(self.path)
            return
        self.path.write_bytes(self.path.read_bytes() + b"\nreplace-boundary drift\n")


class AfterLockedValidationTargetMutationOperations(MutationRecordingRefreshOperations):
    """Inject one raw target update at the internal replacement seam."""

    def __init__(self, target: Path, concurrent_bytes: bytes) -> None:
        super().__init__()
        self.target = target
        self.concurrent_bytes = concurrent_bytes
        self.lock_contended = False
        self.rename_events: list[str] = []

    def after_locked_target_validation_at(
        self,
        parent_descriptor: int,
        parent: Path,
        source_name: str,
        target_name: str,
    ) -> None:
        del parent_descriptor, source_name, target_name
        contender = os.open(parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            try:
                fcntl.flock(contender, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError:
                self.lock_contended = True
            else:
                fcntl.flock(contender, fcntl.LOCK_UN)
            self.target.write_bytes(self.concurrent_bytes)
        finally:
            os.close(contender)

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
        outcome = super().replace_at(
            parent_descriptor,
            parent,
            source_name,
            target_name,
            lock_token=lock_token,
            expected_target_sha256=expected_target_sha256,
        )
        if outcome is _ReplaceOutcome.REPLACED:
            self.rename_events.append("replace")
        return outcome


class MigrationMutationRecordingOperations(ManifestMigrationFileOperations):
    """Record migration effects used by the shared writer-lock regression."""

    def __init__(self) -> None:
        self.mutations: list[str] = []

    def create_staging_at(self, parent_descriptor: int, parent: Path) -> str:
        self.mutations.append("create")
        return super().create_staging_at(parent_descriptor, parent)

    def write_bytes_at(self, parent_descriptor: int, name: str, data: bytes) -> None:
        self.mutations.append("write")
        super().write_bytes_at(parent_descriptor, name, data)

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
        self.mutations.append("replace")
        return super().replace_at(
            parent_descriptor,
            parent,
            source_name,
            target_name,
            lock_token=lock_token,
            expected_target_sha256=expected_target_sha256,
        )

    def unlink_at(self, parent_descriptor: int, name: str) -> None:
        self.mutations.append("unlink")
        super().unlink_at(parent_descriptor, name)


def _preview(repository: Path, **overrides):
    _, artifacts, progress, inventory, registry = _inputs()
    arguments = {
        "current_source_commit": SOURCE_COMMIT,
        "current_artifacts": artifacts,
        "current_progress": progress,
        "source_paths": (SOURCE_PATH,),
        "planning_inventory": inventory,
        "policy_registry": registry,
    }
    arguments.update(overrides)
    return preview_manifest_refresh(repository, Path(HANDOFF_PATH), **arguments)


def _migration_preview_for_lock_test(repository: Path, target: Path):
    parsed = parse_manifest_v2_bytes(target.read_bytes())
    assert isinstance(parsed, Success)
    previous = parsed.value
    v1 = HandoffManifest(
        schema_version=1,
        change_id=previous.change_id,
        handoff_state=previous.handoff_state,
        artifacts=previous.artifacts,
        source_commit=previous.source_commit,
        progress=previous.progress,
        capabilities=previous.capabilities,
    )
    serialized = serialize_manifest(v1)
    assert isinstance(serialized, Success)
    target.write_bytes(serialized.value)
    current_artifacts = tuple(
        replace(
            artifact,
            sha256=_sha256((repository / artifact.path).read_bytes()),
        )
        for artifact in previous.artifacts
    )
    progress = parse_task_progress(
        (repository / TASKS_PATH).read_text(encoding="utf-8")
    )
    assert isinstance(progress, Success)
    preview = preview_manifest_migration(
        repository,
        Path(HANDOFF_PATH),
        current_source_commit=SOURCE_COMMIT,
        current_artifacts=current_artifacts,
        current_progress=progress.value,
        source_paths=(SOURCE_PATH,),
        previous_source_items=previous.source_items,
    )
    assert isinstance(preview, Success)
    return preview.value, serialized.value


def _assert_directory_lock_can_be_acquired(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        fcntl.flock(descriptor, fcntl.LOCK_UN)
    finally:
        os.close(descriptor)


def test_published_target_matches_exact_approved_refresh_evidence() -> None:
    target = REPOSITORY_ROOT / HANDOFF_PATH
    target_before = target.read_bytes()
    evidence = _refresh_evidence()
    assert set(evidence) == {
        "evidence_schema",
        "generation_mode",
        "apply_invoked",
        "mutation_operations",
        "preview_sha256",
        "target_observation",
        "tasks_observation",
        "assignment_observation",
        "staging_observation",
        "reconciliation",
        "mapping_coverage",
        "preview",
    }
    assert evidence["generation_mode"] == "read-only-preview-only"
    assert evidence["apply_invoked"] is False
    assert evidence["mutation_operations"] == []
    assert evidence["target_observation"] == {
        "path": HANDOFF_PATH,
        "before_sha256": HISTORICAL_HANDOFF_SHA256,
        "after_sha256": HISTORICAL_HANDOFF_SHA256,
        "unchanged": True,
    }
    assert evidence["tasks_observation"] == {
        "path": f"openspec/changes/{CHANGE_ID}/tasks.md",
        "before_sha256": TRACKED_TASKS_SHA256,
        "after_sha256": TRACKED_TASKS_SHA256,
        "unchanged": True,
    }
    assert evidence["assignment_observation"] == {
        "path": ASSIGNMENT_PATH,
        "before_sha256": HISTORICAL_ASSIGNMENT_SHA256,
        "after_sha256": HISTORICAL_ASSIGNMENT_SHA256,
        "unchanged": True,
        "candidate_mode": "in-memory-only",
    }
    assert evidence["staging_observation"] == {
        "pattern": ".handoff.*.tmp",
        "before": [],
        "after": [],
    }
    assert evidence["reconciliation"] == {
        "previous_active": 49,
        "candidate_active": 54,
        "created": 5,
        "updated": 2,
        "tombstoned": 0,
        "next_requirement_id": 7,
        "next_scenario_id": 49,
        "previous_scenarios": 43,
        "candidate_scenarios": 48,
    }
    assert evidence["mapping_coverage"] == {
        "previous_active": 49,
        "previous_mapped": 49,
        "candidate_active": 54,
        "candidate_mapped": 54,
    }
    preview = evidence["preview"]
    assert isinstance(preview, dict)
    candidate_text = preview["candidate_bytes_utf8"]
    assert isinstance(candidate_text, str)
    machine_bytes = _compact_json(preview)
    assert _sha256(machine_bytes) == evidence["preview_sha256"]
    candidate = parse_manifest_v2_bytes(candidate_text.encode())
    assert isinstance(candidate, Success)
    assert candidate.value.source_commit == SOURCE_COMMIT
    assert candidate.value.handoff_state is HandoffState.STARTED
    assert len(candidate.value.source_items.active) == 54
    assert len(candidate.value.mappings) == 54
    assert preview["assignment_inventory_sha256"] == (
        "46b18454f18a30f6cac738be43b474a76de533e4f81830c2c33fd3cd723cbb14"
    )
    assert target_before == candidate_text.encode()
    assert _sha256(target_before) == PUBLISHED_HANDOFF_SHA256
    assert target.read_bytes() == target_before
    assert not tuple(target.parent.glob(".handoff.*.tmp"))


def test_source_pinned_tasks_match_current_canonical_pin_exactly() -> None:
    pinned = _source_pinned_tasks_bytes()
    checked = (REPOSITORY_ROOT / TASKS_PATH).read_bytes()

    assert POST_SOURCE_COMMIT_TASK_IDS == ()
    assert checked == pinned
    assert _source_pinned_tasks_bytes(pinned) == pinned


def test_pinned_started_v2_builds_exact_complete_read_only_candidate(
    tmp_path: Path,
) -> None:
    repository, target = _repository(tmp_path)
    before = target.read_bytes()

    result = _preview(repository)

    assert isinstance(result, Success)
    preview = result.value
    assert preview.old_target_sha256 == EXPECTED["old_target_sha256"]
    assert len(preview.previous_source_items.active) == 49
    assert len(preview.candidate_source_items.active) == 54
    assert preview.candidate_source_items.tombstones == ()
    assert (
        preview.candidate_source_items.next_requirement_id,
        preview.candidate_source_items.next_scenario_id,
    ) == (7, 49)
    assert [
        change.source_id for change in preview.changes if change.kind == "created"
    ] == EXPECTED["created"]
    assert [
        change.source_id for change in preview.changes if change.kind == "updated"
    ] == EXPECTED["updated"]
    for source_id, fingerprints in EXPECTED["updated_fingerprints"].items():
        change = next(item for item in preview.changes if item.source_id == source_id)
        assert [
            change.previous_fingerprint,
            change.candidate_fingerprint,
        ] == fingerprints
    assert len(preview.candidate_mappings) == 54
    assert {item.source_id for item in preview.candidate_mappings} == {
        item.id for item in preview.candidate_source_items.active
    }
    assert preview.candidate_manifest.handoff_state is HandoffState.STARTED
    assert (
        preview.candidate_manifest.capabilities
        == preview.previous_manifest.capabilities
    )
    assert preview.candidate_manifest.ownership == preview.previous_manifest.ownership
    assert preview.candidate_manifest.lifecycle == preview.previous_manifest.lifecycle
    assert all(
        item.previous_sha256 == item.candidate_sha256
        for item in preview.protected_subtrees
    )
    assert preview.candidate_sha256 == EXPECTED["candidate_sha256"]
    assert (
        preview.assignment_inventory_sha256 == EXPECTED["assignment_inventory_sha256"]
    )
    assert json.loads(preview.candidate_bytes) == EXPECTED["candidate_manifest"]
    assert preview.candidate_bytes.decode() == EXPECTED["candidate_bytes_utf8"]
    assert target.read_bytes() == before


def test_refresh_preview_lists_created_updated_and_tombstoned_changes(
    tmp_path: Path,
) -> None:
    published = serialize_manifest_v2(_published_manifest())
    assert isinstance(published, Success)
    repository, _ = _repository(tmp_path, published.value)
    manifest, artifacts, progress, inventory, registry = _inputs()
    source = repository / SOURCE_PATH
    source_text = source.read_text(encoding="utf-8")
    removed_heading = (
        "#### Scenario: 完全な phase graph drift を分類して remediation を投影する"
    )
    removed_start = source_text.index(removed_heading)
    removed_end = source_text.index("\n#### Scenario:", removed_start)
    created_block = """#### Scenario: refresh preview に source removal を列挙する
- **WHEN** refresh candidate が active source identity を tombstone へ移す
- **THEN** approval evidence は exact before / after fingerprint を返す
"""
    source_text = (
        source_text[:removed_start] + created_block + source_text[removed_end:]
    )
    source.write_text(source_text, encoding="utf-8")

    current_artifacts = tuple(
        replace(item, sha256=_sha256((repository / item.path).read_bytes()))
        for item in artifacts
    )
    planning_inventory = replace(
        inventory,
        assignments=tuple(
            replace(item, source_id="SCN-000049")
            if item.source_id == "SCN-000048"
            else item
            for item in inventory.assignments
        ),
    )
    subprocess.run(  # noqa: S603 - fixed Git argv against isolated test paths
        (
            "git",
            "-C",
            str(repository),
            "add",
            "--",
            *(item.path for item in current_artifacts),
        ),
        check=True,
    )
    subprocess.run(  # noqa: S603 - fixed Git argv against isolated test paths
        (
            "git",
            "-C",
            str(repository),
            "-c",
            "user.name=Refresh Test",
            "-c",
            "user.email=refresh-test@example.invalid",
            "commit",
            "--quiet",
            "-m",
            "refresh preview source changes",
        ),
        check=True,
    )
    source_commit = subprocess.run(  # noqa: S603 - fixed Git argv
        ("git", "-C", str(repository), "rev-parse", "HEAD"),
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    explicit_matches = (
        ExplicitSourceMatch(
            source_path=SOURCE_PATH,
            normalized_heading=(
                "Requirement: HARD-R2 lifecycle 操作前に source と派生状態の "
                "drift を検査する"
            ),
            parent_locator=None,
            source_id="REQ-000002",
        ),
    )

    result = preview_manifest_refresh(
        repository,
        Path(HANDOFF_PATH),
        current_source_commit=source_commit,
        current_artifacts=current_artifacts,
        current_progress=progress,
        source_paths=(SOURCE_PATH,),
        planning_inventory=planning_inventory,
        policy_registry=registry,
        explicit_matches=explicit_matches,
    )

    assert isinstance(result, Success)
    assert result.value.previous_manifest == manifest
    assert result.value.changes == (
        RefreshCandidateChange(
            kind="created",
            source_id="SCN-000049",
            category=SourceCategory.SCENARIO,
            source_path=SOURCE_PATH,
            previous_fingerprint=None,
            candidate_fingerprint=(
                "b342de1d1a34c4b1ac1be9c46e57bb5b02483ef5ba13c00696a395bfb300e69b"
            ),
            reason="new-source-identity",
        ),
        RefreshCandidateChange(
            kind="updated",
            source_id="REQ-000002",
            category=SourceCategory.REQUIREMENT,
            source_path=SOURCE_PATH,
            previous_fingerprint=(
                "c398939e60d173dd6e099c75422c3b8d2030bf35edb712f85a01a6aca2739977"
            ),
            candidate_fingerprint=(
                "4ed623d00ded936d32de613f03e4dfd0722472cd9cfbc938d509cc473fa364a2"
            ),
            reason="source-content-changed",
        ),
        RefreshCandidateChange(
            kind="tombstoned",
            source_id="SCN-000048",
            category=SourceCategory.SCENARIO,
            source_path=SOURCE_PATH,
            previous_fingerprint=(
                "d7d3b413205009cfe54329c266c22df43e8a302e5d55de97a9a5328cdb7abdbd"
            ),
            candidate_fingerprint=(
                "d7d3b413205009cfe54329c266c22df43e8a302e5d55de97a9a5328cdb7abdbd"
            ),
            reason="source-removed",
        ),
    )
    assert len({item.source_id for item in result.value.changes}) == 3


def test_preview_uses_supplied_read_only_operations_boundary(tmp_path: Path) -> None:
    repository, _ = _repository(tmp_path)
    operations = MutationRecordingRefreshOperations()
    _, artifacts, _, _, _ = _inputs()

    result = _preview(repository, operations=operations)

    assert isinstance(result, Success)
    assert set(operations.repository_reads) == {
        HANDOFF_PATH,
        *(artifact.path for artifact in artifacts),
    }
    assert operations.repository_reads.count(HANDOFF_PATH) == 2
    assert all(
        operations.repository_reads.count(artifact.path) == 2 for artifact in artifacts
    )
    assert operations.mutations == []


@pytest.mark.parametrize(
    "current_source_commit",
    [
        pytest.param(None, id="none"),
        pytest.param(7, id="integer"),
        pytest.param(object(), id="arbitrary-object"),
    ],
)
def test_preview_rejects_non_string_source_commit_before_filesystem_work(
    current_source_commit: Any,
) -> None:
    repository: Any = RepositoryResolutionProbe()
    operations = FilesystemForbiddenRefreshOperations()
    _, artifacts, progress, inventory, registry = _inputs()

    result = preview_manifest_refresh(
        repository,
        Path(HANDOFF_PATH),
        current_source_commit=current_source_commit,
        current_artifacts=artifacts,
        current_progress=progress,
        source_paths=(SOURCE_PATH,),
        planning_inventory=inventory,
        policy_registry=registry,
        operations=operations,
    )

    assert result == Failure(
        ClassifiedIssue(
            IssueCategory.INPUT,
            "refresh-input-invalid",
            KnownState.UNKNOWN,
        )
    )
    assert repository.probes == 0
    assert operations.probes == 0


@pytest.mark.parametrize("git_state", ["missing", "unknown-commit", "blob-mismatch"])
def test_preview_rejects_unverified_source_pin_without_mutation(
    tmp_path: Path, git_state: str
) -> None:
    repository, target = _repository(
        tmp_path,
        seed_source_commit=git_state != "missing",
    )
    _, artifacts, _, _, _ = _inputs()
    overrides = {}
    if git_state == "unknown-commit":
        overrides["current_source_commit"] = "e" * 40
    elif git_state == "blob-mismatch":
        artifact = artifacts[0]
        artifact_path = repository / artifact.path
        artifact_path.write_bytes(
            artifact_path.read_bytes() + b"\nworking-tree drift\n"
        )
        overrides["current_artifacts"] = (
            replace(artifact, sha256=_sha256(artifact_path.read_bytes())),
            *artifacts[1:],
        )
    before = target.read_bytes()
    operations = MutationRecordingRefreshOperations()

    result = _preview(repository, operations=operations, **overrides)

    assert isinstance(result, Failure)
    assert result.issue.code == "refresh-source-pin-invalid"
    assert operations.mutations == []
    assert target.read_bytes() == before


@pytest.mark.parametrize(
    ("artifact_size", "expected_code"),
    [
        (4 * 1024 * 1024, None),
        (4 * 1024 * 1024 + 1, None),
        (8 * 1024 * 1024, None),
        (8 * 1024 * 1024 + 1, "refresh-artifact-limit-exceeded"),
    ],
    ids=("4-mib", "4-mib-plus-one", "8-mib", "8-mib-plus-one"),
)
def test_preview_source_pin_uses_the_refresh_artifact_boundary_without_mutation(
    tmp_path: Path,
    artifact_size: int,
    expected_code: str | None,
) -> None:
    repository, target = _repository(tmp_path)
    manifest, _, _, _, _ = _inputs()
    proposal = next(item for item in manifest.artifacts if item.kind == "proposal")
    (repository / proposal.path).write_bytes(b"x" * artifact_size)
    subprocess.run(  # noqa: S603 - fixed Git argv against isolated test paths
        (
            "git",
            "-C",
            repository,
            "-c",
            "user.name=Refresh Boundary Test",
            "-c",
            "user.email=refresh-boundary@example.invalid",
            "add",
            "--",
            *(item.path for item in manifest.artifacts),
        ),
        check=True,
    )
    subprocess.run(  # noqa: S603 - fixed Git argv against isolated test paths
        (
            "git",
            "-C",
            repository,
            "-c",
            "user.name=Refresh Boundary Test",
            "-c",
            "user.email=refresh-boundary@example.invalid",
            "commit",
            "--quiet",
            "-m",
            "seed refresh boundary",
        ),
        check=True,
    )
    source_commit = subprocess.run(  # noqa: S603 - fixed isolated Git argv
        ("git", "-C", repository, "rev-parse", "HEAD"),
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    artifacts = tuple(
        replace(
            item,
            sha256=_sha256((repository / item.path).read_bytes()),
        )
        for item in manifest.artifacts
    )
    before = target.read_bytes()
    operations = MutationRecordingRefreshOperations()

    result = _preview(
        repository,
        current_source_commit=source_commit,
        current_artifacts=artifacts,
        operations=operations,
    )

    if expected_code is None:
        assert isinstance(result, Success)
    else:
        assert isinstance(result, Failure)
        assert result.issue.code == expected_code
    assert operations.mutations == []
    assert target.read_bytes() == before


@pytest.mark.parametrize(
    ("case", "expected_code"),
    [
        ("prepared", "refresh-target-not-started"),
        ("unknown-schema", "refresh-target-schema-invalid"),
        ("incomplete-mapping", "refresh-mapping-source-coverage-incomplete"),
        ("stale-artifact", "refresh-artifact-hash-mismatch"),
    ],
)
def test_refresh_rejects_incomplete_or_stale_inputs_without_mutation(
    tmp_path: Path, case: str, expected_code: str
) -> None:
    manifest, artifacts, _, inventory, _ = _inputs()
    manifest_bytes = (REPOSITORY_ROOT / HANDOFF_PATH).read_bytes()
    overrides = {}
    if case == "prepared":
        serialized = serialize_manifest_v2(
            replace(manifest, handoff_state=HandoffState.PREPARED)
        )
        assert isinstance(serialized, Success)
        manifest_bytes = serialized.value
    elif case == "unknown-schema":
        raw = json.loads(manifest_bytes)
        raw["schema_version"] = 3
        manifest_bytes = (json.dumps(raw) + "\n").encode()
    elif case == "incomplete-mapping":
        overrides["planning_inventory"] = replace(
            inventory, assignments=inventory.assignments[:-1]
        )
    elif case == "stale-artifact":
        overrides["current_artifacts"] = (
            replace(artifacts[0], sha256="0" * 64),
            *artifacts[1:],
        )
    repository, target = _repository(tmp_path, manifest_bytes)
    before = target.read_bytes()

    result = _preview(repository, **overrides)

    assert isinstance(result, Failure)
    assert result.issue.code == expected_code
    assert target.read_bytes() == before


@pytest.mark.parametrize(
    ("surface", "expected_code"),
    [
        ("target", "refresh-target-unreadable"),
        ("artifact", "refresh-artifact-unreadable"),
    ],
)
def test_preview_rejects_symlink_swap_at_canonical_read(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    surface: str,
    expected_code: str,
) -> None:
    repository, target = _repository(tmp_path)
    _, artifacts, _, _, _ = _inputs()
    victim = target if surface == "target" else repository / artifacts[0].path
    relative_victim = victim.relative_to(repository)
    outside = tmp_path / f"outside-{surface}"
    outside.write_bytes(victim.read_bytes())
    original_read = ManifestRefreshFileOperations.read_repository_bytes_at
    swapped = False

    def swap_before_descriptor_read(
        self: ManifestRefreshFileOperations,
        repository_anchor,
        relative_path: Path,
        *,
        limit: int,
    ) -> bytes:
        nonlocal swapped
        if not swapped and relative_path == relative_victim:
            swapped = True
            victim.unlink()
            victim.symlink_to(outside)
        return original_read(
            self,
            repository_anchor,
            relative_path,
            limit=limit,
        )

    monkeypatch.setattr(
        ManifestRefreshFileOperations,
        "read_repository_bytes_at",
        swap_before_descriptor_read,
    )

    result = _preview(repository)

    assert isinstance(result, Failure)
    assert result.issue.code == expected_code


def test_preview_machine_bytes_are_deterministic_complete_and_hash_bound(
    tmp_path: Path,
) -> None:
    repository, _ = _repository(tmp_path)

    first = _preview(repository)
    second = _preview(repository)

    assert isinstance(first, Success)
    assert second == first
    machine = serialize_manifest_refresh_preview(first.value)
    assert isinstance(machine, Success)
    assert machine.value.endswith(b"\n")
    assert not machine.value.endswith(b"\n\n")
    assert _sha256(machine.value) == first.value.preview_sha256
    machine_value = json.loads(machine.value)
    assert machine_value["candidate_bytes_utf8"] == first.value.candidate_bytes.decode()
    assert machine_value["previous_artifacts"]
    assert machine_value["previous_artifacts_sha256"]
    assert machine_value["previous_progress"]
    assert machine_value["previous_progress_sha256"]
    assert machine_value["explicit_matches"] == []

    changed = _preview(repository, current_source_commit=ALTERNATE_SOURCE_COMMIT)
    assert isinstance(changed, Success)
    assert changed.value.preview_sha256 != first.value.preview_sha256


def test_equal_target_and_candidate_return_complete_explicit_no_op(
    tmp_path: Path,
) -> None:
    repository, target = _repository(tmp_path)
    initial = _preview(repository)
    assert isinstance(initial, Success)
    target.write_bytes(initial.value.candidate_bytes)

    result = _preview(repository)

    assert isinstance(result, Success)
    assert result.value.no_op is True
    assert result.value.changes == ()
    assert result.value.exclusions == ()
    assert result.value.old_target_sha256 == result.value.candidate_sha256
    assert result.value.preview_sha256 != initial.value.preview_sha256


@pytest.mark.parametrize(
    ("surface", "expected_code"),
    [
        ("target", "refresh-target-limit-exceeded"),
        ("artifact", "refresh-artifact-limit-exceeded"),
        ("candidate", "refresh-candidate-limit-exceeded"),
        ("preview", "refresh-preview-limit-exceeded"),
    ],
)
def test_each_bounded_surface_rejects_limit_plus_one_without_partial_preview(
    tmp_path: Path, surface: str, expected_code: str
) -> None:
    repository, target = _repository(tmp_path)
    baseline = _preview(repository)
    assert isinstance(baseline, Success)
    limits = {
        "target": replace(RefreshLimits(), target_bytes=len(target.read_bytes()) - 1),
        "artifact": replace(
            RefreshLimits(),
            artifact_bytes=max(
                len((repository / item.path).read_bytes())
                for item in baseline.value.current_artifacts
            )
            - 1,
        ),
        "candidate": replace(
            RefreshLimits(), candidate_bytes=len(baseline.value.candidate_bytes) - 1
        ),
        "preview": replace(
            RefreshLimits(),
            preview_bytes=len(
                serialize_manifest_refresh_preview(baseline.value).value  # type: ignore[union-attr]
            )
            - 1,
        ),
    }[surface]
    before = target.read_bytes()

    result = _preview(repository, limits=limits)

    assert isinstance(result, Failure)
    assert result.issue.code == expected_code
    assert target.read_bytes() == before


@settings(
    max_examples=4,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
@given(reverse_assignments=st.booleans(), reverse_phases=st.booleans())
def test_preview_builder_normalizes_declared_order_and_binds_identity(
    tmp_path: Path, reverse_assignments: bool, reverse_phases: bool
) -> None:
    repository, _ = _repository(tmp_path)
    baseline = _preview(repository)
    assert isinstance(baseline, Success)
    inventory = baseline.value.planning_inventory
    reordered = replace(
        inventory,
        assignments=(
            tuple(reversed(inventory.assignments))
            if reverse_assignments
            else inventory.assignments
        ),
        phases=(
            tuple(reversed(inventory.phases)) if reverse_phases else inventory.phases
        ),
    )

    first = _preview(repository, planning_inventory=reordered)
    second = _preview(repository, planning_inventory=reordered)

    assert isinstance(first, Success)
    assert second == first
    assert first.value.candidate_bytes == baseline.value.candidate_bytes
    assert first.value.preview_sha256 == baseline.value.preview_sha256
    machine = serialize_manifest_refresh_preview(first.value)
    assert isinstance(machine, Success)
    assert _sha256(machine.value) == first.value.preview_sha256


def test_apply_requires_exact_fresh_approval_before_any_mutation(
    tmp_path: Path,
) -> None:
    repository, target = _repository(tmp_path)
    result = _preview(repository)
    assert isinstance(result, Success)
    preview = result.value
    malformed = replace(preview, candidate_bytes=b"{}")
    replayed = (
        replace(preview, repository_root=str(tmp_path / "other-repository")),
        replace(
            preview,
            target_path=f".planning/openspec/{CHANGE_ID}-other/handoff.json",
        ),
    )

    rejected_inputs = (
        (preview, preview.preview_sha256, False, RefreshFailurePoint.APPROVAL),
        (preview, "0" * 64, True, RefreshFailurePoint.APPROVAL),
        (malformed, preview.preview_sha256, True, RefreshFailurePoint.STATE_GUARD),
        *(
            (item, preview.preview_sha256, True, RefreshFailurePoint.APPROVAL)
            for item in replayed
        ),
    )
    before = target.read_bytes()
    for candidate, approved_hash, approved, failure_point in rejected_inputs:
        operations = MutationRecordingRefreshOperations()
        applied = apply_manifest_refresh(
            candidate,
            approved_preview_sha256=approved_hash,
            approved=approved,
            operations=operations,
        )
        assert isinstance(applied, ManifestRefreshFailure)
        assert applied.issue.failure_point is failure_point
        assert applied.issue.staging_state is RefreshStagingState.ABSENT
        assert operations.mutations == []
        assert target.read_bytes() == before


def test_apply_uses_falsey_supplied_operations_without_default_fallback(
    tmp_path: Path,
) -> None:
    repository, target = _repository(tmp_path)
    result = _preview(repository)
    assert isinstance(result, Success)
    preview = result.value
    before = target.read_bytes()
    operations = FalseyFaultInjectingRefreshOperations("create", target)

    applied = apply_manifest_refresh(
        preview,
        approved_preview_sha256=preview.preview_sha256,
        approved=True,
        operations=operations,
    )

    assert isinstance(applied, ManifestRefreshFailure)
    assert applied.issue.failure_point is RefreshFailurePoint.CREATE
    assert applied.issue.staging_state is RefreshStagingState.UNKNOWN
    assert operations.mutations == ["create"]
    assert target.read_bytes() == before


def test_apply_rejects_non_operations_adapter_before_mutation(tmp_path: Path) -> None:
    repository, target = _repository(tmp_path)
    result = _preview(repository)
    assert isinstance(result, Success)
    preview = result.value
    before = target.read_bytes()

    applied = apply_manifest_refresh(
        preview,
        approved_preview_sha256=preview.preview_sha256,
        approved=True,
        operations=cast(ManifestRefreshFileOperations, object()),
    )

    assert isinstance(applied, ManifestRefreshFailure)
    assert applied.issue.code == "refresh-operations-invalid"
    assert applied.issue.failure_point is RefreshFailurePoint.STATE_GUARD
    assert applied.issue.target_state is RefreshTargetState.UNKNOWN
    assert applied.issue.staging_state is RefreshStagingState.ABSENT
    assert applied.issue.cleanup_outcome is RefreshCleanupOutcome.NOT_NEEDED
    assert target.read_bytes() == before


@pytest.mark.parametrize(
    "drift",
    [
        "target",
        "source",
        "artifact",
        "progress",
        "assignment",
        "policy",
        "source-pin",
    ],
)
def test_apply_rejects_every_preview_bound_state_drift_before_staging(
    tmp_path: Path, drift: str
) -> None:
    repository, target = _repository(tmp_path)
    result = _preview(repository)
    assert isinstance(result, Success)
    preview = result.value
    candidate = preview
    if drift == "target":
        target.write_bytes(target.read_bytes() + b" ")
    elif drift == "source":
        source = repository / SOURCE_PATH
        source.write_bytes(source.read_bytes() + b"\nsource drift\n")
    elif drift == "artifact":
        artifact = repository / preview.current_artifacts[0].path
        artifact.write_bytes(artifact.read_bytes() + b"\nartifact drift\n")
    elif drift == "progress":
        tasks = repository / f"openspec/changes/{CHANGE_ID}/tasks.md"
        tasks.write_text(
            tasks.read_text(encoding="utf-8").replace("- [ ]", "- [x]", 1),
            encoding="utf-8",
        )
    elif drift == "assignment":
        candidate = replace(
            preview,
            planning_inventory=replace(
                preview.planning_inventory,
                assignments=preview.planning_inventory.assignments[:-1],
            ),
        )
    elif drift == "policy":
        policy = repository / POLICY_REGISTRY_PATH
        policy.write_bytes(policy.read_bytes() + b"\npolicy drift\n")
    else:
        shutil.rmtree(repository / ".git")
    before = target.read_bytes()
    operations = MutationRecordingRefreshOperations()

    applied = apply_manifest_refresh(
        candidate,
        approved_preview_sha256=preview.preview_sha256,
        approved=True,
        operations=operations,
    )

    assert isinstance(applied, ManifestRefreshFailure)
    assert applied.issue.failure_point in {
        RefreshFailurePoint.APPROVAL,
        RefreshFailurePoint.STATE_GUARD,
    }
    assert applied.issue.staging_state is RefreshStagingState.ABSENT
    assert operations.mutations == []
    assert target.read_bytes() == before


def test_apply_exact_preview_stages_validates_and_atomically_replaces(
    tmp_path: Path,
) -> None:
    repository, target = _repository(tmp_path)
    result = _preview(repository)
    assert isinstance(result, Success)
    preview = result.value
    operations = MutationRecordingRefreshOperations()

    applied = apply_manifest_refresh(
        preview,
        approved_preview_sha256=preview.preview_sha256,
        approved=True,
        operations=operations,
    )

    assert isinstance(applied, Success)
    assert applied.value == preview.candidate_manifest
    assert target.read_bytes() == preview.candidate_bytes
    assert operations.mutations == ["create", "write", "replace"]
    assert not tuple(target.parent.glob(".handoff.*.tmp"))
    assert applied.value.handoff_state is HandoffState.STARTED
    assert applied.value.capabilities == preview.previous_manifest.capabilities
    assert applied.value.ownership == preview.previous_manifest.ownership
    assert applied.value.lifecycle == preview.previous_manifest.lifecycle


def test_apply_preserves_target_mutated_after_locked_validation_before_rename(
    tmp_path: Path,
) -> None:
    repository, target = _repository(tmp_path)
    result = _preview(repository)
    assert isinstance(result, Success)
    preview = result.value
    concurrent = serialize_manifest_v2(
        replace(
            preview.previous_manifest,
            source_commit=ALTERNATE_SOURCE_COMMIT,
        )
    )
    assert isinstance(concurrent, Success)
    assert concurrent.value not in {target.read_bytes(), preview.candidate_bytes}
    operations = AfterLockedValidationTargetMutationOperations(
        target,
        concurrent.value,
    )

    applied = apply_manifest_refresh(
        preview,
        approved_preview_sha256=preview.preview_sha256,
        approved=True,
        operations=operations,
    )

    assert isinstance(applied, ManifestRefreshFailure)
    assert applied.issue.code == "refresh-state-changed-at-replace"
    assert applied.issue.failure_point is RefreshFailurePoint.STATE_GUARD
    assert applied.issue.target_state is RefreshTargetState.UNKNOWN
    assert applied.issue.staging_state is RefreshStagingState.VALIDATED
    assert applied.issue.cleanup_outcome is RefreshCleanupOutcome.REMOVED
    assert operations.lock_contended is True
    assert operations.rename_events == []
    assert target.read_bytes() == concurrent.value
    assert target.read_bytes() != preview.candidate_bytes
    assert not tuple(target.parent.glob(".handoff.*.tmp"))


def test_refresh_and_migration_writers_contend_on_one_change_directory_lock(
    tmp_path: Path,
) -> None:
    repository, target = _repository(tmp_path)
    refresh_result = _preview(repository)
    assert isinstance(refresh_result, Success)
    refresh_preview = refresh_result.value
    refresh_before = target.read_bytes()
    refresh_operations = MutationRecordingRefreshOperations()
    holder = os.open(target.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        fcntl.flock(holder, fcntl.LOCK_EX | fcntl.LOCK_NB)
        refresh_applied = apply_manifest_refresh(
            refresh_preview,
            approved_preview_sha256=refresh_preview.preview_sha256,
            approved=True,
            operations=refresh_operations,
        )
    finally:
        fcntl.flock(holder, fcntl.LOCK_UN)
        os.close(holder)

    assert isinstance(refresh_applied, ManifestRefreshFailure)
    assert refresh_applied.issue.code == "refresh-writer-lock-unavailable"
    assert refresh_applied.issue.failure_point is RefreshFailurePoint.STATE_GUARD
    assert refresh_applied.issue.target_state is RefreshTargetState.V2_PRESERVED
    assert refresh_applied.issue.staging_state is RefreshStagingState.VALIDATED
    assert refresh_applied.issue.cleanup_outcome is RefreshCleanupOutcome.REMOVED
    assert refresh_operations.mutations == ["create", "write", "unlink"]
    assert target.read_bytes() == refresh_before
    assert not tuple(target.parent.glob(".handoff.*.tmp"))
    _assert_directory_lock_can_be_acquired(target.parent)

    migration_preview, v1_bytes = _migration_preview_for_lock_test(repository, target)
    migration_operations = MigrationMutationRecordingOperations()
    holder = os.open(target.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        fcntl.flock(holder, fcntl.LOCK_EX | fcntl.LOCK_NB)
        migration_applied = apply_manifest_migration(
            migration_preview,
            approved_preview_sha256=migration_preview.preview_sha256,
            approved=True,
            operations=migration_operations,
        )
    finally:
        fcntl.flock(holder, fcntl.LOCK_UN)
        os.close(holder)

    assert isinstance(migration_applied, ManifestMigrationFailure)
    assert migration_applied.issue.code == "migration-writer-lock-unavailable"
    assert migration_applied.issue.failure_point is MigrationFailurePoint.STATE_GUARD
    assert migration_applied.issue.target_state is MigrationTargetState.V1_PRESERVED
    assert migration_applied.issue.staging_state is MigrationStagingState.VALIDATED
    assert migration_applied.issue.cleanup_outcome is MigrationCleanupOutcome.REMOVED
    assert migration_operations.mutations == ["create", "write", "unlink"]
    assert target.read_bytes() == v1_bytes
    assert not tuple(target.parent.glob(".handoff.*.tmp"))
    _assert_directory_lock_can_be_acquired(target.parent)


def test_apply_complete_no_op_succeeds_without_create_write_or_replace(
    tmp_path: Path,
) -> None:
    repository, target = _repository(tmp_path)
    initial = _preview(repository)
    assert isinstance(initial, Success)
    target.write_bytes(initial.value.candidate_bytes)
    no_op = _preview(repository)
    assert isinstance(no_op, Success)
    assert no_op.value.no_op is True
    before = target.read_bytes()
    operations = MutationRecordingRefreshOperations()

    applied = apply_manifest_refresh(
        no_op.value,
        approved_preview_sha256=no_op.value.preview_sha256,
        approved=True,
        operations=operations,
    )

    assert isinstance(applied, Success)
    assert applied.value == no_op.value.candidate_manifest
    assert operations.mutations == []
    assert target.read_bytes() == before


@pytest.mark.parametrize(
    ("fault", "point", "staging", "cleanup", "mutations"),
    [
        (
            "create",
            RefreshFailurePoint.CREATE,
            RefreshStagingState.UNKNOWN,
            RefreshCleanupOutcome.NOT_NEEDED,
            ["create"],
        ),
        (
            "write",
            RefreshFailurePoint.WRITE,
            RefreshStagingState.UNKNOWN,
            RefreshCleanupOutcome.REMOVED,
            ["create", "write", "unlink"],
        ),
        (
            "reread",
            RefreshFailurePoint.REREAD,
            RefreshStagingState.UNKNOWN,
            RefreshCleanupOutcome.REMOVED,
            ["create", "write", "unlink"],
        ),
        (
            "validate",
            RefreshFailurePoint.VALIDATE,
            RefreshStagingState.INVALID,
            RefreshCleanupOutcome.REMOVED,
            ["create", "write", "unlink"],
        ),
        (
            "cleanup",
            RefreshFailurePoint.WRITE,
            RefreshStagingState.UNKNOWN,
            RefreshCleanupOutcome.FAILED,
            ["create", "write", "unlink"],
        ),
    ],
)
def test_apply_fault_matrix_proves_old_v2_and_classifies_staging_cleanup(
    tmp_path: Path,
    fault: str,
    point: RefreshFailurePoint,
    staging: RefreshStagingState,
    cleanup: RefreshCleanupOutcome,
    mutations: list[str],
) -> None:
    repository, target = _repository(tmp_path)
    result = _preview(repository)
    assert isinstance(result, Success)
    preview = result.value
    before = target.read_bytes()
    operations = FaultInjectingRefreshOperations(fault, target)

    applied = apply_manifest_refresh(
        preview,
        approved_preview_sha256=preview.preview_sha256,
        approved=True,
        operations=operations,
    )

    assert isinstance(applied, ManifestRefreshFailure)
    assert applied.issue.failure_point is point
    assert applied.issue.target_state is RefreshTargetState.V2_PRESERVED
    assert applied.issue.staging_state is staging
    assert applied.issue.cleanup_outcome is cleanup
    assert operations.mutations == mutations
    assert target.read_bytes() == before
    if fault == "cleanup":
        retained = tuple(target.parent.glob(".handoff.*.tmp"))
        assert len(retained) == 1
        retained[0].unlink()
    else:
        assert not tuple(target.parent.glob(".handoff.*.tmp"))


@pytest.mark.parametrize(
    ("fault", "target_state"),
    [
        ("replace-unchanged", RefreshTargetState.V2_PRESERVED),
        ("replace-changed", RefreshTargetState.UNKNOWN),
        ("replace-unreadable", RefreshTargetState.UNKNOWN),
        ("replace-oversized", RefreshTargetState.UNKNOWN),
    ],
)
def test_apply_replace_failure_uses_fresh_bounded_target_proof(
    tmp_path: Path, fault: str, target_state: RefreshTargetState
) -> None:
    repository, target = _repository(tmp_path)
    result = _preview(repository)
    assert isinstance(result, Success)
    preview = result.value
    operations = FaultInjectingRefreshOperations(fault, target)

    applied = apply_manifest_refresh(
        preview,
        approved_preview_sha256=preview.preview_sha256,
        approved=True,
        operations=operations,
    )

    assert isinstance(applied, ManifestRefreshFailure)
    assert applied.issue.failure_point is RefreshFailurePoint.REPLACE
    assert applied.issue.target_state is target_state
    assert applied.issue.staging_state is RefreshStagingState.VALIDATED
    assert applied.issue.cleanup_outcome is RefreshCleanupOutcome.REMOVED
    assert operations.mutations == ["create", "write", "replace", "unlink"]


@pytest.mark.parametrize("drift_path", [SOURCE_PATH, POLICY_REGISTRY_PATH, ".git"])
def test_apply_rechecks_source_and_policy_after_staging_before_replace(
    tmp_path: Path, drift_path: str
) -> None:
    repository, target = _repository(tmp_path)
    result = _preview(repository)
    assert isinstance(result, Success)
    preview = result.value
    before = target.read_bytes()
    operations = DriftAtReplaceRefreshOperations(repository / drift_path)

    applied = apply_manifest_refresh(
        preview,
        approved_preview_sha256=preview.preview_sha256,
        approved=True,
        operations=operations,
    )

    assert isinstance(applied, ManifestRefreshFailure)
    assert applied.issue.failure_point is RefreshFailurePoint.STATE_GUARD
    assert applied.issue.target_state is RefreshTargetState.V2_PRESERVED
    assert applied.issue.staging_state is RefreshStagingState.VALIDATED
    assert applied.issue.cleanup_outcome is RefreshCleanupOutcome.REMOVED
    assert operations.mutations == ["create", "write", "unlink"]
    assert target.read_bytes() == before
