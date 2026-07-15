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
