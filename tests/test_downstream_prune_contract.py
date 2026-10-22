"""corpusを配布しない下流の公開構成・参照安全性契約。"""

import pytest
from downstream_repository_fixture import fixture, inspect


def test_pruned_repository_does_not_require_regression_corpus(tmp_path):
    fixture(tmp_path, bundled=False)
    (tmp_path / "tests/fixtures/template_prune/references.json").unlink(missing_ok=True)
    result = inspect(tmp_path)
    assert result["state"] == "pruned", result
    assert not result["analysis_errors"]


@pytest.mark.parametrize(
    ("path", "source", "surface"),
    [
        (
            "Taskfile.yml",
            'version: "3"\ntasks:\n  build:\n    cmds:\n      - task check:template\n',
            "R01",
        ),
        ("package.json", '{"scripts":{"build":"task check:template"}}', "R02"),
        (
            ".github/workflows/build.yml",
            "jobs:\n  build:\n    steps:\n      - run: task check:template\n",
            "R03",
        ),
        ("scripts/build.sh", "task check:template\n", "R04"),
        ("tests/build.py", 'import os\nos.system("task check:template")\n', "R05"),
        ("README.md", "Run `task check:template`.\n", "R06"),
    ],
)
def test_pruned_repository_rejects_remaining_maintenance_references(
    tmp_path, path, source, surface
):
    fixture(tmp_path, bundled=False)
    target = tmp_path / path
    target.parent.mkdir(parents=True, exist_ok=True)
    if surface == "R01":
        source = (
            target.read_text() + "  build:\n    cmds:\n      - task check:template\n"
        )
    target.write_text(source)
    result = inspect(tmp_path)
    assert result["state"] == "inconsistent", result
    assert any(row["surface"] == surface for row in result["references"]), result


def test_pruned_repository_reports_shell_syntax_errors(tmp_path):
    fixture(tmp_path, bundled=False)
    (tmp_path / "scripts/broken.sh").write_text("if then\n")
    result = inspect(tmp_path)
    assert result["analysis_errors"], result
