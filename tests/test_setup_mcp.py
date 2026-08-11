"""doctor / setup-mcp の公開 CLI 契約を検証する。"""

from __future__ import annotations

import json
import os
import shutil
import stat
import subprocess
import sys
import tomllib
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
FAKE_GITHUB_TOKEN = "github_pat_FAKE_DO_NOT_PRINT"


def _copy_cli_project(tmp_path: Path) -> Path:
    """公開 CLI を最小構成の一時プロジェクトへコピーする。"""
    project = tmp_path / "project"
    (project / "scripts").mkdir(parents=True)
    (project / ".codex").mkdir()
    shutil.copy2(REPO_ROOT / "scripts" / "doctor.py", project / "scripts" / "doctor.py")
    shutil.copy2(
        REPO_ROOT / "scripts" / "setup-mcp.sh",
        project / "scripts" / "setup-mcp.sh",
    )
    shutil.copy2(REPO_ROOT / ".mcp.json.template", project / ".mcp.json.template")
    shutil.copy2(
        REPO_ROOT / ".codex" / "config.toml.template",
        project / ".codex" / "config.toml.template",
    )
    return project


def _write_executable(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")
    path.chmod(0o755)


def _doctor_environment(project: Path, fake_bin: Path) -> dict[str, str]:
    """doctor の機械コア診断をローカル fake command だけで通す。"""
    (project / ".python-version").write_text("3.14\n", encoding="utf-8")
    (project / "pyproject.toml").write_text(
        '[project]\nname = "doctor-cli-test"\nversion = "0.0.0"\n',
        encoding="utf-8",
    )
    (project / "uv.lock").write_text("", encoding="utf-8")
    (project / ".venv").mkdir()
    _write_executable(fake_bin / "uv", "#!/bin/sh\nexit 0\n")
    _write_executable(fake_bin / "node", "#!/bin/sh\nprintf 'v24.11.1\\n'\n")
    _write_executable(fake_bin / "npm", "#!/bin/sh\nprintf '11.6.2\\n'\n")
    return {**os.environ, "PATH": str(fake_bin)}


def _run_doctor(project: Path, env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "scripts/doctor.py"],
        cwd=project,
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )


def _run_setup(project: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["/bin/bash", "scripts/setup-mcp.sh"],
        cwd=project,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
        umask=0o022,
    )


def test_doctor_checks_local_gh_token_without_printing_it(tmp_path: Path) -> None:
    """doctor は gh auth token の成否だけを使い、token 内容を表示しない。"""
    project = _copy_cli_project(tmp_path)
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    calls = tmp_path / "gh-calls.log"
    _write_executable(
        fake_bin / "gh",
        "#!/bin/sh\n"
        f'printf "%s\\n" "$*" >> "{calls}"\n'
        'if [ "$1 $2" = "auth token" ]; then\n'
        f'  printf "%s\\n" "{FAKE_GITHUB_TOKEN}"\n'
        "  exit 0\n"
        "fi\n"
        'if [ "$1 $2" = "auth status" ]; then\n'
        "  exit 0\n"
        "fi\n"
        "exit 1\n",
    )
    env = _doctor_environment(project, fake_bin)

    result = _run_doctor(project, env)
    output = result.stdout + result.stderr

    assert result.returncode == 0, output
    assert calls.read_text(encoding="utf-8").splitlines() == ["auth token"]
    assert FAKE_GITHUB_TOKEN not in output
    assert "gh 利用可能・資格情報あり（有効性は未検証）" in output


def test_setup_and_doctor_use_last_duplicate_context7_key(tmp_path: Path) -> None:
    """setup 直後の doctor は重複 key の末尾値に対する drift を報告しない。"""
    project = _copy_cli_project(tmp_path)
    first_key = "context7-first-definition"
    last_key = "context7-last-definition"
    (project / ".env").write_text(
        f"CONTEXT7_API_KEY={first_key}\nCONTEXT7_API_KEY={last_key}\n",
        encoding="utf-8",
    )

    setup = _run_setup(project)
    assert setup.returncode == 0, setup.stdout + setup.stderr
    mcp = json.loads((project / ".mcp.json").read_text(encoding="utf-8"))
    with (project / ".codex" / "config.toml").open("rb") as config_file:
        codex = tomllib.load(config_file)
    assert mcp["mcpServers"]["context7"]["headers"]["CONTEXT7_API_KEY"] == last_key
    assert (
        codex["mcp_servers"]["context7"]["http_headers"]["CONTEXT7_API_KEY"] == last_key
    )

    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    env = _doctor_environment(project, fake_bin)
    doctor = _run_doctor(project, env)
    output = doctor.stdout + doctor.stderr

    assert doctor.returncode == 0, output
    assert "（drift）。" not in output


@pytest.mark.parametrize("existing", [False, True], ids=["new", "existing"])
def test_setup_protects_generated_config_with_mode_0600(
    tmp_path: Path, existing: bool
) -> None:
    """setup は新規・既存の両方で生成設定を mode 0600 にする。"""
    project = _copy_cli_project(tmp_path)
    (project / ".env").write_text(
        "CONTEXT7_API_KEY=context7-local-secret\n", encoding="utf-8"
    )
    generated = [project / ".mcp.json", project / ".codex" / "config.toml"]
    if existing:
        for path in generated:
            path.write_text("stale config\n", encoding="utf-8")
            path.chmod(0o666)

    result = _run_setup(project)

    assert result.returncode == 0, result.stdout + result.stderr
    modes = {
        path.relative_to(project): stat.S_IMODE(path.stat().st_mode)
        for path in generated
    }
    assert modes == {Path(".mcp.json"): 0o600, Path(".codex/config.toml"): 0o600}
