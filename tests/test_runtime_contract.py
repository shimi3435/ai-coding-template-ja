"""共通runtime fixtureを公開入口から検証する。"""

from __future__ import annotations

import importlib.util
import json
import os
import shlex
import subprocess
import sys
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


@pytest.fixture(scope="session", params=["C", "C.utf8", "en_US.UTF-8"])
def runtime_locale(request: pytest.FixtureRequest) -> str:
    """非C localeは在席時だけ検証し、追加のOS packageを要求しない。"""
    name: str = request.param
    probe = subprocess.run(
        [
            sys.executable,
            "-c",
            "import locale\ntry: locale.setlocale(locale.LC_ALL, '')\n"
            "except locale.Error: raise SystemExit(77)",
        ],
        env={**os.environ, "LC_ALL": name},
        capture_output=True,
        text=True,
        check=False,
    )
    if probe.returncode == 77 and name == "en_US.UTF-8":
        pytest.skip("en_US.UTF-8未導入: 非C localeの追加検証は未実施")
    assert probe.returncode == 0, probe.stderr
    return name


def _bootstrap_env(directory: Path, home: Path) -> dict[str, str]:
    environment = {"PATH": str(directory), "HOME": str(home)}
    if "LOCPATH" in os.environ:
        environment["LOCPATH"] = os.environ["LOCPATH"]
    return environment


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
def test_bootstrap_shared_runtime_contract(
    tmp_path: Path, case: RuntimeCase, runtime_locale: str
) -> None:
    directory = _runtime_path(tmp_path, case)
    result = subprocess.run(
        ["/bin/bash", str(REPO_ROOT / "scripts/bootstrap.sh")],
        env={**_bootstrap_env(directory, tmp_path), "LC_ALL": runtime_locale},
        input="",
        text=True,
        capture_output=True,
        check=False,
    )
    assert (result.returncode == 0) == case["accepted"], result.stdout + result.stderr


@pytest.mark.parametrize("locale_variable", ["LC_ALL", "LANG"])
def test_bootstrap_preserves_locale_for_runtimes_and_setup(
    tmp_path: Path, runtime_locale: str, locale_variable: str
) -> None:
    case = next(case for case in CASES if case["id"] == "node-plain")
    directory = _runtime_path(tmp_path, case)
    _write_command(directory / "task", "Task fixture\n")
    trace = tmp_path / "locale-trace"
    commands = {"node", "npm", "python3", "uv", "task"}
    for name in commands:
        command = directory / name
        lines = command.read_text().splitlines(keepends=True)
        lines.insert(
            1,
            f"printf '%s|%s|%s\\n' {name} \"${{LC_ALL-unset}}\" "
            f'"${{LANG-unset}}" >> {shlex.quote(str(trace))}\n',
        )
        command.write_text("".join(lines), encoding="utf-8")
    result = subprocess.run(
        ["/bin/bash", str(REPO_ROOT / "scripts/bootstrap.sh")],
        env={**_bootstrap_env(directory, tmp_path), locale_variable: runtime_locale},
        input="",
        text=True,
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    records = [line.split("|") for line in trace.read_text().splitlines()]
    assert {row[0] for row in records} == commands
    expected = (
        [runtime_locale, "unset"]
        if locale_variable == "LC_ALL"
        else ["unset", runtime_locale]
    )
    assert all(row[1:] == expected for row in records), records


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
