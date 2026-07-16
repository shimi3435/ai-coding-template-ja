# Feature Landscape: OpenSpec–GSD Handoff Lifecycle Hardening

**Domain:** source-pinned workflow lifecycle enforcement
**Change:** `harden-openspec-gsd-handoff-lifecycle`
**Research baseline source:** `7e4c3ac5d6fc7f75716794ff1b805d9c1d6381bd`
**Current planning source:** `2cbb127917feaa637ef5eac439478227ac5f717b`; Phase 1 phase research must reread the current canonical artifacts.
**Researched:** 2026-07-16
**Confidence:** HIGH

## Scope and Interpretation

This file is a roadmap input, not a second specification. Canonical behavior remains in
the source-pinned OpenSpec artifacts. `HARD-R1` through `HARD-R6` are used only as
opaque traceability handles; their requirements, scenarios, and acceptance criteria are
not copied or redefined here.

The milestone is not six independent feature choices. It is one ordered safety chain:

```text
stable identity / migration
  → mapping
  → drift
  → ownership
  → recovery
  → finalize
```

Skipping or reordering a slice would make later evidence depend on state that has not
yet been made stable or inspectable.

## Existing Foundation to Reuse

The merged MVP already provides artifact discovery, bounded canonical reads, progress
parsing, capability preflight, schema-v1 manifest persistence, and the public
`inspect` / `prepare` / `mark-started` seams. Hardening should extend those seams and
their deterministic result model rather than rebuild the bridge.

| Existing capability | Reuse in this milestone | Do not expand it into |
| --- | --- | --- |
| Canonical artifact discovery and hashing | Source inputs for identity, drift, and final revalidation | A second canonical specification store |
| Schema-v1 manifest reader/writer | Backward-compatible input and migration source | In-place v1 field extension |
| Atomic bounded persistence | Shared persistence discipline for v2 and lifecycle records | Automatic rollback or inferred repair |
| Structured CLI results | Stable observation seam for tests and callers | Autonomous workflow routing |
| Optional real-tool smoke task | Explicit system-boundary evidence | A normal-CI dependency |

## Table Stakes

All six capability slices are required for the milestone. None is an optional
differentiator.

| Ordered slice | Canonical handle | Implementation capability | State made available to the next slice | Complexity |
| --- | --- | --- | --- | --- |
| 1. Stable identity and migration | `HARD-R1` | Read v1/v2, build a read-only migration preview, apply an approved migration atomically, allocate persistent source identities, and preserve retired identities | Validated v2 manifest plus deterministic active/tombstone identity state | High |
| 2. Source mapping | `HARD-R1` | Validate source-to-phase / plan / evidence mappings and stable policy-reference identifiers without copying policy text | Complete, single-change mapping records that later gates can inspect | Medium |
| 3. Lifecycle drift gate | `HARD-R2` | Evaluate operation-specific preflight inputs through one common matrix and return structured clean/drift/unknown evidence before mutation | A reusable pre-operation verdict for plan, execute, resume, verify, and finalize | High |
| 4. Repository ownership | `HARD-R3` | Scan all applicable manifests, normalize repository paths, and build an ownership/reference graph | Deterministic owner, reader, shared-reference, conflict, or unknown classification | High |
| 5. Recovery journal | `HARD-R4` | Persist effect-level checkpoints/receipts and construct a new resume plan from journal plus observed repository state | A reviewable next-operation plan that preserves completed and unknown effects | High |
| 6. Finalize preview and receipt | `HARD-R5` | Build a complete ordered cleanup preview, bind approval to immutable inputs, recheck immediately before apply, and record partial outcomes | Finalize receipt and evidence usable by the independent OpenSpec close boundary | High |

`HARD-R6` is cross-cutting. It defines the evidence plane for every slice and therefore
should not become a seventh implementation phase.

## Capability Slice Details

### Phase 1 — Stable Identity and Migration

**Public seams**

- v1/v2 manifest read
- read-only migration preview
- approval-bound migration apply
- stable source identity allocation

**Implementation boundary**

- Keep parsing, validation, allocation, migration planning, and persistence as separate
  responsibilities; the existing `manifest.py` is already substantial.
- Reuse the existing bounded-read, canonical-serialization, staging, re-read, and atomic
  replacement discipline.
- Emit structured migration evidence that later phases can hash and reference.

**Required evidence**

- Property: `P-ALLOC`
- Property: `P-MANIFEST-RT`
- Fixture/example: `E-MIGRATION`
- Bounded examples: `E-BOUNDS`
- Existing MVP regression tests for v1 reads and persistence

**Phase handoff**

Phase 2 should begin only with a validated v2 representation and stable source IDs.
Mappings created before identity stabilizes would be disposable and should not be
treated as durable progress.

### Phase 2 — Source-to-Execution Mapping

**Public seams**

- mapping validation from canonical source IDs to phase, plan, and evidence paths
- stable policy-reference record validation
- mapping coverage and change-scope diagnostics

**Implementation boundary**

- Treat mapping as a validator over explicit records, not a similarity or discovery
  engine.
- Keep policy references as identifiers and verified source anchors; do not embed policy
  prose in manifest or planning artifacts.
- Produce diagnostics that identify missing, duplicate, cross-change, or broken records
  without proposing guessed replacements.

**Required evidence**

- Fixture/example: `E-MAPPING`
- Fixture/example: `E-POLICY`
- Bounded examples: `E-BOUNDS`
- Focused CLI or public-seam examples for structured diagnostics

**Phase handoff**

Phase 3 needs a complete mapping baseline so that drift can distinguish source changes
from missing or malformed derived state.

### Phase 3 — Drift Before Lifecycle Operations

**Public seams**

- common lifecycle preflight for plan / execute / resume / verify / finalize
- operation-specific required-input matrix
- structured drift and unknown result
- shared source/task normalizer

**Implementation boundary**

- Centralize the comparison rules so each operation cannot acquire subtly different
  drift semantics.
- Keep observation read-only and separate from any replan, repair, or route decision.
- Preserve enough component-level evidence to explain which input invalidated the
  operation without emitting canonical content.

**Required evidence**

- Property: `P-NORMALIZER`
- Fixture/example: `E-DRIFT`
- Bounded examples: `E-BOUNDS`
- Integration examples where filesystem or capability observation becomes unavailable

**Phase handoff**

Ownership scanning and every later mutation path should consume the same preflight
result. A later phase must not bypass this gate with its own ad hoc freshness check.

### Phase 4 — Repository-Wide Ownership

**Public seams**

- repository-root manifest enumeration
- real-path normalization and repository-boundary validation
- ownership/reference graph construction
- deterministic graph query for mutation eligibility

**Implementation boundary**

- Separate pure graph construction from filesystem/Git discovery.
- Make scan completeness explicit; a partial scan is not a smaller valid graph.
- Keep ownership declarations distinct from references to canonical or policy sources.

**Required evidence**

- Property: `P-OWNERSHIP`
- Filesystem/Git integration: `I-OWNERSHIP`
- Bounded examples: `E-BOUNDS`
- Negative fixtures for malformed manifests and path aliases

**Phase handoff**

Recovery and finalize may calculate candidate effects only after repository-wide
ownership is known. Per-manifest ownership is insufficient evidence for mutation.

### Phase 5 — Interruption and Partial-Failure Recovery

**Public seams**

- checkpoint and receipt read/write
- effect-level journal reconciliation
- resume-plan builder
- structured unknown-state escalation

**Implementation boundary**

- Model recovery as observation plus a newly reviewable plan, not compensating actions.
- Keep journal persistence independent from effect execution so fault injection can
  prove which state is known.
- Reuse drift and ownership results rather than duplicating their checks inside recovery.

**Required evidence**

- Filesystem integration: `I-RECOVERY`
- Fixture/example: `E-DRIFT` for changed inputs during resume
- Bounded examples: `E-BOUNDS`
- Fault injection at record write, effect boundary, and observation seams

**Phase handoff**

Finalize needs the same effect-state vocabulary and receipt mechanism. Building
finalize first would create a second, incompatible partial-failure model.

### Phase 6 — Finalize Preview and Receipt

**Public seams**

- read-only finalize/cleanup preview builder
- approval-bound apply
- immediate pre-apply drift and ownership recheck
- partial-failure and no-op receipt

**Implementation boundary**

- Keep preview construction pure; filesystem/Git effects belong behind explicit
  adapters.
- Reuse the recovery journal for effect ordering and partial results.
- Return machine-readable evidence for the independent OpenSpec final boundary; do not
  mark the canonical change complete from this subsystem.

**Required evidence**

- Property: `P-PREVIEW`
- Filesystem/Git integration: `I-FINALIZE`
- Integration: `I-OWNERSHIP` for ownership changes between preview and apply
- Fixture/example: `E-DRIFT` for stale approval inputs
- Bounded examples: `E-BOUNDS`

**Milestone handoff**

The phase produces evidence for, but does not perform, the independent OpenSpec
validation, project checks, review, or close decision.

## Verification Evidence Model

Evidence should be layered by failure seam. Repeating the same invariant through every
test style adds cost without materially improving confidence.

| Evidence category | IDs | Purpose | Normal CI |
| --- | --- | --- | --- |
| Pure property tests | `P-ALLOC`, `P-NORMALIZER`, `P-MANIFEST-RT`, `P-OWNERSHIP`, `P-PREVIEW` | Prove deterministic invariants over broad generated inputs | Yes |
| Deterministic fixture/example tests | `E-MIGRATION`, `E-MAPPING`, `E-DRIFT`, `E-POLICY`, `E-BOUNDS` | Pin exact public outcomes, malformed inputs, limits, and traceability diagnostics | Yes |
| Isolated filesystem/Git integration | `I-OWNERSHIP`, `I-RECOVERY`, `I-FINALIZE` | Exercise real paths, aliases, atomic persistence, interruption, ordering, and receipts | Yes |
| Real OpenSpec/GSD smoke | `S-TOOLS` | Confirm supported optional tool signals at the system boundary | No; explicit opt-in only |
| Independent milestone verification | OpenSpec strict validation, project OpenSpec validation, `task check`, drift/ownership/broken-reference checks | Reconcile implementation evidence with the source-pinned canonical change | Final boundary, separate from GSD phase completion |

### Property-Test Boundary

Property tests are intentionally limited to:

1. allocator
2. normalizer
3. manifest round-trip
4. ownership graph
5. preview builder

Mapping validation, filesystem/Git behavior, journal recovery, CLI orchestration, and
real tool probes should remain fixture/example, integration, or opt-in smoke tests.
Expanding property tests into those effectful seams would increase harness complexity
while weakening the directness of the evidence.

### Evidence Packaging Per Phase

Each phase should leave:

- focused test node IDs and fixture paths;
- the source handle(s) it traces to;
- public-seam output demonstrating the changed capability;
- explicit unverified items with a reason;
- confirmation that only this change is represented in phase artifacts.

This is traceability metadata, not a replacement for the canonical acceptance criteria.

## Differentiators

These qualities make the hardening useful beyond merely adding more manifest fields.

| Differentiator | Value | Enabled by |
| --- | --- | --- |
| Source-pinned traceability without specification duplication | Reviewers can follow evidence back to canonical artifacts while OpenSpec remains authoritative | Stable identity plus explicit mapping |
| One fail-closed vocabulary across the lifecycle | Callers can distinguish safe, conflicting, and unknown state without route-specific interpretation | Shared result models and common preflight |
| Recovery without destructive compensation | Interrupted work remains inspectable and resumable without pretending rollback succeeded | Effect journal plus resume-plan builder |
| Repository-wide mutation eligibility | Cleanup decisions include other manifests and readers, not only the current change | Ownership graph |
| Approval tied to immutable inputs | A reviewed preview cannot silently authorize a changed operation set | Deterministic preview hash plus immediate recheck |

## Anti-Features

| Anti-feature | Why it stays excluded | Required alternative |
| --- | --- | --- |
| Heuristic or similarity-based identity/mapping | A plausible wrong match corrupts traceability while looking valid | Stop with explicit ambiguity/conflict evidence and require a reviewed mapping |
| Automatic route switching or fallback after lifecycle failure | Changes the approved execution path and can hide capability or source drift | Preserve state, report the failed gate, and require a new explicit decision |
| Automatic rollback, downgrade, or compensating cleanup | Partial filesystem/Git state cannot always be proven reversible | Record effect state and build a new recovery preview |
| Automatic repair of malformed manifests, journals, mappings, or ownership | Inference could overwrite the only evidence of what occurred | Fail closed and surface the unknown or conflicting records |
| Automatic deletion or ownership transfer for unknown/shared artifacts | A local manifest cannot prove repository-wide exclusivity | Require a complete ownership graph and reviewed reference updates |
| Automatic finalize, OpenSpec close, push, PR creation, or merge | Those actions cross the GSD/OpenSpec and human-approval boundaries | Produce preview/receipt evidence and leave the boundary action separate |
| Making optional OpenSpec/GSD tools mandatory in normal CI | Breaks deterministic validation in environments where optional tools are absent | Keep fixtures and integration tests sufficient; run `S-TOOLS` only by opt-in |
| Duplicating canonical OpenSpec or policy prose in GSD artifacts | Creates a second source of truth and makes drift ambiguous | Store stable handles, paths, hashes, and evidence references only |
| Mixing PR #42 or another change into a phase | Invalidates one-phase/one-change ownership and close evidence | Keep all phase artifacts scoped to this exact change ID |
| Property-testing effectful orchestration beyond the five approved pure cores | Produces expensive generators and mocks with weak correspondence to actual failures | Use isolated integration tests and explicit fault injection |
| Time-, retry-count-, score-, or threshold-driven automatic decisions | Adds non-canonical heuristics and nondeterministic lifecycle behavior | Base decisions on explicit state, hashes, graph evidence, and approval |

## Roadmap Recommendation

Implement exactly six sequential phases:

1. Stable identity and migration
2. Source-to-execution mapping
3. Lifecycle drift gate
4. Repository-wide ownership
5. Recovery journal and resume planning
6. Finalize preview and receipt

Within a phase, pure-core work and its fixtures may proceed together, but phase-level
implementation should not run in parallel with a downstream phase that consumes its
state model. Verification consolidation belongs after all six phases and should map the
existing Phase 1 spec-hole catalog to real test nodes or reasoned unverified entries.

Nothing in the anti-feature table should be deferred as a “later enhancement”; those
items are intentional safety boundaries.

## Sources

Primary repository evidence:

- `.planning/PROJECT.md`
- `.planning/openspec/harden-openspec-gsd-handoff-lifecycle/handoff-brief.md`
- `.planning/openspec/harden-openspec-gsd-handoff-lifecycle/handoff.json`
- `openspec/changes/harden-openspec-gsd-handoff-lifecycle/proposal.md`
- `openspec/changes/harden-openspec-gsd-handoff-lifecycle/design.md`
- `openspec/changes/harden-openspec-gsd-handoff-lifecycle/tasks.md`
- `src/ai_coding_template_ja/openspec_gsd_handoff/`
- `tests/test_handoff_*.py`
- `tests/fixtures/openspec_gsd_handoff/`

The unchanged `handoff.json` records the original dispatch and is historical / stale
evidence after manual recovery. This document records research performed against the
research baseline above; current Phase 1 planning must reread the canonical paths at the
separately identified current planning source. No external ecosystem claim is needed for
this feature dimension.
