"""skills.lock の上流陳腐化検知（task skills:upstream）。

opt-in のネットワークタスク（gh 必須・報告のみ・read-only）。
lock（.agents/skills/skills.lock.json）の `source_type == "github"` の各エントリに
ついて、lock の commit と上流既定ブランチ HEAD を GitHub compare API（`gh api` の
read）で比較し、lock 記載順に分類報告する。

分類規約（spec: add-skills-upstream-check）:
- OK   = identical（上流と一致）
- INFO = ahead だが skill 本体の変更なし / github 以外のスキップ表示 / 対象ゼロ
- WARN = ahead かつ skill 本体の変更あり / behind・diverged 等（履歴書き換えの
  可能性）/ 不正エントリ / エントリ単位の API エラー / files 切り詰めで判定不能
- WARN があっても exit 0（ゲートにしない・更新判断は人起点）。
- 非ゼロ終了は前提不成立のみ: gh 不在・gh 未認証・lock 不在または解析不能。

skill 本体変更の判定: 変更ファイルパスのディレクトリ成分（ファイル名を除く部分）に
skill 名が完全一致で含まれるか（位置不問・上流の再配置に追随）。ファイル名部分の
一致（例: docs/grilling.md と skill `grilling`）は変更とみなさない。

read-only 方針: lock・vendored skill・リポジトリの状態を一切変更しない。認証・
レート制限は gh に委譲し、token をスクリプトで扱わない。
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
from collections.abc import Callable
from pathlib import Path, PurePosixPath

REPO_ROOT = Path(__file__).resolve().parent.parent
SKILLS_LOCK = REPO_ROOT / ".agents" / "skills" / "skills.lock.json"

OK = "OK"
INFO = "INFO"
WARN = "WARN"

# GitHub compare API は files を最大 300 件で切り詰める（GitHub API 仕様）。
# len(files) がここに達したら切り詰めの可能性ありとして扱う。
COMPARE_FILES_LIMIT = 300

# 比較せずスキップ表示する source_type（lock の enum のうち github 以外）。
SKIP_SOURCE_TYPES = ("local", "plugin")

# lock の source に置ける GitHub リポジトリ URL（.git / 末尾スラッシュは許容）。
_GITHUB_REPO_RE = re.compile(
    r"^https://github\.com/(?P<owner>[^/\s]+)/(?P<repo>[^/\s]+?)(?:\.git)?/?$"
)

FetchCompare = Callable[[str, str, str], tuple[int, str]]


class Reporter:
    """分類結果を doctor.py と同じ表記で表示し、件数を集計する。

    WARN は報告のみで exit code に影響しない（ゲートにしない・報告のみ規約）。
    """

    def __init__(self) -> None:
        self.counts: dict[str, int] = {OK: 0, INFO: 0, WARN: 0}
        self.results: list[tuple[str, str]] = []

    def report(self, level: str, msg: str) -> None:
        self.counts[level] += 1
        self.results.append((level, msg))
        label = f"[{level}]".ljust(6)
        print(f"{label} {msg}")


def _run(cmd: list[str], timeout: int = 60) -> tuple[int, str, str]:
    """コマンドを read-only 前提で実行し (returncode, stdout, stderr) を返す。"""
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=REPO_ROOT,
            timeout=timeout,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return 1, "", str(exc)
    return proc.returncode, proc.stdout, proc.stderr


def parse_github_repo(source: str) -> tuple[str, str] | None:
    """GitHub リポジトリ URL を (owner, repo) に解釈する（解釈できなければ None）。"""
    match = _GITHUB_REPO_RE.match(source.strip())
    if match is None:
        return None
    return match.group("owner"), match.group("repo")


def skill_files_changed(skill_name: str, filenames: list[str]) -> bool:
    """変更ファイルパスのディレクトリ成分に skill 名が完全一致で含まれるか。

    位置は問わない（上流の再配置に追随する）。最終要素（ファイル名）の一致は
    変更とみなさない（例: docs/productivity/grilling.md と skill `grilling`）。
    """
    return any(
        skill_name in PurePosixPath(filename).parts[:-1] for filename in filenames
    )


def classify_compare(
    skill_name: str, status: str, filenames: list[str]
) -> tuple[str, str]:
    """compare 結果を (分類レベル, 理由) に分類する純関数。

    identical は OK、ahead は skill 本体の変更有無で WARN / INFO、それ以外の
    status（behind / diverged 等）は履歴書き換えの可能性として WARN。files が
    上限（300 件）で切り詰められている可能性がある場合、skill 変更を検出済みなら
    WARN（変更あり）を優先し、未検出なら判定不能 WARN に倒す（見逃しを黙殺しない）。
    """
    if status == "identical":
        return OK, "上流と一致しています"
    if status != "ahead":
        return WARN, f"compare status={status}（履歴書き換え等の可能性・要手動確認）"
    if skill_files_changed(skill_name, filenames):
        return WARN, "上流で skill 本体が更新されています（更新するかは人の判断）"
    if len(filenames) >= COMPARE_FILES_LIMIT:
        return WARN, (
            f"変更ファイル一覧が {COMPARE_FILES_LIMIT} 件で切り詰められている"
            "可能性があり、skill 変更の有無を判定できません（要手動確認）"
        )
    return INFO, "上流は先行していますが skill 本体は無変更です"


def extract_filenames(compare_response: dict[str, object]) -> list[str]:
    """compare 応答の files から filename を取り出す（欠落・型不一致は無視）。"""
    files = compare_response.get("files")
    if not isinstance(files, list):
        return []
    return [
        str(item["filename"])
        for item in files
        if isinstance(item, dict) and "filename" in item
    ]


def check_entries(
    skills: list[object],
    fetch_compare: FetchCompare,
    reporter: Reporter,
) -> None:
    """lock 記載順に各エントリを分類報告する（github 以外はスキップ表示）。

    不正エントリ・エントリ単位の API エラーは WARN で報告して続行する。
    同一上流リポジトリの複数エントリもそれぞれ独立に比較する（最適化しない）。
    github エントリが 1 件も無ければ対象ゼロである旨を報告する。
    """
    github_count = 0
    for entry in skills:
        if not isinstance(entry, dict):
            reporter.report(
                WARN, f"不正エントリ（オブジェクトではありません）: {entry!r}"
            )
            continue
        name = str(entry.get("name") or "(name 欠落)")
        source_type = entry.get("source_type")
        if source_type in SKIP_SOURCE_TYPES:
            reporter.report(
                INFO, f"{name}: source_type={source_type} のため比較をスキップします"
            )
            continue
        if source_type != "github":
            reporter.report(
                WARN,
                f"{name}: 不正エントリ（source_type={source_type!r} は解釈できません）",
            )
            continue
        github_count += 1
        source = str(entry.get("source") or "")
        commit = str(entry.get("commit") or "")
        if not (entry.get("name") and source and commit):
            reporter.report(
                WARN, f"{name}: 不正エントリ（name / source / commit のいずれかが欠落）"
            )
            continue
        repo_ref = parse_github_repo(source)
        if repo_ref is None:
            reporter.report(
                WARN,
                f"{name}: 不正エントリ"
                f"（source が GitHub リポジトリ URL ではありません: {source}）",
            )
            continue
        owner, repo = repo_ref
        rc, payload = fetch_compare(owner, repo, commit)
        if rc != 0:
            detail = payload.strip().splitlines()[0] if payload.strip() else "詳細なし"
            reporter.report(
                WARN,
                f"{name}: compare API 呼び出しに失敗しました"
                f"（{owner}/{repo}）: {detail}",
            )
            continue
        try:
            data = json.loads(payload)
        except json.JSONDecodeError as exc:
            reporter.report(
                WARN, f"{name}: compare 応答を JSON として解析できません: {exc}"
            )
            continue
        if not isinstance(data, dict):
            reporter.report(WARN, f"{name}: compare 応答がオブジェクトではありません")
            continue
        status = str(data.get("status") or "(status 欠落)")
        level, reason = classify_compare(name, status, extract_filenames(data))
        reporter.report(level, f"{name}: {reason}")
    if github_count == 0:
        reporter.report(
            INFO, "source_type=github の比較対象エントリがありません（対象ゼロ）"
        )


def _fetch_compare(owner: str, repo: str, commit: str) -> tuple[int, str]:
    """lock commit と上流既定ブランチ HEAD の compare を gh api（read）で取得する。

    `HEAD` は上流既定ブランチに解決される（実機確認済み）。成功時は
    (0, JSON 文字列)、失敗時は (非ゼロ, エラーメッセージ) を返す（gh は非ゼロ
    終了し stderr に理由を出す）。
    """
    rc, stdout, stderr = _run(
        ["gh", "api", f"repos/{owner}/{repo}/compare/{commit}...HEAD"]
    )
    if rc != 0:
        return rc, (stderr.strip() or stdout.strip())
    return 0, stdout


def _fail(msg: str, *hints: str) -> None:
    """前提不成立（唯一の非ゼロ経路）の理由と復旧案内を表示する。"""
    print(f"[FAIL] {msg}")
    for hint in hints:
        print(f"       {hint}")


def check_gh_available() -> bool:
    """gh CLI の在席と認証を確認する（不成立は案内を表示して False）。"""
    if shutil.which("gh") is None:
        _fail(
            "gh CLI が見つかりません（本タスクは gh api を使うため gh 必須）",
            "導入: https://github.com/cli/cli",
            "導入後に gh auth login で認証してください",
        )
        return False
    rc, stdout, stderr = _run(["gh", "auth", "status"])
    if rc != 0:
        lines = (stderr.strip() or stdout.strip()).splitlines()
        detail = lines[0] if lines else "詳細なし"
        _fail(
            f"gh が未認証です（gh auth status: {detail}）",
            "認証: gh auth login（または GH_TOKEN を設定）",
        )
        return False
    return True


def _load_lock_skills() -> list[object] | None:
    """lock の skills 配列を読む。不在・解析不能は案内を表示して None（exit 1）。"""
    if not SKILLS_LOCK.exists():
        _fail(
            f"skills.lock.json が存在しません: {SKILLS_LOCK}",
            "vendored skill の lock が必要です（task skills:doctor で整合確認）",
        )
        return None
    try:
        data = json.loads(SKILLS_LOCK.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        _fail(f"skills.lock.json を解析できません: {exc}")
        return None
    skills = data.get("skills") if isinstance(data, dict) else None
    if not isinstance(skills, list):
        _fail("skills.lock.json の skills が配列ではありません")
        return None
    return skills


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "skills.lock の上流乖離チェック"
            "（opt-in・ネットワーク使用・gh 必須・報告のみ・read-only）"
        )
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    parse_args(argv)
    print("=== skills 上流乖離チェック (task skills:upstream) ===")
    if not check_gh_available():
        return 1
    skills = _load_lock_skills()
    if skills is None:
        return 1
    reporter = Reporter()
    check_entries(skills, _fetch_compare, reporter)
    counts = reporter.counts
    print(f"--- 結果: OK={counts[OK]} / INFO={counts[INFO]} / WARN={counts[WARN]} ---")
    if counts[WARN]:
        print("WARN は報告のみです（更新するかは人の判断・exit 0 を維持します）。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
