---
phase: 03-lifecycle-drift-gate
plan: 20
subsystem: source-identity
tags:
  - tdd
  - runtime-validation
  - resource-limits
  - fail-closed
status: complete
requires:
  - phase: 03-lifecycle-drift-gate
    plan: 18
    provides: canonical artifact path-role validation and Phase 3 gap inventory
provides:
  - validation-before-dereference for SourceIdentityLimits at both public source readers
  - stable source-limits-invalid failures for malformed outer and field values
  - fixed no-filesystem-work regressions for malformed limits
affects:
  - Phase 3 independent reverification
  - Phase 4 repository-wide ownership
tech-stack:
  added: []
  patterns:
    - exact runtime dataclass type validation before field access
    - exact positive integer resource bounds before source or filesystem work
key-files:
  created: []
  modified:
    - src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py
    - tests/test_handoff_identity.py
key-decisions:
  - Require the exact SourceIdentityLimits outer type before reading any bound field, then accept only exact positive integers.
  - Keep one _valid_limits authority shared by source_inventory_from_bytes and read_source_inventory.
  - Keep HND-03 traceability Pending until independent Phase 3 exit verification owns canonical completion.
patterns-established:
  - "Public source limits: validate exact outer type, then exact positive integer fields, before aggregate or filesystem work."
requirements-completed:
  - HND-03
duration: 6 min
completed: 2026-08-01
---

# Phase 03 Plan 20: Source Identity Limits Validation Summary

**Both public source inventory readers now reject malformed runtime limits as exact structured failures before attribute access or filesystem observation.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-08-01T06:17:37Z
- **Completed:** 2026-08-01T06:23:38Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Added a 30-row public-reader matrix covering `None`, arbitrary objects, subclasses,
  and bool/float/zero/negative values in all three limit fields at both reader seams.
- Strengthened `_valid_limits` to reject malformed outer values before dereference and
  retain exact positive integer semantics for accepted bounds.
- Proved malformed limits expose no partial value and perform no repository resolution,
  stat, or open operation; existing exact and limit+1 behavior remains green.

## TDD Gate Compliance

| Gate | Commit | Evidence |
|------|--------|----------|
| RED | `692da16` | `None` and arbitrary outer values raised `AttributeError`; subclasses were accepted, producing 6 expected failures. |
| GREEN | `ad69e66` | All 30 malformed-limit rows, 03-16 aggregate regressions, boundary tests, full identity tests, and project checks passed. |
| REFACTOR | None | The two-line validator change retained one shared authority without behavior-preserving duplication. |

## Task Commits

1. **Task 1 RED: expose malformed source identity limits** - `692da16` (test)
2. **Task 1 GREEN: validate source identity limits before use** - `ad69e66` (feat)

## Files Created/Modified

- `src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py` - Validates the
  exact limits outer type before reading its exact positive integer fields.
- `tests/test_handoff_identity.py` - Exercises malformed limit families through both
  public readers and proves the filesystem-backed seam performs no observation.

## Decisions Made

- Used `type(limits) is SourceIdentityLimits` so subclasses cannot bypass the exact
  runtime contract of the frozen resource-bound value.
- Kept the existing early `source-limits-invalid` branches in both public readers and
  strengthened only their shared `_valid_limits` authority.
- Left HND-03 traceability Pending because Plans 03-21 through 03-23 and the independent
  Phase 3 exit gate still own canonical completion.

## Verification

- Focused malformed limits plus limit+1 boundary node — 31 passed.
- Both Plan 03-16 malformed aggregate nodes — 29 passed.
- `uv run pytest tests/test_handoff_identity.py -q` — 139 passed.
- Targeted Ruff — passed.
- Targeted BasedPyright — 0 errors, 0 warnings, 0 notes.
- `task check` — Ruff format/check and BasedPyright passed; all 949 tests passed.
- Direct public-reader probe — malformed arbitrary outer values returned exact
  `source-limits-invalid`; an exact positive limits value returned `Success`.
- `git diff --check` — passed.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None. Empty call-recording lists and optional values in the touched files are test
instrumentation or explicit domain state, not placeholders.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Verification gap 1 / review WR-01 is closed at both public source reader seams.
- HND-03 and Phase 3 remain incomplete until Plans 03-21 through 03-23 and independent
  canonical exit verification finish; Phase 4 remains blocked.

## Self-Check: PASSED

- Both modified source/test files and this summary exist.
- Commits `692da16` and `ad69e66` exist in Git history.
- No undeclared source, dependency, schema, endpoint, or package export changed.

---
*Phase: 03-lifecycle-drift-gate*
*Completed: 2026-08-01*
