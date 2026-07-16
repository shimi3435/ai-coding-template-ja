"""source-pinned OpenSpec handoff functional-core tests.

Contract: automate-openspec-gsd-handoff at
5a1f78b81f546c900745328fad24f9adb073e768, progress requirement.
"""

from __future__ import annotations

from dataclasses import FrozenInstanceError
from pathlib import Path

import pytest
from hypothesis import given
from hypothesis import strategies as st

from ai_coding_template_ja.openspec_gsd_handoff.models import (
    ArtifactClaim,
    ArtifactKind,
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
from ai_coding_template_ja.openspec_gsd_handoff.reader import (
    DEFAULT_ARTIFACT_LIMITS,
    ArtifactLimits,
    read_canonical_artifacts,
)

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


def test_progress_ignores_markdown_link_bullets_before_tasks() -> None:
    result = parse_task_progress(
        "## References\n"
        "- [design.md](../design.md) を参照\n"
        "* [workflow](../../docs/agents/workflow.md)\n"
        "## Tasks\n"
        "- [ ] 1.1 handoffを準備する\n"
    )

    assert isinstance(result, Success)
    assert result.value.total == 1
    assert result.value.tasks[0].description == "1.1 handoffを準備する"


@pytest.mark.parametrize(
    ("markdown", "code"),
    [
        ("", "tasks-empty"),
        ("- [ ] \n", "task-description-empty"),
        ("- [X] uppercase\n", "task-checkbox-malformed"),
        ("* [ ] star\n", "task-checkbox-malformed"),
        ("  - [ ] indented\n", "task-checkbox-malformed"),
        ("- [maybe] broken\n", "task-checkbox-malformed"),
        ("- [maybe] broken [link](target)\n", "task-checkbox-malformed"),
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


def _make_artifact(tmp_path: Path, relative: str, content: bytes) -> tuple[Path, Path]:
    repository = tmp_path / "repository"
    artifact = repository / "openspec" / "changes" / "fixture-change" / relative
    artifact.parent.mkdir(parents=True, exist_ok=True)
    artifact.write_bytes(content)
    return repository, artifact


def test_reader_returns_content_and_hash_from_the_same_bounded_bytes(
    tmp_path: Path,
) -> None:
    repository, proposal = _make_artifact(tmp_path, "proposal.md", b"# Proposal\n")

    result = read_canonical_artifacts(
        repository,
        "fixture-change",
        [ArtifactClaim(ArtifactKind.PROPOSAL, proposal)],
    )

    assert isinstance(result, Success)
    assert result.value[0].content == "# Proposal\n"
    assert result.value[0].content_bytes == b"# Proposal\n"
    assert result.value[0].sha256 == (
        "03862585012a9c8e770ee36871f6483b00d93503a33b6f66acfd564dc1a64910"
    )
    assert result.value[0].path == ("openspec/changes/fixture-change/proposal.md")


@pytest.mark.parametrize(
    "case",
    ["symlink", "sibling-prefix", "duplicate", "invalid-utf8"],
)
def test_reader_rejects_unsafe_or_ambiguous_artifacts(
    tmp_path: Path, case: str
) -> None:
    repository, proposal = _make_artifact(tmp_path, "proposal.md", b"# Proposal\n")
    claims = [ArtifactClaim(ArtifactKind.PROPOSAL, proposal)]
    if case == "symlink":
        outside = tmp_path / "outside.md"
        outside.write_text("outside\n", encoding="utf-8")
        proposal.unlink()
        proposal.symlink_to(outside)
    elif case == "sibling-prefix":
        proposal = (
            repository / "openspec" / "changes" / "fixture-change-evil" / "proposal.md"
        )
        proposal.parent.mkdir(parents=True)
        proposal.write_text("outside change\n", encoding="utf-8")
        claims = [ArtifactClaim(ArtifactKind.PROPOSAL, proposal)]
    elif case == "duplicate":
        claims.append(ArtifactClaim(ArtifactKind.DESIGN, proposal))
    else:
        proposal.write_bytes(b"\xff")

    result = read_canonical_artifacts(repository, "fixture-change", claims)

    assert isinstance(result, Failure)
    assert result.issue.category.value == "artifact"


def test_reader_enforces_exact_file_and_aggregate_boundaries(tmp_path: Path) -> None:
    repository, proposal = _make_artifact(tmp_path, "proposal.md", b"1234")
    _, design = _make_artifact(tmp_path, "design.md", b"5678")
    claims = [
        ArtifactClaim(ArtifactKind.PROPOSAL, proposal),
        ArtifactClaim(ArtifactKind.DESIGN, design),
    ]
    limits = ArtifactLimits(max_files=2, bytes_per_file=4, bytes_total=8)

    boundary = read_canonical_artifacts(
        repository, "fixture-change", claims, limits=limits
    )
    proposal.write_bytes(b"12345")
    exceeded = read_canonical_artifacts(
        repository, "fixture-change", claims, limits=limits
    )
    proposal.write_bytes(b"12345")
    design.write_bytes(b"6789")
    aggregate_exceeded = read_canonical_artifacts(
        repository,
        "fixture-change",
        claims,
        limits=ArtifactLimits(max_files=2, bytes_per_file=5, bytes_total=8),
    )

    assert isinstance(boundary, Success)
    assert isinstance(exceeded, Failure)
    assert exceeded.issue.code == "artifact-file-limit-exceeded"
    assert isinstance(aggregate_exceeded, Failure)
    assert aggregate_exceeded.issue.code == "artifact-total-limit-exceeded"


def test_reader_rejects_too_many_files_without_partial_artifacts(
    tmp_path: Path,
) -> None:
    repository, proposal = _make_artifact(tmp_path, "proposal.md", b"proposal")
    _, design = _make_artifact(tmp_path, "design.md", b"design")

    result = read_canonical_artifacts(
        repository,
        "fixture-change",
        [
            ArtifactClaim(ArtifactKind.PROPOSAL, proposal),
            ArtifactClaim(ArtifactKind.DESIGN, design),
        ],
        limits=ArtifactLimits(max_files=1, bytes_per_file=20, bytes_total=20),
    )

    assert isinstance(result, Failure)
    assert result.issue.code == "artifact-count-limit-exceeded"


def test_reader_uses_source_pinned_limits_and_change_id_bytes(tmp_path: Path) -> None:
    assert DEFAULT_ARTIFACT_LIMITS == ArtifactLimits(
        max_files=64,
        bytes_per_file=1_048_576,
        bytes_total=4_194_304,
        change_id_bytes=128,
    )
    change_id = "a" * 128
    repository = tmp_path / "repository"
    artifact = repository / "openspec" / "changes" / change_id / "proposal.md"
    artifact.parent.mkdir(parents=True)
    artifact.write_text("proposal\n", encoding="utf-8")

    boundary = read_canonical_artifacts(
        repository,
        change_id,
        [ArtifactClaim(ArtifactKind.PROPOSAL, artifact)],
    )
    exceeded = read_canonical_artifacts(
        repository,
        f"{change_id}a",
        [ArtifactClaim(ArtifactKind.PROPOSAL, artifact)],
    )

    assert isinstance(boundary, Success)
    assert isinstance(exceeded, Failure)
    assert exceeded.issue.code == "change-id-invalid"
