"""Git変換を尊重しながら生bytes・index・対象外差分を保護する。"""

import importlib
import shlex
from pathlib import Path

import pytest
from template_prune_fixture import ASSETS, commit_fixture, fixture, git, plan
from test_template_prune_plan import snapshot

apply = importlib.import_module("template_prune_apply").apply


def clean_checkout(tmp_path: Path, conversion: str) -> Path:
    source = tmp_path / "source"
    source.mkdir()
    fixture(source)
    if conversion == "attributes":
        (source / ".gitattributes").write_text("* text eol=crlf\n")
    commit_fixture(source)
    root = tmp_path / "checkout"
    options = ["-c", "core.autocrlf=true"] if conversion == "autocrlf" else []
    git(tmp_path, "clone", "-q", *options, str(source), str(root))
    assert b"\r\n" in (root / "README.md").read_bytes()
    assert git(root, "status", "--porcelain=v1").stdout == ""
    return root


@pytest.mark.parametrize("conversion", ["autocrlf", "attributes"])
def test_clean_crlf_checkout_preserves_unrelated_bytes_and_index(
    tmp_path: Path, conversion: str
) -> None:
    root = clean_checkout(tmp_path, conversion)
    (root / "docs/adr/.gitkeep").write_text("staged\n")
    git(root, "add", "docs/adr/.gitkeep")
    (root / "docs/adr/.gitkeep").write_text("unstaged\n")
    (root / "user-notes.md").write_bytes(b"untracked\r\n")
    before = snapshot(root)
    proposal = plan(root)
    assert not proposal["blockers"], proposal["blockers"]
    assert snapshot(root) == before
    result = apply(proposal)
    assert result["ok"], result
    assert (root / "README.md").read_bytes() == b"# common\r\n"
    assert (root / "docs/agents/workflow.md").read_bytes() == b"# common\r\n"
    taskfile = (root / "Taskfile.yml").read_bytes()
    assert b"\n" not in taskfile.replace(b"\r\n", b"")
    after = snapshot(root)
    for path in (".git/index", "docs/adr/.gitkeep", "user-notes.md", ".git/config"):
        assert after[path] == before[path]
    assert apply(plan(root))["ok"]


def test_filemode_false_allows_initial_mode_difference(tmp_path: Path) -> None:
    fixture(tmp_path)
    commit_fixture(tmp_path)
    git(tmp_path, "config", "core.fileMode", "false")
    (tmp_path / "README.md").chmod(0o755)
    assert git(tmp_path, "status", "--porcelain=v1").stdout == ""
    index = (tmp_path / ".git/index").read_bytes()
    result = apply(plan(tmp_path))
    assert result["ok"], result
    assert (tmp_path / "README.md").stat().st_mode & 0o777 == 0o755
    assert (tmp_path / ".git/index").read_bytes() == index


@pytest.mark.parametrize(
    "attribute", ["filter=probe", "filter", "ident", "working-tree-encoding=UTF-16"]
)
def test_unsupported_conversion_is_rejected_before_filter_execution(
    tmp_path: Path, attribute: str
) -> None:
    fixture(tmp_path)
    commit_fixture(tmp_path)
    sentinel = tmp_path / "filter-ran"
    git(
        tmp_path,
        "config",
        "filter.probe.clean",
        f"touch {shlex.quote(str(sentinel))}; cat",
    )
    (tmp_path / ".git/info/attributes").write_text(f"README.md {attribute}\n")
    before = snapshot(tmp_path)
    proposal = plan(tmp_path)
    assert proposal["blockers"], attribute
    assert any(
        "未対応" in error and "README.md" in error for error in proposal["blockers"]
    )
    assert not apply(proposal)["ok"]
    assert not sentinel.exists()
    assert snapshot(tmp_path) == before


@pytest.mark.parametrize(
    "damage", ["unstaged", "staged", "untracked", "assume-unchanged", "skip-worktree"]
)
def test_crlf_checkout_still_rejects_target_changes(
    tmp_path: Path, damage: str
) -> None:
    root = clean_checkout(tmp_path, "autocrlf")
    path = ASSETS[0]
    if damage in ("assume-unchanged", "skip-worktree"):
        git(root, "update-index", "--" + damage, path)
    if damage == "untracked":
        (root / "docs/template/local.txt").write_text("user content")
    else:
        (root / path).write_text("user content\r\n")
    if damage == "staged":
        git(root, "add", path)
    before = snapshot(root)
    assert plan(root)["blockers"]
    assert snapshot(root) == before


@pytest.mark.parametrize("damage", ["raw-newlines", "mode"])
@pytest.mark.parametrize("phase", ["after-preview", "between-writes"])
def test_git_equivalent_concurrent_change_is_not_hidden(
    tmp_path: Path, monkeypatch, damage: str, phase: str
) -> None:
    root = clean_checkout(tmp_path, "autocrlf")
    git(root, "config", "core.fileMode", "false")
    proposal = plan(root)
    assert not proposal["blockers"], proposal["blockers"]
    target = root / "Taskfile.yml"
    original = Path.write_bytes

    def change():
        if damage == "raw-newlines":
            original(target, target.read_bytes().replace(b"\r\n", b"\n"))
        else:
            target.chmod(0o755)

    def write(path, data):
        result = original(path, data)
        if path == root / "README.md":
            change()
        return result

    if phase == "after-preview":
        change()
    else:
        monkeypatch.setattr(Path, "write_bytes", write)
    result = apply(proposal)
    assert not result["ok"]
    assert (root / ASSETS[0]).exists()
    if damage == "raw-newlines":
        assert b"\r\n" not in target.read_bytes()
    else:
        assert target.stat().st_mode & 0o777 == 0o755


@pytest.mark.parametrize("name", ["unset", "unspecified"])
@pytest.mark.parametrize("driver", ["clean", "process", None])
def test_literal_filter_state_name_is_rejected_before_execution(
    tmp_path: Path, name: str, driver: str | None
) -> None:
    fixture(tmp_path)
    commit_fixture(tmp_path)
    sentinel = tmp_path / "filter-ran"
    if driver:
        git(
            tmp_path,
            "config",
            f"filter.{name}.{driver}",
            f"touch {shlex.quote(str(sentinel))}; cat",
        )
    (tmp_path / ".git/info/attributes").write_text(f"README.md filter={name}\n")
    before = snapshot(tmp_path)
    proposal = plan(tmp_path)
    assert not sentinel.exists(), "preview must not execute a filter"
    assert proposal["blockers"], "literal attribute values are not attribute states"
    assert not apply(proposal)["ok"]
    assert snapshot(tmp_path) == before


@pytest.mark.parametrize("attribute", ["-filter", "!filter"])
def test_real_disabled_filter_state_stays_supported(tmp_path: Path, attribute: str):
    fixture(tmp_path)
    commit_fixture(tmp_path)
    sentinel = tmp_path / "filter-ran"
    for name in ("unset", "unspecified"):
        for driver in ("clean", "process"):
            git(
                tmp_path,
                "config",
                f"filter.{name}.{driver}",
                f"touch {shlex.quote(str(sentinel))}; cat",
            )
    (tmp_path / ".git/info/attributes").write_text(f"README.md {attribute}\n")
    assert apply(plan(tmp_path))["ok"]
    assert not sentinel.exists()


@pytest.mark.parametrize("encoding", ["unset", "unspecified"])
@pytest.mark.parametrize("empty", [False, True])
def test_literal_encoding_state_name_is_rejected_without_changes(
    tmp_path: Path, encoding: str, empty: bool
) -> None:
    fixture(tmp_path)
    path = "docs/template/empty.txt" if empty else "README.md"
    if empty:
        (tmp_path / path).write_bytes(b"")
    commit_fixture(tmp_path)
    (tmp_path / ".git/info/attributes").write_text(
        f"{path} working-tree-encoding={encoding}\n"
    )
    before = snapshot(tmp_path)
    proposal = plan(tmp_path)
    assert proposal["blockers"], "literal encoding value is not a disabled attribute"
    assert any("working-tree-encoding" in error for error in proposal["blockers"])
    result = apply(proposal)
    assert not result["ok"] and not result["changed"]
    assert snapshot(tmp_path) == before


@pytest.mark.parametrize(
    "attribute", ["-working-tree-encoding", "!working-tree-encoding"]
)
@pytest.mark.parametrize("crlf", [False, True])
def test_disabled_encoding_preserves_normal_checkout(
    tmp_path: Path, attribute: str, crlf: bool
) -> None:
    if crlf:
        root = clean_checkout(tmp_path, "autocrlf")
    else:
        root = fixture(tmp_path)
        commit_fixture(root)
    (root / ".git/info/attributes").write_text(f"README.md {attribute}\n")
    before = snapshot(root)
    proposal = plan(root)
    assert not proposal["blockers"], proposal["blockers"]
    assert snapshot(root) == before
    assert apply(proposal)["ok"]
    assert (root / "README.md").read_bytes() == (
        b"# common\r\n" if crlf else b"# common\n"
    )
    assert (root / ".git/index").read_bytes() == before[".git/index"][1]
