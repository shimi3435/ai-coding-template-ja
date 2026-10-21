"""使い捨て repository の実コマンド検証。保守 gate は再帰実行しない。"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]


def run(
    root: Path, *args: str, offline: Path | None = None
) -> subprocess.CompletedProcess[str]:
    env = dict(os.environ)
    env.pop("VIRTUAL_ENV", None)
    env["PATH"] = str(root / ".venv/bin") + os.pathsep + env["PATH"]
    if offline is not None:
        for key, directory in (
            ("HOME", "home"),
            ("CODEX_HOME", "codex"),
            ("XDG_CONFIG_HOME", "config"),
            ("XDG_CACHE_HOME", "cache"),
        ):
            p = offline / directory
            p.mkdir(parents=True, exist_ok=True)
            env[key] = str(p)
        for key in tuple(env):
            if key.endswith("_TOKEN") or key in (
                "GH_TOKEN",
                "GITHUB_TOKEN",
                "SSH_AUTH_SOCK",
            ):
                env.pop(key, None)
        env.update(
            UV_OFFLINE="1",
            HTTP_PROXY="http://127.0.0.1:9",
            HTTPS_PROXY="http://127.0.0.1:9",
            ALL_PROXY="http://127.0.0.1:9",
            NO_PROXY="",
        )
        # 明示した検証だけ実 network namespace を使う。hosted CI の可用性とは分離する。
        if os.environ.get("PRUNE_TEST_NETWORK_NAMESPACE") == "1":
            args = ("unshare", "--user", "--map-root-user", "--net", *args)
    result = subprocess.run(args, cwd=root, env=env, capture_output=True, text=True)
    assert result.returncode == 0, f"{args}:\n{result.stdout}\n{result.stderr}"
    return result


def copy_repository(root: Path) -> None:
    paths = subprocess.check_output(
        ["git", "ls-files", "-c", "-o", "--exclude-standard", "-z"], cwd=REPO_ROOT
    )
    for raw in set(paths.split(b"\0")) - {b""}:
        relative = Path(os.fsdecode(raw))
        source = REPO_ROOT / relative
        if not source.exists() and not source.is_symlink():
            continue
        target = root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        if source.is_symlink():
            target.symlink_to(os.readlink(source))
        else:
            shutil.copy2(source, target)
    run(root, "git", "init", "-q")
    run(root, "git", "config", "user.name", "Prune fixture")
    run(root, "git", "config", "user.email", "prune@example.invalid")
    run(root, "git", "add", ".")
    run(root, "git", "-c", "core.hooksPath=/dev/null", "commit", "-qm", "fixture")


def execute_smoke(tmp_path: Path) -> None:
    copy_repository(tmp_path)
    run(tmp_path, "task", "setup")
    run(tmp_path, "./scripts/check.sh")
    run(tmp_path, "task", "doctor")
    run(
        tmp_path,
        "uv",
        "run",
        "--no-sync",
        "python",
        "scripts/rename-package.py",
        "downstream_probe",
        "--apply",
    )
    run(tmp_path, "./scripts/check.sh")
    run(tmp_path, "task", "doctor")

    run(tmp_path, "git", "add", "-u")
    run(
        tmp_path,
        "git",
        "-c",
        "core.hooksPath=/dev/null",
        "commit",
        "-qm",
        "renamed fixture",
    )
    isolated = tmp_path.parent / (tmp_path.name + "-offline")
    try:
        before = run(tmp_path, "git", "status", "--porcelain=v1").stdout
        preview = run(tmp_path, "task", "prune-template-docs", offline=isolated)
        assert "partial" in preview.stdout
        assert run(tmp_path, "git", "status", "--porcelain=v1").stdout == before
        run(tmp_path, "task", "prune-template-docs", "--", "--apply", offline=isolated)
        assert not (tmp_path / "template-maintenance").exists()
        assert not (tmp_path / ".github/workflows/template-maintenance.yml").exists()
        assert (tmp_path / ".github/workflows/ci.yml").is_file()
        run(tmp_path, "./scripts/check.sh", offline=isolated)
        run(tmp_path, "task", "doctor", offline=isolated)
        rerun = run(
            tmp_path, "task", "prune-template-docs", "--", "--apply", offline=isolated
        )
        assert "no-op" in rerun.stdout
        run(tmp_path, "git", "add", "-u")
        run(
            tmp_path,
            "git",
            "-c",
            "core.hooksPath=/dev/null",
            "commit",
            "-qm",
            "pruned fixture",
        )
        run(tmp_path, "task", "prune-template-docs", "--", "--apply", offline=isolated)
        run(tmp_path, "task", "setup")
        run(tmp_path, "./scripts/check.sh", offline=isolated)
        run(tmp_path, "task", "doctor", offline=isolated)
    finally:
        shutil.rmtree(isolated, ignore_errors=True)


def test_full_lifecycle_uses_the_real_common_gate(tmp_path: Path) -> None:
    with tempfile.TemporaryDirectory(prefix="prune-smoke-", dir=tmp_path) as directory:
        execute_smoke(Path(directory))


@pytest.mark.parametrize("phase", ["copy", "setup", "later", "success"])
def test_smoke_cleans_its_repository_on_all_exit_paths(
    tmp_path: Path, monkeypatch, phase: str
) -> None:
    calls = 0

    def copy(root: Path) -> None:
        for name in (".git", ".venv", "node_modules"):
            (root / name).mkdir()
            (root / name / "fixture").write_text("owned")
        (root / ".github/workflows").mkdir(parents=True)
        (root / ".github/workflows/ci.yml").write_text("fixture")
        if phase == "copy":
            raise OSError("injected copy failure")

    def command(root: Path, *args: str, offline=None):
        nonlocal calls
        calls += 1
        if offline is not None:
            offline.mkdir(exist_ok=True)
        if (phase == "setup" and calls == 1) or (phase == "later" and calls == 10):
            raise OSError("injected command failure")
        return subprocess.CompletedProcess(args, 0, "partial no-op", "")

    monkeypatch.setitem(globals(), "copy_repository", copy)
    monkeypatch.setitem(globals(), "run", command)
    if phase == "success":
        test_full_lifecycle_uses_the_real_common_gate(tmp_path)
    else:
        with pytest.raises(OSError, match="injected"):
            test_full_lifecycle_uses_the_real_common_gate(tmp_path)
    assert list(tmp_path.iterdir()) == []
