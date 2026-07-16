"""Contained, bounded, read-once access to canonical OpenSpec Markdown."""

from __future__ import annotations

import hashlib
import re
import stat
from dataclasses import dataclass
from pathlib import Path

from .models import (
    Artifact,
    ArtifactClaim,
    ArtifactKind,
    ClassifiedIssue,
    Failure,
    IssueCategory,
    KnownState,
    Result,
    Success,
)

_CHANGE_ID = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")


@dataclass(frozen=True)
class ArtifactLimits:
    """Source-pinned OpenSpec artifact input limits."""

    max_files: int = 64
    bytes_per_file: int = 1_048_576
    bytes_total: int = 4_194_304
    change_id_bytes: int = 128


DEFAULT_ARTIFACT_LIMITS = ArtifactLimits()


def _failure(code: str, *, category: IssueCategory = IssueCategory.ARTIFACT) -> Failure:
    return Failure(
        ClassifiedIssue(
            category=category,
            code=code,
            known_state=KnownState.MANIFEST_ABSENT,
        )
    )


def _valid_change_id(change_id: str, limit: int) -> bool:
    try:
        encoded = change_id.encode("ascii")
    except UnicodeEncodeError:
        return False
    return 0 < len(encoded) <= limit and _CHANGE_ID.fullmatch(change_id) is not None


def _canonical_logical_path(
    repository: Path, change_id: str, claim: ArtifactClaim
) -> Path | None:
    requested = claim.path if claim.path.is_absolute() else repository / claim.path
    try:
        relative = requested.relative_to(repository)
    except ValueError:
        return None
    root = ("openspec", "changes", change_id)
    expected_singleton = {
        ArtifactKind.PROPOSAL: (*root, "proposal.md"),
        ArtifactKind.DESIGN: (*root, "design.md"),
        ArtifactKind.TASKS: (*root, "tasks.md"),
    }.get(claim.kind)
    if expected_singleton is not None:
        return requested if relative.parts == expected_singleton else None
    if claim.kind is not ArtifactKind.SPEC:
        return None
    parts = relative.parts
    if (
        len(parts) != 6
        or parts[:3] != root
        or parts[3] != "specs"
        or not parts[4]
        or parts[5] != "spec.md"
    ):
        return None
    return requested


def _contains_symlink(repository: Path, logical_path: Path) -> bool | None:
    """Check existing canonical components; None means the path is unreadable."""

    current = repository
    try:
        relative = logical_path.relative_to(repository)
        for component in relative.parts:
            current /= component
            if stat.S_ISLNK(current.lstat().st_mode):
                return True
    except OSError:
        return None
    return False


def read_canonical_artifacts(
    repository_root: Path,
    change_id: str,
    claims: list[ArtifactClaim] | tuple[ArtifactClaim, ...],
    *,
    limits: ArtifactLimits = DEFAULT_ARTIFACT_LIMITS,
) -> Result[tuple[Artifact, ...]]:
    """Read all claims as one operation or return one classified failure."""

    if not _valid_change_id(change_id, limits.change_id_bytes):
        return _failure("change-id-invalid", category=IssueCategory.INPUT)
    if not claims:
        return _failure("artifacts-empty")
    if len(claims) > limits.max_files:
        return _failure("artifact-count-limit-exceeded")

    try:
        repository = repository_root.resolve(strict=True)
        change_root = (repository / "openspec" / "changes" / change_id).resolve(
            strict=True
        )
    except OSError:
        return _failure("artifact-root-unreadable")
    if not repository.is_dir() or not change_root.is_dir():
        return _failure("artifact-root-invalid")
    if not change_root.is_relative_to(repository):
        return _failure("artifact-change-root-outside-repository")

    resolved_claims: list[tuple[ArtifactClaim, Path, Path]] = []
    seen_logical_paths: set[Path] = set()
    seen_resolved_paths: set[Path] = set()
    for claim in claims:
        logical_path = _canonical_logical_path(repository, change_id, claim)
        if logical_path is None:
            return _failure("artifact-path-noncanonical")
        symlink = _contains_symlink(repository, logical_path)
        if symlink is None:
            return _failure("artifact-path-unreadable")
        if symlink:
            return _failure("artifact-path-symlink")
        try:
            resolved = logical_path.resolve(strict=True)
        except OSError:
            return _failure("artifact-path-unreadable")
        if not resolved.is_relative_to(repository) or not resolved.is_relative_to(
            change_root
        ):
            return _failure("artifact-path-outside-change")
        if not resolved.is_file() or resolved.suffix != ".md":
            return _failure("artifact-path-not-markdown-file")
        if logical_path in seen_logical_paths or resolved in seen_resolved_paths:
            return _failure("artifact-path-duplicate")
        seen_logical_paths.add(logical_path)
        seen_resolved_paths.add(resolved)
        resolved_claims.append((claim, logical_path, resolved))

    artifacts: list[Artifact] = []
    aggregate_bytes = 0
    for claim, logical_path, resolved in resolved_claims:
        try:
            with resolved.open("rb") as stream:
                content_bytes = stream.read(limits.bytes_per_file + 1)
        except OSError:
            return _failure("artifact-read-failed")
        if len(content_bytes) > limits.bytes_per_file:
            return _failure("artifact-file-limit-exceeded")
        aggregate_bytes += len(content_bytes)
        if aggregate_bytes > limits.bytes_total:
            return _failure("artifact-total-limit-exceeded")
        try:
            content = content_bytes.decode("utf-8")
        except UnicodeDecodeError:
            return _failure("artifact-utf8-invalid")
        artifacts.append(
            Artifact(
                kind=claim.kind,
                path=logical_path.relative_to(repository).as_posix(),
                sha256=hashlib.sha256(content_bytes).hexdigest(),
                content=content,
                content_bytes=content_bytes,
            )
        )

    return Success(tuple(artifacts))
