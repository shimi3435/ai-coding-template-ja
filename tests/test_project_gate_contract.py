"""利用者と Agent の正式な完了判定入口を検証する。"""

from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent


@pytest.mark.parametrize(
    "path",
    [
        "AGENTS.md",
        "CONTEXT.md",
        "README.md",
        "scripts/bootstrap.sh",
        "scripts/rename-package.py",
        "docs/guide.md",
        "docs/agents/workflow.md",
        "docs/template/skill-maintenance.md",
        "docs/template/release.md",
        ".agents/skills/execute-openspec-change/SKILL.md",
        ".agents/skills/verify-change/SKILL.md",
    ],
)
def test_current_completion_instructions_use_the_canonical_gate(path: str) -> None:
    text = (ROOT / path).read_text(encoding="utf-8")
    assert "./scripts/check.sh" in text, path
    assert "最新入力の `task check`" not in text, path
    assert "少なくとも `task check`" not in text, path
    assert "`task check` と `task doctor` が" not in text, path
    assert "task check / task doctor" not in text, path
    assert "task check で green" not in text, path
    assert "**`task check`（必須ゲート）**" not in text, path


def test_quickstart_and_repeated_local_use_share_the_green_definition() -> None:
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    context = (ROOT / "CONTEXT.md").read_text(encoding="utf-8")
    assert "`./scripts/check.sh` と `task doctor` が green" in readme
    assert "\n./scripts/check.sh" in readme
    assert "`task doctor` と `./scripts/check.sh` がともに exit 0" in context
