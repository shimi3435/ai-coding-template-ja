# Phase 1: Stable Identity and Migration - Research

**Researched:** 2026-07-17
**Domain:** source-pinned Markdown identity, exact JSON schema migration, atomic local persistence
**Confidence:** HIGH
**Authority:** `2cbb127917feaa637ef5eac439478227ac5f717b`

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

OpenSpec change `harden-openspec-gsd-handoff-lifecycle` の pinned canonical artifacts を参照し、
後続 phases が利用できる stable source identity と manifest v1→v2 migration の基盤だけを実装・検証する。
source-to-phase mapping、drift、ownership、recovery、finalize は後続 phases の範囲とする。

No additional requirements — canonical OpenSpec artifacts and source commit
`2cbb127917feaa637ef5eac439478227ac5f717b` are authoritative.

The old started handoff manifest and brief are unchanged historical / stale audit
evidence. Phase 1 must be replanned against the current source pin. Phases 2–6 stay
blocked until Phase 1 is verified, and no Phase 7 is added.

### the agent's Discretion

- 可逆な内部モジュール分割、型配置、fixture 構成は既存 package と test conventions に従って決めてよい。
- 外部動作、schema 契約、migration failure semantics、stable identity semantics は canonical OpenSpec
  `HARD-R1` を変更・再定義せず、その public seams から実装する。
- Phase 1 では allocator と manifest round-trip だけを property test 候補とし、それ以外は固定例または
  filesystem integration test を使う。

### Deferred Ideas (OUT OF SCOPE)

- Phase 2: source-to-phase / plan / evidence mapping
- Phase 3: lifecycle drift gate
- Phase 4: repository-wide ownership
- Phase 5: recovery and resume
- Phase 6: finalize preview and receipt
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HND-01 | Stable identity and migration coverage pointer to canonical `HARD-R1` | Exact v1/v2 codec boundary, source inventory/normalizer, allocator, read-only migration preview, approval-bound persistence, and focused test map below. `[VERIFIED: .planning/REQUIREMENTS.md; canonical design/spec at 2cbb127]` |
</phase_requirements>

## Summary

Phase 1 should add a versioned manifest facade beside the existing v1 implementation, not turn
the v1 dataclass into a partly optional v2 value. The current `manifest.py` is a 712-line v1
codec plus persistence implementation; it rejects schema v2 and its only mutation transitions
are absent→prepared and prepared→started. Those behaviors are dependency contracts and should
remain regression-tested without semantic broadening. `[VERIFIED: src/ai_coding_template_ja/openspec_gsd_handoff/manifest.py; tests/test_handoff_manifest.py]`

The new path should be: bounded canonical spec bytes → strict source inventory → normalized
identity/fingerprint → deterministic reconciliation/allocation → exact schema-v2 candidate →
read-only preview. A separate approved apply operation must reread and hash the target, stage the
exact candidate in the target directory, bounded-read and strictly validate it, then call
`os.replace`. A failed replace must reread the target and distinguish proven-v1-preserved from
unknown; it must not reuse the MVP repository's weaker pre-operation state report.
`[VERIFIED: canonical design.md Gate B at 2cbb127; Python 3.12 os.replace documentation]`

The tracked repository handoff is a started v1 manifest pinned to the old source
`7e4c3ac...`; the current authority is `2cbb127...`. It is historical audit evidence and is
explicitly out of bounds for this phase's writes. Phase 1 implements and verifies migration
mechanics against fixtures and isolated temporary repositories. A later fresh preview and
approval boundary owns any migration of the real handoff file. `[VERIFIED: .planning/openspec/harden-openspec-gsd-handoff-lifecycle/handoff.json; .planning/PROJECT.md; 01-CONTEXT.md]`

**Primary recommendation:** preserve `manifest.py` as the v1 compatibility surface; add focused
`source_identity.py`, `manifest_v2.py`, `versioned_manifest.py`, and
`manifest_migration.py` modules, with public-seam TDD through complete values and isolated
filesystem operations. `[VERIFIED: existing package responsibilities; AGENTS.md minimal-change and file-size rules]`

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Markdown source inventory and fingerprint | Domain core | Canonical-reader adapter | Parsing and normalization are deterministic pure transformations after one bounded read. `[VERIFIED: canonical design.md Gate B; reader.py]` |
| Stable ID reconciliation/allocation | Domain core | — | No filesystem, clock, randomness, or tool probe is required. `[VERIFIED: canonical HARD-R1; 01-CONTEXT.md]` |
| Exact v2 parse/serialize | Domain core | Bounded-file adapter | Schema validation is pure; byte acquisition is effectful and already isolated. `[VERIFIED: manifest.py pattern]` |
| Migration preview | Application operation | Domain core | It composes complete v1, source inventory, identity state, and v2 codec without mutation. `[VERIFIED: canonical migration-preview contract]` |
| Migration apply | Filesystem adapter | Application operation | It is the sole Phase-1 mutation boundary and must expose every staging/replace outcome. `[VERIFIED: canonical staging/rollback contract]` |
| Policy reference record | Phase 2 mapping boundary | — | Schema-v2 migration permits empty mappings, while policy-reference existence and mapping completeness belong to HND-02. `[VERIFIED: design.md Gate B/Gate C; .planning/REQUIREMENTS.md]` |

## Project Constraints (from AGENTS.md)

- Keep OpenSpec as WHAT/WHY, requirement/scenario, acceptance, and final-completion authority;
  GSD owns only phase planning/progress. `[VERIFIED: AGENTS.md; docs/agents/workflow.md]`
- Keep this phase and branch limited to this one change; do not mix PR #42 or another active
  change. `[VERIFIED: AGENTS.md; .planning/PROJECT.md]`
- Use TDD where possible, test public seams, and update the OpenSpec boundary checkbox only after
  the main agent independently verifies the phase. `[VERIFIED: AGENTS.md; docs/agents/workflow.md; .agents/skills/tdd/SKILL.md]`
- Keep changes minimal, avoid unrelated refactors, avoid a larger single-file monolith, and use
  specific names. `[VERIFIED: AGENTS.md]`
- Normal CI must not require OpenSpec, GSD, Node, network, or populated user configuration;
  optional real-tool evidence remains opt-in. `[VERIFIED: AGENTS.md; Taskfile.yml check:without-gsd]`
- Do not automatically retry, switch route, roll back, repair, clean, close, push, open a PR, or
  merge. `[VERIFIED: canonical artifacts; user scope; .planning/PROJECT.md]`
- Do not modify the old `handoff.json`, old `handoff-brief.md`, canonical artifacts, or
  `tasks.md` from the delegated phase implementation. `[VERIFIED: phase task and manual-recovery record]`

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Python stdlib | Python 3.12.9 locally; project `>=3.12` | dataclasses, enums, JSON, SHA-256, Unicode NFC, paths, temporary staging, atomic replace | Existing runtime has no application dependencies and already uses these primitives. `[VERIFIED: pyproject.toml; local version probe; current package]` |
| pytest | 9.1.1 | fixed examples, fault injection, isolated filesystem integration | Existing suite and fixture conventions use pytest. `[VERIFIED: installed metadata; tests/test_handoff_manifest.py]` |
| Hypothesis | 6.155.7 | allocator and v2 manifest round-trip properties only | This is the exact Phase-1 property-test boundary. `[VERIFIED: installed metadata; 01-CONTEXT.md]` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Ruff | 0.15.20 | format and lint | Existing `task check` gate. `[VERIFIED: installed metadata; Taskfile.yml]` |
| basedpyright | 1.39.9 | tagged unions and immutable model checks | Existing `task check` gate. `[VERIFIED: installed metadata; Taskfile.yml]` |
| Git CLI | 2.34.1 locally | source authority and review inspection only | Do not invoke from the Phase-1 pure core or normal unit tests. `[VERIFIED: local probe; existing preflight separation]` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Frozen dataclasses and strict codecs | Pydantic/jsonschema | Adds a runtime dependency while path, parent, counter, ordering, and migration invariants still require custom validation. Do not add. `[VERIFIED: pyproject dependencies=[]; canonical exact invariants]` |
| Small bounded scanner | General Markdown parser | Adds a dependency and risks accepting syntax outside the fail-closed OpenSpec subset. Use a focused scanner aligned with canonical rules and fixed OpenSpec 1.3.1 headings. `[VERIFIED: local OpenSpec 1.3.1 parser; canonical ambiguous-Markdown rejection]` |
| Existing filesystem seam | Transaction/rollback package | The contract forbids inferred rollback and requires explicit unknown evidence. Do not add. `[VERIFIED: canonical design.md Gate B]` |

**Installation:** none. Keep application dependencies empty. `[VERIFIED: pyproject.toml]`

## Architecture Patterns

### System Architecture Diagram

```text
bounded canonical spec bytes
          |
          v
 strict source inventory ---- malformed / ambiguous / over-limit ---> structured failure
          |
          v
 normalize identity + fingerprint
          |
          v
 reconcile active/tombstones + allocate missing IDs
          |
          v
 exact schema-v2 candidate (empty mapping/ownership/lifecycle placeholders)
          |
          +--------------------> read-only migration preview
                                      |
                            exact fresh approval binding
                                      |
                                      v
 target reread/hash -> stage -> bounded reread -> strict v2 validate -> os.replace
                                      |
                  failure -----------+-----------> v1-preserved or unknown evidence
```

`[VERIFIED: canonical design.md Gate B and Phase-1 boundary]`

### Recommended Project Structure

```text
src/ai_coding_template_ja/openspec_gsd_handoff/
├── manifest.py             # keep existing v1 compatibility API and behavior
├── source_identity.py      # bounded Markdown inventory, normalizer, fingerprint, allocator
├── manifest_v2.py          # exact frozen v2 aggregate and canonical codec
├── versioned_manifest.py   # bounded schema dispatch without changing the v1 parser contract
└── manifest_migration.py   # read-only preview and separately approved apply

tests/
├── test_handoff_identity.py
├── test_handoff_manifest_v2.py
└── test_handoff_migration.py

tests/fixtures/openspec_gsd_handoff/
├── identity/
└── manifest/
    ├── expected-prepared.json       # existing v1 golden fixture
    └── expected-migrated-v2.json    # new independent v2 golden fixture
```

`[VERIFIED: current module/test layout; recommended split is internal design discretion]`

### Pattern 1: Preserve the v1 Compatibility Island

Keep `HandoffManifest`, `parse_manifest_bytes`, `serialize_manifest`,
`ManifestRepository`, and the three MVP public operations behaviorally unchanged. Add a
version-discriminated facade for callers that explicitly need v1/v2. Do not rename or move the
existing imports in the first implementation slice. `[VERIFIED: tests import these symbols directly; test_public_surface_exports_exact_operations]`

This avoids making schema validity depend on combinations of optional fields and avoids silently
allowing schema-v2 data through v1 lifecycle transitions. `[VERIFIED: canonical v1 has no extension point; canonical v2 is exact 11-field schema]`

### Pattern 2: Parse Once, Normalize Explicitly

Decode source bytes with strict UTF-8, replace only CRLF and CR with LF, then apply NFC where the
wire contract requires it. Do not use `splitlines()` because it recognizes line separators beyond
the contract; split on literal `"\n"`. Do not use `strip()`/`rstrip()` for horizontal whitespace,
because the contract limits it to U+0009 and Unicode category `Zs`. `[VERIFIED: canonical normalizer contract; Python unicodedata documentation]`

Recognize OpenSpec source items from exact requirement/scenario ATX forms under spec artifacts,
while the scanner independently tracks fenced-code state before treating heading-like lines as
boundaries. The installed OpenSpec 1.3.1 distribution recognizes `### Requirement:` and documents
`#### Scenario:` as the scenario form; normal CI should reproduce this using fixtures, not execute
the tool. `[VERIFIED: local @fission-ai/openspec 1.3.1 parser/templates; Taskfile isolation contract]`

### Pattern 3: Fingerprint Canonical Bytes, Not Python Objects

```python
def frame(component: bytes) -> bytes:
    return len(component).to_bytes(8, byteorder="big", signed=False) + component

payload = b"".join(
    frame(component)
    for component in (
        b"openspec-source-v1\0",
        category.encode("utf-8"),
        source_path.encode("utf-8"),
        normalized_heading.encode("utf-8"),
        b"" if parent_id is None else parent_id.encode("ascii"),
        normalized_block.encode("utf-8"),
    )
)
fingerprint = hashlib.sha256(payload).hexdigest()
```

Every component, including the version tag, is framed; a null parent is a zero-length component.
`[VERIFIED: canonical design.md Gate B fingerprint contract]`

### Pattern 4: Reconcile Requirements Before Scenarios

Requirements have no parent and must be reconciled/allocated first. Scenario reconciliation then
uses the resolved active requirement ID as `parent_id`. New items must be processed through a
canonical identity ordering rather than input order so a permutation produces the same mapping;
the property should assert mapping equality, not only equal counters. `[VERIFIED: canonical parent rules and P-ALLOC order-invariance evidence]`

The allocator accepts explicit unique matches as input, never calculates similarity. Absent prior
matches become tombstones; counters never decrease, and sentinel `1000000` refuses allocation.
`[VERIFIED: canonical design.md Gate B; HARD-R1]`

### Pattern 5: Migration Has a Stronger Repository Than MVP Persistence

The migration repository must not call `ManifestRepository.persist` with a schema-v2 value. MVP
persistence allows only the two MVP state transitions and does not reread the target after a
failed replace. Migration needs a separate operation bound to the exact source bytes and candidate
bytes. `[VERIFIED: manifest.py lines 612-712; canonical replace-failure contract]`

The apply order is:

1. require an explicit approved preview identity;
2. bounded-reread target and compare exact v1 hash;
3. rebuild or revalidate the candidate from the frozen source observations;
4. create staging in the target directory;
5. write exact candidate bytes;
6. bounded-reread and strict-parse as schema v2;
7. compare staged bytes/value to the preview candidate;
8. `os.replace`;
9. on replace failure, reread target and classify v1-preserved only on exact old-hash equality;
10. perform one best-effort staging cleanup and report its outcome.

`[VERIFIED: canonical design.md Gate B; Python 3.12 os.replace docs]`

### Pattern 6: Exact v2 Placeholders Without Pulling Later Phases Forward

Migration populates `source_items`. It emits `mappings=[]`,
`ownership={"owned":[],"referenced":[]}`, and
`lifecycle={"checkpoints":[],"receipts":[],"archives":[]}` as exact schema-valid placeholders.
An empty mapping is explicitly not operation-ready. Do not create the policy reference record or
implement mapping/ownership/lifecycle behavior in Phase 1. `[VERIFIED: canonical design.md Gate B; HND-02 and later phase ownership]`

### Anti-Patterns to Avoid

- **Optional-field v2:** adding four optional fields to `HandoffManifest` weakens both schemas.
  `[VERIFIED: canonical exact 7/11 fields]`
- **Parsing source from normalized strings only:** loses `raw_heading` evidence.
  `[VERIFIED: canonical raw-heading contract]`
- **`isspace()` or `strip()`:** accepts/removes whitespace outside the exact horizontal set.
  `[VERIFIED: canonical whitespace contract]`
- **Source-order allocation:** makes initial multi-item IDs depend on Markdown order.
  `[VERIFIED: P-ALLOC order-invariance requirement]`
- **Fingerprint-as-identity:** block edits must update fingerprint without changing ID when the
  identity tuple is unchanged. `[VERIFIED: canonical same-identity content-change scenario]`
- **Real-manifest migration during tests:** violates the approved manual-recovery boundary.
  `[VERIFIED: .planning/PROJECT.md; 01-CONTEXT.md]`
- **Policy record in Phase 1:** pulls Phase-2 mapping completeness into the migration foundation.
  `[VERIFIED: roadmap/requirements ownership]`
- **CLI verb expansion without a pinned operation name:** keep Phase-1 behavior observable through
  public module functions and structured result values; do not alter the existing exact three-op
  root export merely to choose an unpinned CLI spelling. `[VERIFIED: canonical names only the MVP
  operations; tests/test_handoff_cli.py exact export assertion]`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Unicode normalization | Custom composition tables | `unicodedata.normalize("NFC", value)` | Python exposes the Unicode database and canonical normalization forms. `[CITED: https://docs.python.org/3.12/library/unicodedata.html]` |
| Content digest | Custom checksum | `hashlib.sha256` | Wire contract requires SHA-256 lowercase hex. `[VERIFIED: canonical design.md]` |
| Filesystem containment proof | Lexical path comparison alone | lexical rejection plus `Path.resolve`/`lstat` at the adapter boundary | Pure paths do not resolve symlinks or eliminate `..` safely. `[CITED: https://docs.python.org/3.12/library/pathlib.html]` |
| Atomic replacement | Copy/delete sequence | same-directory staging plus `os.replace` | Successful POSIX rename replacement is atomic; cross-filesystem movement is not this seam. `[CITED: https://docs.python.org/3.12/library/os.html#os.replace]` |
| Semantic rename matching | Similarity score | explicit unique match input | Heuristic matching is a canonical non-goal. `[VERIFIED: canonical design/spec]` |

The bounded OpenSpec Markdown scanner is intentionally project code because the canonical
normalization and failure rules differ from a general Markdown renderer. Keep it small and
fixture-driven rather than inventing a general parser. `[VERIFIED: canonical normalizer contract; no runtime dependencies]`

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Tracked started schema-v1 `.planning/.../handoff.json`, pinned to old source `7e4c3ac...`. `[VERIFIED: file content and git history]` | Do not mutate in Phase 1. Use copied fixtures/tmp repositories only; real migration requires a later fresh preview/approval. |
| Live service config | None in scope; the package has no database/service dependency and Phase 1 uses no external service. `[VERIFIED: pyproject dependencies=[]; package source]` | None. |
| OS-registered state | None; this package is a repository-local library/CLI and registers no daemon, service, scheduled task, or global hook. `[VERIFIED: package and Taskfile inspection]` | None. |
| Secrets/env vars | No Phase-1 identity or migration contract depends on a secret or environment-variable name. `[VERIFIED: canonical artifacts and package source]` | None; do not add one. |
| Build artifacts | `.venv`/coverage caches may exist locally but contain no authoritative handoff state. `[VERIFIED: project tooling layout]` | Do not inspect or migrate them; tests use isolated `tmp_path`. |

## Common Pitfalls

### Pitfall 1: Losing v1 Compatibility While Adding Version Dispatch

**What goes wrong:** existing callers receive a union unexpectedly, v1 fixture bytes change, or
`mark-started` begins accepting schema v2. `[VERIFIED: direct imports and exact v1 tests]`

**How to avoid:** leave the v1 functions in place, add an explicit versioned facade, and retain the
existing golden fixture tests unchanged. `[VERIFIED: established repository pattern]`

### Pitfall 2: Raw Heading and Normalized Text Are Conflated

**What goes wrong:** diagnostics cannot show the original heading or canonically equivalent input
produces different identities. `[VERIFIED: canonical raw_heading/NFC split]`

**How to avoid:** retain decoded pre-NFC heading text separately; calculate identity heading and
block from the normalized source stream. `[VERIFIED: canonical design.md Gate B]`

### Pitfall 3: Requirement Fingerprints Ignore Child Scenario Blocks

The contract defines a block through the next same-or-higher-level heading. A requirement block
therefore contains its lower-level scenarios, while every scenario also has its own block. Do not
silently redefine a requirement block as “body before first scenario.” `[VERIFIED: canonical
same-or-higher ATX boundary]`

### Pitfall 4: Python Convenience APIs Broaden the Grammar

`splitlines`, `isspace`, `strip`, and unconstrained `PurePosixPath` normalization accept or erase
more than the wire contract. Use explicit character and segment predicates. `[VERIFIED: canonical
strict LF/horizontal/path contract; Python pathlib docs]`

### Pitfall 5: Stage Failure Evidence Claims Too Much

A failed staging write does not prove whether a partially created staging file is valid; a failed
replace does not prove the target is unchanged until it is reread. Preserve distinct failure point,
target state, staging state, and cleanup outcome values. `[VERIFIED: canonical migration failure
contract; existing MVP evidence model]`

### Pitfall 6: Empty v2 Placeholders Are Treated as Ready

Empty mappings/ownership/lifecycle arrays make the migrated document schema-valid only. Later
operations must still be blocked until their owning phases fill and validate them. `[VERIFIED:
canonical migration-empty-mapping statement; roadmap dependencies]`

### Pitfall 7: Excess Evidence Duplicates the Same Seam

Use one property for allocator invariants, one property family for v2 round trip, fixed source
normalizer examples, and filesystem fault examples for migration. Do not add broad properties for
the effectful migration operation. `[VERIFIED: 01-CONTEXT.md; canonical evidence catalog]`

## Code Examples

### Exact Horizontal Whitespace

```python
import unicodedata


def is_horizontal_whitespace(character: str) -> bool:
    return character == "\t" or unicodedata.category(character) == "Zs"
```

`[VERIFIED: canonical design.md horizontal-whitespace definition; Python unicodedata API]`

### Version Dispatch Without Weakening v1

```python
def parse_versioned_manifest(data: bytes) -> Result[ManifestV1 | ManifestV2]:
    version = inspect_schema_version_bounded(data)
    if version == 1:
        return parse_manifest_bytes(data)       # existing v1 parser
    if version == 2:
        return parse_manifest_v2_bytes(data)    # exact v2 parser
    return manifest_failure("manifest-schema-unsupported")
```

The version probe is not a partial success value; the selected exact parser must validate the
whole document. `[VERIFIED: canonical unknown-schema fail-closed contract]`

### Replace Failure Classification

```python
try:
    operations.replace(staging, target)
except OSError:
    try:
        current = operations.read_bounded_bytes(target)
    except OSError:
        target_state = MigrationTargetState.UNKNOWN
    else:
        target_state = (
            MigrationTargetState.V1_PRESERVED
            if sha256(current).hexdigest() == preview.v1_sha256
            else MigrationTargetState.UNKNOWN
        )
```

Never restore old bytes automatically. `[VERIFIED: canonical replace-failure/downgrade contract]`

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 9.1.1 + Hypothesis 6.155.7 `[VERIFIED: local metadata]` |
| Config file | `pyproject.toml` `[VERIFIED: repository]` |
| Quick run command | `uv run pytest tests/test_handoff_identity.py tests/test_handoff_manifest_v2.py tests/test_handoff_migration.py -q` |
| Existing regression command | `uv run pytest tests/test_handoff_manifest.py tests/test_handoff_cli.py -q` — 32 passed during research. `[VERIFIED: executed 2026-07-17]` |
| Full suite command | `task check` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HND-01 | strict source extraction, NFC/LF/ATX/fence/path/fingerprint examples | unit/fixture | `uv run pytest tests/test_handoff_identity.py -q` | ❌ Wave 0 |
| HND-01 | monotonic namespaced allocation, sentinel, tombstones, permutation invariance | Hypothesis property | `uv run pytest tests/test_handoff_identity.py -q` | ❌ Wave 0 |
| HND-01 | exact schema-v2 fields, parent/counter/reference placeholders, unknown fields, canonical round trip | unit + Hypothesis round trip | `uv run pytest tests/test_handoff_manifest_v2.py -q` | ❌ Wave 0 |
| HND-01 | v1 read, read-only preview, explicit approval binding, staging faults, v1 preservation, unknown/downgrade refusal | filesystem integration | `uv run pytest tests/test_handoff_migration.py -q` | ❌ Wave 0 |
| HND-01 | existing v1 behavior remains unchanged | regression | `uv run pytest tests/test_handoff_manifest.py tests/test_handoff_cli.py -q` | ✅ |

### Focused Fixtures

- One positive source fixture with requirement/scenario nesting, CRLF, NFC-equivalent text, display
  heading whitespace, and heading-like text inside a closed fence. `[VERIFIED: canonical normalizer scenarios]`
- Negative fixtures for invalid UTF-8, unclosed fence, duplicate normalized identity, path escape,
  symlink, counter/id/parent errors, unknown fields, over-limit source/manifest, and unknown schema.
  `[VERIFIED: canonical fail-closed cases]`
- One v1 golden input and one independently reviewed v2 golden output. Do not derive the expected
  v2 fixture by calling the serializer under test. `[VERIFIED: TDD tautology rule]`
- Fault adapters for staging creation, write, reread, strict validation, replace with unchanged
  target, replace with unprovable/changed target, and cleanup failure. `[VERIFIED: canonical
  migration failure matrix]`

### Sampling Rate

- **Per TDD slice:** the single new node plus the existing v1 regression node closest to it.
- **Per plan task commit:** all three Phase-1 test modules plus existing manifest/CLI regression.
- **Phase gate:** `task check`; main agent then verifies the OpenSpec boundary independently.

`[VERIFIED: TDD skill; AGENTS.md validation and boundary ownership]`

### Wave 0 Gaps

- [ ] `tests/test_handoff_identity.py`
- [ ] `tests/test_handoff_manifest_v2.py`
- [ ] `tests/test_handoff_migration.py`
- [ ] `tests/fixtures/openspec_gsd_handoff/identity/`
- [ ] `tests/fixtures/openspec_gsd_handoff/manifest/expected-migrated-v2.json`

No framework installation is needed. `[VERIFIED: current dev environment and lockfile]`

## Phase-1 Spec-Holes Evidence

| Phase-1 concern | Primary evidence | Avoided duplication |
|-----------------|------------------|---------------------|
| Empty, boundary, duplicate, order, invalid-format, rerun, numeric exhaustion, state paths for IDs | allocator property plus a small invalid-table fixture | Do not repeat allocator rules in migration integration. `[VERIFIED: P-ALLOC/E-BOUNDS mapping]` |
| UTF-8, LF, NFC, ATX, fence, whitespace, path, bounded block | fixed source-normalizer examples | Phase-1 context excludes normalizer property here. `[VERIFIED: 01-CONTEXT.md]` |
| Exact v2 schema and round trip | v2 golden fixture plus manifest round-trip property | Keep source parsing out of codec tests. `[VERIFIED: P-MANIFEST-RT mapping]` |
| Preview is read-only; staging/replace failure preserves v1 or reports unknown | migration filesystem examples with byte-for-byte target assertions | Do not property-test filesystem effects. `[VERIFIED: E-MIGRATION mapping; TDD guidance]` |
| Policy reference traceability | deferred to Phase 2; Phase 1 only validates empty `policy_references` inside an empty mapping array | Avoid creating an incomplete reference record. `[VERIFIED: HND-02 ownership]` |

## Security Domain

Security enforcement is enabled at ASVS level 1. `[VERIFIED: .planning/config.json]`

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No identity/authentication boundary in this phase. `[VERIFIED: phase scope]` |
| V3 Session Management | no | No session state. `[VERIFIED: phase scope]` |
| V4 Access Control | limited | Repository containment and explicit approval guard the only mutation boundary. `[VERIFIED: canonical path/approval contract]` |
| V5 Input Validation | yes | strict UTF-8, exact JSON objects, bounded counts/bytes, canonical paths, fail-closed Markdown scanner. `[VERIFIED: canonical design/spec]` |
| V6 Cryptography | yes, integrity only | stdlib SHA-256 for fingerprints and preview/source byte binding; no custom cryptography. `[VERIFIED: canonical design/spec]` |

### Known Threat Patterns for the Python/File Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal or symlink escape | Tampering | lexical rejection plus component `lstat`/resolved containment before reads/writes. `[VERIFIED: reader.py/manifest.py patterns; pathlib docs]` |
| Unicode/case alias collision | Spoofing/Tampering | NFC canonical key plus platform-aware alias collision check; ambiguity is failure. `[VERIFIED: canonical design.md]` |
| Oversized JSON/Markdown | Denial of service | limit+1 reads, 4096 collection caps, no prefix/truncated success. `[VERIFIED: canonical bounds]` |
| Stale approval or target swap | Tampering | exact source/candidate/preview hashes, immediate target reread, same-directory staged validate/replace. `[VERIFIED: canonical migration contract]` |
| Partial write or failed replace | Tampering/Repudiation | explicit failure point, target/staging/cleanup evidence, no rollback claim. `[VERIFIED: canonical migration contract]` |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python | runtime/tests | ✓ | 3.12.9 | project supports >=3.12 `[VERIFIED: probe; pyproject.toml]` |
| uv | test commands | ✓ | existing environment | use existing locked environment `[VERIFIED: Taskfile/venv execution]` |
| pytest | tests | ✓ | 9.1.1 | — |
| Hypothesis | two property seams | ✓ | 6.155.7 | fixed examples if a property is shown to add no value, but no package install needed |
| OpenSpec CLI | strict artifact validation only, not normal Phase-1 tests | ✓ | 1.3.1 | Markdown fixtures for normal CI |
| GSD | planning/verifier only, not runtime tests | ✓ | 1.5.0 | none needed by package tests |

No missing dependency blocks execution. No new external package is proposed, so a package
legitimacy audit is not applicable. `[VERIFIED: environment probes and project dependencies]`

## State of the Art

| Old Approach | Current Phase-1 Approach | Impact |
|--------------|--------------------------|--------|
| Exact schema v1 only | Exact v1 compatibility plus separate exact v2 codec/facade | Unknown versions and downgrades remain fail-closed. `[VERIFIED: canonical Gate A/B]` |
| Stable identity absent | Namespaced monotonic IDs with active/tombstone state and source fingerprint | Later mapping/drift can refer to durable source items. `[VERIFIED: canonical HARD-R1]` |
| MVP stage/validate/replace for two state transitions | Migration-specific preview/apply with post-failure target reread | v1 preservation is proved rather than assumed. `[VERIFIED: existing code vs canonical migration contract]` |
| Tool-assisted discovery | Tool-independent fixture/core validation | Normal CI remains green without optional tools. `[VERIFIED: Taskfile check:without-gsd]` |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | None. Recommendations are grounded in the repinned canonical artifacts, repository code/tests, local pinned tool distribution, or Python 3.12 documentation. | — | — |

## Open Questions (RESOLVED)

No external/specification decision blocks Phase 1 planning. The following are resolved
implementation boundaries, not permission to broaden scope:

1. Exact internal class/function names may change during planning, but the responsibility split
   and public behavioral seams above must remain. `[VERIFIED: 01-CONTEXT.md discretion]`
2. The canonical artifacts do not pin a new root CLI verb spelling. Phase 1 should therefore keep
   the current exact MVP root exports intact and expose migration through focused module-level
   structured operations; a later canonical decision is required before adding a new user-facing
   CLI spelling. `[VERIFIED: canonical MVP operation names; test_public_surface_exports_exact_operations]`
3. The real stale started manifest must not be migrated as part of implementation/testing. Its
   fresh preview and approval remain an operator boundary after the implementation is verified.
   `[VERIFIED: approved manual-recovery record]`

## Sources

### Primary (HIGH confidence)

- `openspec/changes/harden-openspec-gsd-handoff-lifecycle/` at
  `2cbb127917feaa637ef5eac439478227ac5f717b` — exact Phase-1 contract and evidence ownership.
- `AGENTS.md`, `CONTEXT.md`, `docs/agents/workflow.md`, `openspec/project.md` — repository workflow,
  safety, and validation boundaries.
- `src/ai_coding_template_ja/openspec_gsd_handoff/manifest.py`, `reader.py`, `models.py`,
  `__init__.py`, `__main__.py` — existing public seams and reusable adapters.
- `tests/test_handoff_manifest.py`, `tests/test_handoff_cli.py`,
  `tests/fixtures/openspec_gsd_handoff/manifest/expected-prepared.json` — v1 compatibility and
  fault-injection patterns.
- Installed `@fission-ai/openspec` 1.3.1 parser/templates — requirement/scenario Markdown forms;
  used as research evidence only, not a normal-CI dependency.

### Secondary (MEDIUM confidence)

- [Python 3.12 `unicodedata`](https://docs.python.org/3.12/library/unicodedata.html) — NFC and
  Unicode categories.
- [Python 3.12 `pathlib`](https://docs.python.org/3.12/library/pathlib.html) — lexical versus
  resolved paths and symlink behavior.
- [Python 3.12 `os.replace`](https://docs.python.org/3.12/library/os.html#os.replace) — replacement
  and POSIX atomic rename guarantee.

### Verification Performed

- Canonical working-tree artifact blob IDs exactly match commit `2cbb127...`.
- `openspec validate harden-openspec-gsd-handoff-lifecycle --strict` returned valid.
- `uv run pytest tests/test_handoff_manifest.py tests/test_handoff_cli.py -q` returned 32 passed.
- Current canonical spec contains 6 requirements and 36 scenarios (42 source items before any
  future change), well below the 4096-item bound.
- Working tree was clean before this research file was created.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — installed versions, lock/project config, and no-new-dependency constraint verified.
- Architecture: HIGH — exact canonical wire contract and current package seams verified.
- Pitfalls: HIGH — derived from explicit failure contracts and existing fault seams.
- Python filesystem/Unicode API details: MEDIUM — official Python 3.12 documentation, fetched after
  Context7 was unavailable.

**Research date:** 2026-07-17
**Valid until:** source authority or Phase-1 canonical contract changes
