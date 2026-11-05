"""corpusを配布しない下流の公開構成・参照安全性契約。"""

import importlib
import stat
import subprocess
import sys
from pathlib import Path

import pytest
from downstream_repository_fixture import (
    commit_fixture,
    copy_runtime,
    fixture,
    git,
    inspect,
    plan,
)

successful = importlib.import_module("template_prune_result").successful


def test_pruned_repository_does_not_require_regression_corpus(tmp_path):
    fixture(tmp_path, bundled=False)
    (tmp_path / "tests/fixtures/template_prune/references.json").unlink(missing_ok=True)
    result = inspect(tmp_path)
    assert result["state"] == "pruned", result
    assert not result["analysis_errors"]


@pytest.mark.parametrize(
    ("path", "source", "surface"),
    [
        (
            "Taskfile.yml",
            'version: "3"\ntasks:\n  build:\n    cmds:\n      - task check:template\n',
            "R01",
        ),
        ("package.json", '{"scripts":{"build":"task check:template"}}', "R02"),
        (
            ".github/workflows/build.yml",
            "jobs:\n  build:\n    steps:\n      - run: task check:template\n",
            "R03",
        ),
        ("scripts/build.sh", "task check:template\n", "R04"),
        ("tests/build.py", 'import os\nos.system("task check:template")\n', "R05"),
        ("README.md", "Run `task check:template`.\n", "R06"),
    ],
)
def test_pruned_repository_rejects_remaining_maintenance_references(
    tmp_path, path, source, surface
):
    fixture(tmp_path, bundled=False)
    target = tmp_path / path
    target.parent.mkdir(parents=True, exist_ok=True)
    if surface == "R01":
        source = (
            target.read_text() + "  build:\n    cmds:\n      - task check:template\n"
        )
    target.write_text(source)
    result = inspect(tmp_path)
    assert result["state"] == "inconsistent", result
    assert any(row["surface"] == surface for row in result["references"]), result


def test_pruned_repository_rejects_shell_syntax_errors_without_writes(tmp_path):
    fixture(tmp_path, bundled=False)
    copy_runtime(tmp_path)
    script = tmp_path / "scripts/broken.sh"
    script.write_text("echo valid\n")
    commit_fixture(tmp_path)
    command = [sys.executable, "-B", "scripts/prune-template-docs.py", "--apply"]
    assert plan(tmp_path)["blockers"] == []
    valid = subprocess.run(command, cwd=tmp_path, capture_output=True, text=True)
    assert valid.returncode == 0, valid.stdout + valid.stderr

    # Git差分やdependency不足ではなく、構文エラーだけが拒否理由になる状態を作る。
    script.write_text("if then\n")
    git(tmp_path, "add", "scripts/broken.sh")
    git(tmp_path, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "syntax error")

    def snapshot() -> dict:
        # symlinkの先は走査しない。fixtureの全entryとGit indexのbytes/modeを比較する。
        return {
            p.relative_to(tmp_path).as_posix(): (
                stat.S_IMODE(p.lstat().st_mode),
                str(p.readlink())
                if p.is_symlink()
                else p.read_bytes()
                if p.is_file()
                else None,
            )
            for p in Path(tmp_path).rglob("*")
        }

    before = snapshot()
    result = inspect(tmp_path)
    assert result["state"] == "pruned", result
    assert not result["errors"] and not result["references"], result
    assert any(
        row["source"] == "scripts/broken.sh" and row["kind"] == "syntax"
        for row in result["analysis_errors"]
    ), result
    assert not successful(result), result
    proposal = plan(tmp_path)
    assert proposal["head"] == git(tmp_path, "rev-parse", "HEAD").stdout.strip()
    assert proposal["blockers"] == [
        "構成・参照・解析の検査に失敗。診断を確認して再試行する"
    ], proposal
    rejected = subprocess.run(command, cwd=tmp_path, capture_output=True, text=True)
    assert rejected.returncode == 1, rejected.stdout + rejected.stderr
    assert "scripts/broken.sh" in rejected.stdout, rejected.stdout
    assert snapshot() == before
