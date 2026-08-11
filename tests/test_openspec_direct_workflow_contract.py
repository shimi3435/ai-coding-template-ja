"""OpenSpec 直接実行を単一経路とする恒久 policy contract。"""

from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
LEGACY_TOKEN = "g" + "sd"
EXECUTOR_SKILL = Path(".agents/skills/execute-openspec-change/SKILL.md")
CURRENT_POLICY_PATHS = (
    Path("AGENTS.md"),
    Path("CONTEXT.md"),
    Path("openspec/project.md"),
    Path("docs/agents/workflow.md"),
)
ADR_PATH = Path("docs/template/adr/0010-openspec-direct-execution.md")


def _read(path: Path) -> str:
    return (REPO_ROOT / path).read_text(encoding="utf-8")


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


def test_current_policies_select_only_openspec_direct_execution() -> None:
    for path in CURRENT_POLICY_PATHS:
        policy = _read(path)
        assert "ADR-0010" in policy, path
        assert "OpenSpec 直接実行" in policy, path
        assert "`tasks.md`" in policy, path


def test_project_policy_references_only_current_direct_execution_rationale() -> None:
    project = _read(Path("openspec/project.md"))

    assert "ADR-0008" not in project
    assert "CONTEXT.md Q24" not in project
    assert "ADR-0010" in project


def test_scope_and_change_split_use_enumerated_shipping_boundaries() -> None:
    workflow = _read(Path("docs/agents/workflow.md"))

    for scope_trigger in (
        "外部挙動",
        "公開 interface",
        "security / trust boundary",
        "永続データ",
        "dependency / lockfile",
        "build / CI",
        "複数の恒久成果",
    ):
        assert scope_trigger in workflow
    assert "一つでも該当" in workflow
    assert "独立して受け入れ、review、mergeできる成果" in workflow
    assert "task 数、行数、セッション数" in workflow


def test_tasks_contract_is_self_contained_and_has_three_execution_constraints() -> None:
    workflow = _read(Path("docs/agents/workflow.md"))
    context = _read(Path("CONTEXT.md"))
    executor_skill = _read(EXECUTOR_SKILL)

    for required_field in (
        "成果",
        "依存",
        "対象",
        "実装 checkbox",
        "検証 checkbox",
    ):
        assert required_field in workflow
    assert "依存が全て完了した先頭の未完了 task" in workflow
    assert "最初の CI parity" in workflow
    assert "停止・再計画条件" in workflow
    assert "一時 artifact cleanup" in workflow
    assert "3項目" in workflow
    assert "最初の CI parity、停止・再計画条件、一時 artifact cleanup" in context
    assert "exactly 3 項目" in executor_skill
    assert "最初の CI parity、停止・再計画条件、一時 artifact cleanup" in executor_skill


def test_task_targets_require_exact_code_spanned_paths() -> None:
    workflow = _read(Path("docs/agents/workflow.md"))
    executor_skill = _read(EXECUTOR_SKILL)

    for text in (workflow, executor_skill):
        assert "Markdown inline code span" in text
        assert "exact" in text
        assert "Unicode" in text
        assert "空白" in text


def test_external_orchestrator_requires_named_user_opt_in_before_discovery() -> None:
    for path in (Path("AGENTS.md"), Path("docs/agents/workflow.md"), ADR_PATH):
        policy = _read(path)
        assert "外部 orchestrator" in policy, path
        assert "利用者が特定の名前を選ぶ前" in policy, path
        for forbidden_probe in (
            "read-only 探索",
            "在席確認",
            "plugin 検索",
            "version probe",
            "install",
            "起動",
        ):
            assert forbidden_probe in policy, (path, forbidden_probe)


def test_replanning_is_fail_closed_and_preserves_completed_tasks() -> None:
    workflow = _read(Path("docs/agents/workflow.md"))

    assert "仕様判断" in workflow
    assert "material expansion" in workflow
    assert "利用者承認まで停止" in workflow
    assert "完了済み checkbox を保持" in workflow
    assert "spec-holes、validation、tasks" in workflow


def test_blocker_persistence_begins_after_preflight_and_dirty_ownership() -> None:
    workflow = _read(Path("docs/agents/workflow.md"))
    executor_skill = _read(EXECUTOR_SKILL)

    for text in (workflow, executor_skill):
        assert "preflight" in text
        assert "dirty ownership" in text or "dirty overlap" in text
        assert "report-only" in text
        assert "repositoryを変更しない" in text.replace(" ", "")
        assert "先頭の未解決 task" in text or "先頭の未解決task" in text
        assert "未完了 validation task" in text or "未完了validation task" in text
        assert "文書順で最後の task" in text or "文書順で最後のtask" in text


def test_review_blocker_reopens_its_validation_and_parent_task() -> None:
    workflow = _read(Path("docs/agents/workflow.md"))
    executor_skill = _read(EXECUTOR_SKILL)

    for text in (workflow, executor_skill):
        normalized = text.replace(" ", "")
        assert "initial/diffreview" in normalized
        assert "projectcheck" in normalized
        assert "verifier" in normalized
        assert "検証checkbox" in normalized
        assert "親taskを未完了へ戻" in normalized
        assert "新しいevidence" in normalized


def test_partial_implementation_resume_is_owned_only_after_orderly_stop() -> None:
    workflow = _read(Path("docs/agents/workflow.md"))
    executor_skill = _read(EXECUTOR_SKILL)

    for text in (workflow, executor_skill):
        assert "orderly stop" in text
        assert "implementation-in-progress" in text
        assert "実装を継続" in text
        assert "abrupt termination" in text
        assert "未記録差分" in text
        assert "fail-closed" in text


def test_preflight_spec_holes_are_owned_by_permanent_workflow_and_skill() -> None:
    workflow = _read(Path("docs/agents/workflow.md"))
    executor_skill = _read(EXECUTOR_SKILL)

    for text in (workflow, executor_skill):
        normalized = text.replace(" ", "")
        assert "taskentryが0件" in normalized or "taskが0件" in normalized
        assert "推移的な依存 path" in text
        assert "Markdown inline code span" in text
        assert "Unicode" in text
        assert "空白" in text
