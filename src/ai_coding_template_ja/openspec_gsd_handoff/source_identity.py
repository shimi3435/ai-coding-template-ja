"""Bounded canonical Markdown observations for stable source identity."""

from __future__ import annotations

import hashlib
import os
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
_SCENARIO_ID = re.compile(r"SCN-([0-9]{6})\Z")
_FINGERPRINT = re.compile(r"[0-9a-f]{64}\Z")
_CHANGE_ID = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")
_MAX_SOURCE_ITEMS = 4096
_MAX_SOURCE_STATE_BYTES = 8_388_608
_DIRECTORY_OPEN_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
_FILE_OPEN_FLAGS = os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC


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
class ActiveSourceItem:
    """One active stable identity persisted by the hardening manifest."""

    id: str
    category: SourceCategory
    source_path: str
    raw_heading: str
    parent_id: str | None
    fingerprint: str


@dataclass(frozen=True)
class SourceTombstone:
    """One removed identity whose namespace suffix remains reserved."""

    id: str
    category: SourceCategory
    last_source_path: str
    last_raw_heading: str
    last_parent_id: str | None
    fingerprint: str


@dataclass(frozen=True)
class SourceIdentityState:
    """Complete allocator state for one OpenSpec change."""

    next_requirement_id: int
    next_scenario_id: int
    active: tuple[ActiveSourceItem, ...]
    tombstones: tuple[SourceTombstone, ...]


@dataclass(frozen=True)
class ExplicitSourceMatch:
    """Operator-supplied one-to-one match for a changed source identity."""

    source_path: str
    normalized_heading: str
    parent_locator: SourceParentLocator | None
    source_id: str


@dataclass(frozen=True)
class SourceReconciliation:
    """Complete stable-state result and deterministic change evidence."""

    state: SourceIdentityState
    created: tuple[str, ...]
    updated: tuple[str, ...]
    tombstoned: tuple[str, ...]
    exclusions: tuple[str, ...]


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


def _utf8_bytes(value: str) -> bytes:
    try:
        return value.encode("utf-8")
    except UnicodeEncodeError as error:
        raise _SourceInputError("source-unicode-invalid") from error


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
        if suspicious.startswith(
            (
                "Requirement:",
                "Scenario:",
                "### Requirement:",
                "#### Scenario:",
                "###Requirement:",
            )
        ):
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
    *,
    max_items: int,
) -> list[SourceObservation]:
    try:
        decoded = content_bytes.decode("utf-8")
    except UnicodeDecodeError as error:
        raise _SourceInputError("source-utf8-invalid") from error
    with_lf = decoded.replace("\r\n", "\n").replace("\r", "\n")
    raw_lines = with_lf.split("\n")
    normalized_lines = [unicodedata.normalize("NFC", line) for line in raw_lines]
    headings = _scan_headings(raw_lines, normalized_lines)
    if not any(heading.category is not None for heading in headings):
        raise _SourceInputError("source-items-empty")
    observations: list[SourceObservation] = []
    for heading_index, heading in enumerate(headings):
        if heading.category is None:
            continue
        if len(observations) == max_items:
            raise _SourceInputError("source-item-limit-exceeded")
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
    if (
        len(normalized_segments) != 6
        or normalized_segments[:2] != ("openspec", "changes")
        or _CHANGE_ID.fullmatch(normalized_segments[2]) is None
        or normalized_segments[3] != "specs"
        or not normalized_segments[4]
        or normalized_segments[5] != "spec.md"
    ):
        raise _SourceInputError("source-path-noncanonical")
    return raw_segments, "/".join(normalized_segments)


def _source_path_alias_key(source_path: str) -> str:
    """Return the platform-independent alias key for one canonical source path."""

    return unicodedata.normalize("NFC", source_path).casefold()


def _entry_is_symlink(parent_fd: int, name: str) -> bool:
    try:
        entry = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    except OSError:
        return False
    return stat.S_ISLNK(entry.st_mode)


def _open_anchored_entry(
    parent_fd: int,
    name: str,
    *,
    directory: bool,
) -> int:
    flags = _DIRECTORY_OPEN_FLAGS if directory else _FILE_OPEN_FLAGS
    try:
        descriptor = os.open(name, flags, dir_fd=parent_fd)
    except OSError as error:
        if _entry_is_symlink(parent_fd, name):
            raise _SourceInputError("source-path-symlink") from error
        raise _SourceInputError("source-path-unreadable") from error

    try:
        opened = os.fstat(descriptor)
    except OSError as error:
        try:
            os.close(descriptor)
        except OSError:
            pass
        raise _SourceInputError("source-path-unreadable") from error
    expected_type = stat.S_ISDIR if directory else stat.S_ISREG
    if not expected_type(opened.st_mode):
        try:
            os.close(descriptor)
        except OSError:
            pass
        code = "source-path-unreadable" if directory else "source-path-not-file"
        raise _SourceInputError(code)
    return descriptor


def _verify_anchored_entry(parent_fd: int, name: str, descriptor: int) -> None:
    try:
        linked = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
        opened = os.fstat(descriptor)
    except OSError as error:
        raise _SourceInputError("source-path-identity-changed") from error
    if stat.S_ISLNK(linked.st_mode):
        raise _SourceInputError("source-path-symlink")
    if (linked.st_dev, linked.st_ino, stat.S_IFMT(linked.st_mode)) != (
        opened.st_dev,
        opened.st_ino,
        stat.S_IFMT(opened.st_mode),
    ):
        raise _SourceInputError("source-path-identity-changed")


def _read_anchored_source(
    repository_fd: int,
    raw_segments: Sequence[str],
    *,
    max_bytes: int,
) -> bytes:
    opened_descriptors: list[int] = []
    anchored_entries: list[tuple[int, str, int]] = []
    content_bytes: bytes | None = None
    read_error: _SourceInputError | None = None
    parent_fd = repository_fd
    try:
        for segment in raw_segments[:-1]:
            descriptor = _open_anchored_entry(parent_fd, segment, directory=True)
            opened_descriptors.append(descriptor)
            anchored_entries.append((parent_fd, segment, descriptor))
            _verify_anchored_entry(parent_fd, segment, descriptor)
            parent_fd = descriptor

        filename = raw_segments[-1]
        source_fd = _open_anchored_entry(parent_fd, filename, directory=False)
        opened_descriptors.append(source_fd)
        anchored_entries.append((parent_fd, filename, source_fd))
        _verify_anchored_entry(parent_fd, filename, source_fd)

        chunks: list[bytes] = []
        remaining = max_bytes + 1
        while remaining:
            chunk = os.read(source_fd, remaining)
            if not chunk:
                break
            chunks.append(chunk)
            remaining -= len(chunk)
        content_bytes = b"".join(chunks)

        for entry_parent_fd, entry_name, descriptor in anchored_entries:
            _verify_anchored_entry(entry_parent_fd, entry_name, descriptor)
    except _SourceInputError as error:
        read_error = error
    except OSError:
        read_error = _SourceInputError("source-read-failed")
    finally:
        for descriptor in reversed(opened_descriptors):
            try:
                os.close(descriptor)
            except OSError:
                if read_error is None:
                    read_error = _SourceInputError("source-read-failed")

    if read_error is not None:
        raise read_error
    if content_bytes is None:
        raise _SourceInputError("source-read-failed")
    return content_bytes


def _read_inventory_from_repository_fd(
    repository_fd: int,
    source_paths: Sequence[str | Path],
    limits: SourceIdentityLimits,
) -> Result[SourceInventory]:
    prepared_paths: list[tuple[tuple[str, ...], str]] = []
    aliases: set[str] = set()
    for source_path in source_paths:
        try:
            raw_segments, canonical_path = _canonical_source_path(source_path)
        except _SourceInputError as error:
            return _failure(error.code, category=IssueCategory.INPUT)
        alias = _source_path_alias_key(canonical_path)
        if alias in aliases:
            return _failure("source-path-alias")
        aliases.add(alias)
        prepared_paths.append((raw_segments, canonical_path))

    observations: list[SourceObservation] = []
    aggregate_bytes = 0
    identities: set[tuple[object, ...]] = set()
    for raw_segments, canonical_path in prepared_paths:
        try:
            content_bytes = _read_anchored_source(
                repository_fd,
                raw_segments,
                max_bytes=limits.bytes_per_file,
            )
        except _SourceInputError as error:
            return _failure(error.code)
        if len(content_bytes) > limits.bytes_per_file:
            return _failure("source-file-limit-exceeded")
        aggregate_bytes += len(content_bytes)
        if aggregate_bytes > limits.bytes_total:
            return _failure("source-total-limit-exceeded")
        try:
            parsed = _observations_from_source(
                canonical_path,
                content_bytes,
                max_items=limits.max_items - len(observations),
            )
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

    return Success(SourceInventory(items=tuple(observations)))


def source_inventory_from_bytes(
    source_files: Sequence[tuple[str | Path, bytes]],
    *,
    limits: SourceIdentityLimits = DEFAULT_SOURCE_IDENTITY_LIMITS,
) -> Result[SourceInventory]:
    """Build one complete inventory from already descriptor-anchored source bytes."""

    if not _valid_limits(limits):
        return _failure("source-limits-invalid", category=IssueCategory.INPUT)
    if not source_files:
        return _failure("source-paths-empty", category=IssueCategory.INPUT)
    if len(source_files) > limits.max_items:
        return _failure("source-path-count-limit-exceeded")

    prepared: list[tuple[str, bytes]] = []
    aliases: set[str] = set()
    aggregate_bytes = 0
    for source_path, content_bytes in source_files:
        try:
            _, canonical_path = _canonical_source_path(source_path)
        except _SourceInputError as error:
            return _failure(error.code, category=IssueCategory.INPUT)
        if type(content_bytes) is not bytes:
            return _failure("source-bytes-invalid", category=IssueCategory.INPUT)
        alias = _source_path_alias_key(canonical_path)
        if alias in aliases:
            return _failure("source-path-alias")
        aliases.add(alias)
        if len(content_bytes) > limits.bytes_per_file:
            return _failure("source-file-limit-exceeded")
        aggregate_bytes += len(content_bytes)
        if aggregate_bytes > limits.bytes_total:
            return _failure("source-total-limit-exceeded")
        prepared.append((canonical_path, content_bytes))

    observations: list[SourceObservation] = []
    identities: set[tuple[object, ...]] = set()
    for canonical_path, content_bytes in prepared:
        try:
            parsed = _observations_from_source(
                canonical_path,
                content_bytes,
                max_items=limits.max_items - len(observations),
            )
        except _SourceInputError as error:
            return _failure(error.code)
        for observation in parsed:
            identity = _observation_key(observation)
            if identity in identities:
                return _failure("source-identity-duplicate")
            identities.add(identity)
            observations.append(observation)
    return Success(SourceInventory(items=tuple(observations)))


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
    except (OSError, RuntimeError):
        return _failure("source-root-unreadable")
    try:
        linked_repository = os.stat(repository, follow_symlinks=False)
    except OSError:
        return _failure("source-root-unreadable")
    if stat.S_ISLNK(linked_repository.st_mode):
        return _failure("source-root-unreadable")
    if not stat.S_ISDIR(linked_repository.st_mode):
        return _failure("source-root-invalid")
    try:
        repository_fd = os.open(repository, _DIRECTORY_OPEN_FLAGS)
    except OSError:
        try:
            current_repository = os.stat(repository, follow_symlinks=False)
        except OSError:
            return _failure("source-root-identity-changed")
        if (
            current_repository.st_dev,
            current_repository.st_ino,
            stat.S_IFMT(current_repository.st_mode),
        ) != (
            linked_repository.st_dev,
            linked_repository.st_ino,
            stat.S_IFMT(linked_repository.st_mode),
        ):
            return _failure("source-root-identity-changed")
        return _failure("source-root-unreadable")
    try:
        repository_stat = os.fstat(repository_fd)
    except OSError:
        try:
            os.close(repository_fd)
        except OSError:
            pass
        return _failure("source-root-unreadable")
    if (
        linked_repository.st_dev,
        linked_repository.st_ino,
        stat.S_IFMT(linked_repository.st_mode),
    ) != (
        repository_stat.st_dev,
        repository_stat.st_ino,
        stat.S_IFMT(repository_stat.st_mode),
    ):
        try:
            os.close(repository_fd)
        except OSError:
            pass
        return _failure("source-root-identity-changed")

    result = _read_inventory_from_repository_fd(
        repository_fd,
        source_paths,
        limits,
    )
    try:
        linked_repository = os.stat(repository, follow_symlinks=False)
        repository_stat = os.fstat(repository_fd)
    except OSError:
        result = _failure("source-root-identity-changed")
    else:
        if (
            linked_repository.st_dev,
            linked_repository.st_ino,
            stat.S_IFMT(linked_repository.st_mode),
        ) != (
            repository_stat.st_dev,
            repository_stat.st_ino,
            stat.S_IFMT(repository_stat.st_mode),
        ):
            result = _failure("source-root-identity-changed")
    try:
        os.close(repository_fd)
    except OSError:
        if isinstance(result, Success):
            return _failure("source-root-unreadable")
    return result


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
    try:
        for component in components:
            encoded = _utf8_bytes(component)
            framed.extend(len(encoded).to_bytes(8, "big"))
            framed.extend(encoded)
    except _SourceInputError as error:
        return _failure(error.code, category=IssueCategory.INPUT)
    return Success(hashlib.sha256(framed).hexdigest())


def _source_id_suffix(source_id: str, category: SourceCategory) -> int:
    pattern = (
        _REQUIREMENT_ID if category is SourceCategory.REQUIREMENT else _SCENARIO_ID
    )
    match = pattern.fullmatch(source_id)
    if match is None:
        raise _SourceInputError("source-state-id-invalid")
    suffix = int(match.group(1))
    if not 1 <= suffix <= 999_999:
        raise _SourceInputError("source-state-id-invalid")
    return suffix


def _counter_for(state: SourceIdentityState, category: SourceCategory) -> int:
    return (
        state.next_requirement_id
        if category is SourceCategory.REQUIREMENT
        else state.next_scenario_id
    )


def _normalized_persisted_heading(
    raw_heading: str,
    category: SourceCategory,
) -> str:
    if not isinstance(raw_heading, str) or "\n" in raw_heading or "\r" in raw_heading:
        raise _SourceInputError("source-state-heading-invalid")
    normalized_line = unicodedata.normalize("NFC", raw_heading)
    parsed = _parse_atx_heading(normalized_line, 0)
    if parsed is None or parsed.category is not category:
        raise _SourceInputError("source-state-heading-invalid")
    return parsed.normalized_heading


def _validate_persisted_path(source_path: str) -> None:
    if not isinstance(source_path, str):
        raise _SourceInputError("source-state-path-invalid")
    try:
        _, canonical = _canonical_source_path(source_path)
    except _SourceInputError as error:
        raise _SourceInputError("source-state-path-invalid") from error
    if canonical != source_path:
        raise _SourceInputError("source-state-path-invalid")


def _validate_fingerprint(fingerprint: str) -> None:
    if not isinstance(fingerprint, str) or _FINGERPRINT.fullmatch(fingerprint) is None:
        raise _SourceInputError("source-state-fingerprint-invalid")


def _validate_counter(counter: object) -> int:
    if type(counter) is not int or not 1 <= counter <= 1_000_000:
        raise _SourceInputError("source-state-counter-invalid")
    return counter


def _validate_source_state(value: object) -> SourceIdentityState:
    if not isinstance(value, SourceIdentityState):
        raise _SourceInputError("source-state-invalid")
    state = value
    next_requirement_id = _validate_counter(state.next_requirement_id)
    next_scenario_id = _validate_counter(state.next_scenario_id)
    if type(state.active) is not tuple or type(state.tombstones) is not tuple:
        raise _SourceInputError("source-state-collection-invalid")
    if len(state.active) + len(state.tombstones) > _MAX_SOURCE_ITEMS:
        raise _SourceInputError("source-state-limit-exceeded")
    if any(not isinstance(item, ActiveSourceItem) for item in state.active):
        raise _SourceInputError("source-state-item-invalid")
    if any(not isinstance(item, SourceTombstone) for item in state.tombstones):
        raise _SourceInputError("source-state-item-invalid")
    if any(
        type(item.id) is not str
        or type(item.category) is not SourceCategory
        or type(item.source_path) is not str
        or type(item.raw_heading) is not str
        or (item.parent_id is not None and type(item.parent_id) is not str)
        or type(item.fingerprint) is not str
        for item in state.active
    ):
        raise _SourceInputError("source-state-item-invalid")
    if any(
        type(item.id) is not str
        or type(item.category) is not SourceCategory
        or type(item.last_source_path) is not str
        or type(item.last_raw_heading) is not str
        or (item.last_parent_id is not None and type(item.last_parent_id) is not str)
        or type(item.fingerprint) is not str
        for item in state.tombstones
    ):
        raise _SourceInputError("source-state-item-invalid")

    ids: set[str] = set()
    active_requirement_ids: set[str] = set()
    all_requirement_ids: set[str] = set()
    persisted_identities: set[tuple[SourceCategory, str, str, str | None]] = set()
    persisted_paths_by_alias: dict[str, str] = {}
    aggregate_bytes = 0

    for item in (*state.active, *state.tombstones):
        if type(item.category) is not SourceCategory:
            raise _SourceInputError("source-state-category-invalid")
        suffix = _source_id_suffix(item.id, item.category)
        if item.id in ids:
            raise _SourceInputError("source-state-id-duplicate")
        ids.add(item.id)
        if suffix >= _counter_for(state, item.category):
            raise _SourceInputError("source-state-counter-invalid")
        if item.category is SourceCategory.REQUIREMENT:
            all_requirement_ids.add(item.id)

        if isinstance(item, ActiveSourceItem):
            source_path = item.source_path
            raw_heading = item.raw_heading
            parent_id = item.parent_id
            if item.category is SourceCategory.REQUIREMENT:
                active_requirement_ids.add(item.id)
        elif isinstance(item, SourceTombstone):
            source_path = item.last_source_path
            raw_heading = item.last_raw_heading
            parent_id = item.last_parent_id
        else:
            raise _SourceInputError("source-state-item-invalid")

        _validate_persisted_path(source_path)
        path_alias = _source_path_alias_key(source_path)
        existing_path = persisted_paths_by_alias.get(path_alias)
        if existing_path is not None and existing_path != source_path:
            raise _SourceInputError("source-path-alias")
        persisted_paths_by_alias[path_alias] = source_path
        normalized_heading = _normalized_persisted_heading(
            raw_heading,
            item.category,
        )
        _validate_fingerprint(item.fingerprint)
        aggregate_bytes += sum(
            len(_utf8_bytes(value))
            for value in (
                item.id,
                source_path,
                raw_heading,
                parent_id or "",
                item.fingerprint,
            )
        )
        if aggregate_bytes > _MAX_SOURCE_STATE_BYTES:
            raise _SourceInputError("source-state-limit-exceeded")

        identity = (
            item.category,
            source_path,
            normalized_heading,
            parent_id,
        )
        if identity in persisted_identities:
            if isinstance(item, SourceTombstone):
                raise _SourceInputError("source-tombstone-identity-collision")
            else:
                raise _SourceInputError("source-state-identity-duplicate")
        persisted_identities.add(identity)

    if next_requirement_id != state.next_requirement_id:
        raise _SourceInputError("source-state-counter-invalid")
    if next_scenario_id != state.next_scenario_id:
        raise _SourceInputError("source-state-counter-invalid")

    for item in state.active:
        if item.category is SourceCategory.REQUIREMENT:
            if item.parent_id is not None:
                raise _SourceInputError("source-state-parent-invalid")
        elif (
            item.parent_id is None
            or _REQUIREMENT_ID.fullmatch(item.parent_id) is None
            or item.parent_id not in active_requirement_ids
        ):
            raise _SourceInputError("source-state-parent-invalid")

    for item in state.tombstones:
        if item.category is SourceCategory.REQUIREMENT:
            if item.last_parent_id is not None:
                raise _SourceInputError("source-state-parent-invalid")
        elif (
            item.last_parent_id is None
            or _REQUIREMENT_ID.fullmatch(item.last_parent_id) is None
            or item.last_parent_id not in all_requirement_ids
        ):
            raise _SourceInputError("source-state-parent-invalid")
    return state


def validate_source_identity_state(
    value: object,
) -> Result[SourceIdentityState]:
    """Validate one complete allocator state without unsafe member dereference."""

    try:
        state = _validate_source_state(value)
    except _SourceInputError as error:
        return _failure(error.code, category=IssueCategory.INPUT)
    return Success(state)


def _observation_key(
    observation: SourceObservation,
) -> tuple[SourceCategory, str, str, SourceParentLocator | None]:
    return (
        observation.category,
        observation.source_path,
        observation.normalized_heading,
        observation.parent_locator,
    )


def _validate_inventory(inventory: object) -> SourceInventory:
    if type(inventory) is not SourceInventory:
        raise _SourceInputError("source-inventory-invalid")
    if type(inventory.items) is not tuple:
        raise _SourceInputError("source-inventory-invalid")
    if len(inventory.items) > _MAX_SOURCE_ITEMS:
        raise _SourceInputError("source-item-limit-exceeded")
    if any(type(item) is not SourceObservation for item in inventory.items):
        raise _SourceInputError("source-inventory-invalid")
    for observation in inventory.items:
        if (
            type(observation.category) is not SourceCategory
            or type(observation.source_path) is not str
            or type(observation.raw_heading) is not str
            or type(observation.normalized_heading) is not str
            or type(observation.normalized_block) is not str
        ):
            raise _SourceInputError("source-inventory-invalid")
        parent = observation.parent_locator
        if parent is not None and (
            type(parent) is not SourceParentLocator
            or type(parent.source_path) is not str
            or type(parent.normalized_heading) is not str
        ):
            raise _SourceInputError("source-inventory-invalid")

    identities: set[tuple[SourceCategory, str, str, SourceParentLocator | None]] = set()
    aggregate_bytes = 0
    for observation in inventory.items:
        try:
            _validate_persisted_path(observation.source_path)
            normalized_heading = _normalized_persisted_heading(
                observation.raw_heading,
                observation.category,
            )
        except _SourceInputError as error:
            raise _SourceInputError("source-inventory-invalid") from error
        if normalized_heading != observation.normalized_heading:
            raise _SourceInputError("source-inventory-invalid")
        if not observation.normalized_block.endswith("\n"):
            raise _SourceInputError("source-inventory-invalid")
        if observation.category is SourceCategory.REQUIREMENT:
            if observation.parent_locator is not None:
                raise _SourceInputError("source-inventory-invalid")
        else:
            parent = observation.parent_locator
            if parent is None:
                raise _SourceInputError("source-parent-unresolved")
            try:
                _validate_persisted_path(parent.source_path)
            except _SourceInputError as error:
                raise _SourceInputError("source-parent-unresolved") from error
            if (
                not parent.normalized_heading.startswith("Requirement:")
                or _normalize_heading_text(parent.normalized_heading)
                != parent.normalized_heading
            ):
                raise _SourceInputError("source-parent-unresolved")
        identity = _observation_key(observation)
        if identity in identities:
            raise _SourceInputError("source-identity-duplicate")
        identities.add(identity)
        aggregate_bytes += sum(
            len(_utf8_bytes(value))
            for value in (
                observation.source_path,
                observation.raw_heading,
                observation.normalized_heading,
                observation.normalized_block,
            )
        )
        if aggregate_bytes > _MAX_SOURCE_STATE_BYTES:
            raise _SourceInputError("source-item-limit-exceeded")
    return inventory


def _active_identity(
    item: ActiveSourceItem,
) -> tuple[SourceCategory, str, str, str | None]:
    return (
        item.category,
        item.source_path,
        _normalized_persisted_heading(item.raw_heading, item.category),
        item.parent_id,
    )


def _tombstone_identity(
    item: SourceTombstone,
) -> tuple[SourceCategory, str, str, str | None]:
    return (
        item.category,
        item.last_source_path,
        _normalized_persisted_heading(item.last_raw_heading, item.category),
        item.last_parent_id,
    )


def _allocate_id(category: SourceCategory, counter: int) -> tuple[str, int]:
    if counter == 1_000_000:
        raise _SourceInputError("source-counter-exhausted")
    prefix = "REQ" if category is SourceCategory.REQUIREMENT else "SCN"
    return f"{prefix}-{counter:06d}", counter + 1


def _sorted_observations(
    observations: Sequence[SourceObservation],
) -> tuple[SourceObservation, ...]:
    return tuple(
        sorted(
            observations,
            key=lambda item: (
                item.source_path.encode("utf-8"),
                item.normalized_heading.encode("utf-8"),
            ),
        )
    )


def _explicit_match_category(match: ExplicitSourceMatch) -> SourceCategory:
    if match.normalized_heading.startswith("Requirement:"):
        if match.parent_locator is not None:
            raise _SourceInputError("source-explicit-match-invalid")
        return SourceCategory.REQUIREMENT
    if match.normalized_heading.startswith("Scenario:"):
        if match.parent_locator is None:
            raise _SourceInputError("source-explicit-match-invalid")
        return SourceCategory.SCENARIO
    raise _SourceInputError("source-explicit-match-invalid")


def _validate_explicit_matches(
    explicit_matches: object,
    inventory: SourceInventory,
    previous_state: SourceIdentityState,
) -> dict[
    tuple[SourceCategory, str, str, SourceParentLocator | None],
    ActiveSourceItem,
]:
    if isinstance(explicit_matches, (str, bytes)) or not isinstance(
        explicit_matches, Sequence
    ):
        raise _SourceInputError("source-explicit-match-invalid")
    if len(explicit_matches) > _MAX_SOURCE_ITEMS:
        raise _SourceInputError("source-explicit-match-invalid")
    if any(type(match) is not ExplicitSourceMatch for match in explicit_matches):
        raise _SourceInputError("source-explicit-match-invalid")
    for match in explicit_matches:
        if (
            type(match.source_path) is not str
            or type(match.normalized_heading) is not str
            or type(match.source_id) is not str
        ):
            raise _SourceInputError("source-explicit-match-invalid")
        parent = match.parent_locator
        if parent is not None and (
            type(parent) is not SourceParentLocator
            or type(parent.source_path) is not str
            or type(parent.normalized_heading) is not str
        ):
            raise _SourceInputError("source-explicit-match-invalid")

    inventory_keys = {_observation_key(item) for item in inventory.items}
    active_by_id = {item.id: item for item in previous_state.active}
    matches: dict[
        tuple[SourceCategory, str, str, SourceParentLocator | None],
        ActiveSourceItem,
    ] = {}
    matched_ids: set[str] = set()

    for match in explicit_matches:
        try:
            _validate_persisted_path(match.source_path)
        except _SourceInputError as error:
            raise _SourceInputError("source-explicit-match-invalid") from error
        if (
            _normalize_heading_text(match.normalized_heading)
            != match.normalized_heading
        ):
            raise _SourceInputError("source-explicit-match-invalid")
        category = _explicit_match_category(match)
        if match.parent_locator is not None:
            try:
                _validate_persisted_path(match.parent_locator.source_path)
            except _SourceInputError as error:
                raise _SourceInputError("source-explicit-match-invalid") from error
            if (
                not match.parent_locator.normalized_heading.startswith("Requirement:")
                or _normalize_heading_text(match.parent_locator.normalized_heading)
                != match.parent_locator.normalized_heading
            ):
                raise _SourceInputError("source-explicit-match-invalid")
        pattern = (
            _REQUIREMENT_ID if category is SourceCategory.REQUIREMENT else _SCENARIO_ID
        )
        if pattern.fullmatch(match.source_id) is None:
            raise _SourceInputError("source-explicit-match-invalid")
        previous = active_by_id.get(match.source_id)
        if previous is None or previous.category is not category:
            raise _SourceInputError("source-explicit-match-invalid")
        key = (
            category,
            match.source_path,
            match.normalized_heading,
            match.parent_locator,
        )
        if key not in inventory_keys:
            raise _SourceInputError("source-explicit-match-invalid")
        if key in matches or match.source_id in matched_ids:
            raise _SourceInputError("source-explicit-match-ambiguous")
        matches[key] = previous
        matched_ids.add(match.source_id)
    return matches


def _select_previous_item(
    *,
    exact: ActiveSourceItem | None,
    explicit: ActiveSourceItem | None,
    matched_ids: set[str],
) -> ActiveSourceItem | None:
    if exact is not None and explicit is not None and exact.id != explicit.id:
        raise _SourceInputError("source-explicit-match-ambiguous")
    selected = exact if exact is not None else explicit
    if selected is not None:
        if selected.id in matched_ids:
            raise _SourceInputError("source-explicit-match-ambiguous")
        matched_ids.add(selected.id)
    return selected


def reconcile_source_items(
    inventory: SourceInventory,
    previous_state: SourceIdentityState,
    *,
    explicit_matches: Sequence[ExplicitSourceMatch] = (),
) -> Result[SourceReconciliation]:
    """Reconcile one complete inventory without partial allocation or repair."""

    validated_previous_state = validate_source_identity_state(previous_state)
    if isinstance(validated_previous_state, Failure):
        return validated_previous_state
    previous_state = validated_previous_state.value
    try:
        inventory = _validate_inventory(inventory)
        explicit_by_observation = _validate_explicit_matches(
            explicit_matches,
            inventory,
            previous_state,
        )

        previous_by_identity = {
            _active_identity(item): item for item in previous_state.active
        }
        tombstone_identities = {
            _tombstone_identity(item) for item in previous_state.tombstones
        }
        matched_ids: set[str] = set()
        active: list[ActiveSourceItem] = []
        created: list[str] = []
        updated: list[str] = []
        next_requirement_id = previous_state.next_requirement_id
        next_scenario_id = previous_state.next_scenario_id
        requirement_ids: dict[SourceParentLocator, str] = {}

        requirements = _sorted_observations(
            tuple(
                item
                for item in inventory.items
                if item.category is SourceCategory.REQUIREMENT
            )
        )
        for observation in requirements:
            identity_key = (
                SourceCategory.REQUIREMENT,
                observation.source_path,
                observation.normalized_heading,
                None,
            )
            if identity_key in tombstone_identities:
                raise _SourceInputError("source-tombstone-identity-collision")
            observation_key = _observation_key(observation)
            previous = _select_previous_item(
                exact=previous_by_identity.get(identity_key),
                explicit=explicit_by_observation.get(observation_key),
                matched_ids=matched_ids,
            )
            if previous is None:
                source_id, next_requirement_id = _allocate_id(
                    SourceCategory.REQUIREMENT,
                    next_requirement_id,
                )
                created.append(source_id)
            else:
                source_id = previous.id
            fingerprint = fingerprint_source_observation(
                observation,
                parent_id=None,
            )
            if isinstance(fingerprint, Failure):
                raise _SourceInputError(fingerprint.issue.code)
            current = ActiveSourceItem(
                id=source_id,
                category=SourceCategory.REQUIREMENT,
                source_path=observation.source_path,
                raw_heading=observation.raw_heading,
                parent_id=None,
                fingerprint=fingerprint.value,
            )
            active.append(current)
            if previous is not None and previous != current:
                updated.append(source_id)
            requirement_ids[
                SourceParentLocator(
                    source_path=observation.source_path,
                    normalized_heading=observation.normalized_heading,
                )
            ] = source_id

        scenarios = _sorted_observations(
            tuple(
                item
                for item in inventory.items
                if item.category is SourceCategory.SCENARIO
            )
        )
        for observation in scenarios:
            parent_locator = observation.parent_locator
            if parent_locator is None or parent_locator not in requirement_ids:
                raise _SourceInputError("source-parent-unresolved")
            parent_id = requirement_ids[parent_locator]
            identity_key = (
                SourceCategory.SCENARIO,
                observation.source_path,
                observation.normalized_heading,
                parent_id,
            )
            if identity_key in tombstone_identities:
                raise _SourceInputError("source-tombstone-identity-collision")
            observation_key = _observation_key(observation)
            previous = _select_previous_item(
                exact=previous_by_identity.get(identity_key),
                explicit=explicit_by_observation.get(observation_key),
                matched_ids=matched_ids,
            )
            if previous is None:
                source_id, next_scenario_id = _allocate_id(
                    SourceCategory.SCENARIO,
                    next_scenario_id,
                )
                created.append(source_id)
            else:
                source_id = previous.id
            fingerprint = fingerprint_source_observation(
                observation,
                parent_id=parent_id,
            )
            if isinstance(fingerprint, Failure):
                raise _SourceInputError(fingerprint.issue.code)
            current = ActiveSourceItem(
                id=source_id,
                category=SourceCategory.SCENARIO,
                source_path=observation.source_path,
                raw_heading=observation.raw_heading,
                parent_id=parent_id,
                fingerprint=fingerprint.value,
            )
            active.append(current)
            if previous is not None and previous != current:
                updated.append(source_id)

        newly_tombstoned = tuple(
            SourceTombstone(
                id=item.id,
                category=item.category,
                last_source_path=item.source_path,
                last_raw_heading=item.raw_heading,
                last_parent_id=item.parent_id,
                fingerprint=item.fingerprint,
            )
            for item in previous_state.active
            if item.id not in matched_ids
        )
        tombstones = (*previous_state.tombstones, *newly_tombstoned)
        state = SourceIdentityState(
            next_requirement_id=next_requirement_id,
            next_scenario_id=next_scenario_id,
            active=tuple(active),
            tombstones=tombstones,
        )
        validated_state = validate_source_identity_state(state)
        if isinstance(validated_state, Failure):
            raise _SourceInputError(validated_state.issue.code)
        state = validated_state.value
    except _SourceInputError as error:
        return _failure(error.code, category=IssueCategory.INPUT)

    return Success(
        SourceReconciliation(
            state=state,
            created=tuple(created),
            updated=tuple(updated),
            tombstoned=tuple(item.id for item in newly_tombstoned),
            exclusions=(),
        )
    )
