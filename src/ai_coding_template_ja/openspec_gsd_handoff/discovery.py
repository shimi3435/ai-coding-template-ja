"""OpenSpec 1.3.1 candidate validation and fresh Markdown fallback."""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path

from .models import (
    ArtifactClaim,
    ArtifactKind,
    ClassifiedIssue,
    Discovery,
    Failure,
    InputRoute,
    IssueCategory,
    KnownState,
    Result,
    Success,
)
from .progress import parse_task_progress, validate_candidate_progress
from .reader import read_canonical_artifacts

SUPPORTED_OPENSPEC_VERSION = "1.3.1"


@dataclass(frozen=True)
class OpenSpecProbe:
    """Injected output from the two read-only OpenSpec probes."""

    version_exit_code: int
    version_stdout: str
    apply_exit_code: int
    apply_stdout: str


def _issue(code: str, route: InputRoute) -> Failure:
    return Failure(
        issue=ClassifiedIssue(
            category=IssueCategory.DISCOVERY,
            code=code,
            known_state=KnownState.MANIFEST_ABSENT,
        ),
        route=route,
    )


def _with_route(failure: Failure, route: InputRoute) -> Failure:
    return Failure(issue=failure.issue, route=route)


def _fixed_claims(repository: Path, change_id: str) -> list[ArtifactClaim] | None:
    change = repository / "openspec" / "changes" / change_id
    specs_root = change / "specs"
    try:
        capabilities = sorted(specs_root.iterdir(), key=lambda path: path.name)
    except OSError:
        return None
    spec_paths = [path / "spec.md" for path in capabilities if path.is_dir()]
    if not spec_paths:
        return None
    return [
        ArtifactClaim(ArtifactKind.PROPOSAL, change / "proposal.md"),
        ArtifactClaim(ArtifactKind.DESIGN, change / "design.md"),
        *(ArtifactClaim(ArtifactKind.SPEC, path) for path in spec_paths),
        ArtifactClaim(ArtifactKind.TASKS, change / "tasks.md"),
    ]


def _read_discovery(
    repository: Path,
    change_id: str,
    claims: list[ArtifactClaim],
    route: InputRoute,
) -> Result[Discovery]:
    artifacts_result = read_canonical_artifacts(repository, change_id, claims)
    if isinstance(artifacts_result, Failure):
        return _with_route(artifacts_result, route)
    tasks_artifacts = [
        artifact
        for artifact in artifacts_result.value
        if artifact.kind is ArtifactKind.TASKS
    ]
    if len(tasks_artifacts) != 1:
        return _issue("tasks-artifact-cardinality", route)
    progress_result = parse_task_progress(tasks_artifacts[0].content)
    if isinstance(progress_result, Failure):
        return _with_route(progress_result, route)
    return Success(
        Discovery(artifacts=artifacts_result.value, progress=progress_result.value),
        route=route,
    )


def _fallback(repository: Path, change_id: str) -> Result[Discovery]:
    claims = _fixed_claims(repository, change_id)
    if claims is None:
        return _issue("fallback-artifacts-missing", InputRoute.MARKDOWN_FALLBACK)
    return _read_discovery(repository, change_id, claims, InputRoute.MARKDOWN_FALLBACK)


def _string_list(value: object, *, size: int | None = None) -> list[str] | None:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        return None
    if size is not None and len(value) != size:
        return None
    if not value or any(type(item) is not str for item in value):
        return None
    return list(value)


def _candidate_claims(
    raw: Mapping[object, object], repository: Path, change_id: str
) -> list[ArtifactClaim] | None:
    change = repository / "openspec" / "changes" / change_id
    context_files = raw.get("contextFiles")
    if not isinstance(context_files, Mapping):
        return None
    proposal = _string_list(context_files.get("proposal"), size=1)
    design = _string_list(context_files.get("design"), size=1)
    tasks = _string_list(context_files.get("tasks"), size=1)
    specs = _string_list(context_files.get("specs"))
    if proposal is None or design is None or tasks is None or specs is None:
        return None

    raw_paths = [*proposal, *design, *specs, *tasks]
    paths = [Path(raw_path) for raw_path in raw_paths]
    if not all(path.is_absolute() for path in paths) or len(set(paths)) != len(paths):
        return None
    try:
        change_resolved = change.resolve(strict=True)
        expected_singletons = {
            Path(proposal[0]).resolve(strict=True): (change / "proposal.md").resolve(
                strict=True
            ),
            Path(design[0]).resolve(strict=True): (change / "design.md").resolve(
                strict=True
            ),
            Path(tasks[0]).resolve(strict=True): (change / "tasks.md").resolve(
                strict=True
            ),
        }
        resolved_specs = [Path(path).resolve(strict=True) for path in specs]
        specs_root = (change / "specs").resolve(strict=True)
    except OSError:
        return None
    if any(actual != expected for actual, expected in expected_singletons.items()):
        return None
    if any(
        path.name != "spec.md"
        or not path.is_relative_to(change_resolved)
        or path.parent.parent != specs_root
        for path in resolved_specs
    ):
        return None
    return [
        ArtifactClaim(ArtifactKind.PROPOSAL, Path(proposal[0])),
        ArtifactClaim(ArtifactKind.DESIGN, Path(design[0])),
        *(ArtifactClaim(ArtifactKind.SPEC, Path(path)) for path in specs),
        ArtifactClaim(ArtifactKind.TASKS, Path(tasks[0])),
    ]


def _candidate_shape(
    raw: object, repository: Path, change_id: str
) -> tuple[Mapping[object, object], list[ArtifactClaim]] | None:
    if not isinstance(raw, Mapping):
        return None
    required_strings = ("changeName", "changeDir", "schemaName", "state", "instruction")
    if any(type(raw.get(key)) is not str for key in required_strings):
        return None
    if raw.get("changeName") != change_id or raw.get("schemaName") != "spec-driven":
        return None
    if raw.get("state") not in {"ready", "blocked", "all_done"}:
        return None
    try:
        candidate_change = Path(str(raw["changeDir"])).resolve(strict=True)
        expected_change = (repository / "openspec" / "changes" / change_id).resolve(
            strict=True
        )
    except OSError:
        return None
    if (
        not Path(str(raw["changeDir"])).is_absolute()
        or candidate_change != expected_change
    ):
        return None
    if "missingArtifacts" in raw:
        missing = _string_list(raw.get("missingArtifacts"))
        if missing is None:
            return None
    claims = _candidate_claims(raw, repository, change_id)
    if claims is None:
        return None
    return raw, claims


def _candidate_discovery(
    raw: object, repository: Path, change_id: str
) -> Result[Discovery] | None:
    shape = _candidate_shape(raw, repository, change_id)
    if shape is None:
        return None
    candidate, claims = shape
    discovery_result = _read_discovery(repository, change_id, claims, InputRoute.JSON)
    if isinstance(discovery_result, Failure):
        return None
    parity = validate_candidate_progress(
        candidate.get("progress"),
        candidate.get("tasks"),
        discovery_result.value.progress,
    )
    if isinstance(parity, Failure):
        return None

    state = candidate["state"]
    missing = candidate.get("missingArtifacts")
    if state == "blocked" or missing:
        return _issue("openspec-unprepared", InputRoute.JSON)
    if state == "all_done":
        if discovery_result.value.progress.remaining != 0:
            return None
        return _issue("openspec-all-done", InputRoute.JSON)
    if discovery_result.value.progress.remaining == 0:
        return None
    return discovery_result


def discover_openspec_artifacts(
    repository_root: Path,
    change_id: str,
    probe: OpenSpecProbe,
) -> Result[Discovery]:
    """Adopt one complete supported candidate or restart from fixed paths."""

    if (
        type(probe.version_exit_code) is not int
        or probe.version_exit_code != 0
        or probe.version_stdout.rstrip("\r\n") != SUPPORTED_OPENSPEC_VERSION
        or type(probe.apply_exit_code) is not int
        or probe.apply_exit_code != 0
    ):
        return _fallback(repository_root, change_id)
    try:
        raw = json.loads(probe.apply_stdout)
    except (json.JSONDecodeError, TypeError):
        return _fallback(repository_root, change_id)
    candidate = _candidate_discovery(raw, repository_root, change_id)
    if candidate is None:
        return _fallback(repository_root, change_id)
    return candidate
