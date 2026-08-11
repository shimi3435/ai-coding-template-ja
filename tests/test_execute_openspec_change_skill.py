"""OpenSpec change 直接 executor skill の静的 contract。"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
SKILL_PATH = REPO_ROOT / ".agents/skills/execute-openspec-change/SKILL.md"
CASES_PATH = REPO_ROOT / "tests/fixtures/execute_openspec_change/cases.json"


def _skill() -> str:
    return SKILL_PATH.read_text(encoding="utf-8")


def _cases() -> dict[str, Any]:
    return json.loads(CASES_PATH.read_text(encoding="utf-8"))


def _assert_tokens_in_order(text: str, tokens: tuple[str, ...]) -> None:
    positions = [text.index(token) for token in tokens]
    assert positions == sorted(positions)


def test_invocation_authorizes_direct_execution_without_second_preview() -> None:
    skill = _skill()

    assert "明示呼出自体" in skill
    assert "実装と必要な reviewer / verifier の順次起動を承認" in skill
    assert "追加 preview 承認を要求しない" in skill
    assert "外部 orchestrator" not in skill


def test_preflight_checks_four_conditions_before_any_mutation() -> None:
    skill = _skill()

    _assert_tokens_in_order(
        skill,
        (
            "## 1. preflight",
            "active change が exactly one",
            "必須 OpenSpec artifacts が valid",
            "spec-holes に未解決判断がない",
            "詳細 tasks が valid",
            "## 2. dirty overlap",
            "## 3. task 実行",
        ),
    )
    assert "4条件を全て確認するまで repository を変更しない" in skill
    assert "fail-closed" in skill


def test_preflight_fixture_covers_zero_one_multiple_and_invalid_inputs() -> None:
    rows = {row["case"]: row for row in _cases()["preflight"]}

    assert rows["active-change-zero"]["result"] == "stop-before-mutation"
    assert rows["active-change-one"]["result"] == "continue"
    assert rows["active-change-multiple"]["result"] == "stop-before-mutation"
    for case in (
        "missing-required-artifact",
        "invalid-required-artifact",
        "unresolved-spec-hole",
        "missing-task-field",
    ):
        assert rows[case]["result"] == "stop-before-mutation"


def test_preflight_requires_exactly_three_execution_constraints() -> None:
    skill = _skill()
    rows = {row["case"]: row for row in _cases()["preflight"]}

    assert rows["exact-execution-constraints"]["result"] == "continue"
    for case in (
        "missing-execution-constraint",
        "duplicate-execution-constraint",
        "extra-execution-constraint",
    ):
        assert rows[case]["result"] == "stop-before-mutation"

    assert "Execution Constraints section" in skill
    assert "exactly 3" in skill
    assert "欠落、重複、余剰" in skill
    assert "次のheadingまで" in skill


def test_detailed_task_contract_and_dependency_selection_are_explicit() -> None:
    skill = _skill()

    for required_field in (
        "成果",
        "依存",
        "対象",
        "実装 checkbox",
        "検証 checkbox",
    ):
        assert required_field in skill
    assert "依存が全て完了した先頭の未完了 task" in skill
    assert "循環依存" in skill
    assert "実行可能 task がない" in skill

    rows = {row["case"]: row for row in _cases()["task_selection"]}
    assert rows["dependency-order"]["selected"] == "1"
    assert rows["rerun"]["selected"] == "2"


def test_verification_state_cannot_be_promoted_to_completion() -> None:
    skill = _skill()
    row = next(
        row
        for row in _cases()["task_selection"]
        if row["case"] == "verification-incomplete"
    )

    assert row["implementation_complete"] is True
    assert row["verification_complete"] is False
    assert row["task_complete"] is False
    assert row["change_close_allowed"] is False
    assert "検証 checkbox は未完了" in skill
    assert "change close を禁止" in skill
    assert "構造上非該当" in skill
    assert "N/A 理由" in skill


def test_dirty_overlap_blocks_only_paths_owned_by_unfinished_tasks() -> None:
    skill = _skill()
    rows = {row["case"]: row for row in _cases()["dirty_worktree"]}

    assert rows["overlapping-dirty"]["result"] == "stop-before-mutation"
    assert rows["unrelated-dirty"]["result"] == "continue-preserving-dirty"
    assert rows["resume-matching-executor-digest"]["result"] == "continue-validation"
    assert (
        rows["completed-task-dirty-overlaps-next-task"]["result"]
        == "continue-implementation"
    )
    assert rows["resume-changed-executor-path"]["result"] == "stop-before-mutation"
    assert "未完了 task の対象 path" in skill
    assert "重複 path を列挙して停止" in skill
    assert "無関係 dirty 差分を保持して続行" in skill
    assert "executor-owned paths" in skill
    assert "post-task diff digest" in skill
    assert "累積 executor-owned snapshot" in skill
    assert "最後に変更した task" in skill
    assert "後続の未実装 task" in skill
    assert "digest が一致" in skill
    assert "自動 stash" in skill
    assert "上書き" in skill


def test_blocker_persistence_starts_only_after_safe_boundary() -> None:
    skill = _skill()
    rows = {row["case"]: row for row in _cases()["blocker_persistence"]}

    for case in ("preflight-failure", "dirty-overlap"):
        assert rows[case]["tasks_mutated"] is False
        assert rows[case]["persistence"] == "report-only"

    assert rows["dependency-blocked-after-safe-boundary"]["persistence"] == "task-2"
    assert rows["implementation-blocker"]["persistence"] == "task-2"
    assert rows["validation-blocker"]["persistence"] == "task-2"
    assert rows["review-or-project-check-blocker"]["persistence"] == "task-4"
    assert rows["review-blocker-after-all-validations"]["persistence"] == "task-4"

    assert "safe boundary" in skill
    assert "preflight または dirty overlap の失敗" in skill
    assert "report-only" in skill
    assert "task execution blocker" in skill
    assert "文書順で先頭の未解決 task" in skill
    assert "先頭の未完了 validation task" in skill
    assert "文書順で最後の task" in skill


def test_review_and_verification_blockers_reopen_completion_state() -> None:
    skill = _skill()
    rows = _cases()["completion_reopen"]

    assert [row["stage"] for row in rows] == [
        "initial-review",
        "diff-review",
        "project-check",
        "verifier",
    ]
    for row in rows:
        assert row["persistence"] == "task-4"
        assert row["validation_before"] is True
        assert row["validation_after"] is False
        assert row["parent_after"] is False

    assert "initial / diff review" in skill
    assert "完了済みの検証 checkbox" in skill
    assert "検証 checkbox と親 task を未完了へ戻す" in skill
    assert "blocker 解消後の新しい evidence" in skill


def test_orderly_stop_snapshots_partial_implementation_and_crash_fails_closed() -> None:
    skill = _skill()
    rows = {row["case"]: row for row in _cases()["partial_ownership"]}

    matching = rows["orderly-stop-with-partial-diff"]
    assert matching["implementation_complete"] is False
    assert matching["snapshot_state"] == "implementation-in-progress"
    assert matching["digest_matches"] is True
    assert matching["result"] == "continue-implementation"

    changed = rows["partial-digest-changed-before-resume"]
    assert changed["digest_matches"] is False
    assert changed["result"] == "stop-before-mutation"

    abrupt = rows["abrupt-termination-without-snapshot"]
    assert abrupt["snapshot_recorded"] is False
    assert abrupt["result"] == "stop-before-mutation"

    assert "orderly stop" in skill
    assert "implementation-in-progress" in skill
    assert "実装 checkbox が未完了" in skill
    assert "実装途中 task" in skill
    assert "実装を継続" in skill
    assert "abrupt termination" in skill
    assert "未記録差分" in skill


def test_rerun_resumes_without_rewriting_completed_tasks() -> None:
    skill = _skill()

    assert "再呼出" in skill
    assert "完了済み task を再実行しない" in skill
    assert "実装済み・検証未完了" in skill
    assert "検証から再開" in skill


def test_git_publication_operations_are_forbidden() -> None:
    skill = _skill()

    for operation in _cases()["forbidden_git_operations"]:
        assert f"`{operation}`" in skill
    assert "利用者の別の明示依頼まで実行しない" in skill


def test_review_and_stop_boundaries_reference_canonical_requirements() -> None:
    skill = _skill()

    _assert_tokens_in_order(
        skill,
        (
            "self-review",
            "focused validation",
            "initial independent review",
            "最大3 iterations",
            "最新入力の `task check`",
            "独立 verifier",
        ),
    )
    assert "`AGENTS.md` の OSWF-5" in skill
    assert "追加 executor" in skill
    assert "別の明示承認" in skill
    assert "不可逆操作" in skill
    assert "外部 write" in skill
    assert "仕様拡張" in skill
    assert "利用者承認まで停止" in skill


def test_report_updates_tasks_but_never_creates_tool_state() -> None:
    skill = _skill()

    assert "command、結果、未検証理由の要約だけ" in skill
    assert "生 log" in skill
    assert "tool 固有 state" in skill
    assert "`tasks.md`" in skill
