"""scripts/setup-skills.sh の非 symlink 保護と unlink 限定置換のテスト。

tmp 配下に最小リポジトリ構造（scripts/setup-skills.sh のコピー＋
.agents/skills/<name>/SKILL.md）を複製し、bash を subprocess 実行して検証する。
ネットワーク不使用。実リポジトリの .claude/skills / .codex/skills は変更しない。
spec: harden-skills-update-and-pat-docs の skills-symlink-setup デルタに対応する。
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT_SOURCE = REPO_ROOT / "scripts" / "setup-skills.sh"
LINK_ROOTS = (".claude/skills", ".codex/skills")


def _make_repo(tmp_path: Path, skill_names: list[str]) -> Path:
    """tmp 配下に最小リポジトリ構造（スクリプト＋vendored skill）を複製する。"""
    repo = tmp_path / "repo"
    scripts_dir = repo / "scripts"
    scripts_dir.mkdir(parents=True)
    shutil.copy(SCRIPT_SOURCE, scripts_dir / "setup-skills.sh")
    for name in skill_names:
        skill_dir = repo / ".agents" / "skills" / name
        skill_dir.mkdir(parents=True)
        (skill_dir / "SKILL.md").write_text(f"# {name}\n", encoding="utf-8")
    return repo


def _run_setup(repo: Path) -> subprocess.CompletedProcess[str]:
    """setup-skills.sh を subprocess 実行する（ネットワーク不使用）。"""
    return subprocess.run(
        ["bash", str(repo / "scripts" / "setup-skills.sh")],
        capture_output=True,
        text=True,
        check=False,
    )


def _expected_target(name: str) -> str:
    """link root から見た vendored skill への期待相対 symlink 先。"""
    return f"../../.agents/skills/{name}"


def test_real_directory_collision_is_protected(tmp_path: Path) -> None:
    """実ディレクトリと名前衝突: 内容無傷・復旧手順を stderr 表示・非ゼロ終了。"""
    repo = _make_repo(tmp_path, ["tdd"])
    user_dir = repo / ".claude" / "skills" / "tdd"
    user_dir.mkdir(parents=True)
    (user_dir / "NOTES.md").write_text("user content\n", encoding="utf-8")

    result = _run_setup(repo)

    assert result.returncode != 0
    assert user_dir.is_dir() and not user_dir.is_symlink()
    assert (user_dir / "NOTES.md").read_text(encoding="utf-8") == "user content\n"
    assert ".claude/skills/tdd" in result.stderr
    # 復旧手順（mv で退避 or 手動削除→再実行）が案内されること。
    assert "mv" in result.stderr
    assert "再実行" in result.stderr
    # 一切のファイルシステム変更を行わない（他 root の link 生成もしない）。
    assert not (repo / ".codex").exists()


def test_regular_file_collision_is_protected(tmp_path: Path) -> None:
    """通常ファイルと名前衝突: ファイル無傷のまま非ゼロ終了する。"""
    repo = _make_repo(tmp_path, ["tdd"])
    user_file = repo / ".codex" / "skills" / "tdd"
    user_file.parent.mkdir(parents=True)
    user_file.write_text("user file\n", encoding="utf-8")

    result = _run_setup(repo)

    assert result.returncode != 0
    assert user_file.is_file() and not user_file.is_symlink()
    assert user_file.read_text(encoding="utf-8") == "user file\n"
    assert ".codex/skills/tdd" in result.stderr


def test_multiple_collisions_are_all_listed(tmp_path: Path) -> None:
    """複数の skill 名／複数の link root の衝突を全件列挙してから非ゼロ終了する。"""
    repo = _make_repo(tmp_path, ["tdd", "caveman"])
    dir_conflict = repo / ".claude" / "skills" / "tdd"
    dir_conflict.mkdir(parents=True)
    file_conflict = repo / ".codex" / "skills" / "caveman"
    file_conflict.parent.mkdir(parents=True)
    file_conflict.write_text("user file\n", encoding="utf-8")

    result = _run_setup(repo)

    assert result.returncode != 0
    # 最初の 1 件で停止せず、全衝突パスが stderr に列挙されること。
    assert ".claude/skills/tdd" in result.stderr
    assert ".codex/skills/caveman" in result.stderr


def test_collision_blocks_repair_in_other_root(tmp_path: Path) -> None:
    """衝突時は他 root の壊れた symlink の修復も含め一切変更しない（部分変更なし）。"""
    repo = _make_repo(tmp_path, ["tdd"])
    dir_conflict = repo / ".claude" / "skills" / "tdd"
    dir_conflict.mkdir(parents=True)
    broken_link = repo / ".codex" / "skills" / "tdd"
    broken_link.parent.mkdir(parents=True)
    broken_link.symlink_to("missing-target")

    result = _run_setup(repo)

    assert result.returncode != 0
    # 壊れた symlink は修復されず、そのまま残ること（衝突解消後の再実行で修復される）。
    assert broken_link.is_symlink()
    assert broken_link.readlink() == Path("missing-target")


def test_rerun_after_evacuation_succeeds(tmp_path: Path) -> None:
    """衝突ディレクトリを退避（mv 相当）してから再実行すると正常に生成される。"""
    repo = _make_repo(tmp_path, ["tdd"])
    user_dir = repo / ".claude" / "skills" / "tdd"
    user_dir.mkdir(parents=True)
    (user_dir / "NOTES.md").write_text("user content\n", encoding="utf-8")
    assert _run_setup(repo).returncode != 0

    user_dir.rename(repo / "tdd-backup")
    result = _run_setup(repo)

    assert result.returncode == 0
    for link_root in LINK_ROOTS:
        link = repo / link_root / "tdd"
        assert link.is_symlink()
        assert link.readlink() == Path(_expected_target("tdd"))
        assert (link / "SKILL.md").is_file()
    # 退避した内容は無傷であること。
    assert (repo / "tdd-backup" / "NOTES.md").read_text(encoding="utf-8") == (
        "user content\n"
    )


def test_broken_symlink_is_repaired(tmp_path: Path) -> None:
    """解決不能な symlink は unlink して正しい相対 symlink を張り直し exit 0。"""
    repo = _make_repo(tmp_path, ["tdd"])
    broken_link = repo / ".claude" / "skills" / "tdd"
    broken_link.parent.mkdir(parents=True)
    broken_link.symlink_to("missing-target")

    result = _run_setup(repo)

    assert result.returncode == 0
    assert broken_link.is_symlink()
    assert broken_link.readlink() == Path(_expected_target("tdd"))
    assert (broken_link / "SKILL.md").is_file()


def test_wrong_target_symlink_is_replaced_target_intact(tmp_path: Path) -> None:
    """期待先と異なる symlink は link のみ unlink して張り直し、指し先は無傷。"""
    repo = _make_repo(tmp_path, ["tdd"])
    user_dir = repo / "user-skill"
    user_dir.mkdir()
    (user_dir / "NOTES.md").write_text("user content\n", encoding="utf-8")
    wrong_link = repo / ".claude" / "skills" / "tdd"
    wrong_link.parent.mkdir(parents=True)
    wrong_link.symlink_to("../../user-skill")

    result = _run_setup(repo)

    assert result.returncode == 0
    assert wrong_link.is_symlink()
    assert wrong_link.readlink() == Path(_expected_target("tdd"))
    # 指し先だった実ディレクトリと内容は無傷であること。
    assert user_dir.is_dir()
    assert (user_dir / "NOTES.md").read_text(encoding="utf-8") == "user content\n"


def test_correct_symlinks_are_idempotent(tmp_path: Path) -> None:
    """全 symlink が正しい状態の再実行は無変更・「変更なし」報告・exit 0。"""
    repo = _make_repo(tmp_path, ["tdd", "caveman"])
    assert _run_setup(repo).returncode == 0

    result = _run_setup(repo)

    assert result.returncode == 0
    assert "変更なし" in result.stdout
    for link_root in LINK_ROOTS:
        for name in ("tdd", "caveman"):
            link = repo / link_root / name
            assert link.is_symlink()
            assert link.readlink() == Path(_expected_target(name))
