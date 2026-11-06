"""文書内の説明placeholderとshellの境界を実parser・公開inspectで確認する。"""

import importlib
from pathlib import Path

import pytest
from template_prune_fixture import fixture, inspect

shell = importlib.import_module("template_prune_shell")


@pytest.mark.parametrize("bundled", [True, False])
def test_question_template_keeps_following_maintenance_reference(
    tmp_path: Path, bundled: bool
) -> None:
    fixture(tmp_path, bundled)
    (tmp_path / "docs/guide.md").write_text(
        "# 説明\n```\n"
        "❓ **Q1** - **<question title>**: "
        "<question body, might be multiple paragraphs, including multiple choices>\n"
        "\n➡️ <your recommended answer>\n\n---\n\n"
        "❓ **Q2** - **<question title>**: <question body (optional)>\n"
        "\n➡️ <your recommended answer>\n"
        "task check:template\n```\n"
    )

    result = inspect(tmp_path)

    assert not result["analysis_errors"]
    assert result["state"] == "inconsistent"
    assert result["coverage"] == "partial"
    assert any(row["kind"] == "placeholder" for row in result["unevaluated"])
    row = next(r for r in result["references"] if r["source"] == "docs/guide.md")
    assert (row["line"], row["line_end"]) == (12, 12)


@pytest.mark.parametrize("kind", ["inline", "", "console"])
@pytest.mark.parametrize("newline", ["\n", "\r\n"])
def test_phrase_placeholders_preserve_source_positions(kind: str, newline: str) -> None:
    source = (
        "echo 日本語"
        + newline
        + "task <target name, optional (v2)._x-y> check:template"
    )
    rows = shell.commands(source, doc_kind=kind)
    words = [word for row in rows for word in row]
    target = next(word for word in words if word.value == "check:template")
    assert target.literal
    assert (target.line, target.line_end) == ((1, 2) if kind == "inline" else (2, 2))
    assert sum(word.opaque_kind == "placeholder" for word in words) == 1
    assert shell.commands(source, doc_kind=kind) == rows


@pytest.mark.parametrize("kind", ["inline", "", "console"])
@pytest.mark.parametrize("phrase", ["a", "_", "a b", "_name 2", "a  b"])
def test_phrase_boundary_values(kind: str, phrase: str) -> None:
    rows = shell.commands("task <" + phrase + "> check:template", doc_kind=kind)
    assert rows[0][1].opaque_kind == "placeholder"
    assert rows[0][-1].value == "check:template" and rows[0][-1].literal


@pytest.mark.parametrize("kind", ["inline", "", "console"])
def test_phrase_quotation_escape_and_token_distinction(kind: str) -> None:
    rows = shell.commands(
        "printf \"<first name>\" '<second name>' \\<third\\ name\\> "
        "<first name> <second name> <first name>",
        doc_kind=kind,
    )
    assert [word.value for word in rows[0][:4]] == [
        "printf",
        "<first name>",
        "<second name>",
        "<third name>",
    ]
    assert all(word.literal for word in rows[0][:4])
    first, second, repeat = rows[0][4:]
    assert first.value != second.value and first.value == repeat.value
    assert all(word.opaque_kind == "placeholder" for word in (first, second, repeat))


@pytest.mark.parametrize("kind", [None, "sh", "bash", "shell"])
def test_explicit_shell_does_not_accept_phrase_placeholders(kind: str | None) -> None:
    with pytest.raises(shell.AnalysisError, match="must be followed by a word"):
        shell.commands("echo <question title>", doc_kind=kind)


@pytest.mark.parametrize("kind", ["inline", "", "console"])
@pytest.mark.parametrize(
    "phrase",
    [
        "",
        " question title",
        "question title ",
        "1 title",
        "入力 name",
        "question\ttitle",
        "question\ntitle",
        "question\r\ntitle",
        "question;title",
        "question|title",
        "question&title",
        "question$title",
        "question`title`",
        'question"title"',
        "question'title'",
        "question\\title",
    ],
)
def test_unsupported_phrase_remains_a_syntax_error(kind: str, phrase: str) -> None:
    with pytest.raises(shell.AnalysisError):
        shell.commands("echo <" + phrase + ">", doc_kind=kind)


@pytest.mark.parametrize("kind", ["inline", "", "console"])
def test_spaced_redirection_remains_a_redirection(kind: str) -> None:
    rows = shell.commands("cat < input > output", doc_kind=kind)
    assert [word.value for word in rows[0]] == ["cat"]
    assert all(word.opaque_kind is None for row in rows for word in row)


@pytest.mark.parametrize("kind", ["inline", "", "console", "sh"])
@pytest.mark.parametrize("name", ["in.txt", "a.", "in,name"])
def test_compact_redirection_remains_a_redirection(kind: str, name: str) -> None:
    rows = shell.commands("cat <" + name + ">out.txt", doc_kind=kind)
    assert [word.value for word in rows[0]] == ["cat"]
    assert all(word.opaque_kind is None for row in rows for word in row)


@pytest.mark.parametrize("kind", ["inline", "", "console"])
@pytest.mark.parametrize("name", ["input", "question title"])
def test_supported_placeholder_still_takes_precedence(kind: str, name: str) -> None:
    rows = shell.commands("cat <" + name + ">output", doc_kind=kind)
    assert any(word.opaque_kind == "placeholder" for row in rows for word in row)


@pytest.mark.parametrize("bundled", [True, False])
@pytest.mark.parametrize("kind", ["inline", "", "console"])
@pytest.mark.parametrize(
    ("source", "coverage"),
    [
        ("cat <in.txt>out.txt", "evaluated"),
        ("cat < input > output", "evaluated"),
        ("cat <input>output", "partial"),
        ("cat <question title>output", "partial"),
    ],
)
def test_redirection_and_placeholder_coverage(
    tmp_path: Path, bundled: bool, kind: str, source: str, coverage: str
) -> None:
    fixture(tmp_path, bundled)
    document = (
        "`" + source + "`\n"
        if kind == "inline"
        else "```" + kind + "\n" + source + "\n```\n"
    )
    (tmp_path / "docs/guide.md").write_text(document)

    result = inspect(tmp_path)

    assert not result["analysis_errors"]
    assert result["state"] == ("bundled" if bundled else "pruned")
    assert result["coverage"] == coverage
    if coverage == "evaluated":
        assert result["unevaluated"] == []
    else:
        assert any(row["kind"] == "placeholder" for row in result["unevaluated"])


@pytest.mark.parametrize("kind", ["inline", "", "console"])
def test_phrase_does_not_hide_following_shell_error(kind: str) -> None:
    with pytest.raises(shell.AnalysisError):
        shell.commands("echo <question title>; if then", doc_kind=kind)


@pytest.mark.parametrize("info", ["", "console"])
def test_shell_separator_cannot_be_hidden_inside_a_placeholder(
    tmp_path: Path, info: str
) -> None:
    fixture(tmp_path, False)
    (tmp_path / "docs/guide.md").write_text(
        "```" + info + "\necho <question; task check:template > output\n```\n"
    )
    result = inspect(tmp_path)
    assert not result["analysis_errors"]
    assert result["state"] == "inconsistent"
    assert any(r["source"] == "docs/guide.md" for r in result["references"])
