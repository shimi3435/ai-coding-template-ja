---
phase: 03-lifecycle-drift-gate
plan: 28
subsystem: manifest-migration-preview-validation
tags:
  - tdd
  - migration-preview
  - exception-boundary
  - state-guard
status: complete
requires:
  - phase: 03-lifecycle-drift-gate
    plan: 27
    provides: validator-aligned supported SourceIdentityState subclass admission
provides:
  - total ordinary-exception normalization across migration preview identity validation
  - public getter-throwing supported-subclass apply regression with mutation and filesystem preservation evidence
  - explicit process-control BaseException propagation evidence
affects:
  - Phase 03 Plan 23 fresh independent all-28-plan exit review
  - HND-03 independent security and verification exit gates
tech-stack:
  added: []
  patterns:
    - untrusted preview shape, consistency, and machine-view access share one Exception boundary
    - public apply maps missing preview identity to the existing mutation-free state guard
key-files:
  created:
    - .planning/phases/03-lifecycle-drift-gate/03-28-SUMMARY.md
  modified:
    - src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py
    - tests/test_handoff_migration.py
key-decisions:
  - Normalize every ordinary Exception raised during preview outer, shape, consistency, or machine-view validation to no reusable identity.
  - Preserve BaseException propagation and the existing migration-preview-invalid taxonomy, approval order, target guards, locking, and persistence flow.
  - Leave clean review, security, verifier, HND-03, and Phase 03 completion authority to fresh independent Plan 03-23 execution.
patterns-established:
  - "Total preview identity: all untrusted validation stages complete before identity reuse or public apply mutation."
requirements-completed: []
duration: 6 min
completed: 2026-08-01
---

# Phase 03 Plan 28: Migration Preview Validation Totality Summary

**Public migration apply now converts ordinary exceptions from supported-subclass preview members into the existing mutation-free state-guard failure while leaving process-control exceptions visible.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-08-01T13:00:06Z
- **Completed:** 2026-08-01T13:05:27Z
- **Tasks:** 2
- **Files modified:** 2, plus this summary

## Accomplishments

- Added a public `apply_manifest_migration` regression whose otherwise-valid preview holds
  a supported `SourceIdentityState` subclass that raises `RuntimeError("boom")` only when
  its `active` member is read.
- Moved the preview outer check, shape validation, consistency validation, and machine-view
  construction into one `Exception` boundary inside `_preview_identity`.
- Preserved exact `migration-preview-invalid` / STATE_GUARD / UNKNOWN / ABSENT /
  NOT_NEEDED evidence with no value, zero mutation operations, unchanged target/tree, and
  absent staging.
- Retained valid supported-subclass apply, exact-base preview, arbitrary malformed object,
  deterministic preview, tombstone collision, approval, target, locking, and persistence
  behavior without changing taxonomy, schema, dependencies, or source-identity authority.

## TDD Gate Compliance

| Gate | Commit | Evidence |
|---|---|---|
| RED | `e30a7f2` | The desired public structured-failure test failed because `RuntimeError: boom` escaped from `_preview_has_valid_shape` before mutation. |
| GREEN | `236a4c3` | The same public call returned exact existing state-guard evidence with zero mutation and unchanged filesystem state. |
| REFACTOR | None | The GREEN implementation is the minimal single-boundary change; self-review found no concrete cleanup defect. |

## Task Commits

1. **Task 1 RED: expose getter-throwing preview member leakage** - `e30a7f2` (test)
2. **Task 1 GREEN: contain complete preview validation** - `236a4c3` (feat)
3. **Task 2: verify totality scope and exit handoff** - verification-only; no additional production/test commit

## Files Created/Modified

- `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py` - Encloses
  preview outer, shape, consistency, and machine-view validation in one ordinary-exception
  normalization boundary.
- `tests/test_handoff_migration.py` - Adds the public getter-throwing supported-subclass
  regression with exact failure, no-value, zero-mutation, tree/target preservation, and
  staging-absence assertions.
- `.planning/phases/03-lifecycle-drift-gate/03-28-SUMMARY.md` - Records TDD,
  verification, threat mitigation, authority integrity, and Plan 03-23 handoff evidence.

## Exact Public Behavior Evidence

### RED: ordinary getter exception leaked

- The committed RED node built a normal successful preview, replaced only
  `previous_source_items`, and supplied literal approval with the original exact
  `preview_sha256` to public apply.
- The old implementation failed at
  `apply_manifest_migration → _preview_identity → _preview_has_valid_shape →
  validate_source_identity_state → active getter` with exact `RuntimeError: boom`.
- The failure occurred before target resolution or mutation; no staging operation had
  begun.

### GREEN: existing fail-closed state guard

- Public apply returned `ManifestMigrationFailure` with code
  `migration-preview-invalid`, failure point STATE_GUARD, target state UNKNOWN, staging
  state ABSENT, and cleanup outcome NOT_NEEDED.
- The result exposed no value, `MutationRecordingOperations.mutations` was exactly empty,
  target bytes and the complete repository tree were unchanged, and no
  `.handoff.*.tmp` path existed.
- A direct behavior probe printed the same exact structured fields and preservation flags.

### Process-control and regression controls

- A direct public probe with an `active` getter raising `KeyboardInterrupt` observed the
  exception propagate, confirming the new `except Exception` does not suppress
  process-control `BaseException` subclasses.
- The Plan 03-27 valid falsey supported-subclass preview/apply path remained successful.
- Exact-base empty previous state remained successful, arbitrary-object malformed previous
  state retained exact preview-invalid behavior, and the Plan 03-26 tombstone collision
  retained exact INPUT failure without mutation.

## Boundary Rationale

- `_preview_identity` promises one validated identity without leaking ordinary input
  exceptions. Keeping shape validation outside its exception boundary violated that
  contract after supported subclasses became valid inputs in Plan 03-27.
- The single `try` now covers the exact sequence that can touch untrusted preview members:
  outer admission, complete shape validation, consistency validation, and machine-view
  construction. Only a successfully constructed bounded machine view reaches hashing.
- Catching `Exception` is intentionally narrower than catching `BaseException`; ordinary
  malformed-input failures become `None`, while interpreter/process-control signals remain
  observable to callers.

## Decisions Made

- No new validator or source-identity exception policy was introduced. Migration preview
  identity remains the only owner of this public apply normalization boundary.
- The existing public failure taxonomy and ordering remain unchanged: missing identity
  returns preview-invalid before approval, target resolution, locking, staging, or
  persistence.
- Plan 03-28 records implementation and behavior evidence only. Fresh independent Plan
  03-23 remains the sole owner of clean review, ASVS L1 security, all-28-plan verification,
  HND-03 traceability, Phase 03 completion, and Phase 04 unblocking.

## Self-Review

- Reviewed clean working/staged state, the complete `3fc64a5..HEAD` source/test diff, and
  the base-branch summary. The plan-local diff contains only the two owned files.
- Confirmed one `except Exception` covers outer, shape, consistency, and machine-view work;
  no nested duplicate catch or new `BaseException` suppression was added.
- Confirmed malformed input returns `None` before public apply target resolution or
  mutation, while manifest-byte length and identity hashing remain after successful
  machine-view construction.
- Confirmed valid supported-subclass retention, exact-base success, collision failure,
  exact approval, target guards, locking, and persistence code remain unchanged.
- Confirmed no diff in `source_identity.py`, `manifest_v2.py`, taxonomy, dependencies,
  canonical OpenSpec, REQUIREMENTS, ROADMAP, STATE, current review, 03-23,
  03-VALIDATION, or completed plan/summary artifacts.
- **Fixed findings:** none.
- **Judgment-only findings:** none.

## Verification

- RED focused node — failed as required with exact `RuntimeError: boom` from the supported
  subclass `active` getter before mutation.
- GREEN focused and control set — 10 passed.
- Task 2 focused regression/control set — 9 passed.
- Complete migration suite — 54 passed.
- Source-identity malformed-counter/tombstone analogs plus refresh falsey-adapter analog —
  5 passed.
- Targeted Ruff — passed.
- Targeted BasedPyright — 0 errors, 0 warnings, 0 notes.
- `task check` — Ruff format/check passed, BasedPyright reported 0 errors, and all 962
  tests passed in 103.80 seconds.
- `git diff --check` — passed.
- Direct public behavior probe — observed exact preview-invalid state-guard fields, no
  value, zero mutations, unchanged target/tree, absent staging, and propagated
  `KeyboardInterrupt`.
- **Unverified items:** none; no external runtime, credential, service, or manual step is
  required by this change.

## Authority Integrity

- Before this summary, the exact diff from `3fc64a5` contained only the two owned
  source/test files and the required RED then GREEN commits.
- Canonical OpenSpec, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, current
  `03-REVIEW.md`, `03-23-PLAN.md`, `03-VALIDATION.md`, and completed plan/summary
  artifacts remained unchanged.
- No OpenSpec task, HND-03 traceability row, Phase 03 state, clean review/security/verifier
  result, or Phase 04 gate was advanced.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None introduced. The modified source/test lines contain no placeholder, TODO, FIXME,
hardcoded empty UI value, or unwired data source.

## User Setup Required

None - no dependency, secret, external service, or manual configuration was added.

## Next Phase Readiness

- Plan 03-28 implementation and verification evidence are complete.
- Plan 03-23 can now start fresh independent review, ASVS L1 security audit, and
  all-28-plan verification that rejudges current CR-01 without accepting this
  implementation-owned summary as independent evidence.
- HND-03 and Phase 03 remain incomplete, and Phase 04 remains blocked, until Plan 03-23
  completes those canonical exit gates.

## Self-Check: PASSED

- Source, test, and summary files exist.
- Commits `e30a7f2` and `236a4c3` exist in required RED then GREEN order.
- Summary frontmatter records `status: complete` and `requirements-completed: []` without
  claiming HND-03 completion.
- Protected authorities remain unchanged, the implementation diff is limited to the two
  owned source/test files, and only this summary is pending its documentation commit.

---
*Phase: 03-lifecycle-drift-gate*
*Completed: 2026-08-01*
