---
phase: 03-lifecycle-drift-gate
plan: 11
subsystem: validation
tags: [python, manifest-mapping, source-identity, fail-closed, tdd]
requires:
  - phase: 03-lifecycle-drift-gate
    plan: 08
    provides: shared PlanningInventory and SourceIdentityState runtime validators
provides:
  - complete fail-closed SourceIdentityState validation at both mapping public APIs
  - complete ManifestMapping runtime validation before sets, equality, and filesystem use
  - one pure canonical mapping projection shared by builder and readiness
affects: [lifecycle-admission, mapping-readiness, HND-03]
tech-stack:
  added: []
  patterns:
    - validate-before-dereference
    - single canonical projection authority
key-files:
  created:
    - .planning/phases/03-lifecycle-drift-gate/03-11-SUMMARY.md
  modified:
    - src/ai_coding_template_ja/openspec_gsd_handoff/execution_mapping.py
    - tests/test_handoff_execution_mapping.py
key-decisions:
  - "Mapping public APIs reuse validate_source_identity_state and expose only mapping-input-invalid for malformed source state."
  - "ManifestMapping values are fully validated before semantic or filesystem operations, and both public APIs derive canonical mappings through one pure helper."
patterns-established:
  - "Complete mapping aggregates are validated outer-to-inner before hashing, set construction, equality, or path observation."
  - "Canonical construction and readiness comparison share _project_canonical_manifest_mappings as their sole projection authority."
requirements-completed: [HND-03]
duration: 10min
completed: 2026-07-28
status: complete
---

# Phase 03 Plan 11: Mapping Runtime Validation and Canonical Projection Summary

**Both mapping public APIs now reject malformed source and mapping aggregates before dereference or semantic use, while one pure helper owns canonical ManifestMapping projection.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-07-28T13:29:45Z
- **Completed:** 2026-07-28T13:39:35Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Routed `build_manifest_mappings` and `validate_mapping_readiness` through the existing complete `validate_source_identity_state` authority before member iteration.
- Added `_validate_manifest_mappings` with exact outer/member/field/container, UTF-8, ID, canonical path, policy reference, order, uniqueness, alias, and aggregate-byte validation.
- Moved canonical construction into pure `_project_canonical_manifest_mappings`, deleted `_expected_mappings`, and proved both public APIs call the single projection authority.
- Preserved the valid 49-item baseline and plan/execute/verify/finalize readiness behavior.

## Task Commits

Each task followed the required RED/GREEN sequence:

1. **Task 1 RED: expose unsafe mapping source state use** - `b169779`
2. **Task 1 GREEN: reuse complete source state validation in mapping APIs** - `c93d287`
3. **Task 2 RED: expose unsafe manifest mapping validation** - `d536ceb`
4. **Task 2 GREEN: validate complete manifest mappings before readiness** - `ad07844`

No separate REFACTOR commit was warranted for either task. The GREEN changes already removed obsolete partial source prechecks, consolidated complete mapping validation in the named validator, and eliminated the duplicated projection implementation without additional behavior-preserving cleanup.

## TDD Evidence

### RED

- Task 1 reproduced `active=(None,)` raising `AttributeError` before the shared source-state validator could reject it.
- Task 2 reproduced list-valued `source_id` raising `TypeError`, nested malformed tuples returning `mapping-set-conflict`, and both public functions lacking `_project_canonical_manifest_mappings` calls.

### GREEN

- The fixed source-state family matrix passes through both public APIs with only `mapping-input-invalid`.
- The fixed ManifestMapping outer/member/scalar/nested/order/uniqueness/path/reference/byte families pass with only `mapping-set-invalid`.
- The literal two-item projection equals builder output, readiness accepts it, and the AST assertion finds one `ManifestMapping` construction site in the shared helper.

## Files Created/Modified

- `src/ai_coding_template_ja/openspec_gsd_handoff/execution_mapping.py` - shared source-state reuse, complete ManifestMapping validation, and single pure canonical projection.
- `tests/test_handoff_execution_mapping.py` - fixed public-seam malformed families and canonical projection equivalence/source assertions.

## Decisions Made

- Preserve shared source-validator internals by converting every source validation failure to the stable public `mapping-input-invalid` code.
- Return the original validated immutable mapping tuple on success; malformed caller values are never sorted, repaired, coerced, or inferred.
- Keep evidence-path validation aligned with the existing inventory convention: canonical repository-relative paths, with exact ownership enforced by comparison to the shared projection.
- Make no REFACTOR commit because both GREEN implementations already reached the planned single-authority form.

## Verification

- `task check` - Ruff format/check passed, basedpyright reported 0 errors/warnings/notes, and 792 tests passed.
- `uv run pytest tests/test_handoff_execution_mapping.py -q` - 33 passed.
- `uv run pytest tests/test_handoff_lifecycle_gate.py -q --no-cov` - 144 passed.
- Targeted Ruff and basedpyright - passed with zero findings.
- Representative public API execution - valid baseline produced 49 mappings; list-valued `source_id` returned `mapping-set-invalid`.
- `git diff --check` - passed.
- Structural audit - one production `ManifestMapping` constructor, no `_expected_mappings`, no new property family, dependency, root export, CLI, serializer, evidence schema, optional smoke, retry, repair, rollback, or route-switch behavior.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test bug] Corrected the pre-existing tombstone fixture to remain a valid SourceIdentityState**

- **Found during:** Task 2 GREEN full mapping suite
- **Issue:** The fixture tombstoned the first requirement while retaining active scenarios that referenced it, so the newly shared authoritative validator correctly returned `mapping-input-invalid` before the intended tombstone-reference branch.
- **Fix:** Tombstoned a scenario whose active parent remains present and removed only that scenario from the active tuple.
- **Files modified:** `tests/test_handoff_execution_mapping.py`
- **Verification:** The full mapping suite passed 33/33 and the case retained its expected `mapping-tombstone-reference` result.
- **Committed in:** `ad07844`

---

**Total deviations:** 1 auto-fixed (1 Rule 1 test bug).
**Impact on plan:** The fixture correction preserves the existing public behavior test while making its source state valid under the required shared validator.

## Issues Encountered

- The initial Task 1 RED edit contained an invalid assignment expression in a keyword argument; it was corrected before the RED commit and the test then failed for the intended production `AttributeError`.
- The Task 2 RED commit hook rejected the plan-mandated long test node name under E501; a narrow `# noqa: E501` retained the exact node ID and the normal hook then passed.

## Authentication Gates

None.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None. The `source_id=[]` occurrence is an intentional malformed-runtime regression input, not production or UI placeholder data.

## Threat Model Results

- T-03-11-01: both public APIs reuse complete SourceIdentityState validation before every member dereference.
- T-03-11-02: complete ManifestMapping validation precedes set construction, equality, and filesystem observation.
- T-03-11-03: canonical phase, plan, and evidence paths are checked without normalization or repair.
- T-03-11-04: builder and readiness share one pure projection authority with literal equivalence and AST source assertions.
- No new network endpoint, authentication path, file-access operation, schema change, dependency, or other unplanned trust boundary was introduced.

## Next Phase Readiness

- HND-03 / HARD-R2 mapping public seams now fail closed for malformed runtime aggregates.
- Phase 3 gap closure can proceed to independent re-verification after the remaining plan summary is present.
- OpenSpec retains final completion authority; no canonical artifact or tracked handoff was changed.

## Self-Check: PASSED

- Both modified source/test artifacts and this summary exist.
- TDD commits `b169779`, `c93d287`, `d536ceb`, and `ad07844` exist in RED→GREEN order.
- Focused, lifecycle, static, type, representative-runtime, diff, and full-project checks passed.
- No tracked file was deleted and no generated/runtime file remains untracked.

---
*Phase: 03-lifecycle-drift-gate*
*Completed: 2026-07-28*
