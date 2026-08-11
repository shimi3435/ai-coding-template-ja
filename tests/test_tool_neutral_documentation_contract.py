"""現行文書と履歴 allowlist の tool-neutral contract。"""

from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
LEGACY_TOKEN = "g" + "sd"
TEMPLATE_SLUG = "-".join(("ai", "coding", "template", "ja"))
TOKEN_BOUNDARY = re.compile(rf"(?i)(^|[^a-z0-9]){LEGACY_TOKEN}([^a-z0-9]|$)".encode())
V2_NOTES = Path("docs/template/v2-release-notes.md")
CURRENT_TEMPLATE_DOC_SURFACES = (
    Path("README.md"),
    Path("Taskfile.yml"),
    Path("scripts/doctor.py"),
    Path("scripts/prune-template-docs.py"),
)
ALLOWED_PATHS = {
    Path("docs/template/adr/0003-openspec-" + LEGACY_TOKEN + "-boundary.md"),
    Path(
        "docs/template/adr/0008-adaptive-openspec-"
        + LEGACY_TOKEN
        + "-execution-boundary.md"
    ),
    V2_NOTES,
}


def _tracked_paths(root: Path = REPO_ROOT) -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files", "-c", "-z"],
        cwd=root,
        check=True,
        capture_output=True,
    )
    return [Path(raw.decode()) for raw in result.stdout.split(b"\0") if raw]


def _legacy_token_violations(paths: list[Path], root: Path = REPO_ROOT) -> list[str]:
    violations: list[str] = []
    for relative in paths:
        absolute = root / relative
        if not absolute.exists() and not absolute.is_symlink():
            continue
        allowed = relative in ALLOWED_PATHS
        path_match = TOKEN_BOUNDARY.search(relative.as_posix().encode()) is not None
        if absolute.is_symlink():
            payload = os.fsencode(os.readlink(absolute))
        elif absolute.is_file():
            payload = absolute.read_bytes()
        else:
            payload = b""
        text_match = TOKEN_BOUNDARY.search(payload)
        if (path_match or text_match) and not allowed:
            violations.append(relative.as_posix())
    return violations


def test_current_docs_explain_direct_execution_and_markdown_fallback() -> None:
    for path in (Path("README.md"), Path("docs/guide.md")):
        text = (REPO_ROOT / path).read_text(encoding="utf-8")
        assert "OpenSpec 直接実行" in text, path
        assert "Markdown fallback" in text, path
        assert "execute-openspec-change" in text, path


def test_obsolete_optional_guide_and_historical_grill_are_not_distributed() -> None:
    assert not (REPO_ROOT / "docs/optional" / (LEGACY_TOKEN + ".md")).exists()
    assert not (REPO_ROOT / "docs/template/grill" / f"{TEMPLATE_SLUG}.md").exists()


def test_current_template_doc_surfaces_use_tool_neutral_meta_doc_wording() -> None:
    stale_fragments = (
        "ADR 0001-0006",
        "ADR 0001-0007",
        "ADR / grill",
        "ADR・grill",
        "構築記録（grill）",
        "grill 記録",
        f"docs/template/grill/{TEMPLATE_SLUG}.md",
    )

    for path in CURRENT_TEMPLATE_DOC_SURFACES:
        text = (REPO_ROOT / path).read_text(encoding="utf-8")
        assert "テンプレ固有メタ文書" in text, path
        for fragment in stale_fragments:
            assert fragment not in text, (path, fragment)


def test_adr_0006_preserves_history_and_records_the_v2_current_state() -> None:
    adr = (
        REPO_ROOT / "docs/template/adr/0006-template-meta-docs-isolated.md"
    ).read_text(encoding="utf-8")

    assert "`grill.md` / `docs/grill/`" in adr
    assert "> Status: Accepted." in adr
    assert "> Amended by [ADR-0010](0010-openspec-direct-execution.md)." in adr
    assert "## v2 現状" in adr
    assert f"`docs/template/grill/{TEMPLATE_SLUG}.md` は削除済み" in adr
    assert "テンプレ固有メタ文書" in adr


def test_v2_notes_document_breaking_removal_and_direct_migration() -> None:
    notes = (REPO_ROOT / V2_NOTES).read_text(encoding="utf-8")

    for interface in (
        "openspec_" + LEGACY_TOKEN + "_handoff",
        "openspec-" + LEGACY_TOKEN + "-handoff-smoke.py",
        "openspec:" + LEGACY_TOKEN + "-handoff:smoke",
    ):
        assert interface in notes
    assert "互換 shim なし" in notes
    assert "OpenSpec 直接実行" in notes
    assert "`tasks.md`" in notes
    assert "execute-openspec-change" in notes


def test_legacy_token_remains_only_in_exact_history_allowlist() -> None:
    assert _legacy_token_violations(_tracked_paths()) == []


def test_repository_scan_detects_tracked_violation_and_ignores_untracked(
    tmp_path: Path,
) -> None:
    subprocess.run(["git", "init", "-q"], cwd=tmp_path, check=True)
    tracked = Path("docs/tracked.txt")
    untracked = Path("docs") / ("untracked-" + LEGACY_TOKEN + ".txt")
    (tmp_path / tracked).parent.mkdir()
    (tmp_path / tracked).write_text(LEGACY_TOKEN, encoding="utf-8")
    (tmp_path / untracked).write_text(LEGACY_TOKEN, encoding="utf-8")
    subprocess.run(["git", "add", tracked.as_posix()], cwd=tmp_path, check=True)

    paths = _tracked_paths(tmp_path)

    assert paths == [tracked]
    assert _legacy_token_violations(paths, root=tmp_path) == [tracked.as_posix()]


def test_residual_scan_rejects_a_broken_symlink_with_legacy_token(
    tmp_path: Path,
) -> None:
    relative = Path("docs") / ("old-" + LEGACY_TOKEN + "-link")
    link = tmp_path / relative
    link.parent.mkdir()
    link.symlink_to("missing-target")

    assert _legacy_token_violations([relative], root=tmp_path) == [relative.as_posix()]


def test_residual_scan_rejects_legacy_token_in_broken_symlink_payload(
    tmp_path: Path,
) -> None:
    relative = Path("docs/old-link")
    link = tmp_path / relative
    link.parent.mkdir()
    link.symlink_to("missing-" + LEGACY_TOKEN + "-target")

    assert _legacy_token_violations([relative], root=tmp_path) == [relative.as_posix()]


def test_v2_notes_preserve_removed_integration_retrospective_history() -> None:
    notes = (REPO_ROOT / V2_NOTES).read_text(encoding="utf-8")
    retrospectives = (REPO_ROOT / "docs/template/retrospectives.md").read_text(
        encoding="utf-8"
    )

    for pull_request, defect_count in (
        ("PR #40", "逃した欠陥 1 件"),
        ("PR #41", "逃した欠陥 6 件"),
        ("PR #53", "逃した欠陥 27 件"),
    ):
        assert pull_request in notes
        assert defect_count in notes
    assert "v2 release notes" in retrospectives


def test_primary_documentation_links_resolve() -> None:
    link_pattern = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
    for relative in (
        Path("README.md"),
        Path("docs/guide.md"),
        Path("docs/agents/workflow.md"),
        V2_NOTES,
    ):
        source = REPO_ROOT / relative
        for raw_target in link_pattern.findall(source.read_text(encoding="utf-8")):
            target = raw_target.split("#", maxsplit=1)[0]
            if not target or "://" in target or target.startswith("mailto:"):
                continue
            resolved = (source.parent / target).resolve()
            assert resolved.exists(), f"{relative}: broken link {raw_target}"
