"""Current-tree policy references for source-to-execution mapping."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .models import ClassifiedIssue, Failure, IssueCategory, KnownState, Result


@dataclass(frozen=True)
class PolicyReferenceLimits:
    """Bounds applied before complete policy evidence can be returned."""

    max_records: int = 4096
    bytes_per_file: int = 8_388_608
    bytes_total: int = 8_388_608
    registry_bytes: int = 8_388_608


DEFAULT_POLICY_REFERENCE_LIMITS = PolicyReferenceLimits()


@dataclass(frozen=True)
class PolicyReference:
    """One stable identifier and its mechanical current-tree anchor."""

    id: str
    source_path: str
    heading: str
    body_length: int
    sha256: str
    historical_provenance: str | None = None


@dataclass(frozen=True)
class PolicyReferenceRegistry:
    """A complete immutable stable-reference namespace."""

    version: str
    references: tuple[PolicyReference, ...]


@dataclass(frozen=True)
class PolicySectionObservation:
    """Exact normalized evidence observed from one current-tree section."""

    reference_id: str
    raw_source_path: str
    source_path: str
    raw_heading: str
    normalized_heading: str
    normalized_body: str
    body_length: int
    sha256: str


def _not_implemented() -> Failure:
    return Failure(
        ClassifiedIssue(
            category=IssueCategory.ARTIFACT,
            code="policy-observer-not-implemented",
            known_state=KnownState.MANIFEST_ABSENT,
        )
    )


def read_policy_reference_registry(
    repository_root: Path,
    registry_path: str | Path,
    *,
    limits: PolicyReferenceLimits = DEFAULT_POLICY_REFERENCE_LIMITS,
) -> Result[PolicyReferenceRegistry]:
    """Read one strict registry or return whole-operation non-success."""

    del repository_root, registry_path, limits
    return _not_implemented()


def observe_policy_sections(
    repository_root: Path,
    registry: PolicyReferenceRegistry,
    *,
    limits: PolicyReferenceLimits = DEFAULT_POLICY_REFERENCE_LIMITS,
) -> Result[tuple[PolicySectionObservation, ...]]:
    """Observe every requested current-tree section exactly once or fail."""

    del repository_root, registry, limits
    return _not_implemented()


def validate_policy_references(
    registry: PolicyReferenceRegistry,
    observations: tuple[PolicySectionObservation, ...],
    referenced_ids: tuple[str, ...],
) -> Result[tuple[PolicyReference, ...]]:
    """Validate complete registry coverage for the requested stable IDs."""

    del registry, observations, referenced_ids
    return _not_implemented()
