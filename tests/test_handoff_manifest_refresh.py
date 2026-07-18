"""Fixed and property evidence for the read-only started-v2 refresh preview."""

from __future__ import annotations

import hashlib
import json
import shutil
from dataclasses import replace
from pathlib import Path

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from ai_coding_template_ja.openspec_gsd_handoff.execution_mapping import (
    read_planning_inventory,
)
from ai_coding_template_ja.openspec_gsd_handoff.manifest import ManifestArtifact
from ai_coding_template_ja.openspec_gsd_handoff.manifest_refresh import (
    RefreshLimits,
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
SOURCE_COMMIT = "fbe7f714f734d714480583ab90f41ec0d2077f50"
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
    tmp_path: Path, manifest_bytes: bytes | None = None
) -> tuple[Path, Path]:
    repository = tmp_path / "repository"
    manifest, _, _, _, _ = _inputs()
    for artifact in manifest.artifacts:
        target = repository / artifact.path
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(REPOSITORY_ROOT / artifact.path, target)
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
    return repository, target


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

    changed = _preview(repository, current_source_commit="e" * 40)
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
