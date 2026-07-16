# Phase 1: Stable Identity and Migration - Pattern Map

**Mapped:** 2026-07-17
**Authority:** `2cbb127917feaa637ef5eac439478227ac5f717b`
**Files analyzed:** 9 proposed source/test/fixture artifacts
**Analogs found:** 9 / 9 (four use composite analogs)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py` | utility + domain core | bounded file-I/O, then deterministic transform | `reader.py` + `progress.py` + `models.py` | composite role/data-flow match |
| `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_v2.py` | immutable model + exact codec | transform | `manifest.py` | exact role match |
| `src/ai_coding_template_ja/openspec_gsd_handoff/versioned_manifest.py` | dispatch facade | bounded file-I/O + transform | `manifest.py::read_manifest_file` / `parse_manifest_bytes` | role match |
| `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py` | application service + filesystem adapter | request-response + file-I/O | `manifest.py::ManifestRepository` | exact data-flow match, stronger post-failure contract required |
| `tests/test_handoff_identity.py` | public-seam unit/property test | transform + isolated file-I/O | `tests/test_handoff_core.py` | exact test-style match |
| `tests/test_handoff_manifest_v2.py` | codec unit/property test | transform | `tests/test_handoff_manifest.py` | exact test-style match |
| `tests/test_handoff_migration.py` | filesystem integration/fault test | file-I/O | `tests/test_handoff_manifest.py` | exact test-style match |
| `tests/fixtures/openspec_gsd_handoff/identity/` | independent input fixture set | file-I/O input | `tests/fixtures/openspec_gsd_handoff/openspec/` | role match |
| `tests/fixtures/openspec_gsd_handoff/manifest/expected-migrated-v2.json` | independent golden bytes | file-I/O input/output | `expected-prepared.json` | exact role match |

## Pattern Assignments

### `source_identity.py` (utility/domain core, bounded file-I/O then transform)

**Primary analogs:**

- `src/ai_coding_template_ja/openspec_gsd_handoff/reader.py`
- `src/ai_coding_template_ja/openspec_gsd_handoff/progress.py`
- `src/ai_coding_template_ja/openspec_gsd_handoff/models.py`

**Imports and immutable value pattern** (`models.py:115-140`):

```python
@dataclass(frozen=True)
class ClassifiedIssue:
    category: IssueCategory
    code: str
    known_state: KnownState


@dataclass(frozen=True)
class Success[T]:
    value: T
    route: InputRoute | None = None


@dataclass(frozen=True)
class Failure:
    issue: ClassifiedIssue
    route: InputRoute | None = None


type Result[T] = Success[T] | Failure
```

Define source item, tombstone, inventory, reconciliation preview, and collision evidence as
`@dataclass(frozen=True)` values. Return one complete `Success` or one classified `Failure`;
do not return a partial inventory or partial allocation.

**Strict deterministic parser pattern** (`progress.py:44-89`):

```python
def parse_task_progress(markdown: str, *, max_tasks: int = MAX_TASKS) -> Result[Progress]:
    tasks: list[NormalizedTask] = []
    for line in markdown.splitlines():
        ...
        if len(tasks) == max_tasks:
            return _failure("tasks-limit-exceeded")
        tasks.append(...)

    if not tasks:
        return _failure("tasks-empty")
    return Success(Progress(..., tasks=tuple(tasks)))
```

Copy the functional-core shape, not `splitlines()` itself: the Phase-1 contract explicitly
requires literal CRLF/CR-to-LF conversion followed by `split("\n")`. Validate the whole source
inventory before returning it, cap source items at 4096, and keep source ordering out of allocator
semantics.

**Contained bounded-read pattern** (`reader.py:102-185`):

```python
repository = repository_root.resolve(strict=True)
...
symlink = _contains_symlink(repository, logical_path)
if symlink:
    return _failure("artifact-path-symlink")
resolved = logical_path.resolve(strict=True)
if not resolved.is_relative_to(repository):
    return _failure("artifact-path-outside-change")
...
with resolved.open("rb") as stream:
    content_bytes = stream.read(limits.bytes_per_file + 1)
if len(content_bytes) > limits.bytes_per_file:
    return _failure("artifact-file-limit-exceeded")
content = content_bytes.decode("utf-8")
```

Reuse the order of checks: lexical canonical-path validation, component symlink rejection,
resolved containment, limit-plus-one read, then strict UTF-8 decode. Compute raw heading,
normalized identity, and fingerprint from the same bounded byte observation.

**Path/symlink check pattern** (`reader.py:57-99`, `reader.py:130-156`):

- Compare path segments, not string prefixes.
- Track both logical and resolved paths to reject aliases.
- Walk existing components with `lstat()` and reject symlinks before reading.
- Fail closed when containment or component state cannot be proved.

The new code must additionally supply the canonical contract's NFC segment normalization and
platform case/Unicode alias collision check; no existing module implements that complete rule.

**Core transformation shape:**

1. Read each canonical spec artifact once with a limit-plus-one reader.
2. Strictly decode and normalize LF/NFC without erasing `raw_heading`.
3. Scan only supported ATX requirement/scenario headings while tracking fenced-code state.
4. Build normalized identity tuples.
5. Reconcile requirements first, then scenarios using resolved requirement IDs.
6. Allocate missing IDs in canonical identity order.
7. Return a complete immutable result including active items, tombstones, counters, and preview
   evidence.

**Error handling:**

Use stable machine codes through `Failure(ClassifiedIssue(...))`. Ambiguous Markdown, unclosed
fences, identity collisions, explicit-match ambiguity, path aliases, counter exhaustion, and
bounded-read uncertainty are whole-operation failures. Do not add heuristic matching or repair.

---

### `manifest_v2.py` (immutable model + exact codec, transform)

**Analog:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest.py`

**Exact object validation pattern** (`manifest.py:158-161`, `manifest.py:339-382`):

```python
def _exact_fields(value: object, fields: set[str]) -> Mapping[object, object] | None:
    if not isinstance(value, Mapping) or set(value) != fields:
        return None
    return value


root = _exact_fields(raw, _ROOT_FIELDS)
if root is None:
    return _failure("manifest-fields-invalid")
if root["schema_version"] != 1 or type(root["schema_version"]) is not int:
    return _failure("manifest-schema-unsupported")
```

Use exact field sets at every v2 object level. Prefer `type(value) is int` / `type(value) is bool`
where booleans must not pass integer validation. Reject unknown fields before constructing frozen
values.

**Immutable aggregate pattern** (`manifest.py:50-99`):

```python
@dataclass(frozen=True)
class ManifestArtifact:
    kind: str
    path: str
    sha256: str


@dataclass(frozen=True)
class HandoffManifest:
    schema_version: int
    change_id: str
    ...
```

Keep v2 as a separate aggregate rather than optional fields on `HandoffManifest`. Nested source
items, tombstones, mappings, ownership declarations, lifecycle references, and their enums should
be frozen concrete types.

**Canonical serializer pattern** (`manifest.py:389-468`):

```python
data = ("\n".join(lines) + "\n").encode()
parsed = parse_manifest_bytes(data)
if isinstance(parsed, Failure) or parsed.value != manifest:
    return _failure("manifest-serialization-invalid")
return Success(data)
```

Produce deterministic UTF-8 bytes with fixed root/nested field order and exactly one final
newline. Reparse the emitted bytes using the complete v2 parser and require value equality before
returning success. Sort only collections whose canonical order is specified; do not hide invalid
caller ordering by silently repairing it.

**Bounds/invariant pattern** (`manifest.py:164-282`):

- Reject `str`/`bytes` where a sequence is expected.
- Validate collection bounds before iterating.
- Validate dependent counts and references after element construction.
- Use tuples in persisted values.
- Validate aggregate UTF-8/file size without truncation.

The v2 parser must additionally enforce namespaced IDs, category counters and sentinel,
active/tombstone global uniqueness, parent rules, exact 11 root fields, collection limits, and
empty Phase-1 placeholders for mappings/ownership/lifecycle.

---

### `versioned_manifest.py` (bounded version-dispatch facade)

**Analogs:** `manifest.py:339-382`, `manifest.py:471-522`

**Bounded reader pattern:**

```python
def read_bounded_bytes(self, path: Path, *, limit: int = MAX_MANIFEST_BYTES) -> bytes:
    with path.open("rb") as stream:
        data = stream.read(limit + 1)
    if len(data) > limit:
        raise ManifestSizeLimitExceeded
    return data


def read_manifest_file(path: Path, *, operations: ManifestFileOperations | None = None):
    ...
    data = filesystem.read_bounded_bytes(path)
    return parse_manifest_bytes(data)
```

Read once with the shared 8 MiB envelope, inspect only enough JSON to choose the version, then
run the selected exact full parser on the same bytes. The dispatch probe is never a success value
by itself.

**Dispatch result shape:**

- `schema_version == 1`: call the unchanged `parse_manifest_bytes`.
- `schema_version == 2`: call the exact v2 parser.
- unknown/malformed version: structured fail-closed result.
- a caller-requested version below the disk version: reject as downgrade without mutation.

Do not broaden the existing v1 parser or change the three MVP root public exports.

---

### `manifest_migration.py` (application service + filesystem adapter)

**Analog:** `manifest.py::ManifestRepository` (`manifest.py:537-712`)

**Injectable filesystem seam** (`manifest.py:471-503`):

```python
class ManifestFileOperations:
    def read_bounded_bytes(...): ...
    def create_staging(self, parent: Path) -> Path: ...
    def write_bytes(self, path: Path, data: bytes) -> None: ...
    def replace(self, source: Path, target: Path) -> None:
        os.replace(source, target)
    def unlink(self, path: Path) -> None: ...
```

Use a small operations adapter so tests can inject create/write/reread/replace/cleanup failures
without mocking private helpers. Extend or compose the seam only for behavior migration actually
needs, including the post-replace-failure target reread.

**Failure evidence pattern** (`manifest.py:101-145`):

```python
@dataclass(frozen=True)
class ManifestPersistenceIssue:
    code: str
    failure_point: FailurePoint
    target_state: KnownState
    staging_state: StagingKnownState
    cleanup_outcome: CleanupOutcome
```

Retain separate dimensions for failure point, known target state, staging state, and one cleanup
attempt. Migration needs a stronger target-state enum/evidence than MVP persistence: after replace
failure, report v1-preserved only when a bounded reread exactly matches the preview's old-byte
hash; otherwise report unknown.

**Stage/validate/replace pattern** (`manifest.py:677-712`):

```python
staging = self.operations.create_staging(self.target.parent)
self.operations.write_bytes(staging, serialized.value)
staged = parse_manifest_bytes(self.operations.read_bounded_bytes(staging))
if isinstance(staged, Failure) or staged.value != manifest:
    return self._failure(...)
self.operations.replace(staging, self.target)
```

Copy the ordering, but bind it to the approved preview:

1. require explicit approval for the exact preview identity;
2. bounded-reread target and compare exact v1 bytes/hash;
3. stage the exact frozen candidate in the target directory;
4. bounded-reread and strict-v2-parse staged bytes;
5. compare bytes and value with the preview;
6. call `os.replace`;
7. on failure, reread target and classify evidence;
8. make one best-effort staging cleanup attempt.

Do not call `ManifestRepository.persist` for v2, automatically restore old bytes, migrate the
tracked historical manifest, retry, downgrade, or infer success.

**Static path guard pattern** (`manifest.py:582-610`):

Validate the exact `.planning/openspec/<change-id>/handoff.json` tail, walk parent components with
`lstat`, reject target symlinks, resolve the parent, and prove repository containment before the
first mutation.

---

### `tests/test_handoff_identity.py` (public-seam examples + allocator property)

**Analog:** `tests/test_handoff_core.py`

**Hypothesis convention** (`test_handoff_core.py:118-137`):

```python
@given(
    st.lists(
        st.tuples(
            st.booleans(), st.text(min_size=1).filter(lambda text: "\n" not in text)
        ),
        min_size=1,
        max_size=30,
    )
)
def test_progress_parse_is_deterministic_and_idempotent(examples):
    ...
    assert first == second
```

Use one bounded strategy family for allocator invariants. Assert mapping equality under
permutation, monotonic counters, no ID reuse, tombstone preservation, and sentinel refusal.
Do not reproduce the allocator algorithm in assertions.

**Filesystem/public seam convention** (`test_handoff_core.py:160-185`, `188-249`):

- Build isolated source trees under `tmp_path`.
- Call the public inventory/allocation seam.
- Assert structured `Success`/`Failure`, exact machine code, and immutable values.
- Include fixed fixtures for invalid UTF-8, CR/LF, NFC equivalence, exact heading whitespace,
  fences, duplicate identity, escape, symlink, case/Unicode alias, and bounded input.

The normalizer is fixed-example evidence in Phase 1; do not add a broad normalizer property here.

---

### `tests/test_handoff_manifest_v2.py` (golden codec examples + round-trip property)

**Analog:** `tests/test_handoff_manifest.py`

**Independent golden fixture pattern** (`test_handoff_manifest.py:39-47`, `106-114`):

```python
EXPECTED = (... / "manifest" / "expected-prepared.json").read_bytes()

parsed = parse_manifest_bytes(EXPECTED)
first = serialize_manifest(parsed.value)
second = serialize_manifest(parsed.value)
assert first.value == second.value == EXPECTED
```

Use a hand-reviewed `expected-migrated-v2.json`; never generate expected bytes with the serializer
under test. Retain exact deterministic-byte assertions.

**Exact rejection examples** (`test_handoff_manifest.py:149-160`, `207-267`):

Mutate one field at a time for unknown fields, wrong schema, malformed IDs/counters/parents,
active/tombstone duplicates, wrong ordering, collection/file bounds, and invalid placeholder
shapes. Assert the stable failure code.

**Property boundary:**

Generate valid complete v2 values only, serialize then parse, and assert value/byte round trip.
Keep source parsing and filesystem persistence out of this property.

---

### `tests/test_handoff_migration.py` (isolated filesystem integration + faults)

**Analog:** `tests/test_handoff_manifest.py`

**Fault adapter pattern** (`test_handoff_manifest.py:321-344`):

```python
class _FaultOperations(ManifestFileOperations):
    def read_bounded_bytes(...):
        data = super().read_bounded_bytes(path, limit=limit)
        if self.fault == "validation" and path.suffix == ".tmp":
            return b"{}"
        return data

    def replace(self, source: Path, target: Path) -> None:
        if self.fault in {"replace", "cleanup"}:
            raise OSError("injected replace failure")
        super().replace(source, target)
```

Use explicit adapter branches for staging creation, write, reread, validation, replace with
unchanged target, replace with changed/unreadable target, and cleanup failure. Avoid patching
private functions.

**No-mutation and evidence assertions** (`test_handoff_manifest.py:421-470`):

```python
before = target.read_bytes()
result = repository.persist(...)
assert isinstance(result, ManifestPersistenceFailure)
assert result.issue.failure_point is point
assert result.issue.staging_state is staging
assert result.issue.cleanup_outcome is cleanup
assert target.read_bytes() == before
```

For each pre-replace failure, assert byte-for-byte v1 preservation. For replace failure, assert
`v1-preserved` only after exact old-hash reread; changed, unreadable, or oversized target must be
`unknown`. Also assert preview creates no `.planning` mutation and stale approval/target hash
stops before staging.

**Public approval seam pattern** (`test_handoff_cli.py:219-233`):

Call the module-level preview/apply operations, reject anything other than literal approval, and
count writes/replaces through the injected adapter. Do not add a root CLI verb because the
canonical Phase-1 contract does not pin one.

---

### Identity and v2 golden fixtures

**Analogs:**

- `tests/fixtures/openspec_gsd_handoff/openspec/` for independent positive/negative input files.
- `tests/fixtures/openspec_gsd_handoff/manifest/expected-prepared.json:1-57` for fixed indentation,
  field order, UTF-8, and one final newline.

Keep fixture expectations literal and reviewable. The identity fixture directory should separate
positive source trees from malformed/ambiguous cases rather than building every Markdown edge in
test code. The v2 golden fixture must use exact 11 root fields and Phase-1-valid empty
mapping/ownership/lifecycle placeholders.

## Shared Patterns

### Whole-operation structured results

**Source:** `models.py:115-140`
**Apply to:** all four new source modules.

- Immutable success/failure values.
- Stable category/code, no display prose in the domain result.
- No partial success attached to a failure.
- Caller-facing route/state evidence kept separate from payload values.

### Exact validation before construction

**Source:** `manifest.py:158-382`
**Apply to:** v2 codec, version dispatch, migration preview input.

- Exact field sets at every object boundary.
- Explicit primitive type checks.
- Bounded sequences with dependent invariant validation.
- Unknown schema and downgrade fail closed.

### Canonical JSON

**Source:** `manifest.py:385-468`
**Apply to:** schema-v2 candidate and golden fixture.

- Fixed field ordering and deterministic collection order.
- `ensure_ascii=False`.
- One final newline.
- Serialize, strict-reparse, compare complete immutable value.

### Containment and bounded reads

**Source:** `reader.py:57-185`, `manifest.py:471-522`, `manifest.py:582-610`
**Apply to:** source inventory, versioned manifest reader, migration target/staging.

- Segment-aware lexical validation.
- `lstat` symlink rejection before following paths.
- Resolved repository containment.
- limit-plus-one reads with no prefix success.
- strict UTF-8 where text is required.

### Atomic persistence and evidence

**Source:** `manifest.py:537-712`
**Apply to:** migration apply only.

- Injectable narrow filesystem adapter.
- State guard before mutation.
- Same-directory staging.
- Closed staged reread and exact parse/value check.
- `os.replace`.
- One cleanup attempt with explicit outcome.

Migration deliberately strengthens only the replace-failure branch by rereading the target and
proving old-byte preservation; it must not weaken or modify MVP behavior.

### Public-seam TDD

**Source:** `tests/test_handoff_core.py`, `tests/test_handoff_manifest.py`,
`tests/test_handoff_cli.py:170-233`

- One fixed public behavior per example test.
- RED/GREEN through module/public operation seams, not private helpers.
- Hypothesis only for allocator and manifest round trip in this phase.
- Independent golden literals/fixtures.
- Filesystem faults through adapters and `tmp_path`.
- Existing v1/CLI regressions run after each plan slice.

## Missing Complete Analogs

The repository has no complete existing implementation for these subpatterns. The planner should
use the source-pinned canonical contract and `01-RESEARCH.md`, while retaining the shared result
and test conventions above:

| Subpattern | Why no complete analog exists |
|---|---|
| Fenced ATX requirement/scenario block scanner with exact LF/NFC/horizontal-whitespace rules | Existing `progress.py` is a simpler line parser and uses broader `splitlines()`/`strip()` conveniences that are forbidden for this wire contract. |
| Versioned length-prefixed identity fingerprint | Existing SHA-256 uses raw bounded artifact bytes and has no framed multi-component format. |
| Category-specific monotonic namespaced allocator with tombstones and explicit unique matches | MVP has only sequential task display IDs and no durable source identity. |
| Platform case plus Unicode path alias collision detection | Existing readers reject lexical/resolved duplicates and symlinks but do not implement this combined alias contract. |
| Replace-failure target reread proving v1 preservation | MVP reports the pre-operation target state; migration requires stronger post-failure evidence. |
| Exact schema-version dispatch preserving the unchanged v1 parser | MVP supports schema v1 only. |

## Planner Guardrails

- Keep `manifest.py` and the three existing root exports behaviorally unchanged.
- Keep identity core, v2 codec, version dispatch, and migration persistence as separate reversible
  modules; do not grow another monolith.
- Do not mutate the tracked historical handoff manifest/brief in Phase 1.
- Do not pull mapping readiness, policy record creation, drift, ownership graph, recovery, or
  finalize behavior into this phase.
- Do not add automatic repair, route switch, rollback, downgrade, retry, or heuristic matching.
- Do not make normal tests invoke OpenSpec, GSD, Node, Git history, network, or user config.

## Metadata

**Analog search scope:** `src/ai_coding_template_ja/openspec_gsd_handoff/`,
`tests/test_handoff_*.py`, `tests/fixtures/openspec_gsd_handoff/`, `pyproject.toml`
**Strong analogs retained:** 5 source/test families
**Pattern extraction date:** 2026-07-17
