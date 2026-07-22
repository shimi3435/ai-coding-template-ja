"""Fixed and property evidence for the read-only started-v2 refresh preview."""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from dataclasses import replace
from pathlib import Path
from typing import cast

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from ai_coding_template_ja.openspec_gsd_handoff.execution_mapping import (
    read_planning_inventory,
)
from ai_coding_template_ja.openspec_gsd_handoff.manifest import ManifestArtifact
from ai_coding_template_ja.openspec_gsd_handoff.manifest_refresh import (
    ManifestRefreshFailure,
    ManifestRefreshFileOperations,
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
    Failure,
    HandoffState,
    Success,
)
from ai_coding_template_ja.openspec_gsd_handoff.policy_reference import (
    observe_policy_sections,
    read_policy_reference_registry,
)
from ai_coding_template_ja.openspec_gsd_handoff.progress import parse_task_progress

REPOSITORY_ROOT = Path(__file__).parents[1]
CHANGE_ID = "harden-openspec-gsd-handoff-lifecycle"
HANDOFF_PATH = f".planning/openspec/{CHANGE_ID}/handoff.json"
SOURCE_PATH = (
    f"openspec/changes/{CHANGE_ID}/specs/"
    "openspec-gsd-handoff-lifecycle-hardening/spec.md"
)
ASSIGNMENT_PATH = (
    "tests/fixtures/openspec_gsd_handoff/mapping/hardening-phase-assignments.json"
)
POLICY_REGISTRY_PATH = "docs/agents/adaptive-change-execution.references.json"
SOURCE_COMMIT = "4d8b5b173927ed518d39dee18a29b0271628afbd"
ALTERNATE_SOURCE_COMMIT = "cca33916805a46a712f60da6a5f22a358889cffe"
TRACKED_HANDOFF_SHA256 = (
    "554690a1eee6e632eaf7c4fce3517cba69ff38eb8a06a1873b7a5e6822e59914"
)
TRACKED_TASKS_SHA256 = (
    "cf4a9dc56afc15b98a008cff686989bd446215c95b3962ea3efd5a4f9eb30220"
)
REFRESH_EVIDENCE_PATH = (
    ".planning/phases/02-source-to-execution-mapping/02-REFRESH-PREVIEW.json"
)
EXPECTED = json.loads(
    (
        REPOSITORY_ROOT
        / "tests/fixtures/openspec_gsd_handoff/manifest/expected-refresh-preview.json"
    ).read_text(encoding="utf-8")
)


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _inputs():
    parsed = parse_manifest_v2_bytes((REPOSITORY_ROOT / HANDOFF_PATH).read_bytes())
    assert isinstance(parsed, Success)
    manifest = parsed.value
    artifacts = tuple(
        ManifestArtifact(
            item.kind, item.path, _sha256((REPOSITORY_ROOT / item.path).read_bytes())
        )
        for item in manifest.artifacts
    )
    progress = parse_task_progress(
        (REPOSITORY_ROOT / f"openspec/changes/{CHANGE_ID}/tasks.md").read_text(
            encoding="utf-8"
        )
    )
    assert isinstance(progress, Success)
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
        shutil.copyfile(REPOSITORY_ROOT / artifact.path, target)
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
        manifest_bytes
        if manifest_bytes is not None
        else (REPOSITORY_ROOT / HANDOFF_PATH).read_bytes()
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
        self, parent_descriptor: int, source_name: str, target_name: str
    ) -> None:
        self.mutations.append("replace")
        super().replace_at(parent_descriptor, source_name, target_name)

    def unlink_at(self, parent_descriptor: int, name: str) -> None:
        self.mutations.append("unlink")
        super().unlink_at(parent_descriptor, name)


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
        self, parent_descriptor: int, source_name: str, target_name: str
    ) -> None:
        if self.fault.startswith("replace-"):
            self.mutations.append("replace")
            if self.fault == "replace-changed":
                self.target.write_bytes(b"changed during refresh replace")
            elif self.fault == "replace-unreadable":
                self.target.unlink()
            elif self.fault == "replace-oversized":
                self.target.write_bytes(b"x" * (8 * 1024 * 1024 + 1))
            raise OSError("injected refresh replace failure")
        super().replace_at(parent_descriptor, source_name, target_name)

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


def _compact_json(value: object) -> bytes:
    return (
        json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n"
    ).encode()


def _repository_root_evidence() -> bytes:
    target = REPOSITORY_ROOT / HANDOFF_PATH
    tasks = REPOSITORY_ROOT / f"openspec/changes/{CHANGE_ID}/tasks.md"
    target_before = target.read_bytes()
    tasks_before = tasks.read_bytes()
    staging_before = tuple(
        sorted(path.name for path in target.parent.glob(".handoff.*.tmp"))
    )
    operations = MutationRecordingRefreshOperations()

    result = _preview(REPOSITORY_ROOT, operations=operations)

    assert isinstance(result, Success)
    assert operations.mutations == []
    preview = result.value
    machine = serialize_manifest_refresh_preview(preview)
    assert isinstance(machine, Success)
    target_after = target.read_bytes()
    tasks_after = tasks.read_bytes()
    staging_after = tuple(
        sorted(path.name for path in target.parent.glob(".handoff.*.tmp"))
    )
    created = [item for item in preview.changes if item.kind == "created"]
    updated = [item for item in preview.changes if item.kind == "updated"]
    evidence = {
        "evidence_schema": "openspec-gsd-refresh-preview-evidence-v1",
        "generation_mode": "read-only-preview-only",
        "apply_invoked": False,
        "mutation_operations": operations.mutations,
        "preview_sha256": preview.preview_sha256,
        "target_observation": {
            "path": HANDOFF_PATH,
            "before_sha256": _sha256(target_before),
            "after_sha256": _sha256(target_after),
            "unchanged": target_before == target_after,
        },
        "tasks_observation": {
            "path": f"openspec/changes/{CHANGE_ID}/tasks.md",
            "before_sha256": _sha256(tasks_before),
            "after_sha256": _sha256(tasks_after),
            "unchanged": tasks_before == tasks_after,
        },
        "staging_observation": {
            "before": list(staging_before),
            "after": list(staging_after),
        },
        "reconciliation": {
            "previous_active": len(preview.previous_source_items.active),
            "candidate_active": len(preview.candidate_source_items.active),
            "created": len(created),
            "updated": len(updated),
            "tombstoned": len(preview.candidate_source_items.tombstones),
            "next_requirement_id": preview.candidate_source_items.next_requirement_id,
            "next_scenario_id": preview.candidate_source_items.next_scenario_id,
        },
        "mapping_coverage": {
            "active": len(preview.candidate_source_items.active),
            "mapped": len(preview.candidate_mappings),
        },
        "preview": json.loads(machine.value),
    }
    return _compact_json(evidence)


def test_repository_root_preview_matches_complete_read_only_evidence() -> None:
    target = REPOSITORY_ROOT / HANDOFF_PATH
    tasks = REPOSITORY_ROOT / f"openspec/changes/{CHANGE_ID}/tasks.md"
    target_before = target.read_bytes()
    tasks_before = tasks.read_bytes()

    evidence_bytes = _repository_root_evidence()
    tracked_evidence = (REPOSITORY_ROOT / REFRESH_EVIDENCE_PATH).read_bytes()

    assert tracked_evidence == evidence_bytes
    evidence = json.loads(tracked_evidence)
    assert set(evidence) == {
        "evidence_schema",
        "generation_mode",
        "apply_invoked",
        "mutation_operations",
        "preview_sha256",
        "target_observation",
        "tasks_observation",
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
        "before_sha256": TRACKED_HANDOFF_SHA256,
        "after_sha256": TRACKED_HANDOFF_SHA256,
        "unchanged": True,
    }
    assert evidence["tasks_observation"] == {
        "path": f"openspec/changes/{CHANGE_ID}/tasks.md",
        "before_sha256": TRACKED_TASKS_SHA256,
        "after_sha256": TRACKED_TASKS_SHA256,
        "unchanged": True,
    }
    assert evidence["staging_observation"] == {"before": [], "after": []}
    assert evidence["reconciliation"] == {
        "previous_active": 42,
        "candidate_active": 49,
        "created": 7,
        "updated": 2,
        "tombstoned": 0,
        "next_requirement_id": 7,
        "next_scenario_id": 44,
    }
    assert evidence["mapping_coverage"] == {"active": 49, "mapped": 49}
    machine_bytes = _compact_json(evidence["preview"])
    assert _sha256(machine_bytes) == evidence["preview_sha256"]
    candidate = parse_manifest_v2_bytes(
        evidence["preview"]["candidate_bytes_utf8"].encode()
    )
    assert isinstance(candidate, Success)
    assert candidate.value.source_commit == SOURCE_COMMIT
    assert target.read_bytes() == target_before
    assert tasks.read_bytes() == tasks_before
    assert not tuple(target.parent.glob(".handoff.*.tmp"))


def test_pinned_started_v2_builds_exact_complete_read_only_candidate(
    tmp_path: Path,
) -> None:
    repository, target = _repository(tmp_path)
    before = target.read_bytes()

    result = _preview(repository)

    assert isinstance(result, Success)
    preview = result.value
    assert preview.old_target_sha256 == EXPECTED["old_target_sha256"]
    assert len(preview.previous_source_items.active) == 42
    assert len(preview.candidate_source_items.active) == 49
    assert preview.candidate_source_items.tombstones == ()
    assert (
        preview.candidate_source_items.next_requirement_id,
        preview.candidate_source_items.next_scenario_id,
    ) == (7, 44)
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
    assert len(preview.candidate_mappings) == 49
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
    assert json.loads(preview.candidate_bytes) == EXPECTED["candidate_manifest"]
    assert preview.candidate_bytes.decode() == EXPECTED["candidate_bytes_utf8"]
    assert target.read_bytes() == before


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
