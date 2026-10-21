"""テンプレ固有メタ文書と保守資産の固定範囲 preview / apply。"""

from __future__ import annotations

import argparse
import difflib
import importlib
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "repo-tools"))

plan = importlib.import_module("template_prune_plan").plan
engine = importlib.import_module("template_prune_apply")
report = importlib.import_module("template_prune_state").report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="テンプレート保守資産を除去（既定は read-only preview）",
        allow_abbrev=False,
    )
    parser.add_argument("--apply", action="count", default=0, help="固定対象へ明示適用")
    args = parser.parse_args(argv)
    if args.apply > 1:
        parser.error("--apply の重複は許可しない")
    try:
        proposal = plan(REPO_ROOT)
        print("\n".join(report(proposal["state"])))
        for path in proposal["deletions"]:
            print("削除: " + json.dumps(path, ensure_ascii=False))
        for path, new in sorted(proposal["edits"].items()):
            old = (REPO_ROOT / path).read_bytes().decode("utf-8")
            print(
                "".join(
                    difflib.unified_diff(
                        old.splitlines(True),
                        new.splitlines(True),
                        fromfile=path,
                        tofile=path,
                    )
                ),
                end="",
            )
        print(
            "保持: docs/reference/ ・ docs/adr/ ・ TEMPLATE_VERSION ・ "
            "Skill / lock / legal / links ・通常 CI"
        )
        for blocker in proposal["blockers"]:
            print("[BLOCKER] " + blocker)
        if proposal["blockers"]:
            return 1
        if proposal["state"]["state"] == "pruned":
            print("no-op: 完全除去を read-only 確認")
            return 0
        if not args.apply:
            print("dry-run: 変更なし。適用は --apply")
            return 0
        result = engine.apply(proposal)
        if not result["ok"]:
            print("\n".join(engine.failure_report(result)))
            return 1
        print("\n".join(report(result["state"])))
        print("apply: 固定対象の完全除去を確認")
        return 0
    except (OSError, ValueError) as exc:
        print("[FAIL] " + str(exc))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
