# Phase 03: Lifecycle Drift Gate - Pattern Map

**Mapped:** 2026-07-27
**Files analyzed:** 6 new/modified files
**Analogs found:** 6 / 6

## Scope

Gap plans 03-04〜03-06 が変更する既存ファイルだけを対象とする。新しい production module、serializer、admission seam は作らない。

変更対象の主要 symbol:

- `lifecycle_drift.py`: `_is_complete_observation`, `classify_canonical_source_drift`
- `lifecycle_gate.py`: `LifecycleGateDecision`, `_valid_limits`, `_validate_phase_nodes`, `_validate_phase_graph`, `_validate_capabilities`, `_capability_changes`, `observe_lifecycle_operation`, `_decision_identity`, `_decision_from_observation`, `_unknown_decision`, `gate_lifecycle_operation`
- `test_handoff_lifecycle_drift.py`: malformed structured payload / nested artifact の public-classifier regressions
- `test_handoff_lifecycle_gate.py`: capability、nested limits、raw graph、DAG、public projection、repository identity、portable evidence regressions
- `expected-lifecycle-evidence.json`: independent literal portable v2 golden
- `03-LIFECYCLE-EVIDENCE.json`: generated tracked portable v2 evidence

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py` | service / domain classifier | transform, request-response | `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_v2.py` exact structured validation; same-file `_unknown`/classifier | role-match |
| `tests/test_handoff_lifecycle_drift.py` | test | transform, request-response | same file `_assert_unknown` and bounded malformed-input tables | exact |
| `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py` | service / admission middleware | request-response, file-I/O | same file validators/projection/identity; `policy_reference.py::_valid_limits` and `_fingerprint_section` | exact |
| `tests/test_handoff_lifecycle_gate.py` | test / evidence producer | request-response, file-I/O, batch transform | same file `FakeBoundary`, incomplete matrix, identity regressions, evidence producer | exact |
| `tests/fixtures/openspec_gsd_handoff/lifecycle/expected-lifecycle-evidence.json` | test fixture / config | batch transform | `.planning/phases/03-lifecycle-drift-gate/03-LIFECYCLE-EVIDENCE.json` | exact |
| `.planning/phases/03-lifecycle-drift-gate/03-LIFECYCLE-EVIDENCE.json` | generated evidence / config | batch, file-I/O | independent expected lifecycle golden plus `_repository_root_lifecycle_evidence` | exact |

## Pattern Assignments

### `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py`

**Role / flow:** pure domain classifier; untrusted structured `Result` input to immutable three-state decision.

**Primary analog:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_v2.py`

**Imports and immutable values** (`lifecycle_drift.py:5-34,45-73`):

```python
import hashlib
from collections import Counter
from dataclasses import dataclass

@dataclass(frozen=True)
class CanonicalSourceObservation:
    artifacts: tuple[CanonicalArtifactObservation, ...]
    progress: Progress
    source_items: SourceIdentityState
    changed_source_item_ids: tuple[str, ...]

@dataclass(frozen=True)
class CanonicalSourceDriftDecision:
    state: DriftState
    issue_code: str | None
    drifted_artifact_paths: tuple[str, ...]
    changed_source_item_ids: tuple[str, ...]
    progress_update_candidate: Progress | None
```

Preserve relative imports, frozen dataclasses, and existing `Result`/`Success`/`Failure` vocabulary. Do not introduce a validation dependency.

**Validation-before-normalization analog** (`manifest_v2.py:323-351,361-398`):

```python
state = _exact_fields(value, {...})
if state is None:
    return None
active_raw = _bounded_sequence(state["active"])
if (
    type(next_requirement_id) is not int
    or active_raw is None
):
    return None

for raw in active_raw:
    item = _exact_fields(raw, {...})
    if item is None:
        return None
    # Only after shape checks: parse and compare nested values.
```

Apply the same order in `_is_complete_observation`:

1. accept `object`;
2. require `CanonicalSourceObservation`;
3. require exact tuple containers;
4. require every tuple member is `CanonicalArtifactObservation`;
5. require exact nested field types;
6. only then run cardinality, sorting, uniqueness, digest, and changed-ID checks.

The closest collection analog rejects noncanonical or duplicate content before returning its normalized tuple (`manifest_v2.py:507-526`):

```python
raw_items = _bounded_sequence(value)
if raw_items is None:
    return None
items: list[str] = []
for raw in raw_items:
    item = _canonical_path(raw) if paths else raw
    if type(item) is not str:
        return None
    items.append(item)
result = tuple(items)
if result != tuple(sorted(set(result), key=lambda item: item.encode("utf-8"))):
    return None
```

Do not use set/sort/cardinality comprehensions until every member field they access is validated.

**Fail-closed error projection** (`lifecycle_drift.py:240-263`):

```python
def _unknown(code: str) -> CanonicalSourceDriftDecision:
    return CanonicalSourceDriftDecision(
        state=DriftState.UNKNOWN,
        issue_code=code,
        drifted_artifact_paths=(),
        changed_source_item_ids=(),
        progress_update_candidate=None,
    )

if isinstance(expected, Failure):
    return _unknown(expected.issue.code)
if isinstance(observed, Failure):
    return _unknown(observed.issue.code)
if not _is_complete_observation(expected.value) or not _is_complete_observation(
    observed.value
):
    return _unknown("canonical-observation-incomplete")
```

Malformed `Success` must converge on the existing unknown constructor. Do not add a parallel sanitizer or broad classifier-level exception handler.

**Pitfalls:**

- Python annotations and frozen dataclasses do not runtime-validate `Success(None)` or malformed nested fields.
- `artifact.kind`, `artifact.path`, and digests must not be dereferenced before member validation.
- Preserve `Failure` issue propagation; only malformed complete-looking values use `canonical-observation-incomplete`.
- Unknown must never retain partial paths, source IDs, or progress.

---

### `tests/test_handoff_lifecycle_drift.py`

**Role / flow:** public-seam fixed examples for pure transform/classification.

**Analog:** same-file `_assert_unknown` and malformed bounded input matrix.

**Test imports and helper convention** (`tests/test_handoff_lifecycle_drift.py:1-32,234-241`):

```python
from typing import Any

import pytest

from ai_coding_template_ja.openspec_gsd_handoff.lifecycle_drift import (
    DriftState,
    classify_canonical_source_drift,
)

def _assert_unknown(expected, observed, code: str) -> None:
    decision = classify_canonical_source_drift(expected, observed)

    assert decision.state is DriftState.UNKNOWN
    assert decision.issue_code == code
    assert decision.drifted_artifact_paths == ()
    assert decision.changed_source_item_ids == ()
    assert decision.progress_update_candidate is None
```

Reuse `_assert_unknown`; new tests should call `classify_canonical_source_drift` directly with malformed `Success` values. Assert stable public output, not `_is_complete_observation`.

**Parameterized malformed-input analog** (`tests/test_handoff_lifecycle_drift.py:311-346`):

```python
@pytest.mark.parametrize(
    ("mutation", "code"),
    [
        ("invalid_utf8", "artifact-utf8-invalid"),
        ("malformed_checkbox", "task-checkbox-malformed"),
        ("missing_tasks_claim", "canonical-artifact-cardinality-invalid"),
        ("duplicate_tasks_claim", "artifact-path-duplicate"),
    ],
)
def test_bounded_malformed_or_incomplete_input_is_unknown(...):
    ...
    _assert_unknown(expected, observed, code)
```

Use small explicit tables for top-level payload side (`expected`/`observed`), invalid artifact member, and invalid nested field. Keep the existing sole Hypothesis family unchanged (`tests/test_handoff_lifecycle_drift.py:443-503`).

**Pitfalls:**

- Do not assert that an exception is expected; the required output is a public unknown decision.
- Do not test private validators.
- Do not add another property family for finite malformed examples.
- Retain complete clean, drifted, and checkbox-only tests as regression backstops.

---

### `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py`

**Role / flow:** sole lifecycle admission service; bounded repository/boundary input to immutable decision and reusable digest.

**Primary analogs:** existing validators, `_IdentityEncoder`, `_decision_from_observation`; `policy_reference.py` for exact positive bounds.

#### Nested bounded input validation

**Exact-positive-integer analog** (`policy_reference.py:105-114`):

```python
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
```

Extend the existing gate pattern (`lifecycle_gate.py:206-219`) to include:

```python
limits.artifact_limits.max_files
limits.artifact_limits.bytes_per_file
limits.artifact_limits.bytes_total
limits.artifact_limits.change_id_bytes
```

Keep `type(value) is int and value > 0`; `isinstance(value, int)` would admit booleans. Container type and all nested values must be checked before `repository_root.resolve`, manifest reads, or boundary calls (`lifecycle_gate.py:479-499`).

#### Raw graph validation before normalization

**Existing shape/bounds pattern** (`lifecycle_gate.py:326-358`):

```python
if type(nodes) is not tuple or len(nodes) > limits.max_phase_nodes:
    return False
if any(not isinstance(node, PhaseNodeObservation) for node in nodes):
    return False
phase_ids = {node.phase_id for node in nodes}
if len(phase_ids) != len(nodes):
    return False
...
if (
    _PHASE_ID.fullmatch(node.phase_id) is None
    or not _canonical_phase_path(node.phase_path, node.phase_id)
    or type(node.depends_on) is not tuple
    or len(node.depends_on) != len(set(node.depends_on))
    or node.phase_id in node.depends_on
    or any(dependency not in phase_ids for dependency in node.depends_on)
):
    return False
```

Before regex, path, `len`, `set`, or UTF-8 access, also require exact runtime types for `phase_id`, `phase_path`, dependency container, and each dependency string. Keep node and edge bounds shared for expected and observed graphs.

**Normalization boundary** (`lifecycle_gate.py:361-369`):

```python
def _normalize_phase_nodes(nodes):
    return tuple(
        sorted(
            (replace(node, depends_on=_utf8_sorted(node.depends_on)) for node in nodes),
            key=lambda node: node.phase_id.encode(),
        )
    )
```

Move this call after `_validate_phase_graph` succeeds for the raw `PhaseGraphObservation`. `_utf8_sorted` uses `set` (`lifecycle_gate.py:202-203`), so using it before raw duplicate checks erases invalid evidence.

#### Bounded DAG checking

No exact DAG validator exists. The closest structural analog is `_validate_phase_nodes`; `_downstream_phases` (`lifecycle_gate.py:696-710`) is only reachability and is explicitly not cycle validation.

Add one iterative helper shared by expected and observed nodes after shape, uniqueness, edge, and byte bounds pass. Use the already bounded node/edge set and return `visited == len(nodes)`:

```python
remaining = {node.phase_id: len(node.depends_on) for node in nodes}
dependents = {phase_id: [] for phase_id in remaining}
for node in nodes:
    for dependency in node.depends_on:
        dependents[dependency].append(node.phase_id)

ready = [phase_id for phase_id, count in remaining.items() if count == 0]
visited = 0
while ready:
    phase_id = ready.pop()
    visited += 1
    for dependent in dependents[phase_id]:
        remaining[dependent] -= 1
        if remaining[dependent] == 0:
            ready.append(dependent)
return visited == len(nodes)
```

Do not use recursive DFS without a depth bound. Cycles are incomplete observation (`lifecycle-phase-observation-incomplete`), not ordinary drift.

#### Capability completeness and comparison

**Current validation/comparison split** (`lifecycle_gate.py:410-455,652-693`):

```python
if (
    not isinstance(capabilities.host, HostCapabilityInput)
    or type(capabilities.host.inspected) is not bool
):
    return False

fields = (
    ("openspec.version", ...),
    ...
    ("host.dispatch", expected.host.dispatch, observed.host.dispatch),
)
```

For observed completeness require `capabilities.host.inspected is True`; also add `host.inspected` to the explicit comparison tuple. Keep incomplete current evidence unknown and a complete expected/observed mismatch drifted.

#### Immutable public decision projection

**Frozen decision pattern** (`lifecycle_gate.py:142-158`):

```python
@dataclass(frozen=True)
class LifecycleGateDecision:
    operation: LifecycleOperation | None
    ...
    changed_source_item_ids: tuple[str, ...]
    ...
    decision_identity: str | None
```

Add `drifted_artifact_paths: tuple[str, ...]` and `progress_update_candidate: Progress | None`; import `Progress` from `.models`.

**Copy-without-reclassification pattern** (`lifecycle_gate.py:1002-1069`):

```python
source = observation.source_decision
...
decision = LifecycleGateDecision(
    ...
    changed_source_item_ids=_utf8_sorted(
        observation.source_decision.changed_source_item_ids
    ),
    ...
)
```

Project paths/progress from `observation.source_decision`; do not re-read canonical bytes, re-run classification, or synthesize `Progress`. Unknown construction (`lifecycle_gate.py:1076-1098`) must set `()` / `None`, alongside no identity/remediation.

#### Repository-bound digest identity

**Typed length-prefix analog** (`lifecycle_gate.py:742-768` and `policy_reference.py:240-254`):

```python
for component in (encoded_tag, encoded_value):
    self._buffer.extend(len(component).to_bytes(8, "big"))
    self._buffer.extend(component)

def digest(self) -> str:
    return hashlib.sha256(self._buffer).hexdigest()
```

Keep `lifecycle-gate-decision-v1`; add the validated value at the source-commit domain (`lifecycle_gate.py:932-939`):

```python
encoder.add("source_commit.repository_root", commit.repository_root)
encoder.add("source_commit.change_id", commit.change_id)
encoder.add("source_commit.commit", commit.source_commit)
```

Also bind both new public decision fields in the decision domain (`lifecycle_gate.py:979-991`). Use `_encode_progress` for a non-null candidate and an explicit `None` tag otherwise.

Retain exact lowercase 64-hex validation and constant-time prior comparison (`lifecycle_gate.py:1130-1147`):

```python
if re.fullmatch(r"[0-9a-f]{64}", prior_decision_identity) is None:
    return _unknown_decision(...)
if hmac.compare_digest(prior_decision_identity, decision.decision_identity):
    return decision
return replace(decision, state=LifecycleGateState.DRIFTED, admitted=False, ...)
```

**Pitfalls:**

- Do not normalize duplicate graph evidence before validity is known.
- Do not treat a finite `_downstream_phases` traversal as proof of acyclicity.
- Do not coerce nested limits or catch downstream `TypeError` as validation.
- Do not treat `host.inspected=False` as complete merely because its type is bool.
- Do not compute public path/progress evidence a second time.
- Bind the resolved/validated repository root, not a caller spelling or a portable placeholder.
- Keep admission identity and reviewer evidence as separate representations.

---

### `tests/test_handoff_lifecycle_gate.py`

**Role / flow:** public-gate examples, bounded fake boundary, identity relations, and deterministic evidence producer.

**Analog:** existing `FakeBoundary`, incomplete table, identity tests, `_decision_view`, `_compact_json`, `_repository_root_lifecycle_evidence`.

**Fixture and boundary pattern** (`tests/test_handoff_lifecycle_gate.py:320-467`):

```python
def _phase_nodes() -> tuple[PhaseNodeObservation, ...]:
    return (
        PhaseNodeObservation("03", "...", ()),
        PhaseNodeObservation("04", "...", ("03",)),
        ...
    )

class FakeBoundary(LifecycleObservationBoundary):
    ...
    self.source_calls = 0
    self.phase_calls = 0
    self.capability_calls = 0
```

Reuse `_fixture`, `replace`, `_phase_nodes`, and `FakeBoundary`. For invalid nested limits, assert all three counters remain zero. For graph cases, vary expected and observed independently at the public `gate_lifecycle_operation` seam.

**Wholly-unknown assertion pattern** (`tests/test_handoff_lifecycle_gate.py:1185-1247`):

```python
decision = gate_lifecycle_operation(...)

assert decision.state is LifecycleGateState.UNKNOWN
assert not decision.admitted
assert decision.changed_source_item_ids == ()
assert decision.revalidation_targets == ()
assert decision.replanning_targets == ()
assert decision.next_action_codes == ()
assert decision.decision_identity is None
```

Extend this invariant with `drifted_artifact_paths == ()` and `progress_update_candidate is None` for every new malformed/cyclic case.

**Exact remediation projection analog** (`tests/test_handoff_lifecycle_gate.py:1095-1127`):

```python
assert decision.state is LifecycleGateState.DRIFTED
assert not decision.admitted
assert decision.changed_source_item_ids == ("SCN-000004",)
assert decision.revalidation_targets == (
    "phase-path:.planning/phases/03-lifecycle-drift-gate",
)
```

Add the exact changed artifact path here. Add a separate checkbox-only public decision assertion using the existing `_checkbox_only_progress_evidence` flow (`tests/test_handoff_lifecycle_gate.py:705-817`).

**Same-root and stale analogs** (`tests/test_handoff_lifecycle_gate.py:1503-1556`):

```python
repeated = gate_lifecycle_operation(
    repository,
    ...,
    prior_decision_identity=current.decision_identity,
)
assert repeated.state is LifecycleGateState.CLEAN
assert repeated.decision_identity == current.decision_identity

stale = gate_lifecycle_operation(
    repository,
    ...,
    prior_decision_identity=previous.decision_identity,
)
assert stale.state is LifecycleGateState.DRIFTED
assert not stale.admitted
assert "lifecycle-decision-stale" in stale.issue_codes
```

Extend this relation style to two byte-identical `_fixture` repositories:

- same resolved root, repeated observation: identity stable;
- distinct resolved roots: identities differ and both match `[0-9a-f]{64}`;
- root A prior supplied to root B: stale, drifted, not admitted.

Replace the fixed digest literal test (`tests/test_handoff_lifecycle_gate.py:1343-1364`); repository-bound digests are intentionally temporary-root-dependent.

**Portable serialization analog** (`tests/test_handoff_lifecycle_gate.py:563-610`):

```python
def _decision_view(decision: LifecycleGateDecision) -> dict[str, object]:
    return {
        "state": decision.state.value,
        "admitted": decision.admitted,
        ...
    }

def _compact_json(value: object) -> bytes:
    return (
        json.dumps(
            value,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
        + b"\n"
    )
```

Add public `drifted_artifact_paths` and serialized `progress_update_candidate`. Remove raw `decision_identity` and `prior_decision_identity`; if needed, emit only a boolean such as `decision_identity_present`.

**Evidence producer/golden pattern** (`tests/test_handoff_lifecycle_gate.py:959-1055`):

```python
first = _repository_root_lifecycle_evidence(REPOSITORY_ROOT, tmp_path / "first")
second = _repository_root_lifecycle_evidence(REPOSITORY_ROOT, tmp_path / "second")
tracked = (REPOSITORY_ROOT / TRACKED_EVIDENCE_PATH).read_bytes()
independent_golden = (REPOSITORY_ROOT / EXPECTED_EVIDENCE_PATH).read_bytes()

assert first == second == tracked
assert json.loads(first) == json.loads(independent_golden)
assert evidence["mutation_operations"] == []
assert all(item["unchanged"] for item in evidence["protected_inputs"])
```

Bump to `lifecycle-evidence-v2` / `repository-portable-lifecycle-evidence-v2`. Compute repository identities transiently, then serialize only:

```python
"repository_identity_relations": {
    "same_root_identity_stable": True,
    "cross_root_identities_distinct": True,
    "foreign_root_prior_identity_rejected": True,
}
```

The last value is true only if root B reports `lifecycle-decision-stale`, `DRIFTED`, and `admitted=False`. Run the producer from two different temporary-root layouts and require identical bytes.

**Pitfalls:**

- Tests must remain at the public classifier/gate seam; do not call private validators or reproduce `_IdentityEncoder`.
- Expected identity must be expressed as shape/relations, never a root-dependent literal.
- Do not serialize repository paths, current identity, or prior identity into portable evidence.
- Preserve protected-input hashes, empty staging paths, and `mutation_operations=[]`.
- Keep the one existing `OPERATION_CASES` table; do not create another operation matrix.

---

### `tests/fixtures/openspec_gsd_handoff/lifecycle/expected-lifecycle-evidence.json`

**Role / flow:** independently authored literal golden for batch evidence comparison.

**Analog:** tracked `03-LIFECYCLE-EVIDENCE.json`; current files have identical bytes and SHA-256 before v2 repinning.

Follow the key ordering produced by `_compact_json` (`sort_keys=True`), but maintain this fixture as an independent literal. Required v2 changes:

- `schema_version = "lifecycle-evidence-v2"`
- `producer_version = "repository-portable-lifecycle-evidence-v2"`
- every decision row contains `drifted_artifact_paths` and `progress_update_candidate`;
- unknown rows use `[]` and `null`;
- no `decision_identity`, `prior_decision_identity`, or repository-root value;
- all three `repository_identity_relations` booleans are present and true.

Do not derive the golden by importing or copying private production identity logic.

---

### `.planning/phases/03-lifecycle-drift-gate/03-LIFECYCLE-EVIDENCE.json`

**Role / flow:** generated, source-pinned, read-only reviewer evidence.

**Analog:** test-side `_repository_root_lifecycle_evidence` plus independent golden.

Preserve current top-level families:

- versioned schema/producer;
- `source_authority`;
- five-operation coverage;
- clean, canonical drift, unknown, checkbox-only, and stale outcomes;
- protected-input before/after hashes;
- empty staging paths and mutation operations.

Regenerate only after 03-04 and 03-05 behavioral regressions are green. The tracked record must be byte-equal across different temporary-root layouts and semantically equal to the independent literal golden.

## Shared Patterns

### 1. Ordered trust boundary

Apply to both production files:

```text
untrusted object
  -> exact container/member/field validation
  -> uniqueness/bounds/DAG validation
  -> canonical normalization
  -> comparison and immutable projection
  -> versioned repository-bound identity
  -> constant-time prior identity check
```

Any incomplete step returns existing unknown issue codes with no identity or partial remediation.

### 2. Exact types, not coercion

Sources:

- `policy_reference.py:105-114`
- `manifest_v2.py:323-351,507-526`
- `lifecycle_gate.py:206-219,326-358`

Use exact tuple/string/integer checks where `bool`, subclass, or coercion would alter the contract. Validate member type before regex, path, encoding, `len`, sorting, or set operations.

### 3. Frozen public decisions with empty unknown projection

Sources:

- `lifecycle_drift.py:45-73,240-247`
- `lifecycle_gate.py:142-158,1076-1098`

Complete lower-level evidence is copied into the public frozen decision. Unknown is always `admitted=False`, identity `None`, empty tuples, and nullable evidence `None`.

### 4. Typed versioned hashes

Sources:

- `lifecycle_gate.py:742-768,900-991`
- `policy_reference.py:240-254`

Use length-prefixed typed fields and SHA-256. Add a stable exact tag for every admission-relevant field; do not switch to `repr`, unordered JSON, salt, timestamp, or random input.

### 5. Portable evidence proves relations, not secret/runtime values

Sources:

- `tests/test_handoff_lifecycle_gate.py:563-610,959-1055`
- `tests/test_handoff_manifest_refresh.py:91-98`

Serialize deterministic public values with compact UTF-8 JSON and trailing newline. Runtime identities may be used inside the producer to calculate booleans, but must not cross into tracked/golden JSON.

## No Exact Analog Found

| Concern | Role | Data Flow | Closest Partial Analog | Planner Guidance |
|---|---|---|---|---|
| iterative DAG validity | utility inside admission service | transform | `_validate_phase_nodes` bounds plus `_downstream_phases` traversal | Add one local bounded Kahn-style helper; do not copy `_downstream_phases` as a validator. |
| repository identity relation evidence | test/evidence producer | batch, file-I/O | existing same-root/stale tests and `_repository_root_lifecycle_evidence` | Compute transient identities through the public gate and serialize only fixed relation booleans. |

## Planner Pitfall Checklist

- Validation must precede all normalization and nested attribute access.
- Exact `type(value) is int` is required to reject booleans.
- Both expected and observed phase graphs receive identical raw validation and DAG checks.
- Cycles are unknown/incomplete, not drift.
- `host.inspected=False` is incomplete even though it is type-valid.
- New public fields are copied, included in decision identity, and empty/null for every unknown path.
- Repository real path is bound only in runtime identity.
- Root-dependent digests and raw paths never enter portable JSON.
- Existing public seams, issue codes, operation matrix, and single Hypothesis family remain intact.
- Evidence files are repinned only after all behavioral gap tests pass.

## Metadata

**Analog search scope:** `src/ai_coding_template_ja/openspec_gsd_handoff/`, `tests/test_handoff_*.py`, lifecycle fixture/evidence files
**Primary analogs read:** `lifecycle_drift.py`, `lifecycle_gate.py`, both lifecycle test files, `manifest_v2.py`, `policy_reference.py`, `manifest_refresh.py`, manifest refresh/migration test helpers, lifecycle golden/tracked evidence
**Pattern extraction date:** 2026-07-27
