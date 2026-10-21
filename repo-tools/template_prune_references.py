"""限定された C / P / M 参照と cwd coverage を構成状態とは別に収集する。"""

from __future__ import annotations

import ast
import os
import re
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import unquote, urlsplit

from template_prune_manifest import DELETE_ROOTS
from template_prune_shell import AnalysisError, Word, commands


def code_spans(text: str) -> Iterator[tuple[int, int, str]]:
    """開始 delimiter の escape parity と同長の backtick run を照合する。"""
    runs = list(re.finditer(r"`+", text))
    cursor = 0
    while cursor < len(runs):
        opening = runs[cursor]
        cursor += 1
        prefix = text[: opening.start()]
        escaped = (len(prefix) - len(prefix.rstrip("\\"))) % 2
        start = opening.start() + escaped
        width = opening.end() - start
        if not width:
            continue
        for index in range(cursor, len(runs)):
            closing = runs[index]
            if re.search(r"\n[ \t\r]*\n", text[opening.end() : closing.start()]):
                break
            if closing.end() - closing.start() == width:
                yield start, closing.end(), text[opening.end() : closing.start()]
                cursor = index + 1
                break


class References:
    def __init__(self, root: Path):
        self.root = root
        self.detected: list[dict] = []
        self.partial: list[dict] = []
        self.errors: list[dict] = []
        self.position: dict = {}

    @contextmanager
    def located(self, position: dict):
        previous = self.position
        self.position = position
        try:
            yield
        finally:
            self.position = previous

    def entry(self, surface: str, source: str, line: int, **details) -> dict:
        return {
            "surface": surface,
            "source": source,
            "line": line,
            **self.position,
            **details,
        }

    def path(
        self, target: str, surface: str, source: str, line: int, cwd: str | None = "."
    ) -> None:
        if not isinstance(target, str) or not target:
            return
        if not os.path.isabs(target):
            if cwd is None:
                return
            target = os.path.join(str(self.root), cwd, target)
        relative = os.path.relpath(os.path.normpath(target), self.root)
        if any(
            relative == p or (p != DELETE_ROOTS[2] and relative.startswith(p + "/"))
            for p in DELETE_ROOTS
        ):
            self.detected.append(self.entry(surface, source, line, target=relative))

    def task(self, name: str, surface: str, source: str, line: int) -> None:
        if name == "check:template":
            self.detected.append(self.entry(surface, source, line, target=name))

    def cwd(self, value, surface: str, source: str, line: int) -> str | None:
        reason = None
        if not isinstance(value, str) or not value or "$" in value or "{{" in value:
            reason = "cwd が literal path ではない"
        else:
            path = Path(os.path.normpath(os.path.join(self.root, value)))
            if not path.is_relative_to(self.root):
                reason = "cwd が repository 外"
            elif any(
                p.is_symlink()
                for p in (path, *path.parents)
                if p != self.root and p.is_relative_to(self.root)
            ):
                reason = "cwd の既知 symlink により字句解決を保証できない"
            else:
                return path.relative_to(self.root).as_posix()
        self.partial.append(
            self.entry(surface, source, line, kind="cwd", reason=reason)
        )
        return None

    def analysis_error(
        self, exc: AnalysisError, surface: str, source: str, line: int
    ) -> None:
        row = self.entry(
            surface, source, line + exc.line - 1, kind=exc.kind, reason=str(exc)
        )
        self.partial.append({**row, "kind": "analysis-error"})
        if exc.kind == "dependency":
            row = {
                "surface": None,
                "source": ".cache/shell-parser/current.json",
                "line": None,
                "kind": exc.kind,
                "reason": str(exc),
            }
        if row not in self.errors:
            self.errors.append(row)

    def shell(
        self,
        body: str,
        surface: str,
        source: str,
        line: int = 1,
        cwd: str | None = ".",
        validate: bool = True,
        doc_kind: str | None = None,
    ) -> None:
        try:
            parsed = commands(body, validate=validate, doc_kind=doc_kind)
        except AnalysisError as exc:
            self.analysis_error(exc, surface, source, line)
            return
        expanded = list(parsed)

        def nested(argv: list[Word]) -> None:
            if not argv or not argv[0].literal:
                return
            if Path(argv[0].value).name in ("bash", "sh"):
                for i, word in enumerate(argv[:-1]):
                    if word.literal and word.value == "-c" and argv[i + 1].literal:
                        try:
                            inner = commands(argv[i + 1].value, doc_kind=doc_kind)
                        except AnalysisError as exc:
                            position = self.position or {
                                "line": line + argv[0].line - 1,
                                "line_end": line + argv[0].line_end - 1,
                                "position_kind": "statement-range",
                            }
                            with self.located(
                                {
                                    **position,
                                    "shell_range": {
                                        "line": exc.line,
                                        "line_end": exc.line,
                                    },
                                }
                            ):
                                self.analysis_error(exc, surface, source, line)
                            return
                        for child in inner:
                            for item in child:
                                item.line = argv[0].line
                                item.line_end = argv[0].line_end
                            expanded.append(child)
                            nested(child)
                        break

        for argv in parsed:
            nested(argv)
        moves = [
            argv[0]
            for argv in expanded
            if argv and argv[0].literal and argv[0].value in ("cd", "pushd", "popd")
        ]
        if moves:
            cwd = None
            self.partial.append(
                self.entry(
                    surface,
                    source,
                    line + moves[0].line - 1,
                    kind="cwd",
                    reason=(
                        "shell 単位内の cd / pushd / popd により cwd 依存参照は未評価"
                    ),
                )
            )
        for argv in expanded:
            statement = {
                "line": line + argv[0].line - 1,
                "line_end": line + argv[0].line_end - 1,
                "position_kind": "statement-range",
            }
            if self.position:
                statement = {
                    **self.position,
                    "shell_range": {"line": argv[0].line, "line_end": argv[0].line_end},
                }
            with self.located(statement):
                for kind in sorted({w.opaque_kind for w in argv if w.opaque_kind}):
                    self.partial.append(
                        self.entry(
                            surface,
                            source,
                            line,
                            kind=kind,
                            reason="未引用 placeholder の値は未評価"
                            if kind == "placeholder"
                            else "承認済みの文書断片は shell コマンドとして未評価",
                        )
                    )
                self.argv(
                    [w.value if w.literal else None for w in argv],
                    surface,
                    source,
                    line,
                    cwd,
                )

    def argv(
        self,
        argv: list[str | None],
        surface: str,
        source: str,
        line: int,
        cwd: str | None = ".",
    ) -> None:
        if not argv or argv[0] is None:
            return
        executable = Path(argv[0]).name
        if executable == "task":
            for value in argv[1:]:
                if value is not None:
                    self.task(value, surface, source, line)
        self.path(argv[0], surface, source, line, cwd)
        if executable not in (
            "sh",
            "bash",
            "python",
            "python3",
            "python3.14",
            "node",
            "pytest",
            "uv",
        ):
            return
        skip_next = False
        for value in argv[1:]:
            if skip_next:
                skip_next = False
                continue
            if value in ("-c", "-e", "--eval", "--print", "-p"):
                skip_next = True
                continue
            if value is not None:
                self.path(value, surface, source, line, cwd)

    def python(self, body: str, surface: str, source: str) -> None:
        tree = ast.parse(body, filename=source)
        aliases: dict[str, str] = {}
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for a in node.names:
                    aliases[a.asname or a.name.split(".")[0]] = (
                        a.name if a.asname else a.name.split(".")[0]
                    )
                    self.path(a.name.replace(".", "/"), surface, source, node.lineno)
            if isinstance(node, ast.ImportFrom):
                base = Path(source).parent
                for _ in range(max(0, node.level - 1)):
                    base = base.parent
                prefix = (base.as_posix() + "/" if node.level else "") + (
                    node.module or ""
                ).replace(".", "/")
                self.path(prefix, surface, source, node.lineno)
                for a in node.names:
                    aliases[a.asname or a.name] = (
                        node.module + "." if node.module else ""
                    ) + a.name
                    self.path(prefix + "/" + a.name, surface, source, node.lineno)

        def name(n: ast.AST) -> str:
            if isinstance(n, ast.Name):
                return aliases.get(n.id, n.id)
            if isinstance(n, ast.Attribute):
                return name(n.value) + "." + n.attr
            return ""

        def path(n: ast.AST | None) -> str | None:
            if isinstance(n, ast.Constant) and isinstance(n.value, str):
                return n.value
            if isinstance(n, ast.Name) and n.id in (
                "ROOT",
                "REPO_ROOT",
                "repositoryRoot",
            ):
                return str(self.root)
            if isinstance(n, ast.BinOp) and isinstance(n.op, ast.Div):
                left, right = path(n.left), path(n.right)
                if left is not None and right is not None:
                    return os.path.join(left, right)
            if isinstance(n, ast.Call) and name(n.func) in (
                "Path",
                "PurePath",
                "pathlib.Path",
                "pathlib.PurePath",
                "os.path.join",
            ):
                values = [path(arg) for arg in n.args]
                if values and all(v is not None for v in values):
                    return os.path.join(*values)
            return None

        def first(n: ast.Call, keyword: str) -> ast.AST | None:
            return (
                n.args[0]
                if n.args
                else next((k.value for k in n.keywords if k.arg == keyword), None)
            )

        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            callee = name(node.func)
            line = node.lineno
            arg = first(node, "args")
            if callee == "importlib.import_module":
                v = path(first(node, "name"))
                if v:
                    self.path(v.replace(".", "/"), surface, source, line)
            elif callee == "importlib.util.spec_from_file_location":
                v = path(
                    node.args[1]
                    if len(node.args) > 1
                    else next(
                        (k.value for k in node.keywords if k.arg == "location"), None
                    )
                )
                if v:
                    self.path(v, surface, source, line)
            elif callee in ("open", "io.open"):
                mode = (
                    path(node.args[1])
                    if len(node.args) > 1
                    else next(
                        (path(k.value) for k in node.keywords if k.arg == "mode"), "r"
                    )
                )
                if mode is not None and not ("+" in mode or "r" in mode):
                    continue
                v = path(first(node, "file"))
                if v:
                    self.path(v, surface, source, line)
            elif isinstance(node.func, ast.Attribute) and node.func.attr in (
                "read_text",
                "read_bytes",
            ):
                v = path(node.func.value)
                if v:
                    self.path(v, surface, source, line)
            elif callee in (
                "subprocess.run",
                "subprocess.Popen",
                "subprocess.call",
                "subprocess.check_call",
                "subprocess.check_output",
            ):
                if isinstance(arg, (ast.List, ast.Tuple)):
                    argv = [
                        x.value
                        if isinstance(x, ast.Constant) and isinstance(x.value, str)
                        else None
                        for x in arg.elts
                    ]
                    self.argv(argv, surface, source, line)
                    if (
                        len(argv) > 2
                        and argv[0] in ("sh", "bash")
                        and argv[1] == "-c"
                        and argv[2] is not None
                    ):
                        with self.located(
                            {
                                "line": node.lineno,
                                "line_end": node.end_lineno,
                                "position_kind": "statement-range",
                            }
                        ):
                            self.shell(argv[2], surface, source, line)
                elif (
                    isinstance(arg, ast.Constant)
                    and isinstance(arg.value, str)
                    and any(
                        k.arg == "shell"
                        and isinstance(k.value, ast.Constant)
                        and k.value.value is True
                        for k in node.keywords
                    )
                ):
                    with self.located(
                        {
                            "line": node.lineno,
                            "line_end": node.end_lineno,
                            "position_kind": "statement-range",
                        }
                    ):
                        self.shell(arg.value, surface, source, line)
            elif (
                callee == "os.system"
                and isinstance(arg, ast.Constant)
                and isinstance(arg.value, str)
            ):
                with self.located(
                    {
                        "line": node.lineno,
                        "line_end": node.end_lineno,
                        "position_kind": "statement-range",
                    }
                ):
                    self.shell(arg.value, surface, source, line)

    def markdown(self, body: str, source: str) -> None:
        surface = "R06"
        comment = False
        code_end = 0

        def mask_comments(line: str, line_offset: int) -> str:
            nonlocal comment, code_end
            result = list(line)
            offset = 0
            while offset < len(line):
                absolute = line_offset + offset
                if not comment and absolute < code_end:
                    offset = min(len(line), code_end - line_offset)
                    continue
                if not comment and line[offset] == "`":
                    prefix = body[:absolute]
                    if (len(prefix) - len(prefix.rstrip("\\"))) % 2:
                        offset += 1
                        continue
                    remaining = body[absolute:]
                    # code span は次の block fence を越えて閉じない。
                    boundary = re.search(r"\n {0,3}(?:`{3,}|~{3,})", remaining)
                    if boundary:
                        remaining = remaining[: boundary.start()]
                    span = next(code_spans(remaining), None)
                    if span is not None and span[0] == 0:
                        code_end = absolute + span[1]
                        continue
                if not comment and line.startswith("<!--", offset):
                    comment = True
                if comment:
                    end = offset + 3 if line.startswith("-->", offset) else offset + 1
                    if end == offset + 3:
                        comment = False
                    for index in range(offset, min(end, len(line))):
                        if result[index] not in "\r\n":
                            result[index] = " "
                    offset = end
                else:
                    offset += 1
            return "".join(result)

        prose = []
        fence = None
        lines = []
        begin = 1
        info = ""
        source_offset = 0
        quote_depth = 0
        for n, line in enumerate(body.splitlines(keepends=True), 1):
            line_offset = source_offset
            source_offset += len(line)
            if fence is None:
                line = mask_comments(line, line_offset)
                quote = re.match(r"^ {0,3}(?:> ?)+", line)
                quote_depth = quote[0].count(">") if quote else 0
            if quote_depth:
                line = re.sub(r"^ {0,3}(?:> ?){" + str(quote_depth) + r"}", "", line)
            match = re.match(r"^\s{0,3}(`{3,}|~{3,})(.*)$", line)
            if (
                match
                and fence is not None
                and not (
                    match[1][0] == fence[0]
                    and len(match[1]) >= len(fence)
                    and not match[2].strip()
                )
            ):
                lines.append(line)
                prose.append("\n")
                continue
            if match:
                if fence is None:
                    fence = match[1]
                    info = match[2].strip().split(" ")[0]
                    begin = n + 1
                    lines = []
                elif (
                    match[1][0] == fence[0]
                    and len(match[1]) >= len(fence)
                    and not match[2].strip()
                ):
                    if info in ("", "sh", "bash", "shell", "console"):
                        command = "".join(lines)
                        if info == "console":
                            command = re.sub(r"^\$ ", "", command, flags=re.M)
                        self.shell(
                            command,
                            surface,
                            source,
                            begin,
                            validate=False,
                            doc_kind=info,
                        )
                    fence = None
                prose.append("\n")
                continue
            if fence:
                lines.append(line)
                prose.append("\n")
            else:
                prose.append(line)
        if fence:
            raise ValueError("閉じていない Markdown fence")
        body = "".join(prose)
        spans = list(code_spans(body))
        for start, _, code in spans:
            if not re.search(r"\s", code):
                continue
            self.shell(
                code,
                surface,
                source,
                body[:start].count("\n") + 1,
                validate=False,
                doc_kind="inline",
            )
        # code span 内の link 表記は説明データとして扱う。
        masked = list(body)
        for start, end, _ in spans:
            for offset in range(start, end):
                if masked[offset] not in "\r\n":
                    masked[offset] = " "
        body = "".join(masked)
        destinations = []
        openings = []
        destination_starts = []
        for match in re.finditer(r"[\[\]]", body):
            offset = match.start()
            preceding = body[:offset]
            if (len(preceding) - len(preceding.rstrip("\\"))) % 2:
                continue
            if match[0] == "[":
                openings.append(offset)
            elif openings:
                openings.pop()
                following = re.match(r"\(\s*", body[offset + 1 :])
                if following:
                    destination_starts.append(offset + 1 + following.end())
        for start in destination_starts:
            i = start
            depth = 0
            angle = body[start : start + 1] == "<"
            if angle:
                end = body.find(">", start + 1)
                if end >= 0:
                    destinations.append((start, body[start + 1 : end]))
                continue
            while i < len(body):
                if body[i] == "\\":
                    i += 2
                    continue
                if body[i] == "(":
                    depth += 1
                if body[i] == ")":
                    if depth == 0:
                        break
                    depth -= 1
                if body[i].isspace() and depth == 0:
                    break
                i += 1
            destinations.append((start, body[start:i]))
        for match in re.finditer(
            r"^\s{0,3}\[(?:\\.|[^\]])+\]:\s*(?:<([^>]+)>|((?:\\.|[^\s])+))", body, re.M
        ):
            destinations.append((match.start(), match[1] or match[2]))
        for offset, raw in destinations:
            raw = re.sub(r'\\([!"#$%&\'()*+,\-./:;<=>?@\[\\\]^_`{|}~])', r"\1", raw)
            url = urlsplit(raw)
            if url.scheme or url.netloc or not url.path:
                continue
            self.path(
                unquote(url.path),
                surface,
                source,
                body[:offset].count("\n") + 1,
                str(Path(source).parent),
            )
