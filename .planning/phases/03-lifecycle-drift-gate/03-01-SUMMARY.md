---
phase: 03-lifecycle-drift-gate
plan: 01
subsystem: openspec-gsd-handoff
tags: [drift, openspec, fail-closed, hypothesis, tdd]

requires:
  - phase: 02-source-to-execution-mapping
    provides: stable source identity inventory, fingerprint, and reconciliation seams
provides:
  - bounded immutable canonical-source observations
  - deterministic clean, drifted, and unknown decisions
  - checkbox-only progress separation with stable changed source-item IDs
affects: [03-02-lifecycle-gate-composition, lifecycle-preflight, source-revalidation]

tech-stack:
  added: []
  patterns: [whole-operation fail-closed observation, exact checkbox-token normalization]

key-files:
  created:
    - src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py
    - tests/test_handoff_lifecycle_drift.py
  modified: []

key-decisions:
  - "Unknown decisions contain only a stable issue code; partial artifact, source-ID, and progress evidence is discarded."
  - "Checkbox normalization recognizes only CRLF, CR, and LF Markdown line starts, preserving all other decoded content byte-for-byte."

patterns-established:
  - "Canonical drift compares sorted complete observations and never reads mutable state during classification."
  - "Stable changed source IDs come only from read_source_inventory plus reconcile_source_items."

requirements-completed: [HND-03]

duration: 10min
completed: 2026-07-23
status: complete
---

# Phase 03 Plan 01: Canonical Source Drift Classification Summary

**Bounded OpenSpec observation now distinguishes specification drift from checkbox-only progress and fails closed on every incomplete source comparison.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-07-23T00:35:17Z
- **Completed:** 2026-07-23T00:45:17Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added immutable `DriftState`, `CanonicalArtifactObservation`, `CanonicalSourceObservation`, and `CanonicalSourceDriftDecision` values.
- Added `normalize_tasks_specification`, `observe_canonical_source`, and `classify_canonical_source_drift` public seams.
- Reused bounded artifact reading, exact progress parsing, source inventory, and reconciliation to report sorted stable changed IDs without guessing.
- Covered clean, non-checkbox drift, checkbox-only progress, created/updated/tombstoned IDs, incomplete input, and every requested bounded failure family.
- Added exactly one Hypothesis family, limited to checkbox normalization and progress behavior.

## Task Commits

Each task was committed atomically through its TDD gates:

1. **Task 1 RED: fixed canonical drift examples** - `6acc039` (`test`)
2. **Task 1 GREEN: bounded canonical source classification** - `b2f1dc0` (`feat`)
3. **Task 2 RED: checkbox normalization property** - `cf245a1` (`test`)
4. **Task 2 GREEN: exact Markdown line boundary correction** - `4f22e86` (`fix`)

No refactor commit was needed; review found no demonstrated duplication worth extracting.

## TDD Evidence

### RED

- Task 1: `uv run pytest tests/test_handoff_lifecycle_drift.py -q -k "fixed or bounded or checkbox_only"` failed during collection with `ModuleNotFoundError` for the planned module.
- Task 2: the single Hypothesis family found `U+2028 + "- [x]"` as a minimal counterexample to the initial over-broad `splitlines()` normalizer.

### GREEN

- Task 1 focused fixed suite: 22 passed.
- Task 2 complete focused suite: 24 passed.
- The correction restricts marker replacement to the start of the input or text following CRLF, CR, or LF while preserving all other UTF-8 content.

### REFACTOR/REVIEW

- Inspected for implementation-coupled assertions, tautological classifier expectations, widened property scope, duplicate parsing abstractions, and forbidden lifecycle-operation surface.
- No behavior-preserving refactor was warranted; the implementation remains one narrow composition seam.
- `task check` passed all 519 repository tests after review.

## Files Created/Modified

- `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py` - complete observation, exact tasks specification normalization, and three-state drift classification.
- `tests/test_handoff_lifecycle_drift.py` - fixed public-seam examples, bounded failure matrix, and one normalization property family.

## Property Scope Proof

- `tests/test_handoff_lifecycle_drift.py` contains exactly one `@given` decorator.
- The property calls only `normalize_tasks_specification` and `parse_task_progress`; expected bytes are rendered independently with literal markers.
- Fixed literals remain the only evidence for clean, drifted, unknown, issue-code, and stable source-ID outcomes.

## Verification

- `uv run pytest tests/test_handoff_lifecycle_drift.py -q` - 24 passed.
- `uv run ruff check ...` - passed.
- `uv run ruff format --check ...` - passed.
- `uv run basedpyright ...` - 0 errors, 0 warnings.
- Representative `uv run python -c ...` call returned normalized open markers for mixed done/open tasks.
- `task check` - format, lint, type checking, and all 519 tests passed.
- `git diff --check` - passed.

## Threat Results

- T-03-01: canonical path/cardinality/read failures reuse the bounded reader and produce whole-operation failure.
- T-03-02: only exact line-start checkbox tokens at Markdown CR/LF boundaries are normalized; non-checkbox bytes remain drift evidence.
- T-03-03: all result values are frozen, paths and IDs are unique/sorted, and unknown carries no partial green evidence.
- T-03-04: artifact file/count/aggregate limit+1 and source identity limits fail closed.
- T-03-04A: stable source IDs are emitted only from complete public reconciliation results.
- No unplanned network, authentication, persistence, schema, or mutation surface was introduced.

## Protected Surface Evidence

- Plan commits changed only `lifecycle_drift.py` and `test_handoff_lifecycle_drift.py`.
- Phase 2 mapping/readiness tests, canonical OpenSpec artifacts, tracked handoff, package-root exports, and CLI files were not modified.
- The new module contains no Git, manifest, mapping, phase, capability, approval, persistence, publication, repair, retry, rollback, route-switch, or lifecycle-operation API.

## Decisions Made

- Unknown is a terminal evidence state for this seam: it exposes the issue code and empty drift/progress tuples only.
- Markdown checkbox normalization uses explicit CR/LF delimiters instead of Python Unicode `splitlines()` semantics to avoid concealing specification content.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The first Task 2 implementation treated Unicode line separators as Markdown line boundaries. The property RED exposed this; the GREEN correction narrowed boundaries to CRLF, CR, and LF.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None.

## Self-Check: PASSED

- Both created files exist.
- All four TDD task commits exist in repository history.
- No generated or runtime files remain untracked.

## Next Phase Readiness

- Plan 03-02 can compose this source decision with source-commit, manifest, mapping, phase graph, capability, and freshness evidence.
- No blockers or unresolved high-severity threats remain for 03-01.

---
*Phase: 03-lifecycle-drift-gate*
*Completed: 2026-07-23*
