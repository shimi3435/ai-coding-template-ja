"""共通ケースでscannerの通常版契約を検証する。"""

import json
from pathlib import Path

import pytest
from template_prune_fixture import ROOT, fixture, inspect

CASES = json.loads((ROOT / "tests/fixtures/template_versions.json").read_text())


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["id"])
def test_template_version_shared_cases(tmp_path: Path, case: dict) -> None:
    fixture(tmp_path, bundled=False)
    (tmp_path / "TEMPLATE_VERSION").write_bytes(case["text"].encode("utf-8"))
    result = inspect(tmp_path)
    errors = [
        error for error in result["errors"] if error["source"] == "TEMPLATE_VERSION"
    ]
    assert (not errors) == case["valid"], (case, errors)
    assert result["state"] == ("pruned" if case["valid"] else "inconsistent")
