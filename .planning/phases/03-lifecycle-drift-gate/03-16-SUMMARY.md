---
phase: 03-lifecycle-drift-gate
plan: 16
subsystem: canonical-source-observation
tags: [python, input-validation, fail-closed, filesystem-boundary, tdd]

requires:
  - phase: 03-lifecycle-drift-gate
    plan: 15
    provides: "Repository-root identity binding across canonical source reads"
provides:
  - "Validation-before-use for both public source inventory reader aggregates"
  - "Stable source-files-invalid failures for malformed outer containers and members"
  - "Public regressions preserving established byte, path, limit, and root-race semantics"
affects: [phase-03-verification, HND-03, lifecycle-admission, canonical-source-observation]

tech-stack:
  added: []
  patterns:
    - "Validate outer container, collection bounds, and complete member runtime shape before semantic or filesystem work"

key-files:
  created: []
  modified:
    - src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py
    - tests/test_handoff_identity.py

key-decisions:
  - "Both public source readers reject string, bytes, unsupported containers, and malformed members with source-files-invalid before truthiness, length, unpacking, path conversion, or filesystem work."
  - "No REFACTOR commit was added because the two explicit public-seam validators are small, preserve distinct member contracts, and leave no behavior-preserving cleanup within this plan."
  - "Phase 03 completion remains owned by independent verification; this plan closes the implementation gap without checking the OpenSpec 3.1 boundary gate."

patterns-established:
  - "Public aggregate validation order is limits, outer Sequence shape, empty/count bounds, complete member shape, then existing semantic work."

requirements-completed: [HND-03]

duration: 8min
completed: 2026-07-29
status: complete
---

# Phase 03 Plan 16: Public Source Reader Aggregate Validation Summary

**Both public source inventory readers now convert malformed caller aggregates into stable `source-files-invalid` failures before Python runtime or filesystem operations can expose exceptions or partial evidence.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-29T05:23:15Z
- **Completed:** 2026-07-29T05:31:25Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added ordered outer/container/member validation to `source_inventory_from_bytes` before truthiness, `len`, tuple unpacking, path conversion, allocation, or parsing.
- Added ordered outer/member validation to `read_source_inventory` before repository resolution, stat, open, or traversal.
- Added fixed public-seam tables covering malformed values plus empty, limit+1, canonical-path, byte-content, and valid list/tuple companions.
- Kept the Plan 03-15 repository-root replacement regression and Plan 03-14 stale-replay regression green.

## Task Commits

Both tasks followed their required sequential TDD gates:

1. **Task 1 RED: expose malformed source byte inputs** - `c786620`
2. **Task 1 GREEN: validate source byte inputs before use** - `d0a1b25`
3. **Task 2 RED: expose malformed source path inputs** - `f38f434`
4. **Task 2 GREEN: validate source path inputs before use** - `551f348`

## RED / GREEN / REFACTOR Evidence

### Slice 1: `source_inventory_from_bytes`

- **RED:** 10 of 17 fixed rows failed. Existing behavior returned `source-paths-empty` for `None`, raised `TypeError` or `ValueError` for unsupported outers and malformed tuple members, or misclassified an arbitrary path object as `source-path-noncanonical`.
- **GREEN:** all 17 rows passed after validating a non-string `Sequence`, empty/count bounds, exact two-item tuples, and `str`/`Path` path fields before unpacking.

### Slice 2: `read_source_inventory`

- **RED:** 6 of 12 fixed rows failed. Existing behavior returned the empty code, raised `TypeError`, or reached repository `resolve`/`stat`/`open` for malformed string, bytes, or path-member inputs.
- **GREEN:** all 12 rows passed after validating the outer sequence and every path member before repository work. The boundary spy observed zero filesystem calls for malformed aggregates.

### REFACTOR

No REFACTOR commit was added. The GREEN changes are 13 direct validation lines across the two existing public functions, preserve their different member contracts, and add no duplicate validation authority or private helper. Any later consolidation requires a separate plan.

## Malformed-Family Failure Matrix

| Public seam | Malformed family | Stable outcome | Runtime / partial evidence |
|---|---|---|---|
| `source_inventory_from_bytes` | `None`, `object()`, `str`, `bytes`, set | `source-files-invalid` | No exception, no value |
| `source_inventory_from_bytes` | non-tuple, list member, short/long tuple | `source-files-invalid` | No unpack, no value |
| `source_inventory_from_bytes` | tuple path not `str`/`Path` | `source-files-invalid` | No path conversion, no value |
| `read_source_inventory` | `None`, `object()`, `str`, `bytes`, set | `source-files-invalid` | No exception, no filesystem call, no value |
| `read_source_inventory` | path member not `str`/`Path` | `source-files-invalid` | No path conversion or filesystem call, no value |

## Preserved-Code Companions

| Accepted aggregate shape | Expected preserved result |
|---|---|
| Empty list or tuple | `source-paths-empty` |
| Accepted `max_items + 1` sequence | `source-path-count-limit-exceeded` |
| Well-shaped byte row with non-`bytes` content | `source-bytes-invalid` |
| Malformed canonical path text | existing `source-path-noncanonical` |
| Valid list or tuple byte input | identical deterministic `SourceInventory` |
| Valid list or tuple path input | identical deterministic filesystem-backed `SourceInventory` |
| Repository root replaced during read | exact `source-root-identity-changed` |

## Verification

- `uv run pytest tests/test_handoff_identity.py::test_source_inventory_from_bytes_rejects_malformed_file_inputs tests/test_handoff_identity.py::test_read_source_inventory_rejects_malformed_path_inputs -q` — 29 passed.
- `uv run pytest tests/test_handoff_identity.py::test_source_inventory_rejects_repository_root_replacement_during_read -q` — 3 passed.
- `uv run pytest tests/test_handoff_identity.py -q` — 109 passed.
- `uv run pytest tests/test_handoff_lifecycle_gate.py::test_stale_rejection_identity_cannot_be_replayed_into_admission -q` — 1 passed.
- `uv run pytest tests/test_handoff_lifecycle_drift.py tests/test_handoff_lifecycle_gate.py -q --no-cov` — 308 passed.
- `uv run ruff check src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py tests/test_handoff_identity.py` — passed.
- `uv run basedpyright src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py tests/test_handoff_identity.py` — 0 errors, 0 warnings, 0 notes.
- `task check` — format, Ruff, BasedPyright, and 869 tests passed.
- Direct public-function invocation with malformed `object()` aggregates returned `source-files-invalid` at both seams without touching a real repository.
- `git diff --check` — passed.

The combined gate confirms all three Phase 03 review gaps are green together: stale rejection replay, repository-root replacement, and malformed public reader aggregates. The only Phase 3 Hypothesis family remains checkbox normalization; this plan added only fixed examples.

## Threat Dispositions

| Threat | Disposition | Evidence |
|---|---|---|
| T-03-16-INPUT | Mitigated | Complete aggregate runtime shape is validated before semantic or filesystem work at both public seams. |
| T-03-16-ROOT | Transferred and verified | Plan 03-15 root identity regression remains exact `source-root-identity-changed`. |
| T-03-16-STALE | Transferred and verified | Plan 03-14 two-step stale replay regression remains non-admitting. |
| T-03-16-SC | Accepted | No dependency, package, schema, or tool installation changed. |

No new endpoint, authentication path, file-access capability, schema boundary, or other unplanned threat surface was introduced.

## Decisions Made

- Used the same validation-before-use order already established by reconciliation, while keeping the two public functions explicit because their member contracts differ.
- Retained field-specific and semantic issue codes only after aggregate runtime shape is accepted.
- Left OpenSpec task 3.1 unchecked because independent phase verification still owns the phase-completion boundary.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The first RED filesystem guard patched process-wide `os.stat` to fail, which also interfered with pytest failure reporting. It was replaced before the RED commit with a scoped recording spy that restores boundaries before assertions and still proves zero calls for malformed aggregate rows.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- HND-03 / HARD-R2 implementation gap CR-03 is closed at both public source reader seams.
- Plans 03-14, 03-15, and 03-16 now pass together, but Phase 03 remains incomplete until `$gsd-verify-work` independently confirms the three verifier gaps and owns the OpenSpec 3.1 boundary decision.

## Self-Check: PASSED

All declared modified files exist, and all four RED/GREEN task commits are present in Git history.

---
*Phase: 03-lifecycle-drift-gate*
*Completed: 2026-07-29*
