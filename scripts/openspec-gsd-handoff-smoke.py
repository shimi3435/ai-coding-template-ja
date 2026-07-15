"""Explicit read-only OpenSpec/GSD compatibility smoke entrypoint."""

from __future__ import annotations

import argparse
import re
import sys
from collections.abc import Sequence
from pathlib import Path

from ai_coding_template_ja.openspec_gsd_handoff.smoke import (
    render_human_result,
    render_json_result,
    run_smoke,
)

_CHANGE_ID = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")


def _directory(value: str) -> Path:
    path = Path(value)
    if not path.is_dir():
        raise argparse.ArgumentTypeError("must be an existing directory")
    return path


def _change_id(value: str) -> str:
    try:
        encoded = value.encode("ascii")
    except UnicodeEncodeError as exc:
        raise argparse.ArgumentTypeError("must be ASCII lower-kebab") from exc
    if not 0 < len(encoded) <= 128 or _CHANGE_ID.fullmatch(value) is None:
        raise argparse.ArgumentTypeError("must be 1-128 byte ASCII lower-kebab")
    return value


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run pinned read-only OpenSpec/GSD compatibility probes."
    )
    parser.add_argument("--repository", required=True, type=_directory)
    parser.add_argument("--change", required=True, type=_change_id)
    parser.add_argument("--gsd-home", required=True, type=_directory)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    result = run_smoke(
        repository=args.repository,
        change_id=args.change,
        gsd_home=args.gsd_home,
    )
    print(render_json_result(result))
    print(render_human_result(result), file=sys.stderr)
    return 0 if result.ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
