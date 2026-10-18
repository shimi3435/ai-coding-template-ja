"""固定対象の read-only Git / filesystem preflight。

index 更新・一時 file 作成は行わない。
"""

from __future__ import annotations

import hashlib
import os
import stat
import subprocess
from pathlib import Path

from template_prune_manifest import DELETE_ROOTS, SHARED
from template_prune_result import successful
from template_prune_state import inspect


class PruneError(Exception):
    pass


def git(root: Path, *args: str) -> bytes:
    env = dict(os.environ)
    env["GIT_OPTIONAL_LOCKS"] = "0"
    result = subprocess.run(
        ["git", "-C", str(root), *args], env=env, capture_output=True
    )
    if result.returncode:
        raise PruneError(result.stderr.decode(errors="replace").strip())
    return result.stdout


def repository_head(root: Path) -> str:
    try:
        top = git(root, "rev-parse", "--show-toplevel").removesuffix(b"\n")
        if Path(os.fsdecode(top)).resolve() != root.resolve():
            raise PruneError("script root と Git top-level が一致しない")
        return git(root, "rev-parse", "--verify", "HEAD").decode().strip()
    except OSError as exc:
        raise PruneError("Git の差分保護未確認: " + str(exc)) from exc


def inventory(root: Path) -> dict[str, tuple[int, bytes | None]]:
    result = {}

    def visit(p: Path) -> None:
        relative = p.relative_to(root).as_posix()
        for parent in (p, *p.parents):
            if parent == root:
                break
            if parent.is_symlink():
                raise PruneError(f"{relative!r}: 対象 / 祖先 symlink")
        info = p.lstat()
        if not (stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode)):
            raise PruneError(f"{relative!r}: 特殊 file / symlink")
        if p.name == ".git":
            raise PruneError(f"{relative!r}: 入れ子 Git")
        result[relative] = (
            info.st_mode,
            p.read_bytes() if stat.S_ISREG(info.st_mode) else None,
        )
        if stat.S_ISDIR(info.st_mode):
            for child in sorted(p.iterdir()):
                visit(child)

    for name in (*DELETE_ROOTS, *SHARED):
        if os.path.lexists(root / name):
            visit(root / name)
    return result


def tracked(root: Path, head: str, *, index: bool) -> dict[str, tuple[str, str]]:
    rows = git(
        root,
        *(["ls-files", "--stage", "-z"] if index else ["ls-tree", "-rz", head]),
        "--",
        *DELETE_ROOTS,
        *SHARED,
    )
    result = {}
    for row in rows.split(b"\0"):
        if not row:
            continue
        meta, raw = row.split(b"\t", 1)
        items = meta.decode().split(" ")
        path = os.fsdecode(raw)
        if index:
            mode, oid, stage = items
            if stage != "0":
                raise PruneError(f"{path!r}: conflict")
        else:
            mode, kind, oid = items
        if mode not in ("100644", "100755"):
            raise PruneError(f"{path!r}: symlink / submodule / unsupported Git mode")
        result[path] = (mode, oid)
    return result


def protect(root: Path, head: str, snapshot: dict) -> None:
    index = tracked(root, head, index=True)
    committed = tracked(root, head, index=False)
    if index != committed:
        raise PruneError(
            "対象の HEAD / index が一致しない（staged / rename / conflict）"
        )
    working = {p: v for p, v in snapshot.items() if v[1] is not None}
    if set(working) != set(committed):
        raise PruneError("対象に未追跡 / ignored file または未コミット削除がある")
    algo = git(root, "rev-parse", "--show-object-format").decode().strip()
    for path, (mode, content) in working.items():
        expected_mode, oid = committed[path]
        actual_mode = "100755" if mode & 0o111 else "100644"
        digest = hashlib.new(
            algo, b"blob " + str(len(content)).encode() + b"\0" + content
        ).hexdigest()
        if actual_mode != expected_mode or digest != oid:
            raise PruneError(f"{path!r}: 対象の実体 / mode と HEAD が一致しない")


def plan(root: Path) -> dict:
    state = inspect(root)
    blockers = []
    head = None
    snapshot = {}
    try:
        head = repository_head(root)
    except (PruneError, OSError) as exc:
        blockers.append(str(exc))
    try:
        snapshot = inventory(root)
    except (PruneError, OSError) as exc:
        blockers.append(str(exc))
    if not successful(state):
        blockers.append("構成・参照・解析の検査に失敗。診断を確認して再試行する")
    if state["state"] == "bundled" and head is not None:
        try:
            protect(root, head, snapshot)
        except (PruneError, OSError) as exc:
            blockers.append(str(exc))
    deletions = sorted(
        p
        for p in snapshot
        if any(p == r or p.startswith(r + "/") for r in DELETE_ROOTS)
    )
    return {
        "root": root,
        "state": state,
        "blockers": blockers,
        "head": head,
        "snapshot": snapshot,
        "deletions": deletions,
        "edits": state["edits"],
    }
