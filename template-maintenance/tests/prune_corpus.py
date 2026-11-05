"""保守用参照corpusのschema検証。payloadは実行しない。"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "repo-tools"))
from template_prune_state import in_surface


def validate_cases(value) -> None:
    if not isinstance(value, list) or not value:
        raise ValueError("参照corpus は空でない JSON 配列が必要")
    ids = set()
    pairs = set()
    for case in value:
        fields = ("id", "surface", "path", "source", "expected", "coverage")
        if not isinstance(case, dict) or any(
            not isinstance(case.get(k), str) for k in fields
        ):
            raise ValueError("参照corpus case field は string が必要")
        if not case["id"] or case["id"] in ids:
            raise ValueError("参照corpus id は空でなく重複しないこと")
        ids.add(case["id"])
        path = case["path"]
        surface = case["surface"]
        if (
            surface not in {f"R{i:02}" for i in range(1, 7)}
            or Path(path).is_absolute()
            or ".." in Path(path).parts
            or not path
        ):
            raise ValueError("参照corpus surface / path が不正")
        if not in_surface(path, surface):
            raise ValueError("参照corpus path が指定 surface 外")
        if case["expected"] not in (
            "detected",
            "not-detected",
            "invalid-syntax",
        ) or case["coverage"] not in ("evaluated", "partial", "not-run"):
            raise ValueError("参照corpus expected / coverage が不正")
        if (case["expected"] == "invalid-syntax") != (case["coverage"] == "not-run"):
            raise ValueError("参照corpus 構文違反は not-run が必要")
        pairs.add((surface, case["expected"]))
    if any(
        (f"R{i:02}", expected) not in pairs
        for i in range(1, 7)
        for expected in ("detected", "not-detected")
    ):
        raise ValueError("参照corpus 各 surface の検出・非検出例が必要")
