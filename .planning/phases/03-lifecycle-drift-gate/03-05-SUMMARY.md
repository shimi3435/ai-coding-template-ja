---
phase: 03-lifecycle-drift-gate
plan: 05
subsystem: openspec-gsd-handoff
tags: [lifecycle-gate, fail-closed, dag-validation, bounded-input, tdd]

requires:
  - phase: 03-lifecycle-drift-gate
    plan: 03
    provides: lifecycle integration and deterministic public-gate evidence seams
  - phase: 03-lifecycle-drift-gate
    plan: 04
    provides: fail-closed canonical observation validation
provides:
  - exact-true host capability completeness and explicit host inspection drift
  - positive exact-integer validation for every nested ArtifactLimits field
  - raw phase graph shape, uniqueness, bounds, and DAG validation before normalization
affects: [03-06-public-decision-evidence, recovery-gates, finalize-gates]

tech-stack:
  added: []
  patterns: [validate before normalize, exact runtime types, bounded iterative Kahn validation]

key-files:
  created: []
  modified:
    - src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py
    - tests/test_handoff_lifecycle_gate.py

key-decisions:
  - "Current host capability evidence is complete only when host.inspected is exactly true; the field remains in explicit drift comparison as defense-in-depth."
  - "Expected and observed phase graphs share one raw validator and bounded iterative DAG check before any set-like ordering is normalized."

patterns-established:
  - "All outer and nested lifecycle limits use positive exact-integer validation before repository resolution, manifest reads, or boundary calls."
  - "Malformed, duplicate, over-limit, self/unknown-edge, or cyclic phase graphs converge on lifecycle-phase-observation-incomplete with no reusable identity."

requirements-completed: [HND-03]

duration: 6min
completed: 2026-07-27
status: complete
---

# Phase 03 Plan 05: Lifecycle Admission Prerequisite Hardening Summary

**The lifecycle gate now rejects uninspected hosts, malformed nested bounds, invalid raw phase declarations, and cyclic dependency graphs before normalization or admission.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-27T13:29:13Z
- **Completed:** 2026-07-27T13:35:04Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Required current `host.inspected is True` for complete capability evidence and retained `host.inspected` in explicit capability drift comparison.
- Validated `max_files`, `bytes_per_file`, `bytes_total`, and `change_id_bytes` as positive exact integers before repository or boundary observation.
- Validated raw phase graph containers, node/member field types, node and dependency uniqueness, edge/byte bounds, self/unknown edges, and acyclicity before canonical ordering.
- Applied one bounded iterative Kahn-style DAG check identically to expected and observed graphs while preserving valid tuple-order identity invariance.

## Task Commits

Each task was committed atomically through its TDD gates:

1. **Task 1 RED: capability and nested-limit regressions** - `691b373` (`test`)
2. **Task 1 GREEN: capability and nested-limit admission hardening** - `cb6ff1a` (`feat`)
3. **Task 2 RED: malformed, duplicate, and cyclic graph regressions** - `1244738` (`test`)
4. **Task 2 GREEN: raw graph and bounded DAG validation** - `1f94ac1` (`feat`)

No separate refactor commit was warranted; positive-integer checks remain consolidated in `_valid_limits`, and expected/observed graphs share one validator and one local DAG helper.

## TDD Evidence

### RED

- Task 1 focused run failed all 18 cases: uninspected host evidence was `clean`, malformed nested values raised or returned downstream artifact issue codes, and host inspection mismatch was omitted from capability drift.
- Task 2 focused run had 16 failures among 21 selected cases: malformed members raised `AttributeError`/`TypeError`, non-tuple and duplicate declarations normalized into clean evidence, and cycles reached drift comparison instead of incomplete observation.

### GREEN

- Task 1 focused run passed 18/18. Every invalid nested limit returns `lifecycle-input-invalid`, and source/phase/capability boundary counters remain exactly zero.
- Task 1 uninspected host returns `lifecycle-capability-observation-incomplete`, is not admitted, and exposes no decision identity.
- Task 1 complete inspection mismatch returns `capability-changed:host.inspected` with `capability:host.inspected` revalidation.
- Task 2 focused run passed 21/21. Malformed, duplicate, and cyclic cases on both expected and observed graphs return `lifecycle-phase-observation-incomplete`.
- The existing valid phase tuple order test remains clean and preserves decision identity.

### REFACTOR/REVIEW

- Kept exact-type validation before regex, path, `len`, `set`, encoding, or sorting operations.
- Used an iterative bounded worklist rather than recursive traversal or `_downstream_phases` reachability as cycle proof.
- Added no broad exception recovery, coercion, dependency, public API, serializer, CLI surface, or alternate admission authority.

## Files Created/Modified

- `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py` - validates nested limits, exact host inspection, raw phase evidence, and both DAGs before normalization/admission.
- `tests/test_handoff_lifecycle_gate.py` - public-gate regression matrices for uninspected capability, all malformed nested limits, raw graph shape/duplicates, and two-node/longer cycles.

## Decisions Made

- Capability completeness uses exact completed inspection, not merely a boolean-typed value; explicit comparison remains defense-in-depth for complete expected/current mismatch evidence.
- Graph validity and canonicalization are separate gates: invalid duplicates and cycles are never treated as semantically irrelevant ordering.
- Cycle detection uses one local Kahn-style helper over already validated and bounded nodes/edges, avoiding a new dependency or recursive depth risk.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The pre-commit formatter reformatted the bounded DAG helper before the Task 2 GREEN commit. The formatted file was restaged and committed normally; hooks were not bypassed.

## Verification

- `uv run pytest tests/test_handoff_lifecycle_gate.py -q -k "uninspected_host or malformed_nested_limits or host_inspected_drift"` - 18 passed.
- `uv run pytest tests/test_handoff_lifecycle_gate.py -q -k "malformed_phase_graph or duplicate_phase_edge or cyclic_phase_graph or irrelevant_phase_tuple_order"` - 21 passed.
- `uv run pytest tests/test_handoff_lifecycle_gate.py -q` - 86 passed.
- `uv run pytest tests/test_handoff_lifecycle_drift.py tests/test_handoff_lifecycle_gate.py -q` - 120 passed.
- `uv run ruff check src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py tests/test_handoff_lifecycle_gate.py` - passed.
- `uv run basedpyright src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py tests/test_handoff_lifecycle_gate.py` - 0 errors, 0 warnings, 0 notes.
- `task check` - formatting, Ruff, BasedPyright, and all 615 tests passed.
- `git diff --check` - passed.

## Threat Results

- T-03-05-01: invalid nested bounds stop before repository/boundary observation, and unperformed host inspection cannot contribute green evidence.
- T-03-05-02: malformed, duplicate, bounded-invalid, and cyclic phase declarations are rejected before set-like normalization and comparison.
- No new network endpoint, authentication path, filesystem trust boundary, schema, dependency, package export, or CLI surface was introduced.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None.

## Self-Check: PASSED

- Both modified source/test files and this summary exist.
- All four ordered TDD gate commits exist in repository history.
- Focused, lifecycle backstop, static analysis, diff, and full project checks passed.
- No tracked files were deleted and no generated or runtime files remain untracked.

## Next Phase Readiness

- Plan 03-06 can complete public evidence projection and repository-bound identity on top of structurally complete lifecycle prerequisites.
- No unresolved high-severity threat or blocker remains for Plan 03-05.

---
*Phase: 03-lifecycle-drift-gate*
*Completed: 2026-07-27*
