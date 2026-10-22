"""共有編集で対象外hardlinkのbytesとinodeを変更しない。"""

import importlib
import os
from pathlib import Path

import pytest
from template_prune_fixture import ASSETS, commit_fixture, fixture, plan
from test_template_prune_plan import snapshot

apply = importlib.import_module("template_prune_apply").apply


@pytest.mark.parametrize(
    "path", ["README.md", "Taskfile.yml", "docs/agents/workflow.md"]
)
def test_edit_hardlink_is_rejected_without_changes(tmp_path: Path, path: str) -> None:
    fixture(tmp_path)
    commit_fixture(tmp_path)
    outside = tmp_path / "user-notes.md"
    os.link(tmp_path / path, outside)
    inode = outside.stat().st_ino
    before = snapshot(tmp_path)
    proposal = plan(tmp_path)
    result = apply(proposal)
    assert snapshot(tmp_path) == before
    assert outside.stat().st_ino == inode
    assert any("hardlink" in error for error in proposal["blockers"])
    assert not result["ok"] and not result["changed"]


@pytest.mark.parametrize("phase", ["after-preview", "between-writes"])
def test_new_hardlink_stops_before_next_write(tmp_path: Path, monkeypatch, phase: str):
    fixture(tmp_path)
    commit_fixture(tmp_path)
    proposal = plan(tmp_path)
    outside = tmp_path / "user-notes.md"
    target = tmp_path / "Taskfile.yml"
    before = target.read_bytes()
    inode = target.stat().st_ino
    original = Path.write_bytes

    def write(path, data):
        result = original(path, data)
        if path == tmp_path / "README.md":
            os.link(target, outside)
        return result

    if phase == "after-preview":
        os.link(target, outside)
    else:
        monkeypatch.setattr(Path, "write_bytes", write)
    result = apply(proposal)
    assert not result["ok"] and "hardlink" in result["error"]
    assert outside.read_bytes() == before
    assert outside.stat().st_ino == inode
    assert (tmp_path / ASSETS[0]).exists()


def test_unlink_only_preserves_external_hardlink(tmp_path: Path) -> None:
    fixture(tmp_path)
    commit_fixture(tmp_path)
    outside = tmp_path / "user-notes.md"
    os.link(tmp_path / ASSETS[0], outside)
    before = outside.read_bytes(), outside.stat().st_ino
    result = apply(plan(tmp_path))
    assert result["ok"], result
    assert (outside.read_bytes(), outside.stat().st_ino) == before


def test_pruned_noop_does_not_reject_unedited_hardlink(tmp_path: Path) -> None:
    fixture(tmp_path, bundled=False)
    commit_fixture(tmp_path)
    os.link(tmp_path / "README.md", tmp_path / "user-notes.md")
    before = snapshot(tmp_path)
    result = apply(plan(tmp_path))
    assert result["ok"] and not result["changed"], result
    assert snapshot(tmp_path) == before
