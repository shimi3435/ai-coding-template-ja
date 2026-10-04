"""bootstrapは同名のexport済みfunctionではなくPATH上のruntimeを検査する。"""

from __future__ import annotations

import shlex
import subprocess
from pathlib import Path

import pytest

BOOTSTRAP = Path(__file__).resolve().parent.parent / "scripts/bootstrap.sh"
VERSIONS = {"node": "v24.1.0", "npm": "11.6.2", "python3": "Python 3.14.0"}


@pytest.mark.parametrize("command", VERSIONS)
@pytest.mark.parametrize("executable_state", ["missing", "incompatible", "compatible"])
def test_bootstrap_ignores_exported_runtime_function(
    tmp_path: Path, command: str, executable_state: str
) -> None:
    directory = tmp_path / "runtime bin"
    directory.mkdir()
    (directory / "dirname").symlink_to("/usr/bin/dirname")
    setup_trace = tmp_path / "setup-trace"
    function_trace = tmp_path / "function-trace"
    for name, version in {
        **VERSIONS,
        "uv": "uv fixture",
        "task": "Task fixture",
    }.items():
        if name == command:
            if executable_state == "missing":
                continue
            if executable_state == "incompatible":
                version += "-rc.1"
        path = directory / name
        trace = (
            f"printf '%s\\n' {name} >> {shlex.quote(str(setup_trace))}\n"
            if name in {"uv", "task"}
            else ""
        )
        path.write_text(
            f"#!/bin/sh\n{trace}printf '%s\\n' {shlex.quote(version)}\n",
            encoding="utf-8",
        )
        path.chmod(0o755)

    function_result = (
        "return 9"
        if executable_state == "compatible"
        else f"printf '%s\\n' {shlex.quote(VERSIONS[command])}"
    )
    launcher = (
        f"{command}() {{ printf called > {shlex.quote(str(function_trace))}; "
        f'{function_result}; }}; export -f {command}; exec /bin/bash "$1"'
    )
    result = subprocess.run(
        ["/bin/bash", "-c", launcher, "runtime-function-test", str(BOOTSTRAP)],
        cwd=BOOTSTRAP.parent.parent,
        env={
            "PATH": str(directory.relative_to(BOOTSTRAP.parent.parent, walk_up=True)),
            "HOME": str(tmp_path),
            "LC_ALL": "C",
        },
        input="",
        capture_output=True,
        text=True,
        check=False,
    )
    assert (result.returncode == 0) == (executable_state == "compatible"), (
        result.stdout + result.stderr
    )
    assert not function_trace.exists(), "export済みfunctionが実行された"
    assert setup_trace.exists() == (executable_state == "compatible")
