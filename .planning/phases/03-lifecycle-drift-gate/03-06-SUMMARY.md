---
phase: 03-lifecycle-drift-gate
plan: 06
subsystem: openspec-gsd-handoff
tags: [lifecycle-gate, repository-identity, portable-evidence, tdd, fail-closed]

requires:
  - phase: 03-lifecycle-drift-gate
    plan: 04
    provides: fail-closed malformed canonical observation validation
  - phase: 03-lifecycle-drift-gate
    plan: 05
    provides: complete capability, nested-limit, and raw DAG admission validation
provides:
  - complete public artifact-drift and checkbox-progress projection
  - repository-scoped reusable lifecycle decision identity
  - portable v2 reviewer evidence with three deterministic repository relations
  - green regressions for all seven Phase 3 verification counterexamples
affects: [04-repository-wide-ownership, recovery-gates, finalize-gates, lifecycle-verification]

tech-stack:
  added: []
  patterns: [lower-decision projection without recomputation, repository-bound runtime identity, relation-only portable evidence]

key-files:
  created:
    - .planning/phases/03-lifecycle-drift-gate/03-06-SUMMARY.md
  modified:
    - src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py
    - tests/test_handoff_lifecycle_gate.py
    - tests/fixtures/openspec_gsd_handoff/lifecycle/expected-lifecycle-evidence.json
    - .planning/phases/03-lifecycle-drift-gate/03-LIFECYCLE-EVIDENCE.json

key-decisions:
  - "The public lifecycle decision copies exact artifact paths and immutable progress from the canonical source decision and binds both fields into the existing typed identity."
  - "Runtime identity binds the validated repository real path, while tracked and golden evidence publish only identity presence and deterministic same-root/cross-root/replay relations."

patterns-established:
  - "Complete decisions expose all HARD-R2 remediation/progress evidence; unknown decisions expose empty paths, no progress, and no reusable identity."
  - "Portable evidence never serializes repository roots or raw current/prior decision identities."

requirements-completed: [HND-03]

duration: 8min
completed: 2026-07-27
status: complete
---

# Phase 03 Plan 06: Complete Public Lifecycle Evidence and Repository Identity Summary

**The shared lifecycle gate now returns complete artifact/progress evidence, scopes reusable decisions to the validated repository root, and publishes portable relation-only reviewer evidence.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-27T13:44:49Z
- **Completed:** 2026-07-27T13:53:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added immutable `drifted_artifact_paths` and `progress_update_candidate` fields to `LifecycleGateDecision`, projected directly from `CanonicalSourceDriftDecision`.
- Bound the validated `SourceCommitObservation.repository_root` and both public decision fields into the existing `lifecycle-gate-decision-v1` typed length-prefixed SHA-256 identity.
- Proved same-root identity stability, cross-root identity separation, and foreign-root prior identity rejection through the public gate.
- Repinned tracked and independent golden evidence under `lifecycle-evidence-v2` / `repository-portable-lifecycle-evidence-v2`.
- Closed all seven reproduced Phase 3 verification blockers with focused tests and the full project gate.

## Task Commits

Each task was committed atomically through its TDD gates:

1. **Task 1 RED: public lifecycle evidence regressions** - `d99dfbc` (`test`)
2. **Task 1 GREEN: complete source evidence projection** - `5cb549b` (`feat`)
3. **Task 2 RED: repository identity relation regressions** - `88e649d` (`test`)
4. **Task 2 GREEN: repository-bound identity and portable v2 evidence** - `60f46f7` (`feat`)

No refactor commit was needed; the existing projection, identity encoder, and test-side producer remained the sole authorities.

## TDD Evidence

### RED

- Task 1 focused command failed 19 selected cases with `AttributeError` because the two required public fields did not exist.
- Task 2 focused command failed because byte-identical repositories produced the same identity and the new portable v2 producer did not match the v1 tracked record.

### GREEN

- Task 1 focused command passed 19/19 after direct projection, unknown defaults, and decision-domain identity binding.
- Task 2 focused command passed 2/2 after binding the validated real root and repinning portable evidence.
- Both lifecycle suites passed 121/121.
- The combined seven-gap focused selection passed 70/70.

### REFACTOR/REVIEW

- Kept `gate_lifecycle_operation` as the sole production admission seam.
- Reused `_IdentityEncoder`, `_encode_progress`, `_decision_from_observation`, and `_unknown_decision`; no second classifier, serializer, or dependency was added.
- Self-review found no defect, scope creep, secret exposure, or AGENTS.md violation.

## Files Created/Modified

- `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py` - exposes exact path/progress evidence and binds the validated real repository root.
- `tests/test_handoff_lifecycle_gate.py` - covers public projection, cross-root replay, root-independent portable production, and exact v2 schema constraints.
- `tests/fixtures/openspec_gsd_handoff/lifecycle/expected-lifecycle-evidence.json` - independent portable literal golden with complete decision fields and relation booleans.
- `.planning/phases/03-lifecycle-drift-gate/03-LIFECYCLE-EVIDENCE.json` - source-pinned portable v2 reviewer evidence.

## Repository Identity and Portable Evidence Results

- `same_root_identity_stable`: `true`
- `cross_root_identities_distinct`: `true`
- `foreign_root_prior_identity_rejected`: `true`
- Cross-root replay returns `lifecycle-decision-stale`, `DRIFTED`, and `admitted=False`.
- Every decision row contains `drifted_artifact_paths` and `progress_update_candidate`.
- Unknown rows contain `[]` / `null` and `decision_identity_present=false`.
- No exact `repository_root`, `decision_identity`, or `prior_decision_identity` key is serialized.
- Tracked/golden evidence SHA-256: `1434c365fd609f5f810e7845b5946fb6bc5bf286eb2b5216c0905cec48862e9b`.

## Verification

- `uv run pytest tests/test_handoff_lifecycle_gate.py -q -k "canonical_source_has_exact_remediation or checkbox_progress_public_decision or incomplete_dimension"` - 19 passed.
- `uv run pytest tests/test_handoff_lifecycle_gate.py -q -k "repository_root_identity or repository_root_lifecycle_evidence"` - 2 passed.
- `uv run pytest tests/test_handoff_lifecycle_drift.py tests/test_handoff_lifecycle_gate.py -q` - 121 passed.
- Seven-gap focused selection - 70 passed.
- `uv run ruff check src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py tests/test_handoff_lifecycle_gate.py` - passed.
- `uv run basedpyright src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py tests/test_handoff_lifecycle_gate.py` - 0 errors, 0 warnings, 0 notes.
- `task check` full output:
  - `uv run ruff format --check .` - 47 files already formatted.
  - `uv run ruff check .` - all checks passed.
  - `uv run basedpyright` - 0 errors, 0 warnings, 0 notes.
  - `uv run pytest` - 616 tests passed.
- `uv run pytest tests/test_taskfile.py::test_handoff_smoke_is_explicit_and_isolated_from_normal_check -q` - passed.
- `git diff --check` - passed.
- Canonical OpenSpec artifacts, tracked handoff, optional smoke record, Taskfile, package exports, and CLI files remained unchanged.
- Optional real OpenSpec/GSD/host smoke was not run because it remains separately opt-in.

## Threat Results

- T-03-06-01: public projection preserves exact classified paths/progress, includes them in identity, and strips all partial values from unknown decisions.
- T-03-06-02: validated real-root binding prevents repository-crossing identity reuse, while portable evidence exposes only deterministic booleans and no raw root-dependent value.
- No new network endpoint, authentication path, schema, dependency, mutation authority, retry, rollback, repair, or route switch was introduced.

## Decisions Made

- Kept the existing v1 typed encoder version and added exact tags rather than changing encoding or cryptography.
- Used `decision_identity_present` only as a portable availability boolean; raw current/prior digest values remain transient.
- Independently transformed the prior literal golden according to the v2 contract and confirmed it byte-matched the public test-side producer.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The first Task 2 RED commit attempt was stopped by the Ruff formatter. The formatted file was re-tested in RED, restaged, and committed through normal hooks without bypass.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None.

## Self-Check: PASSED

- All four planned modified artifacts and this summary exist.
- TDD commits `d99dfbc`, `5cb549b`, `88e649d`, and `60f46f7` exist in order.
- Focused, lifecycle backstop, static analysis, optional-smoke isolation, and full project checks passed.
- Tracked and golden evidence are byte-identical and contain no raw repository-dependent identity.
- No tracked file was deleted and no generated/runtime file remains untracked.

## Next Phase Readiness

- Plans 03-04 through 03-06 now close all seven independently reproduced blockers with no deferred issue.
- HND-03 / HARD-R2 provides a complete, fail-closed, repository-scoped lifecycle admission decision for downstream ownership, recovery, and finalize phases.
- OpenSpec retains final-completion authority; canonical task 3.1 remains a later independent boundary gate.

---
*Phase: 03-lifecycle-drift-gate*
*Completed: 2026-07-27*
