"""掲載shellを実行し、名前がCLIへliteralな単一引数として渡ることを確認する。"""

from __future__ import annotations

import os
import re
import subprocess
import textwrap
from pathlib import Path

import pytest

WORKFLOW = Path(__file__).resolve().parents[1] / "docs/agents/workflow.md"


def _command(heading: str) -> str:
    section = WORKFLOW.read_text().split(heading + "\n", 1)[1].split("\n### ", 1)[0]
    match = re.search(r"```bash\n(.*?)\n\s*```", section, re.DOTALL)
    assert match is not None
    return textwrap.dedent(match[1])


@pytest.mark.parametrize(
    ("heading", "variable", "expected"),
    [
        ("### 同期・移動前の確認と実行", "change_name", ["archive", "--yes", "--"]),
        (
            "### archive後のcanonical検証",
            "capability",
            ["validate", "--type", "spec", "--strict", "--no-interactive", "--"],
        ),
    ],
)
@pytest.mark.parametrize(
    "name",
    [
        None,
        "",
        "my change",
        "変更",
        "-leading",
        "'\";$(touch injected)`touch injected`",
    ],
)
def test_documented_command_preserves_argv(
    tmp_path: Path, heading: str, variable: str, expected: list[str], name: str | None
) -> None:
    stub = tmp_path / "openspec"
    stub.write_text('#!/bin/sh\nprintf "%s\\0" "$@" > "$ARGV_FILE"\n')
    stub.chmod(0o755)
    argv_file = tmp_path / "argv"
    env = dict(
        os.environ, PATH=f"{tmp_path}:{os.environ['PATH']}", ARGV_FILE=str(argv_file)
    )
    env.pop(variable, None)
    if name is not None:
        env[variable] = name
    result = subprocess.run(
        ["bash", "-c", _command(heading)],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    if not name:
        assert result.returncode != 0
        assert not argv_file.exists()
    else:
        assert result.returncode == 0, result.stderr
        assert argv_file.read_bytes().split(b"\0")[:-1] == [
            value.encode() for value in [*expected, name]
        ]
    assert not (tmp_path / "injected").exists()
