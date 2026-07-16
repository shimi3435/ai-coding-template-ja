---
phase: 01-stable-identity-and-migration
plan: 04
subsystem: openspec-gsd-handoff
tags: [manifest-migration, read-only-preview, approval-binding, tdd]

requires:
  - phase: 01-stable-identity-and-migration
    provides: exact schema-2 codec, bounded version dispatch, and stable source reconciliation from Plans 01-01 through 01-03
provides:
  - immutable source-bound schema-1 to schema-2 migration preview
  - deterministic repository/target/current-snapshot approval identity
  - fail-closed precondition matrix with no filesystem mutation
affects: [01-05-migration-apply, 02-source-mapping]

tech-stack:
  added: []
  patterns:
    - repeated canonical artifact and source observation around preview construction
    - compact deterministic approval evidence hashed separately from candidate bytes
    - whole-operation structured failure without a partial preview

key-files:
  created:
    - src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py
    - tests/test_handoff_migration.py
  modified: []

key-decisions:
  - "Preview reuses the existing manifest target guard, exact version dispatcher, canonical artifact reader, task progress parser, source reconciliation, and schema-2 serializer rather than creating alternate parsers."
  - "All canonical artifact hashes and canonical tasks progress are observed twice around source inventory construction before an approval identity can be returned."
  - "Prior source identity state is an explicit immutable input for update/tombstone evidence; the schema-1 target remains unchanged and no historical handoff is migrated."

patterns-established:
  - "Bind candidate bytes, source bytes, current artifacts/progress, canonical repository real path, and target identity in one deterministic preview hash."
  - "Return only Failure when any schema, source, artifact, progress, allocation, bounds, or read precondition is incomplete."

requirements-addressed: [HND-01]
requirements-completed: []

duration: 12 min
completed: 2026-07-17
status: complete
---

# Phase 1 Plan 4: Read-Only Migration Preview Summary

**Source-grounded schema-1 to schema-2 candidate preview with deterministic approval binding and zero persistence operations**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-16T21:38:30Z
- **Completed:** 2026-07-16T21:50:56Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added immutable `MigrationCandidateChange` and `ManifestMigrationPreview` values plus the module-level `preview_manifest_migration(...)` seam.
- Composed the existing bounded schema reader, manifest target guard, canonical artifact reader, progress parser, source inventory/reconciliation, and exact schema-2 serializer without adding a CLI operation or package-root export.
- Preserved schema-1 `change_id`, handoff state, and capabilities while replacing artifacts, source commit, and progress with a validated current canonical snapshot.
- Bound repository real path, target identity, old/new byte hashes, observed/current source commits, artifact/progress hashes, source paths, stable identity changes, and exclusions into deterministic approval evidence.
- Added isolated failures for stale artifacts/progress, unknown schema, downgrade, existing schema 2, malformed source, collision, exhausted allocation, oversized source/target, and missing target.
- Proved every preview path is read-only through a mutation-rejecting filesystem adapter and byte-for-byte tree assertions.

## TDD Evidence

### Task 1: Complete read-only migration preview

- **RED:** `71b6f9e` added public-seam examples; collection failed because `manifest_migration` did not exist.
- **GREEN:** `47b8d35` implemented exact candidate construction, stable change evidence, repository/target binding, and deterministic preview hashing.

### Task 2: Fail-closed preview preconditions

- **RED:** `48f2da5` added the incompatible-input matrix; the stale non-source artifact example failed because only spec hashes were revalidated.
- **GREEN:** `35b5d77` re-read all canonical artifacts around source inventory construction and rejected incomplete observations.
- **Regression RED:** `50b7007` proved supplied progress could differ from the current canonical tasks bytes.
- **Regression GREEN:** `e788811` parsed and revalidated tasks progress as part of both artifact observations.
- **REFACTOR:** No separate refactor commit was needed.

## Task Commits

1. **Task 1: Build a complete read-only migration preview**
   - `71b6f9e` — test: migration preview contract RED
   - `47b8d35` — feat: read-only migration preview GREEN
2. **Task 2: Refuse incomplete preview inputs**
   - `48f2da5` — test: preview precondition matrix RED
   - `35b5d77` — feat: fail-closed complete snapshot GREEN
   - `50b7007` — test: progress snapshot regression RED
   - `e788811` — fix: canonical tasks progress binding GREEN

## Files Created

- `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py` — immutable preview/change evidence and read-only migration composition.
- `tests/test_handoff_migration.py` — deterministic/no-mutation examples and incompatible-input matrix.

## Decisions Made

- The candidate preserves only the schema-1 fields whose meaning remains unchanged. Artifacts, source commit, progress, and source identity are taken from the explicitly supplied and filesystem-validated current snapshot.
- The complete canonical artifact set is observed before and after source inventory construction. Any hash, task progress, source inventory, or read result change prevents preview success.
- `mappings`, ownership arrays, and lifecycle arrays remain exact empty Phase-1 placeholders and therefore do not claim operation readiness.
- The preview is module-local approval evidence. It does not add a manifest field, root export, CLI verb, apply operation, policy record, or Git/tool invocation.
- `HND-01` remains pending because Plan 01-05 still owns approval-bound staging, atomic replacement, and failure evidence.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Bound current progress to canonical tasks bytes**
- **Found during:** Post-GREEN approval-binding review
- **Issue:** Candidate progress was schema-valid and hashed, but the preview had not proved that it came from the same canonical `tasks.md` bytes as the artifact snapshot.
- **Fix:** Parse task progress through the existing public seam during both artifact observations and reject any supplied-progress mismatch.
- **Files modified:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py`, `tests/test_handoff_migration.py`
- **Verification:** The regression fails before `e788811`; focused 89 tests and the full 320-test project check pass after it.
- **Committed in:** `e788811`

**2. [Rule 1 - Bug] Corrected incomplete GSD state progress rendering**
- **Found during:** Plan metadata close-out
- **Issue:** `state.update-progress` counted four summaries but wrote `percent: 0`, left the human-readable position at Plan 01-03 / 60%, and appended the new metric outside its table.
- **Fix:** Reconciled `STATE.md` to the on-disk 4/5 summary count, 80% progress, Plan 01-05 readiness, and cumulative performance totals.
- **Files modified:** `.planning/STATE.md`
- **Verification:** State and roadmap both report 4/5 plans, while `01-05-SUMMARY.md` remains absent.
- **Committed in:** Plan metadata commit

---

**Total deviations:** 2 auto-fixed (1 Rule 1 bug, 1 Rule 2 missing critical).
**Impact on plan:** Both fixes preserve accurate progress and complete the planned frozen-current-snapshot contract without expanding into persistence, mapping, or later phases.

## Issues Encountered

- The first content-edit assertion expected both requirement and scenario fingerprints to change. The edited line belongs only to the requirement block, so the test was corrected to require one `REQ-000001` update while preserving both stable IDs.
- Pre-commit formatting modified staged test layout during two RED commits. The modified file was reviewed, fully re-staged, and committed only after the hooks passed; no stash/cache workflow or unstaged patch remained.

## Test Results

- `uv run pytest tests/test_handoff_migration.py tests/test_handoff_identity.py tests/test_handoff_manifest_v2.py -q` — 89 passed.
- `task check` — ruff format/check, basedpyright, and 320 tests passed.
- `uv run python -m ai_coding_template_ja.openspec_gsd_handoff --help` — public root remains exactly `inspect`, `prepare`, and `mark-started`.
- `git diff --check` — passed.
- Historical `.planning/openspec/.../handoff.json`, `handoff-brief.md`, canonical OpenSpec `tasks.md`, package root, and CLI module remain unchanged from source authority `2cbb127...`.

## TDD Gate Compliance

- Each planned task has a failing `test(01-04)` commit before its corresponding GREEN commit.
- RED failures were caused by the absent preview seam, missing all-artifact snapshot validation, and missing tasks-progress binding, not syntax or unrelated infrastructure.
- Tests observe the module-level preview result and filesystem state; they do not mock or assert private helper calls.
- No property family was added; the approved preview-builder property remains owned by later Phase-2 evidence consolidation.

## Known Stubs

None. Empty mappings, ownership, and lifecycle collections are intentional exact schema-2 placeholders owned by later phases and are explicitly not operation-ready.

## Threat Surface

No unplanned mutation surface was introduced. The new filesystem access is read-only, bounded by existing artifact/source/manifest limits, contained by existing canonical path and symlink guards, and exercised with a mutation-rejecting adapter.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 01-05 can accept an immutable `ManifestMigrationPreview`, revalidate its repository/target/current bytes, and implement approval-bound staging/replace failure evidence. The real historical handoff, OpenSpec tasks, mapping, ownership, lifecycle recovery, and Phase 2+ behavior remain unchanged.

## Self-Check: PASSED

- Both declared created files exist.
- All six RED/GREEN/regression commits exist in order.
- Focused and full project checks pass.
- Historical manifest, brief, OpenSpec tasks, package root, and CLI remain unchanged.

---
*Phase: 01-stable-identity-and-migration*
*Completed: 2026-07-17*
