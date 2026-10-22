"""固定構成、共有編集範囲、限定参照検査。Git の差分保護とは独立した read-only 判定。"""

from __future__ import annotations

import json
import os
import re
import stat
import subprocess
from pathlib import Path

from template_prune_json import value_positions
from template_prune_manifest import (
    DIRECTORIES,
    END,
    KEEP_DIRECTORIES,
    KEEP_FILES,
    MAINTENANCE_FILES,
    SHARED,
    START,
)
from template_prune_references import References
from template_prune_result import successful as successful
from template_prune_result import validate
from template_prune_shell import AnalysisError
from template_prune_workflow import inspect_workflow

TOOLS = Path(__file__).resolve().parent


def marker_edit(text: str) -> tuple[str, bool]:
    starts = [m.start() for m in re.finditer(re.escape(START), text)]
    ends = [m.start() for m in re.finditer(re.escape(END), text)]
    if not starts and not ends:
        return text, False
    if len(starts) != 1 or len(ends) != 1 or starts[0] >= ends[0]:
        raise ValueError("専用 marker pair が重複・欠落・逆順")
    a, b = starts[0], ends[0] + len(END)
    if text[b : b + 2] == "\r\n":
        b += 2
    elif text[b : b + 1] == "\n":
        b += 1
    return text[:a] + text[b:], True


def surface_for(path: str) -> str:
    if path == "Taskfile.yml":
        return "R01"
    if path == "package.json":
        return "R02"
    if path.startswith(".github/workflows/"):
        return "R03"
    if path.startswith("scripts/"):
        return "R04"
    if path.startswith(("repo-tools/", "tests/")):
        return "R05"
    return "R06"


def in_surface(path: str, surface: str) -> bool:
    p = Path(path)
    if surface == "R01":
        return path == "Taskfile.yml"
    if surface == "R02":
        return path == "package.json"
    if surface == "R03":
        return p.parent.as_posix() == ".github/workflows" and p.suffix in (
            ".yaml",
            ".yml",
        )
    if surface == "R04":
        return path.startswith("scripts/") and p.suffix in (".py", ".sh")
    if surface == "R05":
        return (
            path.startswith("repo-tools/")
            and p.suffix in (".ts", ".mjs")
            or path.startswith("tests/")
            and p.suffix == ".py"
        )
    return (
        path in ("README.md", "AGENTS.md", "CLAUDE.md", "CONTEXT.md", "docs/guide.md")
        or p.suffix == ".md"
        and path.startswith(("docs/agents/", "docs/reference/", "docs/optional/"))
        or len(p.parts) == 4
        and p.parts[:2] == (".agents", "skills")
        and p.name == "SKILL.md"
    )


def inspect(root: Path, node: str = "node") -> dict:
    root = Path(os.path.abspath(root))
    refs = References(root)
    issues = []
    edits = {}
    presence = []

    def issue(path: str, reason: str) -> None:
        issues.append(
            {"surface": surface_for(path), "source": path, "line": 1, "reason": reason}
        )

    def type_ok(path: str, directory: bool = False) -> bool:
        p = root / path
        try:
            if any(
                parent.is_symlink()
                for parent in (p, *p.parents)
                if parent != root and parent.is_relative_to(root)
            ):
                return False
            info = p.lstat()
            return (
                stat.S_ISDIR(info.st_mode)
                if directory
                else stat.S_ISREG(info.st_mode) and info.st_size > 0
            )
        except (FileNotFoundError, NotADirectoryError):
            return False

    for path in (*KEEP_FILES, *SHARED):
        if not type_ok(path):
            issue(path, "下流必須 regular file が欠落・空・誤型")
    for path in KEEP_DIRECTORIES:
        if not type_ok(path, True):
            issue(path, "下流必須 directory が欠落・誤型")
    for path in (*DIRECTORIES, *MAINTENANCE_FILES):
        presence.append(os.path.lexists(root / path))
    bundled_assets = all(type_ok(p, True) for p in DIRECTORIES) and all(
        type_ok(p) for p in MAINTENANCE_FILES
    )
    if any(presence) and not bundled_assets:
        for p in (*DIRECTORIES, *MAINTENANCE_FILES):
            if not type_ok(p, p in DIRECTORIES):
                issue(p, "保守必須資産が欠落・空・誤型")
    sources = {}

    def read(path: str) -> None:
        try:
            if not type_ok(path):
                raise ValueError("source が空・symlink・誤型")
            sources[path] = (root / path).read_bytes().decode("utf-8")
        except (OSError, ValueError) as exc:
            issue(path, str(exc))

    # 空の source は有効。必須資産の空だけは上で拒否する。
    def read_source(path: str) -> None:
        try:
            p = root / path
            if (
                p.is_symlink()
                or not p.is_file()
                or any(
                    x.is_symlink()
                    for x in p.parents
                    if x != root and x.is_relative_to(root)
                )
            ):
                raise ValueError("source symlink / type")
            sources[path] = p.read_bytes().decode("utf-8")
        except (OSError, ValueError) as exc:
            refs.analysis_error(
                AnalysisError(str(exc), "io"), surface_for(path), path, 1
            )

    for p in (
        "Taskfile.yml",
        "package.json",
        "README.md",
        "AGENTS.md",
        "CLAUDE.md",
        "CONTEXT.md",
        "docs/guide.md",
    ):
        if p in SHARED or p == "package.json" or os.path.lexists(root / p):
            read_source(p)
    for base in (
        ".github/workflows",
        "scripts",
        "repo-tools",
        "tests",
        "docs/agents",
        "docs/reference",
        "docs/optional",
        ".agents/skills",
    ):
        folder = root / base
        if folder.is_symlink():
            issue(base, "surface directory symlink")
            continue
        if not folder.exists():
            continue
        for directory, dirs, files in os.walk(
            folder,
            followlinks=False,
            onerror=lambda exc, base=base: issue(base, str(exc)),
        ):
            for d in list(dirs):
                if (Path(directory) / d).is_symlink():
                    issue(
                        str((Path(directory) / d).relative_to(root)),
                        "surface directory symlink",
                    )
                    dirs.remove(d)
            for filename in files:
                p = (Path(directory) / filename).relative_to(root).as_posix()
                surface = surface_for(p)
                if p == ".github/workflows/template-maintenance.yml":
                    continue
                if in_surface(p, surface):
                    read_source(p)
    marked = []
    for p in SHARED[1:]:
        if p in sources:
            try:
                edited, present = marker_edit(sources[p])
                marked.append(present)
                if present:
                    edits[p] = edited
                    start = sources[p].index(START)
                    end = start + len(sources[p]) - len(edited)
                    sources[p] = (
                        sources[p][:start]
                        + "\n" * sources[p][start:end].count("\n")
                        + sources[p][end:]
                    )
            except ValueError as exc:
                issue(p, str(exc))
                marked.append(False)
    try:
        version = (root / "TEMPLATE_VERSION").read_text()
        lines = [line for line in version.splitlines() if line.strip()]
        if len(lines) != 1 or not re.fullmatch(
            r"(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)", lines[0]
        ):
            raise ValueError("TEMPLATE_VERSION の単一行形式が不正")
    except (OSError, ValueError) as exc:
        issue("TEMPLATE_VERSION", str(exc))
    data = {
        "taskfile": sources.get("Taskfile.yml", ""),
        "workflows": {p: s for p, s in sources.items() if surface_for(p) == "R03"},
        "javascript": {
            p: s
            for p, s in sources.items()
            if surface_for(p) == "R05" and Path(p).suffix in (".ts", ".mjs")
        },
    }
    bridge = {}
    try:
        result = subprocess.run(
            [node, str(TOOLS / "template-prune-bridge.ts")],
            input=json.dumps(data),
            text=True,
            capture_output=True,
            cwd=root,
        )
        if result.returncode:
            raise ValueError(result.stderr)
        bridge = json.loads(result.stdout)
        if (
            not isinstance(bridge, dict)
            or any(
                not isinstance(bridge.get(k), dict) for k in ("workflows", "javascript")
            )
            or not isinstance(bridge.get("errors"), list)
        ):
            raise ValueError("parser bridge protocol が不正")
        if "taskfile" not in bridge and not any(
            e.get("path") == "Taskfile.yml" for e in bridge["errors"]
        ):
            raise ValueError("canonical Taskfile の解析結果がない")
        for error in bridge["errors"]:
            if error["path"] == "Taskfile.yml":
                issue(error["path"], error["reason"])
            else:
                refs.analysis_error(
                    AnalysisError(error["reason"], "syntax"),
                    surface_for(error["path"]),
                    error["path"],
                    1,
                )
    except (OSError, ValueError) as exc:
        raise ValueError("canonical parser bridge: " + str(exc)) from exc
    task_present = False
    if "taskfile" in bridge:
        taskdata = bridge["taskfile"]
        tasks = taskdata["data"]["tasks"]
        task_present = "check:template" in tasks
        if task_present:
            edit = taskdata["edit"]
            if edit is None:
                issue("Taskfile.yml", "専用 task の編集範囲が曖昧")
            else:
                # YAML offsets は JS UTF-16 code units。
                # Unicode を bytes / code points と混同しない。
                raw = sources["Taskfile.yml"].encode("utf-16-le")
                a, b = edit
                edits["Taskfile.yml"] = (raw[: 2 * a] + raw[2 * b :]).decode(
                    "utf-16-le"
                )
        for entry in taskdata["entries"]:
            if entry["task"] == "check:template":
                continue
            try:
                if entry["kind"] == "task":
                    refs.task(entry["value"], "R01", "Taskfile.yml", entry["line"])
                else:
                    with refs.located(
                        {
                            "line": entry["line"],
                            "position_kind": "field-value",
                            "field_path": entry["field_path"],
                        }
                    ):
                        refs.shell(entry["value"], "R01", "Taskfile.yml", entry["line"])
            except (OSError, ValueError) as exc:
                issue("Taskfile.yml", str(exc))
    for p, body in sources.items():
        surface = surface_for(p)
        try:
            if surface == "R02":
                package = json.loads(body)
                if not isinstance(package, dict):
                    raise ValueError("package.json は mapping が必要")
                scripts = package.get("scripts", {})
                if not isinstance(scripts, dict) or any(
                    not isinstance(v, str) for v in scripts.values()
                ):
                    raise ValueError("scripts は string mapping が必要")
                positions = value_positions(body)
                for name, command in scripts.items():
                    with refs.located(positions[("scripts", name)]):
                        refs.shell(command, surface, p, refs.position["line"])
            elif surface in ("R04", "R05"):
                if p.endswith(".py"):
                    refs.python(body, surface, p)
                elif p.endswith(".sh"):
                    refs.shell(body, surface, p)
                else:
                    for event in bridge.get("javascript", {}).get(p, []):
                        kind, value, line = event["kind"], event["value"], event["line"]
                        if kind == "path":
                            refs.path(value, surface, p, line)
                        elif kind == "import":
                            refs.path(
                                value,
                                surface,
                                p,
                                line,
                                str(Path(p).parent) if value.startswith(".") else ".",
                            )
                        elif kind == "shell":
                            with refs.located(
                                {
                                    "line": line,
                                    "line_end": event["line_end"],
                                    "position_kind": "statement-range",
                                }
                            ):
                                refs.shell(value, surface, p, line)
                        elif kind == "argv":
                            refs.argv(value, surface, p, line)
                            if (
                                len(value) > 2
                                and value[0] in ("sh", "bash")
                                and value[1] == "-c"
                                and value[2] is not None
                            ):
                                with refs.located(
                                    {
                                        "line": line,
                                        "line_end": event["line_end"],
                                        "position_kind": "statement-range",
                                    }
                                ):
                                    refs.shell(value[2], surface, p, line)
            elif surface == "R06":
                refs.markdown(body, p)
        except (OSError, ValueError, SyntaxError) as exc:
            refs.analysis_error(
                AnalysisError(str(exc), "syntax"),
                surface,
                p,
                getattr(exc, "lineno", 1) or 1,
            )
    for p, workflow in bridge.get("workflows", {}).items():
        try:
            inspect_workflow(refs, p, workflow, sources[p])
        except (ValueError, TypeError, AttributeError) as exc:
            refs.analysis_error(AnalysisError(str(exc), "position"), "R03", p, 1)
    flags = presence + [task_present, *marked]
    state = (
        "bundled"
        if bundled_assets and task_present and len(marked) == 2 and all(marked)
        else "pruned"
        if not any(flags)
        else "inconsistent"
    )
    if state == "inconsistent" and not issues:
        issue("Taskfile.yml", "保守資産 / 専用 task / 区画が部分構成")
    if issues or refs.detected:
        state = "inconsistent"
    return {
        "state": state,
        "coverage": "partial" if refs.partial or refs.errors else "evaluated",
        "analysis_errors": refs.errors,
        "references": refs.detected,
        "unevaluated": refs.partial,
        "errors": issues,
        "edits": edits,
    }


def report(result: dict, *, detailed: bool = True) -> list[str]:
    validate(result)
    names = {"bundled": "同梱", "pruned": "完全除去", "inconsistent": "不整合"}
    lines = [
        f"構成: {names[result['state']]} ({result['state']}); "
        f"coverage: {result['coverage']}"
    ]
    if result["unevaluated"]:
        lines.append(
            (
                "評価できた範囲に専用参照の検出なし。"
                if not result["references"] and not result["analysis_errors"]
                else "参照検出または解析失敗あり。"
            )
            + "未評価範囲あり（cwd / placeholder / 文書断片 / 解析失敗は各診断を参照）"
        )
        lines.append(
            f"未評価 {len(result['unevaluated'])} 件（partial 自体は FAIL ではない）。"
            "保証は R01〜R06 の列挙構文のみ。"
        )
    for key in ("errors", "analysis_errors", "references", "unevaluated"):
        if key == "unevaluated" and not detailed:
            continue
        for row in result[key]:
            if row["surface"] is None:
                lines.append(f"共通解析基盤・位置なし {row['source']}: {row['reason']}")
                continue
            position = {
                k: row[k]
                for k in (
                    "line_end",
                    "position_kind",
                    "field_path",
                    "alias_uses",
                    "shell_range",
                )
                if k in row
            }
            lines.append(
                f"{row['surface']} {json.dumps(row['source'], ensure_ascii=False)}"
                f":{row['line']}: {row.get('reason', row.get('target'))}"
                + (f" [{row['kind']}]" if "kind" in row else "")
                + (" " + json.dumps(position, ensure_ascii=False) if position else "")
            )
    return lines


if __name__ == "__main__":
    import sys

    try:
        result = inspect(
            Path(sys.argv[1]), sys.argv[2] if len(sys.argv) > 2 else "node"
        )
        print(json.dumps(result, ensure_ascii=False))
    except (OSError, ValueError) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False))
        sys.exit(1)
