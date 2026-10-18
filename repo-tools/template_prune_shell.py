"""固定 mvdan/sh AST に対する C 規則。shell source は実行しない。"""

from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass

from shell_parser_artifact import prepared_parser


class AnalysisError(ValueError):
    def __init__(self, reason: str, kind: str = "syntax"):
        super().__init__(reason)
        self.kind = kind
        self.offset: int | None = None
        self.line = 1


@dataclass
class Word:
    value: str
    literal: bool = True
    line: int = 1
    line_end: int = 1
    opaque_kind: str | None = None


_NODE_TYPES = frozenset(
    """File Lit SglQuoted DblQuoted CmdSubst ParamExp ArithmExp
ProcSubst ExtGlob BraceExp CallExpr Subshell Block IfClause WhileClause ForClause
WordIter CStyleLoop BinaryCmd FuncDecl ArithmCmd LetClause CaseClause CaseItem
TestClause DeclClause TimeClause CoprocClause UnaryArithm BinaryArithm ParenArithm
UnaryTest BinaryTest ParenTest ArrayExpr ArrayElem Redirect Stmt Word Assign Comment
""".split()
)


def validate_tree(tree: dict, size: int) -> None:
    def visit(value):
        if isinstance(value, list):
            for item in value:
                visit(item)
        elif isinstance(value, dict):
            if "Type" in value and (
                not isinstance(value["Type"], str) or value["Type"] not in _NODE_TYPES
            ):
                raise ValueError("unknown parser node Type")
            for key in ("Stmts", "Args", "Parts"):
                if key in value and not isinstance(value[key], list):
                    raise ValueError(f"parser {key} is not array")
            if value.get("Type") == "Lit" and not isinstance(value.get("Value"), str):
                raise ValueError("parser Lit Value is not string")
            for key in ("Pos", "End"):
                if key in value:
                    pos = value[key]
                    if (
                        not isinstance(pos, dict)
                        or type(pos.get("Offset")) is not int
                        or not 0 <= pos["Offset"] <= size
                    ):
                        raise AnalysisError(
                            "parser position outside source", "position"
                        )
                    if any(
                        type(pos.get(k)) is not int or pos[k] < 1
                        for k in ("Line", "Col")
                    ):
                        raise AnalysisError("parser line / column invalid", "position")
            if (
                "Pos" in value
                and "End" in value
                and value["Pos"]["Offset"] > value["End"]["Offset"]
            ):
                raise AnalysisError("parser range reversed", "position")
            for child in value.values():
                visit(child)

    visit(tree)


def parse(source: str) -> dict:
    try:
        binary = prepared_parser()
    except (OSError, ValueError) as exc:
        raise AnalysisError(str(exc), "dependency") from exc
    try:
        result = subprocess.run(
            [str(binary)], input=source.encode(), capture_output=True, timeout=30
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise AnalysisError(str(exc), "io") from exc
    if result.returncode:
        reason = result.stderr.decode("utf-8", errors="replace")
        error = AnalysisError(
            reason, "syntax" if result.returncode == 1 else "protocol"
        )
        if error.kind == "syntax":
            position = re.match(r"(\d+):(\d+):", reason)
            if position:
                line, col = map(int, position.groups())
                lines = source.encode().split(b"\n")
                if 1 <= line <= len(lines) and 1 <= col <= len(lines[line - 1]) + 1:
                    error.offset = sum(len(v) + 1 for v in lines[: line - 1]) + col - 1
                else:
                    error.kind = "position"
            else:
                error.kind = "protocol"
        raise error
    try:
        tree = json.loads(result.stdout)
        if not isinstance(tree, dict) or tree.get("Type") != "File":
            raise ValueError("parser root is not File")
        if not isinstance(tree.get("Stmts", []), list):
            raise ValueError("parser Stmts is not array")
        validate_tree(tree, len(source.encode()))
        return tree
    except AnalysisError:
        raise
    except (ValueError, UnicodeError) as exc:
        raise AnalysisError(str(exc), "protocol") from exc


def literal(node: dict, quoted=False) -> tuple[str, bool]:
    typ = node.get("Type")
    if typ == "Lit":
        pattern = r'\\([$`"\\\n])' if quoted else r"\\(.)"
        return re.sub(
            pattern, lambda m: "" if m[1] == "\n" else m[1], node["Value"], flags=re.S
        ), True
    if typ == "SglQuoted":
        return node.get("Value", ""), not node.get("Dollar", False)
    if typ == "DblQuoted" or "Parts" in node:
        parts = [
            literal(p, quoted or typ == "DblQuoted") for p in node.get("Parts", [])
        ]
        return "".join(v for v, _ in parts), all(
            ok for _, ok in parts
        ) and not node.get("Dollar", False)
    return "", False


def commands(
    source: str, *, validate=True, doc_kind: str | None = None
) -> list[list[Word]]:
    # Every executable shell uses the same strict parser, regardless of its container.
    from template_prune_document import prepare

    prepared = prepare(source, doc_kind)
    if prepared.classification == "data":
        return []
    if prepared.classification == "fragment":
        return [
            [
                Word(
                    "",
                    False,
                    line_end=max(1, len(source.rstrip().splitlines())),
                    opaque_kind="document-fragment",
                )
            ]
        ]

    def mapped_parse(document):
        try:
            return parse(document.text)
        except AnalysisError as exc:
            # Native stderr の列は変換後入力の位置なので公開しない。
            reason = re.sub(r"^\d+:\d+:\s*", "", str(exc))
            for token in sorted(prepared.marks, key=len, reverse=True):
                reason = reason.replace(token, prepared.marks[token])
            exc.args = (reason,)
            if exc.offset is not None:
                try:
                    exc.line = (
                        source.encode()[: document.offset(exc.offset)].count(b"\n") + 1
                    )
                except ValueError as mapping:
                    raise AnalysisError(str(mapping), "position") from mapping
            raise

    while True:
        try:
            tree = mapped_parse(prepared)
            break
        except AnalysisError as exc:
            if exc.kind != "syntax" or not (
                prepared.mask_placeholders([], exc.offset)
                or prepared.mask_expression(exc.offset)
            ):
                raise
    if doc_kind is not None:
        try:
            protected, literals = prepared.source_ranges(tree)
            if prepared.restore_protected(protected):
                tree = mapped_parse(prepared)
                protected, literals = prepared.source_ranges(tree)
            if prepared.mask_placeholders(protected, literals=literals):
                tree = mapped_parse(prepared)
        except (KeyError, TypeError, ValueError) as exc:
            if isinstance(exc, AnalysisError):
                raise
            raise AnalysisError(str(exc), "position") from exc
    expression_commands: set[int] = set()
    output = []
    original = source.encode()

    def visit(node, start, end):
        if isinstance(node, list):
            for child in node:
                visit(child, start, end)
            return
        if not isinstance(node, dict):
            return
        typ = node.get("Type")
        if (
            typ
            in (
                "CmdSubst",
                "ProcSubst",
                "ParamExp",
                "ArithmExp",
                "DblQuoted",
                "SglQuoted",
                "Lit",
                "Word",
            )
            or "Parts" in node
        ):
            return
        if typ == "CallExpr":
            argv = []
            args = list(node.get("Args", []))
            for arg in args:
                value, known, opaque = prepared.word(arg)
                argv.append(Word(value, known, start, end, opaque))
            while argv and argv[0].literal and argv[0].value in ("command", "exec"):
                argv.pop(0)
                args.pop(0)
            if argv:
                expression_commands.update(prepared.command_expressions(args[0]))
                if (
                    doc_kind not in (None, "sh", "bash", "shell")
                    and argv[0].literal
                    and argv[0].value.startswith("-")
                ):
                    argv[0].opaque_kind = "document-fragment"
                output.append(argv)
            return
        for key, value in node.items():
            if key not in ("Assigns", "Redirs", "Args", "Pos", "End"):
                visit(value, start, end)

    try:
        for statement in tree.get("Stmts", []):
            a = prepared.offset(statement["Pos"]["Offset"])
            b = prepared.offset(statement["End"]["Offset"])
            if not 0 <= a <= b <= len(original):
                raise ValueError("statement range outside source")
            start = original[:a].count(b"\n") + 1
            end = original[: max(a, b - 1)].count(b"\n") + 1
            visit(statement, start, end)
    except (KeyError, TypeError, ValueError) as exc:
        if isinstance(exc, AnalysisError):
            raise
        raise AnalysisError(str(exc), "position") from exc
    if prepared.expressions:
        mapped_parse(prepared.restore_expressions(expression_commands))
    if prepared.leading_operator:
        output.insert(0, [Word("", False, opaque_kind="document-fragment")])
    return output
