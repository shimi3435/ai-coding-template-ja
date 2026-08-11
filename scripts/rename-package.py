"""パッケージ改名（task rename）。テンプレート負債の防止（§17・Q16）。

正面入力は module 名（識別子）。配布名は module.replace("_","-") で自動導出する。
既定は --dry-run（差分件数の表示のみ）。実適用は --apply。

走査対象（ホワイトリスト固定 ＋ src/tests の *.py glob）:
- pyproject.toml（[project].name=配布形 / hatch packages・pytest cov・
  coverage source=module 形）
- package.json / package-lock.json / README.md / CONTEXT.md / .github/workflows/ci.yml
- PR2 で追加されるファイル（openspec/project.md / AGENTS.md / CLAUDE.md /
  .codex/config.toml.template / .mcp.json.template）は存在時のみ処理
- src/**/*.py と tests/**/*.py の import/from・パス文字列

上記固定ファイル以外は走査しない: scripts/（doctor.py の既定名検出センチネルを
書き換えないため）/
repo 名 / GitHub remote / Actions secret 名（§17 で対象外と明記）。

置換は module 形と配布形を別パターン・単語境界付きで行い、裸の "ja" 等を巻き込まない。
書き込み前にパス衝突を preflight し、衝突時は変更ゼロで abort する。
適用後は `uv sync`（lock refresh ＋ editable を新名へ張り直し。--locked は使わない）。
既定名が無ければ no-op で正常終了（冪等）。
"""

from __future__ import annotations

import argparse
import keyword
import re
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
OLD_MODULE = "ai_coding_template_ja"
OLD_DISTRIBUTION = "ai-coding-template-ja"

WHITELIST_FILES = [
    "pyproject.toml",
    "package.json",
    "package-lock.json",
    "README.md",
    "CONTEXT.md",
    ".github/workflows/ci.yml",
    # 以下は PR2 で追加されるファイル（存在時のみ処理）
    "openspec/project.md",
    "AGENTS.md",
    "CLAUDE.md",
    ".codex/config.toml.template",
    ".mcp.json.template",
]
PY_GLOBS = ["src/**/*.py", "tests/**/*.py"]


def derive_distribution_name(module: str) -> str:
    return module.replace("_", "-")


def validate_module(module: str) -> None:
    """無効な module 名なら abort（変更ゼロ）。PEP 8 逸脱は warning のみ。"""
    if not module.isidentifier() or keyword.iskeyword(module):
        raise SystemExit(
            f"エラー: '{module}' は有効な Python 識別子ではありません。変更しません。"
        )
    if not re.fullmatch(r"[a-z][a-z0-9_]*", module):
        print(
            f"[WARN] '{module}' は小文字＋アンダースコア（PEP 8）に従っていません。"
            "続行します。"
        )


def validate_distribution_name(distribution: str) -> None:
    """導出した配布名が PEP 503 として不正なら abort（変更ゼロ）。

    module 名は有効な識別子でも、先頭/末尾アンダースコアは "-foo" / "foo-" の
    ように先頭/末尾ハイフンの不正な配布名へ変換され、適用後の uv sync が失敗して
    リポジトリが半改名状態で壊れる。書き込み前にここで弾く。
    """
    # PEP 503: 先頭・末尾は英数字、内部のみ ._- を許す。
    if not re.fullmatch(r"[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?", distribution):
        raise SystemExit(
            f"エラー: 導出した配布名 '{distribution}' が不正です（PEP 503）。"
            " module 名は英小文字で始まり、先頭/末尾のアンダースコアを避けてください。"
            " 変更しません。"
        )


def collect_target_files() -> list[Path]:
    files: list[Path] = []
    for rel in WHITELIST_FILES:
        path = REPO_ROOT / rel
        if path.is_file():
            files.append(path)
    for pattern in PY_GLOBS:
        files.extend(sorted(REPO_ROOT.glob(pattern)))
    # 重複排除（順序維持）
    seen: set[Path] = set()
    unique: list[Path] = []
    for path in files:
        if path not in seen:
            seen.add(path)
            unique.append(path)
    return unique


def replace_text(text: str, new_module: str, new_distribution: str) -> tuple[str, int]:
    """module 形・配布形を単語境界付きで置換し、(新テキスト, 置換数) を返す。"""
    total = 0
    module_pattern = r"\b" + re.escape(OLD_MODULE) + r"\b"
    text, n_module = re.subn(module_pattern, new_module, text)
    total += n_module
    dist_pattern = r"\b" + re.escape(OLD_DISTRIBUTION) + r"\b"
    text, n_dist = re.subn(dist_pattern, new_distribution, text)
    total += n_dist
    return text, total


def preflight(new_module: str) -> None:
    """書き込み前のパス衝突検査。衝突時は変更ゼロで abort。"""
    new_src_dir = REPO_ROOT / "src" / new_module
    old_src_dir = REPO_ROOT / "src" / OLD_MODULE
    if new_module != OLD_MODULE and new_src_dir.exists():
        raise SystemExit(
            f"エラー: 改名先 {new_src_dir} が既に存在します。変更しません。"
        )
    if not old_src_dir.is_dir():
        # 旧パッケージが無い = 既に改名済みの可能性。内容置換のみ試みる。
        print(
            f"[INFO] {old_src_dir} が見つかりません（改名済みか）。"
            "ディレクトリ rename はスキップします。"
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="パッケージ改名（task rename）")
    parser.add_argument("module", help="新しい module 名（Python 識別子）")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="実適用する（既定は --dry-run で差分件数のみ表示）",
    )
    args = parser.parse_args()
    new_module: str = args.module
    apply: bool = args.apply

    validate_module(new_module)
    new_distribution = derive_distribution_name(new_module)
    # 書き込み前に配布名の妥当性を確認（半改名による破損を防ぐ）。
    validate_distribution_name(new_distribution)

    if new_module == OLD_MODULE:
        print(f"[INFO] 既定名 '{OLD_MODULE}' と同一です。何もしません（no-op）。")
        return 0

    preflight(new_module)

    print(f"module: {OLD_MODULE} -> {new_module}")
    print(f"配布名: {OLD_DISTRIBUTION} -> {new_distribution}")
    print("--- 置換対象 ---")

    pending: list[tuple[Path, str, int]] = []
    for path in collect_target_files():
        original = path.read_text(encoding="utf-8")
        replaced, count = replace_text(original, new_module, new_distribution)
        if count > 0:
            pending.append((path, replaced, count))
            rel = path.relative_to(REPO_ROOT)
            print(f"  {rel}: {count} 箇所")

    old_src_dir = REPO_ROOT / "src" / OLD_MODULE
    new_src_dir = REPO_ROOT / "src" / new_module
    will_rename_dir = old_src_dir.is_dir()
    if will_rename_dir:
        print(f"  ディレクトリ rename: src/{OLD_MODULE} -> src/{new_module}")

    if not pending and not will_rename_dir:
        print("[INFO] 置換箇所がありません（既に改名済み）。no-op で終了します。")
        return 0

    if not apply:
        print("\n--dry-run（適用せず）。適用するには --apply を付けてください。")
        return 0

    # --- 適用 ---
    for path, replaced, _ in pending:
        path.write_text(replaced, encoding="utf-8")
    if will_rename_dir:
        old_src_dir.rename(new_src_dir)
    print("置換を適用しました。")

    print("uv sync を実行します（editable を新名へ張り直し）...")
    result = subprocess.run(["uv", "sync"], cwd=REPO_ROOT)
    if result.returncode != 0:
        print(
            "[WARN] uv sync に失敗しました。fallback: "
            "`rm -rf .venv && uv sync` を手動で試してください。"
        )
        return result.returncode
    print("完了。task check で green を確認してください。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
