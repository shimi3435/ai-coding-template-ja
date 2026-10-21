"""構成状態と scanner coverage の独立性、および固定 manifest の公開判定。"""

import json
from pathlib import Path

import pytest
from template_prune_fixture import ASSETS, CASES, KEPT, fixture, inspect


@pytest.mark.parametrize("bundled", [True, False])
def test_complete_configuration(tmp_path: Path, bundled: bool) -> None:
    result = inspect(fixture(tmp_path, bundled))
    assert result["state"] == ("bundled" if bundled else "pruned"), result
    assert result["coverage"] == "evaluated"


@pytest.mark.parametrize("asset", ASSETS)
@pytest.mark.parametrize("damage", ["missing", "empty", "directory", "symlink"])
def test_every_fixed_maintenance_file_is_required(
    tmp_path: Path, asset: str, damage: str
) -> None:
    fixture(tmp_path)
    p = tmp_path / asset
    p.unlink()
    if damage == "empty":
        p.touch()
    elif damage == "directory":
        p.mkdir()
    elif damage == "symlink":
        p.symlink_to("missing-target")
    result = inspect(tmp_path)
    assert result["state"] == "inconsistent"
    assert any(e["source"] == asset for e in result["errors"])


@pytest.mark.parametrize("case", CASES, ids=lambda c: c["id"])
@pytest.mark.parametrize("bundled", [True, False])
def test_reference_surface_and_coverage(
    tmp_path: Path, case: dict, bundled: bool
) -> None:
    fixture(tmp_path, bundled)
    p = tmp_path / case["path"]
    p.parent.mkdir(parents=True, exist_ok=True)
    source = case["source"].replace("{{ROOT}}", str(tmp_path))
    if bundled and case["surface"] == "R01":
        source += "  check:template:\n    cmds:\n      - echo maintenance\n"
    p.write_text(source)
    result = inspect(tmp_path)
    errors = [
        e
        for e in result["errors"] + result["analysis_errors"]
        if e["source"] == case["path"]
    ]
    detected = [e for e in result["references"] if e["source"] == case["path"]]
    partial = [e for e in result["unevaluated"] if e["source"] == case["path"]]
    expected = (
        "invalid-syntax" if errors else "detected" if detected else "not-detected"
    )
    coverage = "not-run" if errors else "partial" if partial else "evaluated"
    assert (expected, coverage) == (case["expected"], case["coverage"]), result
    if expected == "not-detected":
        assert result["state"] == ("bundled" if bundled else "pruned"), result


@pytest.mark.parametrize("asset", KEPT)
@pytest.mark.parametrize("bundled", [True, False])
def test_retained_assets_are_required_in_both_states(
    tmp_path: Path, asset: str, bundled: bool
) -> None:
    fixture(tmp_path, bundled)
    (tmp_path / asset).unlink()
    assert inspect(tmp_path)["state"] == "inconsistent"


def test_fixture_contract_rejects_duplicate_id(tmp_path: Path) -> None:
    fixture(tmp_path)
    (tmp_path / KEPT[4]).write_text(json.dumps([CASES[0], CASES[0]]))
    assert inspect(tmp_path)["state"] == "inconsistent"


@pytest.mark.parametrize(
    "directory",
    [
        "docs/template",
        "docs/template/adr",
        "template-maintenance",
        "template-maintenance/tests",
        "docs/adr",
    ],
)
@pytest.mark.parametrize("damage", ["missing", "file", "symlink"])
def test_required_directory_wrong_type(
    tmp_path: Path, directory: str, damage: str
) -> None:
    import shutil

    fixture(tmp_path)
    shutil.rmtree(tmp_path / directory)
    if damage == "file":
        (tmp_path / directory).write_text("wrong type")
    elif damage == "symlink":
        (tmp_path / directory).symlink_to("missing")
    assert inspect(tmp_path)["state"] == "inconsistent"


@pytest.mark.parametrize("shared", ["README.md", "docs/agents/workflow.md"])
@pytest.mark.parametrize("damage", ["duplicate", "half", "reversed"])
def test_shared_markers_are_unambiguous(
    tmp_path: Path, shared: str, damage: str
) -> None:
    fixture(tmp_path)
    p = tmp_path / shared
    s = p.read_text()
    if damage == "duplicate":
        s += s
    elif damage == "half":
        s = s.replace("<!-- template-maintenance:end -->", "")
    else:
        s = (
            s.replace("template-maintenance:start", "temporary")
            .replace("template-maintenance:end", "template-maintenance:start")
            .replace("temporary", "template-maintenance:end")
        )
    p.write_text(s)
    assert inspect(tmp_path)["state"] == "inconsistent"


def test_dynamic_cwd_still_detects_absolute_paths(tmp_path: Path) -> None:
    fixture(tmp_path, False)
    source = next(
        c["source"] for c in CASES if c["id"] == "shell-cwd-absolute"
    ).replace("{{ROOT}}", str(tmp_path))
    (tmp_path / "scripts/probe.sh").write_text(source)
    result = inspect(tmp_path)
    assert result["state"] == "inconsistent"
    assert result["coverage"] == "partial"
    assert result["references"][0]["surface"] == "R04"


def test_workflow_cwd_symlink_is_partial_and_missing_literal_is_evaluated(
    tmp_path: Path,
) -> None:
    fixture(tmp_path, False)
    case = next(c for c in CASES if c["id"] == "workflow-cwd-step")
    p = tmp_path / case["path"]
    p.parent.mkdir(exist_ok=True, parents=True)
    p.write_text(
        case["source"].replace(
            "working-directory: scripts", "working-directory: generated"
        )
    )
    assert inspect(tmp_path)["references"]
    (tmp_path / "generated").symlink_to("scripts", target_is_directory=True)
    result = inspect(tmp_path)
    assert result["state"] == "pruned", result
    assert result["coverage"] == "partial"


def test_marker_removal_keeps_original_reference_line_numbers(tmp_path: Path) -> None:
    fixture(tmp_path)
    p = tmp_path / "README.md"
    original = p.read_text()
    case = next(c for c in CASES if c["id"] == "markdown-64")
    p.write_text(original + case["source"])
    result = inspect(tmp_path)
    reference = next(r for r in result["references"] if r["source"] == "README.md")
    assert reference["line"] > original.count("\n")
