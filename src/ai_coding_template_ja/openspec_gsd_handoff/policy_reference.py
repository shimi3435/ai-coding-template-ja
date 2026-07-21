"""Current-tree policy references for source-to-execution mapping."""

from __future__ import annotations

import hashlib
import json
import os
import re
import stat
import unicodedata
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from .models import ClassifiedIssue, Failure, IssueCategory, KnownState, Result, Success

_SECTION_FINGERPRINT_VERSION = "adaptive-policy-section-v1\0"
_REGISTRY_VERSION = "adaptive-policy-references-v1"
_REFERENCE_ID = re.compile(r"ACE-[A-Z0-9]+(?:-[A-Z0-9]+)*\Z")
_SHA256 = re.compile(r"[0-9a-f]{64}\Z")
_DIRECTORY_OPEN_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
_FILE_OPEN_FLAGS = os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC


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


@dataclass(frozen=True)
class _Heading:
    line_index: int
    level: int
    raw_line: str
    normalized_heading: str


@dataclass(frozen=True)
class _Fence:
    marker: str
    length: int


class _PolicyInputError(Exception):
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


def _valid_limits(limits: PolicyReferenceLimits) -> bool:
    return all(
        type(value) is int and value > 0
        for value in (
            limits.max_records,
            limits.bytes_per_file,
            limits.bytes_total,
            limits.registry_bytes,
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
    output: list[str] = []
    in_run = False
    for character in value:
        if _is_horizontal_whitespace(character):
            if not in_run:
                output.append(" ")
            in_run = True
        else:
            output.append(character)
            in_run = False
    return "".join(output)


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


def _parse_heading(line: str, raw_line: str, line_index: int) -> _Heading | None:
    marker_end = 0
    while marker_end < len(line) and line[marker_end] == "#":
        marker_end += 1
    if marker_end == 0:
        return None
    if marker_end > 6:
        raise _PolicyInputError("policy-heading-unsupported")
    if marker_end < len(line) and not _is_horizontal_whitespace(line[marker_end]):
        return None
    normalized_heading = _normalize_heading_text(line[marker_end:])
    if not normalized_heading:
        raise _PolicyInputError("policy-heading-unsupported")
    return _Heading(
        line_index=line_index,
        level=marker_end,
        raw_line=raw_line,
        normalized_heading=normalized_heading,
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
            raise _PolicyInputError("policy-fence-ambiguous")
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
    for line_index, normalized_line in enumerate(normalized_lines):
        previous_fence = active_fence
        active_fence = _parse_fence(normalized_line, active_fence)
        if previous_fence is not None or active_fence is not None:
            continue
        heading = _parse_heading(normalized_line, raw_lines[line_index], line_index)
        if heading is not None:
            headings.append(heading)
    if active_fence is not None:
        raise _PolicyInputError("policy-fence-unclosed")
    return headings


def _normalize_body(lines: Sequence[str]) -> str:
    normalized = [_strip_horizontal_right(line) for line in lines]
    while normalized and not normalized[-1]:
        normalized.pop()
    return "\n".join(normalized) + "\n"


def _fingerprint_section(source_path: str, heading: str, body: str) -> str:
    framed = bytearray()
    for component in (
        _SECTION_FINGERPRINT_VERSION,
        source_path,
        heading,
        body,
    ):
        try:
            encoded = component.encode("utf-8")
        except UnicodeEncodeError as error:
            raise _PolicyInputError("policy-unicode-invalid") from error
        framed.extend(len(encoded).to_bytes(8, "big"))
        framed.extend(encoded)
    return hashlib.sha256(framed).hexdigest()


def _canonical_policy_path(path: str | Path) -> tuple[tuple[str, ...], str]:
    raw_path = str(path)
    if not raw_path or raw_path.startswith("/") or "\\" in raw_path or "\0" in raw_path:
        raise _PolicyInputError("policy-path-invalid")
    raw_segments = tuple(raw_path.split("/"))
    if any(segment in ("", ".", "..") for segment in raw_segments):
        raise _PolicyInputError("policy-path-invalid")
    normalized_segments = tuple(
        unicodedata.normalize("NFC", segment) for segment in raw_segments
    )
    return raw_segments, "/".join(normalized_segments)


def _path_alias_key(path: str) -> str:
    return unicodedata.normalize("NFC", path).casefold()


def _entry_stat(parent_fd: int, name: str) -> os.stat_result:
    try:
        return os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    except OSError as error:
        raise _PolicyInputError("policy-path-unreadable") from error


def _open_anchored_entry(parent_fd: int, name: str, *, directory: bool) -> int:
    entry = _entry_stat(parent_fd, name)
    if stat.S_ISLNK(entry.st_mode):
        raise _PolicyInputError("policy-path-symlink")
    expected = stat.S_ISDIR if directory else stat.S_ISREG
    if not expected(entry.st_mode):
        code = "policy-path-unreadable" if directory else "policy-path-not-file"
        raise _PolicyInputError(code)
    flags = _DIRECTORY_OPEN_FLAGS if directory else _FILE_OPEN_FLAGS
    try:
        descriptor = os.open(name, flags, dir_fd=parent_fd)
    except OSError as error:
        raise _PolicyInputError("policy-path-unreadable") from error
    try:
        opened = os.fstat(descriptor)
    except OSError as error:
        os.close(descriptor)
        raise _PolicyInputError("policy-path-unreadable") from error
    if (entry.st_dev, entry.st_ino, stat.S_IFMT(entry.st_mode)) != (
        opened.st_dev,
        opened.st_ino,
        stat.S_IFMT(opened.st_mode),
    ):
        os.close(descriptor)
        raise _PolicyInputError("policy-path-identity-changed")
    return descriptor


def _verify_anchored_entry(parent_fd: int, name: str, descriptor: int) -> None:
    linked = _entry_stat(parent_fd, name)
    try:
        opened = os.fstat(descriptor)
    except OSError as error:
        raise _PolicyInputError("policy-path-identity-changed") from error
    if stat.S_ISLNK(linked.st_mode):
        raise _PolicyInputError("policy-path-symlink")
    if (linked.st_dev, linked.st_ino, stat.S_IFMT(linked.st_mode)) != (
        opened.st_dev,
        opened.st_ino,
        stat.S_IFMT(opened.st_mode),
    ):
        raise _PolicyInputError("policy-path-identity-changed")


def _read_anchored_policy(
    repository_fd: int,
    raw_segments: Sequence[str],
    *,
    max_bytes: int,
) -> bytes:
    opened_descriptors: list[int] = []
    anchored_entries: list[tuple[int, str, int]] = []
    parent_fd = repository_fd
    try:
        for segment in raw_segments[:-1]:
            descriptor = _open_anchored_entry(parent_fd, segment, directory=True)
            opened_descriptors.append(descriptor)
            anchored_entries.append((parent_fd, segment, descriptor))
            parent_fd = descriptor
        filename = raw_segments[-1]
        source_fd = _open_anchored_entry(parent_fd, filename, directory=False)
        opened_descriptors.append(source_fd)
        anchored_entries.append((parent_fd, filename, source_fd))
        chunks: list[bytes] = []
        remaining = max_bytes + 1
        while remaining:
            chunk = os.read(source_fd, remaining)
            if not chunk:
                break
            chunks.append(chunk)
            remaining -= len(chunk)
        for entry_parent, entry_name, descriptor in anchored_entries:
            _verify_anchored_entry(entry_parent, entry_name, descriptor)
        return b"".join(chunks)
    except OSError as error:
        raise _PolicyInputError("policy-read-failed") from error
    finally:
        for descriptor in reversed(opened_descriptors):
            try:
                os.close(descriptor)
            except OSError:
                pass


def _observe_file(
    source_path: str,
    content_bytes: bytes,
    references: Sequence[PolicyReference],
) -> tuple[PolicySectionObservation, ...]:
    try:
        decoded = content_bytes.decode("utf-8")
    except UnicodeDecodeError as error:
        raise _PolicyInputError("policy-utf8-invalid") from error
    with_lf = decoded.replace("\r\n", "\n").replace("\r", "\n")
    raw_lines = with_lf.split("\n")
    normalized_lines = [unicodedata.normalize("NFC", line) for line in raw_lines]
    headings = _scan_headings(raw_lines, normalized_lines)
    by_heading: dict[str, list[tuple[int, _Heading]]] = {}
    for index, heading in enumerate(headings):
        by_heading.setdefault(heading.normalized_heading, []).append((index, heading))

    observations: list[PolicySectionObservation] = []
    for reference in references:
        matches = by_heading.get(reference.heading, [])
        if not matches:
            raise _PolicyInputError("policy-heading-missing")
        if len(matches) != 1:
            raise _PolicyInputError("policy-heading-duplicate")
        heading_index, heading = matches[0]
        boundary = len(normalized_lines)
        for candidate in headings[heading_index + 1 :]:
            if candidate.level <= heading.level:
                boundary = candidate.line_index
                break
        normalized_body = _normalize_body(
            normalized_lines[heading.line_index + 1 : boundary]
        )
        observations.append(
            PolicySectionObservation(
                reference_id=reference.id,
                raw_source_path=reference.source_path,
                source_path=source_path,
                raw_heading=heading.raw_line,
                normalized_heading=heading.normalized_heading,
                normalized_body=normalized_body,
                body_length=len(normalized_body.encode("utf-8")),
                sha256=_fingerprint_section(
                    source_path,
                    heading.normalized_heading,
                    normalized_body,
                ),
            )
        )
    return tuple(observations)


def _json_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    value: dict[str, object] = {}
    for key, item in pairs:
        if key in value:
            raise _PolicyInputError("policy-registry-json-duplicate-key")
        value[key] = item
    return value


def _reject_json_constant(value: str) -> object:
    del value
    raise _PolicyInputError("policy-registry-json-invalid")


def _parse_registry_json(content_bytes: bytes) -> object:
    try:
        decoded = content_bytes.decode("utf-8")
    except UnicodeDecodeError as error:
        raise _PolicyInputError("policy-registry-utf8-invalid") from error
    try:
        return json.loads(
            decoded,
            object_pairs_hook=_json_object,
            parse_constant=_reject_json_constant,
        )
    except _PolicyInputError:
        raise
    except (json.JSONDecodeError, RecursionError) as error:
        raise _PolicyInputError("policy-registry-json-invalid") from error


def _valid_reference_id(value: object) -> bool:
    if not isinstance(value, str) or _REFERENCE_ID.fullmatch(value) is None:
        return False
    try:
        return len(value.encode("ascii")) <= 128
    except UnicodeEncodeError:
        return False


def _policy_reference_from_json(value: object) -> PolicyReference:
    if not isinstance(value, dict):
        raise _PolicyInputError("policy-reference-invalid")
    expected_fields = {
        "id",
        "source_path",
        "heading",
        "body_length",
        "sha256",
        "historical_provenance",
    }
    if set(value) != expected_fields:
        raise _PolicyInputError("policy-reference-fields-invalid")
    reference_id = value["id"]
    if not _valid_reference_id(reference_id):
        raise _PolicyInputError("policy-reference-id-invalid")
    source_path = value["source_path"]
    if not isinstance(source_path, str):
        raise _PolicyInputError("policy-path-invalid")
    try:
        _, canonical_path = _canonical_policy_path(source_path)
    except _PolicyInputError as error:
        raise _PolicyInputError("policy-path-invalid") from error
    if canonical_path != source_path:
        raise _PolicyInputError("policy-path-noncanonical")
    heading = value["heading"]
    if not isinstance(heading, str) or not heading:
        raise _PolicyInputError("policy-heading-invalid")
    if (
        unicodedata.normalize("NFC", heading) != heading
        or _normalize_heading_text(heading) != heading
    ):
        raise _PolicyInputError("policy-heading-invalid")
    body_length = value["body_length"]
    if type(body_length) is not int or not 1 <= body_length <= 8_388_608:
        raise _PolicyInputError("policy-reference-length-invalid")
    sha256 = value["sha256"]
    if not isinstance(sha256, str) or _SHA256.fullmatch(sha256) is None:
        raise _PolicyInputError("policy-reference-hash-invalid")
    historical_provenance = value["historical_provenance"]
    if historical_provenance is not None and not isinstance(historical_provenance, str):
        raise _PolicyInputError("policy-reference-provenance-invalid")
    return PolicyReference(
        id=reference_id,
        source_path=source_path,
        heading=heading,
        body_length=body_length,
        sha256=sha256,
        historical_provenance=historical_provenance,
    )


def _validate_registry(
    registry: object,
    *,
    max_records: int,
) -> PolicyReferenceRegistry:
    if type(registry) is not PolicyReferenceRegistry:
        raise _PolicyInputError("policy-registry-invalid")
    if registry.version != _REGISTRY_VERSION:
        raise _PolicyInputError("policy-registry-version-invalid")
    if type(registry.references) is not tuple or not registry.references:
        raise _PolicyInputError("policy-registry-empty")
    if len(registry.references) > max_records:
        raise _PolicyInputError("policy-record-limit-exceeded")
    ids: set[str] = set()
    aliases: dict[str, str] = {}
    validated: list[PolicyReference] = []
    for reference in registry.references:
        if not isinstance(reference, PolicyReference):
            raise _PolicyInputError("policy-reference-invalid")
        parsed = _policy_reference_from_json(
            {
                "id": reference.id,
                "source_path": reference.source_path,
                "heading": reference.heading,
                "body_length": reference.body_length,
                "sha256": reference.sha256,
                "historical_provenance": reference.historical_provenance,
            }
        )
        if parsed.id in ids:
            raise _PolicyInputError("policy-reference-id-duplicate")
        ids.add(parsed.id)
        alias = _path_alias_key(parsed.source_path)
        existing_path = aliases.get(alias)
        if existing_path is not None and existing_path != parsed.source_path:
            raise _PolicyInputError("policy-path-alias")
        aliases[alias] = parsed.source_path
        validated.append(parsed)
    return PolicyReferenceRegistry(
        version=_REGISTRY_VERSION,
        references=tuple(sorted(validated, key=lambda item: item.id.encode("ascii"))),
    )


def _registry_from_json(value: object, *, max_records: int) -> PolicyReferenceRegistry:
    if not isinstance(value, dict):
        raise _PolicyInputError("policy-registry-invalid")
    if set(value) != {"version", "references"}:
        raise _PolicyInputError("policy-registry-fields-invalid")
    version = value["version"]
    if version != _REGISTRY_VERSION:
        raise _PolicyInputError("policy-registry-version-invalid")
    raw_references = value["references"]
    if not isinstance(raw_references, list) or not raw_references:
        raise _PolicyInputError("policy-registry-empty")
    if len(raw_references) > max_records:
        raise _PolicyInputError("policy-record-limit-exceeded")
    raw_aliases: dict[str, str] = {}
    for raw_reference in raw_references:
        if not isinstance(raw_reference, dict):
            continue
        raw_path = raw_reference.get("source_path")
        if not isinstance(raw_path, str):
            continue
        try:
            _, canonical_path = _canonical_policy_path(raw_path)
        except _PolicyInputError:
            continue
        alias = _path_alias_key(canonical_path)
        existing_path = raw_aliases.get(alias)
        if existing_path is not None and existing_path != raw_path:
            raise _PolicyInputError("policy-path-alias")
        raw_aliases[alias] = raw_path
    registry = PolicyReferenceRegistry(
        version=version,
        references=tuple(_policy_reference_from_json(item) for item in raw_references),
    )
    return _validate_registry(registry, max_records=max_records)


def read_policy_reference_registry(
    repository_root: Path,
    registry_path: str | Path,
    *,
    limits: PolicyReferenceLimits = DEFAULT_POLICY_REFERENCE_LIMITS,
) -> Result[PolicyReferenceRegistry]:
    """Read one strict registry or return whole-operation non-success."""

    if not _valid_limits(limits):
        return _failure("policy-limits-invalid", category=IssueCategory.INPUT)
    try:
        raw_segments, canonical_path = _canonical_policy_path(registry_path)
    except _PolicyInputError as error:
        return _failure(error.code, category=IssueCategory.INPUT)
    if str(registry_path) != canonical_path:
        return _failure("policy-path-noncanonical", category=IssueCategory.INPUT)
    try:
        repository = repository_root.resolve(strict=True)
    except (OSError, RuntimeError):
        return _failure("policy-root-unreadable")
    try:
        repository_fd = os.open(repository, _DIRECTORY_OPEN_FLAGS)
    except OSError:
        return _failure("policy-root-unreadable")
    try:
        content_bytes = _read_anchored_policy(
            repository_fd,
            raw_segments,
            max_bytes=limits.registry_bytes,
        )
    except _PolicyInputError as error:
        return _failure(error.code)
    finally:
        try:
            os.close(repository_fd)
        except OSError:
            pass
    if len(content_bytes) > limits.registry_bytes:
        return _failure("policy-registry-limit-exceeded")
    try:
        parsed = _parse_registry_json(content_bytes)
        return Success(_registry_from_json(parsed, max_records=limits.max_records))
    except _PolicyInputError as error:
        return _failure(error.code, category=IssueCategory.INPUT)


def observe_policy_sections(
    repository_root: Path,
    registry: PolicyReferenceRegistry,
    *,
    limits: PolicyReferenceLimits = DEFAULT_POLICY_REFERENCE_LIMITS,
) -> Result[tuple[PolicySectionObservation, ...]]:
    """Observe every requested current-tree section exactly once or fail."""

    if not _valid_limits(limits):
        return _failure("policy-limits-invalid", category=IssueCategory.INPUT)
    if not isinstance(registry, PolicyReferenceRegistry):
        return _failure("policy-registry-invalid", category=IssueCategory.INPUT)
    if type(registry.references) is not tuple or not registry.references:
        return _failure("policy-registry-empty", category=IssueCategory.INPUT)
    if len(registry.references) > limits.max_records:
        return _failure("policy-record-limit-exceeded")

    prepared: dict[str, tuple[tuple[str, ...], list[PolicyReference]]] = {}
    aliases: dict[str, str] = {}
    for reference in registry.references:
        if not isinstance(reference, PolicyReference):
            return _failure("policy-reference-invalid", category=IssueCategory.INPUT)
        try:
            raw_segments, canonical_path = _canonical_policy_path(reference.source_path)
        except _PolicyInputError as error:
            return _failure(error.code, category=IssueCategory.INPUT)
        alias = _path_alias_key(canonical_path)
        existing_path = aliases.get(alias)
        if existing_path is not None and existing_path != reference.source_path:
            return _failure("policy-path-alias")
        aliases[alias] = reference.source_path
        if canonical_path != reference.source_path:
            return _failure("policy-path-noncanonical", category=IssueCategory.INPUT)
        if not isinstance(reference.heading, str) or not reference.heading:
            return _failure("policy-heading-invalid", category=IssueCategory.INPUT)
        normalized_heading = unicodedata.normalize("NFC", reference.heading)
        if (
            normalized_heading != reference.heading
            or _normalize_heading_text(normalized_heading) != normalized_heading
        ):
            return _failure("policy-heading-invalid", category=IssueCategory.INPUT)
        if canonical_path in prepared:
            prepared[canonical_path][1].append(reference)
        else:
            prepared[canonical_path] = (raw_segments, [reference])

    try:
        repository = repository_root.resolve(strict=True)
    except (OSError, RuntimeError):
        return _failure("policy-root-unreadable")
    try:
        repository_fd = os.open(repository, _DIRECTORY_OPEN_FLAGS)
    except OSError:
        return _failure("policy-root-unreadable")

    observations_by_id: dict[str, PolicySectionObservation] = {}
    aggregate_bytes = 0
    try:
        repository_stat = os.fstat(repository_fd)
        if not stat.S_ISDIR(repository_stat.st_mode):
            raise _PolicyInputError("policy-root-invalid")
        for canonical_path, (raw_segments, references) in prepared.items():
            content_bytes = _read_anchored_policy(
                repository_fd,
                raw_segments,
                max_bytes=limits.bytes_per_file,
            )
            if len(content_bytes) > limits.bytes_per_file:
                raise _PolicyInputError("policy-file-limit-exceeded")
            aggregate_bytes += len(content_bytes)
            if aggregate_bytes > limits.bytes_total:
                raise _PolicyInputError("policy-total-limit-exceeded")
            for observation in _observe_file(
                canonical_path,
                content_bytes,
                references,
            ):
                observations_by_id[observation.reference_id] = observation
    except (OSError, _PolicyInputError) as error:
        code = (
            error.code if isinstance(error, _PolicyInputError) else "policy-read-failed"
        )
        return _failure(code)
    finally:
        try:
            os.close(repository_fd)
        except OSError:
            pass

    try:
        return Success(
            tuple(observations_by_id[item.id] for item in registry.references)
        )
    except KeyError:
        return _failure("policy-observation-incomplete")


def validate_policy_references(
    registry: PolicyReferenceRegistry,
    observations: tuple[PolicySectionObservation, ...],
    referenced_ids: tuple[str, ...],
) -> Result[tuple[PolicyReference, ...]]:
    """Validate complete registry coverage for the requested stable IDs."""

    if type(registry) is not PolicyReferenceRegistry:
        return _failure("policy-registry-invalid", category=IssueCategory.INPUT)
    try:
        validated_registry = _validate_registry(registry, max_records=4096)
    except _PolicyInputError as error:
        return _failure(error.code, category=IssueCategory.INPUT)
    if type(observations) is not tuple or len(observations) > 4096:
        return _failure("policy-observations-invalid", category=IssueCategory.INPUT)
    observations_by_id: dict[str, PolicySectionObservation] = {}
    for observation in observations:
        if not isinstance(observation, PolicySectionObservation):
            return _failure("policy-observations-invalid", category=IssueCategory.INPUT)
        if observation.reference_id in observations_by_id:
            return _failure("policy-observation-duplicate")
        observations_by_id[observation.reference_id] = observation

    references_by_id = {
        reference.id: reference for reference in validated_registry.references
    }
    for reference in validated_registry.references:
        observation = observations_by_id.get(reference.id)
        if observation is None:
            return _failure("policy-observation-missing")
        if (
            observation.raw_source_path != reference.source_path
            or observation.source_path != reference.source_path
            or observation.normalized_heading != reference.heading
        ):
            return _failure("policy-reference-anchor-mismatch")
        if observation.body_length != reference.body_length:
            return _failure("policy-reference-length-mismatch")
        if observation.sha256 != reference.sha256:
            return _failure("policy-reference-hash-mismatch")

    if type(referenced_ids) is not tuple or len(referenced_ids) > 4096:
        return _failure(
            "policy-reference-request-invalid", category=IssueCategory.INPUT
        )
    requested: set[str] = set()
    for reference_id in referenced_ids:
        if not isinstance(reference_id, str):
            return _failure(
                "policy-reference-request-invalid",
                category=IssueCategory.INPUT,
            )
        if reference_id in requested:
            return _failure("policy-reference-request-duplicate")
        if reference_id not in references_by_id:
            return _failure("policy-reference-unknown")
        requested.add(reference_id)
    return Success(
        tuple(
            references_by_id[reference_id]
            for reference_id in sorted(requested, key=str.encode)
        )
    )
