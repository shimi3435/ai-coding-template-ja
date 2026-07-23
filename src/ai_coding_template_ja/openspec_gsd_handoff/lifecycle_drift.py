"""Fail-closed observation and classification of canonical OpenSpec drift."""

from __future__ import annotations

import hashlib
import re
from collections import Counter
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path

from .models import (
    ArtifactClaim,
    ArtifactKind,
    ClassifiedIssue,
    Failure,
    IssueCategory,
    KnownState,
    Progress,
    Result,
    Success,
)
from .progress import parse_task_progress
from .reader import (
    DEFAULT_ARTIFACT_LIMITS,
    ArtifactLimits,
    read_canonical_artifacts,
)
from .source_identity import (
    SourceIdentityLimits,
    SourceIdentityState,
    read_source_inventory,
    reconcile_source_items,
)


class DriftState(StrEnum):
    """Complete canonical-source comparison outcomes."""

    CLEAN = "clean"
    DRIFTED = "drifted"
    UNKNOWN = "unknown"


@dataclass(frozen=True)
class CanonicalArtifactObservation:
    """Immutable hashes for one canonical artifact."""

    kind: ArtifactKind
    path: str
    raw_sha256: str
    specification_sha256: str


@dataclass(frozen=True)
class CanonicalSourceObservation:
    """One complete bounded canonical-source observation."""

    artifacts: tuple[CanonicalArtifactObservation, ...]
    progress: Progress
    source_items: SourceIdentityState
    changed_source_item_ids: tuple[str, ...]


@dataclass(frozen=True)
class CanonicalSourceDriftDecision:
    """Fail-closed drift decision with no partial evidence for unknown input."""

    state: DriftState
    issue_code: str | None
    drifted_artifact_paths: tuple[str, ...]
    changed_source_item_ids: tuple[str, ...]
    progress_update_candidate: Progress | None


def _failure(code: str, *, category: IssueCategory) -> Failure:
    return Failure(
        ClassifiedIssue(
            category=category,
            code=code,
            known_state=KnownState.UNKNOWN,
        )
    )


def normalize_tasks_specification(markdown: str) -> Result[bytes]:
    """Remove only exact line-start checkbox state from valid tasks Markdown."""

    progress = parse_task_progress(markdown)
    if isinstance(progress, Failure):
        return progress

    normalized_parts = re.split(r"(\r\n|\r|\n)", markdown)
    for index in range(0, len(normalized_parts), 2):
        if normalized_parts[index].startswith(("- [ ] ", "- [x] ")):
            normalized_parts[index] = "- [ ] " + normalized_parts[index][6:]
    try:
        return Success("".join(normalized_parts).encode("utf-8"))
    except UnicodeEncodeError:
        return _failure("tasks-utf8-invalid", category=IssueCategory.PROGRESS)


def _has_required_artifact_cardinality(
    kinds: tuple[ArtifactKind, ...],
) -> bool:
    counts = Counter(kinds)
    return (
        counts[ArtifactKind.PROPOSAL] == 1
        and counts[ArtifactKind.DESIGN] == 1
        and counts[ArtifactKind.TASKS] == 1
        and counts[ArtifactKind.SPEC] >= 1
        and sum(counts.values()) == len(kinds)
    )


def observe_canonical_source(
    repository_root: Path,
    change_id: str,
    claims: list[ArtifactClaim] | tuple[ArtifactClaim, ...],
    *,
    expected_source_items: SourceIdentityState,
    limits: ArtifactLimits = DEFAULT_ARTIFACT_LIMITS,
) -> Result[CanonicalSourceObservation]:
    """Observe all canonical artifacts and stable source IDs as one operation."""

    read_result = read_canonical_artifacts(
        repository_root,
        change_id,
        claims,
        limits=limits,
    )
    if isinstance(read_result, Failure):
        return read_result
    artifacts = read_result.value
    if not _has_required_artifact_cardinality(
        tuple(artifact.kind for artifact in artifacts)
    ):
        return _failure(
            "canonical-artifact-cardinality-invalid",
            category=IssueCategory.ARTIFACT,
        )

    tasks_artifact = next(
        artifact for artifact in artifacts if artifact.kind is ArtifactKind.TASKS
    )
    progress_result = parse_task_progress(tasks_artifact.content)
    if isinstance(progress_result, Failure):
        return progress_result
    normalized_tasks = normalize_tasks_specification(tasks_artifact.content)
    if isinstance(normalized_tasks, Failure):
        return normalized_tasks

    spec_paths = tuple(
        artifact.path
        for artifact in sorted(artifacts, key=lambda artifact: artifact.path)
        if artifact.kind is ArtifactKind.SPEC
    )
    inventory_result = read_source_inventory(
        repository_root,
        spec_paths,
        limits=SourceIdentityLimits(
            bytes_per_file=limits.bytes_per_file,
            bytes_total=limits.bytes_total,
        ),
    )
    if isinstance(inventory_result, Failure):
        return inventory_result
    reconciliation_result = reconcile_source_items(
        inventory_result.value,
        expected_source_items,
    )
    if isinstance(reconciliation_result, Failure):
        return reconciliation_result
    reconciliation = reconciliation_result.value
    changed_source_item_ids = tuple(
        sorted(
            {
                *reconciliation.created,
                *reconciliation.updated,
                *reconciliation.tombstoned,
            }
        )
    )

    observations = tuple(
        CanonicalArtifactObservation(
            kind=artifact.kind,
            path=artifact.path,
            raw_sha256=artifact.sha256,
            specification_sha256=(
                hashlib.sha256(normalized_tasks.value).hexdigest()
                if artifact.kind is ArtifactKind.TASKS
                else artifact.sha256
            ),
        )
        for artifact in sorted(artifacts, key=lambda artifact: artifact.path)
    )
    return Success(
        CanonicalSourceObservation(
            artifacts=observations,
            progress=progress_result.value,
            source_items=reconciliation.state,
            changed_source_item_ids=changed_source_item_ids,
        )
    )


def _is_complete_observation(observation: CanonicalSourceObservation) -> bool:
    if (
        type(observation.artifacts) is not tuple
        or type(observation.changed_source_item_ids) is not tuple
        or not isinstance(observation.progress, Progress)
        or not isinstance(observation.source_items, SourceIdentityState)
    ):
        return False
    if not _has_required_artifact_cardinality(
        tuple(artifact.kind for artifact in observation.artifacts)
    ):
        return False
    if tuple(sorted(observation.artifacts, key=lambda artifact: artifact.path)) != (
        observation.artifacts
    ):
        return False
    if len({artifact.path for artifact in observation.artifacts}) != len(
        observation.artifacts
    ):
        return False
    if any(
        len(digest) != 64
        or any(character not in "0123456789abcdef" for character in digest)
        for artifact in observation.artifacts
        for digest in (artifact.raw_sha256, artifact.specification_sha256)
    ):
        return False
    return observation.changed_source_item_ids == tuple(
        sorted(set(observation.changed_source_item_ids))
    )


def _unknown(code: str) -> CanonicalSourceDriftDecision:
    return CanonicalSourceDriftDecision(
        state=DriftState.UNKNOWN,
        issue_code=code,
        drifted_artifact_paths=(),
        changed_source_item_ids=(),
        progress_update_candidate=None,
    )


def classify_canonical_source_drift(
    expected: Result[CanonicalSourceObservation],
    observed: Result[CanonicalSourceObservation],
) -> CanonicalSourceDriftDecision:
    """Classify two complete values without inspecting mutable external state."""

    if isinstance(expected, Failure):
        return _unknown(expected.issue.code)
    if isinstance(observed, Failure):
        return _unknown(observed.issue.code)
    if not _is_complete_observation(expected.value) or not _is_complete_observation(
        observed.value
    ):
        return _unknown("canonical-observation-incomplete")

    expected_by_key = {
        (artifact.kind, artifact.path): artifact
        for artifact in expected.value.artifacts
    }
    observed_by_key = {
        (artifact.kind, artifact.path): artifact
        for artifact in observed.value.artifacts
    }
    drifted_paths = tuple(
        sorted(
            {
                key[1]
                for key in expected_by_key.keys() | observed_by_key.keys()
                if key not in expected_by_key
                or key not in observed_by_key
                or expected_by_key[key].specification_sha256
                != observed_by_key[key].specification_sha256
            }
        )
    )
    changed_source_item_ids = observed.value.changed_source_item_ids
    if (
        expected.value.source_items != observed.value.source_items
        and not changed_source_item_ids
    ):
        return _unknown("source-reconciliation-incomplete")
    if drifted_paths or changed_source_item_ids:
        return CanonicalSourceDriftDecision(
            state=DriftState.DRIFTED,
            issue_code=None,
            drifted_artifact_paths=drifted_paths,
            changed_source_item_ids=changed_source_item_ids,
            progress_update_candidate=None,
        )

    progress_update = (
        observed.value.progress
        if expected.value.progress != observed.value.progress
        else None
    )
    return CanonicalSourceDriftDecision(
        state=DriftState.CLEAN,
        issue_code=None,
        drifted_artifact_paths=(),
        changed_source_item_ids=(),
        progress_update_candidate=progress_update,
    )
