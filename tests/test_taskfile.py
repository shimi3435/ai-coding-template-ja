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
