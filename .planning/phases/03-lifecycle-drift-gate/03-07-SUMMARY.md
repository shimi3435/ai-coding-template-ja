---
phase: 03-lifecycle-drift-gate
plan: 07
subsystem: openspec-gsd-handoff
tags: [lifecycle-drift, source-identity, runtime-validation, tdd, fail-closed]

requires:
  - phase: 03-lifecycle-drift-gate
    plan: 06
    provides: repository-bound complete public lifecycle decisions
provides:
  - complete runtime validation for canonical Progress and changed source IDs
  - one safe reusable SourceIdentityState validation authority
  - public-classifier and public-gate regressions for malformed nested canonical state
affects: [03-08-boundary-validation, lifecycle-identity, source-reconciliation, phase-verification]

tech-stack:
  added: []
  patterns: [validate-before-dereference, shared Result validator, fail-closed nested observation]

key-files:
  created:
    - .planning/phases/03-lifecycle-drift-gate/03-07-SUMMARY.md
  modified:
    - src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py
    - src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py
    - tests/test_handoff_lifecycle_drift.py
    - tests/test_handoff_lifecycle_gate.py

key-decisions:
  - "SourceIdentityState validation is exposed once as a Result-returning authority and reused by reconciliation and canonical classification."
  - "Nested canonical values are validated in outer/container/member/field/invariant order before comparison, set construction, sorting, or identity encoding."

patterns-established:
  - "Malformed complete-looking canonical values converge on canonical-observation-incomplete with empty evidence and no reusable identity."
  - "Finite malformed runtime families use fixed public-seam parameter tables; the sole checkbox-normalization property family remains unchanged."

requirements-completed: [HND-03]

duration: 14min
completed: 2026-07-28
status: complete
---

# Phase 03 Plan 07: Complete Nested Canonical Observation Validation Summary

**The canonical classifier and lifecycle gate now reject malformed Progress, changed source IDs, and SourceIdentityState values before comparison, sorting, dereference, or reusable identity encoding.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-07-28T04:33:31Z
- **Completed:** 2026-07-28T04:47:19Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added exact Progress counter, tuple/member/field, done-count, and total-count validation inside the existing canonical completeness seam.
- Validated every changed source ID as an exact string before uniqueness and sorting.
- Added `validate_source_identity_state(value: object)` as the safe Result-returning entry point over the existing complete source-state invariants.
- Reordered source-state validation so outer values, counters, containers, member classes, and member fields are proven before dereference.
- Proved through separate public classifier and boundary-injected public gate matrices that malformed nested state yields wholly unknown, non-admitted, empty, identity-free decisions.

## Task Commits

Each task was committed atomically through its TDD gates:

1. **Task 1 RED: malformed Progress and changed-ID regressions** - `dc5b535` (`test`)
2. **Task 1 GREEN: complete Progress and changed-ID validation** - `44e9078` (`feat`)
3. **Task 2 RED: malformed SourceIdentityState and public-gate regressions** - `94d97d4` (`test`)
4. **Task 2 GREEN: shared safe source-state validation** - `e095748` (`feat`)

No refactor commit was needed; `_is_complete_observation` remains the sole canonical completeness conjunction and the existing source-state invariant implementation remains the single authority behind the new public Result seam.

## TDD Evidence

### RED

- Task 1 selected node IDs failed 36 of 38 parameter rows: malformed Progress was reported as drifted and a mixed integer/string changed-ID tuple raised `TypeError`. The two non-tuple rows were already rejected by the existing outer container checks.
- Task 2 selected node IDs failed 84 of 98 parameter rows: malformed nested SourceIdentityState values were reported as drifted or `source-reconciliation-incomplete`. The 14 passing rows were the Task 1 closures and the already-guarded outer source-state case.

### GREEN

- Task 1 focused selection passed 38/38; the separately run clean/checkbox backstop passed 2/2.
- Task 2 classifier and boundary-injected public-gate selection passed 98/98.
- The complete lifecycle drift and gate suites passed 257/257.
- Identity reconciliation plus both lifecycle suites passed 307/307.

### REFACTOR/REVIEW

- Reused the existing `_validate_source_state` invariant body behind `validate_source_identity_state`; no partial parallel validator was introduced.
- Kept `classify_canonical_source_drift` and `gate_lifecycle_operation` as the fixed test seams.
- Added no root-package export, serializer, CLI operation, dependency, exception sanitizer, identity-encoding change, or property family.
- Self-review found no scope creep, secret exposure, deletion, or AGENTS.md violation.

## Files Created/Modified

- `src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py` - safely validates complete source identity state and shares that authority with reconciliation.
- `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py` - validates nested Progress, source state, and changed IDs before canonical comparison.
- `tests/test_handoff_lifecycle_drift.py` - covers expected/observed malformed nested state through the public classifier.
- `tests/test_handoff_lifecycle_gate.py` - covers malformed canonical nested state through `FakeBoundary` and the public lifecycle gate.

## Verification

- Task 1 malformed Progress/changed-ID/source-state classifier selection - 96 passed.
- Public lifecycle gate malformed nested-state matrix - 40 passed.
- Clean and checkbox-only regression backstop - 2 passed.
- `uv run pytest tests/test_handoff_lifecycle_drift.py tests/test_handoff_lifecycle_gate.py -q` - 257 passed.
- `uv run pytest tests/test_handoff_identity.py tests/test_handoff_lifecycle_drift.py tests/test_handoff_lifecycle_gate.py -q` - 307 passed.
- Targeted Ruff checks - passed.
- Targeted basedpyright checks - 0 errors, 0 warnings, 0 notes.
- `task check`:
  - Ruff format check - 47 files already formatted.
  - Ruff check - passed.
  - basedpyright - 0 errors, 0 warnings, 0 notes.
  - pytest - 752 passed.
- `git diff --check` - passed.
- Existing checkbox-normalization property family count remained exactly one.

## Threat Results

- T-03-07-01: exact nested type and invariant validation now runs before attribute access, comparison, set construction, or sorting.
- T-03-07-02: every fixed malformed canonical row returns `canonical-observation-incomplete`, `UNKNOWN`, and `admitted=False` with no partial evidence.
- T-03-07-03: the reproduced `AttributeError` and `TypeError` families now return structured unknown decisions without a broad exception sanitizer.
- T-03-07-04: malformed or partial canonical state cannot mint or match a reusable decision identity.
- No new endpoint, authentication path, file-access boundary, schema, dependency, mutation authority, rollback, repair, or route switch was introduced.

## Decisions Made

- Kept all detailed source-state invariants in the established validator body and exposed only one Result-returning wrapper for reuse.
- Required exact scalar types and correct collection/member classes before running existing ID, path, heading, fingerprint, parent, uniqueness, bound, and counter rules.
- Kept malformed source-state details internal to validation; the canonical classifier exposes only the stable `canonical-observation-incomplete` public issue code.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test bug] Corrected two fixed source-state cases that were valid in one fixture**

- **Found during:** Task 2 GREEN
- **Issue:** The path-alias mutation hard-coded one fixture slug, and the scenario counter mutation hard-coded suffix 4; in the classifier fixture those mutations did not violate an invariant.
- **Fix:** Derived the case-folded spec slug and scenario suffix from the actual valid source item so both public matrices exercise the intended alias and counter invariants.
- **Files modified:** `tests/test_handoff_lifecycle_drift.py`, `tests/test_handoff_lifecycle_gate.py`
- **Verification:** Task 2 selected node IDs passed 98/98 after the corrected cases failed under RED behavior and were rejected by GREEN validation.
- **Committed in:** `e095748`

---

**Total deviations:** 1 auto-fixed (1 Rule 1 test bug).
**Impact on plan:** The correction made the planned fixed examples fixture-independent without changing scope or production behavior.

## Issues Encountered

- Ruff formatting hooks reformatted the Task 2 RED and GREEN changes on their first commit attempts. The formatted files were restaged and committed through normal hooks; no hook was bypassed.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None.

## Self-Check: PASSED

- All four planned modified artifacts and this summary exist.
- TDD commits `dc5b535`, `44e9078`, `94d97d4`, and `e095748` exist in RED→GREEN order.
- Focused, lifecycle, identity reconciliation, static-analysis, diff, and full-project checks passed.
- The checkbox-normalization property family remains the sole `@given` family.
- No tracked file was deleted and no generated/runtime file remains untracked.

## Next Phase Readiness

- GAP-1.1 through GAP-1.4 now have fixed public-seam evidence and no unresolved high-severity threat.
- Plan 03-08 remains to close malformed boundary source/capability commit and PlanningInventory validation before Phase 3 re-verification.
- OpenSpec retains final-completion authority; no canonical artifact or tracked handoff was changed.

---
*Phase: 03-lifecycle-drift-gate*
*Completed: 2026-07-28*
