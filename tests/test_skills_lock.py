"""skills.lock.json と vendored skill のハードゲート（PR2・§23.2）。

doctor は助言（WARN）に留め、skill 利用不能のハードゲートはここに集約する
（broken symlink / blocked 混入 / sha256 不整合は pytest FAIL = CI 赤）。

検証項目:
- 孤児なし: .agents/skills 配下の skill ディレクトリと lock エントリが一対一
- allowed の license_file が実在する
- blocked の skill は .agents/skills に同梱されていない
- 各 skill に SKILL.md が実在する
- .claude/skills・.codex/skills の symlink が解決し、先に SKILL.md が実在する
- sha256 整合（vendored SKILL.md の sha256 が lock と一致）
- source_type / redistribution が enum・commit / source / license が非空
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
SKILLS_ROOT = REPO_ROOT / ".agents" / "skills"
LOCK_PATH = SKILLS_ROOT / "skills.lock.json"

SOURCE_TYPES = {"github", "plugin", "local"}
REDISTRIBUTIONS = {"allowed", "blocked"}
SYMLINK_ROOTS = (".claude/skills", ".codex/skills")


def _load_lock() -> list[dict[str, object]]:
    data = json.loads(LOCK_PATH.read_text(encoding="utf-8"))
    skills = data.get("skills", [])
    assert isinstance(skills, list), "skills は配列であること"
    return skills


def _vendored_dirs() -> set[str]:
    return {
        p.name
        for p in SKILLS_ROOT.iterdir()
        if p.is_dir() and not p.name.startswith(".")
    }


def test_lock_exists() -> None:
    assert LOCK_PATH.is_file(), "skills.lock.json が存在すること"


def test_no_orphans_between_lock_and_dirs() -> None:
    """lock エントリと vendored ディレクトリが一対一（孤児なし）。"""
    lock_names = {str(s["name"]) for s in _load_lock()}
    dirs = _vendored_dirs()
    assert lock_names == dirs, (
        f"lock とディレクトリが不一致: lock のみ={lock_names - dirs} / "
        f"ディレクトリのみ={dirs - lock_names}"
    )


def test_lock_schema_fields() -> None:
    """各エントリの必須フィールド・enum・非空を検証する。"""
    for entry in _load_lock():
        name = entry.get("name")
        assert name, "name は非空であること"
        assert entry.get("source"), f"{name}: source は非空であること"
        assert entry.get("commit"), f"{name}: commit は非空であること"
        assert entry.get("license"), f"{name}: license は非空であること"
        assert entry.get("source_type") in SOURCE_TYPES, (
            f"{name}: source_type は {SOURCE_TYPES} のいずれか"
        )
        assert entry.get("redistribution") in REDISTRIBUTIONS, (
            f"{name}: redistribution は {REDISTRIBUTIONS} のいずれか"
        )


def test_allowed_license_files_exist() -> None:
    for entry in _load_lock():
        if entry.get("redistribution") != "allowed":
            continue
        license_file = REPO_ROOT / str(entry["license_file"])
        assert license_file.is_file(), (
            f"{entry['name']}: license_file が実在しません: {license_file}"
        )


def test_blocked_not_vendored() -> None:
    """blocked の skill は .agents/skills に同梱されていないこと。"""
    dirs = _vendored_dirs()
    for entry in _load_lock():
        if entry.get("redistribution") == "blocked":
            assert str(entry["name"]) not in dirs, (
                f"{entry['name']}: blocked は vendoring してはならない"
            )


def test_allowed_skill_md_exists_and_sha256_matches() -> None:
    for entry in _load_lock():
        if entry.get("redistribution") != "allowed":
            continue
        name = str(entry["name"])
        skill_md = SKILLS_ROOT / name / "SKILL.md"
        assert skill_md.is_file(), f"{name}: SKILL.md が実在しません"
        digest = hashlib.sha256(skill_md.read_bytes()).hexdigest()
        assert digest == entry["sha256"], (
            f"{name}: SKILL.md の sha256 が lock と不一致"
            f"（実体={digest} / lock={entry['sha256']}）"
        )


@pytest.mark.parametrize("symlink_root", SYMLINK_ROOTS)
def test_symlinks_resolve_to_skill_md(symlink_root: str) -> None:
    """.claude/skills・.codex/skills の symlink が解決し SKILL.md に届くこと。"""
    for entry in _load_lock():
        if entry.get("redistribution") != "allowed":
            continue
        name = str(entry["name"])
        link = REPO_ROOT / symlink_root / name
        assert link.is_symlink(), f"{symlink_root}/{name} は symlink であること"
        target_skill_md = link / "SKILL.md"
        assert target_skill_md.is_file(), (
            f"{symlink_root}/{name} の symlink 先に SKILL.md がありません"
            "（broken symlink）"
        )
