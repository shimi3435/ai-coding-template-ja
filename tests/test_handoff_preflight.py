"""Pinned tool, source, policy, and host preflight contract tests."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from ai_coding_template_ja.openspec_gsd_handoff.preflight import (
    CommandResult,
    GsdProbeEvidence,
    RepositoryPolicyVerdict,
    collect_gsd_probe,
    collect_openspec_probe,
    parse_gsd_capability,
    validate_repository_inputs,
)

from ai_coding_template_ja.openspec_gsd_handoff.discovery import (
    discover_openspec_artifacts,
)
from ai_coding_template_ja.openspec_gsd_handoff.manifest import GsdCapability
from ai_coding_template_ja.openspec_gsd_handoff.models import (
    Artifact,
    ArtifactKind,
    Failure,
    HostCapabilityInput,
    HostDispatch,
    HostSpawnSchema,
    Success,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
FIXTURES = REPO_ROOT / "tests" / "fixtures" / "openspec_gsd_handoff"
OPENSPEC_CONTRACT = json.loads(
    (FIXTURES / "openspec" / "contract.json").read_text(encoding="utf-8")
)
GSD_CONTRACT = json.loads(
    (FIXTURES / "gsd" / "contract.json").read_text(encoding="utf-8")
)


class _QueueRunner:
    def __init__(self, results: list[tuple[int, bytes, str]]) -> None:
        self.results = results
        self.calls: list[tuple[tuple[str, ...], Path, float]] = []

    def __call__(
        self, argv: tuple[str, ...], *, cwd: Path, timeout: float
    ) -> CommandResult:
        self.calls.append((argv, cwd, timeout))
        return_code, stdout, stderr = self.results.pop(0)
        return CommandResult(argv, cwd, timeout, return_code, stdout, stderr)


def test_openspec_adapter_uses_fixed_argv_cwd_timeout_and_separate_streams(
    tmp_path: Path,
) -> None:
    runner = _QueueRunner(
        [(0, b"1.3.1\n", "version diagnostic"), (0, b"{}", "apply diagnostic")]
    )

    probe = collect_openspec_probe(runner, tmp_path, "fixture-change")

    assert probe.version_stdout == "1.3.1\n"
    assert probe.apply_stdout == "{}"
    assert runner.calls == [
        (("openspec", "--version"), tmp_path, 30.0),
        (
            (
                "openspec",
                "instructions",
                "apply",
                "--change",
                "fixture-change",
                "--json",
            ),
            tmp_path,
            30.0,
        ),
    ]


def _make_openspec_change(repository: Path, apply_stdout: str) -> None:
    raw = json.loads(apply_stdout)
    change = repository / "openspec" / "changes" / "fixture-change"
    spec = change / "specs" / "fixture-capability" / "spec.md"
    spec.parent.mkdir(parents=True)
    (change / "proposal.md").write_text("# proposal\n", encoding="utf-8")
    (change / "design.md").write_text("# design\n", encoding="utf-8")
    spec.write_text("# spec\n", encoding="utf-8")
    tasks = raw.get("tasks")
    if not isinstance(tasks, list) or not tasks:
        positive = json.loads(
            (FIXTURES / "openspec" / "apply-positive.json").read_text(encoding="utf-8")
        )
        tasks = positive["tasks"]
    (change / "tasks.md").write_text(
        "".join(
            f"- [{'x' if task['done'] else ' '}] {task['description']}\n"
            for task in tasks
        ),
        encoding="utf-8",
    )


@pytest.mark.parametrize(
    "case",
    [OPENSPEC_CONTRACT["positive"], *OPENSPEC_CONTRACT["negative"]],
    ids=[
        "positive",
        *[case["name"] for case in OPENSPEC_CONTRACT["negative"]],
    ],
)
def test_every_pinned_openspec_case_has_the_expected_classified_route(
    tmp_path: Path, case: dict[str, Any]
) -> None:
    repository = tmp_path / "repository"
    fixture = (
        (FIXTURES / "openspec" / case["apply_stdout_fixture"])
        .read_text(encoding="utf-8")
        .replace("${FIXTURE_REPO}", str(repository.resolve()))
    )
    try:
        _make_openspec_change(repository, fixture)
    except json.JSONDecodeError:
        positive = (
            (FIXTURES / "openspec" / "apply-positive.json")
            .read_text(encoding="utf-8")
            .replace("${FIXTURE_REPO}", str(repository.resolve()))
        )
        _make_openspec_change(repository, positive)
    runner = _QueueRunner(
        [
            (case["version_exit_code"], case["version_stdout"].encode(), ""),
            (case["apply_exit_code"], fixture.encode(), ""),
        ]
    )

    result = discover_openspec_artifacts(
        repository,
        "fixture-change",
        collect_openspec_probe(runner, repository, "fixture-change"),
    )

    expected = case["expected_route"]
    if expected in {"json", "markdown-fallback"}:
        assert isinstance(result, Success)
        assert result.route is not None
        assert result.route.value == expected
    else:
        assert isinstance(result, Failure)
        assert result.issue.code == (
            "openspec-unprepared"
            if expected == "stop-unprepared"
            else "openspec-all-done"
        )


def _gsd_fixture(name: str, repository: Path, gsd_home: Path) -> bytes:
    return (
        (FIXTURES / "gsd" / name)
        .read_text(encoding="utf-8")
        .replace("${FIXTURE_REPO}", str(repository.resolve()))
        .replace("${GSD_HOME}", str(gsd_home.resolve()))
        .encode()
    )


@pytest.mark.parametrize(
    "case",
    [*GSD_CONTRACT["positive"], *GSD_CONTRACT["negative"]],
    ids=[
        case["name"] for case in [*GSD_CONTRACT["positive"], *GSD_CONTRACT["negative"]]
    ],
)
def test_every_pinned_gsd_case_has_the_expected_entrypoint(
    tmp_path: Path, case: dict[str, Any]
) -> None:
    repository = tmp_path / "repository"
    repository.mkdir()
    gsd_home = tmp_path / "gsd-home"
    fixture = _gsd_fixture(case["probe_stdout_fixture"], repository, gsd_home)
    evidence = GsdProbeEvidence(
        version=case["version"],
        required_files_exist=case["required_files_exist"],
        process=CommandResult(
            ("node", "gsd-tools.cjs", "init", "progress", "--raw"),
            repository,
            30.0,
            case["probe_exit_code"],
            fixture,
            "",
        ),
    )

    result = parse_gsd_capability(repository, evidence)

    expected = case["expected_entrypoint"]
    if expected is None:
        assert isinstance(result, Failure)
        assert result.issue.code.startswith("gsd-")
    else:
        assert isinstance(result, Success)
        assert isinstance(result.value, GsdCapability)
        normalized = "gsd-phase" if expected == "$gsd-phase" else "gsd-new-project-auto"
        assert result.value.entrypoint == normalized


def test_gsd_adapter_checks_required_files_and_fixed_read_only_probe(
    tmp_path: Path,
) -> None:
    repository = tmp_path / "repository"
    repository.mkdir()
    gsd_home = tmp_path / "gsd"
    (gsd_home / "gsd-core").mkdir(parents=True)
    (gsd_home / "gsd-core" / "VERSION").write_text("1.5.0\n", encoding="utf-8")
    for template in GSD_CONTRACT["required_files"]:
        relative = template.removeprefix("${GSD_HOME}/")
        path = gsd_home / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.touch()
    runner = _QueueRunner(
        [
            (
                0,
                _gsd_fixture("init-progress-uninitialized.json", repository, gsd_home),
                "",
            )
        ]
    )

    evidence = collect_gsd_probe(runner, repository, gsd_home)

    assert evidence.version == "1.5.0"
    assert evidence.required_files_exist
    assert runner.calls == [
        (
            (
                "node",
                str(gsd_home / "gsd-core" / "bin" / "gsd-tools.cjs"),
                "init",
                "progress",
                "--raw",
            ),
            repository,
            30.0,
        )
    ]


def _artifact(path: str, content: bytes) -> Artifact:
    import hashlib

    return Artifact(
        kind=ArtifactKind.PROPOSAL,
        path=path,
        sha256=hashlib.sha256(content).hexdigest(),
        content=content.decode(),
        content_bytes=content,
    )


def _host() -> HostCapabilityInput:
    return HostCapabilityInput(
        inspected=True,
        spawn_agent_schema=HostSpawnSchema.GENERIC,
        dispatch=HostDispatch.GENERIC_AGENT_WORKAROUND,
        agent_role_source="toml",
    )


@pytest.mark.parametrize(
    ("case", "expected_code"),
    [
        ("source-drift", "git-source-drift"),
        ("ignored", "git-manifest-ignored"),
        ("policy-missing", "repository-policy-invalid"),
        ("policy-untracked", "repository-policy-invalid"),
        ("host-uninspected", "host-capability-invalid"),
    ],
)
def test_source_policy_and_host_fail_closed_without_write_authorization(
    tmp_path: Path, case: str, expected_code: str
) -> None:
    repository = tmp_path / "repository"
    repository.mkdir()
    content = b"# canonical\n"
    artifacts = (_artifact("openspec/changes/fixture-change/proposal.md", content),)
    blob = b"# drift\n" if case == "source-drift" else content
    ignore_exit = 0 if case == "ignored" else 1
    runner = _QueueRunner(
        [
            (0, b"", ""),
            (0, str(repository.resolve()).encode() + b"\n", ""),
            (0, blob, ""),
            (ignore_exit, b"", ""),
        ]
    )
    policy = (
        None
        if case == "policy-missing"
        else RepositoryPolicyVerdict.UNTRACKED
        if case == "policy-untracked"
        else RepositoryPolicyVerdict.TRACKED
    )
    host = (
        HostCapabilityInput(
            False,
            HostSpawnSchema.GENERIC,
            HostDispatch.GENERIC_AGENT_WORKAROUND,
            "toml",
        )
        if case == "host-uninspected"
        else _host()
    )

    result = validate_repository_inputs(
        repository,
        "1" * 40,
        artifacts,
        runner=runner,
        manifest_path=Path(".planning/openspec/fixture-change/handoff.json"),
        repository_policy=policy,
        host_capability=host,
    )

    assert isinstance(result, Failure)
    assert result.issue.code == expected_code
    assert not hasattr(result, "write_authorized")


def test_valid_source_policy_and_host_are_separate_authorization_evidence(
    tmp_path: Path,
) -> None:
    repository = tmp_path / "repository"
    repository.mkdir()
    content = b"# canonical\n"
    artifacts = (_artifact("openspec/changes/fixture-change/proposal.md", content),)
    runner = _QueueRunner(
        [
            (0, b"", ""),
            (0, str(repository.resolve()).encode() + b"\n", ""),
            (0, content, ""),
            (1, b"", ""),
        ]
    )

    result = validate_repository_inputs(
        repository,
        "1" * 40,
        artifacts,
        runner=runner,
        manifest_path=Path(".planning/openspec/fixture-change/handoff.json"),
        repository_policy=RepositoryPolicyVerdict.TRACKED,
        host_capability=_host(),
    )

    assert isinstance(result, Success)
    assert result.value.source_matches
    assert result.value.manifest_not_ignored
    assert result.value.repository_policy is RepositoryPolicyVerdict.TRACKED
    assert result.value.host_capability == _host()
    assert all(isinstance(call[0], tuple) for call in runner.calls)
