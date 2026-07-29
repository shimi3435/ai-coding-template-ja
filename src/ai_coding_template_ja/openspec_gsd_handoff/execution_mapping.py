"""Explicit bounded source-to-execution declarations and readiness evidence."""

from __future__ import annotations

import json
import os
import re
import stat
import unicodedata
from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path, PurePosixPath
from typing import cast

from .manifest_v2 import ManifestMapping
from .models import (
    ClassifiedIssue,
    Failure,
    IssueCategory,
    KnownState,
    Result,
    Success,
)
from .policy_reference import (
    PolicyReferenceRegistry,
    PolicySectionObservation,
    validate_policy_references,
)
from .source_identity import SourceIdentityState, validate_source_identity_state

_INVENTORY_VERSION = "openspec-gsd-planning-inventory-v1"
_MAX_ENTRIES = 4096
_MAX_BYTES = 8_388_608
_CHANGE_ID = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")
_SOURCE_ID = re.compile(r"(?:REQ|SCN)-[0-9]{6}\Z")
_PHASE_ID = re.compile(r"[0-9]{2}\Z")
_POLICY_ID = re.compile(r"ACE-[A-Z0-9]+(?:-[A-Z0-9]+)*\Z")
_SHA256 = re.compile(r"[0-9a-f]{64}\Z")
_DIRECTORY_OPEN_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
_FILE_OPEN_FLAGS = os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC


class MappingOperation(StrEnum):
    """Exact source-to-execution readiness horizons."""

    PLAN = "plan"
    EXECUTE = "execute"
    VERIFY = "verify"
    FINALIZE = "finalize"


@dataclass(frozen=True)
class PhaseDeclaration:
    """One caller-declared phase identity and canonical path."""

    change_id: str
    phase_id: str
    phase_path: str


@dataclass(frozen=True)
class PhaseAssignment:
    """One explicit active-source assignment; membership is never inferred."""

    change_id: str
    source_id: str
    phase_id: str
    policy_references: tuple[str, ...]


@dataclass(frozen=True)
class PlanDeclaration:
    """One explicitly owned execution plan."""

    change_id: str
    phase_id: str
    path: str


@dataclass(frozen=True)
class EvidenceDeclaration:
    """One explicitly required source or plan evidence path."""

    change_id: str
    phase_id: str
    path: str
    source_id: str | None = None
    plan_path: str | None = None


@dataclass(frozen=True)
class PlanningInventory:
    """Complete bounded declarations for one OpenSpec change."""

    version: str
    change_id: str
    phases: tuple[PhaseDeclaration, ...]
    assignments: tuple[PhaseAssignment, ...]
    plans: tuple[PlanDeclaration, ...]
    evidence: tuple[EvidenceDeclaration, ...]
    policy_observations: tuple[PolicySectionObservation, ...] = ()


@dataclass(frozen=True)
class MappingIssue:
    """Stable operation-readiness issue without display prose."""

    code: str
    path: str | None = None


@dataclass(frozen=True)
class MappingReadiness:
    """One whole-operation readiness result; partial green is impossible."""

    operation: MappingOperation
    target_phase_id: str | None
    ready: bool
    issues: tuple[MappingIssue, ...]


class _InventoryError(Exception):
    def __init__(self, code: str) -> None:
        self.code = code


def _failure(code: str) -> Failure:
    return Failure(
        ClassifiedIssue(
            category=IssueCategory.INPUT,
            code=code,
            known_state=KnownState.UNKNOWN,
        )
    )


def _json_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    value: dict[str, object] = {}
    for key, item in pairs:
        if key in value:
            raise _InventoryError("mapping-inventory-json-duplicate-key")
        value[key] = item
    return value


def _exact_object(value: object, fields: set[str]) -> Mapping[str, object]:
    if not isinstance(value, Mapping) or set(value) != fields:
        raise _InventoryError("mapping-inventory-fields-invalid")
    if not all(isinstance(key, str) for key in value):
        raise _InventoryError("mapping-inventory-fields-invalid")
    return value  # type: ignore[return-value]


def _string(value: object) -> str:
    if not isinstance(value, str):
        raise _InventoryError("mapping-inventory-value-invalid")
    return value


def _string_tuple(value: object) -> tuple[str, ...]:
    if not isinstance(value, list) or len(value) > _MAX_ENTRIES:
        raise _InventoryError("mapping-inventory-value-invalid")
    result = tuple(_string(item) for item in value)
    if result != tuple(sorted(set(result), key=str.encode)):
        raise _InventoryError("mapping-inventory-value-invalid")
    return result


def _records(value: object) -> list[object]:
    if not isinstance(value, list) or len(value) > _MAX_ENTRIES:
        raise _InventoryError("mapping-inventory-limit-exceeded")
    return value


def _canonical_path(value: str) -> str:
    if not value or value.startswith("/") or "\\" in value or "\0" in value:
        raise _InventoryError("mapping-path-invalid")
    path = PurePosixPath(value)
    if (
        path.is_absolute()
        or path.as_posix() != value
        or any(part in {"", ".", ".."} for part in path.parts)
        or any(unicodedata.normalize("NFC", part) != part for part in path.parts)
    ):
        raise _InventoryError("mapping-path-invalid")
    return value


def _canonical_inventory_path(value: object) -> tuple[str, ...]:
    if (
        not isinstance(value, str)
        or not value
        or value.startswith("/")
        or "\\" in value
        or "\0" in value
    ):
        raise _InventoryError("mapping-inventory-path-invalid")
    parts = tuple(value.split("/"))
    if any(
        part in {"", ".", ".."} or unicodedata.normalize("NFC", part) != part
        for part in parts
    ):
        raise _InventoryError("mapping-inventory-path-invalid")
    return parts


def _same_identity(left: os.stat_result, right: os.stat_result) -> bool:
    return (left.st_dev, left.st_ino, stat.S_IFMT(left.st_mode)) == (
        right.st_dev,
        right.st_ino,
        stat.S_IFMT(right.st_mode),
    )


def _verify_inventory_entry(parent_fd: int, name: str, descriptor: int) -> None:
    try:
        linked = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
        opened = os.fstat(descriptor)
    except OSError as error:
        raise _InventoryError("mapping-inventory-path-invalid") from error
    if stat.S_ISLNK(linked.st_mode) or not _same_identity(linked, opened):
        raise _InventoryError("mapping-inventory-path-invalid")


def _read_anchored_inventory(
    repository: Path,
    parts: tuple[str, ...],
) -> bytes:
    descriptors: list[int] = []
    entries: list[tuple[int, str, int]] = []
    try:
        repository_fd = os.open(repository, _DIRECTORY_OPEN_FLAGS)
        descriptors.append(repository_fd)
        repository_identity = os.fstat(repository_fd)
        if not stat.S_ISDIR(repository_identity.st_mode):
            raise _InventoryError("mapping-inventory-path-invalid")
        parent_fd = repository_fd
        for part in parts[:-1]:
            descriptor = os.open(part, _DIRECTORY_OPEN_FLAGS, dir_fd=parent_fd)
            descriptors.append(descriptor)
            entries.append((parent_fd, part, descriptor))
            _verify_inventory_entry(parent_fd, part, descriptor)
            if not stat.S_ISDIR(os.fstat(descriptor).st_mode):
                raise _InventoryError("mapping-inventory-path-invalid")
            parent_fd = descriptor

        filename = parts[-1]
        file_fd = os.open(filename, _FILE_OPEN_FLAGS, dir_fd=parent_fd)
        descriptors.append(file_fd)
        entries.append((parent_fd, filename, file_fd))
        _verify_inventory_entry(parent_fd, filename, file_fd)
        if not stat.S_ISREG(os.fstat(file_fd).st_mode):
            raise _InventoryError("mapping-inventory-path-invalid")

        chunks: list[bytes] = []
        remaining = _MAX_BYTES + 1
        while remaining:
            chunk = os.read(file_fd, remaining)
            if not chunk:
                break
            chunks.append(chunk)
            remaining -= len(chunk)
        content = b"".join(chunks)

        for parent, name, descriptor in entries:
            _verify_inventory_entry(parent, name, descriptor)
        linked_repository = os.stat(repository, follow_symlinks=False)
        if not _same_identity(linked_repository, repository_identity):
            raise _InventoryError("mapping-inventory-path-invalid")
        if len(content) > _MAX_BYTES:
            raise _InventoryError("mapping-inventory-byte-limit-exceeded")
        return content
    except _InventoryError:
        raise
    except (OSError, ValueError) as error:
        raise _InventoryError("mapping-inventory-path-invalid") from error
    finally:
        for descriptor in reversed(descriptors):
            try:
                os.close(descriptor)
            except OSError:
                pass


def _alias_key(value: str) -> str:
    return unicodedata.normalize("NFC", value).casefold()


def _inventory_bytes(inventory: PlanningInventory) -> int:
    values: list[str] = [inventory.version, inventory.change_id]
    for phase in inventory.phases:
        values.extend((phase.change_id, phase.phase_id, phase.phase_path))
    for assignment in inventory.assignments:
        values.extend(
            (
                assignment.change_id,
                assignment.source_id,
                assignment.phase_id,
                *assignment.policy_references,
            )
        )
    for plan in inventory.plans:
        values.extend((plan.change_id, plan.phase_id, plan.path))
    for evidence in inventory.evidence:
        values.extend(
            (
                evidence.change_id,
                evidence.phase_id,
                evidence.path,
                evidence.source_id or "",
                evidence.plan_path or "",
            )
        )
    for observation in inventory.policy_observations:
        values.extend(
            (
                observation.reference_id,
                observation.raw_source_path,
                observation.source_path,
                observation.raw_heading,
                observation.normalized_heading,
                observation.normalized_body,
                observation.sha256,
            )
        )
    try:
        return sum(len(value.encode("utf-8")) for value in values)
    except UnicodeEncodeError as error:
        raise _InventoryError("mapping-inventory-value-invalid") from error


def _validate_inventory_shape(value: object) -> PlanningInventory:
    if type(value) is not PlanningInventory:
        raise _InventoryError("mapping-input-invalid")
    inventory = value
    if type(inventory.version) is not str or type(inventory.change_id) is not str:
        raise _InventoryError("mapping-inventory-value-invalid")
    collections: tuple[tuple[object, type[object]], ...] = (
        (inventory.phases, PhaseDeclaration),
        (inventory.assignments, PhaseAssignment),
        (inventory.plans, PlanDeclaration),
        (inventory.evidence, EvidenceDeclaration),
        (inventory.policy_observations, PolicySectionObservation),
    )
    for items, member_type in collections:
        if type(items) is not tuple:
            raise _InventoryError("mapping-inventory-value-invalid")
        if len(items) > _MAX_ENTRIES:
            raise _InventoryError("mapping-inventory-limit-exceeded")
        if any(type(item) is not member_type for item in items):
            raise _InventoryError("mapping-inventory-value-invalid")

    for phase in inventory.phases:
        if any(
            type(item) is not str
            for item in (phase.change_id, phase.phase_id, phase.phase_path)
        ):
            raise _InventoryError("mapping-inventory-value-invalid")
    for assignment in inventory.assignments:
        if any(
            type(item) is not str
            for item in (
                assignment.change_id,
                assignment.source_id,
                assignment.phase_id,
            )
        ):
            raise _InventoryError("mapping-inventory-value-invalid")
        if (
            type(assignment.policy_references) is not tuple
            or len(assignment.policy_references) > _MAX_ENTRIES
            or any(
                type(reference_id) is not str
                for reference_id in assignment.policy_references
            )
        ):
            raise _InventoryError("mapping-inventory-value-invalid")
    for plan in inventory.plans:
        if any(
            type(item) is not str for item in (plan.change_id, plan.phase_id, plan.path)
        ):
            raise _InventoryError("mapping-inventory-value-invalid")
    for evidence in inventory.evidence:
        if any(
            type(item) is not str
            for item in (evidence.change_id, evidence.phase_id, evidence.path)
        ) or any(
            item is not None and type(item) is not str
            for item in (evidence.source_id, evidence.plan_path)
        ):
            raise _InventoryError("mapping-inventory-value-invalid")
    for observation in inventory.policy_observations:
        strings = (
            observation.reference_id,
            observation.raw_source_path,
            observation.source_path,
            observation.raw_heading,
            observation.normalized_heading,
            observation.normalized_body,
            observation.sha256,
        )
        if (
            any(type(item) is not str for item in strings)
            or type(observation.body_length) is not int
        ):
            raise _InventoryError("mapping-inventory-value-invalid")
        try:
            normalized_body_length = len(observation.normalized_body.encode("utf-8"))
        except UnicodeEncodeError as error:
            raise _InventoryError("mapping-inventory-value-invalid") from error
        if (
            _POLICY_ID.fullmatch(observation.reference_id) is None
            or not observation.raw_heading
            or not observation.normalized_heading
            or _SHA256.fullmatch(observation.sha256) is None
            or observation.body_length != normalized_body_length
            or observation.body_length > _MAX_BYTES
        ):
            raise _InventoryError("mapping-inventory-value-invalid")
        _canonical_path(observation.raw_source_path)
        _canonical_path(observation.source_path)
    return inventory


def _validate_inventory_invariants(inventory: PlanningInventory) -> None:
    if (
        inventory.version != _INVENTORY_VERSION
        or _CHANGE_ID.fullmatch(inventory.change_id) is None
    ):
        raise _InventoryError("mapping-inventory-value-invalid")
    if _inventory_bytes(inventory) > _MAX_BYTES:
        raise _InventoryError("mapping-inventory-byte-limit-exceeded")
    if any(
        declaration.change_id != inventory.change_id
        for declarations in (
            inventory.phases,
            inventory.assignments,
            inventory.plans,
            inventory.evidence,
        )
        for declaration in declarations
    ):
        raise _InventoryError("mapping-cross-change-reference")

    phase_paths = tuple(_canonical_path(phase.phase_path) for phase in inventory.phases)
    plan_paths = tuple(_canonical_path(plan.path) for plan in inventory.plans)
    evidence_paths = tuple(
        _canonical_path(evidence.path) for evidence in inventory.evidence
    )
    evidence_plan_paths = tuple(
        (None if evidence.plan_path is None else _canonical_path(evidence.plan_path))
        for evidence in inventory.evidence
    )

    phases_by_id: dict[str, PhaseDeclaration] = {}
    phase_ids_by_path: dict[str, str] = {}
    phase_aliases: dict[str, str] = {}
    for phase, phase_path in zip(inventory.phases, phase_paths, strict=True):
        if _PHASE_ID.fullmatch(phase.phase_id) is None:
            raise _InventoryError("mapping-phase-invalid")
        if phase.phase_id in phases_by_id:
            raise _InventoryError("mapping-phase-conflict")
        if phase_path in phase_ids_by_path:
            raise _InventoryError("mapping-phase-path-conflict")
        alias = _alias_key(phase_path)
        if alias in phase_aliases and phase_aliases[alias] != phase_path:
            raise _InventoryError("mapping-path-alias")
        parts = PurePosixPath(phase_path).parts
        if (
            len(parts) != 3
            or parts[:2] != (".planning", "phases")
            or not parts[2].startswith(f"{phase.phase_id}-")
        ):
            raise _InventoryError("mapping-phase-path-invalid")
        phases_by_id[phase.phase_id] = phase
        phase_ids_by_path[phase_path] = phase.phase_id
        phase_aliases[alias] = phase_path

    assignment_ids: set[str] = set()
    for assignment in inventory.assignments:
        if _SOURCE_ID.fullmatch(assignment.source_id) is None:
            raise _InventoryError("mapping-source-invalid")
        if assignment.source_id in assignment_ids:
            raise _InventoryError("mapping-source-duplicate")
        assignment_ids.add(assignment.source_id)
        if assignment.phase_id not in phases_by_id:
            raise _InventoryError("mapping-phase-unknown")
        if (
            type(assignment.policy_references) is not tuple
            or assignment.policy_references
            != tuple(sorted(set(assignment.policy_references), key=str.encode))
            or any(
                _POLICY_ID.fullmatch(reference_id) is None
                for reference_id in assignment.policy_references
            )
        ):
            raise _InventoryError("mapping-policy-reference-invalid")

    declared_plan_paths: set[str] = set()
    plans_by_phase: dict[str, set[str]] = {}
    plan_aliases: dict[str, str] = {}
    for plan, plan_path in zip(inventory.plans, plan_paths, strict=True):
        if plan.phase_id not in phases_by_id:
            raise _InventoryError("mapping-plan-invalid")
        if plan_path in declared_plan_paths:
            raise _InventoryError("mapping-plan-duplicate")
        alias = _alias_key(plan_path)
        if alias in plan_aliases and plan_aliases[alias] != plan_path:
            raise _InventoryError("mapping-path-alias")
        plan_aliases[alias] = plan_path
        declared_plan_paths.add(plan_path)
        plans_by_phase.setdefault(plan.phase_id, set()).add(plan_path)

    declared_evidence_paths: set[str] = set()
    evidence_aliases: dict[str, str] = {}
    for evidence, evidence_path in zip(inventory.evidence, evidence_paths, strict=True):
        if evidence.phase_id not in phases_by_id:
            raise _InventoryError("mapping-evidence-invalid")
        alias = _alias_key(evidence_path)
        if evidence_path in declared_evidence_paths or alias in evidence_aliases:
            raise _InventoryError("mapping-path-role-conflict")
        evidence_aliases[alias] = evidence_path
        declared_evidence_paths.add(evidence_path)

    if (
        phase_aliases.keys() & plan_aliases.keys()
        or phase_aliases.keys() & evidence_aliases.keys()
        or plan_aliases.keys() & evidence_aliases.keys()
    ):
        raise _InventoryError("mapping-path-role-conflict")

    for plan, plan_path in zip(inventory.plans, plan_paths, strict=True):
        phase = phases_by_id[plan.phase_id]
        if (
            not plan_path.startswith(f"{phase.phase_path}/")
            or not PurePosixPath(plan_path).name.startswith(f"{plan.phase_id}-")
            or not plan_path.endswith("-PLAN.md")
        ):
            raise _InventoryError("mapping-plan-path-invalid")

    for evidence, evidence_plan_path in zip(
        inventory.evidence, evidence_plan_paths, strict=True
    ):
        if evidence.source_id is None and evidence.plan_path is None:
            raise _InventoryError("mapping-evidence-owner-missing")
        if evidence.source_id is not None and evidence.source_id not in assignment_ids:
            raise _InventoryError("mapping-source-unknown")
        if (
            evidence_plan_path is not None
            and evidence_plan_path not in plans_by_phase.get(evidence.phase_id, set())
        ):
            raise _InventoryError("mapping-plan-unknown")


def validate_planning_inventory(value: object) -> Result[PlanningInventory]:
    """Validate one complete in-memory planning inventory before traversal."""

    try:
        inventory = _validate_inventory_shape(value)
        _validate_inventory_invariants(inventory)
        return Success(inventory)
    except _InventoryError as error:
        return _failure(error.code)


def _parse_inventory(
    content: bytes,
    policy_observations: tuple[PolicySectionObservation, ...],
) -> PlanningInventory:
    try:
        raw = json.loads(content.decode("utf-8"), object_pairs_hook=_json_object)
    except _InventoryError:
        raise
    except (UnicodeDecodeError, json.JSONDecodeError, RecursionError) as error:
        raise _InventoryError("mapping-inventory-json-invalid") from error
    root = _exact_object(
        raw,
        {"version", "change_id", "phases", "assignments", "plans", "evidence"},
    )
    version = _string(root["version"])
    if version != _INVENTORY_VERSION:
        raise _InventoryError("mapping-inventory-version-invalid")
    change_id = _string(root["change_id"])
    phases = tuple(
        PhaseDeclaration(
            change_id=_string(record["change_id"]),
            phase_id=_string(record["phase_id"]),
            phase_path=_string(record["phase_path"]),
        )
        for item in _records(root["phases"])
        for record in [_exact_object(item, {"change_id", "phase_id", "phase_path"})]
    )
    assignments = tuple(
        PhaseAssignment(
            change_id=_string(record["change_id"]),
            source_id=_string(record["source_id"]),
            phase_id=_string(record["phase_id"]),
            policy_references=_string_tuple(record["policy_references"]),
        )
        for item in _records(root["assignments"])
        for record in [
            _exact_object(
                item,
                {"change_id", "source_id", "phase_id", "policy_references"},
            )
        ]
    )
    plans = tuple(
        PlanDeclaration(
            change_id=_string(record["change_id"]),
            phase_id=_string(record["phase_id"]),
            path=_string(record["path"]),
        )
        for item in _records(root["plans"])
        for record in [_exact_object(item, {"change_id", "phase_id", "path"})]
    )
    evidence = tuple(
        EvidenceDeclaration(
            change_id=_string(record["change_id"]),
            phase_id=_string(record["phase_id"]),
            path=_string(record["path"]),
            source_id=(
                None if record["source_id"] is None else _string(record["source_id"])
            ),
            plan_path=(
                None if record["plan_path"] is None else _string(record["plan_path"])
            ),
        )
        for item in _records(root["evidence"])
        for record in [
            _exact_object(
                item,
                {"change_id", "phase_id", "path", "source_id", "plan_path"},
            )
        ]
    )
    return PlanningInventory(
        version=version,
        change_id=change_id,
        phases=phases,
        assignments=assignments,
        plans=plans,
        evidence=evidence,
        policy_observations=policy_observations,
    )


def read_planning_inventory(
    repository_root: Path,
    inventory_path: str,
    *,
    policy_observations: tuple[PolicySectionObservation, ...] = (),
) -> Result[PlanningInventory]:
    """Read one complete bounded assignment fixture without inferring declarations."""

    try:
        parts = _canonical_inventory_path(inventory_path)
        root = repository_root.resolve(strict=True)
        content = _read_anchored_inventory(root, parts)
        if type(policy_observations) is not tuple:
            raise _InventoryError("mapping-policy-observations-invalid")
        inventory = _parse_inventory(content, policy_observations)
        return validate_planning_inventory(inventory)
    except _InventoryError as error:
        return _failure(error.code)
    except (OSError, RuntimeError, ValueError):
        return _failure("mapping-inventory-path-invalid")


def build_manifest_mappings(
    source_items: SourceIdentityState,
    planning_inventory: PlanningInventory,
    policy_registry: PolicyReferenceRegistry,
) -> Result[tuple[ManifestMapping, ...]]:
    """Build a deterministic complete baseline from caller-declared assignments."""

    source_result = validate_source_identity_state(source_items)
    if isinstance(source_result, Failure):
        return _failure("mapping-input-invalid")
    source_items = source_result.value
    inventory_result = validate_planning_inventory(planning_inventory)
    if isinstance(inventory_result, Failure):
        return inventory_result
    planning_inventory = inventory_result.value
    active_ids = {item.id for item in source_items.active}
    tombstone_ids = {item.id for item in source_items.tombstones}
    assignments = planning_inventory.assignments
    assignment_ids = [assignment.source_id for assignment in assignments]
    declared_ids = set(assignment_ids)
    if declared_ids & tombstone_ids:
        return _failure("mapping-tombstone-reference")
    if declared_ids - active_ids:
        return _failure("mapping-source-unknown")
    if declared_ids != active_ids:
        return _failure("mapping-source-coverage-incomplete")
    referenced_ids = tuple(
        sorted(
            {
                reference_id
                for assignment in assignments
                for reference_id in assignment.policy_references
            },
            key=str.encode,
        )
    )
    policy_result = validate_policy_references(
        policy_registry,
        planning_inventory.policy_observations,
        referenced_ids,
    )
    if isinstance(policy_result, Failure):
        return _failure(f"mapping-{policy_result.issue.code}")

    return Success(_project_canonical_manifest_mappings(planning_inventory))


def _project_canonical_manifest_mappings(
    inventory: PlanningInventory,
) -> tuple[ManifestMapping, ...]:
    phases = {phase.phase_id: phase for phase in inventory.phases}
    return tuple(
        ManifestMapping(
            source_id=assignment.source_id,
            phase_id=assignment.phase_id,
            phase_path=phases[assignment.phase_id].phase_path,
            plan_paths=tuple(
                sorted(
                    (
                        plan.path
                        for plan in inventory.plans
                        if plan.phase_id == assignment.phase_id
                    ),
                    key=str.encode,
                )
            ),
            evidence_paths=tuple(
                sorted(
                    (
                        evidence.path
                        for evidence in inventory.evidence
                        if evidence.phase_id == assignment.phase_id
                        and (
                            evidence.source_id == assignment.source_id
                            or evidence.plan_path is not None
                        )
                    ),
                    key=str.encode,
                )
            ),
            policy_references=assignment.policy_references,
        )
        for assignment in sorted(
            inventory.assignments,
            key=lambda item: item.source_id,
        )
    )


def _validate_manifest_mappings(
    value: object,
) -> Result[tuple[ManifestMapping, ...]]:
    if type(value) is not tuple or len(value) > _MAX_ENTRIES:
        return _failure("mapping-set-invalid")
    if any(type(mapping) is not ManifestMapping for mapping in value):
        return _failure("mapping-set-invalid")
    mappings = cast(tuple[ManifestMapping, ...], value)
    if any(
        type(field) is not str
        for mapping in mappings
        for field in (mapping.source_id, mapping.phase_id, mapping.phase_path)
    ):
        return _failure("mapping-set-invalid")
    for mapping in mappings:
        for values in (
            mapping.plan_paths,
            mapping.evidence_paths,
            mapping.policy_references,
        ):
            if (
                type(values) is not tuple
                or len(values) > _MAX_ENTRIES
                or any(type(item) is not str for item in values)
            ):
                return _failure("mapping-set-invalid")

    aggregate_bytes = 0
    try:
        for mapping in mappings:
            aggregate_bytes += sum(
                len(item.encode("utf-8"))
                for item in (
                    mapping.source_id,
                    mapping.phase_id,
                    mapping.phase_path,
                    *mapping.plan_paths,
                    *mapping.evidence_paths,
                    *mapping.policy_references,
                )
            )
    except UnicodeEncodeError:
        return _failure("mapping-set-invalid")

    phase_role_aliases: set[str] = set()
    plan_role_aliases: set[str] = set()
    evidence_role_aliases: set[str] = set()
    for mapping in mappings:
        if (
            _SOURCE_ID.fullmatch(mapping.source_id) is None
            or _PHASE_ID.fullmatch(mapping.phase_id) is None
        ):
            return _failure("mapping-set-invalid")
        try:
            _canonical_path(mapping.phase_path)
            for path in (*mapping.plan_paths, *mapping.evidence_paths):
                _canonical_path(path)
        except _InventoryError:
            return _failure("mapping-set-invalid")
        phase_role_aliases.add(_alias_key(mapping.phase_path))
        plan_role_aliases.update(_alias_key(path) for path in mapping.plan_paths)
        evidence_role_aliases.update(
            _alias_key(path) for path in mapping.evidence_paths
        )

    if (
        phase_role_aliases & plan_role_aliases
        or phase_role_aliases & evidence_role_aliases
        or plan_role_aliases & evidence_role_aliases
    ):
        return _failure("mapping-set-invalid")

    for mapping in mappings:
        phase_parts = PurePosixPath(mapping.phase_path).parts
        if (
            len(phase_parts) != 3
            or phase_parts[:2] != (".planning", "phases")
            or not phase_parts[2].startswith(f"{mapping.phase_id}-")
        ):
            return _failure("mapping-set-invalid")
        if any(
            not path.startswith(f"{mapping.phase_path}/")
            or not PurePosixPath(path).name.startswith(f"{mapping.phase_id}-")
            or not path.endswith("-PLAN.md")
            for path in mapping.plan_paths
        ):
            return _failure("mapping-set-invalid")
        if any(
            _POLICY_ID.fullmatch(reference_id) is None
            for reference_id in mapping.policy_references
        ):
            return _failure("mapping-set-invalid")
        for values in (
            mapping.plan_paths,
            mapping.evidence_paths,
            mapping.policy_references,
        ):
            if values != tuple(sorted(set(values), key=str.encode)):
                return _failure("mapping-set-invalid")
        for paths in (mapping.plan_paths, mapping.evidence_paths):
            if len({_alias_key(path) for path in paths}) != len(paths):
                return _failure("mapping-set-invalid")

    source_ids = tuple(mapping.source_id for mapping in mappings)
    if (
        source_ids != tuple(sorted(source_ids, key=str.encode))
        or len(source_ids) != len(set(source_ids))
        or aggregate_bytes > _MAX_BYTES
    ):
        return _failure("mapping-set-invalid")
    return Success(mappings)


@dataclass(frozen=True)
class _DeclaredPathObservation:
    declared_path: str
    expect_directory: bool
    descriptors: tuple[int, ...]
    anchored_entries: tuple[tuple[int, str, int], ...]
    final_descriptor: int
    byte_count: int


def _close_declared_path_observation(
    observation: _DeclaredPathObservation,
) -> None:
    for descriptor in reversed(observation.descriptors):
        try:
            os.close(descriptor)
        except OSError:
            pass


def _revalidate_declared_path_observation(
    observation: _DeclaredPathObservation,
) -> MappingIssue | None:
    for parent_descriptor, name, opened_descriptor in observation.anchored_entries:
        try:
            linked = os.stat(
                name,
                dir_fd=parent_descriptor,
                follow_symlinks=False,
            )
            opened = os.fstat(opened_descriptor)
        except OSError:
            return MappingIssue(
                "mapping-path-identity-changed", observation.declared_path
            )
        if stat.S_ISLNK(linked.st_mode) or not _same_identity(linked, opened):
            return MappingIssue(
                "mapping-path-identity-changed", observation.declared_path
            )

    try:
        final_identity = os.fstat(observation.final_descriptor)
    except OSError:
        return MappingIssue("mapping-path-identity-changed", observation.declared_path)
    if observation.expect_directory:
        if not stat.S_ISDIR(final_identity.st_mode):
            return MappingIssue("mapping-path-non-directory", observation.declared_path)
    elif not stat.S_ISREG(final_identity.st_mode):
        return MappingIssue("mapping-path-non-regular", observation.declared_path)
    return None


def _observe_declared_path(
    root_descriptor: int,
    declared_path: str,
    *,
    expect_directory: bool,
) -> tuple[MappingIssue | None, _DeclaredPathObservation | None]:
    """Observe one exact path from an anchored descriptor without following links."""

    parts = PurePosixPath(declared_path).parts
    descriptors: list[int] = []
    anchored_entries: list[tuple[int, str, int]] = []
    retain_descriptors = False
    try:
        descriptor = root_descriptor
        for index, part in enumerate(parts):
            names = os.listdir(descriptor)
            aliases = [name for name in names if _alias_key(name) == _alias_key(part)]
            if part not in names:
                code = "mapping-path-alias" if aliases else "mapping-path-missing"
                return MappingIssue(code, declared_path), None
            if any(name != part for name in aliases):
                return MappingIssue("mapping-path-alias", declared_path), None

            try:
                entry = os.stat(part, dir_fd=descriptor, follow_symlinks=False)
            except OSError:
                return MappingIssue(
                    "mapping-path-identity-changed", declared_path
                ), None
            if stat.S_ISLNK(entry.st_mode):
                return MappingIssue("mapping-path-symlink", declared_path), None
            final = index == len(parts) - 1
            directory = not final or expect_directory
            if directory and not stat.S_ISDIR(entry.st_mode):
                return MappingIssue("mapping-path-non-directory", declared_path), None
            if not directory and not stat.S_ISREG(entry.st_mode):
                return MappingIssue("mapping-path-non-regular", declared_path), None

            parent_descriptor = descriptor
            flags = _DIRECTORY_OPEN_FLAGS if directory else _FILE_OPEN_FLAGS
            try:
                opened_descriptor = os.open(
                    part,
                    flags,
                    dir_fd=parent_descriptor,
                )
            except OSError:
                try:
                    current = os.stat(
                        part,
                        dir_fd=parent_descriptor,
                        follow_symlinks=False,
                    )
                except OSError:
                    return MappingIssue(
                        "mapping-path-identity-changed", declared_path
                    ), None
                if stat.S_ISLNK(current.st_mode) or not _same_identity(entry, current):
                    return MappingIssue(
                        "mapping-path-identity-changed", declared_path
                    ), None
                raise
            descriptors.append(opened_descriptor)
            anchored_entries.append((parent_descriptor, part, opened_descriptor))
            try:
                opened = os.fstat(opened_descriptor)
            except OSError:
                return MappingIssue(
                    "mapping-path-identity-changed", declared_path
                ), None
            if not _same_identity(entry, opened):
                return MappingIssue(
                    "mapping-path-identity-changed", declared_path
                ), None
            descriptor = opened_descriptor

        observed_chunks: list[bytes] = []
        if not expect_directory:
            remaining = _MAX_BYTES + 1
            while remaining:
                chunk = os.read(descriptor, remaining)
                if not chunk:
                    break
                observed_chunks.append(chunk)
                remaining -= len(chunk)

        observed = b"".join(observed_chunks)
        if len(observed) > _MAX_BYTES:
            return MappingIssue("mapping-path-byte-limit-exceeded", declared_path), None
        observation = _DeclaredPathObservation(
            declared_path=declared_path,
            expect_directory=expect_directory,
            descriptors=tuple(descriptors),
            anchored_entries=tuple(anchored_entries),
            final_descriptor=descriptor,
            byte_count=len(observed),
        )
        issue = _revalidate_declared_path_observation(observation)
        if issue is not None:
            return issue, None
        retain_descriptors = True
        return None, observation
    except (OSError, UnicodeError, ValueError):
        return MappingIssue("mapping-path-unreadable", declared_path), None
    finally:
        if not retain_descriptors:
            for descriptor in reversed(descriptors):
                try:
                    os.close(descriptor)
                except OSError:
                    pass


def _readiness_issues(
    root: Path,
    inventory: PlanningInventory,
    operation: MappingOperation,
    target_phase_id: str | None,
) -> tuple[MappingIssue, ...]:
    phases = {phase.phase_id: phase for phase in inventory.phases}
    selected_phase_ids = (
        tuple(sorted(phases, key=str.encode))
        if operation is MappingOperation.FINALIZE
        else (target_phase_id,)
    )
    issues: list[MappingIssue] = []
    paths: dict[str, bool] = {}
    for phase_id in selected_phase_ids:
        assert phase_id is not None
        phase = phases[phase_id]
        paths[phase.phase_path] = True
        if operation is MappingOperation.PLAN:
            continue
        phase_plans = [plan for plan in inventory.plans if plan.phase_id == phase_id]
        if not phase_plans:
            issues.append(MappingIssue("mapping-plan-declarations-empty", phase_id))
        for plan in phase_plans:
            paths[plan.path] = False
        if operation is MappingOperation.EXECUTE:
            continue

        phase_evidence = [
            evidence for evidence in inventory.evidence if evidence.phase_id == phase_id
        ]
        if not phase_evidence:
            issues.append(MappingIssue("mapping-evidence-declarations-empty", phase_id))
        for evidence in phase_evidence:
            paths[evidence.path] = False

        assigned_sources = {
            assignment.source_id
            for assignment in inventory.assignments
            if assignment.phase_id == phase_id
        }
        evidenced_sources = {
            evidence.source_id
            for evidence in phase_evidence
            if evidence.source_id is not None
        }
        for source_id in sorted(assigned_sources - evidenced_sources, key=str.encode):
            issues.append(MappingIssue("mapping-source-evidence-missing", source_id))
        evidenced_plans = {
            evidence.plan_path
            for evidence in phase_evidence
            if evidence.plan_path is not None
        }
        for plan in phase_plans:
            if plan.path not in evidenced_plans:
                issues.append(MappingIssue("mapping-plan-evidence-missing", plan.path))

    sorted_paths = tuple(sorted(paths.items(), key=lambda item: item[0].encode()))
    observations: list[_DeclaredPathObservation] = []
    root_descriptor: int | None = None
    try:
        root_descriptor = os.open(root, _DIRECTORY_OPEN_FLAGS)
        root_identity = os.fstat(root_descriptor)
        observed_bytes = 0
        for path, expect_directory in sorted_paths:
            issue, observation = _observe_declared_path(
                root_descriptor,
                path,
                expect_directory=expect_directory,
            )
            if issue is not None:
                issues.append(issue)
                continue
            assert observation is not None
            observations.append(observation)
            observed_bytes += observation.byte_count
            if observed_bytes > _MAX_BYTES:
                issues.append(MappingIssue("mapping-observation-limit-exceeded", path))
                break

        for observation in observations:
            issue = _revalidate_declared_path_observation(observation)
            if issue is not None:
                issues.append(issue)
        try:
            linked_root = os.stat(root, follow_symlinks=False)
            opened_root = os.fstat(root_descriptor)
        except OSError:
            root_changed = True
        else:
            root_changed = not _same_identity(root_identity, opened_root) or not (
                _same_identity(linked_root, opened_root)
            )
        if root_changed:
            issues.extend(
                MappingIssue("mapping-path-identity-changed", path)
                for path, _ in sorted_paths
            )
    except (OSError, UnicodeError, ValueError):
        issues.extend(
            MappingIssue("mapping-path-unreadable", path) for path, _ in sorted_paths
        )
    finally:
        for observation in reversed(observations):
            _close_declared_path_observation(observation)
        if root_descriptor is not None:
            try:
                os.close(root_descriptor)
            except OSError:
                pass
    return tuple(
        sorted(set(issues), key=lambda item: ((item.path or "").encode(), item.code))
    )


def validate_mapping_readiness(
    repository_root: Path,
    source_items: SourceIdentityState,
    mappings: tuple[ManifestMapping, ...],
    planning_inventory: PlanningInventory,
    *,
    operation: MappingOperation,
    target_phase_id: str | None = None,
) -> Result[MappingReadiness]:
    """Evaluate one exact readiness horizon over a complete explicit mapping set."""

    if not isinstance(operation, MappingOperation):
        return _failure("mapping-operation-invalid")
    source_result = validate_source_identity_state(source_items)
    if isinstance(source_result, Failure):
        return _failure("mapping-input-invalid")
    source_items = source_result.value
    mappings_result = _validate_manifest_mappings(mappings)
    if isinstance(mappings_result, Failure):
        return mappings_result
    mappings = mappings_result.value
    inventory_result = validate_planning_inventory(planning_inventory)
    if isinstance(inventory_result, Failure):
        return inventory_result
    planning_inventory = inventory_result.value
    try:
        root = repository_root.resolve(strict=True)
        if not root.is_dir():
            raise OSError
    except (OSError, RuntimeError, ValueError):
        return _failure("mapping-repository-root-invalid")

    active_ids = {item.id for item in source_items.active}
    tombstone_ids = {item.id for item in source_items.tombstones}
    assignment_ids = {item.source_id for item in planning_inventory.assignments}
    if assignment_ids & tombstone_ids:
        return _failure("mapping-tombstone-reference")
    if assignment_ids - active_ids:
        return _failure("mapping-source-unknown")
    if assignment_ids != active_ids:
        return _failure("mapping-source-coverage-incomplete")
    mapping_ids = [mapping.source_id for mapping in mappings]
    if set(mapping_ids) & tombstone_ids:
        return _failure("mapping-tombstone-reference")
    if mappings != _project_canonical_manifest_mappings(planning_inventory):
        return _failure("mapping-set-conflict")

    phases = {phase.phase_id: phase for phase in planning_inventory.phases}
    if operation is MappingOperation.FINALIZE:
        if target_phase_id is not None:
            return _failure("mapping-target-phase-invalid")
    elif target_phase_id not in phases:
        return _failure("mapping-phase-unknown")

    issues = _readiness_issues(root, planning_inventory, operation, target_phase_id)
    return Success(
        MappingReadiness(
            operation=operation,
            target_phase_id=target_phase_id,
            ready=not issues,
            issues=issues,
        )
    )
