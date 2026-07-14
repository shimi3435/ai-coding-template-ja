"""Public operation and thin module-entrypoint contract tests."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import TypedDict

from ai_coding_template_ja.openspec_gsd_handoff import (
    inspect_handoff,
    mark_handoff_started,
    prepare_handoff,
)
from ai_coding_template_ja.openspec_gsd_handoff.manifest import (
    ManifestFileOperations,
)
from ai_coding_template_ja.openspec_gsd_handoff.models import (
    Failure,
    HandoffState,
    HostCapabilityInput,
    HostDispatch,
    HostSpawnSchema,
    Success,
)
from ai_coding_template_ja.openspec_gsd_handoff.preflight import (
    GSD_REQUIRED_FILES,
    CommandResult,
    RepositoryPolicyVerdict,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
FIXTURES = REPO_ROOT / "tests" / "fixtures" / "openspec_gsd_handoff"
SOURCE_COMMIT = "1" * 40


class _DispatchRunner:
    def __init__(
        self, repository: Path, apply_output: bytes, gsd_output: bytes
    ) -> None:
        self.repository = repository
        self.apply_output = apply_output
        self.gsd_output = gsd_output
        self.calls: list[tuple[str, ...]] = []

    def __call__(
        self, argv: tuple[str, ...], *, cwd: Path, timeout: float
    ) -> CommandResult:
        self.calls.append(argv)
        if argv == ("openspec", "--version"):
            result = (0, b"1.3.1\n")
        elif argv[:3] == ("openspec", "instructions", "apply"):
            result = (0, self.apply_output)
        elif argv[0] == "node":
            result = (0, self.gsd_output)
        elif argv[:3] == ("git", "cat-file", "-e"):
            result = (0, b"")
        elif argv == ("git", "rev-parse", "--show-toplevel"):
            result = (0, str(self.repository.resolve()).encode() + b"\n")
        elif argv[:3] == ("git", "cat-file", "-p"):
            path = argv[3].split(":", 1)[1]
            result = (0, (self.repository / path).read_bytes())
        elif argv[:3] == ("git", "check-ignore", "--quiet"):
            result = (1, b"")
        else:
            raise AssertionError(f"unexpected argv: {argv}")
        return CommandResult(argv, cwd, timeout, result[0], result[1], "")


class _CountingOperations(ManifestFileOperations):
    def __init__(self) -> None:
        self.replace_calls = 0

    def replace(self, source: Path, target: Path) -> None:
        self.replace_calls += 1
        super().replace(source, target)


def _host() -> HostCapabilityInput:
    return HostCapabilityInput(
        inspected=True,
        spawn_agent_schema=HostSpawnSchema.GENERIC,
        dispatch=HostDispatch.GENERIC_AGENT_WORKAROUND,
        agent_role_source="toml",
    )


def _setup_repository(tmp_path: Path) -> tuple[Path, Path, _DispatchRunner]:
    repository = tmp_path / "repository"
    change = repository / "openspec" / "changes" / "fixture-change"
    spec = change / "specs" / "fixture-capability" / "spec.md"
    spec.parent.mkdir(parents=True)
    (change / "proposal.md").write_text("# proposal\n", encoding="utf-8")
    (change / "design.md").write_text("# design\n", encoding="utf-8")
    (change / "tasks.md").write_text(
        "- [x] 1. done\n- [ ] 2. remaining\n", encoding="utf-8"
    )
    spec.write_text("# spec\n", encoding="utf-8")
    apply_raw = json.loads(
        (FIXTURES / "openspec" / "apply-positive.json").read_text(encoding="utf-8")
    )
    apply_raw["changeDir"] = str(change.resolve())
    apply_raw["contextFiles"] = {
        "proposal": [str((change / "proposal.md").resolve())],
        "design": [str((change / "design.md").resolve())],
        "tasks": [str((change / "tasks.md").resolve())],
        "specs": [str(spec.resolve())],
    }
    apply_raw["progress"] = {"total": 2, "complete": 1, "remaining": 1}
    apply_raw["tasks"] = [
        {"id": "1", "description": "1. done", "done": True},
        {"id": "2", "description": "2. remaining", "done": False},
    ]
    gsd_home = tmp_path / "gsd-home"
    (gsd_home / "gsd-core").mkdir(parents=True)
    (gsd_home / "gsd-core" / "VERSION").write_text("1.5.0\n", encoding="utf-8")
    for relative in GSD_REQUIRED_FILES:
        path = gsd_home / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.touch()
    gsd_output = (
        (FIXTURES / "gsd" / "init-progress-uninitialized.json")
        .read_text(encoding="utf-8")
        .replace("${FIXTURE_REPO}", str(repository.resolve()))
        .replace("${GSD_HOME}", str(gsd_home.resolve()))
        .encode()
    )
    runner = _DispatchRunner(
        repository,
        json.dumps(apply_raw, ensure_ascii=False).encode(),
        gsd_output,
    )
    return repository, gsd_home, runner


class _InspectArguments(TypedDict):
    repository: Path
    change_id: str
    source_commit: str
    gsd_home: Path
    repository_policy: RepositoryPolicyVerdict
    host_capability: HostCapabilityInput
    runner: _DispatchRunner


def _inspect_arguments(
    repository: Path, gsd_home: Path, runner: _DispatchRunner
) -> _InspectArguments:
    return {
        "repository": repository,
        "change_id": "fixture-change",
        "source_commit": SOURCE_COMMIT,
        "gsd_home": gsd_home,
        "repository_policy": RepositoryPolicyVerdict.TRACKED,
        "host_capability": _host(),
        "runner": runner,
    }


def test_public_surface_exports_exact_operations() -> None:
    import ai_coding_template_ja.openspec_gsd_handoff as handoff

    assert handoff.__all__ == [
        "inspect_handoff",
        "prepare_handoff",
        "mark_handoff_started",
    ]


def test_inspect_is_read_only_and_preserves_route_and_host(tmp_path: Path) -> None:
    repository, gsd_home, runner = _setup_repository(tmp_path)

    result = inspect_handoff(**_inspect_arguments(repository, gsd_home, runner))

    assert isinstance(result, Success)
    assert result.route is not None and result.route.value == "json"
    assert result.value.manifest.capabilities.host == _host()
    assert not (repository / ".planning").exists()


def test_prepare_requires_explicit_approval_and_writes_exactly_once(
    tmp_path: Path,
) -> None:
    repository, gsd_home, runner = _setup_repository(tmp_path)
    operations = _CountingOperations()
    arguments = _inspect_arguments(repository, gsd_home, runner)

    refused = prepare_handoff(**arguments, approved=False, operations=operations)
    prepared = prepare_handoff(**arguments, approved=True, operations=operations)

    assert isinstance(refused, Failure)
    assert refused.issue.code == "approval-required"
    assert isinstance(prepared, Success)
    assert prepared.value.handoff_state is HandoffState.PREPARED
    assert operations.replace_calls == 1


def test_mark_started_requires_gsd_acceptance_and_only_transitions_manifest(
    tmp_path: Path,
) -> None:
    repository, gsd_home, runner = _setup_repository(tmp_path)
    operations = _CountingOperations()
    prepared = prepare_handoff(
        **_inspect_arguments(repository, gsd_home, runner),
        approved=True,
        operations=operations,
    )
    assert isinstance(prepared, Success)

    refused = mark_handoff_started(
        repository,
        "fixture-change",
        gsd_accepted=False,
        operations=operations,
    )
    started = mark_handoff_started(
        repository,
        "fixture-change",
        gsd_accepted=True,
        operations=operations,
    )

    assert isinstance(refused, Failure)
    assert refused.issue.code == "gsd-acceptance-required"
    assert isinstance(started, Success)
    assert started.value.handoff_state is HandoffState.STARTED
    assert operations.replace_calls == 2


def test_module_help_exposes_exact_operations() -> None:
    completed = subprocess.run(
        [sys.executable, "-m", "ai_coding_template_ja.openspec_gsd_handoff", "--help"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )

    assert completed.returncode == 0
    assert "{inspect,prepare,mark-started}" in completed.stdout


def test_invalid_prepare_request_returns_one_machine_readable_failure() -> None:
    completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "ai_coding_template_ja.openspec_gsd_handoff",
            "prepare",
            "--repository",
            str(REPO_ROOT),
            "--change",
            "fixture-change",
            "--source-commit",
            SOURCE_COMMIT,
            "--gsd-home",
            str(REPO_ROOT),
        ],
        cwd=REPO_ROOT,
        env={**os.environ, "PYTHONPATH": str(REPO_ROOT / "src")},
        capture_output=True,
        text=True,
        check=False,
    )

    assert completed.returncode == 2
    output = json.loads(completed.stdout)
    assert output == {
        "ok": False,
        "operation": "prepare",
        "category": "input",
        "code": "approval-required",
        "known_state": "manifest-absent",
    }
    assert "Traceback" not in completed.stderr
