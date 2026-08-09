"""恒久 policy interface の bounded review convergence contract。"""

from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
POLICY_PATHS = (
    Path("docs/template/adr/0009-proportional-agent-workflow-evidence-economy.md"),
    Path("AGENTS.md"),
    Path("CONTEXT.md"),
    Path("docs/agents/workflow.md"),
    Path(".agents/skills/self-review/SKILL.md"),
    Path(".agents/skills/verify-change/SKILL.md"),
)


def _policies() -> dict[str, str]:
    return {
        path.as_posix(): (REPO_ROOT / path).read_text(encoding="utf-8")
        for path in POLICY_PATHS
    }


def _assert_tokens_in_order(text: str, tokens: tuple[str, ...]) -> None:
    positions = [text.index(token) for token in tokens]
    assert positions == sorted(positions)


def test_contract_reads_only_permanent_policy_interfaces() -> None:
    assert tuple(path.as_posix() for path in POLICY_PATHS) == (
        "docs/template/adr/0009-proportional-agent-workflow-evidence-economy.md",
        "AGENTS.md",
        "CONTEXT.md",
        "docs/agents/workflow.md",
        ".agents/skills/self-review/SKILL.md",
        ".agents/skills/verify-change/SKILL.md",
    )


def test_workflow_fixes_the_bounded_topology_and_iteration_boundary() -> None:
    workflow = _policies()["docs/agents/workflow.md"]

    assert "## bounded review convergence" in workflow
    _assert_tokens_in_order(
        workflow,
        (
            "self-review（cycle の先頭に1回）",
            "initial full review",
            "fix → focused validation → diff review（最大3 iterations）",
            "fresh final full review",
            "task check",
            "独立 verifier",
        ),
    )
    assert "blocker を成功扱いしない" in workflow
    assert "OpenSpec 直接経路では change、GSD 経路では phase" in workflow


def test_full_reviews_preserve_independent_semantic_backstops() -> None:
    workflow = _policies()["docs/agents/workflow.md"]

    assert "initial review が clean でも" in workflow
    assert "initial reviewer と別の fresh agent" in workflow
    assert "severity label ではなく" in workflow
    assert "acceptance criteria または MUST / SHALL の未達" in workflow
    assert "RED test または再現 probe" in workflow


def test_workflow_classifies_fix_evidence_by_defect_kind() -> None:
    workflow = _policies()["docs/agents/workflow.md"]

    assert "correctness / contract finding は RED test または再現 probe" in workflow
    assert "純 prose の事実誤り" in workflow
    assert "矛盾箇所、修正前 evidence、テスト化しない理由" in workflow
    assert "mechanical typo / format / unused import" in workflow
    assert "RED を要求せず focused validation だけ" in workflow


def test_validation_failures_return_to_the_remaining_diff_review_budget() -> None:
    workflow = _policies()["docs/agents/workflow.md"]

    assert "source / test failure は blocker finding" in workflow
    assert "残 iteration で fix、focused validation" in workflow
    assert "full review は再実行しない" in workflow
    assert "同一入力の自律 retry を1回だけ許す" in workflow
    assert "再現した場合は blocker として" in workflow


def test_policy_defines_command_scoped_fail_closed_evidence_reuse() -> None:
    policies = _policies()
    workflow = policies["docs/agents/workflow.md"]
    verify_skill = policies[".agents/skills/verify-change/SKILL.md"]

    for text in (workflow, verify_skill):
        assert "command 単位" in text
        assert "source commit" in text
        assert "dirty diff digest" in text
        assert "入力同一性" in text
        assert "不明なら再実行" in text
    assert "focused tests / 実動作 seam は再利用しない" in verify_skill


def test_agent_allocation_and_soft_stop_are_reachable_from_agents_policy() -> None:
    policies = _policies()
    agents = policies["AGENTS.md"]
    workflow = policies["docs/agents/workflow.md"]

    assert "material 実装は原則1 executor" in agents
    assert "finding ごとに fresh agent を作らない" in agents
    assert "fresh final reviewer" in agents
    assert "同じ cycle の executor / reviewers と別の独立 verifier" in agents
    assert "最大3 iterations" in agents
    assert "## task 単位のサブエージェント委譲" not in workflow
    assert "同じ役割の連続失敗2回" in workflow
    assert "iteration 0 の新しい convergence cycle" in workflow


def test_verifier_is_cycle_independent_and_conditionally_reusable() -> None:
    policies = _policies()
    agents = policies["AGENTS.md"]
    workflow = policies["docs/agents/workflow.md"]

    assert "fresh final reviewer" in agents
    assert "fresh final full review" in workflow
    for policy in (agents, workflow):
        assert "同じ cycle の executor / reviewers と別の独立 verifier" in policy
        assert "旧 cycle の verifier" in policy
        assert "fix に関与せず" in policy
        assert "context contamination" in policy
        assert "evidence identity" in policy


def test_allocation_covers_partial_results_exceptions_and_main_corrections() -> None:
    policies = _policies()
    agents = policies["AGENTS.md"]
    workflow = policies["docs/agents/workflow.md"]

    assert "部分差分を採用した場合" in workflow
    assert "focused validation と diff review を完了した時点で1 iteration" in workflow
    assert "vendored `code-review` skill を明示選択した場合だけ" in workflow
    correction_policy = (
        "`STATE`、`ROADMAP`、checkbox、report path の機械的補正は main が処理する"
    )
    assert correction_policy in workflow
    assert correction_policy in agents


def test_soft_stop_reports_recovery_fields_without_obsolete_delegation_policy() -> None:
    workflow = _policies()["docs/agents/workflow.md"]

    for report_field in (
        "cycle と iteration `3/3`",
        "未解決 blockers",
        "各 iteration の追加差分",
        "focused tests と",
        "使用 agent と追加理由",
        "停止理由",
        "継続・再計画・別 change 化・中断の選択肢",
    ):
        assert report_field in workflow
    assert "## material task の executor 配分" in workflow
    assert "task 単位のサブエージェント委譲" not in workflow


def test_inventory_close_partial_results_and_measurement_have_explicit_edges() -> None:
    workflow = _policies()["docs/agents/workflow.md"]

    assert "全スコープ inventory は cycle 開始時に固定する" in workflow
    for inventory_item in (
        "change / phase が所有する変更ファイル",
        "canonical spec と acceptance criteria",
        "直接依存と直接利用元、関連 tests / fixtures",
        "変更で触れた trust boundary",
        "無関係な repository 全体、過去 report、全 `.planning`",
    ):
        assert inventory_item in workflow
    close_policy = workflow.split("### pre-merge close 後の検証", maxsplit=1)[1]
    _assert_tokens_in_order(
        close_policy,
        (
            "close 前に strict target validate",
            "retrospective と",
            "change directory を削除した後",
            "active change 0 / green",
            "`task check` evidence を再利用する",
        ),
    )
    assert "成果ゼロ、無応答、採用しない部分差分は iteration を消費しない" in workflow
    assert "既存 Issue または上記 retrospective の" in workflow
    assert "どちらか一方の1行" in workflow


def test_adr_terms_and_skills_preserve_the_policy_boundaries() -> None:
    policies = _policies()
    adr = policies[
        "docs/template/adr/0009-proportional-agent-workflow-evidence-economy.md"
    ]
    context = policies["CONTEXT.md"]
    self_review = policies[".agents/skills/self-review/SKILL.md"]

    assert "## Bounded review convergence" in adr
    assert "最大3 iterations" in adr
    assert "material expansion" in adr
    assert "fresh final full review" in adr
    assert "同じ cycle の executor / reviewers と別の独立 verifier" in adr
    assert "旧 cycle の verifier" in adr
    assert "fix に関与せず" in adr
    assert "context contamination" in adr
    assert "evidence identity" in adr
    for term in (
        "**convergence cycle**",
        "**iteration**",
        "**reusable green evidence**",
        "**soft stop**",
    ):
        assert term in context
    for material_expansion_category in (
        "永続データ形式 / migration",
        "runtime dependency / lockfile",
        "build / CI / 配布経路",
    ):
        assert material_expansion_category in context
    assert (
        "[docs/agents/workflow.md](docs/agents/workflow.md#bounded-review-convergence)"
        in context
    )
    assert "cycle の先頭に1回だけ" in self_review
    assert "cycle 内の self-review は全体 check を要求しない" in self_review
    assert "focused validation" in self_review
    assert "initial reviewer" in self_review
    assert "standalone self-review" in self_review
    assert "同じ全体 check を再実行しない" in self_review


def test_self_review_inventory_handles_untracked_large_and_unreadable_files() -> None:
    self_review = _policies()[".agents/skills/self-review/SKILL.md"]

    assert "`git ls-files --others --exclude-standard`" in self_review
    assert "未追跡 file" in self_review
    assert "ignored file は除外" in self_review
    assert "固定 size cap は設けない" in self_review
    for file_identity in ("path", "size", "type"):
        assert file_identity in self_review
    assert "全文を安全に読めない" in self_review
    assert "truncation" in self_review
    assert "full-scope 内の required evidence" in self_review
    assert "scope 外または optional" in self_review
    assert "理由と影響" in self_review


def test_self_review_distinguishes_red_defects_from_mechanical_fixes() -> None:
    self_review = _policies()[".agents/skills/self-review/SKILL.md"]

    assert "correctness / contract defect" in self_review
    assert "RED test または再現 probe" in self_review
    assert "純 prose" in self_review
    assert "矛盾 evidence" in self_review
    assert "mechanical typo / format / unused import" in self_review
    assert "RED を要求しない" in self_review
    assert "focused validation だけ" in self_review


def test_minimum_green_evidence_fields_align_across_policy_and_skills() -> None:
    policies = _policies()
    evidence_owners = (
        policies["docs/agents/workflow.md"],
        policies[".agents/skills/self-review/SKILL.md"],
        policies[".agents/skills/verify-change/SKILL.md"],
    )
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

    for evidence_owner in evidence_owners:
        for minimum_field in minimum_fields:
            assert minimum_field in evidence_owner


def test_verify_change_classifies_missing_and_optional_evidence_fail_closed() -> None:
    verify_change = _policies()[".agents/skills/verify-change/SKILL.md"]

    for required_owner in (
        "acceptance criteria",
        "MUST / SHALL",
        "project gate",
    ):
        assert required_owner in verify_change
    assert "required evidence が欠落" in verify_change
    assert "required 性が不明" in verify_change
    assert "blocker" in verify_change
    for optional_class in (
        "optional seam",
        "明示的 out-of-scope",
        "研究環境制約",
    ):
        assert optional_class in verify_change
    assert "理由と影響" in verify_change
    assert "non-blocker" in verify_change
    assert "未検証を検証済みとして報告しない" in verify_change
