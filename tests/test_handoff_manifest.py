"""Deterministic and fault-injected handoff manifest contract tests."""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import pytest
from ai_coding_template_ja.openspec_gsd_handoff.manifest import (
    CleanupOutcome,
    FailurePoint,
    GsdCapability,
    HandoffManifest,
    ManifestArtifact,
    ManifestCapabilities,
    ManifestFileOperations,
    ManifestPersistenceFailure,
    ManifestRepository,
    OpenSpecCapability,
    StagingKnownState,
    parse_manifest_bytes,
    serialize_manifest,
)

from ai_coding_template_ja.openspec_gsd_handoff.models import (
    HandoffState,
    HostCapabilityInput,
    HostDispatch,
    HostSpawnSchema,
    KnownState,
    NormalizedTask,
    Progress,
    Success,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
EXPECTED = (
    REPO_ROOT
    / "tests"
    / "fixtures"
    / "openspec_gsd_handoff"
    / "manifest"
    / "expected-prepared.json"
).read_bytes()


def _manifest(*, state: HandoffState = HandoffState.PREPARED) -> HandoffManifest:
    return HandoffManifest(
        schema_version=1,
        change_id="fixture-change",
        handoff_state=state,
        artifacts=(
            ManifestArtifact(
                "design", "openspec/changes/fixture-change/design.md", "2" * 64
            ),
            ManifestArtifact(
                "proposal", "openspec/changes/fixture-change/proposal.md", "1" * 64
            ),
            ManifestArtifact(
                "spec",
                "openspec/changes/fixture-change/specs/fixture-capability/spec.md",
                "3" * 64,
            ),
            ManifestArtifact(
                "tasks", "openspec/changes/fixture-change/tasks.md", "4" * 64
            ),
        ),
        source_commit="1" * 40,
        progress=Progress(
            total=3,
            complete=1,
            remaining=2,
            tasks=(
                NormalizedTask("1", "1.1 fixture contractを固定する", True),
                NormalizedTask("2", "1.2 Unicodeの進捗を検証する", False),
                NormalizedTask("3", "1.3 fallback parityを検証する", False),
            ),
        ),
        capabilities=ManifestCapabilities(
            openspec=OpenSpecCapability(
                version="1.3.1",
                probe="instructions-apply-json",
                schema_name="spec-driven",
                input_route="json",
            ),
            gsd=GsdCapability(
                version="1.5.0",
                probe="init-progress-raw",
                project_initialized=False,
                entrypoint="gsd-new-project-auto",
            ),
            host=HostCapabilityInput(
                inspected=True,
                spawn_agent_schema=HostSpawnSchema.GENERIC,
                dispatch=HostDispatch.GENERIC_AGENT_WORKAROUND,
                agent_role_source="toml",
            ),
        ),
    )


def test_expected_fixture_round_trips_to_deterministic_bytes() -> None:
    parsed = parse_manifest_bytes(EXPECTED)

    assert isinstance(parsed, Success)
    first = serialize_manifest(parsed.value)
    second = serialize_manifest(parsed.value)
    assert isinstance(first, Success)
    assert isinstance(second, Success)
    assert first.value == second.value == EXPECTED


def test_parser_rejects_malformed_or_non_minimal_manifest() -> None:
    malformed = parse_manifest_bytes(b"{not-json")
    unsupported = parse_manifest_bytes(
        EXPECTED.replace(b'"schema_version": 1', b'"schema_version": 2')
    )
    extended = parse_manifest_bytes(
        EXPECTED.replace(b'"change_id"', b'"timestamp": "now",\n  "change_id"')
    )

    assert malformed.issue.code == "manifest-json-invalid"  # type: ignore[union-attr]
    assert unsupported.issue.code == "manifest-schema-unsupported"  # type: ignore[union-attr]
    assert extended.issue.code == "manifest-fields-invalid"  # type: ignore[union-attr]


def test_repository_persists_prepared_then_transitions_only_to_started(
    tmp_path: Path,
) -> None:
    target = tmp_path / ".planning" / "openspec" / "fixture-change" / "handoff.json"
    repository = ManifestRepository(target)

    prepared = repository.persist(_manifest())
    started = repository.persist(
        replace(_manifest(), handoff_state=HandoffState.STARTED),
        expected_existing=HandoffState.PREPARED,
    )
    forbidden = repository.persist(_manifest())

    assert isinstance(prepared, Success)
    assert isinstance(started, Success)
    assert isinstance(forbidden, ManifestPersistenceFailure)
    assert forbidden.issue.failure_point is FailurePoint.STATE_GUARD
    assert forbidden.issue.target_state is KnownState.STARTED
    assert parse_manifest_bytes(target.read_bytes()) == started


class _FaultOperations(ManifestFileOperations):
    def __init__(self, fault: str) -> None:
        self.fault = fault
        self.replace_calls = 0

    def read_bytes(self, path: Path) -> bytes:
        data = super().read_bytes(path)
        if self.fault == "validation" and path.suffix == ".tmp":
            return b"{}"
        return data

    def replace(self, source: Path, target: Path) -> None:
        self.replace_calls += 1
        if self.fault == "replace":
            raise OSError("injected replace failure")
        super().replace(source, target)

    def unlink(self, path: Path) -> None:
        if self.fault == "cleanup":
            raise OSError("injected cleanup failure")
        super().unlink(path)


@pytest.mark.parametrize(
    ("fault", "point", "staging", "cleanup"),
    [
        (
            "validation",
            FailurePoint.VALIDATE,
            StagingKnownState.INVALID,
            CleanupOutcome.REMOVED,
        ),
        (
            "replace",
            FailurePoint.REPLACE,
            StagingKnownState.VALIDATED,
            CleanupOutcome.REMOVED,
        ),
        (
            "cleanup",
            FailurePoint.REPLACE,
            StagingKnownState.VALIDATED,
            CleanupOutcome.FAILED,
        ),
    ],
)
def test_faults_never_advance_target_and_report_cleanup_evidence(
    tmp_path: Path,
    fault: str,
    point: FailurePoint,
    staging: StagingKnownState,
    cleanup: CleanupOutcome,
) -> None:
    target = tmp_path / "handoff.json"
    operations = _FaultOperations("none")
    repository = ManifestRepository(target, operations=operations)
    assert isinstance(repository.persist(_manifest()), Success)
    before = target.read_bytes()
    operations.fault = fault

    result = repository.persist(
        replace(_manifest(), handoff_state=HandoffState.STARTED),
        expected_existing=HandoffState.PREPARED,
    )

    assert isinstance(result, ManifestPersistenceFailure)
    assert result.issue.failure_point is point
    assert result.issue.target_state is KnownState.PREPARED
    assert result.issue.staging_state is staging
    assert result.issue.cleanup_outcome is cleanup
    assert target.read_bytes() == before
    if fault == "validation":
        assert operations.replace_calls == 1  # only the initial prepared write
