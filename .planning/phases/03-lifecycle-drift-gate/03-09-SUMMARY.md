---
phase: 03-lifecycle-drift-gate
plan: 09
subsystem: lifecycle-validation
tags: [python, tdd, utf-8, resource-bounds, fail-closed]

requires:
  - phase: 03-08
    provides: Nested canonical runtime validation before public lifecycle decisions
provides:
  - UTF-8 scalar validation for canonical artifact, progress, and changed-source strings
  - Producer-equivalent artifact, task, changed-ID, and aggregate-byte bounds
  - Public classifier and lifecycle-gate regressions for malformed and over-limit observations
affects: [03-lifecycle-drift-gate, lifecycle-identity, canonical-observation]

tech-stack:
  added: []
  patterns:
    - Validate canonical values outer-to-inner before comparison, sorting, set construction, or identity
    - Reuse producer limit authorities at the public classifier boundary

key-files:
  created: []
  modified:
    - src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py
    - tests/test_handoff_lifecycle_drift.py
    - tests/test_handoff_lifecycle_gate.py

key-decisions:
  - "SourceIdentityState strings remain exclusively validated by validate_source_identity_state and are excluded from the canonical aggregate-byte recount."
  - "No REFACTOR commit was warranted: shared UTF-8 and aggregate-byte helpers already keep the GREEN implementation cohesive without behavior-neutral churn."

patterns-established:
  - "Canonical observation validation order: outer/container/count/member/field/UTF-8/bounds/invariant/semantic operations."
  - "Limit tests prove exact authority boundaries and limit+1 behavior through classifier and gate public seams."

requirements-completed: [HND-03]

duration: 8min
completed: 2026-07-28
status: complete
---

# Phase 3 Plan 9: Canonical Structured Observation Bounds Summary

**Strict UTF-8 scalar and producer-equivalent resource validation now stops malformed canonical observations before comparison or lifecycle identity generation.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-28T13:17:53Z
- **Completed:** 2026-07-28T13:25:58Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Rejects lone surrogates in artifact paths, digests, task IDs/descriptions, and changed source IDs on expected and observed classifier sides.
- Accepts exactly 4096 tasks, 64 artifacts, 4096 changed IDs, and 4 MiB aggregate canonical bytes while rejecting each limit+1 value.
- Projects every malformed or over-limit public-gate row as `canonical-observation-incomplete`, unknown, non-admitted, empty, and identity-free.
- Preserves the sole existing checkbox-normalization `@given` family and all existing lifecycle behavior.

## TDD Cycle

### Task 1: Reject non-UTF-8-scalar canonical strings before semantic use

- **RED:** `9dff11c` — `test(03-09): expose malformed Unicode canonical observations`
  - 16 fixed classifier/gate rows failed: classifier returned drifted and gate identity/sorting raised `UnicodeEncodeError`.
- **GREEN:** `a528159` — `feat(03-09): validate canonical observation UTF-8 scalars`
  - Exact-string type checks now precede strict UTF-8 encoding and every semantic operation.
- **REFACTOR:** No commit. The shared `_are_utf8_scalars` helper made further behavior-neutral consolidation unnecessary.

### Task 2: Enforce producer-equivalent canonical count and aggregate-byte bounds

- **RED:** `147cf39` — `test(03-09): expose unbounded canonical structured observations`
  - 4097 tasks, 65 artifacts, 4097 changed IDs, and 4 MiB+1 canonical bytes remained clean/drifted or received gate identities.
- **GREEN:** `eccc442` — `feat(03-09): enforce canonical structured observation bounds`
  - Collection lengths are rejected before member iteration; aggregate bytes stop at the first limit+1 contribution.
- **REFACTOR:** No commit. The bounded aggregate helper and direct authority imports were already minimal and cohesive.

## Exact Boundary Results

| Boundary | Accepted | Rejected | Authority |
|---|---:|---:|---|
| Tasks | 4096 | 4097 | `progress.MAX_TASKS` |
| Artifacts | 64 | 65 | `DEFAULT_ARTIFACT_LIMITS.max_files` |
| Changed source IDs | 4096 | 4097 | `SourceIdentityLimits().max_items` |
| Aggregate canonical bytes | 4,194,304 | 4,194,305 | `DEFAULT_ARTIFACT_LIMITS.bytes_total` |

Source-state strings are not counted again because `validate_source_identity_state` retains its independent item and 8 MiB aggregate authority.

## Files Created/Modified

- `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py` — Adds scalar, collection-count, and aggregate-byte completeness validation.
- `tests/test_handoff_lifecycle_drift.py` — Adds fixed expected/observed malformed Unicode and exact boundary classifier rows.
- `tests/test_handoff_lifecycle_gate.py` — Adds expected/current-observed gate injection rows with wholly unknown projections.

## Decisions Made

- Kept `classify_canonical_source_drift` and `gate_lifecycle_operation` as the only test seams.
- Reused all producer authorities instead of copying numeric constants.
- Kept `validate_source_identity_state` as the sole nested source-state validator.
- Made no REFACTOR commit because neither GREEN implementation contained behavior-neutral duplication worth changing.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The first GREEN commit attempt was stopped by `ruff-format`; the hook-applied formatting was staged and the normal verified commit succeeded.
- The Task 2 RED fixture initially treated a newly allocated observation with non-empty changed IDs as clean. The test baseline was corrected before the RED commit so failures isolated the missing bounds.

## Verification

- `uv run pytest tests/test_handoff_lifecycle_drift.py::test_canonical_observation_rejects_non_utf8_scalar_before_comparison tests/test_handoff_lifecycle_gate.py::test_malformed_unicode_and_over_limit_canonical_observation_is_wholly_unknown -q` — 16 passed after Task 1 GREEN.
- Task 2 focused three-node command — 22 passed after Task 2 GREEN.
- `uv run pytest tests/test_handoff_lifecycle_drift.py tests/test_handoff_lifecycle_gate.py -q` — 290 passed.
- `uv run ruff check ...` — passed.
- `uv run basedpyright ...` — 0 errors, 0 warnings, 0 notes.
- `git diff --check` — passed.
- `task check` — format, lint, typecheck, and 788 tests passed.
- Exactly one `@given` family remains, scoped to checkbox normalization.
- Optional real OpenSpec/GSD/host smoke was not run because it remains explicitly opt-in and outside this plan.

## Threat Dispositions

| Threat | Disposition | Evidence |
|---|---|---|
| T-03-09-01 malformed nested strings | Mitigated | Strict UTF-8 validation precedes semantic operations on both classifier sides and at the gate. |
| T-03-09-02 collection/aggregate exhaustion | Mitigated | Producer authorities accept exact limits and reject limit+1 before lifecycle identity. |
| T-03-09-03 identity spoofing/replay | Mitigated | Invalid observations converge on unknown with no reusable identity. |
| T-03-09-SC package supply chain | Accepted | No dependency or package change occurred. |

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- HND-03 root gap 1 is closed at both public seams.
- Plans 03-10 and 03-11 remain the separate gap-closure work for repository anchoring/graph consistency and mapping nested validation.

## Self-Check: PASSED

- All three modified implementation/test files exist.
- RED/GREEN commits `9dff11c`, `a528159`, `147cf39`, and `eccc442` exist in order.
- Focused, phase-nearest, and full project verification passed.

---
*Phase: 03-lifecycle-drift-gate*
*Completed: 2026-07-28*
