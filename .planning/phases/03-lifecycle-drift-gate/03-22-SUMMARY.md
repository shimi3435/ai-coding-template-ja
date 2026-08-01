---
phase: 03-lifecycle-drift-gate
plan: 22
subsystem: manifest-persistence
tags:
  - tdd
  - flock
  - atomic-replace
  - state-guard
status: complete
requires:
  - phase: 03-lifecycle-drift-gate
    plan: 21
    provides: complete refresh approval evidence including tombstones
provides:
  - one change-directory inode lock shared by migration and refresh writers
  - lock-token and expected-target-hash conditional replacement
  - fixed contention and post-validation mutation integration evidence
affects:
  - Phase 3 independent reverification
  - Phase 4 repository-wide ownership
  - later approval-bound persistence effects
tech-stack:
  added: []
  patterns:
    - duplicated anchored-directory descriptor with non-blocking exclusive flock
    - conditional replacement with two locked target observations and directory fsync
key-files:
  created: []
  modified:
    - src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py
    - src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py
    - tests/test_handoff_migration.py
    - tests/test_handoff_manifest_refresh.py
key-decisions:
  - Bind the writer lock to a duplicated descriptor for the already anchored change-directory inode rather than creating a lock file or process-local mutex.
  - Require one live operations-owned lock token and the previewed target hash at replace_at, then recheck target bytes after the fixed injection seam before rename.
  - Keep HND-03 traceability Pending until Plan 03-23 and the independent Phase 3 exit gate own canonical completion.
patterns-established:
  - "Approval-bound writers: stage and validate first, then hold one change-directory lock across final guards, conditional rename, and parent durability."
requirements-completed:
  - HND-03
duration: 17 min
completed: 2026-08-01
---

# Phase 03 Plan 22: Shared Writer Lock Summary

**Migration and refresh now share one anchored change-directory `flock`, preserving post-validation target updates instead of silently overwriting them.**

## Performance

- **Duration:** 17 min
- **Started:** 2026-08-01T06:42:27Z
- **Completed:** 2026-08-01T06:58:59Z
- **Tasks:** 1
- **Files modified:** 4

## Accomplishments

- Added a private operations-owned lock token bound to a duplicated descriptor and the
  device/inode identity of the anchored `.planning/openspec/<change_id>` directory.
- Required refresh and migration replacement to hold that lock, validate the previewed
  target hash twice around a fixed injection seam, atomically rename, and `fsync` the
  parent directory before release.
- Added fixed integration evidence proving real refresh/migration contention on the same
  directory inode and byte-for-byte preservation of a non-cooperative target update.

## TDD Gate Compliance

| Gate | Commit | Evidence |
|------|--------|----------|
| RED | `6bf317b` | Both fixed regressions returned `Success`: the target mutation was overwritten and a separately held directory lock was ignored. |
| GREEN | `dd9cfd1` | Named regressions, 98 focused tests, static analysis, and all 952 project tests passed. |
| REFACTOR | None | The GREEN implementation already retained one shared persistence authority; no behavior-preserving cleanup was demonstrated. |

## Task Commits

1. **Task 1 RED: expose mutation after locked target validation** - `6bf317b` (test)
2. **Task 1 GREEN: serialize handoff writers through rename** - `dd9cfd1` (feat)

## Files Created/Modified

- `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py` - Owns
  writer-lock acquisition/release, live-token validation, conditional replacement,
  migration classification, atomic rename, and parent durability.
- `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py` - Acquires the
  shared lock after staging validation and maps contention or replacement-boundary drift
  to exact refresh state-guard failures.
- `tests/test_handoff_migration.py` - Forwards the lock token, expected target hash, and
  replacement outcome through all migration fault adapters.
- `tests/test_handoff_manifest_refresh.py` - Proves locked injection-time contention,
  concurrent-byte preservation, cleanup, and shared migration/refresh lock identity.

## Decisions Made

- The synchronization identity is the existing anchored change-directory inode. No
  tracked lock file, dependency, per-process mutex, retry, rollback, or recovery path was
  introduced.
- `replace_at` accepts only a live token owned by the same operations instance and bound
  to the same directory device/inode; malformed, released, wrong-directory, and unknown
  outcomes fail closed before effect.
- The second locked target read handles the deliberate non-cooperative test mutation,
  while the shared lock serializes every in-scope migration and refresh writer.
- HND-03 registry traceability remains Pending because Plan 03-23 and independent review,
  security, and verification evidence still own the Phase 3 completion boundary.

## Verification

- Named mutation, contention, exact refresh apply, and full migration command — 50 passed.
- `uv run pytest tests/test_handoff_manifest_refresh.py tests/test_handoff_migration.py -q` — 98 passed.
- Targeted Ruff — passed.
- Targeted BasedPyright — 0 errors, 0 warnings, 0 notes.
- `task check` — Ruff format/check and BasedPyright passed; all 952 tests passed.
- `git diff --check` — passed.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The first RED commit attempt was stopped by the configured Ruff formatting hook. The
  hook-produced formatting was staged, the same two tests were reconfirmed RED, and the
  commit then passed all hooks.

## Known Stubs

None. Empty recorder collections and blank preview identity seeds in touched files are
test instrumentation or values populated by deterministic preview construction, not
user-visible placeholders.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Verification gap 2 / review CR-02 is closed at the actual replacement boundary.
- Plan 03-23 can produce the independent clean review, security, verification, and final
  HND-03 traceability evidence. Phase 4 remains blocked until that canonical exit gate.

## Self-Check: PASSED

- All four modified source/test files and this summary exist.
- Commits `6bf317b` and `dd9cfd1` exist in Git history in RED-before-GREEN order.
- No dependency, public manifest schema, package export, tracked lock file, endpoint, or
  recovery behavior was introduced.

---
*Phase: 03-lifecycle-drift-gate*
*Completed: 2026-08-01*
