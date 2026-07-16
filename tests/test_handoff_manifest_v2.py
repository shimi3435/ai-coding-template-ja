"""Exact schema-2 manifest codec and version-dispatch contract tests."""

from __future__ import annotations

import json
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest
from ai_coding_template_ja.openspec_gsd_handoff.manifest_v2 import (
    HandoffManifestV2,
    LifecycleRecordReference,
    LifecycleReferenceState,
    ManifestLifecycle,
    ManifestMapping,
    ManifestOwnership,
    OwnershipEntry,
    parse_manifest_v2_bytes,
    serialize_manifest_v2,
)

from ai_coding_template_ja.openspec_gsd_handoff.manifest import MAX_MANIFEST_BYTES
from ai_coding_template_ja.openspec_gsd_handoff.models import Failure, Success

REPO_ROOT = Path(__file__).resolve().parent.parent
EXPECTED_V2 = (
    REPO_ROOT
    / "tests"
    / "fixtures"
    / "openspec_gsd_handoff"
    / "manifest"
    / "expected-migrated-v2.json"
).read_bytes()
ROOT_FIELDS_V2 = {
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


def _raw_v2() -> dict[str, Any]:
    return json.loads(EXPECTED_V2)


def _parse_v2_raw(raw: dict[str, Any]):
    return parse_manifest_v2_bytes(
        (json.dumps(raw, ensure_ascii=False) + "\n").encode()
    )


def _assert_failure(raw: dict[str, Any], code: str = "manifest-v2-value-invalid"):
    result = _parse_v2_raw(raw)
    assert isinstance(result, Failure)
    assert result.issue.code == code


def test_schema_v2_golden_round_trips_to_exact_deterministic_bytes() -> None:
    raw = _raw_v2()

    parsed = parse_manifest_v2_bytes(EXPECTED_V2)

    assert set(raw) == ROOT_FIELDS_V2
    assert len(raw) == 11
    assert raw["mappings"] == []
    assert raw["ownership"] == {"owned": [], "referenced": []}
    assert raw["lifecycle"] == {
        "checkpoints": [],
        "receipts": [],
        "archives": [],
    }
    assert isinstance(parsed, Success)
    first = serialize_manifest_v2(parsed.value)
    second = serialize_manifest_v2(parsed.value)
    assert isinstance(first, Success)
    assert isinstance(second, Success)
    assert first.value == second.value == EXPECTED_V2


@pytest.mark.parametrize(
    ("path", "field"),
    [
        ((), "root_unknown"),
        (("artifacts", 0), "artifact_unknown"),
        (("progress",), "progress_unknown"),
        (("progress", "tasks", 0), "task_unknown"),
        (("capabilities",), "capabilities_unknown"),
        (("capabilities", "openspec"), "openspec_unknown"),
        (("capabilities", "gsd"), "gsd_unknown"),
        (("capabilities", "host"), "host_unknown"),
        (("source_items",), "source_items_unknown"),
        (("source_items", "active", 0), "active_unknown"),
        (("source_items", "tombstones", 0), "tombstone_unknown"),
        (("ownership",), "ownership_unknown"),
        (("lifecycle",), "lifecycle_unknown"),
    ],
)
def test_schema_v2_rejects_unknown_fields_at_every_present_object_level(
    path: tuple[str | int, ...],
    field: str,
) -> None:
    complete = _raw_v2()
    target: Any = complete
    for component in path:
        target = target[component]
    assert isinstance(target, dict)
    target[field] = "unexpected"
    _assert_failure(
        complete,
        "manifest-v2-fields-invalid" if not path else "manifest-v2-value-invalid",
    )


def test_schema_v2_validates_exact_future_reference_shapes() -> None:
    parsed = parse_manifest_v2_bytes(EXPECTED_V2)
    assert isinstance(parsed, Success)
    manifest = replace(
        parsed.value,
        mappings=(
            ManifestMapping(
                source_id="REQ-000001",
                phase_id="01",
                phase_path=".planning/phases/01-stable-identity-and-migration",
                plan_paths=(
                    ".planning/phases/01-stable-identity-and-migration/01-03-PLAN.md",
                ),
                evidence_paths=("tests/test_handoff_manifest_v2.py",),
                policy_references=("ACE-R4",),
            ),
        ),
        ownership=ManifestOwnership(
            owned=(
                OwnershipEntry(
                    kind="plan",
                    path=(
                        ".planning/phases/"
                        "01-stable-identity-and-migration/01-03-PLAN.md"
                    ),
                ),
            ),
            referenced=(
                OwnershipEntry(
                    kind="canonical-source",
                    path=(
                        "openspec/changes/harden-openspec-gsd-handoff-lifecycle/"
                        "design.md"
                    ),
                ),
            ),
        ),
        lifecycle=ManifestLifecycle(
            checkpoints=(
                LifecycleRecordReference(
                    operation_id="migration-preview-1",
                    path=".planning/checkpoints/migration-preview-1.json",
                    sha256="e" * 64,
                    state=LifecycleReferenceState.PENDING,
                ),
            ),
            receipts=(),
            archives=(),
        ),
    )

    serialized = serialize_manifest_v2(manifest)

    assert isinstance(serialized, Success)
    assert parse_manifest_v2_bytes(serialized.value) == Success(manifest)


@pytest.mark.parametrize(
    ("mutate", "code"),
    [
        (
            lambda raw: raw["source_items"].__setitem__("next_requirement_id", True),
            "manifest-v2-value-invalid",
        ),
        (
            lambda raw: raw["source_items"]["active"][0].__setitem__(
                "id", "REQ-000000"
            ),
            "manifest-v2-value-invalid",
        ),
        (
            lambda raw: raw["source_items"]["active"][0].__setitem__(
                "category", "scenario"
            ),
            "manifest-v2-value-invalid",
        ),
        (
            lambda raw: raw["source_items"]["active"][1].__setitem__("parent_id", None),
            "manifest-v2-value-invalid",
        ),
        (
            lambda raw: raw["source_items"]["tombstones"][1].__setitem__(
                "last_parent_id", "REQ-999999"
            ),
            "manifest-v2-value-invalid",
        ),
        (
            lambda raw: raw["source_items"]["active"][1].__setitem__(
                "id", "REQ-000001"
            ),
            "manifest-v2-value-invalid",
        ),
    ],
)
def test_schema_v2_rejects_malformed_ids_counters_parents_and_duplicates(
    mutate,
    code: str,
) -> None:
    raw = _raw_v2()
    mutate(raw)
    _assert_failure(raw, code)


@pytest.mark.parametrize(
    "field",
    ["mappings", "ownership", "lifecycle"],
)
def test_schema_v2_rejects_invalid_phase_one_placeholder_shapes(field: str) -> None:
    raw = _raw_v2()
    raw[field] = {}

    _assert_failure(raw)


def test_schema_v2_rejects_unknown_future_reference_fields_and_values() -> None:
    raw = _raw_v2()
    raw["mappings"] = [
        {
            "source_id": "REQ-000001",
            "phase_id": "01",
            "phase_path": ".planning/phases/01-stable-identity-and-migration",
            "plan_paths": [],
            "evidence_paths": [],
            "policy_references": [],
            "unknown": True,
        }
    ]
    _assert_failure(raw)

    raw = _raw_v2()
    raw["ownership"]["owned"] = [{"kind": "canonical-source", "path": "x"}]
    _assert_failure(raw)

    raw = _raw_v2()
    raw["lifecycle"]["checkpoints"] = [
        {
            "operation_id": "operation-1",
            "path": ".planning/checkpoint.json",
            "sha256": "e" * 64,
            "state": "succeeded",
        }
    ]
    _assert_failure(raw)


def test_schema_v2_rejects_invalid_collection_order_and_bounds() -> None:
    raw = _raw_v2()
    raw["mappings"] = [
        {
            "source_id": "SCN-000001",
            "phase_id": "01",
            "phase_path": ".planning/phases/01",
            "plan_paths": [],
            "evidence_paths": [],
            "policy_references": [],
        },
        {
            "source_id": "REQ-000001",
            "phase_id": "01",
            "phase_path": ".planning/phases/01",
            "plan_paths": [],
            "evidence_paths": [],
            "policy_references": [],
        },
    ]
    _assert_failure(raw)

    raw = _raw_v2()
    raw["source_items"]["active"] = [raw["source_items"]["active"][0]] * 4097
    _assert_failure(raw)


def test_schema_v2_parser_enforces_exact_byte_boundary() -> None:
    boundary = parse_manifest_v2_bytes(b" " * MAX_MANIFEST_BYTES)
    exceeded = parse_manifest_v2_bytes(b" " * (MAX_MANIFEST_BYTES + 1))

    assert isinstance(boundary, Failure)
    assert boundary.issue.code == "manifest-v2-json-invalid"
    assert isinstance(exceeded, Failure)
    assert exceeded.issue.code == "manifest-size-limit-exceeded"


def test_schema_v2_serializer_rejects_invalid_complete_values() -> None:
    parsed = parse_manifest_v2_bytes(EXPECTED_V2)
    assert isinstance(parsed, Success)
    invalid = replace(parsed.value, schema_version=1)

    result = serialize_manifest_v2(invalid)

    assert isinstance(result, Failure)
    assert result.issue.code == "manifest-v2-serialization-invalid"
    assert isinstance(parsed.value, HandoffManifestV2)
