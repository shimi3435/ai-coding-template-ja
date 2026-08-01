---
phase: 03-lifecycle-drift-gate
plan: 21
subsystem: manifest-refresh
tags:
  - tdd
  - approval-evidence
  - tombstones
  - deterministic-ordering
status: complete
requires:
  - phase: 03-lifecycle-drift-gate
    plan: 18
    provides: published 54-item source identity and mapping authority
provides:
  - complete created, updated, and active-to-tombstone refresh change evidence
  - exact source-removal before/after fingerprints through the public preview seam
  - deterministic change ordering by kind rank and UTF-8 source ID bytes
affects:
  - Phase 3 independent reverification
  - refresh approval review
  - Phase 4 repository-wide ownership
tech-stack:
  added: []
  patterns:
    - validated reconciliation projected through one existing preview change authority
    - explicit semantic rank followed by UTF-8 byte ordering
key-files:
  created: []
  modified:
    - src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py
    - tests/test_handoff_manifest_refresh.py
key-decisions:
  - Project a tombstone only when its source ID existed in the previous active state, so historical tombstones are not repeated as fresh changes.
  - Preserve the existing preview schema and order changes by created, updated, tombstoned rank followed by UTF-8 source ID bytes.
  - Keep HND-03 traceability Pending until the independent Phase 3 exit gate owns canonical completion.
patterns-established:
  - "Refresh approval evidence: project validated active and tombstone state differences once through ManifestRefreshPreview.changes."
requirements-completed:
  - HND-03
duration: 10 min
completed: 2026-08-01
---

# Phase 03 Plan 21: Tombstone Refresh Approval Evidence Summary

**Refresh previews now expose exact active-to-tombstone source removals alongside created and updated identities in deterministic approval order.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-08-01T06:26:48Z
- **Completed:** 2026-08-01T06:36:48Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Added a fixed public `preview_manifest_refresh` regression that produces one created,
  one updated, and one active-to-tombstone source transition in an isolated repository.
- Added exact removal evidence using the tombstone's last source path, previous active
  fingerprint, candidate tombstone fingerprint, category, and `source-removed` reason.
- Preserved published 54-item and no-op preview compatibility while enforcing unique,
  deterministic `created`, `updated`, `tombstoned` ordering.

## TDD Gate Compliance

| Gate | Commit | Evidence |
|------|--------|----------|
| RED | `f696eef` | Public preview returned only created and updated rows; the exact tombstone row was absent. |
| GREEN | `a43b02a` | Focused, full refresh, static analysis, and all project checks passed. |
| REFACTOR | None | The minimal GREEN change retained the existing single projection authority without cleanup work. |

## Task Commits

1. **Task 1 RED: expose omitted tombstone refresh evidence** - `f696eef` (test)
2. **Task 1 GREEN: include tombstones in refresh approval evidence** - `a43b02a` (feat)

## Files Created/Modified

- `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py` - Projects
  newly tombstoned previous active identities and applies explicit deterministic ordering.
- `tests/test_handoff_manifest_refresh.py` - Exercises complete exact approval evidence
  through the public refresh preview using an isolated source-pinned repository.

## Decisions Made

- Candidate tombstones are approval changes only when their ID existed in the previous
  active set; previously persisted tombstones do not reappear on every refresh.
- Change ordering uses the semantic rank `created`, `updated`, `tombstoned`, then exact
  UTF-8 bytes of the source ID instead of relying on boolean or locale ordering.
- HND-03 registry traceability remains Pending because Plans 03-22 and 03-23 plus the
  independent Phase 3 review, security, and verification exit evidence remain outstanding.

## Verification

- Named public regression plus pinned complete preview — 2 passed.
- `uv run pytest tests/test_handoff_manifest_refresh.py -q` — passed.
- Targeted Ruff — passed.
- Targeted BasedPyright — 0 errors, 0 warnings, 0 notes.
- `task check` — Ruff format/check and BasedPyright passed; all 950 tests passed.
- `git diff --check` — passed.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None. Empty mutation recorders and optional values in the touched files are test
instrumentation or explicit domain state, not placeholders.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Verification gap 3 / review WR-02 is closed at the public refresh preview seam.
- HND-03 and Phase 3 await Plans 03-22 through 03-23 and independent canonical exit
  verification; Phase 4 does not advance before that boundary.

## Self-Check: PASSED

- Both modified source/test files and this summary exist.
- Commits `f696eef` and `a43b02a` exist in Git history in RED-before-GREEN order.
- No dependency, schema, endpoint, package export, or approval path changed.

---
*Phase: 03-lifecycle-drift-gate*
*Completed: 2026-08-01*
