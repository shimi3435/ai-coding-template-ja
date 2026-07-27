---
phase: 03-lifecycle-drift-gate
plan: 04
subsystem: openspec-gsd-handoff
tags: [drift, fail-closed, runtime-validation, pytest, tdd]

requires:
  - phase: 03-lifecycle-drift-gate
    provides: canonical source drift classifier and immutable unknown projection from Plan 03-01
provides:
  - fail-closed classification for malformed structured Success payloads
  - validate-before-dereference checks for canonical artifact members and fields
  - public-seam regressions for top-level and nested malformed observations
affects: [03-05-lifecycle-input-hardening, 03-06-public-decision-evidence, lifecycle-preflight]

tech-stack:
  added: []
  patterns: [untrusted structured result validation, validate-before-canonicalize]

key-files:
  created: []
  modified:
    - src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py
    - tests/test_handoff_lifecycle_drift.py

key-decisions:
  - "Canonical observation and artifact values are runtime-validated before any attribute access, ordering, uniqueness, or digest check."

patterns-established:
  - "Malformed Success payloads converge on canonical-observation-incomplete through the existing public classifier."
  - "Unknown decisions retain no artifact paths, source IDs, or progress candidate."

requirements-completed: [HND-03]

duration: 5min
completed: 2026-07-27
status: complete
---

# Phase 03 Plan 04: Malformed Canonical Observation Hardening Summary

**Malformed canonical `Success` payloads and nested artifact values now fail closed as complete unknown decisions before any unsafe attribute access or comparison.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-27T13:17:35Z
- **Completed:** 2026-07-27T13:23:10Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Converted `Success(None)` and unrelated success payloads in either classifier position into `canonical-observation-incomplete`.
- Rejected invalid artifact tuple members before reading `kind`, `path`, or digest fields.
- Required exact runtime types for every canonical artifact field before cardinality, ordering, uniqueness, and digest checks.
- Preserved complete clean, drifted, checkbox-only, source-ID, and sole Hypothesis property behavior.

## Task Commits

Each task was committed atomically through its TDD gates:

1. **Task 1 RED: malformed structured payload regressions** - `fadfbf9` (`test`)
2. **Task 1 GREEN: top-level observation validation** - `88d5308` (`feat`)
3. **Task 2 RED: malformed nested artifact regressions** - `391769c` (`test`)
4. **Task 2 GREEN: nested artifact member and field validation** - `3569dd5` (`feat`)

No refactor commit was needed; review found no duplicated validation path or test construction worth extracting.

## TDD Evidence

### RED

- Task 1: `uv run pytest tests/test_handoff_lifecycle_drift.py -q -k "malformed_structured_payload"` failed 4/4 cases with `AttributeError` from top-level payload dereference.
- Task 2: `uv run pytest tests/test_handoff_lifecycle_drift.py -q -k "malformed_nested_artifact"` failed 6/6 cases. Invalid members raised `AttributeError`, invalid path/digests raised `TypeError`, and a string `kind` was misclassified as drift instead of unknown.

### GREEN

- Task 1 focused command passed 4 tests after adding the top-level `CanonicalSourceObservation` runtime check.
- Task 2 focused command passed 10 tests after adding member and nested-field validation.
- `uv run pytest tests/test_handoff_lifecycle_drift.py -q` passed all 34 tests.

### REFACTOR/REVIEW

- Kept one `_is_complete_observation` validation path and the existing `_unknown` projection.
- Added no broad exception handler, coercion layer, second classifier, or property family.
- The two member cases and four field cases use parameterized public-seam tests; no further cleanup was warranted.

## Files Created/Modified

- `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py` - validates untrusted observation, artifact member, and artifact field runtime types before canonical checks.
- `tests/test_handoff_lifecycle_drift.py` - covers malformed top-level payloads, invalid tuple members, and all four invalid artifact field types through the public classifier.

## Verification

- `uv run pytest tests/test_handoff_lifecycle_drift.py -q -k "malformed_structured_payload"` - 4 passed.
- `uv run pytest tests/test_handoff_lifecycle_drift.py -q -k "malformed_structured_payload or malformed_nested_artifact"` - 10 passed.
- `uv run pytest tests/test_handoff_lifecycle_drift.py -q` - 34 passed.
- `uv run pytest tests/test_handoff_lifecycle_drift.py tests/test_handoff_lifecycle_gate.py -q` - 82 passed.
- `uv run ruff check src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py tests/test_handoff_lifecycle_drift.py` - passed.
- `uv run basedpyright src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py tests/test_handoff_lifecycle_drift.py` - 0 errors, 0 warnings.
- `task check` - formatting, Ruff, BasedPyright, and all 577 tests passed.
- Representative public call with `Success(None)` and `Success(object())` returned unknown with empty evidence and no progress candidate.
- `git diff --check` - passed.
- `tests/test_handoff_lifecycle_drift.py` contains exactly one `@given` family.

## Threat Results

- T-03-04-01: exact observation/member/field validation now precedes every canonical artifact attribute access.
- T-03-04-02: malformed structured successes return a stable unknown result without exception-based control flow.
- No dependency, network endpoint, authentication path, filesystem access pattern, schema, package export, or CLI surface was added.

## Decisions Made

- Runtime annotations and frozen dataclasses are not treated as validation; the classifier explicitly validates untrusted structured values at its existing completeness seam.
- Existing valid classification and checkbox normalization behavior remain unchanged.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None.

## Self-Check: PASSED

- Both modified source/test files and this summary exist.
- All four TDD task commits exist in repository history.
- Focused, lifecycle backstop, static analysis, and full project checks passed.
- No generated or runtime files remain untracked.

## Next Phase Readiness

- Plan 03-05 can build on a canonical classifier that safely rejects malformed top-level and nested artifact evidence.
- No unresolved high-severity threat or blocker remains for Plan 03-04.

---
*Phase: 03-lifecycle-drift-gate*
*Completed: 2026-07-27*
