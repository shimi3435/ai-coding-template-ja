"""C 規則の literal 単純コマンド解析。展開・呼出・cwd 遷移を実行しない。"""

from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass

_REDIRECTION = re.compile(
    "|".join(
        r"(?:\\\n)*".join(re.escape(char) for char in operator)
        for operator in (
            "&>>",
            "&>",
            "<<<",
            "<<-",
            "<<",
            ">>",
            "<>",
            ">&",
            "<&",
            ">|",
            ">",
            "<",
        )
    )
)


@dataclass
class Word:
    value: str
    literal: bool = True
    line: int = 1


def _expansion_end(source: str, i: int) -> int:
    """展開内部を評価せず、単純コマンドと header で同じ終端を使う。"""
    ch = source[i]
    if ch == "`":
        j = i + 1
        while j < len(source) and source[j] != "`":
            j += 2 if source[j] == "\\" else 1
        j = min(j + 1, len(source))
    elif source[i : i + 2] in ("$(", "${"):
        opening = source[i + 1]
        closing = ")" if opening == "(" else "}"
        if opening == "(" and source[i : i + 3] != "$((":
            # substitution の本文でも comment / payload の括弧や引用は構文ではない。
            # 停止位置を直接使い、同じ nested expansion を再走査しない。
            return (
                i + 2 + len(_mask_heredoc_payloads(source[i + 2 :], substitution=True))
            )
        depth = 1
        j = i + 2
        inner_quote = ""
        while j < len(source) and depth:
            c = source[j]
            if c == "\\" and inner_quote != "'":
                j += 2
                continue
            if c in "$`" and inner_quote != "'":
                j = _expansion_end(source, j)
                continue
            if c in "'\"":
                if inner_quote == c:
                    inner_quote = ""
                elif not inner_quote:
                    inner_quote = c
            elif not inner_quote:
                if c == opening == "(":
                    depth += 1
                elif c == closing:
                    depth -= 1
            j += 1
    else:
        match = re.match(r"\$[A-Za-z_][A-Za-z_0-9]*|\$[0-9@*#?$!-]", source[i:])
        j = i + (len(match[0]) if match else 1)
    return min(j, len(source))


def _heredoc_delimiter(source: str, offset: int) -> tuple[str, int, bool] | None:
    """展開せずに delimiter word の引用と継続行だけを除去する。"""
    quote = ""
    value = ""
    started = False
    quoted = False
    while offset < len(source):
        char = source[offset]
        if not started and char in " \t":
            offset += 1
            continue
        if char == "\\" and quote != "'" and offset + 1 < len(source):
            following = source[offset + 1]
            offset += 2
            if following != "\n":
                quoted = True
                if quote == '"' and following not in '$`"\\':
                    value += "\\"
                value += following
                started = True
            continue
        if char in "'\"" and (not quote or quote == char):
            quoted = True
            quote = "" if quote else char
            started = True
            offset += 1
            continue
        if not quote and char in " \t\r\n;&|<>()":
            break
        value += char
        started = True
        offset += 1
    return (value, offset, quoted) if started else None


def _mask_heredoc_payloads(source: str, *, substitution: bool = False) -> str:
    """header を物理行に分断せず読み、payload / comment の位置と改行を保って隠す。"""
    masked = list(source)
    pending: list[tuple[str, bool, bool]] = []
    quote = ""
    word_started = False
    depth = 1
    offset = 0
    while offset < len(source):
        char = source[offset]
        if char == "\\" and quote != "'":
            if source[offset + 1 : offset + 2] != "\n":
                word_started = True
            offset += 2
            continue
        if char in "'\"" and (not quote or quote == char):
            quote = "" if quote else char
            word_started = True
            offset += 1
            continue
        if quote != "'" and char in "$`":
            offset = _expansion_end(source, offset)
            word_started = True
            continue
        if not quote:
            if char == "#" and not word_started:
                end = source.find("\n", offset)
                end = len(source) if end < 0 else end
                masked[offset:end] = " " * (end - offset)
                offset = end
                continue
            operator = _REDIRECTION.match(source, offset)
            if operator is not None:
                kind = operator[0].replace("\\\n", "")
                offset = operator.end()
                word_started = False
                if kind in ("<<", "<<-"):
                    delimiter = _heredoc_delimiter(source, offset)
                    if delimiter is not None:
                        value, offset, quoted = delimiter
                        pending.append((value, kind == "<<-", quoted))
                        word_started = True
                continue
            if char == "\n" and pending:
                offset += 1
                for delimiter, tabs, quoted in pending:
                    logical_line = ""
                    while offset < len(source):
                        end = source.find("\n", offset)
                        end = len(source) if end < 0 else end + 1
                        line = source[offset:end]
                        for index in range(offset, end):
                            if masked[index] not in "\r\n":
                                masked[index] = " "
                        offset = end
                        content = line.rstrip("\r\n")
                        backslashes = len(content) - len(content.rstrip("\\"))
                        continued = (
                            not quoted and line.endswith("\n") and backslashes % 2
                        )
                        logical_line += content[:-1] if continued else content
                        if continued:
                            continue
                        # <<- の tab 除去は継続行を結合した後の行頭にだけ適用する。
                        if (
                            logical_line.lstrip("\t") if tabs else logical_line
                        ) == delimiter:
                            break
                        logical_line = ""
                pending.clear()
                word_started = False
                continue
            if substitution:
                if char == "(":
                    depth += 1
                elif char == ")":
                    depth -= 1
                    if not depth:
                        # 後続の sibling substitution は呼出元で一度だけ読む。
                        return "".join(masked[: offset + 1])
        # 継続行は word を切らず、引用済み空白も comment の開始境界にしない。
        word_started = bool(quote) or char not in " \t\r\n;&|()<>"
        offset += 1
    return "".join(masked)


def commands(source: str, *, validate: bool = True) -> list[list[Word]]:
    if validate:
        syntax_check = subprocess.run(
            ["bash", "-n"], input=source, text=True, capture_output=True
        )
        if syntax_check.returncode:
            raise ValueError(syntax_check.stderr.strip())
    source = _mask_heredoc_payloads(source)
    result: list[list[Word]] = []
    argv: list[Word] = []
    value = ""
    literal = True
    started = False
    plain_word = True
    redirect_operand = False
    line = 1
    word_line = 1
    quote = ""
    i = 0

    def word() -> None:
        nonlocal value, literal, started, plain_word, redirect_operand
        if started:
            if not redirect_operand:
                argv.append(Word(value, literal, word_line))
            redirect_operand = False
        value = ""
        literal = True
        started = False
        plain_word = True

    def command() -> None:
        nonlocal redirect_operand
        word()
        redirect_operand = False
        if argv:
            result.append(argv.copy())
            argv.clear()

    while i < len(source):
        ch = source[i]
        if not started:
            word_line = line
        if ch == "\\" and quote != "'":
            if i + 1 < len(source):
                following = source[i + 1]
                if following == "\n":
                    line += 1
                else:
                    plain_word = False
                    if quote == '"' and following not in '$`"\\':
                        value += "\\"
                    value += following
                    started = True
                i += 2
                continue
        if ch == "'" and quote != '"':
            plain_word = False
            quote = "" if quote else "'"
            started = True
            i += 1
            continue
        if ch == '"' and quote != "'":
            plain_word = False
            quote = "" if quote else '"'
            started = True
            i += 1
            continue
        if quote != "'" and ch in "$`":
            literal = False
            started = True
            # command substitution / parameter expansion の内部は検査しない。
            j = _expansion_end(source, i)
            value += source[i:j]
            line += source[i:j].count("\n")
            i = j
            continue
        if not quote and ch == "#" and not started:
            j = source.find("\n", i)
            i = len(source) if j < 0 else j
            continue
        redirection = None if quote else _REDIRECTION.match(source, i)
        if not quote and ch in ";&|(){}\n" and redirection is None:
            command()
            if ch == "\n":
                line += 1
            i += 1
            continue
        if not quote and ch.isspace():
            word()
            i += 1
            continue
        if redirection is not None:
            if (
                ch in "<>"
                and started
                and literal
                and plain_word
                and value.isascii()
                and value.isdecimal()
            ):
                value = ""
                started = False
            word()
            # operand も通常の word と同じ引用連結・展開境界で読み、argv には加えない。
            redirect_operand = True
            line += redirection[0].count("\n")
            i = redirection.end()
            continue
        value += ch
        started = True
        if ch == "\n":
            line += 1
        i += 1
    command()
    normalized = []
    for argv in result:
        while argv and (
            re.match(r"^[A-Za-z_][A-Za-z_0-9]*=", argv[0].value)
            or argv[0].value
            in ("command", "exec", "then", "do", "else", "if", "while", "until", "!")
        ):
            argv = argv[1:]
        if argv:
            normalized.append(argv)
    return normalized
