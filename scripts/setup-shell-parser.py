"""明示 setup 時に固定 shell parser を準備する。"""

import importlib
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "repo-tools"))

setup = importlib.import_module("shell_parser_setup").setup

if __name__ == "__main__":
    try:
        if len(sys.argv) != 1:
            raise ValueError("setup-shell-parser.py は引数を受け付けない")
        print("shell parser prepared: " + str(setup()))
    except Exception as exc:
        print("[FAIL] shell parser setup: " + str(exc), file=sys.stderr)
        sys.exit(1)
