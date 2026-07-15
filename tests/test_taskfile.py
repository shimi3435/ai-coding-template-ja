"""Taskfile が公開する setup task の契約を検証する。"""

from __future__ import annotations

import re
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
    assert "openspec:gsd-handoff:smoke" not in check
    assert "GSD_HOME" not in check
    assert "openspec" not in check
    assert [
        line.strip() for line in check.splitlines() if line.strip().startswith("- ")
    ] == [
        "- uv run ruff format --check .",
        "- uv run ruff check .",
        "- uv run basedpyright",
        "- uv run pytest",
    ]


def test_without_gsd_task_specifies_a_real_isolated_nested_check() -> None:
    body = _task_body("check:without-gsd")

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
    assert "command -v node" in body
    assert "command -v openspec" in body
    assert "command -v npm" in body
    assert "command -v npx" in body
    assert "command -v gsd" in body
    assert "trap '" in body and "rm -rf" in body
