"""詳細回帰用corpusと、共通repository fixtureへの接続。"""

import importlib
import json
import sys
from pathlib import Path

from prune_corpus import validate_cases

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tests"))
common = importlib.import_module("downstream_repository_fixture")
ASSETS = common.ASSETS
KEPT = common.KEPT
inspect = common.inspect
plan = common.plan
git = common.git
commit_fixture = common.commit_fixture
copy_runtime = common.copy_runtime
CORPUS = "template-maintenance/fixtures/prune/references.json"
CASES = json.loads((ROOT / CORPUS).read_text())
validate_cases(CASES)


def fixture(root: Path, bundled=True) -> Path:
    common.fixture(root, bundled)
    if bundled:
        (root / CORPUS).write_text(json.dumps(CASES))
    return root
