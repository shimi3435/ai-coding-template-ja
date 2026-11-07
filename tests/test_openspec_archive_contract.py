"""下流に残るarchive手順の責務・順序・停止境界を守る静的contract。"""

from __future__ import annotations

import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
WORKFLOW = "docs/agents/workflow.md"
ARCHIVE_ANCHOR = "#下流の-archive-フロー"


def _read(path: str) -> str:
    return (REPO_ROOT / path).read_text(encoding="utf-8")


def _section(text: str, heading: str) -> str:
    level = len(heading) - len(heading.lstrip("#"))
    body = text.split(heading + "\n", 1)[1]
    return re.split(rf"\n#{{1,{level}}} ", body, maxsplit=1)[0]


def _downstream(text: str) -> str:
    return re.sub(
        r"<!-- template-maintenance:start -->.*?<!-- template-maintenance:end -->",
        "",
        text,
        flags=re.DOTALL,
    )


def test_archive_entrypoints_survive_without_template_maintenance() -> None:
    workflow = _downstream(_read(WORKFLOW))
    # 実pruneがmarkerを除く文書はworkflowとREADMEだけ。projectはそのまま残る。
    project = _read("openspec/project.md")
    guide = _read("docs/guide.md")

    assert "## 下流の archive フロー" in workflow
    assert ARCHIVE_ANCHOR in project
    assert ARCHIVE_ANCHOR in guide
    assert project == _downstream(project)
    assert "changes/archive/YYYY-MM-DD-<change-name>/" in project
    for text in (workflow, project):
        assert "ディレクトリ削除で行う" not in text
        assert "change directory を削除" not in text
        assert "出荷時は空" not in text
    assert "明示選択" in _read("AGENTS.md")


def test_same_pr_archive_is_reviewed_before_final_ci_and_merge() -> None:
    procedure = _section(_read(WORKFLOW), "### 同一実装PRでの手順")
    stages = (
        "1. **実装・focused validation**",
        "2. **artifacts・tasks・実装の対応をverify**",
        "3. **reviewを収束**",
        "4. **同じPRでspec同期・archive**",
        "5. **archive後diffをreview**",
        "6. **影響する検証と最終CI**",
    )
    positions = [procedure.index(stage) for stage in stages]
    assert positions == sorted(positions)
    for boundary in ("canonical specs", "保存したartifacts/tasks", "最終diff"):
        assert boundary in procedure
    assert "成功させてからmerge" in procedure
    assert "別PRでもOpenSpec validationとarchive後reviewは省略しない" in procedure


def test_cli_fallback_does_not_turn_missing_gates_into_success() -> None:
    workflow = _read(WORKFLOW)
    fallback = _section(workflow, "### CLIなしのMarkdown fallback")
    preparation = _section(workflow, "### 同期・移動前の確認と実行")

    for boundary in (
        "CLI不在時の失敗を手動確認成功へ",
        "未検証・未完了",
        "過去archive全件へ最新tasks形式の移行を要求しない",
        "canonical・archive内容を検証した証拠にはならない",
    ):
        assert boundary in fallback
    for boundary in (
        "ADDED / MODIFIED / REMOVED / RENAMED",
        "未変更の要件・scenarioを保持",
        "deltaなしなら同期不要",
        "全効果が内容から同期済み",
        "--yes",
        "--skip-specs",
        "`--no-validate`による検証省略は行わない",
    ):
        assert boundary in preparation


def test_partial_archive_failure_requires_state_inspection_before_retry() -> None:
    workflow = _read(WORKFLOW)
    recovery = _section(workflow, "### 部分失敗・再実行とarchive後修正")
    preparation = _section(workflow, "### 同期・移動前の確認と実行")

    assert "canonical・active・archiveの実状態を開始前と照合" in recovery
    assert "無条件再実行・自動rollbackは禁止" in recovery
    assert "既存先へ上書きしない" in preparation
    assert "日付を変えて衝突を回避しない" in preparation
    assert "一件ずつ同期" in preparation


def test_post_archive_corrections_reopen_verification_in_place() -> None:
    recovery = _section(_read(WORKFLOW), "### 部分失敗・再実行とarchive後修正")

    for boundary in (
        "既存差分の所有者",
        "検証checkboxと親taskを未完了へ戻",
        "archiveの場所を維持",
        "active-onlyのexecute-openspec-changeを再呼出しない",
        "stale evidenceは再利用しない",
        "新しい検証が成功した場合だけ",
        "仕様判断・scope拡大",
    ):
        assert boundary in recovery


def test_executor_hands_off_without_promoting_unverified_state_or_archiving() -> None:
    skill = _read(".agents/skills/execute-openspec-change/SKILL.md")
    report = _section(skill, "## 4. review・検証・報告")
    handoff = _section(_read(WORKFLOW), "### 完了状態と引き渡し")

    assert "#完了状態と引き渡し" in report
    assert ARCHIVE_ANCHOR in report
    for state in ("implementation complete", "archive-ready", "archive complete"):
        assert state in report
        assert state in handoff
    for boundary in (
        "全実装・検証checkboxが完了していない限りarchive-readyと報告しない",
        "既知blocker",
        "PRレビュー待ち・未確認",
        "全checkbox完了だけでarchive completeを宣言しない",
        "自動archive・自動削除は行わず",
        "active change専用",
    ):
        assert boundary in report
    assert "既知のPR blockerがあればreadyではない" in handoff
