"""Explicit bounded source-to-execution declarations and readiness evidence."""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path

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
from .source_identity import SourceIdentityState

_INVENTORY_VERSION = "openspec-gsd-planning-inventory-v1"
_MAX_ENTRIES = 4096
_MAX_BYTES = 8_388_608


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
        root = repository_root.resolve(strict=True)
        target = (root / inventory_path).resolve(strict=True)
        target.relative_to(root)
        if target.is_symlink() or not target.is_file():
            raise _InventoryError("mapping-inventory-path-invalid")
        content = target.read_bytes()
        if len(content) > _MAX_BYTES:
            raise _InventoryError("mapping-inventory-byte-limit-exceeded")
        if type(policy_observations) is not tuple:
            raise _InventoryError("mapping-policy-observations-invalid")
        return Success(_parse_inventory(content, policy_observations))
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

    if not isinstance(source_items, SourceIdentityState) or not isinstance(
        planning_inventory, PlanningInventory
    ):
        return _failure("mapping-input-invalid")
    active_ids = {item.id for item in source_items.active}
    tombstone_ids = {item.id for item in source_items.tombstones}
    assignments = planning_inventory.assignments
    assignment_ids = [assignment.source_id for assignment in assignments]
    if len(assignments) > _MAX_ENTRIES:
        return _failure("mapping-inventory-limit-exceeded")
    if len(set(assignment_ids)) != len(assignment_ids):
        return _failure("mapping-source-duplicate")
    if set(assignment_ids) != active_ids:
        if set(assignment_ids) & tombstone_ids:
            return _failure("mapping-tombstone-reference")
        return _failure("mapping-source-coverage-incomplete")
    phases = {phase.phase_id: phase for phase in planning_inventory.phases}
    if len(phases) != len(planning_inventory.phases):
        return _failure("mapping-phase-conflict")
    if any(
        declaration.change_id != planning_inventory.change_id
        for declarations in (
            planning_inventory.phases,
            planning_inventory.assignments,
            planning_inventory.plans,
            planning_inventory.evidence,
        )
        for declaration in declarations
    ):
        return _failure("mapping-cross-change-reference")
    if any(assignment.phase_id not in phases for assignment in assignments):
        return _failure("mapping-phase-unknown")

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

    mappings = tuple(
        ManifestMapping(
            source_id=assignment.source_id,
            phase_id=assignment.phase_id,
            phase_path=phases[assignment.phase_id].phase_path,
            plan_paths=tuple(
                plan.path
                for plan in planning_inventory.plans
                if plan.phase_id == assignment.phase_id
            ),
            evidence_paths=tuple(
                evidence.path
                for evidence in planning_inventory.evidence
                if evidence.phase_id == assignment.phase_id
                and (
                    evidence.source_id == assignment.source_id
                    or evidence.plan_path is not None
                )
            ),
            policy_references=assignment.policy_references,
        )
        for assignment in sorted(assignments, key=lambda item: item.source_id)
    )
    return Success(mappings)
