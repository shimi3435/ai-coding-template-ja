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
_CHANGE_ID = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")
_SOURCE_ID = re.compile(r"(?:REQ|SCN)-[0-9]{6}\Z")
_PHASE_ID = re.compile(r"[0-9]{2}\Z")
_POLICY_ID = re.compile(r"ACE-[A-Z0-9]+(?:-[A-Z0-9]+)*\Z")


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
    try:
        return sum(len(value.encode("utf-8")) for value in values)
    except UnicodeEncodeError as error:
        raise _InventoryError("mapping-inventory-value-invalid") from error


def _validate_declarations(inventory: PlanningInventory) -> None:
    if (
        inventory.version != _INVENTORY_VERSION
        or _CHANGE_ID.fullmatch(inventory.change_id) is None
    ):
        raise _InventoryError("mapping-inventory-value-invalid")
    collections = (
        inventory.phases,
        inventory.assignments,
        inventory.plans,
        inventory.evidence,
        inventory.policy_observations,
    )
    if any(type(items) is not tuple for items in collections):
        raise _InventoryError("mapping-inventory-value-invalid")
    if any(len(items) > _MAX_ENTRIES for items in collections):
        raise _InventoryError("mapping-inventory-limit-exceeded")
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

    phases_by_id: dict[str, PhaseDeclaration] = {}
    phase_ids_by_path: dict[str, str] = {}
    aliases: dict[str, str] = {}
    for phase in inventory.phases:
        if not isinstance(phase, PhaseDeclaration):
            raise _InventoryError("mapping-inventory-value-invalid")
        if _PHASE_ID.fullmatch(phase.phase_id) is None:
            raise _InventoryError("mapping-phase-invalid")
        if phase.phase_id in phases_by_id:
            raise _InventoryError("mapping-phase-conflict")
        phase_path = _canonical_path(phase.phase_path)
        if phase_path in phase_ids_by_path:
            raise _InventoryError("mapping-phase-path-conflict")
        alias = _alias_key(phase_path)
        if alias in aliases and aliases[alias] != phase_path:
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
        aliases[alias] = phase_path

    assignment_ids: set[str] = set()
    for assignment in inventory.assignments:
        if not isinstance(assignment, PhaseAssignment):
            raise _InventoryError("mapping-inventory-value-invalid")
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

    plan_paths: set[str] = set()
    plans_by_phase: dict[str, set[str]] = {}
    for plan in inventory.plans:
        if not isinstance(plan, PlanDeclaration) or plan.phase_id not in phases_by_id:
            raise _InventoryError("mapping-plan-invalid")
        plan_path = _canonical_path(plan.path)
        phase = phases_by_id[plan.phase_id]
        if (
            not plan_path.startswith(f"{phase.phase_path}/")
            or not PurePosixPath(plan_path).name.startswith(f"{plan.phase_id}-")
            or not plan_path.endswith("-PLAN.md")
        ):
            raise _InventoryError("mapping-plan-path-invalid")
        if plan_path in plan_paths:
            raise _InventoryError("mapping-plan-duplicate")
        alias = _alias_key(plan_path)
        if alias in aliases and aliases[alias] != plan_path:
            raise _InventoryError("mapping-path-alias")
        aliases[alias] = plan_path
        plan_paths.add(plan_path)
        plans_by_phase.setdefault(plan.phase_id, set()).add(plan_path)

    evidence_paths: set[str] = set()
    for evidence in inventory.evidence:
        if (
            not isinstance(evidence, EvidenceDeclaration)
            or evidence.phase_id not in phases_by_id
        ):
            raise _InventoryError("mapping-evidence-invalid")
        evidence_path = _canonical_path(evidence.path)
        if evidence.source_id is None and evidence.plan_path is None:
            raise _InventoryError("mapping-evidence-owner-missing")
        if evidence.source_id is not None and evidence.source_id not in assignment_ids:
            raise _InventoryError("mapping-source-unknown")
        if (
            evidence.plan_path is not None
            and evidence.plan_path not in plans_by_phase.get(evidence.phase_id, set())
        ):
            raise _InventoryError("mapping-plan-unknown")
        if evidence_path in evidence_paths:
            raise _InventoryError("mapping-evidence-duplicate")
        alias = _alias_key(evidence_path)
        if alias in aliases and aliases[alias] != evidence_path:
            raise _InventoryError("mapping-path-alias")
        aliases[alias] = evidence_path
        evidence_paths.add(evidence_path)


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
        inventory = _parse_inventory(content, policy_observations)
        _validate_declarations(inventory)
        return Success(inventory)
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
    try:
        _validate_declarations(planning_inventory)
    except _InventoryError as error:
        return _failure(error.code)
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
    phases = {phase.phase_id: phase for phase in planning_inventory.phases}
    if len(phases) != len(planning_inventory.phases):
        return _failure("mapping-phase-conflict")
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
                sorted(
                    (
                        plan.path
                        for plan in planning_inventory.plans
                        if plan.phase_id == assignment.phase_id
                    ),
                    key=str.encode,
                )
            ),
            evidence_paths=tuple(
                sorted(
                    (
                        evidence.path
                        for evidence in planning_inventory.evidence
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
        for assignment in sorted(assignments, key=lambda item: item.source_id)
    )
    return Success(mappings)


def _expected_mappings(
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
        for assignment in sorted(inventory.assignments, key=lambda item: item.source_id)
    )


def _observe_declared_path(
    root: Path,
    declared_path: str,
    *,
    expect_directory: bool,
) -> tuple[MappingIssue | None, int]:
    """Observe one exact path from an anchored descriptor without following links."""

    parts = PurePosixPath(declared_path).parts
    descriptors: list[int] = []
    try:
        descriptor = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
        descriptors.append(descriptor)
        for index, part in enumerate(parts):
            names = os.listdir(descriptor)
            aliases = [name for name in names if _alias_key(name) == _alias_key(part)]
            if part not in names:
                code = "mapping-path-alias" if aliases else "mapping-path-missing"
                return MappingIssue(code, declared_path), 0
            if any(name != part for name in aliases):
                return MappingIssue("mapping-path-alias", declared_path), 0

            entry = os.stat(part, dir_fd=descriptor, follow_symlinks=False)
            if stat.S_ISLNK(entry.st_mode):
                return MappingIssue("mapping-path-symlink", declared_path), 0
            final = index == len(parts) - 1
            if not final:
                if not stat.S_ISDIR(entry.st_mode):
                    return MappingIssue("mapping-path-non-directory", declared_path), 0
                descriptor = os.open(
                    part,
                    os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                    dir_fd=descriptor,
                )
                descriptors.append(descriptor)
                continue
            if expect_directory:
                if not stat.S_ISDIR(entry.st_mode):
                    return MappingIssue("mapping-path-non-directory", declared_path), 0
                return None, 0
            if not stat.S_ISREG(entry.st_mode):
                return MappingIssue("mapping-path-non-regular", declared_path), 0
            file_descriptor = os.open(
                part,
                os.O_RDONLY | os.O_NOFOLLOW,
                dir_fd=descriptor,
            )
            descriptors.append(file_descriptor)
            observed = os.read(file_descriptor, _MAX_BYTES + 1)
            if len(observed) > _MAX_BYTES:
                return MappingIssue(
                    "mapping-path-byte-limit-exceeded", declared_path
                ), 0
            return None, len(observed)
        return MappingIssue("mapping-path-missing", declared_path), 0
    except (OSError, UnicodeError, ValueError):
        return MappingIssue("mapping-path-unreadable", declared_path), 0
    finally:
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

    observed_bytes = 0
    for path, expect_directory in sorted(
        paths.items(), key=lambda item: item[0].encode()
    ):
        issue, byte_count = _observe_declared_path(
            root, path, expect_directory=expect_directory
        )
        if issue is not None:
            issues.append(issue)
            continue
        observed_bytes += byte_count
        if observed_bytes > _MAX_BYTES:
            issues.append(MappingIssue("mapping-observation-limit-exceeded", path))
            break
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
    if not isinstance(source_items, SourceIdentityState) or not isinstance(
        planning_inventory, PlanningInventory
    ):
        return _failure("mapping-input-invalid")
    if type(mappings) is not tuple or len(mappings) > _MAX_ENTRIES:
        return _failure("mapping-set-invalid")
    try:
        _validate_declarations(planning_inventory)
        root = repository_root.resolve(strict=True)
        if not root.is_dir():
            raise OSError
    except _InventoryError as error:
        return _failure(error.code)
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
    if any(not isinstance(mapping, ManifestMapping) for mapping in mappings):
        return _failure("mapping-set-invalid")
    mapping_ids = [mapping.source_id for mapping in mappings]
    if len(mapping_ids) != len(set(mapping_ids)):
        return _failure("mapping-source-duplicate")
    if set(mapping_ids) & tombstone_ids:
        return _failure("mapping-tombstone-reference")
    if mappings != _expected_mappings(planning_inventory):
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
