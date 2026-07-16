---
phase: 01-stable-identity-and-migration
plan: 05
subsystem: openspec-gsd-handoff
tags: [manifest-migration, atomic-persistence, approval-binding, fault-injection, tdd]

requires:
  - phase: 01-stable-identity-and-migration
    provides: immutable source-bound migration preview and exact schema-2 candidate from Plan 01-04
provides:
  - exact-preview approval-bound schema-1 to schema-2 apply
  - no-follow bounded staging writes with fsync and atomic replacement
  - structured target, staging, cleanup, and partial-failure evidence
affects: [02-source-mapping, 05-recovery, 06-finalize]

tech-stack:
  added: []
  patterns:
    - revalidate repository, target, canonical snapshot, and approval identity before mutation
    - prove v1 preservation through a bounded post-failure target reread
    - attempt staging cleanup at most once without rollback or repair

key-files:
  created: []
  modified:
    - src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py
    - tests/test_handoff_migration.py

key-decisions:
  - "Apply accepts only the immutable preview plus literal approval and its exact preview hash; no replacement repository or target argument exists."
  - "A failed mutation reports v1-preserved only after a fresh bounded reread matches the previewed schema-1 hash; all other observations are unknown."
  - "The schema-2 staging file is no-follow opened, fsynced, bounded-reread, strict-parsed, byte/value compared, and replaced only after a second source/target guard."

patterns-established:
  - "Migration failure evidence keeps failure point, target state, staging state, and cleanup outcome independent."
  - "Partial replacement never triggers automatic retry, rollback, downgrade, repair, or route switching."

requirements-addressed: [HND-01]
requirements-completed: []

duration: 9 min
completed: 2026-07-17
status: complete
---

# Phase 1 Plan 5: Approval-Bound Atomic Migration Summary

**Fresh preview approval, durable same-directory staging, atomic schema-2 replacement, and bounded evidence that distinguishes preserved v1 from unknown partial state**

## Performance

- **Duration:** 9 min
- **Started:** 2026-07-16T21:57:50Z
- **Completed:** 2026-07-16T22:06:46Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `apply_manifest_migration(...)` without a caller-supplied repository or target, package-root export, or CLI operation.
- Bound mutation to literal approval, the exact preview identity, a self-consistent schema-2 candidate, the canonical repository real path, the fixed manifest tail, fresh v1 bytes, and a reobserved canonical source snapshot.
- Added no-follow bounded target/staging reads and an fsynced staging write, then strict schema-2 byte/value validation and one `os.replace` after a second source/target guard.
- Added immutable failure evidence for approval, state guard, create, write, reread, validate, and replace boundaries with separate target, staging, and cleanup classifications.
- Proved v1 preservation only by bounded post-failure hash equality; changed, unreadable, or oversized target observations remain `unknown` and are never repaired or rolled back.

## TDD Evidence

### Task 1: Bind approval and atomically apply the candidate

- **RED:** `e9cb4c7` failed collection because the apply seam and migration evidence types did not exist.
- **GREEN:** `2e89546` added exact approval binding, candidate self-validation, repeated repository/source/target guards, fsynced staging validation, and atomic replacement.

### Task 2: Preserve v1 or report unknown across faults

- **RED:** `5b10b97` produced two behavioral failures: write-time concurrent target drift was incorrectly reported as preserved, and unchanged replace failure was always reported as unknown.
- **GREEN:** `9d2dffb` added one cleanup attempt followed by bounded target reread classification for every staging/replace failure.
- **REFACTOR:** No separate refactor commit was needed.

## Task Commits

1. **Task 1: Bind approval to fresh bytes and atomically apply the validated candidate**
   - `e9cb4c7` — test: failing approved migration contract
   - `2e89546` — feat: approved atomic migration
2. **Task 2: Preserve schema 1 or report unknown across the complete fault matrix**
   - `5b10b97` — test: failing migration fault matrix
   - `9d2dffb` — feat: partial-failure classification

## Files Modified

- `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py` — migration apply result types, durable filesystem adapter, repeated guards, staging validation, cleanup, and post-failure target evidence.
- `tests/test_handoff_migration.py` — approval/replay/drift integration checks plus create/write/reread/validate/replace/cleanup fault evidence.

## Fault Matrix

| Failure | Failure point | Staging evidence | Cleanup | Target evidence |
| --- | --- | --- | --- | --- |
| approval absent or stale | `approval` | `absent` | `not-needed` | `unknown` without a target read |
| repository, target, source, or v1 guard | `state-guard` | `absent` or `validated` | `not-needed` or one attempt | bounded reread decides `v1-preserved` / `unknown` where available |
| staging create | `create` | `unknown` | `not-needed` because no safe staging path was returned | bounded reread |
| staging write / fsync | `write` | `unknown` | one attempt | bounded reread |
| staged bounded reread | `reread` | `unknown` | one attempt | bounded reread |
| staged bytes/schema/value mismatch | `validate` | `invalid` | one attempt | bounded reread |
| atomic replace failure | `replace` | `validated` | one attempt | exact old hash is preserved; changed/unreadable/oversized is unknown |

## Decisions Made

- The preview remains the only approval object. Apply cannot substitute a target, reconstruct a candidate, or call MVP `ManifestRepository.persist` for schema 2.
- Canonical artifacts, tasks progress, source inventory, target path safety, and target bytes are reobserved before staging and again before replacement where relevant.
- Cleanup runs once at most and precedes the final target observation so returned evidence describes the post-cleanup state.
- An apply failure never mutates the historical tracked handoff as part of recovery and never infers a successful replace from an exception.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Kept Phase 1 completion pending independent verification**
- **Found during:** Plan metadata close-out
- **Issue:** `roadmap.update-plan-progress` marked Phase 1 and HND-01 complete from the fifth summary before the orchestrator's independent phase verifier had run.
- **Fix:** Kept all five plans complete while restoring the phase and requirement to verification-pending state.
- **Files modified:** `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`
- **Verification:** Roadmap reports 5/5 plans with `Verification pending`; HND-01 remains unchecked for the verifier/orchestrator.
- **Committed in:** Plan metadata commit

**2. [Rule 1 - Bug] Reconciled stale human-readable state metrics**
- **Found during:** Plan metadata close-out
- **Issue:** GSD state mutations updated frontmatter but left the human-readable activity, phase progress, totals, and metric table at Plan 01-04 values.
- **Fix:** Reconciled the state body to five completed plans, 48 total minutes, Plan 01-05 completion, and Phase 1 verification pending.
- **Files modified:** `.planning/STATE.md`
- **Verification:** Frontmatter and prose agree that implementation plans are complete while zero phases are independently verified.
- **Committed in:** Plan metadata commit

---

**Total deviations:** 2 auto-fixed Rule 1 metadata bugs.
**Impact on plan:** Implementation scope is unchanged; the corrections prevent premature phase completion and stale recovery state.

## Issues Encountered

- Self-review found and removed one tautological path assertion from the repository-alias test; the behavior assertion on the moved repository bytes remains.
- The fault adapter deliberately simulates a replace that changes, removes, or oversizes the target before raising. The implementation leaves those states untouched and reports `unknown`, demonstrating the no-rollback contract.

## Test Results

- `uv run pytest tests/test_handoff_migration.py -q` — 17 passed.
- `uv run pytest tests/test_handoff_identity.py tests/test_handoff_manifest_v2.py tests/test_handoff_migration.py tests/test_handoff_manifest.py tests/test_handoff_cli.py -q` — 130 passed.
- `task check` — ruff format/check, basedpyright, and 329 tests passed.
- `uv run python -m ai_coding_template_ja.openspec_gsd_handoff --help` — public CLI remains exactly `inspect`, `prepare`, and `mark-started`.
- `git diff --check` — passed.
- Historical `.planning/openspec/.../handoff.json`, `handoff-brief.md`, canonical OpenSpec `tasks.md`, package root, and CLI module have no Plan 01-05 diff.

## TDD Gate Compliance

- Both material tasks have a failing `test(01-05)` commit before the corresponding `feat(01-05)` commit.
- RED failures were the absent public apply seam and two incorrect target-state classifications, not syntax or unrelated infrastructure.
- Tests observe the public module seam and an injectable filesystem boundary; no private helper is asserted.
- No new property family was added. Migration persistence remains fixed filesystem integration evidence as required by the Phase 2 evidence catalog.

## Known Stubs

None. Empty mappings, ownership, and lifecycle collections remain the intentional exact Phase-1 schema-2 placeholders created by Plan 01-04 and owned by later phases.

## Threat Surface

No unplanned threat surface. The planned mutation boundary rejects symlinks and repository aliases, uses bounded no-follow I/O, verifies the closed staging value before replacement, and reports partial replacement without rollback.

## User Setup Required

None - no optional OpenSpec/GSD tool, external service, network, or user configuration is required.

## Unverified Operator Boundary

The tracked historical `handoff.json` was intentionally not migrated. Applying a real migration to that audit artifact requires a later fresh preview and separate explicit operator approval; this plan verified only isolated temporary repositories.

## Next Phase Readiness

Phase 1 implementation plans are complete. Independent Phase 1 verification can now validate HND-01 against the canonical source pin before Phase 2 is allowed to start.

## Self-Check: PASSED

- Both modified files exist and all four RED/GREEN commits exist in order.
- Focused migration, Phase 1/v1 regression, project check, and CLI checks are green.
- No historical manifest, brief, OpenSpec task checkbox, package export, or CLI operation changed.

---
*Phase: 01-stable-identity-and-migration*
*Completed: 2026-07-17*
