---
phase: 01-stable-identity-and-migration
plan: 02
subsystem: openspec-gsd-handoff
tags: [stable-identity, allocator, tombstones, hypothesis, tdd]

requires:
  - phase: 01-stable-identity-and-migration
    provides: bounded canonical source observations and framed fingerprints from Plan 01-01
provides:
  - immutable active and tombstone source identity state
  - deterministic category-namespaced monotonic allocator
  - exact and explicit one-to-one reconciliation evidence
affects: [01-03-manifest-v2, 01-04-migration-preview]

tech-stack:
  added: []
  patterns:
    - requirement-first stable identity reconciliation
    - whole-operation validation before allocation
    - bounded allocator property family

key-files:
  created: []
  modified:
    - src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py
    - tests/test_handoff_identity.py

key-decisions:
  - "Persisted raw headings are strictly reparsed to recover normalized identity without adding an unpinned schema field."
  - "Explicit matches can target active identities only and must be one-to-one; tombstone IDs are never resurrected."
  - "Active output follows canonical source identity order while namespaced IDs remain stable independently of that order."

patterns-established:
  - "Validate complete prior state and explicit mappings before producing any allocation result."
  - "Resolve requirements before scenarios so scenario fingerprints and parents use active stable requirement IDs."

requirements-addressed: [HND-01]
requirements-completed: []

duration: 8 min
completed: 2026-07-17
status: complete
---

# Phase 1 Plan 2: Stable Source Reconciliation Summary

**Monotonic REQ/SCN allocation with strict prior-state validation, explicit one-to-one rename mapping, and non-reusing tombstones**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-16T21:12:22Z
- **Completed:** 2026-07-16T21:20:08Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added frozen active item, tombstone, allocator state, explicit match, and reconciliation values.
- Added strict ID, category, counter, parent, fingerprint, path, heading, collection, and aggregate-size validation before allocation.
- Allocated requirements before scenarios in canonical identity order with independent monotonic counters and an unallocatable `1000000` sentinel.
- Preserved exact identities and explicit unique matches, updated content fingerprints without changing IDs, and converted removals to parent-preserving tombstones.
- Added one bounded Hypothesis family covering order independence, idempotence, monotonic counters, tombstone preservation, and suffix non-reuse.
- Kept package-root exports, historical handoff evidence, OpenSpec tasks, dependencies, and Phase 2+ behavior unchanged.

## TDD Evidence

### Task 1: Namespaced allocation and prior-state validation

- **RED:** `b8cef4a` added failing examples for absent allocator values, canonical allocation, invalid counters/IDs/parents, duplicates, and sentinel exhaustion.
- **GREEN:** `edcadc2` implemented requirement-first allocation and strict complete-state validation.

### Task 2: Reconciliation, tombstones, and explicit matches

- **RED:** `17b9d34` added failing explicit-match cases plus tombstone and allocator property evidence.
- **GREEN:** `6d97456` implemented one-to-one explicit reconciliation and completed the path/parent-change acceptance examples.
- **REFACTOR:** No separate refactor commit was needed.

## Task Commits

1. **Task 1: Allocate namespaced IDs with exact counters and parent invariants**
   - `b8cef4a` — test: stable allocator boundary RED
   - `edcadc2` — feat: namespaced source allocation GREEN
2. **Task 2: Preserve identities, tombstones, and order invariants**
   - `17b9d34` — test: reconciliation invariant RED
   - `6d97456` — feat: stable identity reconciliation GREEN

## Files Modified

- `src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py` — stable state values, strict validation, deterministic allocator, tombstones, and explicit matching.
- `tests/test_handoff_identity.py` — fixed boundary/reconciliation examples and the sole Phase-1 allocator property family.

## Decisions Made

- The exact v2 source-item schema stores `raw_heading` but not `normalized_heading`; reconciliation therefore reparses the strictly validated raw ATX heading to reconstruct the persisted normalized identity.
- A returned source state is ordered by canonical current source identity, not by numeric ID. ID stability is asserted through mappings and immutable values rather than positional assumptions.
- Explicit matches cannot target tombstones. A removed suffix remains reserved permanently, and a reappearing source without an active exact/explicit match receives a new ID.
- `HND-01` remains pending because Plans 01-03 through 01-05 still own schema-v2 codec, migration preview, and atomic apply portions of the phase requirement.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The additional path/parent-change example initially assumed active values were ID-sorted. The canonical contract only requires allocation independent of source order, so the test was corrected to assert stable mapping and parent evidence without imposing a new persisted ordering rule.
- Context7 CLI was unavailable. No new library API was introduced; the implementation used the locked Hypothesis version and existing repository property-test pattern already verified in Phase 1 research.

## Test Results

- `uv run pytest tests/test_handoff_identity.py tests/test_handoff_core.py -q` — 63 passed.
- `uv run pytest tests/test_handoff_identity.py tests/test_handoff_core.py tests/test_handoff_manifest.py tests/test_handoff_cli.py -q` — 95 passed.
- `task check` — ruff format/check, basedpyright, and 272 tests passed.
- `git diff --check` — passed.
- TDD log contains two RED commits preceding their GREEN commits.
- Historical `.planning/openspec/.../handoff.json`, `handoff-brief.md`, and canonical `tasks.md` diff from `2cbb127...` — empty.

## TDD Gate Compliance

- Both planned tasks have failing `test(01-02)` commits before their corresponding `feat(01-02)` commits.
- RED failures were caused by the absent allocator seam or the intentionally unsupported explicit-match behavior.
- The only property family added is the approved allocator family; normalizer and filesystem effects were not property-tested.
- No refactor commit was necessary after GREEN.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 01-03 can consume `SourceIdentityState` as the exact `source_items` value for schema v2. Mapping, ownership, lifecycle, migration preview/apply, and real historical-manifest mutation remain unimplemented or intentionally deferred to their owning plans/phases.

## Self-Check: PASSED

- Both declared modified files exist.
- All four TDD commits exist in order.
- Focused, adjacent, and full project checks pass.
- Historical manifest, brief, and OpenSpec tasks remain unchanged.

---
*Phase: 01-stable-identity-and-migration*
*Completed: 2026-07-17*
