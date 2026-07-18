"""Bounded exact-version dispatch for handoff manifests."""

from __future__ import annotations

import json
from collections.abc import Mapping
from pathlib import Path

from .manifest import (
    MAX_MANIFEST_BYTES,
    HandoffManifest,
    ManifestFileOperations,
    ManifestSizeLimitExceeded,
    parse_manifest_bytes,
)
from .manifest_v2 import (
    DuplicateJsonObjectNameError,
    HandoffManifestV2,
    decode_json_without_duplicate_object_names,
    parse_manifest_v2_bytes,
)
from .models import (
    ClassifiedIssue,
    Failure,
    IssueCategory,
    KnownState,
    Result,
)

type VersionedManifest = HandoffManifest | HandoffManifestV2


def _failure(code: str) -> Failure:
    return Failure(
        ClassifiedIssue(
            category=IssueCategory.PERSISTENCE,
            code=code,
            known_state=KnownState.UNKNOWN,
        )
    )


def parse_versioned_manifest_bytes(
    data: bytes,
    *,
    requested_schema_version: int | None = None,
) -> Result[VersionedManifest]:
    """Select one exact full parser from the same bounded byte observation."""

    if len(data) > MAX_MANIFEST_BYTES:
        return _failure("manifest-size-limit-exceeded")
    if requested_schema_version is not None and (
        type(requested_schema_version) is not int
        or requested_schema_version not in {1, 2}
    ):
        return _failure("manifest-requested-schema-invalid")
    try:
        raw = decode_json_without_duplicate_object_names(data)
    except (
        DuplicateJsonObjectNameError,
        json.JSONDecodeError,
        UnicodeDecodeError,
        TypeError,
        ValueError,
        OverflowError,
        RecursionError,
    ):
        return _failure("manifest-json-invalid")
    if not isinstance(raw, Mapping):
        return _failure("manifest-schema-unsupported")
    schema_version = raw.get("schema_version")
    if type(schema_version) is not int or schema_version not in {1, 2}:
        return _failure("manifest-schema-unsupported")
    if (
        requested_schema_version is not None
        and requested_schema_version < schema_version
    ):
        return _failure("manifest-downgrade-rejected")
    if schema_version == 1:
        return parse_manifest_bytes(data)
    return parse_manifest_v2_bytes(data)


def read_versioned_manifest_file(
    path: Path,
    *,
    requested_schema_version: int | None = None,
    operations: ManifestFileOperations | None = None,
) -> Result[VersionedManifest]:
    """Read once with limit-plus-one and dispatch the complete observed bytes."""

    filesystem = operations or ManifestFileOperations()
    try:
        data = filesystem.read_bounded_bytes(path)
    except ManifestSizeLimitExceeded:
        return _failure("manifest-size-limit-exceeded")
    except OSError:
        return _failure("manifest-read-failed")
    return parse_versioned_manifest_bytes(
        data,
        requested_schema_version=requested_schema_version,
    )
