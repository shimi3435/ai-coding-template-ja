"""bootstrap の公開 CLI 契約を fixture PATH から検証する。"""

from __future__ import annotations

import hashlib
import os
import subprocess
import tarfile
from dataclasses import dataclass
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
BOOTSTRAP = REPO_ROOT / "scripts" / "bootstrap.sh"


@dataclass(frozen=True)
class InstallBoundary:
    archive: Path
    manifest: Path
    curl_log: Path
    install_root: Path
    target: Path
    temp: Path
    env: dict[str, str]
    home: Path


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


def _prepare_install_boundary(
    runtime_path: Path, tmp_path: Path, *, machine: str = "x86_64"
) -> InstallBoundary:
    node_command = runtime_path / "node"
    if node_command.exists():
        node_command.unlink()
    _write_command(runtime_path, "uv", "uv 0.11.26")
    for command in (
        "mkdir",
        "mktemp",
        "mv",
        "realpath",
        "rm",
        "sha256sum",
        "tar",
        "xz",
    ):
        destination = runtime_path / command
        if not destination.exists():
            os.symlink(f"/usr/bin/{command}", destination)
    _write_script(
        runtime_path,
        "uname",
        f'case "$1" in -s) echo Linux ;; -m) echo {machine} ;; *) exit 2 ;; esac',
    )

    distribution = tmp_path / "failure distribution"
    archive_arch = "arm64" if machine in {"aarch64", "arm64"} else "x64"
    archive_root = distribution / f"node-v24.11.1-linux-{archive_arch}"
    (archive_root / "bin").mkdir(parents=True)
    _write_command(archive_root / "bin", "node", "v24.11.1")
    _write_command(archive_root / "bin", "npm", "11.6.2")
    archive = distribution / f"{archive_root.name}.tar.xz"
    with tarfile.open(archive, "w:xz") as bundle:
        bundle.add(archive_root, arcname=archive_root.name)
    manifest = distribution / "SHASUMS256.txt"
    manifest.write_text(
        f"{hashlib.sha256(archive.read_bytes()).hexdigest()}  {archive.name}\n",
        encoding="utf-8",
    )
    curl_log = tmp_path / "failure-curl.log"
    _write_script(
        runtime_path,
        "curl",
        f'''output=""
url=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output) output="$2"; shift 2 ;;
    http*) url="$1"; shift ;;
    *) shift ;;
  esac
done
printf '%s\\n' "$url" >> "{curl_log}"
case "$url" in
  */SHASUMS256.txt)
    [ "${{CURL_FAILURE:-}}" = "checksums" ] && exit 22
    /usr/bin/cp "{manifest}" "$output"
    ;;
  */{archive.name})
    [ "${{CURL_FAILURE:-}}" = "archive" ] && exit 22
    /usr/bin/cp "{archive}" "$output"
    ;;
  *) exit 22 ;;
esac''',
    )

    home = tmp_path / "failure home"
    home.mkdir()
    install_root = home / "node store"
    controlled_temp = tmp_path / "download temp"
    controlled_temp.mkdir()
    return InstallBoundary(
        archive=archive,
        manifest=manifest,
        curl_log=curl_log,
        install_root=install_root,
        target=install_root / archive_root.name,
        temp=controlled_temp,
        env={
            "ASSUME_YES": "1",
            "NODE_INSTALL_ROOT": str(install_root),
            "TMPDIR": str(controlled_temp),
        },
        home=home,
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
    assert "--install-node" in result.stderr
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


def test_install_node_uses_verified_official_archive_in_space_containing_root(
    runtime_path: Path, tmp_path: Path
) -> None:
    (runtime_path / "node").unlink()
    _write_command(runtime_path, "uv", "uv 0.11.26")
    for command in (
        "cp",
        "mkdir",
        "mktemp",
        "mv",
        "realpath",
        "rm",
        "sha256sum",
        "tar",
        "xz",
    ):
        os.symlink(f"/usr/bin/{command}", runtime_path / command)
    _write_script(
        runtime_path,
        "uname",
        'case "$1" in -s) echo Linux ;; -m) echo x86_64 ;; *) exit 2 ;; esac',
    )

    distribution = tmp_path / "distribution"
    archive_root = distribution / "node-v24.11.1-linux-x64"
    (archive_root / "bin").mkdir(parents=True)
    _write_command(archive_root / "bin", "node", "v24.11.1")
    _write_command(archive_root / "bin", "npm", "11.6.2")
    archive = distribution / "node-v24.11.1-linux-x64.tar.xz"
    with tarfile.open(archive, "w:xz") as bundle:
        bundle.add(archive_root, arcname=archive_root.name)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    manifest = distribution / "SHASUMS256.txt"
    manifest.write_text(f"{digest}  {archive.name}\n", encoding="utf-8")
    curl_log = tmp_path / "curl.log"
    _write_script(
        runtime_path,
        "curl",
        f'''output=""
url=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output) output="$2"; shift 2 ;;
    http*) url="$1"; shift ;;
    *) shift ;;
  esac
done
printf '%s\\n' "$url" >> "{curl_log}"
case "$url" in
  */SHASUMS256.txt) /usr/bin/cp "{manifest}" "$output" ;;
  */{archive.name}) /usr/bin/cp "{archive}" "$output" ;;
  *) exit 22 ;;
esac''',
    )
    home = tmp_path / "home with spaces"
    home.mkdir()
    install_root = home / "runtime store"

    result = _run_bootstrap(
        runtime_path,
        "--install-node",
        home=home,
        extra_env={"NODE_INSTALL_ROOT": str(install_root), "ASSUME_YES": "1"},
    )

    target = install_root / archive_root.name
    assert result.returncode == 0, result.stderr
    assert (target / "bin" / "node").is_file()
    assert f"Node.js v24.11.1 を {target} へ導入しました" in result.stdout
    assert "次回 shell でも使うには実行してください: export PATH=" in result.stdout
    urls = curl_log.read_text(encoding="utf-8").splitlines()
    assert urls == [
        "https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt",
        f"https://nodejs.org/dist/latest-v24.x/{archive.name}",
    ]


def test_install_node_prints_shell_safe_path_for_special_characters(
    runtime_path: Path, tmp_path: Path
) -> None:
    boundary = _prepare_install_boundary(runtime_path, tmp_path)
    install_root = boundary.home / (
        "runtime $(touch${IFS}injected-marker) "
        '`touch${IFS}backtick-marker` "line\nbreak'
    )
    environment = {**boundary.env, "NODE_INSTALL_ROOT": str(install_root)}

    result = _run_bootstrap(
        runtime_path,
        "--install-node",
        home=boundary.home,
        extra_env=environment,
    )

    assert result.returncode == 0, result.stderr
    prefix = "[INFO] 次回 shell でも使うには実行してください: "
    export_line = next(
        line for line in result.stdout.splitlines() if line.startswith(prefix)
    )
    export_command = export_line.removeprefix(prefix)
    evaluated = subprocess.run(
        ["/bin/bash", "-c", f'{export_command}\nprintf "%s" "$PATH"'],
        cwd=tmp_path,
        env={"PATH": "/usr/bin"},
        capture_output=True,
        text=True,
        check=False,
    )
    target = install_root / boundary.target.name
    assert evaluated.returncode == 0, evaluated.stderr
    assert evaluated.stdout == f"{target}/bin:/usr/bin"
    assert not (tmp_path / "injected-marker").exists()
    assert not (tmp_path / "backtick-marker").exists()


def test_install_node_rejects_unsupported_architecture_before_download(
    runtime_path: Path, tmp_path: Path
) -> None:
    boundary = _prepare_install_boundary(runtime_path, tmp_path, machine="ppc64le")

    result = _run_bootstrap(
        runtime_path,
        "--install-node",
        home=boundary.home,
        extra_env=boundary.env,
    )

    assert result.returncode != 0
    assert "Linux x64 / arm64" in result.stderr
    assert "ppc64le" in result.stderr
    assert not boundary.curl_log.exists()
    assert not boundary.install_root.exists()


def test_install_node_supports_linux_arm64(runtime_path: Path, tmp_path: Path) -> None:
    boundary = _prepare_install_boundary(runtime_path, tmp_path, machine="aarch64")

    result = _run_bootstrap(
        runtime_path,
        "--install-node",
        home=boundary.home,
        extra_env=boundary.env,
    )

    assert result.returncode == 0, result.stderr
    assert boundary.target.name == "node-v24.11.1-linux-arm64"
    assert (boundary.target / "bin" / "node").is_file()


@pytest.mark.parametrize(
    ("unsafe_root", "expected"),
    [("relative/node", "絶対 path"), ("/tmp/outside-user-home", "HOME 配下")],
)
def test_install_node_rejects_unsafe_root_before_download(
    runtime_path: Path, tmp_path: Path, unsafe_root: str, expected: str
) -> None:
    boundary = _prepare_install_boundary(runtime_path, tmp_path)
    environment = {**boundary.env, "NODE_INSTALL_ROOT": unsafe_root}

    result = _run_bootstrap(
        runtime_path,
        "--install-node",
        home=boundary.home,
        extra_env=environment,
    )

    assert result.returncode != 0
    assert "NODE_INSTALL_ROOT" in result.stderr
    assert expected in result.stderr
    assert not boundary.curl_log.exists()
    assert not boundary.install_root.exists()


def test_install_node_rejects_root_that_escapes_home_through_symlink(
    runtime_path: Path, tmp_path: Path
) -> None:
    boundary = _prepare_install_boundary(runtime_path, tmp_path)
    outside = tmp_path / "outside home"
    outside.mkdir()
    escape = boundary.home / "escape"
    escape.symlink_to(outside, target_is_directory=True)
    environment = {
        **boundary.env,
        "NODE_INSTALL_ROOT": str(escape / "node store"),
    }

    result = _run_bootstrap(
        runtime_path,
        "--install-node",
        home=boundary.home,
        extra_env=environment,
    )

    assert result.returncode != 0
    assert "HOME 配下" in result.stderr
    assert not boundary.curl_log.exists()
    assert list(outside.iterdir()) == []


def test_install_node_never_overwrites_existing_target(
    runtime_path: Path, tmp_path: Path
) -> None:
    boundary = _prepare_install_boundary(runtime_path, tmp_path)
    boundary.target.parent.mkdir(parents=True)
    boundary.target.write_text("keep me", encoding="utf-8")

    result = _run_bootstrap(
        runtime_path,
        "--install-node",
        home=boundary.home,
        extra_env=boundary.env,
    )

    assert result.returncode != 0
    assert "上書きしません" in result.stderr
    assert boundary.target.read_text(encoding="utf-8") == "keep me"
    assert boundary.curl_log.read_text(encoding="utf-8").splitlines() == [
        "https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt"
    ]
    assert list(boundary.temp.iterdir()) == []


def test_install_node_activation_race_does_not_move_into_existing_directory(
    runtime_path: Path, tmp_path: Path
) -> None:
    boundary = _prepare_install_boundary(runtime_path, tmp_path)
    (runtime_path / "mv").unlink()
    _write_script(
        runtime_path,
        "mv",
        '''/usr/bin/mkdir -p -- "$RACE_TARGET"
printf '%s\n' 'keep me' > "$RACE_TARGET/sentinel"
exec /usr/bin/mv "$@"''',
    )
    environment = {**boundary.env, "RACE_TARGET": str(boundary.target)}

    result = _run_bootstrap(
        runtime_path,
        "--install-node",
        home=boundary.home,
        extra_env=environment,
    )

    assert result.returncode != 0
    assert "最終 target" in result.stderr
    assert [path.name for path in boundary.target.iterdir()] == ["sentinel"]
    assert (boundary.target / "sentinel").read_text(encoding="utf-8") == "keep me\n"
    assert list(boundary.temp.iterdir()) == []


def test_install_node_activation_race_does_not_replace_empty_directory(
    runtime_path: Path, tmp_path: Path
) -> None:
    boundary = _prepare_install_boundary(runtime_path, tmp_path)
    (runtime_path / "mv").unlink()
    _write_script(
        runtime_path,
        "mv",
        '''/usr/bin/mkdir -p -- "$RACE_TARGET"
exec /usr/bin/mv "$@"''',
    )
    environment = {**boundary.env, "RACE_TARGET": str(boundary.target)}

    result = _run_bootstrap(
        runtime_path,
        "--install-node",
        home=boundary.home,
        extra_env=environment,
    )

    assert result.returncode != 0
    assert "最終 target" in result.stderr
    assert boundary.target.is_dir()
    assert list(boundary.target.iterdir()) == []
    assert list(boundary.temp.iterdir()) == []


@pytest.mark.parametrize(
    ("failure", "expected"),
    [
        ("checksums-download", "公式 checksum の取得"),
        ("manifest-parse", "archive を一意に決定"),
        ("checksum-mismatch", "checksum が一致しません"),
        ("archive-download", "公式 archive の取得"),
        ("archive-extract", "archive の展開"),
    ],
)
def test_install_node_failure_never_activates_target_or_leaves_temporary_runtime(
    runtime_path: Path,
    tmp_path: Path,
    failure: str,
    expected: str,
) -> None:
    boundary = _prepare_install_boundary(runtime_path, tmp_path)
    environment = dict(boundary.env)
    if failure == "checksums-download":
        environment["CURL_FAILURE"] = "checksums"
    elif failure == "manifest-parse":
        boundary.manifest.write_text("not a checksum manifest\n", encoding="utf-8")
    elif failure == "checksum-mismatch":
        boundary.manifest.write_text(
            f"{'0' * 64}  {boundary.archive.name}\n", encoding="utf-8"
        )
    elif failure == "archive-download":
        environment["CURL_FAILURE"] = "archive"
    elif failure == "archive-extract":
        boundary.archive.write_bytes(b"not an archive")
        boundary.manifest.write_text(
            f"{hashlib.sha256(boundary.archive.read_bytes()).hexdigest()}  "
            f"{boundary.archive.name}\n",
            encoding="utf-8",
        )

    result = _run_bootstrap(
        runtime_path,
        "--install-node",
        home=boundary.home,
        extra_env=environment,
    )

    assert result.returncode != 0
    assert expected in result.stderr
    assert not boundary.target.exists()
    assert list(boundary.temp.iterdir()) == []
    if boundary.install_root.exists():
        assert list(boundary.install_root.glob(".node-install.*")) == []
