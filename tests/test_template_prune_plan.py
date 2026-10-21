"""read-only preview の Git / bytes / mode 境界。"""

import os
import stat
from pathlib import Path
from typing import Any

import pytest
from template_prune_fixture import ASSETS, commit_fixture, fixture, git, plan


def snapshot(root: Path) -> dict:
    return {
        p.relative_to(root).as_posix(): (
            stat.S_IMODE(p.lstat().st_mode),
            os.readlink(p)
            if p.is_symlink()
            else p.read_bytes()
            if p.is_file()
            else None,
        )
        for p in root.rglob("*")
    }


def test_preview_is_read_only_and_returns_stable_plan(tmp_path: Path) -> None:
    fixture(tmp_path)
    commit_fixture(tmp_path)
    before = snapshot(tmp_path)
    first = plan(tmp_path)
    second = plan(tmp_path)
    assert first["blockers"] == [], first
    assert first == second
    assert snapshot(tmp_path) == before
    assert first["deletions"] == sorted(first["deletions"])
    assert set(first["edits"]) == {
        "Taskfile.yml",
        "README.md",
        "docs/agents/workflow.md",
    }


@pytest.mark.parametrize(
    "damage",
    [
        "unstaged",
        "staged",
        "mode",
        "untracked",
        "ignored",
        "assume-unchanged",
        "skip-worktree",
    ],
)
def test_preview_rejects_protected_changes_without_writes(
    tmp_path: Path, damage: str
) -> None:
    fixture(tmp_path)
    commit_fixture(tmp_path)
    p = tmp_path / ASSETS[0]
    if damage in ("assume-unchanged", "skip-worktree"):
        git(tmp_path, "update-index", "--" + damage, ASSETS[0])
    if damage == "mode":
        p.chmod(0o755)
    elif damage in ("untracked", "ignored"):
        if damage == "ignored":
            (tmp_path / ".git/info/exclude").write_text("local.tmp\n")
        (p.parent / "local.tmp").write_text("local")
    else:
        p.write_text("changed")
    if damage == "staged":
        git(tmp_path, "add", ASSETS[0])
    before = snapshot(tmp_path)
    assert plan(tmp_path)["blockers"]
    assert snapshot(tmp_path) == before


@pytest.mark.parametrize("damage", ["symlink", "fifo", "nested-git"])
def test_preview_rejects_unsafe_descendants(tmp_path: Path, damage: str) -> None:
    fixture(tmp_path)
    commit_fixture(tmp_path)
    p = tmp_path / "docs/template/extra"
    if damage == "symlink":
        p.symlink_to("/tmp")
    elif damage == "fifo":
        os.mkfifo(p)
    else:
        p.mkdir()
        (p / ".git").write_text("gitdir: /tmp")
    assert plan(tmp_path)["blockers"]


def test_no_head_and_outer_repository_fail_closed(tmp_path: Path) -> None:
    fixture(tmp_path)
    git(tmp_path, "init", "-q")
    assert plan(tmp_path)["blockers"]
    child = tmp_path / "nested"
    child.mkdir()
    fixture(child)
    assert any("top-level" in b for b in plan(child)["blockers"])


def test_partial_cwd_does_not_block_preview(tmp_path: Path) -> None:
    fixture(tmp_path)
    (tmp_path / "scripts/build.sh").write_text("cd src\nmake\n")
    commit_fixture(tmp_path)
    result = plan(tmp_path)
    assert result["state"]["coverage"] == "partial"
    assert result["blockers"] == []


def load_script(name: str) -> Any:
    import importlib.util

    from template_prune_fixture import ROOT

    spec = importlib.util.spec_from_file_location(
        "probe_" + name, ROOT / "scripts" / name
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_preview_and_doctor_report_partial_without_failure(
    tmp_path: Path, capsys
) -> None:
    fixture(tmp_path)
    (tmp_path / "scripts/build.sh").write_text("cd src\nmake\n")
    commit_fixture(tmp_path)
    cli = load_script("prune-template-docs.py")
    cli.REPO_ROOT = tmp_path
    before = snapshot(tmp_path)
    assert cli.main([]) == 0
    assert snapshot(tmp_path) == before
    output = capsys.readouterr().out
    assert "partial" in output and "scripts/build.sh" in output and "dry-run" in output
    doctor = load_script("doctor.py")
    doctor.REPO_ROOT = tmp_path
    diag = doctor.Diagnostics()
    doctor.check_template_docs(diag)
    assert diag.fail == 0
    assert "scripts/build.sh" in capsys.readouterr().out


@pytest.mark.parametrize(
    "args,code",
    [
        (["--help"], 0),
        (["--apply", "--apply"], 2),
        (["--force"], 2),
        (["--a"], 2),
        (["--app"], 2),
    ],
)
def test_argument_validation_never_changes_repository(
    tmp_path: Path, args: list[str], code: int
) -> None:
    fixture(tmp_path)
    commit_fixture(tmp_path)
    cli = load_script("prune-template-docs.py")
    cli.REPO_ROOT = tmp_path
    before = snapshot(tmp_path)
    with pytest.raises(SystemExit) as error:
        cli.main(args)
    assert error.value.code == code
    assert snapshot(tmp_path) == before


def test_git_missing_still_reports_plan_and_never_writes(
    tmp_path: Path, monkeypatch, capsys
) -> None:
    import subprocess

    fixture(tmp_path)
    commit_fixture(tmp_path)
    original = subprocess.run

    def run(args, *positional, **kwargs):
        if args[0] == "git":
            raise FileNotFoundError("Git unavailable")
        return original(args, *positional, **kwargs)

    cli = load_script("prune-template-docs.py")
    cli.REPO_ROOT = tmp_path
    before = snapshot(tmp_path)
    monkeypatch.setattr(subprocess, "run", run)
    assert cli.main([]) == 1
    assert "削除:" in capsys.readouterr().out
    assert snapshot(tmp_path) == before


def test_normal_clone_is_accepted_and_bare_is_rejected(tmp_path: Path) -> None:
    source = tmp_path / "source"
    source.mkdir()
    fixture(source)
    commit_fixture(source)
    clone = tmp_path / "clone"
    git(tmp_path, "clone", "--quiet", str(source), str(clone))
    assert not plan(clone)["blockers"]
    git(clone, "config", "core.bare", "true")
    assert plan(clone)["blockers"]
