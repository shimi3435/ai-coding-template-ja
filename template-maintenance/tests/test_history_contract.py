"""テンプレート保守専用の履歴・出荷契約。共通テストからは import しない。"""

from __future__ import annotations

import importlib.util
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
LEGACY_TOKEN = "g" + "sd"
TEMPLATE_SLUG = "-".join(("ai", "coding", "template", "ja"))
V2_NOTES = Path("docs/template/v2-release-notes.md")
ADR_PATH = Path("docs/template/adr/0010-openspec-direct-execution.md")


def _read(path: Path) -> str:
    return (REPO_ROOT / path).read_text(encoding="utf-8")


def _residual_contract():
    path = REPO_ROOT / "tests/test_tool_neutral_documentation_contract.py"
    spec = importlib.util.spec_from_file_location("residual_contract", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


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


def test_adr_0011_amends_retired_automation_and_preserves_history() -> None:
    adr = (
        REPO_ROOT / "docs/template/adr/0011-v2-distribution-boundaries.md"
    ).read_text(encoding="utf-8")
    header, body = adr.split("## 文脈", maxsplit=1)
    assert "> Status: Accepted" in header
    assert "> Amended in part by" in header
    for issue in (71, 75):
        assert f"https://github.com/shimi3435/{TEMPLATE_SLUG}/issues/{issue}" in header
    assert "downstream optional / opt-in / prune方針" in header
    assert "#64へのplugin更新PR統合案" in header
    assert "撤回" in header
    assert "他の責務境界を一括で失効させない" in header
    assert "../../guide.md#7-skillの手動更新と旧自動化の撤去" in header
    assert "#64のPR自動化は別の任意機能" in body
    assert "既定無効・明示opt-in・専用資産prune可能" in body


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
    contract = _residual_contract()
    assert contract._legacy_token_violations(contract._tracked_paths()) == []


def test_v2_notes_preserve_removed_integration_retrospective_history() -> None:
    notes = (REPO_ROOT / V2_NOTES).read_text(encoding="utf-8")
    retrospectives = (REPO_ROOT / "docs/template/retrospectives.md").read_text(
        encoding="utf-8"
    )
    workflow = (REPO_ROOT / "docs/template/release.md").read_text(encoding="utf-8")
    closed_change_id = "externalize-" + LEGACY_TOKEN + "-from-core"

    for pull_request, defect_count in (
        ("PR #40", "逃した欠陥 1 件"),
        ("PR #41", "逃した欠陥 6 件"),
        ("PR #53", "逃した欠陥 27 件"),
    ):
        assert pull_request in notes
        assert defect_count in notes
    assert f"{closed_change_id}（PR #53）: 逃した欠陥 27 件" in notes
    pointer_line = next(
        line for line in retrospectives.splitlines() if "PR #53" in line
    )
    assert "[v2 release notes](v2-release-notes.md)" in pointer_line
    assert closed_change_id not in retrospectives
    assert "change ID 自体が retired legacy token を含み" in workflow
    assert (
        "`docs/template/retrospectives.md` に置くと最終 "
        "residual allowlist に違反する場合だけ" in workflow
    )
    assert "固定形式の本体を exact history allowlist" in workflow
    assert "archive pointer" in workflow
    assert "この例外は既存 allowlist を拡張せず" in workflow
    assert "両条件を満たさない change の保存先を変更しない" in workflow


def test_adr_0010_supersedes_both_obsolete_route_decisions() -> None:
    legacy_token = "g" + "sd"
    adr_0003_name = f"0003-openspec-{legacy_token}-boundary.md"
    adr_0008_name = f"0008-adaptive-openspec-{legacy_token}-execution-boundary.md"
    adr = _read(ADR_PATH)
    adr_0003 = _read(Path("docs/template/adr") / adr_0003_name)
    adr_0008 = _read(Path("docs/template/adr") / adr_0008_name)

    assert "> Status: Accepted." in adr
    assert "Supersedes: ADR-0003 and ADR-0008." in adr
    assert adr_0003_name not in adr
    assert adr_0008_name not in adr
    assert "Superseded by [ADR-0010](0010-openspec-direct-execution.md)" in adr_0003
    assert "Superseded by [ADR-0010](0010-openspec-direct-execution.md)" in adr_0008


def test_historical_policy_keeps_named_opt_in_and_single_risk_owner() -> None:
    policy = _read(ADR_PATH)
    for token in (
        "外部 orchestrator",
        "利用者が特定の名前を選ぶ前",
        "read-only 探索",
        "在席確認",
        "plugin 検索",
        "version probe",
        "install",
        "起動",
    ):
        assert token in policy
    policy = _read(
        Path("docs/template/adr/0009-proportional-agent-workflow-evidence-economy.md")
    )
    assert "OSWF-5" in policy
    assert not all(
        token in policy
        for token in (
            "security / trust boundary",
            "外部 write",
            "永続データ",
            "公開 interface",
            "dependency / lockfile",
            "build / CI",
            "削除 / migration",
        )
    )


def test_history_links_resolve() -> None:
    import re

    for source in (REPO_ROOT / "docs/template").rglob("*.md"):
        for raw in re.findall(r"\[[^\]]+\]\(([^)]+)\)", source.read_text()):
            target = raw.split("#", 1)[0]
            if target and "://" not in target and not target.startswith("mailto:"):
                assert (source.parent / target).resolve().exists(), (source, raw)


def test_release_completion_instruction_keeps_canonical_gate() -> None:
    text = _read(Path("docs/template/release.md"))
    assert "./scripts/check.sh" in text
    assert "最新入力の `task check`" not in text
