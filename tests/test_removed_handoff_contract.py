"""削除した handoff 公開入口を互換なしで不存在に保つ。"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
PACKAGE_ROOT = REPO_ROOT / "src" / "ai_coding_template_ja"
LEGACY_TOKEN = "g" + "sd"
LEGACY_MODULE_SEGMENT = "openspec_" + LEGACY_TOKEN + "_handoff"
LEGACY_SCRIPT = "openspec-" + LEGACY_TOKEN + "-handoff-smoke.py"
LEGACY_TASK = "openspec:" + LEGACY_TOKEN + "-handoff:smoke"
TOKEN_BOUNDARY = re.compile(rf"(?i)(^|[^a-z0-9]){LEGACY_TOKEN}([^a-z0-9]|$)")


def test_legacy_package_script_fixture_and_tests_are_absent() -> None:
    assert not (PACKAGE_ROOT / LEGACY_MODULE_SEGMENT).exists()
    assert not (REPO_ROOT / "scripts" / LEGACY_SCRIPT).exists()
    assert not (REPO_ROOT / "tests/fixtures" / LEGACY_MODULE_SEGMENT).exists()
    assert not list((REPO_ROOT / "tests").glob("test_handoff_*.py"))


def test_legacy_module_has_normal_module_not_found_behavior() -> None:
    module = "ai_coding_template_ja." + LEGACY_MODULE_SEGMENT
    result = subprocess.run(
        [sys.executable, "-m", module],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode != 0
    assert "No module named" in result.stderr


def test_legacy_task_is_absent_without_alias() -> None:
    taskfile = (REPO_ROOT / "Taskfile.yml").read_text(encoding="utf-8")

    assert LEGACY_TASK not in taskfile


@pytest.mark.parametrize(
    "value",
    (
        LEGACY_TOKEN,
        LEGACY_TOKEN.upper(),
        "prefix-" + LEGACY_TOKEN + "-suffix",
        "prefix_" + LEGACY_TOKEN + "_suffix",
        "prefix/" + LEGACY_TOKEN + "/suffix",
    ),
)
def test_residual_token_boundary_detects_case_and_separators(value: str) -> None:
    assert TOKEN_BOUNDARY.search(value)


@pytest.mark.parametrize(
    "value",
    (LEGACY_TOKEN + "ata", "e" + LEGACY_TOKEN, LEGACY_TOKEN.title() + "Client"),
)
def test_residual_token_boundary_does_not_match_embedded_letters(value: str) -> None:
    assert TOKEN_BOUNDARY.search(value) is None
