"""bootstrap の公開 CLI 契約を fixture PATH から検証する。"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
BOOTSTRAP = REPO_ROOT / "scripts" / "bootstrap.sh"


def _write_command(directory: Path, name: str, output: str, exit_code: int = 0) -> None:
    command = directory / name
    command.write_text(
        f"#!/bin/sh\nprintf '%s\\n' '{output}'\nexit {exit_code}\n",
        encoding="utf-8",
    )
    command.chmod(0o755)


def _write_script(directory: Path, name: str, script: str) -> None:
    command = directory / name
    command.write_text(f"#!/bin/bash\n{script}\n", encoding="utf-8")
    command.chmod(0o755)


@pytest.fixture
def runtime_path(tmp_path: Path) -> Path:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    os.symlink("/usr/bin/dirname", bin_dir / "dirname")
    _write_command(bin_dir, "node", "v24.11.1")
    _write_command(bin_dir, "npm", "11.6.2")
    _write_command(bin_dir, "python3", "Python 3.14.2")
    return bin_dir


def _run_bootstrap(
    bin_dir: Path,
    *arguments: str,
    home: Path,
    extra_env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    environment = {"HOME": str(home), "PATH": str(bin_dir)}
    environment.update(extra_env or {})
    return subprocess.run(
        ["/bin/bash", str(BOOTSTRAP), *arguments],
        cwd=REPO_ROOT,
        env=environment,
        text=True,
        capture_output=True,
        check=False,
    )


def test_preflight_reports_supported_complete_runtime_versions(
    runtime_path: Path, tmp_path: Path
) -> None:
    result = _run_bootstrap(runtime_path, home=tmp_path / "home")

    assert result.returncode == 0, result.stderr
    assert "Node.js v24.11.1" in result.stdout
    assert "npm 11.6.2" in result.stdout
    assert "Python 3.14.2" in result.stdout


def test_missing_node_without_opt_in_fails_without_filesystem_changes(
    runtime_path: Path, tmp_path: Path
) -> None:
    (runtime_path / "node").unlink()
    _write_command(runtime_path, "uv", "uv 0.11.26")
    home = tmp_path / "home"
    before = sorted(path.relative_to(tmp_path) for path in tmp_path.rglob("*"))

    result = _run_bootstrap(runtime_path, home=home)

    assert result.returncode != 0
    assert "Node.js" in result.stderr
    assert "--install-node" not in result.stderr
    assert "手動" in result.stderr
    after = sorted(path.relative_to(tmp_path) for path in tmp_path.rglob("*"))
    assert after == before


@pytest.mark.parametrize(
    ("command", "output", "expected"),
    [
        ("node", "v23.9.0", "Node.js 24"),
        ("node", "v25.0.0", "Node.js 24"),
        ("python3", "Python 3.13.9", "Python >=3.14"),
    ],
)
def test_preflight_rejects_unsupported_runtime_with_detected_version(
    runtime_path: Path,
    tmp_path: Path,
    command: str,
    output: str,
    expected: str,
) -> None:
    _write_command(runtime_path, command, output)

    result = _run_bootstrap(runtime_path, home=tmp_path / "home")

    assert result.returncode != 0
    assert expected in result.stderr
    assert output in result.stderr


@pytest.mark.parametrize(
    ("node_version", "python_version"),
    [
        ("v24.0.0", "Python 3.14.0"),
        ("v24.99.7", "Python 3.15.0"),
        ("v24.3.1", "Python 4.0.0"),
    ],
)
def test_preflight_accepts_node_24_patch_updates_and_python_at_least_3_14(
    runtime_path: Path,
    tmp_path: Path,
    node_version: str,
    python_version: str,
) -> None:
    _write_command(runtime_path, "node", node_version)
    _write_command(runtime_path, "python3", python_version)

    result = _run_bootstrap(runtime_path, home=tmp_path / "home")

    assert result.returncode == 0, result.stderr
    assert node_version in result.stdout
    assert python_version in result.stdout


@pytest.mark.parametrize(
    ("command", "output", "exit_code", "expected"),
    [
        ("node", "broken node", 7, "Node.js version command"),
        ("npm", "not-a-version", 0, "npm version 出力"),
        ("python3", "Python unknown", 0, "Python version 出力"),
    ],
)
def test_preflight_identifies_failed_or_unparseable_runtime_command(
    runtime_path: Path,
    tmp_path: Path,
    command: str,
    output: str,
    exit_code: int,
    expected: str,
) -> None:
    _write_command(runtime_path, command, output, exit_code)

    result = _run_bootstrap(runtime_path, home=tmp_path / "home")

    assert result.returncode != 0
    assert expected in result.stderr
    assert output in result.stderr


def test_runtime_failure_happens_before_uv_or_task_mutation(
    runtime_path: Path, tmp_path: Path
) -> None:
    _write_command(runtime_path, "node", "v26.0.0")
    mutation_log = tmp_path / "mutation.log"
    for command in ("uv", "task"):
        _write_script(runtime_path, command, f'echo {command} >> "{mutation_log}"')

    result = _run_bootstrap(runtime_path, home=tmp_path / "home")

    assert result.returncode != 0
    assert "Node.js 24" in result.stderr
    assert not mutation_log.exists()


@pytest.mark.parametrize(
    "arguments",
    [
        ("--install-node",),
        ("--help", "--install-node"),
        ("--install-node", "-h"),
    ],
)
def test_removed_option_reports_migration_without_running_commands(
    runtime_path: Path, tmp_path: Path, arguments: tuple[str, ...]
) -> None:
    home = tmp_path / "home"
    home.mkdir()
    for command in ("node", "npm", "python3", "curl", "uv", "task", "mktemp"):
        _write_script(
            runtime_path,
            command,
            'printf "%s\\n" called >> "$HOME/commands.log"; exit 99',
        )

    result = _run_bootstrap(runtime_path, *arguments, home=home)

    assert result.returncode == 2
    assert result.stdout == ""
    for text in (
        "--install-node",
        "廃止",
        "Node.js 24",
        "npm",
        "https://nodejs.org/en/download",
        "PATH",
        "./scripts/bootstrap.sh",
    ):
        assert text in result.stderr
    assert list(home.iterdir()) == []


@pytest.mark.parametrize("arguments", [("--help",), ("-h",), ("-h", "--help", "-h")])
@pytest.mark.parametrize("runtime_present", [False, True])
def test_help_needs_no_runtime_or_external_commands(
    runtime_path: Path,
    tmp_path: Path,
    arguments: tuple[str, ...],
    runtime_present: bool,
) -> None:
    home = tmp_path / "home"
    home.mkdir()
    for command in runtime_path.iterdir():
        command.unlink()
    if runtime_present:
        for command in ("node", "npm", "python3", "curl", "uv", "task", "dirname"):
            _write_script(
                runtime_path,
                command,
                'printf "%s\\n" called >> "$HOME/commands.log"; exit 99',
            )

    for _ in range(2):
        result = _run_bootstrap(runtime_path, *arguments, home=home)
        assert result.returncode == 0, result.stderr
        assert result.stderr == ""
        assert result.stdout.count("Usage:") == 1
        for text in (
            "Node.js 24",
            "npm",
            "Python >=3.14",
            "https://nodejs.org/en/download",
            "--install-node",
            "廃止",
        ):
            assert text in result.stdout
    assert list(home.iterdir()) == []


@pytest.mark.parametrize(
    "argument", ["--unknown", "", " ", "位置 引数", "--", "--help=x"]
)
@pytest.mark.parametrize("help_first", [False, True])
def test_invalid_arguments_take_priority_over_help(
    runtime_path: Path, tmp_path: Path, argument: str, help_first: bool
) -> None:
    arguments = ("--help", argument) if help_first else (argument, "--help")
    for command in runtime_path.iterdir():
        command.unlink()
    home = tmp_path / "home"
    result = _run_bootstrap(runtime_path, *arguments, home=home)

    assert result.returncode == 2
    assert result.stdout == ""
    assert result.stderr == f"[ERROR] 未知の引数: {argument}\n"
    assert not home.exists()


@pytest.mark.parametrize(
    ("command", "output", "exit_code", "cause"),
    [
        ("node", None, 0, "Node.js 24 が見つかりません"),
        ("npm", None, 0, "npm が見つかりません"),
        ("node", "v23.9.0", 0, "Node.js 24 が必要"),
        ("node", "v25.0.0", 0, "Node.js 24 が必要"),
        ("node", "broken node", 7, "Node.js version command"),
        ("npm", "broken npm", 8, "npm version command"),
        ("node", "", 0, "Node.js version 出力"),
        ("node", "不正 な出力", 0, "Node.js version 出力"),
        ("npm", " ", 0, "npm version 出力"),
        ("npm", "not-a-version", 0, "npm version 出力"),
    ],
)
def test_node_runtime_failures_explain_recovery_before_any_mutation(
    runtime_path: Path,
    tmp_path: Path,
    command: str,
    output: str | None,
    exit_code: int,
    cause: str,
) -> None:
    if output is None:
        (runtime_path / command).unlink()
    else:
        _write_command(runtime_path, command, output, exit_code)
    home = tmp_path / "home"
    home.mkdir()
    for tool in ("curl", "uv", "task", "mktemp", "tar", "rm"):
        _write_script(
            runtime_path, tool, 'printf "%s\\n" called >> "$HOME/commands.log"; exit 99'
        )

    result = _run_bootstrap(runtime_path, home=home, extra_env={"ASSUME_YES": "1"})

    assert result.returncode == 1
    assert result.stdout == ""
    for text in (
        cause,
        "Node.js 24",
        "npm",
        "https://nodejs.org/en/download",
        "PATH",
        "./scripts/bootstrap.sh",
    ):
        assert text in result.stderr
    if output:
        assert output in result.stderr
    assert "--install-node" not in result.stderr
    assert list(home.iterdir()) == []


def _environment_snapshot(root: Path) -> dict[str, tuple[int, str | bytes | None]]:
    snapshot: dict[str, tuple[int, str | bytes | None]] = {}
    for path in root.rglob("*"):
        content = (
            os.readlink(path)
            if path.is_symlink()
            else path.read_bytes()
            if path.is_file()
            else None
        )
        snapshot[str(path.relative_to(root))] = (path.lstat().st_mode, content)
    return snapshot


@pytest.mark.parametrize(
    "install_root", ["", "relative/node", "/not-owned", "旧 Node/格納先"]
)
def test_existing_runtime_and_legacy_variable_allow_normal_setup(
    runtime_path: Path, tmp_path: Path, install_root: str
) -> None:
    home = tmp_path / "existing home"
    node_store = home / "既存 Node"
    node_store.mkdir(parents=True)
    existing_bin = node_store / "bin"
    runtime_path.rename(existing_bin)
    (home / ".bashrc").write_text("# user configuration\n", encoding="utf-8")
    (home / "current-node").symlink_to(node_store, target_is_directory=True)
    _write_command(existing_bin, "uv", "uv 0.11.26")
    _write_script(
        existing_bin,
        "task",
        'case "$1" in\n'
        '  --version) printf "%s\\n" "Task version: v3.51.1" ;;\n'
        '  setup) [ "$PATH" = "$EXPECTED_PATH" ] || exit 90; '
        'printf "%s\\n" setup >> "$TASK_LOG" ;;\n'
        "  *) exit 91 ;;\n"
        "esac",
    )
    _write_script(existing_bin, "curl", 'echo called >> "$HOME/download.log"; exit 99')
    before = _environment_snapshot(home)
    task_log = tmp_path / "task.log"
    env = {
        "NODE_INSTALL_ROOT": install_root,
        "EXPECTED_PATH": str(existing_bin),
        "TASK_LOG": str(task_log),
    }

    for _ in range(2):
        result = _run_bootstrap(existing_bin, home=home, extra_env=env)
        assert result.returncode == 0, result.stderr
        assert "Node.js v24.11.1" in result.stdout
        assert "NODE_INSTALL_ROOT" not in result.stdout + result.stderr
        assert _environment_snapshot(home) == before
    assert task_log.read_text(encoding="utf-8") == "setup\nsetup\n"

    result = _run_bootstrap(existing_bin, "--install-node", home=home, extra_env=env)
    assert result.returncode == 2
    assert "廃止" in result.stderr
    assert _environment_snapshot(home) == before
    assert task_log.read_text(encoding="utf-8") == "setup\nsetup\n"
