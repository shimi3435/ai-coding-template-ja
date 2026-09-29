"""共通runtime fixtureを公開入口から検証する。"""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
from pathlib import Path
from types import ModuleType
from typing import NamedTuple, NotRequired, TypedDict

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent


class RuntimeCase(TypedDict):
    id: str
    runtime: str
    stdout: str
    stderr: str
    status: int
    accepted: bool
    pythonInfo: NotRequired[tuple[int, int, int, str, int]]


CASES: list[RuntimeCase] = json.loads(
    (REPO_ROOT / "tests/fixtures/runtime_versions.json").read_text(encoding="utf-8")
)["cases"]


def _write_command(path: Path, stdout: str, stderr: str = "", status: int = 0) -> None:
    """printfの8進escapeでNULと末尾改行を含むfixture bytesを保持する。"""
    out = "".join(f"\\{byte:03o}" for byte in stdout.encode())
    err = "".join(f"\\{byte:03o}" for byte in stderr.encode())
    path.write_text(
        f"#!/bin/sh\nprintf '{out}'\nprintf '{err}' >&2\nexit {status}\n",
        encoding="utf-8",
    )
    path.chmod(0o755)


def _runtime_path(tmp_path: Path, case: RuntimeCase) -> Path:
    directory = tmp_path / "bin"
    directory.mkdir()
    for command, output in {
        "node": "v24.1.0\n",
        "npm": "11.6.2\n",
        "python3": "Python 3.14.0\n",
        "uv": "uv fixture\n",
    }.items():
        if command == case["runtime"]:
            _write_command(
                directory / command, case["stdout"], case["stderr"], case["status"]
            )
        else:
            _write_command(directory / command, output)
    os.symlink("/usr/bin/dirname", directory / "dirname")
    return directory


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["id"])
def test_bootstrap_shared_runtime_contract(tmp_path: Path, case: RuntimeCase) -> None:
    directory = _runtime_path(tmp_path, case)
    result = subprocess.run(
        ["/bin/bash", str(REPO_ROOT / "scripts/bootstrap.sh")],
        env={"PATH": str(directory), "HOME": str(tmp_path), "LC_ALL": "C"},
        input="",
        text=True,
        capture_output=True,
        check=False,
    )
    assert (result.returncode == 0) == case["accepted"], result.stdout + result.stderr


def _load_doctor() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "doctor", REPO_ROOT / "scripts/doctor.py"
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize(
    "case",
    [case for case in CASES if case["runtime"] != "python3"],
    ids=lambda case: case["id"],
)
def test_doctor_shared_command_contract(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, case: RuntimeCase
) -> None:
    directory = _runtime_path(tmp_path, case)
    monkeypatch.setenv("PATH", str(directory))
    doctor = _load_doctor()
    diag = doctor.Diagnostics()
    doctor.check_node_runtime(diag)
    assert (diag.exit_code() == 0) == case["accepted"]


class VersionInfo(NamedTuple):
    major: int
    minor: int
    micro: int
    releaselevel: str
    serial: int


@pytest.mark.parametrize(
    "case",
    [case for case in CASES if "pythonInfo" in case],
    ids=lambda case: case["id"],
)
def test_doctor_shared_python_contract(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, case: RuntimeCase
) -> None:
    version_info = case.get("pythonInfo")
    assert version_info is not None
    doctor = _load_doctor()
    monkeypatch.setattr(doctor, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(doctor.sys, "version_info", VersionInfo(*version_info))
    monkeypatch.setattr(
        doctor.sys,
        "version",
        case["stdout"].removeprefix("Python ") + " (fixture) [fixture]",
    )
    (tmp_path / ".python-version").write_text("3.14\n", encoding="utf-8")
    diag = doctor.Diagnostics()
    doctor.check_python(diag)
    assert (diag.exit_code() == 0) == case["accepted"]


def test_doctor_checks_its_own_python_instead_of_path(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _write_command(tmp_path / "python3", "Python 3.13.0\n")
    monkeypatch.setenv("PATH", str(tmp_path))
    doctor = _load_doctor()
    monkeypatch.setattr(doctor, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(doctor.sys, "version_info", VersionInfo(3, 14, 0, "final", 0))
    monkeypatch.setattr(doctor.sys, "version", "3.14.0 (fixture) [fixture]")
    (tmp_path / ".python-version").write_text("3.14\n", encoding="utf-8")
    diag = doctor.Diagnostics()
    doctor.check_python(diag)
    assert diag.exit_code() == 0
