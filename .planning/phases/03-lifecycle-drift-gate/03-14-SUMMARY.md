---
phase: 03-lifecycle-drift-gate
plan: 14
subsystem: lifecycle-admission
tags: [tdd, sha256, stale-replay, fail-closed]

requires:
  - phase: 03-lifecycle-drift-gate
    provides: "Sole public lifecycle gate and lifecycle-gate-decision-v1 identity encoder"
provides:
  - "Stale rejection identities bound to the complete returned DRIFTED decision"
  - "Two-step public replay regression proving stale identities cannot admit unchanged evidence"
affects: [03-15, 03-16, phase-03-verification, HND-03]

tech-stack:
  added: []
  patterns:
    - "Finalize security-relevant decision fields before computing their reusable identity"

key-files:
  created: []
  modified:
    - src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py
    - tests/test_handoff_lifecycle_gate.py

key-decisions:
  - "A stale rejection retains a reusable identity, but that identity is recomputed only after DRIFTED state, non-admission, and lifecycle-decision-stale are final."
  - "No REFACTOR commit was needed because GREEN introduced no duplicate identity authority or stale-branch complexity."

patterns-established:
  - "Returned lifecycle identities authenticate the complete caller-visible decision rather than a pre-mutation decision."

requirements-completed: [HND-03]

duration: 6min
completed: 2026-07-29
status: complete
---

# Phase 03 Plan 14: Stale Rejection Identity Replay Summary

**Stale lifecycle rejections now publish a stable SHA-256 identity for the exact DRIFTED, non-admitted decision, preventing that identity from admitting an unchanged replay.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-29T05:04:41Z
- **Completed:** 2026-07-29T05:08:14Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Added a three-call public-gate regression: initial clean, first stale after a manifest-byte change, and repeated stale using only the first rejection's returned identity.
- Constructed the complete stale decision before invoking the existing `lifecycle-gate-decision-v1` identity encoder.
- Preserved current clean reuse, malformed identity, incomplete observation, constant-time prior comparison, and lowercase 64-hex identity contracts.

## RED / GREEN / REFACTOR Evidence

### RED

`test_stale_rejection_identity_cannot_be_replayed_into_admission` failed at the second replay because the existing stale return retained the current clean digest:

- Initial call: `CLEAN`, `admitted=True`, identity present.
- First stale call: `DRIFTED`, `admitted=False`, `("lifecycle-decision-stale",)`, identity present and distinct from the initial clean identity.
- Second call with the returned stale identity: unexpectedly `CLEAN`, `admitted=True`.

### GREEN

The stale mismatch branch now first creates a `LifecycleGateDecision` with final `DRIFTED` state, `admitted=False`, UTF-8-sorted stale issue codes, and no provisional identity. It then computes the identity through the existing `_decision_identity(observation.value, stale_decision)` authority.

The fixed three-call outcomes are:

- Initial call: `CLEAN`, `admitted=True`.
- First stale call: `DRIFTED`, `admitted=False`, exactly `("lifecycle-decision-stale",)`.
- Second stale replay: `DRIFTED`, `admitted=False`, exactly `("lifecycle-decision-stale",)`.
- Both stale calls return the same lowercase 64-hex identity, and it differs from the initial clean identity.

### REFACTOR

No REFACTOR commit was needed. The GREEN implementation already uses one explicit intermediate decision and the existing single identity authority without behavior-preserving duplication.

## Task Commits

1. **RED: expose stale rejection identity replay** - `8b1d8a9` (`test`)
2. **GREEN: bind stale identity to stale decision** - `49d2300` (`feat`)

## Files Created/Modified

- `tests/test_handoff_lifecycle_gate.py` - Adds the fixed public-seam two-step stale replay regression.
- `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py` - Recomputes identity after the stale rejection fields are final.

## Verification

- `uv run pytest tests/test_handoff_lifecycle_gate.py::test_stale_rejection_identity_cannot_be_replayed_into_admission -q` — RED failed specifically because the repeated replay was `CLEAN`; GREEN passed.
- Focused current-reuse, malformed-identity, and incomplete-observation nodes — 7 passed.
- `uv run pytest tests/test_handoff_lifecycle_gate.py -q` — 161 passed.
- `uv run ruff check src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py tests/test_handoff_lifecycle_gate.py` — passed.
- `uv run basedpyright src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py tests/test_handoff_lifecycle_gate.py` — 0 errors, 0 warnings, 0 notes.
- `git diff --check` — passed.
- `task check` — format and lint passed, BasedPyright reported 0 findings, and 837 tests passed.

## Decisions Made

- Retained a reusable stale identity and recomputed it from the complete stale decision, as required by the plan, instead of clearing it or introducing a separate token.
- Kept `hmac.compare_digest`, the public gate signature, the typed encoder version, and all clean/unknown behavior unchanged.

## Deviations from Plan

None - plan executed exactly as written.

## Security and Threat Dispositions

- **T-03-14-STALE (high): mitigated.** A stale rejection identity now binds the returned state, admission flag, and issue tuple; its unchanged replay remains stale and non-admitted.
- **T-03-14-ROOT (high): transferred.** Repository-root substitution remains owned by Plan 03-15 and is not changed here.
- **T-03-14-SC (low): accepted.** No dependency or package change occurred.
- No new network endpoint, authentication path, filesystem access pattern, schema boundary, or identity authority was introduced.

## Known Stubs

None.

## Issues Encountered

None beyond the expected RED failure.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Gap 1 / REVIEW CR-01 is closed at the sole public lifecycle gate seam.
- Plans 03-15 and 03-16 still own the independent source-reader gap families.
- Phase 03 completion remains owned by independent verification after all three gap-closure plans; this plan does not claim phase completion.

## Self-Check: PASSED

- Both modified source/test files exist.
- RED commit `8b1d8a9` and GREEN commit `49d2300` exist in the required order.
- The TDD regression fails before production edits and passes after GREEN.

---
*Phase: 03-lifecycle-drift-gate*
*Completed: 2026-07-29*
