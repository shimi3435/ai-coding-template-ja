"""文書 token の復元、衝突、元位置の不変条件。実 parser を通す。"""

import importlib
import sys
from pathlib import Path

from hypothesis import given, settings
from hypothesis import strategies as st

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "repo-tools"))
shell = importlib.import_module("template_prune_shell")


def test_overlapping_placeholder_tokens_restore_quoted_literals() -> None:
    rows = shell.commands('printf "<a>" "<a_END>"', doc_kind="inline")
    assert [w.value for w in rows[0]] == ["printf", "<a>", "<a_END>"]
    assert all(w.literal for w in rows[0])


@settings(max_examples=30, deadline=None)
@given(
    suffix=st.text(
        alphabet="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-",
        max_size=20,
    ),
    newline=st.sampled_from(["\n", "\r\n"]),
    repeats=st.integers(min_value=1, max_value=4),
)
def test_placeholders_preserve_known_target_and_original_lines(
    suffix: str, newline: str, repeats: int
) -> None:
    name = "target_" + suffix
    source = (
        "echo 日本語"
        + newline
        + "task "
        + ("<" + name + ">") * repeats
        + " check:template"
        + newline
    )
    rows = shell.commands(source, doc_kind="bash")
    command = rows[1]
    assert command[0].value == "task" and command[-1].value == "check:template"
    assert command[0].literal and command[-1].literal
    assert not command[1].literal and command[1].opaque_kind == "placeholder"
    assert all((word.line, word.line_end) == (2, 2) for word in command)


def test_quoted_expression_restores_its_original_placeholder_text() -> None:
    rows = shell.commands('printf "foo(<x>)"', doc_kind="inline")
    assert rows[0][1].value == "foo(<x>)"
    assert rows[0][1].literal
