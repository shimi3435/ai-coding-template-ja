"""Read-only manifest migration preview contract tests."""

from __future__ import annotations

import hashlib
import os
from dataclasses import replace
from pathlib import Path

import pytest

from ai_coding_template_ja.openspec_gsd_handoff.manifest import (
    MAX_MANIFEST_BYTES,
    ManifestFileOperations,
    parse_manifest_bytes,
)
from ai_coding_template_ja.openspec_gsd_handoff.manifest_migration import (
    ManifestMigrationFailure,
    ManifestMigrationFileOperations,
    MigrationCleanupOutcome,
    MigrationFailurePoint,
    MigrationStagingState,
    MigrationTargetState,
    apply_manifest_migration,
    preview_manifest_migration,
)
from ai_coding_template_ja.openspec_gsd_handoff.models import Failure, Success
from ai_coding_template_ja.openspec_gsd_handoff.source_identity import (
    SourceIdentityLimits,
    SourceIdentityState,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
EXPECTED_V1 = (
    REPO_ROOT
    / "tests"
    / "fixtures"
    / "openspec_gsd_handoff"
    / "manifest"
    / "expected-prepared.json"
).read_bytes()
EXPECTED_V2 = (
    REPO_ROOT
    / "tests"
    / "fixtures"
    / "openspec_gsd_handoff"
    / "manifest"
    / "expected-migrated-v2.json"
).read_bytes()
SOURCE_PATH = "openspec/changes/fixture-change/specs/fixture-capability/spec.md"
TARGET_PATH = ".planning/openspec/fixture-change/handoff.json"
SOURCE_COMMIT = "a" * 40
PROPOSAL_PATH = "openspec/changes/fixture-change/proposal.md"
DESIGN_PATH = "openspec/changes/fixture-change/design.md"
TASKS_PATH = "openspec/changes/fixture-change/tasks.md"
SOURCE = (
    b"## ADDED Requirements\n\n"
    b"### Requirement: Durable preview\n"
    b"The bridge MUST preview without mutation.\n\n"
    b"#### Scenario: Stable content edit\n"
    b"- **WHEN** the source content changes\n"
    b"- **THEN** the stable identity remains\n"
)
CANONICAL_CONTENT = {
    DESIGN_PATH: b"# Design\n",
    PROPOSAL_PATH: b"# Proposal\n",
    SOURCE_PATH: SOURCE,
    TASKS_PATH: (
        "# Tasks\n\n"
        "- [x] 1.1 fixture contractを固定する\n"
        "- [ ] 1.2 Unicodeの進捗を検証する\n"
        "- [ ] 1.3 fallback parityを検証する\n"
    ).encode(),
}


class ReadOnlyCountingOperations(ManifestFileOperations):
    """Fail loudly if a read-only preview reaches a mutation operation."""

    def make_parent(self, path: Path) -> None:
        raise AssertionError(f"unexpected make_parent: {path}")

    def create_staging(self, parent: Path) -> Path:
        raise AssertionError(f"unexpected create_staging: {parent}")

    def write_bytes(self, path: Path, data: bytes) -> None:
        raise AssertionError(f"unexpected write_bytes: {path}")

    def replace(self, source: Path, target: Path) -> None:
        raise AssertionError(f"unexpected replace: {source} -> {target}")

    def unlink(self, path: Path) -> None:
        raise AssertionError(f"unexpected unlink: {path}")


class MutationRecordingOperations(ManifestMigrationFileOperations):
    """Exercise real persistence while recording every mutating boundary."""

    def __init__(self) -> None:
        self.mutations: list[str] = []

    def create_staging_at(
        self,
        parent_descriptor: int,
        parent: Path,
    ) -> str:
        self.mutations.append("create")
        return super().create_staging_at(parent_descriptor, parent)

    def write_bytes_at(
        self,
        parent_descriptor: int,
        name: str,
        data: bytes,
    ) -> None:
        self.mutations.append("write")
        super().write_bytes_at(parent_descriptor, name, data)

    def replace_at(
        self,
        parent_descriptor: int,
        source_name: str,
        target_name: str,
    ) -> None:
        self.mutations.append("replace")
        super().replace_at(parent_descriptor, source_name, target_name)

    def unlink_at(self, parent_descriptor: int, name: str) -> None:
        self.mutations.append("unlink")
        super().unlink_at(parent_descriptor, name)


class FaultInjectingOperations(MutationRecordingOperations):
    """Inject one filesystem fault while keeping every side effect observable."""

    def __init__(self, fault: str, target: Path) -> None:
        super().__init__()
        self.fault = fault
        self.target = target
        self.staging: Path | None = None

    def create_staging_at(
        self,
        parent_descriptor: int,
        parent: Path,
    ) -> str:
        if self.fault == "create":
            self.mutations.append("create")
            raise OSError("injected create failure")
        staging_name = super().create_staging_at(parent_descriptor, parent)
        self.staging = parent / staging_name
        return staging_name

    def write_bytes_at(
        self,
        parent_descriptor: int,
        name: str,
        data: bytes,
    ) -> None:
        if self.fault in {"write", "write-target-changed", "cleanup"}:
            self.mutations.append("write")
            ManifestMigrationFileOperations.write_bytes_at(
                self,
                parent_descriptor,
                name,
                b"{",
            )
            if self.fault == "write-target-changed":
                self.target.write_bytes(b"changed concurrently")
            raise OSError("injected write failure")
        if self.fault == "validate":
            super().write_bytes_at(parent_descriptor, name, b"{}")
            return
        super().write_bytes_at(parent_descriptor, name, data)

    def read_bounded_bytes_at(
        self,
        parent_descriptor: int,
        name: str,
        *,
        limit: int = MAX_MANIFEST_BYTES,
    ) -> bytes:
        if (
            self.fault == "reread"
            and self.staging is not None
            and name == self.staging.name
        ):
            raise OSError("injected staging reread failure")
        return super().read_bounded_bytes_at(
            parent_descriptor,
            name,
            limit=limit,
        )

    def replace_at(
        self,
        parent_descriptor: int,
        source_name: str,
        target_name: str,
    ) -> None:
        if self.fault.startswith("replace-"):
            self.mutations.append("replace")
            if self.fault == "replace-changed":
                self.target.write_bytes(b"changed during replace")
            elif self.fault == "replace-unreadable":
                self.target.unlink()
            elif self.fault == "replace-oversized":
                self.target.write_bytes(b"x" * (MAX_MANIFEST_BYTES + 1))
            raise OSError("injected replace failure")
        super().replace_at(parent_descriptor, source_name, target_name)

    def unlink_at(self, parent_descriptor: int, name: str) -> None:
        if self.fault == "cleanup":
            self.mutations.append("unlink")
            raise OSError("injected cleanup failure")
        super().unlink_at(parent_descriptor, name)


class ParentSwapAtReplaceOperations(MutationRecordingOperations):
    """Swap the target parent at the final replace boundary."""

    def __init__(self, target: Path, outside_parent: Path) -> None:
        super().__init__()
        self.target = target
        self.outside_parent = outside_parent
        self.moved_parent = target.parent.with_name(f"{target.parent.name}-moved")

    def before_replace_at(
        self,
        parent_descriptor: int,
        parent: Path,
        source_name: str,
        target_name: str,
    ) -> None:
        del parent_descriptor, source_name, target_name
        self.mutations.append("replace")
        parent.rename(self.moved_parent)
        parent.symlink_to(self.outside_parent, target_is_directory=True)


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _tree_bytes(repository: Path) -> dict[str, bytes]:
    return {
        path.relative_to(repository).as_posix(): path.read_bytes()
        for path in sorted(repository.rglob("*"))
        if path.is_file()
    }


def _write_repository(
    tmp_path: Path,
    *,
    name: str = "repository",
    source: bytes = SOURCE,
    manifest: bytes = EXPECTED_V1,
) -> tuple[Path, Path]:
    repository = tmp_path / name
    target = repository / TARGET_PATH
    target.parent.mkdir(parents=True)
    target.write_bytes(manifest)
    for artifact_path, content in CANONICAL_CONTENT.items():
        artifact_target = repository / artifact_path
        artifact_target.parent.mkdir(parents=True, exist_ok=True)
        artifact_target.write_bytes(source if artifact_path == SOURCE_PATH else content)
    return repository, target


def _inputs(source: bytes = SOURCE):
    parsed = parse_manifest_bytes(EXPECTED_V1)
    assert isinstance(parsed, Success)
    content_by_path = {**CANONICAL_CONTENT, SOURCE_PATH: source}
    current_artifacts = tuple(
        replace(artifact, sha256=_sha256(content_by_path[artifact.path]))
        for artifact in parsed.value.artifacts
    )
    return parsed.value, current_artifacts


def _preview(
    repository: Path,
    *,
    source: bytes = SOURCE,
    current_source_commit: str = SOURCE_COMMIT,
    previous_source_items=None,
):
    v1, current_artifacts = _inputs(source)
    return preview_manifest_migration(
        repository,
        Path(TARGET_PATH),
        current_source_commit=current_source_commit,
        current_artifacts=current_artifacts,
        current_progress=v1.progress,
        source_paths=(SOURCE_PATH,),
        previous_source_items=previous_source_items,
        operations=ReadOnlyCountingOperations(),
    )


def test_preview_builds_complete_deterministic_schema_v2_without_mutation(
    tmp_path: Path,
) -> None:
    repository, target = _write_repository(tmp_path)
    before = _tree_bytes(repository)
    v1, current_artifacts = _inputs()

    first = _preview(repository)
    second = _preview(repository)

    assert isinstance(first, Success)
    assert second == first
    preview = first.value
    assert preview.repository_root == str(repository.resolve())
    assert preview.target_path == TARGET_PATH
    assert preview.observed_source_commit == v1.source_commit
    assert preview.current_source_commit == SOURCE_COMMIT
    assert preview.v1_sha256 == _sha256(EXPECTED_V1)
    assert preview.v2_sha256 == _sha256(preview.candidate_bytes)
    assert preview.candidate_manifest.schema_version == 2
    assert preview.candidate_manifest.change_id == v1.change_id
    assert preview.candidate_manifest.handoff_state == v1.handoff_state
    assert preview.candidate_manifest.capabilities == v1.capabilities
    assert preview.candidate_manifest.artifacts == current_artifacts
    assert preview.candidate_manifest.source_commit == SOURCE_COMMIT
    assert preview.candidate_manifest.progress == v1.progress
    assert preview.candidate_manifest.mappings == ()
    assert preview.candidate_manifest.ownership.owned == ()
    assert preview.candidate_manifest.ownership.referenced == ()
    assert preview.candidate_manifest.lifecycle.checkpoints == ()
    assert preview.candidate_manifest.lifecycle.receipts == ()
    assert preview.candidate_manifest.lifecycle.archives == ()
    assert [change.kind for change in preview.changes] == ["created", "created"]
    assert [change.source_id for change in preview.changes] == [
        "REQ-000001",
        "SCN-000001",
    ]
    assert preview.exclusions == ()
    assert len(preview.preview_sha256) == 64
    assert target.read_bytes() == EXPECTED_V1
    assert _tree_bytes(repository) == before


def test_preview_rejects_stale_non_source_artifact_without_partial_value(
    tmp_path: Path,
) -> None:
    repository, target = _write_repository(tmp_path)
    v1, current_artifacts = _inputs()
    (repository / PROPOSAL_PATH).write_bytes(b"# Changed proposal\n")
    before = _tree_bytes(repository)

    result = preview_manifest_migration(
        repository,
        Path(TARGET_PATH),
        current_source_commit=SOURCE_COMMIT,
        current_artifacts=current_artifacts,
        current_progress=v1.progress,
        source_paths=(SOURCE_PATH,),
        operations=ReadOnlyCountingOperations(),
    )

    assert isinstance(result, Failure)
    assert result.issue.code == "migration-artifact-snapshot-mismatch"
    assert target.read_bytes() == EXPECTED_V1
    assert _tree_bytes(repository) == before


def test_preview_rejects_progress_not_derived_from_current_tasks_snapshot(
    tmp_path: Path,
) -> None:
    repository, target = _write_repository(tmp_path)
    v1, current_artifacts = _inputs()
    stale_progress = replace(
        v1.progress,
        complete=0,
        remaining=3,
        tasks=tuple(replace(task, done=False) for task in v1.progress.tasks),
    )

    result = preview_manifest_migration(
        repository,
        Path(TARGET_PATH),
        current_source_commit=SOURCE_COMMIT,
        current_artifacts=current_artifacts,
        current_progress=stale_progress,
        source_paths=(SOURCE_PATH,),
        operations=ReadOnlyCountingOperations(),
    )

    assert isinstance(result, Failure)
    assert result.issue.code == "migration-progress-snapshot-mismatch"
    assert target.read_bytes() == EXPECTED_V1


def test_preview_rejects_unknown_schema_and_schema2_downgrade_without_mutation(
    tmp_path: Path,
) -> None:
    unknown_repository, unknown_target = _write_repository(
        tmp_path,
        name="unknown",
        manifest=EXPECTED_V1.replace(b'"schema_version": 1', b'"schema_version": 9'),
    )
    v2_repository, v2_target = _write_repository(
        tmp_path,
        name="v2",
        manifest=EXPECTED_V2,
    )

    unknown = _preview(unknown_repository)
    downgrade = _preview(v2_repository)
    requested_downgrade = preview_manifest_migration(
        v2_repository,
        Path(TARGET_PATH),
        current_source_commit=SOURCE_COMMIT,
        current_artifacts=_inputs()[1],
        current_progress=_inputs()[0].progress,
        source_paths=(SOURCE_PATH,),
        requested_schema_version=1,
        operations=ReadOnlyCountingOperations(),
    )

    assert isinstance(unknown, Failure)
    assert unknown.issue.code == "manifest-schema-unsupported"
    assert isinstance(downgrade, Failure)
    assert downgrade.issue.code == "migration-source-schema-invalid"
    assert isinstance(requested_downgrade, Failure)
    assert requested_downgrade.issue.code == "manifest-downgrade-rejected"
    assert unknown_target.read_bytes().startswith(b'{\n  "schema_version": 9')
    assert v2_target.read_bytes() == EXPECTED_V2


def test_preview_rejects_malformed_collision_exhaustion_and_bounds(
    tmp_path: Path,
) -> None:
    malformed = SOURCE + b"\n```markdown\n"
    malformed_repository, malformed_target = _write_repository(
        tmp_path,
        name="malformed",
        source=malformed,
    )
    collision_repository, collision_target = _write_repository(
        tmp_path,
        name="collision",
    )
    exhausted_repository, exhausted_target = _write_repository(
        tmp_path,
        name="exhausted",
    )
    oversized_repository, oversized_target = _write_repository(
        tmp_path,
        name="oversized",
    )
    collision_seed = _preview(collision_repository)
    assert isinstance(collision_seed, Success)
    active = collision_seed.value.candidate_manifest.source_items.active
    collision = SourceIdentityState(
        next_requirement_id=2,
        next_scenario_id=2,
        active=(active[0], active[0], active[1]),
        tombstones=(),
    )
    exhausted = SourceIdentityState(
        next_requirement_id=1_000_000,
        next_scenario_id=1,
        active=(),
        tombstones=(),
    )

    malformed_result = _preview(malformed_repository, source=malformed)
    collision_result = _preview(
        collision_repository,
        previous_source_items=collision,
    )
    exhausted_result = _preview(
        exhausted_repository,
        previous_source_items=exhausted,
    )
    oversized_result = preview_manifest_migration(
        oversized_repository,
        Path(TARGET_PATH),
        current_source_commit=SOURCE_COMMIT,
        current_artifacts=_inputs()[1],
        current_progress=_inputs()[0].progress,
        source_paths=(SOURCE_PATH,),
        limits=SourceIdentityLimits(
            max_items=16,
            bytes_per_file=16,
            bytes_total=32,
        ),
        operations=ReadOnlyCountingOperations(),
    )

    assert isinstance(malformed_result, Failure)
    assert malformed_result.issue.code == "source-fence-unclosed"
    assert isinstance(collision_result, Failure)
    assert collision_result.issue.code == "source-state-id-duplicate"
    assert isinstance(exhausted_result, Failure)
    assert exhausted_result.issue.code == "source-counter-exhausted"
    assert isinstance(oversized_result, Failure)
    assert oversized_result.issue.code == "source-file-limit-exceeded"
    assert malformed_target.read_bytes() == EXPECTED_V1
    assert collision_target.read_bytes() == EXPECTED_V1
    assert exhausted_target.read_bytes() == EXPECTED_V1
    assert oversized_target.read_bytes() == EXPECTED_V1


def test_preview_rejects_oversized_or_missing_manifest_without_creating_state(
    tmp_path: Path,
) -> None:
    oversized_repository, oversized_target = _write_repository(
        tmp_path,
        name="oversized-target",
        manifest=b" " * (MAX_MANIFEST_BYTES + 1),
    )
    missing_repository, missing_target = _write_repository(
        tmp_path,
        name="missing-target",
    )
    missing_target.unlink()

    oversized = _preview(oversized_repository)
    missing = _preview(missing_repository)

    assert isinstance(oversized, Failure)
    assert oversized.issue.code == "manifest-size-limit-exceeded"
    assert isinstance(missing, Failure)
    assert missing.issue.code == "manifest-read-failed"
    assert oversized_target.read_bytes() == b" " * (MAX_MANIFEST_BYTES + 1)
    assert not missing_target.exists()


def test_preview_identity_binds_repository_real_path(tmp_path: Path) -> None:
    first_repository, _ = _write_repository(tmp_path, name="first")
    second_repository, _ = _write_repository(tmp_path, name="second")

    first = _preview(first_repository)
    second = _preview(second_repository)

    assert isinstance(first, Success)
    assert isinstance(second, Success)
    assert first.value.candidate_bytes == second.value.candidate_bytes
    assert first.value.preview_sha256 != second.value.preview_sha256


def test_preview_retains_ids_and_reports_fingerprint_updates(tmp_path: Path) -> None:
    repository, target = _write_repository(tmp_path)
    initial = _preview(repository)
    assert isinstance(initial, Success)
    initial_items = initial.value.candidate_manifest.source_items
    initial_ids = tuple(item.id for item in initial_items.active)
    edited = SOURCE.replace(b"without mutation", b"without any mutation")
    (repository / SOURCE_PATH).write_bytes(edited)

    updated = _preview(
        repository,
        source=edited,
        current_source_commit="b" * 40,
        previous_source_items=initial_items,
    )

    assert isinstance(updated, Success)
    assert (
        tuple(item.id for item in updated.value.candidate_manifest.source_items.active)
        == initial_ids
    )
    assert [change.kind for change in updated.value.changes] == ["updated"]
    assert updated.value.changes[0].source_id == "REQ-000001"
    assert all(
        change.previous_fingerprint != change.candidate_fingerprint
        for change in updated.value.changes
    )
    assert target.read_bytes() == EXPECTED_V1


def test_apply_requires_exact_fresh_approval_before_any_staging(tmp_path: Path) -> None:
    repository, target = _write_repository(tmp_path)
    result = _preview(repository)
    assert isinstance(result, Success)
    preview = result.value

    missing_operations = MutationRecordingOperations()
    missing = apply_manifest_migration(
        preview,
        approved_preview_sha256=preview.preview_sha256,
        approved=False,
        operations=missing_operations,
    )
    stale_operations = MutationRecordingOperations()
    stale = apply_manifest_migration(
        preview,
        approved_preview_sha256="0" * 64,
        approved=True,
        operations=stale_operations,
    )

    assert isinstance(missing, ManifestMigrationFailure)
    assert missing.issue.failure_point is MigrationFailurePoint.APPROVAL
    assert isinstance(stale, ManifestMigrationFailure)
    assert stale.issue.failure_point is MigrationFailurePoint.APPROVAL
    assert missing_operations.mutations == []
    assert stale_operations.mutations == []
    assert target.read_bytes() == EXPECTED_V1


def test_apply_rejects_preview_replay_and_current_snapshot_drift_before_staging(
    tmp_path: Path,
) -> None:
    repository, target = _write_repository(tmp_path)
    result = _preview(repository)
    assert isinstance(result, Success)
    preview = result.value
    altered = (
        replace(preview, repository_root=str(tmp_path / "other-repository")),
        replace(
            preview,
            target_path=".planning/openspec/other-change/handoff.json",
        ),
    )

    for replay in altered:
        operations = MutationRecordingOperations()
        rejected = apply_manifest_migration(
            replay,
            approved_preview_sha256=preview.preview_sha256,
            approved=True,
            operations=operations,
        )
        assert isinstance(rejected, ManifestMigrationFailure)
        assert rejected.issue.failure_point is MigrationFailurePoint.APPROVAL
        assert operations.mutations == []

    (repository / SOURCE_PATH).write_bytes(SOURCE + b"\nChanged after preview.\n")
    drift_operations = MutationRecordingOperations()
    drift = apply_manifest_migration(
        preview,
        approved_preview_sha256=preview.preview_sha256,
        approved=True,
        operations=drift_operations,
    )
    assert isinstance(drift, ManifestMigrationFailure)
    assert drift.issue.failure_point is MigrationFailurePoint.STATE_GUARD
    assert drift.issue.target_state is MigrationTargetState.V1_PRESERVED
    assert drift_operations.mutations == []
    assert target.read_bytes() == EXPECTED_V1


def test_apply_rejects_target_changed_after_preview_before_staging(
    tmp_path: Path,
) -> None:
    repository, target = _write_repository(tmp_path)
    result = _preview(repository)
    assert isinstance(result, Success)
    preview = result.value
    changed = EXPECTED_V1 + b" \n"
    target.write_bytes(changed)
    operations = MutationRecordingOperations()

    applied = apply_manifest_migration(
        preview,
        approved_preview_sha256=preview.preview_sha256,
        approved=True,
        operations=operations,
    )

    assert isinstance(applied, ManifestMigrationFailure)
    assert applied.issue.failure_point is MigrationFailurePoint.STATE_GUARD
    assert applied.issue.target_state is MigrationTargetState.UNKNOWN
    assert applied.issue.staging_state is MigrationStagingState.ABSENT
    assert operations.mutations == []
    assert target.read_bytes() == changed


def test_apply_exact_preview_validates_staging_then_atomically_replaces_target(
    tmp_path: Path,
) -> None:
    repository, target = _write_repository(tmp_path)
    result = _preview(repository)
    assert isinstance(result, Success)
    preview = result.value
    operations = MutationRecordingOperations()

    applied = apply_manifest_migration(
        preview,
        approved_preview_sha256=preview.preview_sha256,
        approved=True,
        operations=operations,
    )

    assert isinstance(applied, Success)
    assert applied.value == preview.candidate_manifest
    assert target.read_bytes() == preview.candidate_bytes
    assert operations.mutations == ["create", "write", "replace"]


def test_apply_rejects_parent_swap_at_replace_without_touching_outside(
    tmp_path: Path,
) -> None:
    repository, target = _write_repository(tmp_path)
    preview_result = _preview(repository)
    assert isinstance(preview_result, Success)
    preview = preview_result.value
    outside_parent = tmp_path / "outside"
    outside_parent.mkdir()
    outside_target = outside_parent / target.name
    outside_bytes = b"outside sentinel"
    outside_target.write_bytes(outside_bytes)
    operations = ParentSwapAtReplaceOperations(target, outside_parent)

    applied = apply_manifest_migration(
        preview,
        approved_preview_sha256=preview.preview_sha256,
        approved=True,
        operations=operations,
    )

    assert isinstance(applied, ManifestMigrationFailure)
    assert applied.issue.failure_point is MigrationFailurePoint.STATE_GUARD
    assert applied.issue.target_state is MigrationTargetState.V1_PRESERVED
    assert applied.issue.staging_state is MigrationStagingState.VALIDATED
    assert applied.issue.cleanup_outcome is MigrationCleanupOutcome.REMOVED
    assert outside_target.read_bytes() == outside_bytes
    assert (operations.moved_parent / target.name).read_bytes() == EXPECTED_V1
    assert not any(operations.moved_parent.glob(".handoff.*.tmp"))
    assert operations.mutations == ["create", "write", "replace", "unlink"]


def test_apply_rejects_repository_alias_change_before_staging(tmp_path: Path) -> None:
    repository, _ = _write_repository(tmp_path)
    result = _preview(repository)
    assert isinstance(result, Success)
    preview = result.value
    moved = tmp_path / "moved-repository"
    repository.rename(moved)
    repository.symlink_to(moved, target_is_directory=True)
    operations = MutationRecordingOperations()

    applied = apply_manifest_migration(
        preview,
        approved_preview_sha256=preview.preview_sha256,
        approved=True,
        operations=operations,
    )

    assert isinstance(applied, ManifestMigrationFailure)
    assert applied.issue.failure_point is MigrationFailurePoint.STATE_GUARD
    assert applied.issue.target_state is MigrationTargetState.UNKNOWN
    assert operations.mutations == []
    assert (moved / TARGET_PATH).read_bytes() == EXPECTED_V1


def test_apply_reports_pre_replace_faults_and_preserves_exact_v1(
    tmp_path: Path,
) -> None:
    expected = {
        "create": (
            MigrationFailurePoint.CREATE,
            MigrationStagingState.UNKNOWN,
            MigrationCleanupOutcome.NOT_NEEDED,
            ["create"],
        ),
        "write": (
            MigrationFailurePoint.WRITE,
            MigrationStagingState.UNKNOWN,
            MigrationCleanupOutcome.REMOVED,
            ["create", "write", "unlink"],
        ),
        "reread": (
            MigrationFailurePoint.REREAD,
            MigrationStagingState.UNKNOWN,
            MigrationCleanupOutcome.REMOVED,
            ["create", "write", "unlink"],
        ),
        "validate": (
            MigrationFailurePoint.VALIDATE,
            MigrationStagingState.INVALID,
            MigrationCleanupOutcome.REMOVED,
            ["create", "write", "unlink"],
        ),
    }
    for fault, (point, staging_state, cleanup, mutations) in expected.items():
        repository, target = _write_repository(tmp_path, name=fault)
        preview_result = _preview(repository)
        assert isinstance(preview_result, Success)
        preview = preview_result.value
        operations = FaultInjectingOperations(fault, target)

        applied = apply_manifest_migration(
            preview,
            approved_preview_sha256=preview.preview_sha256,
            approved=True,
            operations=operations,
        )

        assert isinstance(applied, ManifestMigrationFailure)
        assert applied.issue.failure_point is point
        assert applied.issue.target_state is MigrationTargetState.V1_PRESERVED
        assert applied.issue.staging_state is staging_state
        assert applied.issue.cleanup_outcome is cleanup
        assert operations.mutations == mutations
        assert target.read_bytes() == EXPECTED_V1
        if operations.staging is not None:
            assert not operations.staging.exists()


@pytest.mark.parametrize("fault", ["fstat", "close"])
def test_apply_cleans_staging_when_creation_fails_after_open(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    fault: str,
) -> None:
    repository, target = _write_repository(tmp_path)
    preview_result = _preview(repository)
    assert isinstance(preview_result, Success)
    preview = preview_result.value
    operations = MutationRecordingOperations()
    real_fstat = os.fstat
    real_close = os.close

    def is_staging_descriptor(descriptor: int) -> bool:
        try:
            opened_path = os.readlink(f"/proc/self/fd/{descriptor}")
        except OSError:
            return False
        return Path(opened_path).name.startswith(".handoff.")

    def fstat_with_fault(descriptor: int) -> os.stat_result:
        if fault == "fstat" and is_staging_descriptor(descriptor):
            raise OSError("injected staging fstat failure")
        return real_fstat(descriptor)

    def close_with_fault(descriptor: int) -> None:
        fail_after_close = fault == "close" and is_staging_descriptor(descriptor)
        real_close(descriptor)
        if fail_after_close:
            raise OSError("injected staging close failure")

    monkeypatch.setattr(os, "fstat", fstat_with_fault)
    monkeypatch.setattr(os, "close", close_with_fault)

    applied = apply_manifest_migration(
        preview,
        approved_preview_sha256=preview.preview_sha256,
        approved=True,
        operations=operations,
    )

    assert isinstance(applied, ManifestMigrationFailure)
    assert applied.issue.failure_point is MigrationFailurePoint.CREATE
    assert applied.issue.target_state is MigrationTargetState.V1_PRESERVED
    assert applied.issue.staging_state is MigrationStagingState.ABSENT
    assert applied.issue.cleanup_outcome is MigrationCleanupOutcome.REMOVED
    assert target.read_bytes() == EXPECTED_V1
    assert not any(target.parent.glob(".handoff.*.tmp"))
    assert operations.mutations == ["create", "unlink"]


def test_apply_does_not_claim_v1_preserved_when_write_fault_observes_target_drift(
    tmp_path: Path,
) -> None:
    repository, target = _write_repository(tmp_path)
    preview_result = _preview(repository)
    assert isinstance(preview_result, Success)
    preview = preview_result.value
    operations = FaultInjectingOperations("write-target-changed", target)

    applied = apply_manifest_migration(
        preview,
        approved_preview_sha256=preview.preview_sha256,
        approved=True,
        operations=operations,
    )

    assert isinstance(applied, ManifestMigrationFailure)
    assert applied.issue.failure_point is MigrationFailurePoint.WRITE
    assert applied.issue.target_state is MigrationTargetState.UNKNOWN
    assert target.read_bytes() == b"changed concurrently"
    assert operations.mutations == ["create", "write", "unlink"]


def test_apply_reports_cleanup_failure_separately_and_attempts_it_once(
    tmp_path: Path,
) -> None:
    repository, target = _write_repository(tmp_path)
    preview_result = _preview(repository)
    assert isinstance(preview_result, Success)
    preview = preview_result.value
    operations = FaultInjectingOperations("cleanup", target)

    applied = apply_manifest_migration(
        preview,
        approved_preview_sha256=preview.preview_sha256,
        approved=True,
        operations=operations,
    )

    assert isinstance(applied, ManifestMigrationFailure)
    assert applied.issue.cleanup_outcome is MigrationCleanupOutcome.FAILED
    assert applied.issue.target_state is MigrationTargetState.V1_PRESERVED
    assert operations.mutations.count("unlink") == 1
    assert operations.staging is not None
    assert operations.staging.exists()
    assert target.read_bytes() == EXPECTED_V1
    operations.staging.unlink()


def test_apply_classifies_replace_failure_from_bounded_target_reread(
    tmp_path: Path,
) -> None:
    expected = {
        "replace-unchanged": MigrationTargetState.V1_PRESERVED,
        "replace-changed": MigrationTargetState.UNKNOWN,
        "replace-unreadable": MigrationTargetState.UNKNOWN,
        "replace-oversized": MigrationTargetState.UNKNOWN,
    }
    for fault, target_state in expected.items():
        repository, target = _write_repository(tmp_path, name=fault)
        preview_result = _preview(repository)
        assert isinstance(preview_result, Success)
        preview = preview_result.value
        operations = FaultInjectingOperations(fault, target)

        applied = apply_manifest_migration(
            preview,
            approved_preview_sha256=preview.preview_sha256,
            approved=True,
            operations=operations,
        )

        assert isinstance(applied, ManifestMigrationFailure)
        assert applied.issue.failure_point is MigrationFailurePoint.REPLACE
        assert applied.issue.target_state is target_state
        assert applied.issue.staging_state is MigrationStagingState.VALIDATED
        assert applied.issue.cleanup_outcome is MigrationCleanupOutcome.REMOVED
        assert operations.mutations == ["create", "write", "replace", "unlink"]
        assert operations.staging is not None
        assert not operations.staging.exists()
        if fault == "replace-unchanged":
            assert target.read_bytes() == EXPECTED_V1
        elif fault == "replace-changed":
            assert target.read_bytes() == b"changed during replace"
        elif fault == "replace-unreadable":
            assert not target.exists()
        else:
            assert target.stat().st_size == MAX_MANIFEST_BYTES + 1
