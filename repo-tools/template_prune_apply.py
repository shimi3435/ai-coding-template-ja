"""固定 plan の再確認、共有編集、削除と途中失敗の診断。自動復元は行わない。"""

from __future__ import annotations

import json
import shlex
from pathlib import Path

from template_prune_manifest import DELETE_ROOTS, SHARED
from template_prune_plan import PruneError, inventory, plan, repository_head, tracked
from template_prune_result import successful
from template_prune_state import inspect, report


def apply(proposal: dict) -> dict:
    root: Path = proposal["root"]
    changed: list[str] = []
    operations = [
        (p, text.encode("utf-8")) for p, text in sorted(proposal["edits"].items())
    ]
    # 子を先に除去する postorder。各階層の sibling は相対 path 順に固定する。
    deletions = set(proposal["deletions"])

    def visit(path: str) -> None:
        for child in sorted(p for p in deletions if Path(p).parent.as_posix() == path):
            visit(child)
        operations.append((path, None))

    for path in sorted(DELETE_ROOTS):
        if path in deletions:
            visit(path)
    expected = dict(proposal["snapshot"])
    failed = "preflight"
    completed = 0
    state = proposal["state"]
    try:
        current = plan(root)
        if current["blockers"]:
            raise PruneError("; ".join(current["blockers"]))
        if current != proposal:
            raise PruneError("preview 後に入力が変化した")
        if state["state"] == "pruned":
            return {"ok": True, "changed": [], "state": state}
        initial_index = tracked(root, proposal["head"], index=True)
        for path, content in operations:
            failed = path
            if (
                inventory(root, edit_paths=proposal["edits"]) != expected
                or repository_head(root) != proposal["head"]
                or tracked(root, proposal["head"], index=True) != initial_index
            ):
                raise PruneError("書込み直前の対象 / HEAD / index が変化した")
            target = root / path
            mode, old = expected[path]
            if content is not None:
                target.write_bytes(content)
                expected[path] = (mode, content)
            else:
                if old is None:
                    target.rmdir()
                else:
                    target.unlink()
                del expected[path]
            changed.append(path)
            completed += 1
        failed = "postcheck"
        state = inspect(root)
        if not successful(state) or state["state"] != "pruned":
            raise PruneError("適用後の完全除去検査に失敗")
        return {"ok": True, "changed": changed, "state": state}
    except (OSError, ValueError, PruneError) as exc:
        # write が部分的に成功してから例外を返した場合も変更済みとして報告する。
        if failed in expected and failed not in changed:
            try:
                now = inventory(root, edit_paths=proposal["edits"])
                if now.get(failed) != expected[failed]:
                    changed.append(failed)
            except (OSError, PruneError):
                pass
        recovery = shlex.join(
            [
                "git",
                "restore",
                "--source=" + str(proposal["head"]),
                "--worktree",
                "--",
                *sorted((*DELETE_ROOTS, *SHARED)),
            ]
        )
        return {
            "ok": False,
            "changed": changed,
            "failed": failed,
            "pending": [p for p, _ in operations[completed:]],
            "head": proposal["head"],
            "error": str(exc),
            "state": state,
            "recovery": recovery,
        }


def failure_report(result: dict) -> list[str]:
    try:
        diagnostics = report(result["state"])
    except ValueError as exc:
        diagnostics = ["解析診断 protocol failure: " + str(exc)]
    return [
        "[FAIL] " + result["error"],
        *diagnostics,
        "変更済み: " + json.dumps(result["changed"], ensure_ascii=False),
        "失敗箇所: " + json.dumps(result["failed"], ensure_ascii=False),
        "未処理: " + json.dumps(result["pending"], ensure_ascii=False),
        "開始時 HEAD: " + str(result["head"]),
        "差分を確認し、失敗後の作業を保護してから repository root で対象だけ復元:",
        result["recovery"],
    ]
