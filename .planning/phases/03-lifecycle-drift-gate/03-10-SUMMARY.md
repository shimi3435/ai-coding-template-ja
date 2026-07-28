---
phase: 03-lifecycle-drift-gate
plan: 10
subsystem: lifecycle-admission
tags: [python, descriptor-relative-io, nofollow, phase-graph, fail-closed, tdd]
requires:
  - phase: 03-lifecycle-drift-gate
    plan: 09
    provides: complete canonical structured observation validation and bounds
provides:
  - repository-anchored no-follow descriptor traversal for handoff.json
  - post-read identity revalidation for the repository root, all parent directories, and final manifest file
  - exact expected/observed phase graph equality with validated PlanningInventory ID/path declarations
affects: [lifecycle-admission, phase-verification, HND-03]
tech-stack:
  added: []
  patterns:
    - retained descriptor ancestry
    - exact graph-to-inventory map equality
key-files:
  created:
    - .planning/phases/03-lifecycle-drift-gate/03-10-SUMMARY.md
  modified:
    - src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py
    - tests/test_handoff_lifecycle_gate.py
key-decisions:
  - "Manifest bytes are read only through retained no-follow descriptors rooted at the validated repository, with every entry revalidated after the bounded read."
  - "Expected and observed phase ID/path maps must each exactly equal the validated PlanningInventory map before mapping readiness or identity generation."
patterns-established:
  - "Authorization input paths retain the complete descriptor chain and compare link-side and opened identities before and after reading."
  - "Phase membership completeness is an exact map equality prerequisite, not ordinary lifecycle drift."
requirements-completed: [HND-03]
duration: 10min
completed: 2026-07-28
status: complete
---

# Phase 03 Plan 10: Repository-Anchored Manifest and Exact Phase Membership Summary

**Lifecycle admission now reads `handoff.json` through a retained no-follow repository descriptor chain and rejects any phase graph not exactly equal to the validated inventory.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-07-28T13:45:48Z
- **Completed:** 2026-07-28T13:55:48Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Opened the validated repository root, `.planning`, `openspec`, the change directory, and `handoff.json` one component at a time with descriptor-relative `O_NOFOLLOW` access.
- Retained all five descriptors through the bounded read, then revalidated link-side and descriptor identities for every component before returning manifest bytes.
- Required both expected and observed `{phase_id: phase_path}` maps to equal the validated `PlanningInventory` map exactly.
- Added public-gate regressions for all intermediate symlinks, root/parent/final identity replacement, inventory-only, graph-only, path mismatch, and same-extra-phase EXECUTE/FINALIZE cases.

## Task Commits

Each task followed the required RED/GREEN sequence:

1. **Task 1 RED: expose unanchored manifest ancestry** - `69e5e95`
2. **Task 1 GREEN: anchor manifest reads to repository descriptors** - `7ace6b9`
3. **Task 2 RED: expose partial graph inventory consistency** - `8da0258`
4. **Task 2 GREEN: require exact graph inventory consistency** - `97164ae`
5. **Rule 1 fix: type-check manifest open instrumentation** - `a370a67`

No separate REFACTOR commit was warranted for either task. Task 1 already keeps descriptor acquisition, validation, bounded reading, revalidation, and reverse cleanup in the existing `_read_manifest_bytes` seam; Task 2 is a direct three-map equality check with no duplicated authority to consolidate.

## TDD Evidence

### RED

- Intermediate `openspec` and change-directory symlinks admitted clean; a `.planning` symlink reached later mapping logic and became drifted instead of manifest-unknown.
- Parent replacements through symlinks could retain the same final-file inode and bypass the final-file-only identity check.
- Expected-only, observed-only, and expected-path mismatch graphs became ordinary drift, while the same undeclared phase in both graphs admitted EXECUTE and FINALIZE clean.

### GREEN

- All three fixed intermediate symlink rows return only `lifecycle-manifest-unreadable` before any boundary observation.
- Root, every manifest parent, and the final file return only `lifecycle-manifest-identity-changed` after deterministic replacement, with every opened descriptor closed.
- All seven graph/inventory mismatch rows return only `lifecycle-phase-observation-incomplete` before mapping readiness or decision identity generation.
- Valid phase tuple reordering remains identity-invariant.

## Files Created/Modified

- `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py` - repository-anchored manifest descriptor traversal and exact graph/inventory map validation.
- `tests/test_handoff_lifecycle_gate.py` - public-gate ancestry, TOCTOU, cleanup, bidirectional membership, path, and FINALIZE regressions.

## Decisions Made

- Preserve `_read_manifest_bytes` as the sole manifest-read helper and pass it the validated root plus change ID rather than a prejoined path.
- Treat initial symlink/type failures as manifest-unreadable and observed replacements as manifest-identity-changed; both remain wholly unknown and identity-free without retry or alternate traversal.
- Compare validated graph and inventory maps before normalization, mapping readiness, phase comparison, or identity generation.
- Make no REFACTOR commit for either task because the GREEN implementations are already minimal and single-authority.

## Verification

- Plan final gate: focused graph/inventory tests passed, then `task check` passed Ruff format/check, basedpyright with zero findings, and all 807 project tests.
- `uv run pytest tests/test_handoff_lifecycle_gate.py -q` - 159 passed.
- Task 1 focused regressions - 8 passed.
- Task 2 focused regressions plus tuple-order identity - 8 passed.
- Targeted Ruff and basedpyright for both modified files - passed with zero findings.
- `git diff --check` - passed.
- Self-review - no scope creep, unrelated refactor, deletion, generated file, unplanned trust boundary, or unresolved stub found.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test type bug] Narrowed the monkeypatched `os.open` path before constructing `Path`**

- **Found during:** Final integrated `task check`
- **Issue:** basedpyright rejected `Path(str | bytes | Path)` in the deterministic manifest replacement hook.
- **Fix:** Decode a bytes path explicitly before `Path` construction while preserving the hook's accepted runtime input types.
- **Files modified:** `tests/test_handoff_lifecycle_gate.py`
- **Verification:** Targeted basedpyright reported zero findings, Task 1 regressions passed 8/8, and the rerun `task check` passed.
- **Committed in:** `a370a67`

---

**Total deviations:** 1 auto-fixed (1 Rule 1 test type bug).
**Impact on plan:** Test-only typing correction; production behavior and scope are unchanged.

## Issues Encountered

- The first integrated `task check` stopped at the test-hook basedpyright error above. The full gate was rerun from the beginning after the fix and passed.

## Authentication Gates

None.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None. Empty lists and dictionaries found by the stub scan are local accumulators or explicit evidence assertions, not placeholder runtime values.

## Threat Model Results

- T-03-10-01: repository root and every manifest component use descriptor-relative no-follow traversal with exact entry type and identity checks.
- T-03-10-02: all retained descriptors and link-side entries are revalidated after the bounded read and closed in reverse order on every path.
- T-03-10-03: expected, observed, and inventory phase ID/path maps must be exactly equal before readiness or identity.
- T-03-10-SC: accepted as planned; no dependency or supply-chain change occurred.
- No new network endpoint, authentication path, schema change, or unplanned trust boundary was introduced.

## Next Phase Readiness

- HND-03 / HARD-R2 gap closure now rejects repository-external manifest substitution and undeclared phase admission at the sole lifecycle gate.
- Phase 3 is ready for orchestrator-owned independent verification; this plan does not mark the phase complete.
- OpenSpec retains final completion authority; no canonical OpenSpec artifact or tracked handoff was changed.

## Self-Check: PASSED

- Both modified source/test artifacts and this summary exist.
- TDD commits `69e5e95`, `7ace6b9`, `8da0258`, and `97164ae` exist in RED→GREEN order; Rule 1 fix `a370a67` also exists.
- Focused, lifecycle, static, type, diff, and full-project checks passed.
- No tracked file was deleted and no generated/runtime file remains untracked.

---
*Phase: 03-lifecycle-drift-gate*
*Completed: 2026-07-28*
