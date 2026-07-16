"""Exact schema-2 manifest values and canonical codec."""

from __future__ import annotations

import json
import re
import unicodedata
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from enum import StrEnum
from pathlib import PurePosixPath
from typing import Any

from .manifest import (
    MAX_MANIFEST_BYTES,
    HandoffManifest,
    ManifestArtifact,
    ManifestCapabilities,
    parse_manifest_bytes,
)
from .models import (
    ClassifiedIssue,
    Failure,
    HandoffState,
    IssueCategory,
    KnownState,
    Progress,
    Result,
    Success,
)
from .source_identity import (
    ActiveSourceItem,
    SourceCategory,
    SourceIdentityState,
    SourceTombstone,
    _source_path_alias_key,
)

_ROOT_FIELDS = {
    "schema_version",
    "change_id",
    "handoff_state",
    "artifacts",
    "source_commit",
    "progress",
    "capabilities",
    "source_items",
    "mappings",
    "ownership",
    "lifecycle",
}
_COMMON_FIELDS = (
    "schema_version",
    "change_id",
    "handoff_state",
    "artifacts",
    "source_commit",
    "progress",
    "capabilities",
)
_HEX_64 = re.compile(r"[0-9a-f]{64}\Z")
_REQUIREMENT_ID = re.compile(r"REQ-([0-9]{6})\Z")
_SCENARIO_ID = re.compile(r"SCN-([0-9]{6})\Z")
_ASCII_TOKEN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}\Z")
_MAX_ITEMS = 4096
_OWNED_KINDS = {
    "handoff-brief",
    "phase",
    "plan",
    "verification",
    "checkpoint",
    "receipt",
    "archive",
}
_REFERENCED_KINDS = {
    "canonical-source",
    "policy",
    "repository-document",
}


@dataclass(frozen=True)
class ManifestMapping:
    """One stable source-to-execution reference declaration."""

    source_id: str
    phase_id: str
    phase_path: str
    plan_paths: tuple[str, ...]
    evidence_paths: tuple[str, ...]
    policy_references: tuple[str, ...]


@dataclass(frozen=True)
class OwnershipEntry:
    """One owned or referenced repository-relative artifact."""

    kind: str
    path: str


@dataclass(frozen=True)
class ManifestOwnership:
    """Exact ownership placeholders and declarations."""

    owned: tuple[OwnershipEntry, ...]
    referenced: tuple[OwnershipEntry, ...]


class LifecycleReferenceState(StrEnum):
    """States allowed on lifecycle record references."""

    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"
    UNKNOWN = "unknown"


@dataclass(frozen=True)
class LifecycleRecordReference:
    """Content-addressed reference to one lifecycle record."""

    operation_id: str
    path: str
    sha256: str
    state: LifecycleReferenceState


@dataclass(frozen=True)
class ManifestLifecycle:
    """Exact checkpoint, receipt, and archive reference collections."""

    checkpoints: tuple[LifecycleRecordReference, ...]
    receipts: tuple[LifecycleRecordReference, ...]
    archives: tuple[LifecycleRecordReference, ...]


@dataclass(frozen=True)
class HandoffManifestV2:
    """The complete timestamp-free hardening schema value."""

    schema_version: int
    change_id: str
    handoff_state: HandoffState
    artifacts: tuple[ManifestArtifact, ...]
    source_commit: str
    progress: Progress
    capabilities: ManifestCapabilities
    source_items: SourceIdentityState
    mappings: tuple[ManifestMapping, ...]
    ownership: ManifestOwnership
    lifecycle: ManifestLifecycle


def _failure(code: str) -> Failure:
    return Failure(
        ClassifiedIssue(
            category=IssueCategory.PERSISTENCE,
            code=code,
            known_state=KnownState.UNKNOWN,
        )
    )


def _exact_fields(
    value: object,
    fields: set[str],
) -> Mapping[object, object] | None:
    if not isinstance(value, Mapping) or set(value) != fields:
        return None
    return value


def _bounded_sequence(value: object) -> Sequence[object] | None:
    if (
        not isinstance(value, Sequence)
        or isinstance(value, (str, bytes))
        or len(value) > _MAX_ITEMS
    ):
        return None
    return value


def _canonical_path(value: object) -> str | None:
    if type(value) is not str or not value or "\\" in value or "\0" in value:
        return None
    pure = PurePosixPath(value)
    if (
        pure.is_absolute()
        or value != pure.as_posix()
        or any(part in {"", ".", ".."} for part in pure.parts)
        or any(unicodedata.normalize("NFC", part) != part for part in pure.parts)
    ):
        return None
    return value


def _source_path(value: object, change_id: str) -> str | None:
    path = _canonical_path(value)
    if path is None:
        return None
    parts = PurePosixPath(path).parts
    if (
        len(parts) != 6
        or parts[:4] != ("openspec", "changes", change_id, "specs")
        or not parts[4]
        or parts[5] != "spec.md"
    ):
        return None
    return path


def _is_horizontal_whitespace(character: str) -> bool:
    return character == "\t" or unicodedata.category(character) == "Zs"


def _normalized_heading(value: object, category: SourceCategory) -> str | None:
    if type(value) is not str or "\r" in value or "\n" in value:
        return None
    value = unicodedata.normalize("NFC", value)
    marker = "###" if category is SourceCategory.REQUIREMENT else "####"
    if not value.startswith(marker):
        return None
    remainder = value[len(marker) :]
    if not remainder or not _is_horizontal_whitespace(remainder[0]):
        return None
    content = remainder
    start = 0
    while start < len(content) and _is_horizontal_whitespace(content[start]):
        start += 1
    end = len(content)
    while end > start and _is_horizontal_whitespace(content[end - 1]):
        end -= 1
    content = content[start:end]
    closing = len(content)
    while closing > 0 and content[closing - 1] == "#":
        closing -= 1
    if (
        closing < len(content)
        and closing > 0
        and _is_horizontal_whitespace(content[closing - 1])
    ):
        content = content[: closing - 1]
        while content and _is_horizontal_whitespace(content[-1]):
            content = content[:-1]
    collapsed: list[str] = []
    in_whitespace = False
    for character in content:
        if _is_horizontal_whitespace(character):
            if not in_whitespace:
                collapsed.append(" ")
            in_whitespace = True
        else:
            collapsed.append(character)
            in_whitespace = False
    normalized = "".join(collapsed)
    prefix = "Requirement:" if category is SourceCategory.REQUIREMENT else "Scenario:"
    if not normalized.startswith(prefix) or not normalized.removeprefix(prefix).strip(
        " "
    ):
        return None
    return normalized


def _parse_category(value: object) -> SourceCategory | None:
    if type(value) is not str:
        return None
    try:
        return SourceCategory(value)
    except ValueError:
        return None


def _parse_source_id(value: object, category: SourceCategory) -> int | None:
    if type(value) is not str:
        return None
    pattern = (
        _REQUIREMENT_ID if category is SourceCategory.REQUIREMENT else _SCENARIO_ID
    )
    match = pattern.fullmatch(value)
    if match is None:
        return None
    suffix = int(match.group(1))
    return suffix if 1 <= suffix <= 999_999 else None


def _parse_source_items(
    value: object,
    change_id: str,
) -> SourceIdentityState | None:
    state = _exact_fields(
        value,
        {
            "next_requirement_id",
            "next_scenario_id",
            "active",
            "tombstones",
        },
    )
    if state is None:
        return None
    next_requirement_id = state["next_requirement_id"]
    next_scenario_id = state["next_scenario_id"]
    active_raw = _bounded_sequence(state["active"])
    tombstones_raw = _bounded_sequence(state["tombstones"])
    if (
        type(next_requirement_id) is not int
        or type(next_scenario_id) is not int
        or not 1 <= next_requirement_id <= 1_000_000
        or not 1 <= next_scenario_id <= 1_000_000
        or active_raw is None
        or tombstones_raw is None
        or len(active_raw) + len(tombstones_raw) > _MAX_ITEMS
    ):
        return None

    active: list[ActiveSourceItem] = []
    tombstones: list[SourceTombstone] = []
    ids: set[str] = set()
    active_requirement_ids: set[str] = set()
    all_requirement_ids: set[str] = set()
    persisted_identities: set[tuple[SourceCategory, str, str, str | None]] = set()
    persisted_paths_by_alias: dict[str, str] = {}

    for raw in active_raw:
        item = _exact_fields(
            raw,
            {
                "id",
                "category",
                "source_path",
                "raw_heading",
                "parent_id",
                "fingerprint",
            },
        )
        if item is None:
            return None
        category = _parse_category(item["category"])
        if category is None:
            return None
        suffix = _parse_source_id(item["id"], category)
        path = _source_path(item["source_path"], change_id)
        heading = _normalized_heading(item["raw_heading"], category)
        parent_id = item["parent_id"]
        fingerprint = item["fingerprint"]
        counter = (
            next_requirement_id
            if category is SourceCategory.REQUIREMENT
            else next_scenario_id
        )
        if (
            suffix is None
            or suffix >= counter
            or path is None
            or heading is None
            or type(fingerprint) is not str
            or _HEX_64.fullmatch(fingerprint) is None
            or item["id"] in ids
            or (parent_id is not None and type(parent_id) is not str)
        ):
            return None
        source_id = str(item["id"])
        ids.add(source_id)
        path_alias = _source_path_alias_key(path)
        existing_path = persisted_paths_by_alias.get(path_alias)
        if existing_path is not None and existing_path != path:
            return None
        persisted_paths_by_alias[path_alias] = path
        if category is SourceCategory.REQUIREMENT:
            all_requirement_ids.add(source_id)
            active_requirement_ids.add(source_id)
        identity = (category, path, heading, parent_id)
        if identity in persisted_identities:
            return None
        persisted_identities.add(identity)
        active.append(
            ActiveSourceItem(
                id=source_id,
                category=category,
                source_path=path,
                raw_heading=str(item["raw_heading"]),
                parent_id=parent_id,
                fingerprint=fingerprint,
            )
        )

    for raw in tombstones_raw:
        item = _exact_fields(
            raw,
            {
                "id",
                "category",
                "last_source_path",
                "last_raw_heading",
                "last_parent_id",
                "fingerprint",
            },
        )
        if item is None:
            return None
        category = _parse_category(item["category"])
        if category is None:
            return None
        suffix = _parse_source_id(item["id"], category)
        path = _source_path(item["last_source_path"], change_id)
        heading = _normalized_heading(item["last_raw_heading"], category)
        parent_id = item["last_parent_id"]
        fingerprint = item["fingerprint"]
        counter = (
            next_requirement_id
            if category is SourceCategory.REQUIREMENT
            else next_scenario_id
        )
        if (
            suffix is None
            or suffix >= counter
            or path is None
            or heading is None
            or type(fingerprint) is not str
            or _HEX_64.fullmatch(fingerprint) is None
            or item["id"] in ids
            or (parent_id is not None and type(parent_id) is not str)
        ):
            return None
        source_id = str(item["id"])
        ids.add(source_id)
        path_alias = _source_path_alias_key(path)
        existing_path = persisted_paths_by_alias.get(path_alias)
        if existing_path is not None and existing_path != path:
            return None
        persisted_paths_by_alias[path_alias] = path
        if category is SourceCategory.REQUIREMENT:
            all_requirement_ids.add(source_id)
        identity = (category, path, heading, parent_id)
        if identity in persisted_identities:
            return None
        persisted_identities.add(identity)
        tombstones.append(
            SourceTombstone(
                id=source_id,
                category=category,
                last_source_path=path,
                last_raw_heading=str(item["last_raw_heading"]),
                last_parent_id=parent_id,
                fingerprint=fingerprint,
            )
        )

    for item in active:
        if item.category is SourceCategory.REQUIREMENT:
            if item.parent_id is not None:
                return None
        elif item.parent_id not in active_requirement_ids:
            return None
    for item in tombstones:
        if item.category is SourceCategory.REQUIREMENT:
            if item.last_parent_id is not None:
                return None
        elif item.last_parent_id not in all_requirement_ids:
            return None

    return SourceIdentityState(
        next_requirement_id=next_requirement_id,
        next_scenario_id=next_scenario_id,
        active=tuple(active),
        tombstones=tuple(tombstones),
    )


def _parse_string_collection(
    value: object,
    *,
    paths: bool,
) -> tuple[str, ...] | None:
    raw_items = _bounded_sequence(value)
    if raw_items is None:
        return None
    items: list[str] = []
    for raw in raw_items:
        item = _canonical_path(raw) if paths else raw
        if type(item) is not str or (
            not paths and _ASCII_TOKEN.fullmatch(item) is None
        ):
            return None
        items.append(item)
    result = tuple(items)
    if result != tuple(sorted(set(result), key=lambda item: item.encode("utf-8"))):
        return None
    return result


def _parse_mappings(
    value: object,
    source_items: SourceIdentityState,
) -> tuple[ManifestMapping, ...] | None:
    raw_items = _bounded_sequence(value)
    if raw_items is None:
        return None
    known_ids = {item.id for item in (*source_items.active, *source_items.tombstones)}
    mappings: list[ManifestMapping] = []
    for raw in raw_items:
        item = _exact_fields(
            raw,
            {
                "source_id",
                "phase_id",
                "phase_path",
                "plan_paths",
                "evidence_paths",
                "policy_references",
            },
        )
        if item is None:
            return None
        source_id = item["source_id"]
        phase_id = item["phase_id"]
        phase_path = _canonical_path(item["phase_path"])
        plan_paths = _parse_string_collection(item["plan_paths"], paths=True)
        evidence_paths = _parse_string_collection(item["evidence_paths"], paths=True)
        policy_references = _parse_string_collection(
            item["policy_references"],
            paths=False,
        )
        if (
            type(source_id) is not str
            or source_id not in known_ids
            or type(phase_id) is not str
            or _ASCII_TOKEN.fullmatch(phase_id) is None
            or phase_path is None
            or plan_paths is None
            or evidence_paths is None
            or policy_references is None
        ):
            return None
        mappings.append(
            ManifestMapping(
                source_id=source_id,
                phase_id=phase_id,
                phase_path=phase_path,
                plan_paths=plan_paths,
                evidence_paths=evidence_paths,
                policy_references=policy_references,
            )
        )
    result = tuple(mappings)
    if result != tuple(sorted(result, key=lambda mapping: mapping.source_id)):
        return None
    if len({mapping.source_id for mapping in result}) != len(result):
        return None
    return result


def _parse_ownership_entries(
    value: object,
    allowed_kinds: set[str],
) -> tuple[OwnershipEntry, ...] | None:
    raw_items = _bounded_sequence(value)
    if raw_items is None:
        return None
    entries: list[OwnershipEntry] = []
    for raw in raw_items:
        item = _exact_fields(raw, {"kind", "path"})
        if item is None:
            return None
        kind = item["kind"]
        path = _canonical_path(item["path"])
        if type(kind) is not str or kind not in allowed_kinds or path is None:
            return None
        entries.append(OwnershipEntry(kind=kind, path=path))
    result = tuple(entries)
    if result != tuple(sorted(set(result), key=lambda entry: (entry.kind, entry.path))):
        return None
    return result


def _parse_ownership(value: object) -> ManifestOwnership | None:
    ownership = _exact_fields(value, {"owned", "referenced"})
    if ownership is None:
        return None
    owned = _parse_ownership_entries(ownership["owned"], _OWNED_KINDS)
    referenced = _parse_ownership_entries(
        ownership["referenced"],
        _REFERENCED_KINDS,
    )
    if owned is None or referenced is None:
        return None
    return ManifestOwnership(owned=owned, referenced=referenced)


def _parse_lifecycle_references(
    value: object,
) -> tuple[LifecycleRecordReference, ...] | None:
    raw_items = _bounded_sequence(value)
    if raw_items is None:
        return None
    references: list[LifecycleRecordReference] = []
    for raw in raw_items:
        item = _exact_fields(raw, {"operation_id", "path", "sha256", "state"})
        if item is None:
            return None
        operation_id = item["operation_id"]
        path = _canonical_path(item["path"])
        sha256 = item["sha256"]
        try:
            state = LifecycleReferenceState(item["state"])
        except (TypeError, ValueError):
            return None
        if (
            type(operation_id) is not str
            or _ASCII_TOKEN.fullmatch(operation_id) is None
            or path is None
            or type(sha256) is not str
            or _HEX_64.fullmatch(sha256) is None
        ):
            return None
        references.append(
            LifecycleRecordReference(
                operation_id=operation_id,
                path=path,
                sha256=sha256,
                state=state,
            )
        )
    result = tuple(references)
    if result != tuple(
        sorted(
            set(result), key=lambda reference: (reference.operation_id, reference.path)
        )
    ):
        return None
    return result


def _parse_lifecycle(value: object) -> ManifestLifecycle | None:
    lifecycle = _exact_fields(value, {"checkpoints", "receipts", "archives"})
    if lifecycle is None:
        return None
    checkpoints = _parse_lifecycle_references(lifecycle["checkpoints"])
    receipts = _parse_lifecycle_references(lifecycle["receipts"])
    archives = _parse_lifecycle_references(lifecycle["archives"])
    if checkpoints is None or receipts is None or archives is None:
        return None
    return ManifestLifecycle(
        checkpoints=checkpoints,
        receipts=receipts,
        archives=archives,
    )


def _parse_common_manifest(root: Mapping[object, object]) -> HandoffManifest | None:
    common = {field: root[field] for field in _COMMON_FIELDS}
    common["schema_version"] = 1
    data = json.dumps(common, ensure_ascii=False).encode()
    parsed = parse_manifest_bytes(data)
    if isinstance(parsed, Failure):
        return None
    return parsed.value


def parse_manifest_v2_bytes(data: bytes) -> Result[HandoffManifestV2]:
    """Parse one complete exact schema-2 value or fail without a partial value."""

    if len(data) > MAX_MANIFEST_BYTES:
        return _failure("manifest-size-limit-exceeded")
    try:
        raw = json.loads(data)
    except (json.JSONDecodeError, UnicodeDecodeError, TypeError, RecursionError):
        return _failure("manifest-v2-json-invalid")
    root = _exact_fields(raw, _ROOT_FIELDS)
    if root is None:
        return _failure("manifest-v2-fields-invalid")
    if root["schema_version"] != 2 or type(root["schema_version"]) is not int:
        return _failure("manifest-v2-schema-unsupported")
    common = _parse_common_manifest(root)
    if common is None:
        return _failure("manifest-v2-value-invalid")
    source_items = _parse_source_items(root["source_items"], common.change_id)
    if source_items is None:
        return _failure("manifest-v2-value-invalid")
    mappings = _parse_mappings(root["mappings"], source_items)
    ownership = _parse_ownership(root["ownership"])
    lifecycle = _parse_lifecycle(root["lifecycle"])
    if mappings is None or ownership is None or lifecycle is None:
        return _failure("manifest-v2-value-invalid")
    return Success(
        HandoffManifestV2(
            schema_version=2,
            change_id=common.change_id,
            handoff_state=common.handoff_state,
            artifacts=common.artifacts,
            source_commit=common.source_commit,
            progress=common.progress,
            capabilities=common.capabilities,
            source_items=source_items,
            mappings=mappings,
            ownership=ownership,
            lifecycle=lifecycle,
        )
    )


def _artifact_object(artifact: ManifestArtifact) -> dict[str, object]:
    return {
        "kind": artifact.kind,
        "path": artifact.path,
        "sha256": artifact.sha256,
    }


def _progress_object(progress: Progress) -> dict[str, object]:
    return {
        "total": progress.total,
        "complete": progress.complete,
        "remaining": progress.remaining,
        "tasks": [
            {
                "id": task.id,
                "description": task.description,
                "done": task.done,
            }
            for task in progress.tasks
        ],
    }


def _capabilities_object(capabilities: ManifestCapabilities) -> dict[str, object]:
    return {
        "openspec": {
            "version": capabilities.openspec.version,
            "probe": capabilities.openspec.probe,
            "schema_name": capabilities.openspec.schema_name,
            "input_route": capabilities.openspec.input_route,
        },
        "gsd": {
            "version": capabilities.gsd.version,
            "probe": capabilities.gsd.probe,
            "project_initialized": capabilities.gsd.project_initialized,
            "entrypoint": capabilities.gsd.entrypoint,
        },
        "host": {
            "spawn_agent_schema": capabilities.host.spawn_agent_schema.value,
            "dispatch": capabilities.host.dispatch.value,
            "agent_role_source": capabilities.host.agent_role_source,
        },
    }


def _source_items_object(state: SourceIdentityState) -> dict[str, object]:
    return {
        "next_requirement_id": state.next_requirement_id,
        "next_scenario_id": state.next_scenario_id,
        "active": [
            {
                "id": item.id,
                "category": item.category.value,
                "source_path": item.source_path,
                "raw_heading": item.raw_heading,
                "parent_id": item.parent_id,
                "fingerprint": item.fingerprint,
            }
            for item in state.active
        ],
        "tombstones": [
            {
                "id": item.id,
                "category": item.category.value,
                "last_source_path": item.last_source_path,
                "last_raw_heading": item.last_raw_heading,
                "last_parent_id": item.last_parent_id,
                "fingerprint": item.fingerprint,
            }
            for item in state.tombstones
        ],
    }


def _mapping_object(mapping: ManifestMapping) -> dict[str, object]:
    return {
        "source_id": mapping.source_id,
        "phase_id": mapping.phase_id,
        "phase_path": mapping.phase_path,
        "plan_paths": list(mapping.plan_paths),
        "evidence_paths": list(mapping.evidence_paths),
        "policy_references": list(mapping.policy_references),
    }


def _ownership_entry_object(entry: OwnershipEntry) -> dict[str, object]:
    return {"kind": entry.kind, "path": entry.path}


def _lifecycle_reference_object(
    reference: LifecycleRecordReference,
) -> dict[str, object]:
    return {
        "operation_id": reference.operation_id,
        "path": reference.path,
        "sha256": reference.sha256,
        "state": reference.state.value,
    }


def _manifest_object(manifest: HandoffManifestV2) -> dict[str, Any]:
    return {
        "schema_version": manifest.schema_version,
        "change_id": manifest.change_id,
        "handoff_state": manifest.handoff_state.value,
        "artifacts": [_artifact_object(item) for item in manifest.artifacts],
        "source_commit": manifest.source_commit,
        "progress": _progress_object(manifest.progress),
        "capabilities": _capabilities_object(manifest.capabilities),
        "source_items": _source_items_object(manifest.source_items),
        "mappings": [_mapping_object(item) for item in manifest.mappings],
        "ownership": {
            "owned": [
                _ownership_entry_object(item) for item in manifest.ownership.owned
            ],
            "referenced": [
                _ownership_entry_object(item) for item in manifest.ownership.referenced
            ],
        },
        "lifecycle": {
            "checkpoints": [
                _lifecycle_reference_object(item)
                for item in manifest.lifecycle.checkpoints
            ],
            "receipts": [
                _lifecycle_reference_object(item)
                for item in manifest.lifecycle.receipts
            ],
            "archives": [
                _lifecycle_reference_object(item)
                for item in manifest.lifecycle.archives
            ],
        },
    }


def serialize_manifest_v2(manifest: HandoffManifestV2) -> Result[bytes]:
    """Return canonical schema-2 bytes after a complete strict reparse."""

    try:
        data = (
            json.dumps(
                _manifest_object(manifest),
                ensure_ascii=False,
                indent=2,
            )
            + "\n"
        ).encode()
    except (AttributeError, TypeError, UnicodeEncodeError):
        return _failure("manifest-v2-serialization-invalid")
    parsed = parse_manifest_v2_bytes(data)
    if isinstance(parsed, Failure) or parsed.value != manifest:
        return _failure("manifest-v2-serialization-invalid")
    return Success(data)
