"""Taskfile が公開する setup task の契約を検証する。"""

from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
TASKFILE = REPO_ROOT / "Taskfile.yml"


def _task_body(task_name: str) -> str:
    text = TASKFILE.read_text(encoding="utf-8")
    match = re.search(
        rf"^  {re.escape(task_name)}:\n(?P<body>.*?)(?=^  [a-z][^\n]*:\n|\Z)",
        text,
        flags=re.MULTILINE | re.DOTALL,
    )
    assert match is not None, f"task {task_name!r} が存在しません"
    return match.group("body")


def _check_dependency_preflight_script() -> str:
    lines = _task_body("check").splitlines()
    block_start = lines.index("      - |") + 1
    script_lines: list[str] = []
    for line in lines[block_start:]:
        if line.startswith("        "):
            script_lines.append(line[8:])
        elif line == "":
            script_lines.append("")
        else:
            break
    assert script_lines, "check task の dependency preflight shell block が必要です"
    return "\n".join(script_lines)


@pytest.mark.parametrize(
    ("task_name", "expected_command"),
    [
        ("setup", "uv sync --inexact"),
        ("setup:research", "uv sync --inexact --extra research"),
        ("setup:notebook", "uv sync --inexact --extra notebook"),
        ("setup:experiment", "uv sync --inexact --extra experiment"),
    ],
)
def test_local_setup_preserves_previously_installed_extras(
    task_name: str, expected_command: str
) -> None:
    assert f"- {expected_command}" in _task_body(task_name)


def test_handoff_smoke_is_explicit_and_isolated_from_normal_check() -> None:
    smoke = _task_body("openspec:gsd-handoff:smoke")
    check = _task_body("check")

    assert "requires:" in smoke
    assert "silent: true" in smoke
    assert "CHANGE_ID" in smoke
    assert "GSD_HOME" in smoke
    assert "PYTHONDONTWRITEBYTECODE=1" in smoke
    assert "PYTHONPYCACHEPREFIX" in smoke
    assert "UV_CACHE_DIR" in smoke
    assert "UV_CONFIG_FILE" in smoke
    assert "uv run --no-sync python scripts/openspec-gsd-handoff-smoke.py" in smoke
    assert '--change "$HANDOFF_CHANGE_ID"' in smoke
    assert '--gsd-home "$HANDOFF_GSD_HOME"' in smoke
    assert '--change "{{.CHANGE_ID}}"' not in smoke
    assert '--gsd-home "{{.GSD_HOME}}"' not in smoke
    assert "openspec:gsd-handoff:smoke" not in check
    assert "GSD_HOME" not in check
    assert "openspec" not in check
    assert "uv run --no-sync ruff format --check ." in check
    assert "uv run --no-sync ruff check ." in check
    assert "uv run --no-sync basedpyright" in check
    assert "uv run --no-sync pytest" in check


def test_node_dependency_setup_and_online_audit_are_explicit() -> None:
    for task_name in ("setup", "setup:node"):
        body = _task_body(task_name)
        assert "- npm ci --ignore-scripts" in body
        assert body.index(
            "node repo-tools/entrypoint.mjs runtime-preflight"
        ) < body.index("npm ci --ignore-scripts")
    audit = _task_body("audit:node")
    assert "- npm audit --audit-level=high" in audit
    assert audit.index(
        "node repo-tools/entrypoint.mjs runtime-preflight"
    ) < audit.index("npm audit --audit-level=high")


def test_check_runs_direct_node_and_existing_python_checks_without_installing() -> None:
    body = _task_body("check")

    for command in (
        "node repo-tools/entrypoint.mjs runtime-preflight",
        "node repo-tools/entrypoint.mjs check-contracts",
        "node_modules/.bin/tsc --noEmit",
        "node --test repo-tools/*.test.ts",
        "uv run --no-sync ruff format --check .",
        "uv run --no-sync ruff check .",
        "uv run --no-sync basedpyright",
        "uv run --no-sync pytest",
    ):
        assert command in body
    assert "task setup:node" in body
    assert "task setup" in body
    assert "npm ci" not in body
    assert "npm audit" not in body
    assert "uv sync" not in body
    assert "npx" not in body
    assert "npm exec" not in body


def test_isolated_task_specifies_a_real_offline_nested_check() -> None:
    body = _task_body("check:isolated")
    taskfile = TASKFILE.read_text(encoding="utf-8")

    for root in (
        "HOME",
        "CODEX_HOME",
        "GSD_HOME",
        "XDG_CACHE_HOME",
        "XDG_CONFIG_HOME",
        "XDG_DATA_HOME",
        "UV_CACHE_DIR",
    ):
        assert root in body
    assert "env -i" in body
    assert 'PATH="$bin"' in body
    assert "task check" in body
    assert "command -v openspec" in body
    assert "command -v npx" in body
    assert "command -v gsd" in body
    assert "UV_OFFLINE=1" in body
    assert "HTTP_PROXY=" in body
    assert "trap '" in body and "rm -rf" in body
    assert "check:without-gsd:" not in taskfile


@pytest.mark.parametrize(
    ("node_dependencies_present", "expected_setup"),
    [(False, "task setup:node"), (True, "task setup")],
    ids=["node-dependencies-missing", "python-dependencies-missing"],
)
def test_check_without_dependencies_fails_offline_before_touching_user_state(
    tmp_path: Path,
    node_dependencies_present: bool,
    expected_setup: str,
) -> None:
    repository = tmp_path / "repository"
    repository.mkdir()
    isolated_roots = {
        name: tmp_path / name
        for name in ("home", "uv-cache", "xdg-cache", "xdg-config", "xdg-data")
    }
    for path in isolated_roots.values():
        path.mkdir()
    if node_dependencies_present:
        tsc = repository / "node_modules" / ".bin" / "tsc"
        tsc.parent.mkdir(parents=True)
        tsc.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        tsc.chmod(0o755)
        (repository / "package.json").write_text("{}\n", encoding="utf-8")
    env = {
        **os.environ,
        "HOME": str(isolated_roots["home"]),
        "UV_CACHE_DIR": str(isolated_roots["uv-cache"]),
        "XDG_CACHE_HOME": str(isolated_roots["xdg-cache"]),
        "XDG_CONFIG_HOME": str(isolated_roots["xdg-config"]),
        "XDG_DATA_HOME": str(isolated_roots["xdg-data"]),
        "UV_OFFLINE": "1",
        "HTTP_PROXY": "http://127.0.0.1:9",
        "HTTPS_PROXY": "http://127.0.0.1:9",
        "ALL_PROXY": "http://127.0.0.1:9",
        "NO_PROXY": "",
    }

    result = subprocess.run(
        ["/bin/sh", "-eu", "-c", _check_dependency_preflight_script()],
        cwd=repository,
        env=env,
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )

    assert result.returncode != 0
    output = result.stdout + result.stderr
    assert expected_setup in output
    if node_dependencies_present:
        assert "Python dependency が未導入" in output
        assert "Node dependency が未導入" not in output
    else:
        assert "Node dependency が未導入" in output
        assert "Python dependency が未導入" not in output
    assert all(not any(path.iterdir()) for path in isolated_roots.values())


def test_check_reports_partially_missing_node_dependency_tree(tmp_path: Path) -> None:
    repository = tmp_path / "repository"
    repository.mkdir()
    tsc = repository / "node_modules" / ".bin" / "tsc"
    tsc.parent.mkdir(parents=True)
    tsc.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    tsc.chmod(0o755)
    for tool in ("ruff", "basedpyright", "pytest"):
        executable = repository / ".venv" / "bin" / tool
        executable.parent.mkdir(parents=True, exist_ok=True)
        executable.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        executable.chmod(0o755)
    (repository / "package.json").write_text(
        '{"private":true,"dependencies":{"fixture-missing":"1.0.0"}}\n',
        encoding="utf-8",
    )

    result = subprocess.run(
        ["/bin/sh", "-eu", "-c", _check_dependency_preflight_script()],
        cwd=repository,
        env={
            **os.environ,
            "HTTP_PROXY": "http://127.0.0.1:9",
            "HTTPS_PROXY": "http://127.0.0.1:9",
            "ALL_PROXY": "http://127.0.0.1:9",
            "NO_PROXY": "",
        },
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )

    assert result.returncode != 0
    assert "task setup:node" in result.stdout + result.stderr
