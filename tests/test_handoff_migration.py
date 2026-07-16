"""Read-only manifest migration preview contract tests."""

from __future__ import annotations

import hashlib
from dataclasses import replace
from pathlib import Path

from ai_coding_template_ja.openspec_gsd_handoff.manifest import (
    MAX_MANIFEST_BYTES,
    ManifestFileOperations,
    parse_manifest_bytes,
)
from ai_coding_template_ja.openspec_gsd_handoff.manifest_migration import (
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
