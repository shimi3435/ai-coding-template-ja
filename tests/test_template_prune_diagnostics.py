"""解析失敗・構成・診断位置を公開 inspect の出力で区別する。"""

import importlib
import json
from pathlib import Path

import pytest
from template_prune_fixture import fixture, inspect


@pytest.mark.parametrize("bundled", [True, False])
def test_shell_failure_preserves_configuration_and_other_units(
    tmp_path: Path, bundled: bool
) -> None:
    fixture(tmp_path, bundled)
    (tmp_path / "scripts/broken.sh").write_text("if then\n")
    result = inspect(tmp_path)
    assert result["state"] == ("bundled" if bundled else "pruned")
    assert result["analysis_errors"][0]["kind"] == "syntax"
    assert result["coverage"] == "partial"
    assert any(e["kind"] == "analysis-error" for e in result["unevaluated"])
    (tmp_path / "scripts/known.sh").write_text("task check:template\n")
    result = inspect(tmp_path)
    assert result["state"] == "inconsistent"
    assert result["analysis_errors"] and result["references"]


def test_workflow_definition_and_alias_positions(tmp_path: Path) -> None:
    fixture(tmp_path, False)
    path = tmp_path / ".github/workflows/check.yml"
    path.parent.mkdir(parents=True)
    path.write_text("""jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: task check:template
        run: &command task check:template
      - run: task check:template
      - run: *command
""")
    result = inspect(tmp_path)
    rows = [
        r for r in result["references"] if r["source"] == ".github/workflows/check.yml"
    ]
    assert [r["line"] for r in rows] == [6, 7, 6]
    assert [r["field_path"] for r in rows] == [
        ["jobs", "check", "steps", 0, "run"],
        ["jobs", "check", "steps", 1, "run"],
        ["jobs", "check", "steps", 2, "run"],
    ]
    assert rows[2]["alias_uses"] == [
        {
            "source": ".github/workflows/check.yml",
            "line": 8,
            "field_path": ["jobs", "check", "steps", 2, "run"],
        }
    ]
    assert all(r["shell_range"] == {"line": 1, "line_end": 1} for r in rows)


@pytest.mark.parametrize("newline", ["\n", "\r\n"])
@pytest.mark.parametrize(
    "body",
    [
        "echo 日本語\ntask <入力不可> check:template",
        "echo 日本語\ntask <target><target> check:template",
        'echo 日本語\nsh -c "task check:template"',
    ],
)
def test_statement_positions_use_original_document(
    tmp_path: Path, newline: str, body: str
) -> None:
    # Non-ASCII names remain outside the placeholder rule.
    fixture(tmp_path, False)
    source = "# 見出し\n```bash\n" + body + "\n```\n"
    (tmp_path / "docs/guide.md").write_bytes(source.replace("\n", newline).encode())
    result = inspect(tmp_path)
    if "<入力不可>" in body:
        assert not result[
            "references"
        ]  # This is a redirect, not a placeholder argument.
    else:
        row = next(r for r in result["references"] if r["source"] == "docs/guide.md")
        assert (row["line"], row["line_end"]) == (4, 4)
        assert row["position_kind"] == "statement-range"


def test_embedded_escaped_shell_reports_containing_source_range(tmp_path: Path) -> None:
    fixture(tmp_path, False)
    (tmp_path / "scripts/probe.py").write_text(
        'import os\n\nos.system("echo ready\\ntask check:template")\n'
    )
    result = inspect(tmp_path)
    row = next(r for r in result["references"] if r["source"] == "scripts/probe.py")
    assert (row["line"], row["line_end"]) == (3, 3)
    assert row["shell_range"] == {"line": 2, "line_end": 2}


def test_folded_workflow_uses_field_definition_not_decoded_line(tmp_path: Path) -> None:
    fixture(tmp_path, False)
    path = tmp_path / ".github/workflows/check.yml"
    path.parent.mkdir(parents=True)
    path.write_text("""jobs:
  check:
    steps:
      - run: >-
          echo ready;
          task check:template
""")
    result = inspect(tmp_path)
    row = next(
        r for r in result["references"] if r["source"] == ".github/workflows/check.yml"
    )
    assert row["line"] == 4
    assert row["shell_range"] == {"line": 1, "line_end": 1}


def test_shell_syntax_error_reports_original_line(tmp_path: Path) -> None:
    fixture(tmp_path, False)
    (tmp_path / "scripts/broken.sh").write_text("echo 日本語\necho ready\nif then\n")
    row = inspect(tmp_path)["analysis_errors"][0]
    assert row["source"] == "scripts/broken.sh" and row["line"] == 3


@pytest.mark.parametrize(
    ("body", "end", "inner_line"),
    [
        ('sh -c "if then"', 2, 1),
        ('sh -c "echo ready\nif then"', 3, 2),
        ('sh -c "echo rea\\\ndy; if then"', 3, 1),
        ("sh -c 'echo ready; sh -c \"if then\"'", 2, 1),
    ],
)
def test_nested_syntax_error_keeps_outer_source_range(
    tmp_path: Path, body: str, end: int, inner_line: int
) -> None:
    fixture(tmp_path, False)
    (tmp_path / "scripts/broken.sh").write_text("echo ready\n" + body + "\n")
    row = inspect(tmp_path)["analysis_errors"][0]
    assert (row["line"], row["line_end"]) == (2, end)
    assert row["position_kind"] == "statement-range"
    assert row["shell_range"] == {"line": inner_line, "line_end": inner_line}


@pytest.mark.parametrize(
    "case",
    json.loads(
        (Path(__file__).parent / "fixtures/template_prune/protocol.json").read_text()
    ),
    ids=lambda case: case["name"],
)
def test_shared_protocol_corpus(case: dict) -> None:
    validate = importlib.import_module("template_prune_result").validate
    if case["valid"]:
        validate(case["result"])
    else:
        with pytest.raises(ValueError):
            validate(case["result"])


def test_nested_error_keeps_embedded_call_range(tmp_path: Path) -> None:
    fixture(tmp_path, False)
    (tmp_path / "scripts/probe.py").write_text(
        'import os\n\nos.system("echo ready\\nsh -c \\"if then\\"")\n'
    )
    row = inspect(tmp_path)["analysis_errors"][0]
    assert row["source"] == "scripts/probe.py"
    assert (row["line"], row["line_end"]) == (3, 3)
    assert row["shell_range"] == {"line": 1, "line_end": 1}


def test_document_error_does_not_expose_transformed_positions(tmp_path: Path) -> None:
    fixture(tmp_path, False)
    (tmp_path / "docs/guide.md").write_text("```\nfoo(bar); x=$(foo(bar))\n```\n")
    row = inspect(tmp_path)["analysis_errors"][0]
    assert row["line"] == 2
    assert "ISSUE51_P_" not in row["reason"]
    assert not row["reason"].split(":", 1)[0].isdigit()
