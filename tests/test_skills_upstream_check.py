"""scripts/skills-upstream-check.py の単体テスト（ネットワーク・gh 不使用）。

分類ロジック（URL パース・パス成分一致・compare 結果の分類）を純関数として検証し、
API 応答はフィクスチャ dict / JSON 文字列で与える（fetch をフェイクに差し替え）。
spec: add-skills-upstream-check のフェーズ 2 対応表（H1〜H11）に対応する。
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from types import ModuleType

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT_PATH = REPO_ROOT / "scripts" / "skills-upstream-check.py"


def _load_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location("skills_upstream_check", SCRIPT_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


upstream = _load_module()


def _entry(
    name: str,
    source: str = "https://github.com/mattpocock/skills",
    source_type: str = "github",
    commit: str = "c" * 40,
) -> dict[str, object]:
    """lock エントリのフィクスチャ（本テストで使うフィールドのみ）。"""
    return {
        "name": name,
        "source": source,
        "source_type": source_type,
        "commit": commit,
    }


def _compare_json(status: str, filenames: list[str]) -> str:
    """compare API 応答のフィクスチャ（使用フィールドは status / files のみ）。"""
    return json.dumps(
        {"status": status, "files": [{"filename": fn} for fn in filenames]}
    )


class FakeFetch:
    """compare 応答をフィクスチャで返す（呼び出し記録つき・ネットワーク不使用）。"""

    def __init__(self, responses: list[tuple[int, str]]) -> None:
        self.responses = responses
        self.calls: list[tuple[str, str, str]] = []

    def __call__(self, owner: str, repo: str, commit: str) -> tuple[int, str]:
        self.calls.append((owner, repo, commit))
        return self.responses[len(self.calls) - 1]


# --- parse_github_repo（H2: URL 解釈） ---


def test_parse_github_repo_valid_url() -> None:
    assert upstream.parse_github_repo("https://github.com/mattpocock/skills") == (
        "mattpocock",
        "skills",
    )


@pytest.mark.parametrize(
    "source",
    [
        "https://github.com/mattpocock/skills.git",
        "https://github.com/mattpocock/skills/",
        "  https://github.com/mattpocock/skills  ",
    ],
)
def test_parse_github_repo_normalizes_variants(source: str) -> None:
    """`.git` / 末尾スラッシュ / 前後空白を許容して同じ (owner, repo) に解釈する。"""
    assert upstream.parse_github_repo(source) == ("mattpocock", "skills")


@pytest.mark.parametrize(
    "source",
    [
        "local (first-party)",
        "https://gitlab.com/owner/repo",
        "https://github.com/owner-only",
        "https://github.com/owner/repo/tree/main",
        "git@github.com:owner/repo.git",
        "",
    ],
)
def test_parse_github_repo_rejects_non_repo_url(source: str) -> None:
    """GitHub リポジトリ URL と解釈できない source は None（→ 不正エントリ WARN）。"""
    assert upstream.parse_github_repo(source) is None


# --- skill_files_changed（H10: パス成分一致） ---


def test_skill_path_match_directory_component() -> None:
    """ディレクトリ成分の完全一致は位置を問わず変更とみなす（再配置に追随）。"""
    assert upstream.skill_files_changed("grilling", ["skills/grilling/SKILL.md"])
    assert upstream.skill_files_changed(
        "grilling", ["skills/productivity/grilling/SKILL.md"]
    )


def test_skill_path_match_filename_is_not_a_change() -> None:
    """ファイル名部分の一致は変更とみなさない。"""
    assert not upstream.skill_files_changed(
        "grilling", ["docs/productivity/grilling.md"]
    )
    assert not upstream.skill_files_changed("grilling", ["grilling"])


def test_skill_path_match_requires_exact_component() -> None:
    """成分の部分一致（prefix / suffix）は変更とみなさない（完全一致のみ）。"""
    assert not upstream.skill_files_changed(
        "grilling", ["skills/grilling-extra/SKILL.md", "skills/my-grilling/note.md"]
    )


def test_skill_path_match_repo_root_for_single_skill_repo() -> None:
    """repo 名 = skill 名では直下ファイルの変更も skill 変更とみなす（Codex P2）。"""
    assert upstream.skill_files_changed("caveman", ["SKILL.md"], include_repo_root=True)
    assert upstream.skill_files_changed(
        "caveman", ["README.md"], include_repo_root=True
    )
    # 直下でないファイルは従来どおりディレクトリ成分一致のみで判定する。
    assert not upstream.skill_files_changed(
        "caveman", ["docs/README.md"], include_repo_root=True
    )
    # 単一 skill リポジトリでなければ直下ファイルは変更とみなさない。
    assert not upstream.skill_files_changed("caveman", ["SKILL.md"])


# --- classify_compare（H4 / H9 / H11） ---


def test_classify_identical_is_ok() -> None:
    level, _ = upstream.classify_compare("tdd", "identical", [])
    assert level == upstream.OK


@pytest.mark.parametrize("status", ["behind", "diverged"])
def test_diverged_status_warns(status: str) -> None:
    """identical / ahead 以外の status は履歴書き換えの可能性として WARN（H4）。"""
    level, reason = upstream.classify_compare("tdd", status, [])
    assert level == upstream.WARN
    assert status in reason


def test_ahead_without_skill_change_is_info() -> None:
    """ahead でも skill 本体が無変更なら INFO（変更ファイル空も含む・H11）。"""
    level, _ = upstream.classify_compare("tdd", "ahead", ["docs/README.md"])
    assert level == upstream.INFO
    level, _ = upstream.classify_compare("tdd", "ahead", [])
    assert level == upstream.INFO


def test_ahead_with_skill_change_warns() -> None:
    level, reason = upstream.classify_compare("tdd", "ahead", ["skills/tdd/SKILL.md"])
    assert level == upstream.WARN
    assert "更新されています" in reason


def test_truncated_files_inconclusive() -> None:
    """300 件到達で未検出なら判定不能 WARN・検出済みなら変更あり WARN を優先（H9）。"""
    unrelated = [f"docs/file{i}.md" for i in range(300)]
    level, reason = upstream.classify_compare("tdd", "ahead", unrelated)
    assert level == upstream.WARN
    assert "判定できません" in reason

    detected = ["skills/tdd/SKILL.md", *[f"docs/file{i}.md" for i in range(299)]]
    level, reason = upstream.classify_compare("tdd", "ahead", detected)
    assert level == upstream.WARN
    assert "更新されています" in reason


# --- check_entries（H1 / H2 / H3 / H5 / H6） ---


def test_no_github_entries() -> None:
    """github エントリゼロは対象ゼロ報告＋exit 0 経路（local はスキップ表示・H1）。"""
    fetch = FakeFetch([])
    reporter = upstream.Reporter()
    skills = [_entry("self-review", source="local (first-party)", source_type="local")]
    upstream.check_entries(skills, fetch, reporter)
    assert fetch.calls == []
    assert [level for level, _ in reporter.results] == [upstream.INFO, upstream.INFO]
    assert "スキップ" in reporter.results[0][1]
    assert "対象ゼロ" in reporter.results[1][1]

    reporter_empty = upstream.Reporter()
    upstream.check_entries([], fetch, reporter_empty)
    assert any("対象ゼロ" in msg for _, msg in reporter_empty.results)


def test_invalid_entry_warns() -> None:
    """必須フィールド欠落・非 GitHub URL は WARN（不正エントリ）で続行する（H2）。"""
    skills = [
        _entry("no-commit", commit=""),
        _entry("bad-url", source="ftp://example.com/x"),
        _entry("valid"),
    ]
    fetch = FakeFetch([(0, _compare_json("identical", []))])
    reporter = upstream.Reporter()
    upstream.check_entries(skills, fetch, reporter)
    assert [level for level, _ in reporter.results] == [
        upstream.WARN,
        upstream.WARN,
        upstream.OK,
    ]
    assert len(fetch.calls) == 1


def test_api_error_warns() -> None:
    """エントリ単位の API エラーは WARN とし、残りのエントリは続行する（H3）。"""
    skills = [_entry("first"), _entry("second")]
    fetch = FakeFetch([(1, "HTTP 404: Not Found"), (0, _compare_json("identical", []))])
    reporter = upstream.Reporter()
    upstream.check_entries(skills, fetch, reporter)
    assert [level for level, _ in reporter.results] == [upstream.WARN, upstream.OK]
    assert "404" in reporter.results[0][1]


def test_single_skill_repo_root_change_warns_via_check_entries() -> None:
    """repo 名 = skill 名のエントリは直下ファイル変更で WARN になる（Codex P2）。"""
    skills = [_entry("caveman", source="https://github.com/JuliusBrussee/caveman")]
    fetch = FakeFetch([(0, _compare_json("ahead", ["SKILL.md", "README.md"]))])
    reporter = upstream.Reporter()
    upstream.check_entries(skills, fetch, reporter)
    assert [level for level, _ in reporter.results] == [upstream.WARN]
    assert "更新されています" in reporter.results[0][1]


def test_entries_compared_independently() -> None:
    """同一上流 repo の複数エントリを lock 記載順にそれぞれ独立比較する（H5/H6）。"""
    source = "https://github.com/mattpocock/skills"
    skills = [
        _entry("grill-me", source=source, commit="a" * 40),
        _entry("grilling", source=source, commit="b" * 40),
    ]
    fetch = FakeFetch(
        [
            (0, _compare_json("ahead", ["skills/grill-me/SKILL.md"])),
            (0, _compare_json("identical", [])),
        ]
    )
    reporter = upstream.Reporter()
    upstream.check_entries(skills, fetch, reporter)
    assert fetch.calls == [
        ("mattpocock", "skills", "a" * 40),
        ("mattpocock", "skills", "b" * 40),
    ]
    assert [level for level, _ in reporter.results] == [upstream.WARN, upstream.OK]
    assert reporter.results[0][1].startswith("grill-me:")
    assert reporter.results[1][1].startswith("grilling:")


# --- main の前提不成立（H8: 唯一の非ゼロ経路）と WARN 非ゲート（R2） ---


def test_missing_gh_exits_nonzero(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """gh CLI 不在は導入案内を表示して非ゼロ終了する（H8）。"""
    monkeypatch.setattr(upstream.shutil, "which", lambda _name: None)
    assert upstream.main([]) == 1
    out = capsys.readouterr().out
    assert "[FAIL]" in out
    assert "gh" in out


def test_unauthenticated_gh_exits_nonzero(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """gh 未認証（gh auth token 非ゼロ＝資格情報なし）は案内して exit 1（H8）。"""
    monkeypatch.setattr(upstream.shutil, "which", lambda _name: "/usr/bin/gh")
    monkeypatch.setattr(
        upstream, "_run", lambda _cmd, timeout=60: (1, "", "no oauth token")
    )
    assert upstream.main([]) == 1
    out = capsys.readouterr().out
    assert "未認証" in out


def test_offline_compare_failures_warn_and_exit_zero(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """資格情報があればオフラインでも WARN 報告で exit 0（hard fail しない・P2）。"""
    lock = tmp_path / "skills.lock.json"
    lock.write_text(
        json.dumps({"version": 1, "skills": [_entry("tdd"), _entry("caveman")]}),
        encoding="utf-8",
    )
    monkeypatch.setattr(upstream.shutil, "which", lambda _name: "/usr/bin/gh")
    # gh auth token はローカル判定で成功する（ネットワーク不要）。
    monkeypatch.setattr(upstream, "_run", lambda _cmd, timeout=60: (0, "", ""))
    monkeypatch.setattr(upstream, "SKILLS_LOCK", lock)
    monkeypatch.setattr(
        upstream,
        "_fetch_compare",
        lambda _owner, _repo, _commit: (1, "error connecting to api.github.com"),
    )
    assert upstream.main([]) == 0
    out = capsys.readouterr().out
    assert out.count("[WARN]") == 2


def test_missing_lock_exits_nonzero(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """lock 不在は前提不成立として非ゼロ終了する（H8）。"""
    monkeypatch.setattr(upstream.shutil, "which", lambda _name: "/usr/bin/gh")
    monkeypatch.setattr(upstream, "_run", lambda _cmd, timeout=60: (0, "", ""))
    monkeypatch.setattr(upstream, "SKILLS_LOCK", tmp_path / "skills.lock.json")
    assert upstream.main([]) == 1


def test_unparseable_lock_exits_nonzero(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """lock 解析不能（JSON 破損）は前提不成立として非ゼロ終了する（H8）。"""
    lock = tmp_path / "skills.lock.json"
    lock.write_text("{ broken", encoding="utf-8")
    monkeypatch.setattr(upstream.shutil, "which", lambda _name: "/usr/bin/gh")
    monkeypatch.setattr(upstream, "_run", lambda _cmd, timeout=60: (0, "", ""))
    monkeypatch.setattr(upstream, "SKILLS_LOCK", lock)
    assert upstream.main([]) == 1


def test_warn_only_still_exits_zero(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """乖離 WARN があっても exit 0（報告のみ・ゲートにしない）。"""
    lock = tmp_path / "skills.lock.json"
    lock.write_text(
        json.dumps({"version": 1, "skills": [_entry("tdd")]}), encoding="utf-8"
    )
    monkeypatch.setattr(upstream.shutil, "which", lambda _name: "/usr/bin/gh")
    monkeypatch.setattr(upstream, "_run", lambda _cmd, timeout=60: (0, "", ""))
    monkeypatch.setattr(upstream, "SKILLS_LOCK", lock)
    monkeypatch.setattr(
        upstream,
        "_fetch_compare",
        lambda _owner, _repo, _commit: (
            0,
            _compare_json("ahead", ["skills/tdd/SKILL.md"]),
        ),
    )
    assert upstream.main([]) == 0
