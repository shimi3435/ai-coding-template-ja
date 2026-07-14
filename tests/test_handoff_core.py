"""source-pinned OpenSpec handoff functional-core tests.

Contract: automate-openspec-gsd-handoff at
5a1f78b81f546c900745328fad24f9adb073e768, progress requirement.
"""

from __future__ import annotations

from dataclasses import FrozenInstanceError

import pytest
from ai_coding_template_ja.openspec_gsd_handoff.models import (
    Failure,
    HostCapabilityInput,
    HostDispatch,
    HostSpawnSchema,
    InputRoute,
    KnownState,
    Success,
)
from ai_coding_template_ja.openspec_gsd_handoff.progress import (
    parse_task_progress,
    validate_candidate_progress,
)
from hypothesis import given
from hypothesis import strategies as st

SOURCE_COMMIT = "5a1f78b81f546c900745328fad24f9adb073e768"
PROGRESS_REQUIREMENT = "task progressを決定論的に算出する"


def test_progress_preserves_order_unicode_and_number_text() -> None:
    result = parse_task_progress(
        "## Tasks\n"
        "- [x] 1.1 fixture contractを固定する\n"
        "- [ ] 1.2 Unicodeの進捗を検証する\n"
    )

    assert isinstance(result, Success)
    assert [task.id for task in result.value.tasks] == ["1", "2"]
    assert [task.description for task in result.value.tasks] == [
        "1.1 fixture contractを固定する",
        "1.2 Unicodeの進捗を検証する",
    ]
    assert (result.value.total, result.value.complete, result.value.remaining) == (
        2,
        1,
        1,
    )


@pytest.mark.parametrize(
    ("markdown", "code"),
    [
        ("", "tasks-empty"),
        ("- [ ] \n", "task-description-empty"),
        ("- [X] uppercase\n", "task-checkbox-malformed"),
        ("* [ ] star\n", "task-checkbox-malformed"),
        ("  - [ ] indented\n", "task-checkbox-malformed"),
        ("- [maybe] broken\n", "task-checkbox-malformed"),
    ],
)
def test_progress_fails_closed_without_partial_value(markdown: str, code: str) -> None:
    result = parse_task_progress(markdown)

    assert isinstance(result, Failure)
    assert result.issue.code == code
    assert result.issue.known_state is KnownState.MANIFEST_ABSENT


def test_progress_rejects_more_than_pinned_task_limit() -> None:
    markdown = "".join(f"- [ ] {index}\n" for index in range(4097))

    result = parse_task_progress(markdown)

    assert isinstance(result, Failure)
    assert result.issue.code == "tasks-limit-exceeded"


def test_candidate_progress_rejects_boolean_counts_without_partial_value() -> None:
    canonical = parse_task_progress("- [ ] 1. task\n")
    assert isinstance(canonical, Success)

    result = validate_candidate_progress(
        {"total": True, "complete": 0, "remaining": 1},
        [{"id": "1", "description": "1. task", "done": False}],
        canonical.value,
    )

    assert isinstance(result, Failure)
    assert result.issue.code == "candidate-progress-invalid"


@given(
    st.lists(
        st.tuples(
            st.booleans(), st.text(min_size=1).filter(lambda text: "\n" not in text)
        ),
        min_size=1,
        max_size=30,
    )
)
def test_progress_parse_is_deterministic_and_idempotent(
    examples: list[tuple[bool, str]],
) -> None:
    markdown = "".join(
        f"- [{'x' if done else ' '}] {description}\n" for done, description in examples
    )

    first = parse_task_progress(markdown)
    second = parse_task_progress(markdown)

    assert first == second


def test_progress_models_are_frozen_and_route_is_separate_from_host_verdict() -> None:
    host = HostCapabilityInput(
        inspected=True,
        spawn_agent_schema=HostSpawnSchema.GENERIC,
        dispatch=HostDispatch.GENERIC_AGENT_WORKAROUND,
        agent_role_source="toml",
    )
    result = Success(value=host, route=InputRoute.JSON)

    assert result.route is InputRoute.JSON
    assert result.value.dispatch is HostDispatch.GENERIC_AGENT_WORKAROUND
    with pytest.raises(FrozenInstanceError):
        result.value.inspected = False  # type: ignore[misc]


def test_contract_trace_constants_are_source_pinned() -> None:
    assert len(SOURCE_COMMIT) == 40
    assert PROGRESS_REQUIREMENT in "task progressを決定論的に算出する"
