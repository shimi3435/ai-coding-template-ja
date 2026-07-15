"""Static contract checks for the approval-gated execute skill instructions."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
CONTRACT_PATH = (
    REPO_ROOT
    / "tests"
    / "fixtures"
    / "openspec_gsd_handoff"
    / "skill"
    / "contract.json"
)
SKILL_PATH = REPO_ROOT / ".agents" / "skills" / "execute-openspec-change" / "SKILL.md"


def _contract() -> dict[str, Any]:
    return json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))


def _skill() -> str:
    return SKILL_PATH.read_text(encoding="utf-8")


def _assert_tokens_in_order(text: str, tokens: list[str]) -> None:
    positions = [text.index(token) for token in tokens]
    assert positions == sorted(positions)


def test_preview_contract_orders_complete_read_only_evidence() -> None:
    contract = _contract()
    skill = _skill()

    assert contract["ordered_stages"] == [
        "capture-input",
        "inspect-host",
        "inspect-bridge",
        "resolve-dispatch",
        "preview",
        "approve",
    ]
    assert contract["preview"]["bridge_operation"] == "inspect_handoff"
    assert contract["preview"]["read_only"] is True
    assert contract["preview"]["fields"] == [
        "change_id",
        "canonical_paths",
        "input_route",
        "source_commit",
        "manifest_path",
        "openspec_capability",
        "gsd_capability",
        "gsd_project_initialized",
        "gsd_entrypoint",
        "repository_policy",
        "host_spawn_schema",
        "host_dispatch",
        "generic_degradation",
    ]
    assert contract["preview"]["input_route_values"] == [
        "json",
        "markdown-fallback",
    ]
    assert contract["preview"]["fallback_cause_available"] is False
    _assert_tokens_in_order(
        skill,
        [f"## Stage: {stage}" for stage in contract["ordered_stages"]],
    )
    for field in contract["preview"]["fields"]:
        assert f"`{field}`" in skill
    assert "fallback cause" not in skill.lower()


def test_approval_contract_requires_fresh_answer_and_freezes_preview_tuple() -> None:
    contract = _contract()
    skill = _skill()

    assert contract["approval"]["fresh_explicit_answer_after_complete_preview"]
    assert contract["frozen_inputs"] == [
        "repository_real_path",
        "change_id",
        "source_commit",
        "gsd_home",
        "repository_policy",
        "host_evidence",
        "completed_gates",
        "unresolved_items",
        "canonical_paths",
    ]
    for frozen_input in contract["frozen_inputs"]:
        assert f"`{frozen_input}`" in skill
    for forbidden_substitute in contract["approval"]["substitutes_forbidden"]:
        assert f"`{forbidden_substitute}`" in skill
    assert "fresh explicit answer" in skill


def test_approval_failure_or_refusal_has_no_mutable_reachable_stage() -> None:
    contract = _contract()
    skill = _skill()
    terminal = contract["terminal_before_mutation"]

    assert terminal["outcomes"] == ["inspect-failure", "refusal", "no-answer"]
    assert terminal["forbidden_stages"] == [
        "prepare",
        "brief-create",
        "gsd-dispatch",
        "mark-started",
    ]
    for outcome in terminal["outcomes"]:
        assert f"`{outcome}`" in skill
    for forbidden_stage in terminal["forbidden_stages"]:
        assert f"`{forbidden_stage}`" in skill
    for report_field in terminal["report"]:
        assert f"`{report_field}`" in skill
    assert "zero mutable stages" in skill


def test_preview_tests_are_static_and_do_not_claim_real_host_execution() -> None:
    scope = _contract()["evidence_scope"]

    assert scope["verified"] == [
        "static-skill-instruction-contract",
        "fixture-consistency",
        "phase-1-public-state-seam",
    ]
    assert "actual-host-prompt-execution" in scope["unverified_until_phase_3"]


def test_prepared_gate_replays_preview_tuple_before_any_route_dispatch() -> None:
    contract = _contract()
    skill = _skill()
    prepare_gate = contract["prepare_gate"]

    assert prepare_gate == {
        "operation": "prepare_handoff",
        "replay": "preview_tuple",
        "required_success": {
            "ok": True,
            "operation": "prepare",
            "known_state": "prepared",
        },
        "dispatch_before_success": False,
    }
    _assert_tokens_in_order(
        skill,
        [
            "## Stage: approve",
            "## Stage: prepare",
            "structured prepared success",
            "## Stage: dispatch",
        ],
    )
    assert "`prepare_handoff`" in skill
    assert "replay `preview_tuple`" in skill


def test_payload_fixture_is_exactly_equal_for_both_routes() -> None:
    contract = _contract()
    payload = contract["parity_payload"]
    routes = contract["routes"]

    assert routes["uninitialized"]["idea_document_payload"] == payload
    assert routes["initialized"]["inline_phase_payload"] == payload
    assert list(payload) == [
        "change_id",
        "canonical_paths",
        "source_commit",
        "completed_boundary_gates",
        "unresolved_items",
        "one_phase_one_change",
        "specification_nonduplication",
    ]
    assert len(payload["canonical_paths"]) == 4


def test_route_instructions_render_only_the_common_parity_payload() -> None:
    contract = _contract()
    skill = _skill()
    routes = contract["routes"]

    assert routes["uninitialized"]["entrypoint"] == (
        "$gsd-new-project --auto @${HANDOFF_BRIEF}"
    )
    assert routes["initialized"]["entrypoint"] == "$gsd-phase"
    assert routes["initialized"]["change_specific"] is True
    assert routes["partial_initialization"]["dispatch_reachable"] is False
    assert "`PARITY_PAYLOAD`" in skill
    assert "$gsd-new-project --auto @<brief>" in skill
    assert "change-specific `$gsd-phase`" in skill
    assert skill.count("complete `PARITY_PAYLOAD`") >= 2
    assert "partial initialization" in skill


def test_acceptance_matrix_retains_prepared_for_checkpoint_and_ambiguous_rows() -> None:
    contract = _contract()
    skill = _skill()
    acceptance = contract["acceptance"]

    assert acceptance["predicate"] == [
        "host-structured-completed-success",
        "route-read-only-postcondition",
    ]
    assert acceptance["retained_prepared_rows"] == [
        "marker-only",
        "checkpoint",
        "empty",
        "malformed",
        "partial",
        "ambiguous",
        "dispatch-failure",
        "postcondition-mismatch",
    ]
    assert acceptance["on_not_accepted"] == {
        "resulting_state": "prepared",
        "call_mark_started": False,
        "retry": False,
        "route_switch": False,
    }
    for row in acceptance["retained_prepared_rows"]:
        assert f"`{row}`" in skill
    assert "prose completion marker is supplemental only" in skill


def test_uninitialized_acceptance_requires_complete_read_only_postcondition() -> None:
    contract = _contract()
    skill = _skill()
    postcondition = contract["uninitialized_postcondition"]

    assert postcondition["probe"].endswith("init progress --raw")
    assert postcondition["probe_expected"] == {
        "project_exists": True,
        "roadmap_exists": True,
        "state_exists": True,
        "project_root": "${FROZEN_REPOSITORY_REAL_PATH}",
        "agents_installed": True,
        "missing_agents": [],
    }
    assert postcondition["required_files"] == [
        ".planning/PROJECT.md",
        ".planning/REQUIREMENTS.md",
        ".planning/ROADMAP.md",
        ".planning/STATE.md",
    ]
    for evidence in postcondition["collective_payload_evidence"]:
        assert f"`{evidence}`" in skill
    for path in postcondition["required_files"]:
        assert f"`{path}`" in skill


def test_initialized_acceptance_compares_exact_phase_snapshots() -> None:
    contract = _contract()
    skill = _skill()
    postcondition = contract["initialized_postcondition"]

    assert postcondition["pre_snapshot"] == [
        "maximum-integer-phase",
        "phase-directories",
        "roadmap",
    ]
    assert postcondition["post_snapshot"] == [
        "exactly-one-new-max-plus-one-phase",
        "matching-new-phase-directory",
        "no-other-phase-or-directory-change",
        "new-roadmap-section-equals-inline-parity-payload",
    ]
    for snapshot_field in [
        *postcondition["pre_snapshot"],
        *postcondition["post_snapshot"],
    ]:
        assert f"`{snapshot_field}`" in skill


def test_started_transition_is_reachable_only_after_conservative_acceptance() -> None:
    contract = _contract()
    skill = _skill()
    acceptance = contract["acceptance"]

    assert all(row["accepted"] for row in acceptance["accepted_rows"])
    assert all(
        row["resulting_state"] == "started" for row in acceptance["accepted_rows"]
    )
    assert acceptance["transition"] == {
        "operation": "mark_handoff_started",
        "argument": "gsd_accepted=True",
        "only_when_accepted": True,
    }
    _assert_tokens_in_order(
        skill,
        [
            "structured completed-success",
            "route-specific read-only postcondition",
            "`mark_handoff_started`",
        ],
    )
    assert "`gsd_accepted=True`" in skill


def test_ambiguous_host_or_postcondition_evidence_remains_unverified() -> None:
    scope = _contract()["evidence_scope"]

    assert "actual-host-prompt-execution" in scope["unverified_until_phase_3"]
    assert "route-specific-postconditions" in scope["unverified_until_phase_3"]


def test_generic_preflight_completes_before_preview_approval_or_prepare() -> None:
    contract = _contract()
    skill = _skill()
    preflight = contract["generic_preflight"]

    assert preflight["timing"] == (
        "after-inspect-bridge-before-preview-approval-prepare"
    )
    assert preflight["supported_version"] == "1.5.0"
    assert preflight["required_evidence"] == [
        "selected-entrypoint-skill",
        "concrete-workflow-under-frozen-arguments-and-config",
        "every-reachable-task-or-agent-spawn-name",
        "active-codex-config-root",
        "agent-toml-mapping-for-each-spawn",
        "complete-role-preamble-for-each-spawn",
        "every-isolation-requirement",
    ]
    _assert_tokens_in_order(
        skill,
        [
            "## Stage: inspect-bridge",
            "## Stage: resolve-dispatch",
            "complete-role-preamble-for-each-spawn",
            "## Stage: preview",
            "## Stage: approve",
            "## Stage: prepare",
        ],
    )


def test_generic_route_resolves_exact_local_workflows_and_spawn_names() -> None:
    contract = _contract()
    skill = _skill()
    preflight = contract["generic_preflight"]
    entrypoints = preflight["entrypoints"]

    assert entrypoints["uninitialized"] == {
        "skill": "${ACTIVE_CONFIG_ROOT}/skills/gsd-new-project/SKILL.md",
        "workflow": "${ACTIVE_CONFIG_ROOT}/gsd-core/workflows/new-project.md",
        "frozen_arguments": "$gsd-new-project --auto @${HANDOFF_BRIEF}",
        "reachable_spawn_names": [
            "gsd-project-researcher",
            "gsd-research-synthesizer",
            "gsd-roadmapper",
        ],
    }
    assert entrypoints["initialized"] == {
        "skill": "${ACTIVE_CONFIG_ROOT}/skills/gsd-phase/SKILL.md",
        "workflow": "${ACTIVE_CONFIG_ROOT}/gsd-core/workflows/add-phase.md",
        "frozen_arguments": "$gsd-phase ${INLINE_PARITY_PAYLOAD}",
        "reachable_spawn_names": [],
    }
    for entrypoint in entrypoints.values():
        assert entrypoint["skill"] in skill
        assert entrypoint["workflow"] in skill
        for spawn_name in entrypoint["reachable_spawn_names"]:
            assert f"`{spawn_name}`" in skill
    assert preflight["toml_pattern"] in skill


def test_generic_isolation_or_unknown_evidence_fails_closed() -> None:
    contract = _contract()
    skill = _skill()
    preflight = contract["generic_preflight"]

    assert preflight["equivalent_to_typed_dispatch"] is False
    assert preflight["workaround_label"] == "generic-agent workaround"
    assert preflight["active_config_root_priority"] == [
        "CODEX_HOME",
        "--config-dir",
        "project-local-.codex",
        "default-global-config",
    ]
    for reason in preflight["fail_closed"]:
        assert f"`{reason}`" in skill
    assert "generic-agent workaround" in skill
    assert "not equivalent to typed dispatch" in skill


def test_manifest_report_requires_distinct_later_commit_without_automation() -> None:
    contract = _contract()
    skill = _skill()
    reporting = contract["reporting"]

    assert reporting["after_manifest_success"] == [
        "manifest-path",
        "source-commit",
        "operator-makes-distinct-later-tracking-commit",
    ]
    assert reporting["automatic_git_commit"] is False
    for report_field in reporting["after_manifest_success"]:
        assert f"`{report_field}`" in skill
    assert "never execute a Git commit" in skill


def test_non_accepted_report_preserves_manual_continuation_and_scope() -> None:
    contract = _contract()
    skill = _skill()
    reporting = contract["reporting"]

    assert reporting["after_non_accepted_dispatch"] == [
        "completed-operations",
        "failure-point",
        "prepared-state",
        "manual-continuation-evidence",
    ]
    for report_field in reporting["after_non_accepted_dispatch"]:
        assert f"`{report_field}`" in skill
    for operation in reporting["forbidden_lifecycle_operations"]:
        assert f"`{operation}`" in skill
