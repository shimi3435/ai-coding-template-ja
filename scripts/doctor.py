"""環境診断（task doctor）。機械コア（PR1）の診断のみ。

合否規約（§20・Q17）:
- FAIL (exit 1) = 機械コアが壊れている時のみ:
  Python バージョン不一致 / uv 不在 / .venv 不在 / pyproject・uv.lock 破損 /
  ruff・basedpyright・pytest が呼べない。
- WARN (exit 0) = 未設定・オプション未導入（.env 無し / 既定パッケージ名のまま /
  Node 未導入 / Task・Git 不在 / gh は PR1 常時 WARN）。
- INFO (exit 0) = TEMPLATE_VERSION 表示など通知。
- green = exit 0（FAIL ゼロ・WARN/INFO 許容）。作成直後・CI・オフラインで green。

read-only 方針: 実 sync を行わない。lock の検査は `uv lock --check`、ツールの
呼び出し可否は `uv run --no-sync <tool> --version` で確認し、uv.lock を変更しない。

PR1 スコープ外（PR2 で追加）: Context7 MCP 到達性 / CONTEXT7_API_KEY /
OpenSpec engine / Skills / .mcp.json・.codex 生成状況 / gh 認証の文脈 FAIL 判定。
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import tomllib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DISTRIBUTION_NAME = "ai-coding-template-ja"


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


def check_external_commands(diag: Diagnostics) -> None:
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

    # gh は PR1 では常に WARN（認証・文脈 FAIL 判定は PR2 で対応）。
    if shutil.which("gh") is not None:
        diag.warn_(
            "gh は導入済みですが、認証・文脈診断は PR2 で対応します（PR1 は WARN）"
        )
    else:
        diag.warn_(
            "gh が未導入です。GitHub read 操作のため導入を推奨（apt: gh 公式 apt repo）"
        )


def check_env_and_version(diag: Diagnostics) -> None:
    if (REPO_ROOT / ".env").exists():
        diag.ok(".env が存在します")
    else:
        diag.warn_(".env が存在しません。.env.example をコピーしてください")

    version_file = REPO_ROOT / "TEMPLATE_VERSION"
    if version_file.exists():
        version = version_file.read_text(encoding="utf-8").strip()
        diag.info(f"テンプレートバージョン v{version}")
    else:
        diag.warn_("TEMPLATE_VERSION が存在しません")


def main() -> int:
    diag = Diagnostics()
    print("=== 環境診断 (task doctor) ===")
    check_python(diag)
    uv_ok = check_uv(diag)
    venv_ok = check_venv(diag)
    check_pyproject_and_lock(diag, uv_ok)
    check_core_tools(diag, uv_ok, venv_ok)
    check_external_commands(diag)
    check_env_and_version(diag)
    print(f"--- 結果: FAIL={diag.fail} / WARN={diag.warn} ---")
    if diag.fail:
        print("機械コアに問題があります（FAIL を解消してください）。")
    else:
        print("green: 機械コアは正常です（FAIL ゼロ）。")
    return diag.exit_code()


if __name__ == "__main__":
    raise SystemExit(main())
