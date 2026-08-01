---
phase: 03-lifecycle-drift-gate
plan: 19
subsystem: lifecycle-drift-gate
tags:
  - tdd
  - phase-graph
  - canonical-path
  - unicode-nfc
  - fail-closed
status: complete
requires:
  - phase: 03-lifecycle-drift-gate
    plan: 18
    provides: disjoint canonical mapping artifact path roles
provides:
  - canonical UTF-8 NFC POSIX phase-path validation on both graph sides
  - identity-free UNKNOWN decisions for malformed phase graph paths
  - fixed public-gate regressions for backslash, NUL, and non-NFC paths
affects:
  - Phase 3 independent reverification
  - Phase 4 repository-wide ownership
tech-stack:
  added: []
  patterns:
    - validate literal POSIX path shape before graph semantics
    - apply one shared phase-node validator to expected and observed graphs
key-files:
  created: []
  modified:
    - src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py
    - tests/test_handoff_lifecycle_gate.py
key-decisions:
  - Reject backslash, NUL, empty/dot/dot-dot components, non-NFC components, and empty phase suffixes before phase graph normalization or comparison.
  - Preserve the shared _validate_phase_nodes boundary so source-pinned expected and current observed graphs receive identical canonical-path validation.
  - Keep HND-03 traceability Pending until independent Phase 3 exit verification owns canonical completion.
patterns-established:
  - "Canonical phase path: exact string, literal slash split, NFC components, and exact .planning/phases/{phase_id}-{nonempty-suffix} reconstruction."
requirements-completed:
  - HND-03
duration: 6 min
completed: 2026-08-01
---

# Phase 03 Plan 19: Canonical Phase Path Validation Summary

**Malformed source-pinned and current phase paths now fail closed as identity-free UNKNOWN decisions before graph comparison or remediation.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-08-01T06:07:51Z
- **Completed:** 2026-08-01T06:13:19Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Added a six-row public-gate regression matrix covering backslash, embedded NUL,
  and non-NFC phase paths independently on expected and observed graph inputs.
- Strengthened `_canonical_phase_path` to enforce exact canonical POSIX repository-relative
  phase paths with nonempty phase slugs and NFC-normalized components.
- Preserved deterministic valid add/remove/path/dependency/simultaneous drift decisions,
  valid-clean identity compatibility, and the existing public decision shape.

## TDD Gate Compliance

| Gate | Commit | Evidence |
|------|--------|----------|
| RED | `b114d94` | Expected-side malformed paths produced identity-bearing DRIFTED decisions; 3 failed and 3 observed-side rows passed. |
| GREEN | `12d72bd` | All six malformed rows returned the complete identity-free UNKNOWN projection; full lifecycle and project checks passed. |
| REFACTOR | None | The focused validator change introduced no behavior-preserving duplication. |

## Task Commits

1. **Task 1 RED: expose malformed canonical phase paths** - `b114d94` (test)
2. **Task 1 GREEN: validate canonical phase paths before drift** - `12d72bd` (feat)

## Files Created/Modified

- `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py` - Rejects
  malformed phase paths before normalization, comparison, remediation, or identity.
- `tests/test_handoff_lifecycle_gate.py` - Exercises all three malformed path families
  on both expected and observed graph sides through the public lifecycle gate.

## Decisions Made

- Used literal `/` splitting and exact reconstruction instead of implicit path normalization,
  so malformed separators and components are rejected rather than repaired.
- Kept validation in `_validate_phase_nodes`; no second expected/observed path authority was added.
- Left HND-03 traceability Pending because the canonical Phase 3 exit gate still requires
  all gap plans and independent review, verification, and security evidence.

## Verification

- Focused malformed and graph projection selection — 33 passed.
- `uv run pytest tests/test_handoff_lifecycle_gate.py -q` — 183 passed.
- Targeted Ruff — passed.
- Targeted BasedPyright — 0 errors, 0 warnings, 0 notes.
- `task check` — Ruff format/check and BasedPyright passed; all 919 tests passed.
- `git diff --check` — passed.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None. Empty tuples and optional identity fields in the touched files are explicit
fail-closed domain values or test expectations, not placeholders.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Verification gap 1 / review CR-01 is closed at the public lifecycle seam.
- HND-03 and Phase 3 remain incomplete until Plans 03-20 through 03-23 and independent
  canonical exit verification finish; Phase 4 remains blocked.

## Self-Check: PASSED

- Both modified source/test files exist.
- Commits `b114d94` and `12d72bd` exist in Git history.
- No undeclared source, test, dependency, schema, evidence, or package export changed.

---
*Phase: 03-lifecycle-drift-gate*
*Completed: 2026-08-01*
