"""固定 parser の offline runtime と準備失敗の公開境界。"""

import errno
import importlib
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier, Event

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "repo-tools"))


def test_missing_parser_refuses_without_preparing(tmp_path: Path) -> None:
    artifact = importlib.import_module("shell_parser_artifact")
    with pytest.raises(ValueError, match="setup"):
        artifact.prepared_parser(tmp_path)
    assert list(tmp_path.iterdir()) == []


def prepared_copy(root: Path) -> Path:
    artifact = importlib.import_module("shell_parser_artifact")
    shutil.copytree(ROOT / "repo-tools/shell-parser", root / "repo-tools/shell-parser")
    shutil.copytree(ROOT / ".cache/shell-parser", root / ".cache/shell-parser")
    return artifact.prepared_parser(root)


@pytest.mark.parametrize("damage", ["binary", "identity", "patch", "symlink"])
def test_runtime_refuses_invalid_artifact_without_writes(
    tmp_path: Path, damage: str
) -> None:
    binary = prepared_copy(tmp_path)
    artifact = importlib.import_module("shell_parser_artifact")
    if damage == "binary":
        binary.write_bytes(b"broken")
    elif damage == "identity":
        (tmp_path / ".cache/shell-parser/current.json").write_text("{}")
    elif damage == "patch":
        with (tmp_path / "repo-tools/shell-parser/upstream.patch").open("ab") as stream:
            stream.write(b"\n")
    else:
        binary.rename(binary.with_name("original"))
        binary.symlink_to("original")
    before = sorted(
        (str(p.relative_to(tmp_path)), p.lstat().st_mtime_ns, p.lstat().st_size)
        for p in tmp_path.rglob("*")
    )
    with pytest.raises(ValueError, match="setup"):
        artifact.prepared_parser(tmp_path)
    assert (
        sorted(
            (str(p.relative_to(tmp_path)), p.lstat().st_mtime_ns, p.lstat().st_size)
            for p in tmp_path.rglob("*")
        )
        == before
    )


def test_setup_checksum_failure_preserves_previous_artifact(
    tmp_path: Path, monkeypatch
) -> None:
    import io

    setup = importlib.import_module("shell_parser_setup")
    binary = prepared_copy(tmp_path)
    pointer = tmp_path / ".cache/shell-parser/current.json"
    old = pointer.read_bytes(), binary.read_bytes()
    # A changed bridge requires a new artifact; invalid archive must not publish it.
    with (tmp_path / "repo-tools/shell-parser/main.go").open("a") as stream:
        stream.write("\n")
    monkeypatch.setattr(
        setup.urllib.request, "urlopen", lambda *a, **kw: io.BytesIO(b"wrong archive")
    )
    with pytest.raises(ValueError, match="checksum"):
        setup.setup(tmp_path)
    assert (pointer.read_bytes(), binary.read_bytes()) == old
    assert not list((tmp_path / ".cache/shell-parser").glob("stage-*"))


def test_parser_never_executes_source_with_empty_environment(tmp_path: Path) -> None:
    artifact = importlib.import_module("shell_parser_artifact")
    binary = artifact.prepared_parser()
    sentinel = tmp_path / "executed"
    source = f'value="$(touch {sentinel})"\nprintf "%s" "$value"\n'
    result = subprocess.run(
        [str(binary)],
        input=source,
        text=True,
        capture_output=True,
        env={"HOME": str(tmp_path), "PATH": "/nonexistent"},
        check=True,
    )
    assert "File" in result.stdout
    assert not sentinel.exists()
    invalid = subprocess.run(
        [str(binary)],
        input="if then\n",
        text=True,
        capture_output=True,
        env={"HOME": str(tmp_path), "PATH": "/nonexistent"},
    )
    assert invalid.returncode != 0 and not invalid.stdout and invalid.stderr


@pytest.mark.parametrize(
    "output",
    [
        b"not JSON",
        b"[]",
        b'{"Type":"Unknown"}',
        b'{"Type":"File","Stmts":{}}',
        b'{"Type":"File","Stmts":[{}]}',
        b'{"Type":"File","Stmts":[{"Pos":{"Offset":-1,"Line":1,"Col":1},"End":{"Offset":2,"Line":1,"Col":3}}]}',
    ],
)
def test_malformed_parser_output_never_becomes_success(
    monkeypatch, output: bytes
) -> None:
    shell = importlib.import_module("template_prune_shell")
    monkeypatch.setattr(
        shell.subprocess,
        "run",
        lambda *a, **kw: subprocess.CompletedProcess(a, 0, output, b""),
    )
    with pytest.raises(shell.AnalysisError):
        shell.commands("task check:template")


def test_unsupported_setup_stops_before_network_or_cache(
    tmp_path: Path, monkeypatch
) -> None:
    setup = importlib.import_module("shell_parser_setup")
    artifact = importlib.import_module("shell_parser_artifact")
    monkeypatch.setattr(artifact.platform, "machine", lambda: "aarch64")
    with pytest.raises(ValueError, match="Ubuntu amd64"):
        setup.setup(tmp_path)
    assert not list(tmp_path.iterdir())


def stub_setup_build(root: Path, binary: Path, monkeypatch):
    """取得・展開・コンパイルだけを代用し、公開処理と実 parser smoke を残す。"""
    setup = importlib.import_module("shell_parser_setup")
    manifest, _ = setup.inputs(root)
    real_run = subprocess.run

    def extract(archive, destination):
        if archive.name == "source.tar.gz":
            source = destination / ("sh-" + manifest["source"]["commit"])
            (source / "cmd").mkdir(parents=True)
            shutil.copy2(root / "repo-tools/shell-parser/LICENSE", source / "LICENSE")

    def run(command, **kwargs):
        if command[:2] == ["git", "apply"]:
            return subprocess.CompletedProcess(command, 0)
        if command[1:2] == ["build"]:
            shutil.copy2(binary, Path(command[command.index("-o") + 1]))
            return subprocess.CompletedProcess(command, 0)
        return real_run(command, **kwargs)

    monkeypatch.setattr(setup, "download", lambda *args: None)
    monkeypatch.setattr(setup, "extract", extract)
    monkeypatch.setattr(setup.subprocess, "run", run)
    return setup


@pytest.mark.parametrize(
    "phase",
    ["download", "extract", "patch", "build", "smoke", "artifact_publish", "publish"],
)
def test_setup_failure_preserves_isolated_pointer_and_binary(
    tmp_path: Path, monkeypatch, phase: str
) -> None:
    binary = prepared_copy(tmp_path)
    pointer = tmp_path / ".cache/shell-parser/current.json"
    previous = pointer.read_bytes(), binary.read_bytes()
    bridge = tmp_path / "repo-tools/shell-parser/main.go"
    original_source = bridge.read_bytes()
    bridge.write_bytes(original_source + b"\n")
    setup = stub_setup_build(tmp_path, binary, monkeypatch)

    def fail(*args, **kwargs):
        raise OSError("injected " + phase)

    with monkeypatch.context() as injection:
        if phase in {"download", "extract"}:
            injection.setattr(setup, phase, fail)
        elif phase == "artifact_publish":
            rename = Path.rename

            def fail_artifact_publish(source, destination):
                if source.name == "publish":
                    raise PermissionError(errno.EACCES, "injected publication denial")
                return rename(source, destination)

            injection.setattr(Path, "rename", fail_artifact_publish)
        elif phase == "publish":
            replace = setup.os.replace

            def fail_publish(source, destination):
                if destination == pointer:
                    fail()
                return replace(source, destination)

            injection.setattr(setup.os, "replace", fail_publish)
        else:
            run = setup.subprocess.run

            def fail_process(command, **kwargs):
                boundary = (
                    "patch"
                    if command[:2] == ["git", "apply"]
                    else "build"
                    if command[1:2] == ["build"]
                    else "smoke"
                )
                if boundary == phase:
                    raise subprocess.CalledProcessError(1, ["injected", phase])
                return run(command, **kwargs)

            injection.setattr(setup.subprocess, "run", fail_process)
        with pytest.raises((OSError, subprocess.CalledProcessError), match="injected"):
            setup.setup(tmp_path)

    assert (pointer.read_bytes(), binary.read_bytes()) == previous
    assert not list(pointer.parent.glob("stage-*"))
    bridge.write_bytes(original_source)
    assert setup.prepared_parser(tmp_path) == binary


@pytest.mark.parametrize("collision_errno", [errno.EEXIST, errno.ENOTEMPTY])
def test_concurrent_setup_same_inputs_publishes_valid_artifact(
    tmp_path: Path, monkeypatch, collision_errno: int
) -> None:
    binary = prepared_copy(tmp_path)
    bridge = tmp_path / "repo-tools/shell-parser/main.go"
    bridge.write_bytes(bridge.read_bytes() + b"\n")
    setup = stub_setup_build(tmp_path, binary, monkeypatch)
    rename = Path.rename
    barrier = Barrier(2, timeout=10)
    collisions = []

    def simultaneous_publish(source, destination):
        if source.name == "publish":
            barrier.wait()
        try:
            return rename(source, destination)
        except OSError as error:
            if error.errno not in (errno.EEXIST, errno.ENOTEMPTY):
                raise
            collisions.append(error.errno)
            # 同じ競合でも filesystem が返す errno は異なる。
            raise OSError(collision_errno, "injected competing publication") from error

    monkeypatch.setattr(Path, "rename", simultaneous_publish)
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(setup.setup, tmp_path) for _ in range(2)]
        results = [future.result(timeout=20) for future in futures]
    assert results == [setup.prepared_parser(tmp_path)] * 2
    assert len(collisions) == 1
    assert not list((tmp_path / ".cache/shell-parser").glob("stage-*"))


@pytest.mark.parametrize("boundary", ["build", "publish"])
def test_concurrent_setup_different_inputs_never_accepts_stale_artifact(
    tmp_path: Path, monkeypatch, boundary: str
) -> None:
    binary = prepared_copy(tmp_path)
    previous_binary = binary.read_bytes()
    bridge = tmp_path / "repo-tools/shell-parser/main.go"
    bridge.write_bytes(bridge.read_bytes() + b"\n")
    setup = stub_setup_build(tmp_path, binary, monkeypatch)
    entered, release = Event(), Event()
    run, replace = setup.subprocess.run, setup.os.replace

    def pause_first():
        if not entered.is_set():
            entered.set()
            assert release.wait(timeout=20), "concurrent setup did not release"

    def paused_build(command, **kwargs):
        if boundary == "build" and command[1:2] == ["build"]:
            pause_first()
        return run(command, **kwargs)

    def paused_publish(source, destination):
        if boundary == "publish" and destination.name == "current.json":
            pause_first()
        return replace(source, destination)

    monkeypatch.setattr(setup.subprocess, "run", paused_build)
    monkeypatch.setattr(setup.os, "replace", paused_publish)
    with ThreadPoolExecutor(max_workers=1) as pool:
        stale = pool.submit(setup.setup, tmp_path)
        try:
            assert entered.wait(timeout=10), "first setup did not reach boundary"
            bridge.write_bytes(bridge.read_bytes() + b"\n")
            current = setup.setup(tmp_path)
            assert current == setup.prepared_parser(tmp_path)
        finally:
            release.set()
        with pytest.raises(ValueError, match="固定入力"):
            stale.result(timeout=20)

    if boundary == "publish":
        # 入力の再確認後に競合しても runtime は旧入力を成功として使わない。
        with pytest.raises(ValueError, match="固定入力"):
            setup.prepared_parser(tmp_path)
        assert setup.setup(tmp_path) == current
    assert setup.prepared_parser(tmp_path) == current
    assert binary.read_bytes() == previous_binary
    assert not list((tmp_path / ".cache/shell-parser").glob("stage-*"))
