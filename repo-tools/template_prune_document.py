"""R06 の入力分類と token/source 対応。shell の引用判定は AST が担う。"""

from __future__ import annotations

import ast
import hashlib
import json
import re
from dataclasses import dataclass, field

EXPRESSION = re.compile(
    r"\b[A-Za-z_][A-Za-z_0-9]*(?:\.[A-Za-z_][A-Za-z_0-9]*)*\([^();\n]*\)(?!\s*\{)"
)


@dataclass
class Prepared:
    text: str
    origins: list[int]
    classification: str = "shell"
    marks: dict[str, str] = field(default_factory=dict)
    expressions: dict[str, str] = field(default_factory=dict)
    leading_operator: bool = False
    expression_prefix: str | None = None
    placeholder_prefix: str | None = None

    def offset(self, value: int) -> int:
        if type(value) is not int or not 0 <= value < len(self.origins):
            raise ValueError("parser offset outside prepared source")
        return self.origins[value]

    def replace(self, pattern, callback):
        data = self.text.encode()
        chunks = []
        origins = []
        cursor = 0
        for match in pattern.finditer(self.text):
            a = len(self.text[: match.start()].encode())
            b = len(self.text[: match.end()].encode())
            replacement = callback(match)
            if replacement is None:
                continue
            token = replacement.encode()
            chunks.extend((data[cursor:a], token))
            origins.extend(self.origins[cursor:a])
            origins.extend([self.origins[a]] * len(token))
            cursor = b
        chunks.append(data[cursor:])
        origins.extend(self.origins[cursor:])
        self.text = b"".join(chunks).decode()
        self.origins = origins

    def source_ranges(
        self, tree: dict
    ) -> tuple[list[tuple[int, int]], list[tuple[int, int]]]:
        """保護範囲と未引用 literal の範囲を native AST だけから取得する。"""
        ranges = []
        literals = []

        def protect(node):
            ranges.append((node["Pos"]["Offset"], node["End"]["Offset"]))

        def visit(node, redirect=False):
            if isinstance(node, list):
                for child in node:
                    visit(child, redirect)
            elif isinstance(node, dict):
                if redirect and node.get("Op") in ("<<", "<<-"):
                    protect(node["Word"])
                    if "Hdoc" in node:
                        protect(node["Hdoc"])
                    return
                if node.get("Type") == "Lit":
                    literals.append((node["Pos"]["Offset"], node["End"]["Offset"]))
                    return
                if node.get("Type") == "SglQuoted":
                    protect(node)
                    return
                if node.get("Type") == "DblQuoted":
                    for part in node.get("Parts", []):
                        if part.get("Type") == "Lit":
                            protect(part)
                        else:
                            visit(part)
                    return
                for key, child in node.items():
                    visit(child, key == "Redirs")

        visit(tree)
        return ranges, literals

    def restore_protected(self, ranges: list[tuple[int, int]]) -> bool:
        if not self.marks:
            return False
        changed = False
        pattern = re.compile(
            "|".join(re.escape(t) for t in sorted(self.marks, key=len, reverse=True))
        )

        def restore(match):
            nonlocal changed
            offset = len(self.text[: match.start()].encode())
            if any(start <= offset < end for start, end in ranges):
                changed = True
                return self.marks[match[0]]
            return None

        self.replace(pattern, restore)
        return changed

    def mask_placeholders(
        self,
        ranges: list[tuple[int, int]],
        error_offset: int | None = None,
        literals: list[tuple[int, int]] | None = None,
    ) -> bool:
        if self.placeholder_prefix is None:
            return False
        changed = False

        def placeholder(match):
            nonlocal changed
            before = self.text[: match.start()]
            start, end = len(before.encode()), len(self.text[: match.end()].encode())
            if error_offset is not None and not start <= error_offset <= end:
                return None
            if any(start < b and end > a for a, b in ranges):
                return None
            # 空 heredoc の終端など、AST に literal がない領域は変更しない。
            if literals is not None and not any(
                start < b and end > a for a, b in literals
            ):
                return None
            if (len(before) - len(before.rstrip("\\"))) % 2:
                return None
            token = self.placeholder_prefix + "PLACEHOLDER_" + match[1] + "_END"
            self.marks[token] = match[0]
            changed = True
            return token

        self.replace(re.compile(r"<([A-Za-z_][A-Za-z0-9_-]*)>"), placeholder)
        return changed

    def mask_expression(self, error_offset: int | None) -> bool:
        """native parser が拒否した位置に限り、承認済みの式候補を仮置換する。"""
        if self.expression_prefix is None or error_offset is None:
            return False
        data = self.text.encode()
        candidate = None
        for match in EXPRESSION.finditer(self.text):
            start = len(self.text[: match.start()].encode())
            end = len(self.text[: match.end()].encode())
            if start <= error_offset <= end or (
                end < error_offset and not data[end:error_offset].strip()
            ):
                candidate = match
        if candidate is None:
            return False
        raw = candidate[0]
        original = raw
        if self.marks:
            pattern = re.compile(
                "|".join(
                    re.escape(t) for t in sorted(self.marks, key=len, reverse=True)
                )
            )
            original = pattern.sub(lambda m: self.marks[m[0]], original)
        token = self.expression_prefix + "EXPR_" + str(len(self.expressions)) + "_END"
        self.marks[token] = original
        self.expressions[token] = raw
        self.replace(
            EXPRESSION,
            lambda match: token if match.span() == candidate.span() else None,
        )
        return True

    def restore_expressions(self, commands: set[int]) -> Prepared:
        """承認できた command token 以外を元構文へ戻し、全領域を再検証する。"""
        result = Prepared(self.text, self.origins.copy())
        pattern = re.compile("|".join(re.escape(token) for token in self.expressions))
        result.replace(
            pattern,
            lambda match: (
                None
                if len(self.text[: match.start()].encode()) in commands
                else self.expressions[match[0]]
            ),
        )
        return result

    def command_expressions(self, node: dict) -> set[int]:
        """実 command の未引用 Lit にある式 token の byte offset だけを返す。"""
        if not self.expressions:
            return set()
        if node.get("Type") == "Lit":
            pattern = re.compile("|".join(re.escape(t) for t in self.expressions))
            value = node["Value"]
            return {
                node["Pos"]["Offset"] + len(value[: match.start()].encode())
                for match in pattern.finditer(value)
            }
        if node.get("Type") in (None, "Word"):
            return {
                offset
                for part in node.get("Parts", [])
                for offset in self.command_expressions(part)
            }
        return set()

    def word(self, node, quoted=False):
        from template_prune_shell import literal

        typ = node.get("Type")
        if typ == "DblQuoted" or "Parts" in node:
            parts = [
                self.word(p, quoted or typ == "DblQuoted")
                for p in node.get("Parts", [])
            ]
            return (
                "".join(p[0] for p in parts),
                all(p[1] for p in parts) and not node.get("Dollar", False),
                "document-fragment"
                if any(p[2] == "document-fragment" for p in parts)
                else next((p[2] for p in parts if p[2]), None),
            )
        value, known = literal(node, quoted)
        opaque = None
        if typ in ("Lit", "SglQuoted") and self.marks:
            pattern = re.compile(
                "|".join(
                    re.escape(token)
                    for token in sorted(self.marks, key=len, reverse=True)
                )
            )

            def restore(match):
                nonlocal known, opaque
                token = match[0]
                if quoted or typ == "SglQuoted":
                    return self.marks[token]
                known = False
                if token in self.expressions:
                    opaque = "document-fragment"
                elif opaque is None:
                    opaque = "placeholder"
                return token

            value = pattern.sub(restore, value)
        return value, known, opaque


def prepare(source: str, kind: str | None) -> Prepared:
    result = Prepared(source, list(range(len(source.encode()) + 1)))
    if kind is None:
        return result
    if kind == "inline":
        result.replace(re.compile(r"\r\n?|\n"), lambda match: " ")
        source = result.text
    weak = kind not in ("sh", "bash", "shell")
    if weak:
        if re.fullmatch(r"\s*<!--.*?-->\s*", source, re.S) or re.fullmatch(
            r"\s*printf\s+\[[^]\n]*\]\([^()\n]*\)\s*", source
        ):
            result.classification = "data"
            return result
        try:
            if isinstance(json.loads(source), (dict, list)):
                result.classification = "data"
                return result
        except ValueError:
            pass
        try:
            tree = ast.parse(source)
            if tree.body and all(
                isinstance(n, (ast.Assign, ast.AugAssign))
                or isinstance(n, ast.Expr)
                and isinstance(n.value, ast.Call)
                for n in tree.body
            ):
                result.classification = "fragment"
                return result
        except SyntaxError:
            pass
    prefix = "ISSUE51_P_" + hashlib.sha256(source.encode()).hexdigest() + "_"
    while prefix in source:
        prefix += "X"

    result.placeholder_prefix = prefix
    if weak:
        result.expression_prefix = prefix
        if re.match(r"\s*(?:\|\||&&|\|)(?![|&])", source):
            result.leading_operator = True
            result.text = ": " + result.text
            result.origins = [0, 0] + result.origins
    return result
