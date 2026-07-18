"""Exact schema-2 manifest codec and version-dispatch contract tests."""

from __future__ import annotations

import json
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest
from hypothesis import given
from hypothesis import strategies as st

from ai_coding_template_ja.openspec_gsd_handoff.manifest import (
    MAX_MANIFEST_BYTES,
    ManifestFileOperations,
    parse_manifest_bytes,
)
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
from ai_coding_template_ja.openspec_gsd_handoff.models import Failure, Success
from ai_coding_template_ja.openspec_gsd_handoff.source_identity import (
    SourceCategory,
    SourceIdentityState,
    SourceInventory,
    SourceObservation,
    reconcile_source_items,
)
from ai_coding_template_ja.openspec_gsd_handoff.versioned_manifest import (
    parse_versioned_manifest_bytes,
    read_versioned_manifest_file,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
EXPECTED_V2 = (
    REPO_ROOT
    / "tests"
    / "fixtures"
    / "openspec_gsd_handoff"
    / "manifest"
    / "expected-migrated-v2.json"
).read_bytes()
EXPECTED_V1 = (
    REPO_ROOT
    / "tests"
    / "fixtures"
    / "openspec_gsd_handoff"
    / "manifest"
    / "expected-prepared.json"
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
        (
            lambda raw: raw["source_items"]["tombstones"][0].update(
                {
                    "last_source_path": (
                        "openspec/changes/fixture-change/specs/"
                        "fixture-capability/spec.md"
                    ),
                    "last_raw_heading": "### Requirement: Fixture identity",
                }
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
    ("first_path", "second_path"),
    [
        (
            "openspec/changes/fixture-change/specs/Fixture-Capability/spec.md",
            "openspec/changes/fixture-change/specs/fixture-capability/spec.md",
        ),
        (
            "openspec/changes/fixture-change/specs/Café/spec.md",
            "openspec/changes/fixture-change/specs/CAFÉ/spec.md",
        ),
    ],
)
def test_schema_v2_rejects_casefolded_source_path_aliases(
    first_path: str,
    second_path: str,
) -> None:
    raw = _raw_v2()
    raw["source_items"]["active"][0]["source_path"] = first_path
    raw["source_items"]["active"][1]["source_path"] = second_path

    _assert_failure(raw)


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


@pytest.mark.parametrize("container", ["object", "array"])
def test_schema_v2_parser_rejects_deeply_nested_json_as_structured_failure(
    container: str,
) -> None:
    depth = 10_000
    if container == "object":
        data = b'{"nested":' * depth + b"0" + b"}" * depth
    else:
        data = b"[" * depth + b"0" + b"]" * depth

    assert len(data) < MAX_MANIFEST_BYTES
    result = parse_manifest_v2_bytes(data)

    assert isinstance(result, Failure)
    assert result.issue.code == "manifest-v2-json-invalid"


@pytest.mark.parametrize(
    "data",
    [
        EXPECTED_V2.replace(
            b'{\n  "schema_version": 2,',
            b'{\n  "schema_version": 1,\n  "schema_version": 2,',
            1,
        ),
        EXPECTED_V2.replace(
            b'    {\n      "kind": "design",',
            b'    {\n      "kind": "proposal",\n      "kind": "design",',
            1,
        ),
    ],
    ids=["root", "nested"],
)
def test_schema_v2_parser_rejects_duplicate_object_names(data: bytes) -> None:
    result = parse_manifest_v2_bytes(data)

    assert isinstance(result, Failure)
    assert result.issue.code == "manifest-v2-json-invalid"


@pytest.mark.parametrize(
    "data",
    [
        b'{"schema_version":' + b"9" * 5000 + b"}",
        json.dumps(
            {
                **_raw_v2(),
                "progress": {
                    **_raw_v2()["progress"],
                    "tasks": [
                        {
                            **_raw_v2()["progress"]["tasks"][0],
                            "description": "\ud800",
                        },
                        *_raw_v2()["progress"]["tasks"][1:],
                    ],
                },
            }
        ).encode(),
        json.dumps(
            {
                **_raw_v2(),
                "source_items": {
                    **_raw_v2()["source_items"],
                    "active": [
                        {
                            **_raw_v2()["source_items"]["active"][0],
                            "raw_heading": "\ud800",
                        },
                        *_raw_v2()["source_items"]["active"][1:],
                    ],
                },
            }
        ).encode(),
    ],
    ids=["huge-integer", "common-lone-surrogate", "source-lone-surrogate"],
)
def test_schema_v2_parser_contains_bounded_non_total_json_inputs(data: bytes) -> None:
    result = parse_manifest_v2_bytes(data)

    assert isinstance(result, Failure)
    assert result.issue.code in {
        "manifest-v2-json-invalid",
        "manifest-v2-value-invalid",
    }


def test_schema_v2_serializer_contains_non_total_complete_values() -> None:
    parsed = parse_manifest_v2_bytes(EXPECTED_V2)
    assert isinstance(parsed, Success)
    source_items = parsed.value.source_items
    invalid_source_items = replace(
        source_items,
        active=(
            replace(source_items.active[0], raw_heading="\ud800"),
            *source_items.active[1:],
        ),
    )

    huge_integer = serialize_manifest_v2(replace(parsed.value, schema_version=10**4999))
    lone_surrogate = serialize_manifest_v2(
        replace(parsed.value, source_items=invalid_source_items)
    )

    assert isinstance(huge_integer, Failure)
    assert huge_integer.issue.code == "manifest-v2-serialization-invalid"
    assert isinstance(lone_surrogate, Failure)
    assert lone_surrogate.issue.code == "manifest-v2-serialization-invalid"


def test_schema_v2_serializer_rejects_invalid_complete_values() -> None:
    parsed = parse_manifest_v2_bytes(EXPECTED_V2)
    assert isinstance(parsed, Success)
    invalid = replace(parsed.value, schema_version=1)

    result = serialize_manifest_v2(invalid)

    assert isinstance(result, Failure)
    assert result.issue.code == "manifest-v2-serialization-invalid"
    assert isinstance(parsed.value, HandoffManifestV2)


class _ReadCountingOperations(ManifestFileOperations):
    def __init__(self) -> None:
        self.read_calls = 0

    def read_bounded_bytes(
        self,
        path: Path,
        *,
        limit: int = MAX_MANIFEST_BYTES,
    ) -> bytes:
        self.read_calls += 1
        return super().read_bounded_bytes(path, limit=limit)


def test_versioned_parser_dispatches_to_both_exact_schema_parsers() -> None:
    parsed_v1 = parse_versioned_manifest_bytes(EXPECTED_V1)
    parsed_v2 = parse_versioned_manifest_bytes(EXPECTED_V2)

    assert parsed_v1 == parse_manifest_bytes(EXPECTED_V1)
    assert parsed_v2 == parse_manifest_v2_bytes(EXPECTED_V2)

    extended_v1 = json.loads(EXPECTED_V1)
    extended_v1["source_items"] = {}
    rejected = parse_versioned_manifest_bytes(json.dumps(extended_v1).encode())
    assert isinstance(rejected, Failure)
    assert rejected.issue.code == "manifest-fields-invalid"


def test_versioned_file_reader_observes_manifest_bytes_once(tmp_path: Path) -> None:
    path = tmp_path / "handoff.json"
    path.write_bytes(EXPECTED_V2)
    operations = _ReadCountingOperations()

    result = read_versioned_manifest_file(path, operations=operations)

    assert result == parse_manifest_v2_bytes(EXPECTED_V2)
    assert operations.read_calls == 1


@pytest.mark.parametrize(
    ("data", "requested_schema_version", "code"),
    [
        (b"{not-json", None, "manifest-json-invalid"),
        (b"{}", None, "manifest-schema-unsupported"),
        (b'{"schema_version": true}', None, "manifest-schema-unsupported"),
        (b'{"schema_version": 3}', None, "manifest-schema-unsupported"),
        (EXPECTED_V2, 1, "manifest-downgrade-rejected"),
        (EXPECTED_V2, True, "manifest-requested-schema-invalid"),
        (EXPECTED_V1, 3, "manifest-requested-schema-invalid"),
    ],
)
def test_versioned_parser_rejects_malformed_unknown_and_downgrade_requests(
    data: bytes,
    requested_schema_version: int | None,
    code: str,
) -> None:
    result = parse_versioned_manifest_bytes(
        data,
        requested_schema_version=requested_schema_version,
    )

    assert isinstance(result, Failure)
    assert result.issue.code == code


@pytest.mark.parametrize("container", ["object", "array"])
def test_versioned_parser_rejects_deeply_nested_json_as_structured_failure(
    container: str,
) -> None:
    depth = 10_000
    if container == "object":
        data = b'{"nested":' * depth + b"0" + b"}" * depth
    else:
        data = b"[" * depth + b"0" + b"]" * depth

    assert len(data) < MAX_MANIFEST_BYTES
    result = parse_versioned_manifest_bytes(data)

    assert isinstance(result, Failure)
    assert result.issue.code == "manifest-json-invalid"


@pytest.mark.parametrize(
    "data",
    [
        EXPECTED_V2.replace(
            b'{\n  "schema_version": 2,',
            b'{\n  "schema_version": 1,\n  "schema_version": 2,',
            1,
        ),
        EXPECTED_V2.replace(
            b'    {\n      "kind": "design",',
            b'    {\n      "kind": "proposal",\n      "kind": "design",',
            1,
        ),
    ],
    ids=["root", "nested"],
)
def test_versioned_parser_rejects_duplicate_object_names(data: bytes) -> None:
    result = parse_versioned_manifest_bytes(data)

    assert isinstance(result, Failure)
    assert result.issue.code == "manifest-json-invalid"


def test_versioned_parser_contains_huge_integer_json_failure() -> None:
    data = b'{"schema_version":' + b"9" * 5000 + b"}"

    result = parse_versioned_manifest_bytes(data)

    assert isinstance(result, Failure)
    assert result.issue.code == "manifest-json-invalid"


def test_versioned_parser_accepts_non_downgrade_supported_requests() -> None:
    requested_current = parse_versioned_manifest_bytes(
        EXPECTED_V2,
        requested_schema_version=2,
    )
    requested_upgrade_target = parse_versioned_manifest_bytes(
        EXPECTED_V1,
        requested_schema_version=2,
    )

    assert requested_current == parse_manifest_v2_bytes(EXPECTED_V2)
    assert requested_upgrade_target == parse_manifest_bytes(EXPECTED_V1)


@given(
    st.lists(
        st.text(
            alphabet=st.sampled_from(tuple("abcdefghijklmnopqrstuvwxyz0123456789")),
            min_size=1,
            max_size=12,
        ),
        min_size=1,
        max_size=8,
        unique=True,
    )
)
def test_schema_v2_complete_values_round_trip_to_the_same_value_and_bytes(
    generated_names: list[str],
) -> None:
    parsed = parse_manifest_v2_bytes(EXPECTED_V2)
    assert isinstance(parsed, Success)
    names = tuple(sorted(generated_names))
    inventory = SourceInventory(
        items=tuple(
            SourceObservation(
                category=SourceCategory.REQUIREMENT,
                source_path=(
                    "openspec/changes/fixture-change/specs/"
                    f"generated-{index:06d}-{name}/spec.md"
                ),
                raw_heading=f"### Requirement: Generated {index:06d} {name}",
                normalized_heading=f"Requirement: Generated {index:06d} {name}",
                normalized_block="Generated body.\n",
                parent_locator=None,
            )
            for index, name in enumerate(names, start=1)
        )
    )
    reconciled = reconcile_source_items(
        inventory,
        SourceIdentityState(
            next_requirement_id=1,
            next_scenario_id=1,
            active=(),
            tombstones=(),
        ),
    )
    assert isinstance(reconciled, Success)
    manifest = replace(
        parsed.value,
        source_items=reconciled.value.state,
    )

    serialized = serialize_manifest_v2(manifest)

    assert isinstance(serialized, Success)
    reparsed = parse_versioned_manifest_bytes(serialized.value)
    assert reparsed == Success(manifest)
    assert isinstance(reparsed, Success)
    assert isinstance(reparsed.value, HandoffManifestV2)
    reserialized = serialize_manifest_v2(reparsed.value)
    assert isinstance(reserialized, Success)
    assert reserialized.value == serialized.value
