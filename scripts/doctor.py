"""環境診断（task doctor）。機械コア（PR1）＋エージェント統合（PR2）の診断。

合否規約（§20・Q17）:
- FAIL (exit 1) = 機械コアが壊れている時のみ:
  Python バージョン不一致 / uv 不在 / .venv 不在 / pyproject・uv.lock 破損 /
  ruff・basedpyright・pytest が呼べない。
  ＋ GitHub ワークフロー文脈を **明示 opt-in**（--github / DOCTOR_REQUIRE_GH=1）した
  ときのみ gh コマンド不在を FAIL（ADR-0004 訂正・既定 green を壊さない）。
- WARN (exit 0) = 未設定・オプション未導入（.env 無し / CONTEXT7_API_KEY 無し /
  key drift / gh 未認証・未導入（既定）/ OpenSpec engine 不在 / 既定パッケージ名のまま /
  Node 未導入 / Task・Git 不在 / skills symlink 壊れ / lock の blocked 在席）。
- INFO (exit 0) = TEMPLATE_VERSION 表示 / caveman hook 未登録 /
  テンプレ ADR・grill 残存。
- green = exit 0（FAIL ゼロ・WARN/INFO 許容）。作成直後・CI・オフラインで green。

到達性チェック（Context7 リモートを実際に叩く）は既定で行わず、--online 時のみ。
skill 利用不能のハードゲートは pytest（tests/test_skills_lock.py）。doctor は助言 WARN。

read-only 方針: 実 sync を行わない。lock の検査は `uv lock --check`、ツールの
呼び出し可否は `uv run --no-sync <tool> --version` で確認し、uv.lock を変更しない。
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tomllib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DISTRIBUTION_NAME = "ai-coding-template-ja"
SKILLS_LOCK = REPO_ROOT / ".agents" / "skills" / "skills.lock.json"
SYMLINK_ROOTS = (".claude/skills", ".codex/skills")


class Diagnostics:
    """診断結果を集計し、FAIL があれば exit 1 とする。"""

    def __init__(self) -> None:
        self.fail = 0
        self.warn = 0

    def ok(self, msg: str) -> None:
        print(f"[OK]   {msg}")

    def info(self, msg: str) -> None:
        print(f"[INFO] {msg}")

    def warn_(self, msg: str) -> None:
        self.warn += 1
        print(f"[WARN] {msg}")

    def fail_(self, msg: str) -> None:
        self.fail += 1
        print(f"[FAIL] {msg}")

    def exit_code(self) -> int:
        return 1 if self.fail else 0


def _run(cmd: list[str], timeout: int = 60) -> tuple[int, str]:
    """コマンドを read-only 前提で実行し (returncode, 出力) を返す。"""
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=REPO_ROOT,
            timeout=timeout,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return 1, str(exc)
    return proc.returncode, (proc.stdout + proc.stderr).strip()


def check_python(diag: Diagnostics) -> None:
    version_file = REPO_ROOT / ".python-version"
    running = f"{sys.version_info.major}.{sys.version_info.minor}"
    if not version_file.exists():
        diag.fail_(".python-version が存在しません")
        return
    pinned = version_file.read_text(encoding="utf-8").strip()
    pinned_majmin = ".".join(pinned.split(".")[:2])
    if running == pinned_majmin:
        diag.ok(
            f"Python {sys.version_info.major}.{sys.version_info.minor}"
            f".{sys.version_info.micro}（.python-version={pinned}）"
        )
    else:
        diag.fail_(
            f"Python バージョン不一致: 実行={running} / .python-version={pinned}。"
            " uv で 3.12 を用意してください"
        )


def check_uv(diag: Diagnostics) -> bool:
    if shutil.which("uv") is None:
        diag.fail_("uv が見つかりません。bootstrap.sh で導入してください")
        return False
    rc, out = _run(["uv", "--version"])
    if rc == 0:
        diag.ok(f"uv 利用可能（{out}）")
        return True
    diag.fail_(f"uv の呼び出しに失敗しました: {out}")
    return False


def check_venv(diag: Diagnostics) -> bool:
    if (REPO_ROOT / ".venv").is_dir():
        diag.ok("仮想環境 .venv が存在します")
        return True
    diag.fail_(".venv が存在しません。task setup を実行してください")
    return False


def check_pyproject_and_lock(diag: Diagnostics, uv_ok: bool) -> None:
    pyproject = REPO_ROOT / "pyproject.toml"
    if not pyproject.exists():
        diag.fail_("pyproject.toml が存在しません")
        return
    try:
        with pyproject.open("rb") as fh:
            data = tomllib.load(fh)
    except (OSError, tomllib.TOMLDecodeError) as exc:
        diag.fail_(f"pyproject.toml の解析に失敗しました: {exc}")
        return
    diag.ok("pyproject.toml を解析できました")

    project = data.get("project", {})
    name = project.get("name", "")
    if name == DEFAULT_DISTRIBUTION_NAME:
        diag.warn_(
            "パッケージ名がテンプレート既定のままです"
            f"（{DEFAULT_DISTRIBUTION_NAME}）。"
            "task rename -- <module> を実行してください"
        )
    else:
        diag.ok(f"パッケージ名は変更済みです（{name}）")

    lock = REPO_ROOT / "uv.lock"
    if not lock.exists():
        diag.fail_("uv.lock が存在しません。uv lock を実行してください")
        return
    if not uv_ok:
        diag.warn_("uv が無いため uv.lock の整合は未検証です")
        return
    rc, out = _run(["uv", "lock", "--check"])
    if rc == 0:
        diag.ok("uv.lock は pyproject.toml と整合しています")
    else:
        diag.fail_(f"uv.lock が pyproject.toml と不整合です（uv lock を再実行）: {out}")


def check_core_tools(diag: Diagnostics, uv_ok: bool, venv_ok: bool) -> None:
    if not (uv_ok and venv_ok):
        diag.warn_("uv / .venv が無いためコアツールの診断をスキップしました")
        return
    # FAIL 対象: ruff / basedpyright / pytest。pre-commit は WARN 対象。
    for tool in ("ruff", "basedpyright", "pytest"):
        rc, out = _run(["uv", "run", "--no-sync", tool, "--version"])
        if rc == 0:
            diag.ok(f"{tool} 利用可能（{out.splitlines()[0] if out else ''}）")
        else:
            diag.fail_(f"{tool} が呼べません: {out}")
    rc, out = _run(["uv", "run", "--no-sync", "pre-commit", "--version"])
    if rc == 0:
        diag.ok(f"pre-commit 利用可能（{out}）")
    else:
        diag.warn_("pre-commit が呼べません（task setup / task hooks で導入）")


def check_external_commands(diag: Diagnostics, require_gh: bool) -> None:
    for name, label in (("git", "Git"), ("task", "Task (go-task)")):
        if shutil.which(name) is not None:
            diag.ok(f"{label} 利用可能")
        else:
            diag.warn_(f"{label} が見つかりません")

    if all(shutil.which(c) is not None for c in ("node", "npm", "npx")):
        diag.ok("Node.js / npm / npx 利用可能")
    else:
        diag.warn_(
            "Node.js / npm / npx が未導入です（コアはリモート MCP 前提で Node 不要）"
        )

    check_gh(diag, require_gh)


def check_gh(diag: Diagnostics, require_gh: bool) -> None:
    """gh CLI 診断（ADR-0004 訂正版）。

    既定（require_gh=False）は未導入・未認証とも WARN（作成直後 green を保つ）。
    --github / DOCTOR_REQUIRE_GH=1 で明示 opt-in したときのみ、未導入を FAIL とし、
    未認証は WARN（手動ログイン案内）とする。
    """
    if shutil.which("gh") is None:
        if require_gh:
            diag.fail_(
                "gh が未導入です（GitHub ワークフロー文脈で必須）。"
                "導入してください: https://github.com/cli/cli"
            )
        else:
            diag.warn_(
                "gh が未導入です。GitHub read 操作のため導入を推奨"
                "（apt: gh 公式 apt repo）"
            )
        return
    rc, _ = _run(["gh", "auth", "status"])
    if rc == 0:
        diag.ok("gh 利用可能・認証済みです")
    else:
        diag.warn_("gh は導入済みですが未認証です（gh auth login / GH_TOKEN）")


def _read_env_key(key: str) -> str | None:
    """.env から key の値を読む（無ければ None）。前後空白・囲みクォートを除去。"""
    env_file = REPO_ROOT / ".env"
    if not env_file.exists():
        return None
    for line in env_file.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if stripped.startswith(f"{key}="):
            value = stripped[len(key) + 1 :].strip().strip("\"'")
            return value
    return None


def check_context7(diag: Diagnostics, online: bool) -> None:
    """Context7 MCP（コア MCP）の設定・key drift・（任意で）到達性を診断する。"""
    if not (REPO_ROOT / ".env").exists():
        diag.warn_(".env が存在しません。.env.example をコピーしてください")
    api_key = _read_env_key("CONTEXT7_API_KEY")
    if not api_key:
        diag.warn_(
            "CONTEXT7_API_KEY が未設定です（.env）。Context7 MCP を使う場合は設定し"
            " task mcp:setup を実行してください"
        )
    else:
        diag.ok("CONTEXT7_API_KEY が .env に設定されています")

    # template の存在
    for tpl in (".mcp.json.template", ".codex/config.toml.template"):
        if (REPO_ROOT / tpl).exists():
            diag.ok(f"{tpl} が存在します")
        else:
            diag.warn_(f"{tpl} が存在しません")

    _check_mcp_key_drift(diag, api_key)
    _check_codex_key_drift(diag, api_key)

    if online:
        _check_context7_reachability(diag, api_key)
    elif api_key:
        diag.info(
            "Context7 到達性チェックは未実施です（task doctor -- --online で実施）"
        )


def _check_mcp_key_drift(diag: Diagnostics, env_key: str | None) -> None:
    """生成済み .mcp.json の key が .env と一致するか（drift 検出）。"""
    mcp = REPO_ROOT / ".mcp.json"
    if not mcp.exists():
        return
    try:
        data = json.loads(mcp.read_text(encoding="utf-8"))
        live = data["mcpServers"]["context7"]["headers"]["CONTEXT7_API_KEY"]
    except (OSError, json.JSONDecodeError, KeyError, TypeError):
        diag.warn_(".mcp.json の解析に失敗しました（task mcp:setup で再生成）")
        return
    if env_key is not None and live != env_key:
        diag.warn_(
            ".mcp.json の CONTEXT7_API_KEY が .env と不一致です（drift）。"
            "task mcp:setup で再生成してください"
        )


def _check_codex_key_drift(diag: Diagnostics, env_key: str | None) -> None:
    """生成済み .codex/config.toml の key が .env と一致するか（drift 検出）。

    setup-mcp.sh は .mcp.json と .codex/config.toml の両方を生成し、Codex は TOML を
    参照する。TOML 側の drift も見落とさないよう個別に検査する。
    """
    config = REPO_ROOT / ".codex" / "config.toml"
    if not config.exists():
        return
    try:
        with config.open("rb") as fh:
            data = tomllib.load(fh)
        live = data["mcp_servers"]["context7"]["http_headers"]["CONTEXT7_API_KEY"]
    except (OSError, tomllib.TOMLDecodeError, KeyError, TypeError):
        diag.warn_(".codex/config.toml の解析に失敗しました（task mcp:setup で再生成）")
        return
    if env_key is not None and live != env_key:
        diag.warn_(
            ".codex/config.toml の CONTEXT7_API_KEY が .env と不一致です（drift）。"
            "task mcp:setup で再生成してください"
        )


def _check_context7_reachability(diag: Diagnostics, api_key: str | None) -> None:
    """--online 時のみ Context7 リモートへ到達確認（失敗は WARN・FAIL にしない）。"""
    if not api_key:
        diag.warn_("CONTEXT7_API_KEY 未設定のため到達性チェックをスキップしました")
        return
    import urllib.error
    import urllib.request

    req = urllib.request.Request(
        "https://mcp.context7.com/mcp",
        method="GET",
        headers={"CONTEXT7_API_KEY": api_key},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            diag.ok(f"Context7 へ到達できました（HTTP {resp.status}）")
    except urllib.error.HTTPError as exc:
        # 認証済みでもメソッド非対応等で 4xx を返し得る＝到達はできている。
        diag.ok(f"Context7 へ到達できました（HTTP {exc.code}）")
    except (urllib.error.URLError, OSError) as exc:
        diag.warn_(f"Context7 へ到達できませんでした: {exc}")


def _load_lock_skills(diag: Diagnostics) -> list[dict[str, object]] | None:
    if not SKILLS_LOCK.exists():
        diag.warn_("skills.lock.json が存在しません（vendored skill 未配置）")
        return None
    try:
        data = json.loads(SKILLS_LOCK.read_text(encoding="utf-8"))
        skills = data.get("skills", [])
    except (OSError, json.JSONDecodeError) as exc:
        diag.warn_(f"skills.lock.json の解析に失敗しました: {exc}")
        return None
    if not isinstance(skills, list):
        diag.warn_("skills.lock.json の skills が配列ではありません")
        return None
    return skills


def check_skills(diag: Diagnostics) -> None:
    """vendored skill の symlink 健全性を助言診断する（ハードゲートは pytest）。"""
    skills = _load_lock_skills(diag)
    if skills is None:
        return

    skills_dir = REPO_ROOT / ".agents" / "skills"
    broken = 0
    blocked_present = 0
    for entry in skills:
        name = str(entry.get("name", ""))
        redistribution = entry.get("redistribution")
        if redistribution == "blocked":
            if (skills_dir / name).is_dir():
                diag.warn_(
                    f"blocked skill が同梱されています: {name}（除外してください）"
                )
                blocked_present += 1
            continue
        for root in SYMLINK_ROOTS:
            link = REPO_ROOT / root / name
            if not (link.is_symlink() and (link / "SKILL.md").is_file()):
                diag.warn_(
                    f"{root}/{name} の symlink が壊れています（task skills:update）"
                )
                broken += 1
    if broken == 0 and blocked_present == 0:
        diag.ok(f"vendored skill は健全です（{len(skills)} 件・両 symlink 解決）")

    _check_caveman_hook(diag)


def _check_caveman_hook(diag: Diagnostics) -> None:
    """caveman の自動発火 hook が .claude/settings.json に登録済みか（INFO）。"""
    settings = REPO_ROOT / ".claude" / "settings.json"
    registered = False
    if settings.exists():
        try:
            registered = "caveman" in settings.read_text(encoding="utf-8")
        except OSError:
            registered = False
    if not registered:
        diag.info(
            "caveman の自動発火 hook は未登録です"
            "（任意・docs/optional/caveman-hook.md）"
        )


def check_openspec(diag: Diagnostics) -> None:
    """OpenSpec の初期構成と engine 可用性を診断する（engine 不在は WARN）。"""
    project = REPO_ROOT / "openspec" / "project.md"
    if project.exists():
        diag.ok("openspec/project.md が存在します")
    else:
        diag.warn_("openspec/project.md が存在しません")

    if shutil.which("openspec") is not None:
        diag.ok("OpenSpec engine（openspec）が利用可能です")
    else:
        diag.warn_(
            "OpenSpec engine（openspec）が未導入です。Markdown fallback で運用できます"
            "（docs/agents/workflow.md）。導入する場合は openspec init を各自で実行"
        )


def check_template_docs(diag: Diagnostics) -> None:
    """テンプレ自身のメタ文書（docs/template/）の残存を INFO 通知（任意 prune 可）。"""
    if (REPO_ROOT / "docs" / "template").is_dir():
        diag.info(
            "テンプレ ADR / grill が docs/template/ に残存しています"
            "（任意・task prune-template-docs で削除可）"
        )


def check_env_and_version(diag: Diagnostics) -> None:
    version_file = REPO_ROOT / "TEMPLATE_VERSION"
    if version_file.exists():
        version = version_file.read_text(encoding="utf-8").strip()
        diag.info(f"テンプレートバージョン v{version}")
    else:
        diag.warn_("TEMPLATE_VERSION が存在しません")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="環境診断（task doctor）")
    parser.add_argument(
        "--online",
        action="store_true",
        help="Context7 リモートの到達性を実際に確認する（既定は確認しない）",
    )
    parser.add_argument(
        "--github",
        action="store_true",
        help="GitHub ワークフロー文脈として gh 不在を FAIL 扱いにする（opt-in）",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    require_gh = args.github or os.environ.get("DOCTOR_REQUIRE_GH") == "1"

    diag = Diagnostics()
    print("=== 環境診断 (task doctor) ===")
    check_python(diag)
    uv_ok = check_uv(diag)
    venv_ok = check_venv(diag)
    check_pyproject_and_lock(diag, uv_ok)
    check_core_tools(diag, uv_ok, venv_ok)
    check_external_commands(diag, require_gh)
    check_context7(diag, args.online)
    check_skills(diag)
    check_openspec(diag)
    check_template_docs(diag)
    check_env_and_version(diag)
    print(f"--- 結果: FAIL={diag.fail} / WARN={diag.warn} ---")
    if diag.fail:
        print("機械コアに問題があります（FAIL を解消してください）。")
    else:
        print("green: 機械コアは正常です（FAIL ゼロ）。")
    return diag.exit_code()


if __name__ == "__main__":
    raise SystemExit(main())
