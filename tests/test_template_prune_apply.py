"""apply の保護、途中失敗と復旧を disposable Git repository で確認する。"""

import importlib
from pathlib import Path

import pytest
from template_prune_fixture import (
    ASSETS,
    KEPT,
    commit_fixture,
    fixture,
    git,
    inspect,
    plan,
)
from test_template_prune_plan import load_script, snapshot


def test_apply_partial_cwd_preserves_unrelated_files_and_index(
    tmp_path: Path, capsys
) -> None:
    fixture(tmp_path)
    (tmp_path / "scripts/build.sh").write_text("cd src\nmake\n")
    commit_fixture(tmp_path)
    (tmp_path / "local.txt").write_text("untracked")
    (tmp_path / "docs/adr/.gitkeep").write_text("staged")
    git(tmp_path, "add", "docs/adr/.gitkeep")
    (tmp_path / "docs/adr/.gitkeep").write_text("unstaged")
    before = snapshot(tmp_path)
    cli = load_script("prune-template-docs.py")
    cli.REPO_ROOT = tmp_path
    assert cli.main(["--apply"]) == 0
    output = capsys.readouterr().out
    assert "partial" in output and "完全除去" in output
    after = snapshot(tmp_path)
    for name, value in before.items():
        if name.startswith(("docs/template", "template-maintenance")) or name in (
            ".github/workflows/template-maintenance.yml",
            "Taskfile.yml",
            "README.md",
            "docs/agents/workflow.md",
        ):
            continue
        assert after[name] == value, name
    assert all((tmp_path / p).is_file() for p in KEPT)
    assert cli.main(["--apply"]) == 0
    assert snapshot(tmp_path) == after


def test_apply_rechecks_inputs_before_first_write(tmp_path: Path) -> None:
    fixture(tmp_path)
    commit_fixture(tmp_path)
    proposal = plan(tmp_path)
    (tmp_path / "README.md").write_text("concurrent change")
    before = snapshot(tmp_path)
    engine = importlib.import_module("template_prune_apply")
    result = engine.apply(proposal)
    assert not result["ok"] and not result["changed"]
    assert snapshot(tmp_path) == before


@pytest.mark.parametrize("phase", ["first", "shared", "delete", "postcheck"])
def test_failure_reports_partial_state_and_targeted_recovery(
    tmp_path: Path, monkeypatch, phase: str
) -> None:
    fixture(tmp_path)
    commit_fixture(tmp_path)
    engine = importlib.import_module("template_prune_apply")
    proposal = plan(tmp_path)
    before = snapshot(tmp_path)
    original_write = Path.write_bytes
    original_unlink = Path.unlink
    original_inspect = engine.inspect
    writes = 0

    def write(p, data):
        nonlocal writes
        writes += 1
        if (phase == "first" and writes == 1) or (phase == "shared" and writes == 2):
            raise OSError("injected write failure")
        return original_write(p, data)

    def unlink(p, *args, **kwargs):
        if phase == "delete" and p == tmp_path / ASSETS[0]:
            raise OSError("injected delete failure")
        return original_unlink(p, *args, **kwargs)

    def inspect_after(root):
        if phase == "postcheck":
            raise OSError("injected postcheck failure")
        return original_inspect(root)

    with monkeypatch.context() as patch:
        patch.setattr(Path, "write_bytes", write)
        patch.setattr(Path, "unlink", unlink)
        patch.setattr(engine, "inspect", inspect_after)
        result = engine.apply(proposal)
    assert not result["ok"] and result["failed"]
    assert result["head"] == proposal["head"]
    assert "git restore" in result["recovery"] and "reset" not in result["recovery"]
    assert snapshot(tmp_path)[".git/index"] == before[".git/index"]
    assert all(snapshot(tmp_path)[p] == before[p] for p in KEPT)
    if phase == "first":
        assert snapshot(tmp_path) == before
    elif phase == "postcheck":
        assert inspect(tmp_path)["state"] == "pruned"
        assert plan(tmp_path)["blockers"] == []
    else:
        assert result["changed"] and result["pending"]
        assert plan(tmp_path)["blockers"]
    git(
        tmp_path,
        "restore",
        "--source=" + proposal["head"],
        "--worktree",
        "--",
        "docs/template",
        "template-maintenance",
        ".github/workflows/template-maintenance.yml",
        "Taskfile.yml",
        "README.md",
        "docs/agents/workflow.md",
    )
    assert engine.apply(plan(tmp_path))["ok"]


@pytest.mark.parametrize(
    "damage",
    [
        "shared-outside",
        "rename",
        "conflict",
        "submodule",
        "ancestor",
        "dangling",
        "read-error",
    ],
)
def test_apply_preflight_rejects_damage_without_writes(
    tmp_path: Path, monkeypatch, damage: str
) -> None:
    fixture(tmp_path)
    commit_fixture(tmp_path)
    target = tmp_path / ASSETS[0]
    if damage == "shared-outside":
        with (tmp_path / "README.md").open("a") as stream:
            stream.write("outside edit\n")
    elif damage == "rename":
        git(tmp_path, "mv", ASSETS[0], ASSETS[0] + ".moved")
    elif damage == "conflict":
        import subprocess

        oid = git(tmp_path, "rev-parse", "HEAD:" + ASSETS[0]).stdout.strip()
        subprocess.run(
            ["git", "update-index", "--index-info"],
            cwd=tmp_path,
            input=f"100644 {oid} 1\t{ASSETS[0]}\n",
            text=True,
            check=True,
        )
    elif damage == "submodule":
        oid = git(tmp_path, "rev-parse", "HEAD").stdout.strip()
        git(
            tmp_path,
            "update-index",
            "--add",
            "--cacheinfo",
            f"160000,{oid},docs/template/submodule",
        )
    elif damage == "ancestor":
        (tmp_path / "docs/template/adr").rename(tmp_path / "outside-adr")
        (tmp_path / "docs/template/adr").symlink_to(
            tmp_path / "outside-adr", target_is_directory=True
        )
    elif damage == "dangling":
        target.unlink()
        target.symlink_to(tmp_path / "missing")
    before = snapshot(tmp_path)
    cli = load_script("prune-template-docs.py")
    cli.REPO_ROOT = tmp_path
    original = Path.read_bytes

    def read(p):
        if damage == "read-error" and p == target:
            raise PermissionError("injected read failure")
        return original(p)

    with monkeypatch.context() as patch:
        patch.setattr(Path, "read_bytes", read)
        assert cli.main(["--apply"]) == 1
    assert snapshot(tmp_path) == before


def test_crlf_customization_unicode_paths_and_linked_worktree(tmp_path: Path) -> None:
    source = tmp_path / "source"
    source.mkdir()
    fixture(source)
    for path in ("README.md", "docs/agents/workflow.md", "Taskfile.yml"):
        p = source / path
        p.write_bytes(
            p.read_bytes().replace(b"\n", b"\r\n") + b"\r\n# outside customization\r\n"
        )
    extra = "docs/template/space 日本語\nextra.txt"
    (source / extra).write_bytes(b"extra")
    commit_fixture(source)
    worktree = tmp_path / "linked worktree"
    git(source, "worktree", "add", "--detach", str(worktree))
    proposal = plan(worktree)
    assert not proposal["blockers"] and extra in proposal["deletions"]
    assert all(
        "\r\n# outside customization\r\n" in value
        for value in proposal["edits"].values()
    )
    expected = {p: s.encode() for p, s in proposal["edits"].items()}
    engine = importlib.import_module("template_prune_apply")
    assert engine.apply(proposal)["ok"]
    for path, value in expected.items():
        assert (worktree / path).read_bytes() == value
    git(worktree, "add", "-u")
    git(worktree, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "pruned")
    assert not plan(worktree)["blockers"]
    assert engine.apply(plan(worktree))["ok"]


def test_recheck_between_writes_preserves_new_changes(
    tmp_path: Path, monkeypatch
) -> None:
    fixture(tmp_path)
    commit_fixture(tmp_path)
    proposal = plan(tmp_path)
    engine = importlib.import_module("template_prune_apply")
    original = Path.write_bytes

    def write(p, data):
        result = original(p, data)
        if p.name == "README.md":
            original(tmp_path / "Taskfile.yml", b"concurrent")
        return result

    monkeypatch.setattr(Path, "write_bytes", write)
    result = engine.apply(proposal)
    assert not result["ok"]
    assert (tmp_path / "Taskfile.yml").read_bytes() == b"concurrent"
    assert (tmp_path / ASSETS[0]).exists()


def test_interrupted_write_is_rejected_on_retry(tmp_path: Path, monkeypatch) -> None:
    fixture(tmp_path)
    commit_fixture(tmp_path)
    engine = importlib.import_module("template_prune_apply")
    proposal = plan(tmp_path)
    original = Path.write_bytes

    def write(p, data):
        original(p, data)
        raise KeyboardInterrupt

    with monkeypatch.context() as patch:
        patch.setattr(Path, "write_bytes", write)
        with pytest.raises(KeyboardInterrupt):
            engine.apply(proposal)
    assert plan(tmp_path)["blockers"]
    assert not list(tmp_path.glob("*.tmp"))


def test_allowed_reference_locations_disappear_with_prune(tmp_path: Path) -> None:
    import json

    from template_prune_fixture import CASES

    fixture(tmp_path)
    for surface in ("R01", "R02", "R03", "R04", "R05", "R06"):
        case = next(
            c for c in CASES if c["surface"] == surface and c["expected"] == "detected"
        )
        p = tmp_path / "docs/template" / (surface + Path(case["path"]).suffix)
        p.write_text(case["source"])
    command_case = next(c for c in CASES if c["id"] == "package-command")
    command = next(iter(json.loads(command_case["source"])["scripts"].values()))
    p = tmp_path / "Taskfile.yml"
    p.write_text(p.read_text().replace("echo maintenance", command))
    markdown = next(c["source"] for c in CASES if c["id"] == "markdown-64")
    for name in ("README.md", "docs/agents/workflow.md"):
        p = tmp_path / name
        p.write_text(
            p.read_text().replace(
                "<!-- template-maintenance:end -->",
                markdown + "\n<!-- template-maintenance:end -->",
            )
        )
    commit_fixture(tmp_path)
    proposal = plan(tmp_path)
    assert not proposal["blockers"], proposal
    assert importlib.import_module("template_prune_apply").apply(proposal)["ok"]


@pytest.mark.parametrize("bundled", [True, False])
@pytest.mark.parametrize("args", [[], ["--apply"]])
def test_analysis_error_blocks_preview_apply_and_noop_without_writes(
    tmp_path: Path, bundled: bool, args: list[str], capsys
) -> None:
    fixture(tmp_path, bundled)
    (tmp_path / "scripts/probe.sh").write_text("if then\n")
    commit_fixture(tmp_path)
    before = snapshot(tmp_path)
    cli = load_script("prune-template-docs.py")
    cli.REPO_ROOT = tmp_path
    assert cli.main(args) == 1
    assert snapshot(tmp_path) == before
    assert "scripts/probe.sh" in capsys.readouterr().out


def test_analysis_error_in_postcheck_preserves_recovery_diagnostics(
    tmp_path: Path, monkeypatch
) -> None:
    fixture(tmp_path)
    commit_fixture(tmp_path)
    engine = importlib.import_module("template_prune_apply")
    proposal = plan(tmp_path)
    original = engine.inspect

    def postcheck(root):
        (root / "scripts/broken.sh").write_text("if then\n")
        return original(root)

    monkeypatch.setattr(engine, "inspect", postcheck)
    result = engine.apply(proposal)
    assert not result["ok"] and result["failed"] == "postcheck"
    assert result["changed"] and result["state"]["state"] == "pruned"
    assert result["state"]["analysis_errors"]
    rendered = "\n".join(engine.failure_report(result))
    assert "scripts/broken.sh" in rendered and proposal["head"] in rendered


def test_malformed_postcheck_keeps_recovery_report(tmp_path: Path, monkeypatch) -> None:
    fixture(tmp_path)
    commit_fixture(tmp_path)
    engine = importlib.import_module("template_prune_apply")
    proposal = plan(tmp_path)
    monkeypatch.setattr(engine, "inspect", lambda root: {})
    result = engine.apply(proposal)
    rendered = "\n".join(engine.failure_report(result))
    assert not result["ok"] and result["failed"] == "postcheck"
    assert proposal["head"] in rendered and "git restore" in rendered
    assert "protocol" in rendered
