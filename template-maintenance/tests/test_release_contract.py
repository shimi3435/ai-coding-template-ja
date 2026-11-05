"""テンプレート保守専用の release handoff と由来版固定。"""

from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]


def test_v2_runtime_breaking_change_is_handed_off_without_bumping_version() -> None:
    release_guide = (REPO_ROOT / "docs" / "template" / "release.md").read_text(
        encoding="utf-8"
    )

    assert (REPO_ROOT / "TEMPLATE_VERSION").read_text(encoding="utf-8") == "1.0.0\n"
    for contract in (
        "establish-v2-runtime-foundation",
        "Node.js 24",
        "Python >=3.14",
        "破壊的変更",
        "prepare-v2-release",
        "全 4 changes",
        "TEMPLATE_VERSION=2.0.0",
        "移行ガイド最終化",
        "release-ready 判定",
    ):
        assert contract in release_guide


def release_block() -> str:
    """利用者が実行する公開ブロックを文書から取得する。"""
    import re
    import textwrap

    guide = (REPO_ROOT / "docs/template/release.md").read_text(encoding="utf-8")
    blocks = [
        textwrap.dedent(block)
        for block in re.findall(r"```bash\n(.*?)```", guide, re.S)
    ]
    return next(
        block for block in blocks if block.startswith("unset VERSION RELEASE_COMMIT")
    )


def release_fixture(tmp_path, normal_exit=0, maintenance_exit=0, mutation=""):
    """実Gitとlocal bare remoteを使い、品質gateとGitHub公開だけを代替する。"""
    import os
    import shutil
    import subprocess

    root = tmp_path / "release repository"
    remote = tmp_path / "remote.git"
    root.mkdir()
    env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
    env.update(GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_GLOBAL=os.devnull)
    real_git = shutil.which("git")
    assert real_git is not None

    def git(*args):
        return subprocess.run(
            [real_git, *args],
            cwd=root,
            env=env,
            text=True,
            capture_output=True,
            check=True,
        ).stdout.strip()

    git("init", "-q", "-b", "main")
    git("config", "user.name", "Release probe")
    git("config", "user.email", "release@example.invalid")
    git("config", "core.hooksPath", os.devnull)
    (root / "TEMPLATE_VERSION").write_text("1.0.0\n")
    (root / "scripts").mkdir()
    gate = root / "scripts/check.sh"
    gate.write_text(
        '#!/bin/sh\nprintf "normal\\n" >> "$RELEASE_TRACE"\nexit "$NORMAL_EXIT"\n'
    )
    gate.chmod(0o755)
    git("add", ".")
    git("commit", "-qm", "initial")
    previous = git("rev-parse", "HEAD")
    git("commit", "--allow-empty", "-qm", "release candidate")
    commit = git("rev-parse", "HEAD")
    git("init", "-q", "--bare", str(remote))
    git("remote", "add", "origin", str(remote))
    git("push", "-q", "origin", "main")
    commands = tmp_path / "commands"
    commands.mkdir()
    task = commands / "task"
    task.write_text("""#!/bin/sh
[ "$*" = "check:template" ] || exit 97
printf 'maintenance\n' >> "$RELEASE_TRACE"
case "$GATE_MUTATION" in
  dirty) printf 'changed\n' >> TEMPLATE_VERSION ;;
  head) "$REAL_GIT" commit --allow-empty -qm 'changed during gate' ;;
  remote)
    "$REAL_GIT" --git-dir="$REMOTE_REPO" update-ref refs/heads/main "$PREVIOUS_COMMIT"
    ;;
  offline) "$REAL_GIT" remote set-url origin "$MISSING_REMOTE" ;;
esac
exit "$MAINTENANCE_EXIT"
""")
    task.chmod(0o755)
    gh = commands / "gh"
    gh.write_text('#!/bin/sh\nprintf "release:%s\\n" "$*" >> "$RELEASE_TRACE"\n')
    gh.chmod(0o755)
    trace = tmp_path / "trace"
    env.update(
        PATH=str(commands) + os.pathsep + env["PATH"],
        RELEASE_TRACE=str(trace),
        NORMAL_EXIT=str(normal_exit),
        MAINTENANCE_EXIT=str(maintenance_exit),
        GATE_MUTATION=mutation,
        REAL_GIT=real_git,
        REMOTE_REPO=str(remote),
        PREVIOUS_COMMIT=previous,
        MISSING_REMOTE=str(tmp_path / "missing.git"),
    )
    return root, remote, env, git, trace, commit


def test_release_stops_before_publication_when_maintenance_gate_fails(tmp_path):
    import subprocess

    root, remote, env, git, trace, _ = release_fixture(tmp_path, maintenance_exit=1)
    result = subprocess.run(
        ["bash", "-c", release_block()],
        cwd=root,
        env=env,
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0, result.stdout + result.stderr
    assert git("tag", "--list") == ""
    assert git("--git-dir=" + str(remote), "tag", "--list") == ""
    assert trace.read_text().splitlines() == ["normal", "maintenance"]


@pytest.mark.parametrize("mutation", ["dirty", "head", "remote", "offline"])
def test_release_refuses_state_changes_during_gates(tmp_path, mutation):
    import subprocess

    root, remote, env, git, trace, _ = release_fixture(tmp_path, mutation=mutation)
    result = subprocess.run(
        ["bash", "-c", release_block()],
        cwd=root,
        env=env,
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0, result.stdout + result.stderr
    assert git("tag", "--list") == ""
    assert git("--git-dir=" + str(remote), "tag", "--list") == ""
    assert trace.read_text().splitlines() == ["normal", "maintenance"]


def test_release_stops_before_publication_when_normal_gate_fails(tmp_path):
    import subprocess

    root, remote, env, git, trace, _ = release_fixture(tmp_path, normal_exit=1)
    result = subprocess.run(
        ["bash", "-c", release_block()],
        cwd=root,
        env=env,
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0, result.stdout + result.stderr
    assert git("tag", "--list") == ""
    assert git("--git-dir=" + str(remote), "tag", "--list") == ""
    assert trace.read_text().splitlines() == ["normal"]


def test_release_publishes_the_verified_commit_after_both_gates(tmp_path):
    import subprocess

    root, remote, env, git, trace, commit = release_fixture(tmp_path)
    result = subprocess.run(
        ["bash", "-c", release_block()],
        cwd=root,
        env=env,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert git("cat-file", "-t", "refs/tags/v1.0.0") == "tag"
    assert git("rev-parse", "v1.0.0^{commit}") == commit
    assert git("--git-dir=" + str(remote), "rev-parse", "v1.0.0^{commit}") == commit
    assert trace.read_text().splitlines() == [
        "normal",
        "maintenance",
        "release:release create v1.0.0 --verify-tag --title v1.0.0 --generate-notes",
    ]


@pytest.mark.parametrize("location", ["local", "remote"])
def test_release_preserves_existing_tag_guards(tmp_path, location):
    import subprocess

    root, remote, env, git, trace, _ = release_fixture(tmp_path)
    git("tag", "v1.0.0")
    if location == "remote":
        git("push", "origin", "v1.0.0")
        git("tag", "-d", "v1.0.0")
    before = (
        git("show-ref", "--tags")
        if location == "local"
        else git("--git-dir=" + str(remote), "show-ref", "--tags")
    )
    result = subprocess.run(
        ["bash", "-c", release_block()],
        cwd=root,
        env=env,
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0, result.stdout + result.stderr
    after = (
        git("show-ref", "--tags")
        if location == "local"
        else git("--git-dir=" + str(remote), "show-ref", "--tags")
    )
    assert after == before
    assert trace.read_text().splitlines() == ["normal", "maintenance"]


def test_release_does_not_start_gates_from_a_dirty_tree(tmp_path):
    import subprocess

    root, remote, env, git, trace, _ = release_fixture(tmp_path)
    (root / "TEMPLATE_VERSION").write_text("2.0.0\n")
    result = subprocess.run(
        ["bash", "-c", release_block()],
        cwd=root,
        env=env,
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0, result.stdout + result.stderr
    assert not trace.exists()
    assert git("tag", "--list") == ""
    assert git("--git-dir=" + str(remote), "tag", "--list") == ""


def test_release_prerequisites_and_example_require_both_gates():
    guide = (REPO_ROOT / "docs/template/release.md").read_text(encoding="utf-8")
    prerequisites = guide.split("## リリース前提チェック（必須）\n", 1)[1].split(
        "## リリース手順", 1
    )[0]
    required, example = prerequisites.split("```bash\n", 1)
    for command in ("./scripts/check.sh", "task check:template"):
        assert f"`{command}`" in required
        assert command in example.split("```", 1)[0].splitlines()
