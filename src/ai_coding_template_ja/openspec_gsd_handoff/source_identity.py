"""Bounded canonical Markdown observations for stable source identity."""

from __future__ import annotations

import hashlib
import re
import stat
import unicodedata
from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path

from .models import (
    ClassifiedIssue,
    Failure,
    IssueCategory,
    KnownState,
    Result,
    Success,
)

_FINGERPRINT_VERSION = "openspec-source-v1\0"
_REQUIREMENT_ID = re.compile(r"REQ-([0-9]{6})\Z")


class SourceCategory(StrEnum):
    """Stable source namespaces owned by the hardening manifest."""

    REQUIREMENT = "requirement"
    SCENARIO = "scenario"


@dataclass(frozen=True)
class SourceIdentityLimits:
    """Bounds applied before a complete source inventory can be returned."""

    max_items: int = 4096
    bytes_per_file: int = 8_388_608
    bytes_total: int = 8_388_608


DEFAULT_SOURCE_IDENTITY_LIMITS = SourceIdentityLimits()


@dataclass(frozen=True)
class SourceParentLocator:
    """Normalized requirement locator resolved to a stable ID by the allocator."""

    source_path: str
    normalized_heading: str


@dataclass(frozen=True)
class SourceObservation:
    """One immutable source block and its raw diagnostic evidence."""

    category: SourceCategory
    source_path: str
    raw_heading: str
    normalized_heading: str
    normalized_block: str
    parent_locator: SourceParentLocator | None


@dataclass(frozen=True)
class SourceInventory:
    """A complete inventory; partial observations are never exposed."""

    items: tuple[SourceObservation, ...]


@dataclass(frozen=True)
class _Heading:
    line_index: int
    level: int
    raw_line: str
    normalized_heading: str
    category: SourceCategory | None
    parent_heading: str | None


@dataclass(frozen=True)
class _Fence:
    marker: str
    length: int


class _SourceInputError(Exception):
    def __init__(self, code: str) -> None:
        self.code = code


def _failure(
    code: str,
    *,
    category: IssueCategory = IssueCategory.ARTIFACT,
) -> Failure:
    return Failure(
        ClassifiedIssue(
            category=category,
            code=code,
            known_state=KnownState.MANIFEST_ABSENT,
        )
    )


def _is_horizontal_whitespace(character: str) -> bool:
    return character == "\t" or unicodedata.category(character) == "Zs"


def _strip_horizontal_left(value: str) -> str:
    index = 0
    while index < len(value) and _is_horizontal_whitespace(value[index]):
        index += 1
    return value[index:]


def _strip_horizontal_right(value: str) -> str:
    index = len(value)
    while index > 0 and _is_horizontal_whitespace(value[index - 1]):
        index -= 1
    return value[:index]


def _strip_horizontal(value: str) -> str:
    return _strip_horizontal_right(_strip_horizontal_left(value))


def _collapse_horizontal(value: str) -> str:
    normalized: list[str] = []
    in_run = False
    for character in value:
        if _is_horizontal_whitespace(character):
            if not in_run:
                normalized.append(" ")
            in_run = True
        else:
            normalized.append(character)
            in_run = False
    return "".join(normalized)


def _normalize_heading_text(value: str) -> str:
    content = _strip_horizontal(value)
    closing_start = len(content)
    while closing_start > 0 and content[closing_start - 1] == "#":
        closing_start -= 1
    if (
        closing_start < len(content)
        and closing_start > 0
        and _is_horizontal_whitespace(content[closing_start - 1])
    ):
        content = _strip_horizontal_right(content[:closing_start])
    return _collapse_horizontal(content)


def _parse_atx_heading(line: str, line_index: int) -> _Heading | None:
    marker_end = 0
    while marker_end < len(line) and line[marker_end] == "#":
        marker_end += 1
    if marker_end == 0:
        suspicious = _strip_horizontal_left(line)
        if suspicious.startswith(("Requirement:", "Scenario:", "###Requirement:")):
            raise _SourceInputError("source-heading-unsupported")
        return None
    if marker_end > 6:
        raise _SourceInputError("source-heading-unsupported")
    if marker_end < len(line) and not _is_horizontal_whitespace(line[marker_end]):
        if "Requirement:" in line or "Scenario:" in line:
            raise _SourceInputError("source-heading-unsupported")
        return None

    normalized_heading = _normalize_heading_text(line[marker_end:])
    category: SourceCategory | None = None
    if normalized_heading.startswith("Requirement:"):
        if marker_end != 3 or not normalized_heading.removeprefix("Requirement:").strip(
            " "
        ):
            raise _SourceInputError("source-heading-unsupported")
        category = SourceCategory.REQUIREMENT
    elif normalized_heading.startswith("Scenario:"):
        if marker_end != 4 or not normalized_heading.removeprefix("Scenario:").strip(
            " "
        ):
            raise _SourceInputError("source-heading-unsupported")
        category = SourceCategory.SCENARIO
    elif normalized_heading.casefold().startswith(("requirement", "scenario")):
        raise _SourceInputError("source-heading-unsupported")

    return _Heading(
        line_index=line_index,
        level=marker_end,
        raw_line="",
        normalized_heading=normalized_heading,
        category=category,
        parent_heading=None,
    )


def _parse_fence(line: str, active: _Fence | None) -> _Fence | None:
    indentation = 0
    while indentation < len(line) and line[indentation] == " ":
        indentation += 1
    if indentation > 3 or indentation == len(line):
        return active
    marker = line[indentation]
    if marker not in ("`", "~"):
        return active
    marker_end = indentation
    while marker_end < len(line) and line[marker_end] == marker:
        marker_end += 1
    marker_length = marker_end - indentation
    if marker_length < 3:
        return active

    remainder = line[marker_end:]
    if active is None:
        if marker == "`" and "`" in remainder:
            raise _SourceInputError("source-fence-ambiguous")
        return _Fence(marker=marker, length=marker_length)
    if (
        marker == active.marker
        and marker_length >= active.length
        and not _strip_horizontal(remainder)
    ):
        return None
    return active


def _scan_headings(raw_lines: list[str], normalized_lines: list[str]) -> list[_Heading]:
    headings: list[_Heading] = []
    active_fence: _Fence | None = None
    parent_heading: str | None = None
    for line_index, normalized_line in enumerate(normalized_lines):
        previous_fence = active_fence
        active_fence = _parse_fence(normalized_line, active_fence)
        if previous_fence is not None or active_fence is not None:
            continue

        parsed = _parse_atx_heading(normalized_line, line_index)
        if parsed is None:
            continue
        if parsed.category is SourceCategory.REQUIREMENT:
            parent_heading = parsed.normalized_heading
        elif parsed.category is SourceCategory.SCENARIO:
            if parent_heading is None:
                raise _SourceInputError("source-scenario-parent-missing")
        elif parsed.level <= 3:
            parent_heading = None
        headings.append(
            _Heading(
                line_index=parsed.line_index,
                level=parsed.level,
                raw_line=raw_lines[line_index],
                normalized_heading=parsed.normalized_heading,
                category=parsed.category,
                parent_heading=(
                    parent_heading
                    if parsed.category is SourceCategory.SCENARIO
                    else None
                ),
            )
        )
    if active_fence is not None:
        raise _SourceInputError("source-fence-unclosed")
    return headings


def _normalize_block(lines: Sequence[str]) -> str:
    normalized = [_strip_horizontal_right(line) for line in lines]
    while normalized and not normalized[-1]:
        normalized.pop()
    return "\n".join(normalized) + "\n"


def _observations_from_source(
    source_path: str,
    content_bytes: bytes,
) -> list[SourceObservation]:
    try:
        decoded = content_bytes.decode("utf-8")
    except UnicodeDecodeError as error:
        raise _SourceInputError("source-utf8-invalid") from error
    with_lf = decoded.replace("\r\n", "\n").replace("\r", "\n")
    raw_lines = with_lf.split("\n")
    normalized_lines = [unicodedata.normalize("NFC", line) for line in raw_lines]
    headings = _scan_headings(raw_lines, normalized_lines)
    observations: list[SourceObservation] = []
    for heading_index, heading in enumerate(headings):
        if heading.category is None:
            continue
        boundary = len(normalized_lines)
        for candidate in headings[heading_index + 1 :]:
            if candidate.level <= heading.level:
                boundary = candidate.line_index
                break
        parent_locator = (
            SourceParentLocator(
                source_path=source_path,
                normalized_heading=heading.parent_heading,
            )
            if heading.parent_heading is not None
            else None
        )
        observations.append(
            SourceObservation(
                category=heading.category,
                source_path=source_path,
                raw_heading=heading.raw_line,
                normalized_heading=heading.normalized_heading,
                normalized_block=_normalize_block(
                    normalized_lines[heading.line_index + 1 : boundary]
                ),
                parent_locator=parent_locator,
            )
        )
    return observations


def _valid_limits(limits: SourceIdentityLimits) -> bool:
    return all(
        type(value) is int and value > 0
        for value in (limits.max_items, limits.bytes_per_file, limits.bytes_total)
    )


def _canonical_source_path(path: str | Path) -> tuple[tuple[str, ...], str]:
    raw_path = str(path)
    if not raw_path or raw_path.startswith("/") or "\\" in raw_path or "\0" in raw_path:
        raise _SourceInputError("source-path-invalid")
    raw_segments = tuple(raw_path.split("/"))
    if any(segment in ("", ".", "..") for segment in raw_segments):
        raise _SourceInputError("source-path-invalid")
    normalized_segments = tuple(
        unicodedata.normalize("NFC", segment) for segment in raw_segments
    )
    return raw_segments, "/".join(normalized_segments)


def _contains_symlink(repository: Path, raw_segments: Sequence[str]) -> bool | None:
    current = repository
    try:
        for segment in raw_segments:
            current /= segment
            if stat.S_ISLNK(current.lstat().st_mode):
                return True
    except OSError:
        return None
    return False


def read_source_inventory(
    repository_root: Path,
    source_paths: Sequence[str | Path],
    *,
    limits: SourceIdentityLimits = DEFAULT_SOURCE_IDENTITY_LIMITS,
) -> Result[SourceInventory]:
    """Read all canonical Markdown inputs once or return one whole-operation failure."""

    if not _valid_limits(limits):
        return _failure("source-limits-invalid", category=IssueCategory.INPUT)
    if not source_paths:
        return _failure("source-paths-empty", category=IssueCategory.INPUT)
    if len(source_paths) > limits.max_items:
        return _failure("source-path-count-limit-exceeded")
    try:
        repository = repository_root.resolve(strict=True)
    except OSError:
        return _failure("source-root-unreadable")
    if not repository.is_dir():
        return _failure("source-root-invalid")

    prepared_paths: list[tuple[Path, str]] = []
    aliases: set[str] = set()
    for source_path in source_paths:
        try:
            raw_segments, canonical_path = _canonical_source_path(source_path)
        except _SourceInputError as error:
            return _failure(error.code, category=IssueCategory.INPUT)
        alias = canonical_path.casefold()
        if alias in aliases:
            return _failure("source-path-alias")
        aliases.add(alias)
        logical_path = repository.joinpath(*raw_segments)
        symlink = _contains_symlink(repository, raw_segments)
        if symlink is None:
            return _failure("source-path-unreadable")
        if symlink:
            return _failure("source-path-symlink")
        try:
            resolved_path = logical_path.resolve(strict=True)
        except OSError:
            return _failure("source-path-unreadable")
        if not resolved_path.is_relative_to(repository):
            return _failure("source-path-outside-repository")
        if not resolved_path.is_file():
            return _failure("source-path-not-file")
        prepared_paths.append((resolved_path, canonical_path))

    observations: list[SourceObservation] = []
    aggregate_bytes = 0
    identities: set[tuple[object, ...]] = set()
    for resolved_path, canonical_path in prepared_paths:
        try:
            with resolved_path.open("rb") as stream:
                content_bytes = stream.read(limits.bytes_per_file + 1)
        except OSError:
            return _failure("source-read-failed")
        if len(content_bytes) > limits.bytes_per_file:
            return _failure("source-file-limit-exceeded")
        aggregate_bytes += len(content_bytes)
        if aggregate_bytes > limits.bytes_total:
            return _failure("source-total-limit-exceeded")
        try:
            parsed = _observations_from_source(canonical_path, content_bytes)
        except _SourceInputError as error:
            return _failure(error.code)
        for observation in parsed:
            identity = (
                observation.category,
                observation.source_path,
                observation.normalized_heading,
                observation.parent_locator,
            )
            if identity in identities:
                return _failure("source-identity-duplicate")
            identities.add(identity)
            observations.append(observation)
            if len(observations) > limits.max_items:
                return _failure("source-item-limit-exceeded")

    return Success(SourceInventory(items=tuple(observations)))


def fingerprint_source_observation(
    observation: SourceObservation,
    *,
    parent_id: str | None,
) -> Result[str]:
    """Hash exact versioned, length-framed normalized observation bytes."""

    if observation.category is SourceCategory.REQUIREMENT:
        if parent_id is not None or observation.parent_locator is not None:
            return _failure("source-parent-id-invalid", category=IssueCategory.INPUT)
    else:
        match = _REQUIREMENT_ID.fullmatch(parent_id or "")
        if (
            observation.parent_locator is None
            or match is None
            or not 1 <= int(match.group(1)) <= 999_999
        ):
            return _failure("source-parent-id-invalid", category=IssueCategory.INPUT)

    components = (
        _FINGERPRINT_VERSION,
        observation.category.value,
        observation.source_path,
        observation.normalized_heading,
        parent_id or "",
        observation.normalized_block,
    )
    framed = bytearray()
    for component in components:
        encoded = component.encode("utf-8")
        framed.extend(len(encoded).to_bytes(8, "big"))
        framed.extend(encoded)
    return Success(hashlib.sha256(framed).hexdigest())
