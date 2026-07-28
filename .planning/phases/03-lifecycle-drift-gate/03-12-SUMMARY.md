---
phase: 03-lifecycle-drift-gate
plan: 12
subsystem: lifecycle-admission
tags: [python, canonical-drift, fail-closed, source-identity, tdd]
requires:
  - phase: 03-lifecycle-drift-gate
    plan: 10
    provides: exact lifecycle graph and planning inventory consistency
  - phase: 03-lifecycle-drift-gate
    plan: 11
    provides: complete mapping runtime validation
provides:
  - source-pinned reconciliation baseline consistency before canonical comparison
  - identity-free unknown lifecycle decisions for inconsistent baselines
  - preserved current-side reconciliation drift evidence
affects: [lifecycle-admission, lifecycle-identity, HND-03]
tech-stack:
  added: []
  patterns:
    - validate-complete-baseline-before-comparison
    - unknown-without-partial-evidence
key-files:
  created:
    - .planning/phases/03-lifecycle-drift-gate/03-12-SUMMARY.md
  modified:
    - src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py
    - tests/test_handoff_lifecycle_drift.py
    - tests/test_handoff_lifecycle_gate.py
key-decisions:
  - "A complete source-pinned baseline must have an empty changed_source_item_ids tuple before artifact, source-state, progress, or identity-relevant comparison."
  - "Expected-side reconciliation inconsistency projects only source-reconciliation-incomplete; observed-side reconciliation changes remain ordinary deterministic drift evidence."
patterns-established:
  - "Canonical admission validates source-pinned baseline consistency immediately after structured completeness and before all comparison/projection work."
requirements-completed: [HND-03]
duration: 6min
completed: 2026-07-28
status: complete
---

# Phase 03 Plan 12: Source-Pinned Baseline Consistency Summary

**The canonical classifier now stops an internally inconsistent source-pinned baseline before comparison, and the public lifecycle gate returns a wholly unknown, non-admitted, identity-free decision.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-28T15:35:46Z
- **Completed:** 2026-07-28T15:41:48Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments

- Added the minimal expected-side reconciliation guard immediately after complete structured observation validation.
- Added fixed direct-classifier and `FakeBoundary` public-gate regressions for expected-non-empty/observed-empty reconciliation evidence.
- Preserved expected-empty/observed-non-empty as `DRIFTED` with the exact current changed source ID.
- Kept the public gate, issue vocabulary, identity encoding, evidence schemas, dependencies, and later-phase behavior unchanged.

## Task Commits

The task followed the required plan-level RED/GREEN sequence:

1. **RED: expose inconsistent source-pinned baseline admission** - `4fa7320`
2. **GREEN: reject inconsistent source-pinned baseline** - `6e34471`

No separate REFACTOR commit was warranted. The classifier change is already the smallest ordered guard, and further extraction would add unnecessary authority.

## TDD Evidence

### RED

- The direct classifier regression returned `CLEAN` instead of `UNKNOWN`.
- The public lifecycle gate regression returned no issue, admitted the operation, and assigned a decision identity.
- Focused result: 2 failed for the reproduced false-clean/false-admitted behavior.

### GREEN

- Direct classification returns `UNKNOWN`, issue `source-reconciliation-incomplete`, empty artifact/source evidence, and no progress candidate.
- `gate_lifecycle_operation` returns `UNKNOWN`, `admitted=False`, exactly the stable issue code, empty remediation/progress evidence, and `decision_identity=None`.
- Reversing the asymmetric case retains `DRIFTED` with `changed_source_item_ids=("REQ-000001",)`.

## Files Created/Modified

- `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py` - source-pinned baseline consistency guard before canonical comparison.
- `tests/test_handoff_lifecycle_drift.py` - direct regression, observed-side companion assertion, and stable baseline fixture corrections.
- `tests/test_handoff_lifecycle_gate.py` - public lifecycle gate regression through `FakeBoundary`.

## Decisions Made

- Reuse `_unknown("source-reconciliation-incomplete")`; do not introduce another issue code or partial evidence projection.
- Do not merge expected and observed reconciliation IDs. Expected IDs invalidate the baseline, while observed IDs retain their existing drift meaning.
- Make no REFACTOR commit because the two-line guard is clearer than a new helper.

## Verification

- Focused public seams with `--no-cov` - 2 passed.
- `uv run pytest tests/test_handoff_lifecycle_drift.py tests/test_handoff_lifecycle_gate.py -q --no-cov` - 307 passed.
- Targeted Ruff - passed.
- Targeted BasedPyright - 0 errors, 0 warnings, 0 notes.
- `task check` - Ruff format/check and BasedPyright passed; the full 809-test project suite completed successfully.
- `git diff --check` - passed.
- Structural audit - exactly one existing Hypothesis family remains, limited to checkbox normalization; only the declared classifier and test files changed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test bug] Corrected legacy fixtures that used initial source-ID allocation as a source-pinned baseline**

- **Found during:** Task 1 GREEN full target suite
- **Issue:** Several clean/drift fixtures treated the first observation, whose reconciliation delta contains allocated IDs, as a consistent expected baseline.
- **Fix:** Re-observed the unchanged source against the allocated state before using it as the source-pinned baseline; adjusted the exact-limit assertion to keep non-empty IDs on the observed side.
- **Files modified:** `tests/test_handoff_lifecycle_drift.py`
- **Verification:** The full lifecycle drift/gate target passed 307/307 and current-side reconciliation remains drifted.
- **Committed in:** `6e34471`

---

**Total deviations:** 1 auto-fixed (1 Rule 1 test bug).
**Impact on plan:** The fixture correction aligns existing tests with the new HND-03 baseline invariant without changing public behavior beyond the planned fail-closed case.

## Issues Encountered

None beyond the directly related legacy fixture inconsistency documented above.

## Authentication Gates

None.

## User Setup Required

None - no dependency, service, secret, or external configuration was added.

## Known Stubs

None.

## Threat Model Results

- T-03-12-01 mitigated: a non-empty source-pinned reconciliation tuple returns stable unknown before comparison or projection.
- T-03-12-02 mitigated: the public gate cannot admit or mint an identity from that inconsistent baseline.
- T-03-12-SC accepted as planned: no package or dependency change occurred.
- No new network endpoint, authentication path, file-access pattern, schema change, or unplanned trust boundary was introduced.

## Next Phase Readiness

- REVIEW CR-01 and verification remaining gap 1 are closed at both required public seams.
- Plan 03-13 can independently close malformed source reconciliation aggregate handling.
- OpenSpec retains final completion authority; no canonical artifact or tracked handoff was changed.

## Self-Check: PASSED

- All three declared source/test artifacts and this summary exist.
- TDD commits `4fa7320` and `6e34471` exist in RED→GREEN order.
- Focused, full-target, static, type, diff, property-scope, and full-project checks passed.
- No tracked file was deleted and no generated/runtime file remains untracked.

---
*Phase: 03-lifecycle-drift-gate*
*Completed: 2026-07-28*
