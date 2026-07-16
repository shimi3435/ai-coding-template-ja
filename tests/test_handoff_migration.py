"""Read-only manifest migration preview contract tests."""

from __future__ import annotations

import hashlib
from dataclasses import replace
from pathlib import Path

from ai_coding_template_ja.openspec_gsd_handoff.manifest_migration import (
    preview_manifest_migration,
)

from ai_coding_template_ja.openspec_gsd_handoff.manifest import (
    ManifestFileOperations,
    parse_manifest_bytes,
)
from ai_coding_template_ja.openspec_gsd_handoff.models import Success

REPO_ROOT = Path(__file__).resolve().parent.parent
EXPECTED_V1 = (
    REPO_ROOT
    / "tests"
    / "fixtures"
    / "openspec_gsd_handoff"
    / "manifest"
    / "expected-prepared.json"
).read_bytes()
SOURCE_PATH = "openspec/changes/fixture-change/specs/fixture-capability/spec.md"
TARGET_PATH = ".planning/openspec/fixture-change/handoff.json"
SOURCE_COMMIT = "a" * 40
SOURCE = (
    b"## ADDED Requirements\n\n"
    b"### Requirement: Durable preview\n"
    b"The bridge MUST preview without mutation.\n\n"
    b"#### Scenario: Stable content edit\n"
    b"- **WHEN** the source content changes\n"
    b"- **THEN** the stable identity remains\n"
)


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
) -> tuple[Path, Path]:
    repository = tmp_path / name
    target = repository / TARGET_PATH
    target.parent.mkdir(parents=True)
    target.write_bytes(EXPECTED_V1)
    source_target = repository / SOURCE_PATH
    source_target.parent.mkdir(parents=True)
    source_target.write_bytes(source)
    return repository, target


def _inputs(source: bytes = SOURCE):
    parsed = parse_manifest_bytes(EXPECTED_V1)
    assert isinstance(parsed, Success)
    current_artifacts = tuple(
        replace(artifact, sha256=_sha256(source))
        if artifact.path == SOURCE_PATH
        else artifact
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
    assert [change.kind for change in updated.value.changes] == [
        "updated",
        "updated",
    ]
    assert all(
        change.previous_fingerprint != change.candidate_fingerprint
        for change in updated.value.changes
    )
    assert target.read_bytes() == EXPECTED_V1
