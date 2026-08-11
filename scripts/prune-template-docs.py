"""テンプレ固有メタ文書（docs/template/）を削除する（§19 / ADR-0006）。

下流の研究リポジトリでは、テンプレ固有メタ文書は不要なノイズになる。
このスクリプトは、それらを隔離した `docs/template/` を一括削除する。

安全規約:
- 削除対象は `docs/template/` に固定。他のパスは触らない。
- `docs/adr/`（下流用 ADR スキャフォルド）と `TEMPLATE_VERSION`（由来追跡）は不可侵。
- 既定は dry-run（削除予定の表示のみ）。実削除は --apply。
- `docs/template/` が無ければ no-op で正常終了（冪等）。
- 解決後のパスがリポジトリ外を指す場合は abort（安全装置）。
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
TARGET = REPO_ROOT / "docs" / "template"


def _assert_inside_repo(path: Path) -> None:
    """path がリポジトリ配下であることを検証（外なら abort）。"""
    resolved = path.resolve()
    if resolved == REPO_ROOT.resolve() or REPO_ROOT.resolve() not in resolved.parents:
        raise SystemExit(
            f"エラー: 削除対象 {resolved} がリポジトリ配下ではありません。中止します。"
        )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="docs/template/ を削除（task prune-template-docs）"
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="実削除する（既定は dry-run で対象表示のみ）",
    )
    args = parser.parse_args(argv)

    if not TARGET.exists():
        print("[INFO] docs/template/ は存在しません。何もしません（no-op）。")
        return 0

    _assert_inside_repo(TARGET)

    files = sorted(p for p in TARGET.rglob("*") if p.is_file())
    print(f"削除対象: {TARGET.relative_to(REPO_ROOT)}/（{len(files)} ファイル）")
    for f in files:
        print(f"  {f.relative_to(REPO_ROOT)}")
    print("不可侵: docs/adr/ ・ TEMPLATE_VERSION")

    if not args.apply:
        print("\n--dry-run（削除せず）。実削除するには --apply を付けてください。")
        return 0

    shutil.rmtree(TARGET)
    print("docs/template/ を削除しました。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
