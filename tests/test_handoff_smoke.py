"""Strictly read-only real-tool smoke contract tests."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import pytest
from ai_coding_template_ja.openspec_gsd_handoff.smoke import (
    SnapshotLimits,
    SnapshotSuccess,
    render_human_result,
    render_json_result,
    run_smoke,
    snapshot_repository,
)

from ai_coding_template_ja.openspec_gsd_handoff.preflight import CommandResult

REPO_ROOT = Path(__file__).resolve().parent.parent
FIXTURES = REPO_ROOT / "tests" / "fixtures" / "openspec_gsd_handoff"
OPEN_CONTRACT = json.loads(
    (FIXTURES / "openspec" / "contract.json").read_text(encoding="utf-8")
)
GSD_CONTRACT = json.loads(
    (FIXTURES / "gsd" / "contract.json").read_text(encoding="utf-8")
)


def _make_repository(tmp_path: Path) -> tuple[Path, str]:
    repository = tmp_path / "repository"
    change = repository / "openspec" / "changes" / "fixture-change"
    spec = change / "specs" / "fixture-capability" / "spec.md"
    spec.parent.mkdir(parents=True)
    (change / "proposal.md").write_text("# proposal\n", encoding="utf-8")
    (change / "design.md").write_text("# design\n", encoding="utf-8")
    spec.write_text("# spec\n", encoding="utf-8")
    apply_output = (
        (FIXTURES / "openspec" / "apply-positive.json")
        .read_text(encoding="utf-8")
        .replace("${FIXTURE_REPO}", str(repository.resolve()))
    )
    tasks = json.loads(apply_output)["tasks"]
    (change / "tasks.md").write_text(
        "".join(
            f"- [{'x' if task['done'] else ' '}] {task['description']}\n"
            for task in tasks
        ),
        encoding="utf-8",
    )
    return repository, apply_output


def _make_gsd_home(tmp_path: Path) -> Path:
    gsd_home = tmp_path / "private-home" / "gsd"
    for template in GSD_CONTRACT["required_files"]:
        path = gsd_home / template.removeprefix("${GSD_HOME}/")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.touch()
    (gsd_home / "gsd-core" / "VERSION").write_text("1.5.0\n", encoding="utf-8")
    return gsd_home


class _SupportedRunner:
    def __init__(
        self,
        repository: Path,
        apply_output: str,
        *,
        mutate_after_gsd: bool = False,
    ) -> None:
        self.repository = repository
        self.apply_output = apply_output
        self.mutate_after_gsd = mutate_after_gsd
        self.calls: list[tuple[str, ...]] = []

    def __call__(
        self, argv: tuple[str, ...], *, cwd: Path, timeout: float
    ) -> CommandResult:
        assert cwd == self.repository
        self.calls.append(argv)
        if argv == ("openspec", "--version"):
            stdout = b"1.3.1\n"
        elif argv[:3] == ("openspec", "instructions", "apply"):
            stdout = self.apply_output.encode()
        else:
            assert argv[0] == "node"
            stdout = json.dumps(
                {
                    "project_exists": True,
                    "roadmap_exists": True,
                    "state_exists": True,
                    "project_root": str(self.repository.resolve()),
                    "agents_installed": True,
                    "missing_agents": [],
                }
            ).encode()
            if self.mutate_after_gsd:
                (self.repository / "probe-write.txt").write_text(
                    "unexpected", encoding="utf-8"
                )
        return CommandResult(argv, cwd, timeout, 0, stdout, "")


def test_supported_smoke_reports_only_bounded_redacted_evidence(tmp_path: Path) -> None:
    repository, apply_output = _make_repository(tmp_path)
    gsd_home = _make_gsd_home(tmp_path)
    (repository / ".gitignore").write_text("ignored.txt\n", encoding="utf-8")
    (repository / "ignored.txt").write_text("included in digest", encoding="utf-8")
    runner = _SupportedRunner(repository, apply_output)

    result = run_smoke(
        repository=repository,
        change_id="fixture-change",
        gsd_home=gsd_home,
        runner=runner,
    )

    assert result.ok is True
    assert result.code == "ok"
    payload = json.loads(render_json_result(result))
    assert payload["openspec"] == {"route": "json", "version": "1.3.1"}
    assert payload["progress"] == {"complete": 2, "remaining": 1, "total": 3}
    assert payload["gsd"] == {
        "entrypoint": "gsd-phase",
        "entrypoint_dry_run": False,
        "project_initialized": True,
        "probe": "init-progress-raw",
        "version": "1.5.0",
    }
    assert [item["kind"] for item in payload["artifacts"]] == [
        "proposal",
        "design",
        "spec",
        "tasks",
    ]
    assert all(set(item) == {"kind", "path", "sha256"} for item in payload["artifacts"])
    assert payload["repository"]["write_detected"] is False
    assert payload["repository"]["entry_count"] >= 9
    assert payload["unverified"] == [
        {"item": "actual-host-prompt", "reason": "no-safe-dry-run"},
        {"item": "generic-agent-spawn", "reason": "no-safe-dry-run"},
        {"item": "real-gsd-mutation", "reason": "no-safe-dry-run"},
        {"item": "route-specific-postconditions", "reason": "no-safe-dry-run"},
    ]
    rendered = render_json_result(result) + render_human_result(result)
    assert str(repository) not in rendered
    assert str(gsd_home) not in rendered
    assert "# proposal" not in rendered
    assert "${GSD_HOME}/gsd-core/bin/gsd-tools.cjs" in rendered
    assert runner.calls == [
        ("openspec", "--version"),
        (
            "openspec",
            "instructions",
            "apply",
            "--change",
            "fixture-change",
            "--json",
        ),
        (
            "node",
            str(gsd_home / "gsd-core" / "bin" / "gsd-tools.cjs"),
            "init",
            "progress",
            "--raw",
        ),
    ]


def test_fallback_is_not_claimed_as_supported_real_tool_contract(
    tmp_path: Path,
) -> None:
    repository, apply_output = _make_repository(tmp_path)
    gsd_home = _make_gsd_home(tmp_path)
    runner = _SupportedRunner(repository, apply_output)

    def unsupported(
        argv: tuple[str, ...], *, cwd: Path, timeout: float
    ) -> CommandResult:
        result = runner(argv, cwd=cwd, timeout=timeout)
        if argv == ("openspec", "--version"):
            return CommandResult(argv, cwd, timeout, 0, b"1.3.2\n", "")
        return result

    result = run_smoke(
        repository=repository,
        change_id="fixture-change",
        gsd_home=gsd_home,
        runner=unsupported,
    )

    assert result.ok is False
    assert result.code == "openspec-json-route-required"
    assert len(runner.calls) == 2
    assert "artifacts" not in json.loads(render_json_result(result))


def test_repository_write_overrides_otherwise_supported_probe(tmp_path: Path) -> None:
    repository, apply_output = _make_repository(tmp_path)
    gsd_home = _make_gsd_home(tmp_path)
    runner = _SupportedRunner(repository, apply_output, mutate_after_gsd=True)

    result = run_smoke(
        repository=repository,
        change_id="fixture-change",
        gsd_home=gsd_home,
        runner=runner,
    )

    assert result.ok is False
    assert result.code == "repository-write-detected"
    assert "artifacts" not in json.loads(render_json_result(result))


def test_snapshot_includes_ignored_empty_directory_symlink_mode_and_large_bytes(
    tmp_path: Path,
) -> None:
    repository = tmp_path / "repository"
    repository.mkdir()
    (repository / ".git").mkdir()
    (repository / ".git" / "ignored-administration").write_text("ignored")
    (repository / "empty").mkdir()
    target = repository / "ignored.bin"
    target.write_bytes(b"x" * (4 * 1024 * 1024 + 1))
    link = repository / "link"
    link.symlink_to("ignored.bin")
    first = snapshot_repository(repository)
    assert isinstance(first, SnapshotSuccess)

    target.chmod(0o600)
    mode_changed = snapshot_repository(repository)
    assert isinstance(mode_changed, SnapshotSuccess)
    assert mode_changed.value.root_digest != first.value.root_digest
    link.unlink()
    link.symlink_to("empty")
    target.write_bytes(b"y" * (4 * 1024 * 1024 + 1))
    changed = snapshot_repository(repository)
    assert isinstance(changed, SnapshotSuccess)
    assert changed.value.root_digest != mode_changed.value.root_digest
    assert changed.value.entry_count == 4


@pytest.mark.parametrize(
    ("limits", "expected"),
    [
        (SnapshotLimits(max_entries=1), "repository-inventory-limit-exceeded"),
        (
            SnapshotLimits(max_encoded_path_bytes=1),
            "repository-metadata-limit-exceeded",
        ),
        (SnapshotLimits(max_metadata_bytes=1), "repository-metadata-limit-exceeded"),
    ],
)
def test_snapshot_resource_bounds_have_stable_codes(
    tmp_path: Path, limits: SnapshotLimits, expected: str
) -> None:
    repository = tmp_path / "repository"
    repository.mkdir()
    (repository / "one").write_text("1")
    (repository / "two").write_text("2")

    result = snapshot_repository(repository, limits=limits)

    assert result.issue.code == expected


def test_snapshot_timeout_has_stable_code(tmp_path: Path) -> None:
    repository = tmp_path / "repository"
    repository.mkdir()
    (repository / "one").write_text("1")
    ticks = iter([0.0, 2.0, 2.0, 2.0])

    result = snapshot_repository(
        repository,
        limits=SnapshotLimits(timeout_seconds=1.0),
        clock=lambda: next(ticks),
    )

    assert result.issue.code == "repository-snapshot-timeout"


def test_snapshot_unreadable_has_stable_code(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    repository = tmp_path / "repository"
    repository.mkdir()
    blocked = repository / "blocked"
    blocked.write_text("secret")
    original_open = Path.open

    def denied(self: Path, *args: Any, **kwargs: Any) -> Any:
        if self == blocked:
            raise PermissionError("denied")
        return original_open(self, *args, **kwargs)

    monkeypatch.setattr(Path, "open", denied)

    result = snapshot_repository(repository)

    assert result.issue.code == "repository-snapshot-unreadable"


def test_snapshot_detects_file_instability_during_streaming(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    repository = tmp_path / "repository"
    repository.mkdir()
    changing = repository / "changing"
    changing.write_bytes(b"before")
    original_open = Path.open

    class _ChangingReader:
        def __init__(self, wrapped: Any) -> None:
            self.wrapped = wrapped

        def __enter__(self) -> _ChangingReader:
            self.wrapped.__enter__()
            return self

        def __exit__(self, *args: Any) -> Any:
            return self.wrapped.__exit__(*args)

        def read(self, size: int) -> bytes:
            data = self.wrapped.read(size)
            if data:
                os.chmod(changing, 0o600)
            return data

    def changing_open(self: Path, *args: Any, **kwargs: Any) -> Any:
        opened = original_open(self, *args, **kwargs)
        return _ChangingReader(opened) if self == changing else opened

    monkeypatch.setattr(Path, "open", changing_open)

    result = snapshot_repository(repository)

    assert result.issue.code == "repository-snapshot-unstable"
