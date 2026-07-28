---
phase: 03-lifecycle-drift-gate
plan: 13
subsystem: source-reconciliation
tags: [python, source-identity, runtime-validation, fail-closed, tdd]
requires:
  - phase: 03-lifecycle-drift-gate
    plan: 07
    provides: shared safe SourceIdentityState validation authority
  - phase: 03-lifecycle-drift-gate
    plan: 11
    provides: complete mapping aggregate validation before semantic use
provides:
  - complete runtime-shape validation for public source reconciliation inventories
  - complete explicit-match and nested-parent validation before semantic operations
  - stable identity-free failures for malformed reconciliation aggregates
affects: [lifecycle-admission, source-reconciliation, HND-03]
tech-stack:
  added: []
  patterns:
    - validate-entire-aggregate-before-semantic-use
    - stable-public-failure-without-partial-state
key-files:
  created:
    - .planning/phases/03-lifecycle-drift-gate/03-13-SUMMARY.md
  modified:
    - src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py
    - tests/test_handoff_identity.py
key-decisions:
  - "Inventory and explicit-match aggregates validate every outer, container, member, scalar, and nested-parent shape before path, normalization, set, hash, lookup, sort, or allocation work."
  - "A well-shaped unresolved scenario parent retains source-parent-unresolved, while malformed inventory and explicit-match shapes use their dedicated stable public issue codes."
  - "No REFACTOR commit was added because the GREEN validators already preserve one authority per aggregate without behavior-preserving duplication."
patterns-established:
  - "Caller-constructed frozen dataclasses are untrusted until exact runtime shape validation completes for the entire aggregate."
requirements-completed: [HND-03]
duration: 8min
completed: 2026-07-28
status: complete
---

# Phase 03 Plan 13: Public Reconciliation Aggregate Validation Summary

**The public source reconciliation seam now rejects malformed inventories, nested parent locators, and explicit matches as stable structured failures before any path, comparison, hashing, lookup, sorting, or allocation work.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-28T15:45:37Z
- **Completed:** 2026-07-28T15:53:17Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Made `_validate_inventory` prove the exact `SourceInventory`, tuple container, every exact `SourceObservation`, all exact scalar fields, and every exact optional `SourceParentLocator` before semantic validation.
- Made `_validate_explicit_matches` reject strings, bytes, and non-`Sequence` values before `len`, then validate every exact match and nested parent field before inventory-key hashing or active-state lookup.
- Preserved `source-parent-unresolved` for a correctly shaped scenario whose parent cannot be resolved while mapping malformed shapes to `source-inventory-invalid` or `source-explicit-match-invalid`.
- Added the three named fixed public-seam regression matrices without a new Hypothesis family, public validator, dependency, filesystem behavior, repair, rollback, retry, or later-phase ownership logic.

## Task Commits

Task 1 followed the required TDD gates:

1. **RED: expose malformed reconciliation aggregate inputs** - `020a7b7`
2. **GREEN: validate reconciliation inputs before use** - `ecab0e2`

No REFACTOR commit was needed. The GREEN change already separates whole-aggregate shape validation from existing semantic validation without introducing another validation authority.

## TDD Evidence

### RED

- The three focused nodes collected 27 fixed rows.
- 16 rows failed for the intended reasons: uncaught `AttributeError` or `TypeError`, an unsafe successful reconciliation, or a leaked internal issue code.
- The remaining 11 rows were already fail-closed under existing guards and stayed as regression backstops.
- The reproduced failures included `inventory=object()`, non-sequence explicit containers, malformed scenario parents, wrong scalar runtime types, and malformed nested explicit-match locators.

### GREEN

- All 27 focused rows passed.
- Every malformed public row returned `Failure`, exposed no `value`, and used the exact aggregate-specific issue code.
- The well-shaped `parent_locator=None` scenario row retained `source-parent-unresolved`.
- The full identity suite passed 77 tests, preserving allocation, rename, ambiguity, collision, limit, Unicode, tombstone, and deterministic-order behavior.

### REFACTOR/REVIEW

- `_validate_inventory` remains the sole reconciliation inventory authority.
- `_validate_explicit_matches` remains the sole explicit-match authority.
- A shared locator helper was not introduced because inventory-parent and explicit-parent failures intentionally have different public issue semantics.
- Self-review found no broad exception sanitizer, coercion, allocation-before-validation, unrelated refactor, property expansion, secret exposure, deletion, or AGENTS.md violation.

## Malformed-Family Failure Matrix

| Public input family | Fixed rows | GREEN result |
|---|---:|---|
| Inventory outer/container/member | 3 | `source-inventory-invalid`, no partial value |
| Inventory category and scalar fields | 5 | `source-inventory-invalid`, no partial value |
| Scenario parent locator runtime shape | 4 | `source-inventory-invalid`, no partial value |
| Well-shaped unresolved scenario parent | 1 | `source-parent-unresolved`, no partial value |
| Explicit-match container | 5 | `source-explicit-match-invalid`, no partial value |
| Explicit-match member | 1 | `source-explicit-match-invalid`, no partial value |
| Explicit-match scalar and source ID | 4 | `source-explicit-match-invalid`, no partial value |
| Explicit-match nested parent locator | 4 | `source-explicit-match-invalid`, no partial value |

## Files Created/Modified

- `src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py` - validates reconciliation aggregates outer-to-inner before semantic operations.
- `tests/test_handoff_identity.py` - covers 27 fixed malformed and semantic-backstop rows through `reconcile_source_items`.

## Decisions Made

- Validate every aggregate member and field in a complete first pass so a later malformed row cannot be hidden by path, normalization, hashing, or comparison of an earlier row.
- Accept only non-string `Sequence` containers for explicit matches and never coerce unsupported containers.
- Translate malformed inventory-owned path and heading values to `source-inventory-invalid`, malformed explicit-match values to `source-explicit-match-invalid`, and preserve semantic unresolved-parent behavior.
- Skip a REFACTOR commit because extracting context-dependent parent validation would either duplicate code semantics or require passing issue-code policy into a generic helper.

## Verification

- Focused malformed aggregate selection - 27 passed.
- `uv run pytest tests/test_handoff_identity.py -q` - 77 passed.
- `uv run pytest tests/test_handoff_lifecycle_drift.py tests/test_handoff_lifecycle_gate.py -q --no-cov` - 307 passed.
- Targeted Ruff - passed.
- Targeted basedpyright - 0 errors, 0 warnings, 0 notes.
- `task check` - Ruff format/check passed, basedpyright reported 0 errors/warnings/notes, and all 836 tests passed.
- Representative public execution - `object()` inventory returned `source-inventory-invalid`; `None` explicit matches returned `source-explicit-match-invalid`; neither exposed `value`.
- `git diff --check` - passed.
- Scope audit - only the declared source/test files changed; no deletion, dependency diff, new property decorator, lifecycle/mapping/evidence artifact change, canonical OpenSpec change, or Phase 4-6 behavior was added.

## Threat Model Results

- **T-03-13-01 mitigated:** inventory outer, tuple, member, scalar, and nested-parent shapes are validated for the entire aggregate before path, sort, set, byte-count, or hash operations.
- **T-03-13-02 mitigated:** explicit matches prove an accepted non-string sequence plus every match and parent field before semantic lookup, hashing, comparison, or allocation.
- **T-03-13-03 mitigated:** every fixed malformed row returns a stable `Failure` without partial reconciliation state or allocation evidence.
- **T-03-13-SC accepted as planned:** no package install or dependency change occurred.
- No new network endpoint, authentication path, file-access operation, schema change, or unplanned trust boundary was introduced.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Authentication Gates

None.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None. The pre-existing parser assignment `raw_line=""` is an internal construction sentinel and does not flow to UI rendering or represent unfinished plan behavior.

## Next Phase Readiness

- Verification remaining gap 2 and REVIEW CR-02 are closed at the public `reconcile_source_items` seam.
- OpenSpec task 3.1 remains unchecked until the phase-level verifier and corresponding canonical OpenSpec scenario checks complete; this plan does not claim that later boundary gate.
- Phase 4 can be discussed after Phase 3 re-verification; OpenSpec retains final completion authority.

## Self-Check: PASSED

- Both declared source/test artifacts and this summary exist.
- TDD commits `020a7b7` and `ecab0e2` exist in RED-to-GREEN order.
- Focused, full identity, lifecycle, static, type, representative-runtime, diff, scope, property, deletion, and full-project checks passed.
- No generated/runtime file remains untracked.

---
*Phase: 03-lifecycle-drift-gate*
*Completed: 2026-07-28*
