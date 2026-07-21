"""Fixed examples for the public current-tree policy-reference seam."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
from dataclasses import FrozenInstanceError, replace
from pathlib import Path

import pytest

from ai_coding_template_ja.openspec_gsd_handoff.models import Failure, Success
from ai_coding_template_ja.openspec_gsd_handoff.policy_reference import (
    PolicyReference,
    PolicyReferenceLimits,
    PolicyReferenceRegistry,
    observe_policy_sections,
    read_policy_reference_registry,
    validate_policy_references,
)

FIXTURE_ROOT = Path(__file__).parent / "fixtures" / "openspec_gsd_handoff" / "policy"
POLICY_PATH = "docs/policy.md"
NORMALIZER_VERSION = "adaptive-policy-section-v1\0"
TARGET_HEADING = "Café policy"
TARGET_BODY = (
    "\n"
    "  indented body\n"
    "\n"
    "```markdown\n"
    "## Café policy\n"
    "# ignored boundary\n"
    "```\n"
    "Final line\n"
)


def _independent_fingerprint(path: str, heading: str, body: str) -> str:
    framed = bytearray()
    for component in (NORMALIZER_VERSION, path, heading, body):
        encoded = component.encode("utf-8")
        framed.extend(len(encoded).to_bytes(8, "big"))
        framed.extend(encoded)
    return hashlib.sha256(framed).hexdigest()


EXPECTED_SHA256 = _independent_fingerprint(POLICY_PATH, TARGET_HEADING, TARGET_BODY)


def _write_policy(
    tmp_path: Path,
    content: bytes,
    *,
    source_path: str = POLICY_PATH,
) -> tuple[Path, str]:
    repository = tmp_path / "repository"
    target = repository / source_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)
    return repository, source_path


def _registry(
    *,
    source_path: str = POLICY_PATH,
    heading: str = TARGET_HEADING,
    body_length: int = len(TARGET_BODY.encode("utf-8")),
    sha256: str = EXPECTED_SHA256,
) -> PolicyReferenceRegistry:
    return PolicyReferenceRegistry(
        version="adaptive-policy-references-v1",
        references=(
            PolicyReference(
                id="ACE-TEST",
                source_path=source_path,
                heading=heading,
                body_length=body_length,
                sha256=sha256,
            ),
        ),
    )


def _observe(repository: Path, registry: PolicyReferenceRegistry | None = None):
    return observe_policy_sections(repository, registry or _registry())


def test_observer_returns_exact_fixed_section_evidence(tmp_path: Path) -> None:
    repository, _ = _write_policy(
        tmp_path, (FIXTURE_ROOT / "valid-policy.md").read_bytes()
    )

    result = _observe(repository)

    assert isinstance(result, Success)
    assert len(result.value) == 1
    observation = result.value[0]
    assert observation.reference_id == "ACE-TEST"
    assert observation.raw_source_path == POLICY_PATH
    assert observation.source_path == POLICY_PATH
    assert observation.raw_heading == "## Café policy   ###"
    assert observation.normalized_heading == TARGET_HEADING
    assert observation.normalized_body == TARGET_BODY
    assert observation.body_length == 80
    assert (
        observation.sha256
        == "d413b75f3ad98adacf97c0ac358fc40e20721466f51a559f3e570f0d0c4bdbd3"
    )
    assert observation.sha256 == EXPECTED_SHA256
    assert observation.normalized_body.endswith("\n")
    assert not observation.normalized_body.endswith("\n\n")
    with pytest.raises(FrozenInstanceError):
        observation.source_path = "changed.md"  # type: ignore[misc]


@pytest.mark.parametrize("line_ending", [b"\n", b"\r\n", b"\r"])
def test_observer_preserves_normalized_evidence_across_line_endings_and_nfc(
    tmp_path: Path,
    line_ending: bytes,
) -> None:
    fixture = (FIXTURE_ROOT / "valid-policy.md").read_bytes()
    equivalent = fixture.replace("Café".encode(), "Café".encode())
    equivalent = equivalent.replace(b"  indented body", b"  indented body   \t")
    equivalent = equivalent.replace(b"Final line", b"Final line\t ")
    equivalent = line_ending.join(equivalent.split(b"\n"))
    repository, _ = _write_policy(tmp_path, equivalent)

    result = _observe(repository)

    assert isinstance(result, Success)
    observation = result.value[0]
    assert observation.normalized_heading == TARGET_HEADING
    assert observation.normalized_body == TARGET_BODY
    assert observation.body_length == 80
    assert observation.sha256 == EXPECTED_SHA256


def test_closed_fence_headings_do_not_open_or_end_the_section(tmp_path: Path) -> None:
    repository, _ = _write_policy(
        tmp_path, (FIXTURE_ROOT / "valid-policy.md").read_bytes()
    )

    result = _observe(repository)

    assert isinstance(result, Success)
    assert "## Café policy\n# ignored boundary\n" in result.value[0].normalized_body
    assert "Outside." not in result.value[0].normalized_body


@pytest.mark.parametrize(
    ("fixture_name", "code"),
    [
        ("duplicate-heading.md", "policy-heading-duplicate"),
        ("unclosed-fence.md", "policy-fence-unclosed"),
    ],
)
def test_observer_rejects_ambiguous_markdown_without_partial_observations(
    tmp_path: Path,
    fixture_name: str,
    code: str,
) -> None:
    repository, _ = _write_policy(tmp_path, (FIXTURE_ROOT / fixture_name).read_bytes())
    registry = _registry(heading="Target policy", body_length=0, sha256="0" * 64)

    result = _observe(repository, registry)

    assert isinstance(result, Failure)
    assert result.issue.code == code
    assert not hasattr(result, "value")


@pytest.mark.parametrize(
    ("content", "code"),
    [
        (b"\xff", "policy-utf8-invalid"),
        (b"# Other\nBody.\n", "policy-heading-missing"),
    ],
)
def test_observer_rejects_incomplete_content(
    tmp_path: Path,
    content: bytes,
    code: str,
) -> None:
    repository, _ = _write_policy(tmp_path, content)

    result = _observe(repository)

    assert isinstance(result, Failure)
    assert result.issue.code == code
    assert not hasattr(result, "value")


@pytest.mark.parametrize(
    "source_path",
    [
        "",
        "/absolute.md",
        "./docs/policy.md",
        "docs/../policy.md",
        "docs\\policy.md",
        "docs/\0policy.md",
    ],
)
def test_observer_rejects_lexically_unsafe_paths(
    tmp_path: Path, source_path: str
) -> None:
    repository = tmp_path / "repository"
    repository.mkdir()

    result = _observe(repository, _registry(source_path=source_path))

    assert isinstance(result, Failure)
    assert result.issue.code == "policy-path-invalid"


def test_observer_rejects_symlink_escape_without_following_it(tmp_path: Path) -> None:
    repository = tmp_path / "repository"
    outside = tmp_path / "outside.md"
    outside.write_bytes((FIXTURE_ROOT / "valid-policy.md").read_bytes())
    target = repository / POLICY_PATH
    target.parent.mkdir(parents=True)
    target.symlink_to(outside)

    result = _observe(repository)

    assert isinstance(result, Failure)
    assert result.issue.code == "policy-path-symlink"


def test_observer_rejects_non_regular_policy_file(tmp_path: Path) -> None:
    repository = tmp_path / "repository"
    (repository / POLICY_PATH).mkdir(parents=True)

    result = _observe(repository)

    assert isinstance(result, Failure)
    assert result.issue.code == "policy-path-not-file"


@pytest.mark.parametrize(
    ("first_path", "second_path"),
    [
        ("docs/Café.md", "docs/Café.md"),
        ("docs/Policy.md", "docs/policy.md"),
    ],
)
def test_observer_rejects_unicode_and_case_path_aliases(
    tmp_path: Path,
    first_path: str,
    second_path: str,
) -> None:
    repository, _ = _write_policy(
        tmp_path,
        (FIXTURE_ROOT / "valid-policy.md").read_bytes(),
        source_path=first_path,
    )
    second = repository / second_path
    second.parent.mkdir(parents=True, exist_ok=True)
    second.write_bytes((FIXTURE_ROOT / "valid-policy.md").read_bytes())
    registry = PolicyReferenceRegistry(
        version="adaptive-policy-references-v1",
        references=(
            _registry(source_path=first_path).references[0],
            PolicyReference(
                id="ACE-OTHER",
                source_path=second_path,
                heading=TARGET_HEADING,
                body_length=80,
                sha256=EXPECTED_SHA256,
            ),
        ),
    )

    result = _observe(repository, registry)

    assert isinstance(result, Failure)
    assert result.issue.code == "policy-path-alias"


def test_observer_enforces_file_and_total_limit_plus_one(tmp_path: Path) -> None:
    fixture = (FIXTURE_ROOT / "valid-policy.md").read_bytes()
    repository, _ = _write_policy(tmp_path, fixture)
    second_path = "docs/second.md"
    (repository / second_path).write_bytes(fixture)
    two_file_registry = PolicyReferenceRegistry(
        version="adaptive-policy-references-v1",
        references=(
            _registry().references[0],
            PolicyReference(
                id="ACE-OTHER",
                source_path=second_path,
                heading=TARGET_HEADING,
                body_length=80,
                sha256=EXPECTED_SHA256,
            ),
        ),
    )

    file_limit = observe_policy_sections(
        repository,
        _registry(),
        limits=PolicyReferenceLimits(bytes_per_file=len(fixture) - 1),
    )
    total_limit = observe_policy_sections(
        repository,
        two_file_registry,
        limits=PolicyReferenceLimits(bytes_total=len(fixture) * 2 - 1),
    )

    assert isinstance(file_limit, Failure)
    assert file_limit.issue.code == "policy-file-limit-exceeded"
    assert isinstance(total_limit, Failure)
    assert total_limit.issue.code == "policy-total-limit-exceeded"


def test_later_policy_failure_does_not_expose_earlier_observation(
    tmp_path: Path,
) -> None:
    fixture = (FIXTURE_ROOT / "valid-policy.md").read_bytes()
    repository, _ = _write_policy(tmp_path, fixture)
    invalid_path = "docs/invalid.md"
    (repository / invalid_path).write_bytes(b"\xff")
    registry = PolicyReferenceRegistry(
        version="adaptive-policy-references-v1",
        references=(
            _registry().references[0],
            PolicyReference(
                id="ACE-INVALID",
                source_path=invalid_path,
                heading=TARGET_HEADING,
                body_length=80,
                sha256=EXPECTED_SHA256,
            ),
        ),
    )

    result = _observe(repository, registry)

    assert isinstance(result, Failure)
    assert result.issue.code == "policy-utf8-invalid"
    assert not hasattr(result, "value")


def test_observer_does_not_use_git_history(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    repository, _ = _write_policy(
        tmp_path, (FIXTURE_ROOT / "valid-policy.md").read_bytes()
    )

    def forbid_process(*args: object, **kwargs: object) -> None:
        raise AssertionError((args, kwargs))

    monkeypatch.setattr(os, "system", forbid_process)

    result = _observe(repository)

    assert isinstance(result, Success)


TRACKED_REGISTRY_PATH = "docs/agents/adaptive-change-execution.references.json"
EXPECTED_POLICY_IDS = {
    "ACE-R1",
    "ACE-R2",
    "ACE-R3",
    "ACE-R4",
    "ACE-R5",
    "ACE-S1-START-GATES",
    "ACE-S2-GSD-PROGRESS",
    "ACE-S2-ONE-PHASE-ONE-CHANGE",
    "ACE-S2-OPEN-SPEC-AUTHORITY",
    "ACE-S2-SPEC-CHANGE-REPLAN",
    "ACE-S4-CONTEXT-PARITY",
    "ACE-S4-NO-AUTO-FALLBACK",
    "ACE-S4-RESUME",
    "ACE-S4-SOURCE-PINNED",
    "ACE-S5-OPEN-SPEC-FINAL",
    "ACE-S5-REVALIDATE-ON-DRIFT",
    "ACE-S5-SINGLE-ACTIVE-CLOSE",
}


def _write_registry_json(tmp_path: Path, payload: object) -> tuple[Path, str]:
    repository = tmp_path / "registry-repository"
    target = repository / TRACKED_REGISTRY_PATH
    target.parent.mkdir(parents=True)
    target.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    return repository, TRACKED_REGISTRY_PATH


def _reference_payload(
    *,
    reference_id: str = "ACE-TEST",
    source_path: str = POLICY_PATH,
    heading: str = TARGET_HEADING,
    body_length: int = 80,
    sha256: str = EXPECTED_SHA256,
) -> dict[str, object]:
    return {
        "id": reference_id,
        "source_path": source_path,
        "heading": heading,
        "body_length": body_length,
        "sha256": sha256,
        "historical_provenance": None,
    }


def _registry_payload(*references: dict[str, object]) -> dict[str, object]:
    return {
        "version": "adaptive-policy-references-v1",
        "references": list(references or (_reference_payload(),)),
    }


def test_tracked_registry_has_complete_stable_namespace_and_current_anchors() -> None:
    repository = Path(__file__).parents[1]

    registry_result = read_policy_reference_registry(repository, TRACKED_REGISTRY_PATH)

    assert isinstance(registry_result, Success)
    registry = registry_result.value
    assert registry.version == "adaptive-policy-references-v1"
    assert {reference.id for reference in registry.references} == EXPECTED_POLICY_IDS
    assert tuple(reference.id for reference in registry.references) == tuple(
        sorted(EXPECTED_POLICY_IDS)
    )
    assert {reference.source_path for reference in registry.references} == {
        "docs/agents/workflow.md"
    }
    assert all(
        reference.historical_provenance == "a2eb744"
        for reference in registry.references
    )

    observations = observe_policy_sections(repository, registry)
    assert isinstance(observations, Success)
    validation = validate_policy_references(
        registry,
        observations.value,
        (
            "ACE-S2-OPEN-SPEC-AUTHORITY",
            "ACE-S5-OPEN-SPEC-FINAL",
            "ACE-S4-NO-AUTO-FALLBACK",
        ),
    )
    assert isinstance(validation, Success)
    assert tuple(reference.id for reference in validation.value) == (
        "ACE-S2-OPEN-SPEC-AUTHORITY",
        "ACE-S4-NO-AUTO-FALLBACK",
        "ACE-S5-OPEN-SPEC-FINAL",
    )


def test_tracked_registry_validation_needs_neither_git_nor_template_docs(
    tmp_path: Path,
) -> None:
    source_repository = Path(__file__).parents[1]
    repository = tmp_path / "pruned-repository"
    for relative_path in (TRACKED_REGISTRY_PATH, "docs/agents/workflow.md"):
        target = repository / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source_repository / relative_path, target)

    registry_result = read_policy_reference_registry(repository, TRACKED_REGISTRY_PATH)
    assert isinstance(registry_result, Success)
    observations = observe_policy_sections(repository, registry_result.value)
    assert isinstance(observations, Success)

    result = validate_policy_references(
        registry_result.value,
        observations.value,
        tuple(sorted(EXPECTED_POLICY_IDS)),
    )

    assert isinstance(result, Success)
    assert not (repository / ".git").exists()
    assert not (repository / "docs/template").exists()


@pytest.mark.parametrize(
    ("payload", "code"),
    [
        (
            {
                **_registry_payload(),
                "unknown": True,
            },
            "policy-registry-fields-invalid",
        ),
        (
            {
                "version": 1,
                "references": [_reference_payload()],
            },
            "policy-registry-version-invalid",
        ),
        (
            {
                "version": "future-version",
                "references": [_reference_payload()],
            },
            "policy-registry-version-invalid",
        ),
        (
            _registry_payload(
                {
                    **_reference_payload(),
                    "unknown": True,
                }
            ),
            "policy-reference-fields-invalid",
        ),
        (
            _registry_payload(
                {
                    **_reference_payload(),
                    "body_length": True,
                }
            ),
            "policy-reference-length-invalid",
        ),
    ],
)
def test_registry_rejects_unknown_fields_wrong_types_and_versions(
    tmp_path: Path,
    payload: object,
    code: str,
) -> None:
    repository, registry_path = _write_registry_json(tmp_path, payload)

    result = read_policy_reference_registry(repository, registry_path)

    assert isinstance(result, Failure)
    assert result.issue.code == code


def test_registry_rejects_duplicate_json_keys(tmp_path: Path) -> None:
    repository = tmp_path / "duplicate-key-repository"
    target = repository / TRACKED_REGISTRY_PATH
    target.parent.mkdir(parents=True)
    target.write_text(
        '{"version":"adaptive-policy-references-v1",'
        '"version":"adaptive-policy-references-v1","references":[]}',
        encoding="utf-8",
    )

    result = read_policy_reference_registry(repository, TRACKED_REGISTRY_PATH)

    assert isinstance(result, Failure)
    assert result.issue.code == "policy-registry-json-duplicate-key"


def test_registry_rejects_duplicate_ids_and_aliased_paths(tmp_path: Path) -> None:
    duplicate_repository, duplicate_path = _write_registry_json(
        tmp_path / "duplicate",
        _registry_payload(
            _reference_payload(),
            _reference_payload(),
        ),
    )
    alias_repository, alias_path = _write_registry_json(
        tmp_path / "alias",
        _registry_payload(
            _reference_payload(reference_id="ACE-FIRST", source_path="docs/Café.md"),
            _reference_payload(
                reference_id="ACE-SECOND",
                source_path="docs/Café.md",
            ),
        ),
    )

    duplicate = read_policy_reference_registry(duplicate_repository, duplicate_path)
    alias = read_policy_reference_registry(alias_repository, alias_path)

    assert isinstance(duplicate, Failure)
    assert duplicate.issue.code == "policy-reference-id-duplicate"
    assert isinstance(alias, Failure)
    assert alias.issue.code == "policy-path-alias"


def test_registry_returns_records_in_deterministic_id_order(tmp_path: Path) -> None:
    repository, registry_path = _write_registry_json(
        tmp_path,
        _registry_payload(
            _reference_payload(reference_id="ACE-Z"),
            _reference_payload(reference_id="ACE-A"),
        ),
    )

    result = read_policy_reference_registry(repository, registry_path)

    assert isinstance(result, Success)
    assert tuple(reference.id for reference in result.value.references) == (
        "ACE-A",
        "ACE-Z",
    )


def test_registry_enforces_record_and_byte_limit_plus_one(tmp_path: Path) -> None:
    payload = _registry_payload(
        _reference_payload(reference_id="ACE-A"),
        _reference_payload(reference_id="ACE-B"),
    )
    repository, registry_path = _write_registry_json(tmp_path, payload)
    registry_bytes = (repository / registry_path).read_bytes()

    record_limit = read_policy_reference_registry(
        repository,
        registry_path,
        limits=PolicyReferenceLimits(max_records=1),
    )
    byte_limit = read_policy_reference_registry(
        repository,
        registry_path,
        limits=PolicyReferenceLimits(registry_bytes=len(registry_bytes) - 1),
    )

    assert isinstance(record_limit, Failure)
    assert record_limit.issue.code == "policy-record-limit-exceeded"
    assert isinstance(byte_limit, Failure)
    assert byte_limit.issue.code == "policy-registry-limit-exceeded"


def test_validation_rejects_unknown_missing_and_mismatched_references(
    tmp_path: Path,
) -> None:
    repository, _ = _write_policy(
        tmp_path,
        (FIXTURE_ROOT / "valid-policy.md").read_bytes(),
    )
    registry = _registry()
    observations = observe_policy_sections(repository, registry)
    assert isinstance(observations, Success)
    missing_observations = ()
    wrong_length = PolicyReferenceRegistry(
        registry.version,
        (replace(registry.references[0], body_length=79),),
    )
    wrong_hash = PolicyReferenceRegistry(
        registry.version,
        (replace(registry.references[0], sha256="0" * 64),),
    )

    unknown = validate_policy_references(registry, observations.value, ("ACE-UNKNOWN",))
    missing = validate_policy_references(registry, missing_observations, ("ACE-TEST",))
    length_mismatch = validate_policy_references(
        wrong_length,
        observations.value,
        ("ACE-TEST",),
    )
    hash_mismatch = validate_policy_references(
        wrong_hash,
        observations.value,
        ("ACE-TEST",),
    )

    assert isinstance(unknown, Failure)
    assert unknown.issue.code == "policy-reference-unknown"
    assert isinstance(missing, Failure)
    assert missing.issue.code == "policy-observation-missing"
    assert isinstance(length_mismatch, Failure)
    assert length_mismatch.issue.code == "policy-reference-length-mismatch"
    assert isinstance(hash_mismatch, Failure)
    assert hash_mismatch.issue.code == "policy-reference-hash-mismatch"


@pytest.mark.parametrize("registry", [None, object()])
def test_validation_returns_structured_failure_for_invalid_registry(
    registry: object,
) -> None:
    result = validate_policy_references(
        registry,  # type: ignore[arg-type]
        (),
        (),
    )

    assert isinstance(result, Failure)
    assert result.issue.code == "policy-registry-invalid"
