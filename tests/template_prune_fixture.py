"""prune の隔離 fixture。期待値は承認済み manifest の固定コピーを使用する。"""

import importlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "repo-tools"))

inspect = importlib.import_module("template_prune_state").inspect
plan = importlib.import_module("template_prune_plan").plan

CASES = json.loads((ROOT / "tests/fixtures/template_prune/references.json").read_text())
ASSETS = (
    "docs/template/adr/0001-skill-distribution-vendoring.md",
    "docs/template/adr/0002-mcp-remote-default-node-not-core.md",
    "docs/template/adr/0003-openspec-gsd-boundary.md",
    "docs/template/adr/0004-github-mcp-optional-gh-cli-core.md",
    "docs/template/adr/0005-template-update-not-propagated.md",
    "docs/template/adr/0006-template-meta-docs-isolated.md",
    "docs/template/adr/0007-downstream-usage-guide-sot-boundary.md",
    "docs/template/adr/0008-adaptive-openspec-gsd-execution-boundary.md",
    "docs/template/adr/0009-proportional-agent-workflow-evidence-economy.md",
    "docs/template/adr/0010-openspec-direct-execution.md",
    "docs/template/adr/0011-v2-distribution-boundaries.md",
    "docs/template/release.md",
    "docs/template/retrospectives.md",
    "docs/template/v2-boundary-audit.md",
    "docs/template/v2-release-notes.md",
    "template-maintenance/tests/test_release_contract.py",
    "template-maintenance/tests/test_history_contract.py",
    "template-maintenance/tests/test_prune_integration.py",
    ".github/workflows/template-maintenance.yml",
)
KEPT = (
    "docs/reference/repository-contracts.md",
    "docs/reference/skill-maintenance.md",
    "docs/reference/skill-metadata-v2.md",
    "docs/reference/prune-template-assets.md",
    "tests/fixtures/template_prune/references.json",
    "scripts/prune-template-docs.py",
    "TEMPLATE_VERSION",
)


def fixture(root: Path, bundled=True) -> Path:
    for name in (*KEPT, *(ASSETS if bundled else ()), "docs/adr/.gitkeep"):
        p = root / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text("# fixture\n")
    (root / "TEMPLATE_VERSION").write_text("1.0.0\n")
    (root / KEPT[4]).write_text(json.dumps(CASES))
    taskfile = next(c["source"] for c in CASES if c["id"] == "task-comment")
    if bundled:
        taskfile += "  check:template:\n    cmds:\n      - echo maintenance\n"
    (root / "Taskfile.yml").write_text(taskfile)
    marker = (
        "<!-- template-maintenance:start -->\n"
        "[maintenance](docs/template/release.md)\n"
        "<!-- template-maintenance:end -->\n"
        if bundled
        else ""
    )
    for name in ("README.md", "docs/agents/workflow.md"):
        p = root / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text("# common\n" + marker)
    (root / "package.json").write_text('{"private":true,"scripts":{}}')
    return root


def git(root: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args], cwd=root, capture_output=True, text=True, check=True
    )


def commit_fixture(root: Path) -> None:
    git(root, "init", "-q")
    git(root, "config", "user.name", "Fixture")
    git(root, "config", "user.email", "fixture@example.invalid")
    git(root, "add", ".")
    git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "fixture")


def copy_runtime(root: Path) -> None:
    """最小 fixture に実 scanner / CLI と既存 dependency を配置する。"""
    (root / "repo-tools").mkdir(exist_ok=True)
    for source in (ROOT / "repo-tools").glob("template_prune_*.py"):
        shutil.copy2(source, root / "repo-tools" / source.name)
    for name in (
        "template-prune-bridge.ts",
        "template-prune-js.ts",
        "repository-taskfile.ts",
        "repository-taskfile-templates.ts",
    ):
        shutil.copy2(ROOT / "repo-tools" / name, root / "repo-tools" / name)
    shutil.copy2(
        ROOT / "scripts/prune-template-docs.py", root / "scripts/prune-template-docs.py"
    )
    (root / "node_modules").symlink_to(ROOT / "node_modules", target_is_directory=True)
