"""Mechanical OpenSpec-to-GSD handoff preparation operations."""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass, replace
from pathlib import Path

from .discovery import discover_openspec_artifacts
from .manifest import (
    HandoffManifest,
    ManifestArtifact,
    ManifestCapabilities,
    ManifestFileOperations,
    ManifestPersistenceResult,
    ManifestRepository,
    OpenSpecCapability,
    parse_manifest_bytes,
)
from .models import (
    ClassifiedIssue,
    Failure,
    HandoffState,
    HostCapabilityInput,
    InputRoute,
    IssueCategory,
    KnownState,
    Result,
    Success,
)
from .preflight import (
    CommandResult,
    RepositoryPolicyVerdict,
    collect_gsd_probe,
    collect_openspec_probe,
    parse_gsd_capability,
    subprocess_runner,
    validate_repository_inputs,
)

__all__ = ["inspect_handoff", "prepare_handoff", "mark_handoff_started"]

_CHANGE_ID = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")


@dataclass(frozen=True)
class HandoffInspection:
    """Complete read-only evidence plus a not-yet-persisted prepared value."""

    manifest: HandoffManifest


type InspectionResult = Result[HandoffInspection]
type OperationResult = (
    InspectionResult | Result[HandoffManifest] | ManifestPersistenceResult
)


def _failure(
    code: str,
    *,
    category: IssueCategory = IssueCategory.INPUT,
    known_state: KnownState = KnownState.MANIFEST_ABSENT,
) -> Failure:
    return Failure(ClassifiedIssue(category, code, known_state))


def _valid_change_id(change_id: str) -> bool:
    try:
        encoded = change_id.encode("ascii")
    except UnicodeEncodeError:
        return False
    return 0 < len(encoded) <= 128 and _CHANGE_ID.fullmatch(change_id) is not None


def _manifest_path(change_id: str) -> Path:
    return Path(".planning") / "openspec" / change_id / "handoff.json"


def inspect_handoff(
    *,
    repository: Path,
    change_id: str,
    source_commit: str,
    gsd_home: Path,
    repository_policy: RepositoryPolicyVerdict | None,
    host_capability: HostCapabilityInput,
    runner: Callable[..., CommandResult] = subprocess_runner,
) -> InspectionResult:
    """Inspect every read-only gate and construct a prepared value in memory."""

    if not _valid_change_id(change_id):
        return _failure("change-id-invalid")
    openspec_probe = collect_openspec_probe(runner, repository, change_id)
    discovery = discover_openspec_artifacts(repository, change_id, openspec_probe)
    if isinstance(discovery, Failure):
        return discovery
    gsd = parse_gsd_capability(
        repository,
        collect_gsd_probe(runner, repository, gsd_home),
    )
    if isinstance(gsd, Failure):
        return gsd
    repository_inputs = validate_repository_inputs(
        repository,
        source_commit,
        discovery.value.artifacts,
        runner=runner,
        manifest_path=_manifest_path(change_id),
        repository_policy=repository_policy,
        host_capability=host_capability,
    )
    if isinstance(repository_inputs, Failure):
        return repository_inputs
    route = discovery.route
    if route is None:
        return _failure("input-route-missing", category=IssueCategory.PREFLIGHT)
    artifacts = tuple(
        sorted(
            (
                ManifestArtifact(
                    artifact.kind.value,
                    artifact.path,
                    artifact.sha256,
                )
                for artifact in discovery.value.artifacts
            ),
            key=lambda artifact: (artifact.kind, artifact.path),
        )
    )
    manifest = HandoffManifest(
        schema_version=1,
        change_id=change_id,
        handoff_state=HandoffState.PREPARED,
        artifacts=artifacts,
        source_commit=repository_inputs.value.source_commit,
        progress=discovery.value.progress,
        capabilities=ManifestCapabilities(
            openspec=OpenSpecCapability(
                version="1.3.1",
                probe="instructions-apply-json",
                schema_name="spec-driven",
                input_route=route.value,
            ),
            gsd=gsd.value,
            host=repository_inputs.value.host_capability,
        ),
    )
    return Success(HandoffInspection(manifest), route=route)


def prepare_handoff(
    *,
    repository: Path,
    change_id: str,
    source_commit: str,
    gsd_home: Path,
    repository_policy: RepositoryPolicyVerdict | None,
    host_capability: HostCapabilityInput,
    approved: bool,
    runner: Callable[..., CommandResult] = subprocess_runner,
    operations: ManifestFileOperations | None = None,
) -> Result[HandoffManifest] | ManifestPersistenceResult:
    """Persist one prepared manifest only after explicit approval and all gates."""

    if approved is not True:
        return _failure("approval-required")
    inspection = inspect_handoff(
        repository=repository,
        change_id=change_id,
        source_commit=source_commit,
        gsd_home=gsd_home,
        repository_policy=repository_policy,
        host_capability=host_capability,
        runner=runner,
    )
    if isinstance(inspection, Failure):
        return inspection
    repository_adapter = ManifestRepository(
        repository / _manifest_path(change_id),
        operations=operations,
    )
    persisted = repository_adapter.persist(inspection.value.manifest)
    if isinstance(persisted, Success):
        return Success(persisted.value, route=inspection.route)
    return persisted


def mark_handoff_started(
    repository: Path,
    change_id: str,
    *,
    gsd_accepted: bool,
    operations: ManifestFileOperations | None = None,
) -> Result[HandoffManifest] | ManifestPersistenceResult:
    """Apply only the caller-confirmed atomic prepared-to-started transition."""

    if gsd_accepted is not True:
        return _failure("gsd-acceptance-required")
    if not _valid_change_id(change_id):
        return _failure("change-id-invalid")
    target = repository / _manifest_path(change_id)
    try:
        parsed = parse_manifest_bytes(target.read_bytes())
    except OSError:
        return _failure(
            "manifest-read-failed",
            category=IssueCategory.PERSISTENCE,
            known_state=KnownState.UNKNOWN,
        )
    if isinstance(parsed, Failure):
        return parsed
    if parsed.value.change_id != change_id:
        return _failure(
            "manifest-identity-mismatch",
            category=IssueCategory.PERSISTENCE,
            known_state=KnownState.UNKNOWN,
        )
    started = replace(parsed.value, handoff_state=HandoffState.STARTED)
    persisted = ManifestRepository(target, operations=operations).persist(
        started,
        expected_existing=HandoffState.PREPARED,
    )
    if isinstance(persisted, Success):
        route = InputRoute(parsed.value.capabilities.openspec.input_route)
        return Success(persisted.value, route=route)
    return persisted
