"""Fixed-argv read-only probes and explicit handoff preflight evidence."""

from __future__ import annotations

import json
import re
import subprocess
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path

from .discovery import OpenSpecProbe
from .manifest import GsdCapability
from .models import (
    Artifact,
    ClassifiedIssue,
    Failure,
    HostCapabilityInput,
    HostDispatch,
    HostSpawnSchema,
    IssueCategory,
    KnownState,
    Result,
    Success,
)

COMMAND_TIMEOUT_SECONDS = 30.0
COMMAND_OUTPUT_LIMIT = 4_194_304
SUPPORTED_GSD_VERSION = "1.5.0"
_SOURCE_COMMIT = re.compile(r"[0-9a-f]{40}")
GSD_REQUIRED_FILES = (
    "gsd-core/bin/gsd-tools.cjs",
    "skills/gsd-new-project/SKILL.md",
    "skills/gsd-phase/SKILL.md",
    "agents/gsd-project-researcher.md",
    "agents/gsd-project-researcher.toml",
    "agents/gsd-roadmapper.md",
    "agents/gsd-roadmapper.toml",
    "agents/gsd-planner.md",
    "agents/gsd-planner.toml",
    "agents/gsd-executor.md",
    "agents/gsd-executor.toml",
    "agents/gsd-verifier.md",
    "agents/gsd-verifier.toml",
)


@dataclass(frozen=True)
class CommandResult:
    """One process boundary result with stdout bytes kept from stderr text."""

    argv: tuple[str, ...]
    cwd: Path
    timeout: float
    return_code: int
    stdout: bytes
    stderr: str


type CommandRunner = Callable[
    [tuple[str, ...]], CommandResult
]  # Runtime callers also pass keyword-only cwd and timeout.


class RepositoryPolicyVerdict(StrEnum):
    """Caller-owned repository policy; local Git never infers it."""

    TRACKED = "tracked"
    UNTRACKED = "untracked"
    UNKNOWN = "unknown"


@dataclass(frozen=True)
class GsdProbeEvidence:
    """Independent GSD installation and read-only process evidence."""

    version: str
    required_files_exist: bool
    process: CommandResult


@dataclass(frozen=True)
class ValidatedRepositoryInputs:
    """Separate source, ignore, policy, and host authorization facts."""

    source_commit: str
    source_matches: bool
    manifest_not_ignored: bool
    repository_policy: RepositoryPolicyVerdict
    host_capability: HostCapabilityInput


def _failure(code: str) -> Failure:
    return Failure(
        ClassifiedIssue(
            category=IssueCategory.PREFLIGHT,
            code=code,
            known_state=KnownState.MANIFEST_ABSENT,
        )
    )


def subprocess_runner(
    argv: tuple[str, ...], *, cwd: Path, timeout: float
) -> CommandResult:
    """Run one bounded fixed argv without shell interpolation."""

    try:
        completed = subprocess.run(  # noqa: S603 - argv is fixed by bridge callers
            list(argv),
            cwd=cwd,
            timeout=timeout,
            capture_output=True,
            shell=False,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return CommandResult(argv, cwd, timeout, 126, b"", str(exc))
    stdout = completed.stdout
    stderr_bytes = completed.stderr
    if len(stdout) > COMMAND_OUTPUT_LIMIT or len(stderr_bytes) > COMMAND_OUTPUT_LIMIT:
        return CommandResult(
            argv, cwd, timeout, 125, b"", "command-output-limit-exceeded"
        )
    return CommandResult(
        argv,
        cwd,
        timeout,
        completed.returncode,
        stdout,
        stderr_bytes.decode("utf-8", errors="replace"),
    )


def _run(
    runner: Callable[..., CommandResult], argv: tuple[str, ...], repository: Path
) -> CommandResult:
    return runner(argv, cwd=repository, timeout=COMMAND_TIMEOUT_SECONDS)


def _stdout_text(result: CommandResult) -> str:
    try:
        return result.stdout.decode("utf-8")
    except UnicodeDecodeError:
        return ""


def collect_openspec_probe(
    runner: Callable[..., CommandResult], repository: Path, change_id: str
) -> OpenSpecProbe:
    """Collect the two pinned OpenSpec process results without interpreting stderr."""

    version = _run(runner, ("openspec", "--version"), repository)
    apply = _run(
        runner,
        (
            "openspec",
            "instructions",
            "apply",
            "--change",
            change_id,
            "--json",
        ),
        repository,
    )
    return OpenSpecProbe(
        version_exit_code=version.return_code,
        version_stdout=_stdout_text(version),
        apply_exit_code=apply.return_code,
        apply_stdout=_stdout_text(apply),
    )


def collect_gsd_probe(
    runner: Callable[..., CommandResult], repository: Path, gsd_home: Path
) -> GsdProbeEvidence:
    """Read exact VERSION/files and run only the pinned read-only init probe."""

    version_path = gsd_home / "gsd-core" / "VERSION"
    try:
        version = version_path.read_text(encoding="utf-8").rstrip("\r\n")
    except (OSError, UnicodeError):
        version = ""
    required_files_exist = all(
        (gsd_home / relative).is_file() for relative in GSD_REQUIRED_FILES
    )
    process = _run(
        runner,
        (
            "node",
            str(gsd_home / "gsd-core" / "bin" / "gsd-tools.cjs"),
            "init",
            "progress",
            "--raw",
        ),
        repository,
    )
    return GsdProbeEvidence(version, required_files_exist, process)


def parse_gsd_capability(
    repository: Path, evidence: GsdProbeEvidence
) -> Result[GsdCapability]:
    """Validate the pinned composite GSD 1.5.0 signal."""

    if evidence.version != SUPPORTED_GSD_VERSION:
        return _failure("gsd-version-unsupported")
    if not evidence.required_files_exist:
        return _failure("gsd-required-files-missing")
    if evidence.process.return_code != 0:
        return _failure("gsd-probe-failed")
    try:
        raw = json.loads(evidence.process.stdout)
    except (json.JSONDecodeError, UnicodeDecodeError, TypeError):
        return _failure("gsd-probe-json-invalid")
    if not isinstance(raw, dict):
        return _failure("gsd-probe-shape-invalid")
    project_exists = raw.get("project_exists")
    roadmap_exists = raw.get("roadmap_exists")
    state_exists = raw.get("state_exists")
    project_root = raw.get("project_root")
    agents_installed = raw.get("agents_installed")
    missing_agents = raw.get("missing_agents")
    if (
        type(project_exists) is not bool
        or type(roadmap_exists) is not bool
        or type(state_exists) is not bool
        or type(project_root) is not str
        or type(agents_installed) is not bool
        or not isinstance(missing_agents, list)
        or any(type(item) is not str for item in missing_agents)
    ):
        return _failure("gsd-probe-shape-invalid")
    try:
        root_matches = Path(project_root).resolve(strict=True) == repository.resolve(
            strict=True
        )
    except OSError:
        root_matches = False
    if not root_matches:
        return _failure("gsd-project-root-mismatch")
    if not agents_installed or missing_agents:
        return _failure("gsd-agents-incomplete")
    states = (project_exists, roadmap_exists, state_exists)
    if states == (False, False, False):
        initialized = False
        entrypoint = "gsd-new-project-auto"
    elif states == (True, True, True):
        initialized = True
        entrypoint = "gsd-phase"
    else:
        return _failure("gsd-initialization-partial")
    return Success(
        GsdCapability(
            version=SUPPORTED_GSD_VERSION,
            probe="init-progress-raw",
            project_initialized=initialized,
            entrypoint=entrypoint,
        )
    )


def _valid_host(host: HostCapabilityInput) -> bool:
    if not host.inspected:
        return False
    if host.spawn_agent_schema is HostSpawnSchema.TYPED:
        return host.dispatch is HostDispatch.TYPED and host.agent_role_source is None
    return (
        host.spawn_agent_schema is HostSpawnSchema.GENERIC
        and host.dispatch is HostDispatch.GENERIC_AGENT_WORKAROUND
        and host.agent_role_source == "toml"
    )


def _git(
    runner: Callable[..., CommandResult], repository: Path, *arguments: str
) -> CommandResult:
    return _run(runner, ("git", *arguments), repository)


def validate_repository_inputs(
    repository: Path,
    source_commit: str,
    artifacts: Sequence[Artifact],
    *,
    runner: Callable[..., CommandResult],
    manifest_path: Path,
    repository_policy: RepositoryPolicyVerdict | None,
    host_capability: HostCapabilityInput,
) -> Result[ValidatedRepositoryInputs]:
    """Validate source bytes, local ignore state, explicit policy, and host input."""

    if repository_policy is not RepositoryPolicyVerdict.TRACKED:
        return _failure("repository-policy-invalid")
    if not _valid_host(host_capability):
        return _failure("host-capability-invalid")
    if not artifacts:
        return _failure("git-source-artifacts-empty")
    if _SOURCE_COMMIT.fullmatch(source_commit) is None:
        return _failure("git-source-commit-invalid")

    commit_check = _git(
        runner, repository, "cat-file", "-e", f"{source_commit}^{{commit}}"
    )
    if commit_check.return_code != 0:
        return _failure("git-source-commit-invalid")
    root = _git(runner, repository, "rev-parse", "--show-toplevel")
    if root.return_code != 0:
        return _failure("git-root-probe-failed")
    try:
        root_path = Path(root.stdout.decode("utf-8").strip()).resolve(strict=True)
        expected_root = repository.resolve(strict=True)
    except (OSError, UnicodeDecodeError):
        return _failure("git-root-probe-invalid")
    if root_path != expected_root:
        return _failure("git-root-mismatch")

    for artifact in artifacts:
        blob = _git(
            runner,
            repository,
            "cat-file",
            "-p",
            f"{source_commit}:{artifact.path}",
        )
        if blob.return_code != 0:
            return _failure("git-source-blob-missing")
        if blob.stdout != artifact.content_bytes:
            return _failure("git-source-drift")

    ignore = _git(
        runner,
        repository,
        "check-ignore",
        "--quiet",
        "--",
        manifest_path.as_posix(),
    )
    if ignore.return_code == 0:
        return _failure("git-manifest-ignored")
    if ignore.return_code != 1:
        return _failure("git-ignore-probe-failed")
    return Success(
        ValidatedRepositoryInputs(
            source_commit=source_commit,
            source_matches=True,
            manifest_not_ignored=True,
            repository_policy=repository_policy,
            host_capability=host_capability,
        )
    )
