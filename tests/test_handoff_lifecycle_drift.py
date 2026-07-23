from __future__ import annotations

import os
from collections.abc import Callable
from hashlib import sha256
from pathlib import Path
from typing import Any

import pytest
from hypothesis import given
from hypothesis import strategies as st

from ai_coding_template_ja.openspec_gsd_handoff.lifecycle_drift import (
    DriftState,
    classify_canonical_source_drift,
    normalize_tasks_specification,
    observe_canonical_source,
)
from ai_coding_template_ja.openspec_gsd_handoff.models import (
    ArtifactClaim,
    ArtifactKind,
    ClassifiedIssue,
    Failure,
    IssueCategory,
    KnownState,
    Success,
)
from ai_coding_template_ja.openspec_gsd_handoff.progress import parse_task_progress
from ai_coding_template_ja.openspec_gsd_handoff.reader import ArtifactLimits
from ai_coding_template_ja.openspec_gsd_handoff.source_identity import (
    SourceIdentityState,
)

CHANGE_ID = "fixture-change"
PROPOSAL_PATH = f"openspec/changes/{CHANGE_ID}/proposal.md"
DESIGN_PATH = f"openspec/changes/{CHANGE_ID}/design.md"
TASKS_PATH = f"openspec/changes/{CHANGE_ID}/tasks.md"
SPEC_PATH = f"openspec/changes/{CHANGE_ID}/specs/lifecycle-hardening/spec.md"

PROPOSAL = "# Proposal\n\nKeep lifecycle observations bounded.\n"
DESIGN = "# Design\n\nUse one fail-closed observation.\n"
TASKS = "## Tasks\n\n- [ ] 1. Observe source\n- [x] 2. Classify drift\n"
SPEC = (
    "# Lifecycle hardening\n\n"
    "### Requirement: Bounded source observation\n"
    "The source must be observed completely.\n\n"
    "#### Scenario: Complete source is clean\n"
    "- **WHEN** every canonical artifact is unchanged\n"
    "- **THEN** the source is clean\n"
)


def _empty_source_state() -> SourceIdentityState:
    return SourceIdentityState(
        next_requirement_id=1,
        next_scenario_id=1,
        active=(),
        tombstones=(),
    )


def _write_complete_change(
    tmp_path: Path,
    *,
    proposal: str = PROPOSAL,
    design: str = DESIGN,
    tasks: str = TASKS,
    spec: str = SPEC,
) -> tuple[Path, tuple[ArtifactClaim, ...]]:
    repository = tmp_path / "repository"
    contents = {
        PROPOSAL_PATH: proposal,
        DESIGN_PATH: design,
        TASKS_PATH: tasks,
        SPEC_PATH: spec,
    }
    for relative_path, content in contents.items():
        target = repository / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    claims = (
        ArtifactClaim(ArtifactKind.TASKS, Path(TASKS_PATH)),
        ArtifactClaim(ArtifactKind.SPEC, Path(SPEC_PATH)),
        ArtifactClaim(ArtifactKind.PROPOSAL, Path(PROPOSAL_PATH)),
        ArtifactClaim(ArtifactKind.DESIGN, Path(DESIGN_PATH)),
    )
    return repository, claims


def _observe_initial(repository: Path, claims: tuple[ArtifactClaim, ...]):
    result = observe_canonical_source(
        repository,
        CHANGE_ID,
        claims,
        expected_source_items=_empty_source_state(),
    )
    assert isinstance(result, Success)
    return result


def _classify_after_change(
    repository: Path,
    claims: tuple[ArtifactClaim, ...],
    change: Callable[[], object],
):
    expected = _observe_initial(repository, claims)
    change()
    observed = observe_canonical_source(
        repository,
        CHANGE_ID,
        claims,
        expected_source_items=expected.value.source_items,
    )
    return classify_canonical_source_drift(expected, observed)


def test_fixed_complete_equal_observations_are_clean(tmp_path: Path) -> None:
    repository, claims = _write_complete_change(tmp_path)
    expected = _observe_initial(repository, claims)

    observed = observe_canonical_source(
        repository,
        CHANGE_ID,
        tuple(reversed(claims)),
        expected_source_items=expected.value.source_items,
    )
    decision = classify_canonical_source_drift(expected, observed)

    assert decision.state is DriftState.CLEAN
    assert decision.issue_code is None
    assert decision.drifted_artifact_paths == ()
    assert decision.changed_source_item_ids == ()
    assert decision.progress_update_candidate is None


@pytest.mark.parametrize(
    ("relative_path", "replacement"),
    [
        (PROPOSAL_PATH, PROPOSAL.replace("bounded", "strictly bounded")),
        (DESIGN_PATH, DESIGN.replace("one", "a single")),
        (TASKS_PATH, TASKS.replace("Observe source", "Observe canonical source")),
    ],
)
def test_fixed_non_spec_content_change_is_drifted_without_source_ids(
    tmp_path: Path,
    relative_path: str,
    replacement: str,
) -> None:
    repository, claims = _write_complete_change(tmp_path)

    decision = _classify_after_change(
        repository,
        claims,
        lambda: (repository / relative_path).write_text(replacement, encoding="utf-8"),
    )

    assert decision.state is DriftState.DRIFTED
    assert decision.drifted_artifact_paths == (relative_path,)
    assert decision.changed_source_item_ids == ()
    assert decision.progress_update_candidate is None


def test_fixed_spec_fingerprint_change_reports_stable_source_id(
    tmp_path: Path,
) -> None:
    repository, claims = _write_complete_change(tmp_path)

    decision = _classify_after_change(
        repository,
        claims,
        lambda: (repository / SPEC_PATH).write_text(
            SPEC.replace("observed completely", "observed completely and once"),
            encoding="utf-8",
        ),
    )

    assert decision.state is DriftState.DRIFTED
    assert decision.drifted_artifact_paths == (SPEC_PATH,)
    assert decision.changed_source_item_ids == ("REQ-000001",)
    assert decision.progress_update_candidate is None


def test_fixed_created_updated_and_tombstoned_ids_are_unique_and_sorted(
    tmp_path: Path,
) -> None:
    repository, claims = _write_complete_change(tmp_path)
    changed_spec = (
        SPEC.replace("observed completely", "observed as one complete input").split(
            "#### Scenario:", maxsplit=1
        )[0]
        + "### Requirement: Deterministic evidence\n"
        + "Changed identities must be sorted.\n"
    )

    decision = _classify_after_change(
        repository,
        claims,
        lambda: (repository / SPEC_PATH).write_text(changed_spec, encoding="utf-8"),
    )

    assert decision.state is DriftState.DRIFTED
    assert decision.changed_source_item_ids == (
        "REQ-000001",
        "REQ-000002",
        "SCN-000001",
    )


def test_checkbox_only_progress_is_clean_and_separate(tmp_path: Path) -> None:
    repository, claims = _write_complete_change(tmp_path)
    changed_tasks = TASKS.replace("- [ ] 1.", "- [x] 1.").replace(
        "- [x] 2.", "- [ ] 2."
    )

    decision = _classify_after_change(
        repository,
        claims,
        lambda: (repository / TASKS_PATH).write_text(
            changed_tasks,
            encoding="utf-8",
        ),
    )

    assert decision.state is DriftState.CLEAN
    assert decision.drifted_artifact_paths == ()
    assert decision.changed_source_item_ids == ()
    assert decision.progress_update_candidate is not None
    assert tuple(task.done for task in decision.progress_update_candidate.tasks) == (
        True,
        False,
    )


def _assert_unknown(expected, observed, code: str) -> None:
    decision = classify_canonical_source_drift(expected, observed)

    assert decision.state is DriftState.UNKNOWN
    assert decision.issue_code == code
    assert decision.drifted_artifact_paths == ()
    assert decision.changed_source_item_ids == ()
    assert decision.progress_update_candidate is None


def test_bounded_empty_claims_are_unknown(tmp_path: Path) -> None:
    repository, claims = _write_complete_change(tmp_path)
    expected = _observe_initial(repository, claims)
    observed = observe_canonical_source(
        repository,
        CHANGE_ID,
        (),
        expected_source_items=expected.value.source_items,
    )

    _assert_unknown(expected, observed, "artifacts-empty")


@pytest.mark.parametrize("failure_kind", ["missing", "non_regular", "symlink"])
def test_bounded_unsafe_artifact_is_unknown(
    tmp_path: Path,
    failure_kind: str,
) -> None:
    repository, claims = _write_complete_change(tmp_path)
    expected = _observe_initial(repository, claims)
    proposal = repository / PROPOSAL_PATH
    proposal.unlink()
    if failure_kind == "non_regular":
        proposal.mkdir()
    elif failure_kind == "symlink":
        outside = tmp_path / "outside.md"
        outside.write_text(PROPOSAL, encoding="utf-8")
        proposal.symlink_to(outside)
    observed = observe_canonical_source(
        repository,
        CHANGE_ID,
        claims,
        expected_source_items=expected.value.source_items,
    )

    expected_code = {
        "missing": "artifact-path-unreadable",
        "non_regular": "artifact-path-not-markdown-file",
        "symlink": "artifact-path-symlink",
    }[failure_kind]
    _assert_unknown(expected, observed, expected_code)


def test_bounded_unreadable_artifact_is_unknown(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repository, claims = _write_complete_change(tmp_path)
    expected = _observe_initial(repository, claims)
    original_open = Path.open

    def unreadable_proposal(path: Path, *args: Any, **kwargs: Any):
        if path == (repository / PROPOSAL_PATH).resolve():
            raise PermissionError
        return original_open(path, *args, **kwargs)

    monkeypatch.setattr(Path, "open", unreadable_proposal)
    observed = observe_canonical_source(
        repository,
        CHANGE_ID,
        claims,
        expected_source_items=expected.value.source_items,
    )

    _assert_unknown(expected, observed, "artifact-read-failed")


@pytest.mark.parametrize(
    ("mutation", "code"),
    [
        ("invalid_utf8", "artifact-utf8-invalid"),
        ("malformed_checkbox", "task-checkbox-malformed"),
        ("missing_tasks_claim", "canonical-artifact-cardinality-invalid"),
        ("duplicate_tasks_claim", "artifact-path-duplicate"),
    ],
)
def test_bounded_malformed_or_incomplete_input_is_unknown(
    tmp_path: Path,
    mutation: str,
    code: str,
) -> None:
    repository, claims = _write_complete_change(tmp_path)
    expected = _observe_initial(repository, claims)
    observed_claims = claims
    if mutation == "invalid_utf8":
        (repository / PROPOSAL_PATH).write_bytes(b"\xff")
    elif mutation == "malformed_checkbox":
        (repository / TASKS_PATH).write_text("- [X] invalid\n", encoding="utf-8")
    elif mutation == "missing_tasks_claim":
        observed_claims = tuple(
            claim for claim in claims if claim.kind is not ArtifactKind.TASKS
        )
    else:
        observed_claims = (*claims, ArtifactClaim(ArtifactKind.TASKS, Path(TASKS_PATH)))

    observed = observe_canonical_source(
        repository,
        CHANGE_ID,
        observed_claims,
        expected_source_items=expected.value.source_items,
    )

    _assert_unknown(expected, observed, code)


@pytest.mark.parametrize(
    ("limits", "code"),
    [
        (ArtifactLimits(max_files=3), "artifact-count-limit-exceeded"),
        (
            ArtifactLimits(bytes_per_file=len(PROPOSAL.encode()) - 1),
            "artifact-file-limit-exceeded",
        ),
        (
            ArtifactLimits(
                bytes_per_file=max(
                    len(PROPOSAL.encode()),
                    len(DESIGN.encode()),
                    len(TASKS.encode()),
                    len(SPEC.encode()),
                ),
                bytes_total=sum(
                    len(value.encode()) for value in (PROPOSAL, DESIGN, TASKS, SPEC)
                )
                - 1,
            ),
            "artifact-total-limit-exceeded",
        ),
    ],
)
def test_bounded_limit_plus_one_is_unknown(
    tmp_path: Path,
    limits: ArtifactLimits,
    code: str,
) -> None:
    repository, claims = _write_complete_change(tmp_path)
    expected = _observe_initial(repository, claims)
    observed = observe_canonical_source(
        repository,
        CHANGE_ID,
        claims,
        expected_source_items=expected.value.source_items,
        limits=limits,
    )

    _assert_unknown(expected, observed, code)


def test_bounded_supplied_failure_is_unknown() -> None:
    failure = Failure(
        ClassifiedIssue(
            category=IssueCategory.ARTIFACT,
            code="fixed-observation-failure",
            known_state=KnownState.UNKNOWN,
        )
    )

    _assert_unknown(failure, failure, "fixed-observation-failure")


def test_bounded_invalid_source_state_is_unknown(tmp_path: Path) -> None:
    repository, claims = _write_complete_change(tmp_path)
    expected = _observe_initial(repository, claims)
    invalid_state = SourceIdentityState(
        next_requirement_id=0,
        next_scenario_id=1,
        active=(),
        tombstones=(),
    )

    observed = observe_canonical_source(
        repository,
        CHANGE_ID,
        claims,
        expected_source_items=invalid_state,
    )

    _assert_unknown(expected, observed, "source-state-counter-invalid")


def test_fixed_artifacts_do_not_depend_on_mtime(tmp_path: Path) -> None:
    repository, claims = _write_complete_change(tmp_path)
    expected = _observe_initial(repository, claims)
    for claim in claims:
        target = repository / claim.path
        current = target.stat()
        os.utime(target, ns=(current.st_atime_ns, current.st_mtime_ns + 1_000_000))

    observed = observe_canonical_source(
        repository,
        CHANGE_ID,
        claims,
        expected_source_items=expected.value.source_items,
    )
    decision = classify_canonical_source_drift(expected, observed)

    assert decision.state is DriftState.CLEAN


@given(
    descriptions=st.lists(
        st.tuples(
            st.text(
                alphabet=st.characters(
                    exclude_characters="\r\n",
                    exclude_categories=("Cs",),
                ),
                min_size=1,
                max_size=20,
            ).filter(lambda value: bool(value.strip())),
            st.sampled_from(("", "\u2028- [x] nested marker")),
        ),
        min_size=1,
        max_size=8,
    ),
    states=st.data(),
)
def test_checkbox_normalization_preserves_specification_and_progress_property(
    descriptions: list[tuple[str, str]],
    states: st.DataObject,
) -> None:
    done_values = states.draw(
        st.lists(
            st.booleans(),
            min_size=len(descriptions),
            max_size=len(descriptions),
        )
    )
    inverted_values = [not done for done in done_values]

    def render(values: list[bool], *, normalized: bool = False) -> str:
        lines = []
        for index, ((description, suffix), done) in enumerate(
            zip(descriptions, values, strict=True),
            start=1,
        ):
            marker = " " if normalized or not done else "x"
            lines.append(f"- [{marker}] task-{index}:{description}{suffix}")
        return "\n".join(lines)

    markdown = render(done_values)
    same_specification = render(inverted_values)
    expected_bytes = render(done_values, normalized=True).encode("utf-8")
    normalized = normalize_tasks_specification(markdown)
    inverted = normalize_tasks_specification(same_specification)
    progress = parse_task_progress(markdown)

    assert isinstance(normalized, Success)
    assert isinstance(inverted, Success)
    assert isinstance(progress, Success)
    assert normalized.value == expected_bytes
    assert normalized.value == inverted.value
    assert sha256(normalized.value).digest() == sha256(inverted.value).digest()
    assert tuple(
        task.done
        for task in progress.value.tasks
        if task.description.startswith("task-")
    ) == tuple(done_values)
    repeated = normalize_tasks_specification(normalized.value.decode("utf-8"))
    assert repeated == normalized


def test_fixed_description_byte_changes_normalized_specification() -> None:
    first = normalize_tasks_specification("- [x] 1. first description\n")
    second = normalize_tasks_specification("- [ ] 1. second description\n")

    assert isinstance(first, Success)
    assert isinstance(second, Success)
    assert first.value != second.value
