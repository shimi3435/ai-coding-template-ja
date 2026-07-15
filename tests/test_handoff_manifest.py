"""Deterministic and fault-injected handoff manifest contract tests."""

from __future__ import annotations

import json
from dataclasses import replace
from pathlib import Path

import pytest

from ai_coding_template_ja.openspec_gsd_handoff import mark_handoff_started
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
    Failure,
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
MANIFEST_BYTE_LIMIT = 8_388_608


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


def test_started_transition_rejects_kind_path_mismatched_existing_manifest(
    tmp_path: Path,
) -> None:
    raw = json.loads(EXPECTED)
    proposal = next(item for item in raw["artifacts"] if item["kind"] == "proposal")
    spec = next(item for item in raw["artifacts"] if item["kind"] == "spec")
    proposal["path"], spec["path"] = spec["path"], proposal["path"]
    target = tmp_path / ".planning" / "openspec" / "fixture-change" / "handoff.json"
    target.parent.mkdir(parents=True)
    target.write_text(json.dumps(raw), encoding="utf-8")

    result = mark_handoff_started(tmp_path, "fixture-change", gsd_accepted=True)

    assert isinstance(result, Failure)
    assert result.issue.code == "manifest-value-invalid"


def test_parser_rejects_manifest_with_more_than_64_artifacts() -> None:
    raw = json.loads(EXPECTED)
    singleton_artifacts = [item for item in raw["artifacts"] if item["kind"] != "spec"]
    raw["artifacts"] = sorted(
        [
            *singleton_artifacts,
            *(
                {
                    "kind": "spec",
                    "path": (
                        "openspec/changes/fixture-change/specs/"
                        f"capability-{index:02d}/spec.md"
                    ),
                    "sha256": f"{index:064x}",
                }
                for index in range(62)
            ),
        ],
        key=lambda item: (item["kind"], item["path"]),
    )

    result = parse_manifest_bytes(json.dumps(raw).encode())

    assert isinstance(result, Failure)
    assert result.issue.code == "manifest-value-invalid"


@pytest.mark.parametrize("alias", ["dot", "separator", "duplicate"])
def test_parser_and_transition_reject_lexical_path_aliases(
    tmp_path: Path, alias: str
) -> None:
    raw = json.loads(EXPECTED)
    if alias == "dot":
        raw["artifacts"][1]["path"] = f"./{raw['artifacts'][1]['path']}"
    elif alias == "separator":
        raw["artifacts"][1]["path"] = raw["artifacts"][1]["path"].replace(
            "openspec/changes", "openspec//changes"
        )
    else:
        spec = next(item for item in raw["artifacts"] if item["kind"] == "spec")
        duplicate = dict(spec)
        duplicate["path"] = duplicate["path"].replace("/spec.md", "//spec.md")
        raw["artifacts"].append(duplicate)
    raw["artifacts"].sort(key=lambda item: (item["kind"], item["path"]))
    data = json.dumps(raw).encode()

    parsed = parse_manifest_bytes(data)

    assert isinstance(parsed, Failure)
    assert parsed.issue.code == "manifest-value-invalid"

    target = tmp_path / ".planning" / "openspec" / "fixture-change" / "handoff.json"
    target.parent.mkdir(parents=True)
    target.write_bytes(data)
    before = target.read_bytes()
    operations = _MutationCountingOperations()

    transitioned = mark_handoff_started(
        tmp_path,
        "fixture-change",
        gsd_accepted=True,
        operations=operations,
    )

    assert isinstance(transitioned, Failure)
    assert transitioned.issue.code == "manifest-value-invalid"
    assert operations.mutations == 0
    assert target.read_bytes() == before


def test_manifest_parser_enforces_exact_derived_byte_boundary() -> None:
    boundary = parse_manifest_bytes(b" " * MANIFEST_BYTE_LIMIT)
    exceeded = parse_manifest_bytes(b" " * (MANIFEST_BYTE_LIMIT + 1))

    assert isinstance(boundary, Failure)
    assert boundary.issue.code == "manifest-json-invalid"
    assert isinstance(exceeded, Failure)
    assert exceeded.issue.code == "manifest-size-limit-exceeded"


def test_manifest_parser_rejects_description_larger_than_canonical_tasks_file() -> None:
    raw = json.loads(EXPECTED)
    raw["progress"]["tasks"][0]["description"] = "x" * 1_048_577

    result = parse_manifest_bytes(json.dumps(raw).encode())

    assert isinstance(result, Failure)
    assert result.issue.code == "manifest-value-invalid"


@pytest.mark.parametrize("operation", ["repository", "mark-started"])
def test_existing_oversized_manifest_stops_before_mutation(
    tmp_path: Path, operation: str
) -> None:
    target = tmp_path / ".planning" / "openspec" / "fixture-change" / "handoff.json"
    target.parent.mkdir(parents=True)
    target.write_bytes(b" " * (MANIFEST_BYTE_LIMIT + 1))
    before = target.read_bytes()
    operations = _MutationCountingOperations()

    if operation == "repository":
        result = ManifestRepository(target, operations=operations).persist(_manifest())
    else:
        result = mark_handoff_started(
            tmp_path,
            "fixture-change",
            gsd_accepted=True,
            operations=operations,
        )

    if isinstance(result, ManifestPersistenceFailure):
        code = result.issue.code
    else:
        assert isinstance(result, Failure)
        code = result.issue.code
    assert code == "manifest-size-limit-exceeded"
    assert operations.mutations == 0
    assert target.read_bytes() == before


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

    def read_bounded_bytes(
        self, path: Path, *, limit: int = MANIFEST_BYTE_LIMIT
    ) -> bytes:
        data = super().read_bounded_bytes(path, limit=limit)
        if self.fault == "validation" and path.suffix == ".tmp":
            return b"{}"
        return data

    def replace(self, source: Path, target: Path) -> None:
        self.replace_calls += 1
        if self.fault in {"replace", "cleanup"}:
            raise OSError("injected replace failure")
        super().replace(source, target)

    def unlink(self, path: Path) -> None:
        if self.fault == "cleanup":
            raise OSError("injected cleanup failure")
        super().unlink(path)


class _MutationCountingOperations(ManifestFileOperations):
    def __init__(self) -> None:
        self.mutations = 0

    def make_parent(self, path: Path) -> None:
        self.mutations += 1
        super().make_parent(path)

    def create_staging(self, parent: Path) -> Path:
        self.mutations += 1
        return super().create_staging(parent)


def test_repository_rejects_static_parent_symlink_escape_before_mutation(
    tmp_path: Path,
) -> None:
    repository_root = tmp_path / "repository"
    outside = tmp_path / "outside"
    repository_root.mkdir()
    outside.mkdir()
    (repository_root / ".planning").symlink_to(outside, target_is_directory=True)
    target = (
        repository_root / ".planning" / "openspec" / "fixture-change" / "handoff.json"
    )
    operations = _MutationCountingOperations()

    result = ManifestRepository(target, operations=operations).persist(_manifest())

    assert isinstance(result, ManifestPersistenceFailure)
    assert result.issue.code == "manifest-target-unsafe"
    assert result.issue.failure_point is FailurePoint.STATE_GUARD
    assert operations.mutations == 0
    assert not (outside / "openspec" / "fixture-change" / "handoff.json").exists()


@pytest.mark.parametrize("static_parent_symlink", [False, True])
def test_mark_started_rejects_mismatched_manifest_identity_before_mutation(
    tmp_path: Path, static_parent_symlink: bool
) -> None:
    repository_root = tmp_path / "repository"
    repository_root.mkdir()
    manifest_root = repository_root
    if static_parent_symlink:
        manifest_root = tmp_path / "outside"
        manifest_root.mkdir()
        (repository_root / ".planning").symlink_to(
            manifest_root / ".planning", target_is_directory=True
        )
    target = (
        manifest_root / ".planning" / "openspec" / "fixture-change" / "handoff.json"
    )
    target.parent.mkdir(parents=True)
    raw = json.loads(EXPECTED)
    raw["change_id"] = "different-change"
    for artifact in raw["artifacts"]:
        artifact["path"] = artifact["path"].replace(
            "/fixture-change/", "/different-change/"
        )
    target.write_text(json.dumps(raw), encoding="utf-8")
    before = target.read_bytes()
    operations = _MutationCountingOperations()

    result = mark_handoff_started(
        repository_root,
        "fixture-change",
        gsd_accepted=True,
        operations=operations,
    )

    assert isinstance(result, Failure)
    assert result.issue.code == "manifest-identity-mismatch"
    assert operations.mutations == 0
    assert target.read_bytes() == before


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
    target = tmp_path / ".planning" / "openspec" / "fixture-change" / "handoff.json"
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
