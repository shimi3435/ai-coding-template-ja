"""OSWF-5 のリスク比例 review / verification contract。"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
CASES_PATH = REPO_ROOT / "tests/fixtures/review_convergence/cases.json"
POLICY_PATHS = (
    Path("AGENTS.md"),
    Path("CONTEXT.md"),
    Path("docs/agents/workflow.md"),
    Path("docs/template/adr/0009-proportional-agent-workflow-evidence-economy.md"),
    Path(".agents/skills/self-review/SKILL.md"),
    Path(".agents/skills/verify-change/SKILL.md"),
)


def _cases() -> dict[str, Any]:
    return json.loads(CASES_PATH.read_text(encoding="utf-8"))


def _read(path: Path) -> str:
    return (REPO_ROOT / path).read_text(encoding="utf-8")


def _assert_tokens_in_order(text: str, tokens: tuple[str, ...]) -> None:
    positions = [text.index(token) for token in tokens]
    assert positions == sorted(positions)


def test_agents_is_the_only_permanent_owner_of_the_full_risk_enumeration() -> None:
    agents = _read(Path("AGENTS.md"))
    risk_terms = (
        "security / trust boundary",
        "外部 write",
        "永続データ",
        "公開 interface",
        "dependency / lockfile",
        "build / CI",
        "削除 / migration",
    )

    assert "### OSWF-5 review 発火条件" in agents
    for term in risk_terms:
        assert term in agents
    for path in POLICY_PATHS[1:]:
        policy = _read(path)
        assert "OSWF-5" in policy, path
        assert not all(term in policy for term in risk_terms), path


def test_self_review_and_additional_executor_approval_are_mandatory() -> None:
    agents = _read(Path("AGENTS.md"))
    workflow = _read(Path("docs/agents/workflow.md"))

    assert "全変更で self-review" in agents
    assert "可能なら `self-review`" not in agents
    for policy in (agents, workflow):
        assert "追加 executor" in policy
        assert "別の利用者承認" in policy


def test_risk_fixture_requires_independent_agents_for_each_trigger_only() -> None:
    rows = _cases()["risk"]
    no_risk = next(row for row in rows if row["case"] == "none")
    triggered = [row for row in rows if row["case"] != "none"]

    assert no_risk["independent_review"] is False
    assert no_risk["independent_verifier"] is False
    assert len(triggered) == 7
    assert all(row["independent_review"] for row in triggered)
    assert all(row["independent_verifier"] for row in triggered)


def test_high_risk_topology_has_no_redundant_final_reviewer() -> None:
    workflow = _read(Path("docs/agents/workflow.md"))

    _assert_tokens_in_order(
        workflow,
        (
            "self-review（cycle の先頭に1回）",
            "initial independent review",
            "fix → focused validation → diff review（最大3 iterations）",
            "最新入力の `task check`",
            "initial reviewer と別の独立 verifier",
        ),
    )
    assert "fresh final full review" not in workflow
    assert "fresh final reviewer" not in workflow


def test_focused_validation_distinguishes_na_from_unverified() -> None:
    rows = {row["case"]: row for row in _cases()["focused_validation"]}
    workflow = _read(Path("docs/agents/workflow.md"))
    verify_skill = _read(Path(".agents/skills/verify-change/SKILL.md"))

    assert rows["structurally-not-applicable"] == {
        "case": "structurally-not-applicable",
        "complete": True,
        "requires_na_reason": True,
    }
    assert rows["environment-unavailable"]["complete"] is False
    assert rows["failed"]["complete"] is False
    for text in (workflow, verify_skill):
        assert "構造上非該当" in text
        assert "N/A 理由" in text
        assert "環境制約" in text
        assert "完了にできない" in text


def test_iteration_agent_and_infrastructure_limits_soft_stop() -> None:
    rows = {row["case"]: row for row in _cases()["limits"]}
    workflow = _read(Path("docs/agents/workflow.md"))

    assert rows["iteration-3"]["result"] == "soft-stop"
    assert rows["agent-failure-1"]["automatic_retry"] is True
    assert rows["agent-failure-2"]["result"] == "soft-stop"
    assert rows["infrastructure-failure-1"]["automatic_retry"] is True
    assert rows["infrastructure-failure-2"]["result"] == "soft-stop"
    assert "最大3 iterations" in workflow
    assert "連続2回失敗" in workflow
    assert "infrastructure failure が2回再現" in workflow


def test_verifier_blocker_requires_approved_new_cycle_and_new_verifier() -> None:
    case = _cases()["verifier_blocker"]
    workflow = _read(Path("docs/agents/workflow.md"))

    assert case["result"] == "soft-stop"
    assert case["fix_before_new_cycle_approval"] is False
    assert case["next_verifier"] == "different-from-previous-cycle"
    assert "利用者が新 cycle を承認した後だけ" in workflow
    assert "前 cycle と別の verifier" in workflow


def test_external_tool_state_never_completes_or_resumes_a_change() -> None:
    case = _cases()["external_tool_completed_with_open_checkbox"]
    policies = tuple(_read(path) for path in POLICY_PATHS)

    assert case == {"change_complete": False, "resume_from": "tasks.md"}
    assert any("tool 固有 state" in policy for policy in policies)
    assert any("品質条件にしない" in policy for policy in policies)
    assert any("`tasks.md`" in policy and "再開" in policy for policy in policies)


def test_command_result_summaries_are_the_only_persistent_review_evidence() -> None:
    agents = _read(Path("AGENTS.md"))
    workflow = _read(Path("docs/agents/workflow.md"))

    for policy in (agents, workflow):
        assert "command、結果、未検証理由の要約だけ" in policy
        assert "`tasks.md`" in policy
        assert "生 log" in policy


def test_self_review_and_verify_skills_share_fail_closed_evidence_fields() -> None:
    self_review = _read(Path(".agents/skills/self-review/SKILL.md"))
    verify = _read(Path(".agents/skills/verify-change/SKILL.md"))
    minimum_fields = (
        "実行 command",
        "exit 0",
        "source commit",
        "dirty diff digest",
        "dependency environment",
        "lockfile",
        "build / CI 設定",
        "fixtures",
        "repository real path",
        "worktree",
        "source snapshot",
        "OS",
        "locale",
        "認証",
    )

    for skill in (self_review, verify):
        assert "OSWF-5" in skill
        for field in minimum_fields:
            assert field in skill
    assert "未検証を検証済みとして報告しない" in verify
