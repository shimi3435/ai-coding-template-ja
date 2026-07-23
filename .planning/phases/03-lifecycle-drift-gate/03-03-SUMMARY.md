---
phase: 03-lifecycle-drift-gate
plan: 03
subsystem: openspec-gsd-handoff
tags: [lifecycle-evidence, source-pinned, drift, git, fail-closed]

requires:
  - phase: 03-lifecycle-drift-gate
    plan: 02
    provides: one public lifecycle gate with deterministic identities and stale rejection
  - phase: 03-lifecycle-drift-gate
    plan: 01
    provides: checkbox-aware canonical observation and drift classification
provides:
  - fixed reviewer evidence for clean, drifted, unknown, checkbox-only, and stale outcomes
  - bounded source-commit blob provenance for the real checkbox-only transition
  - byte-identical tracked evidence and independent literal golden
  - separately recorded opt-in real-tool smoke status
affects: [04-repository-wide-ownership, lifecycle-verification, final-openspec-gates]

tech-stack:
  added: []
  patterns: [test-side deterministic evidence serialization, bounded fixed-argv Git provenance]

key-files:
  created:
    - tests/fixtures/openspec_gsd_handoff/lifecycle/expected-lifecycle-evidence.json
    - .planning/phases/03-lifecycle-drift-gate/03-LIFECYCLE-EVIDENCE.json
    - .planning/phases/03-lifecycle-drift-gate/03-OPTIONAL-REAL-TOOL-SMOKE.md
  modified:
    - tests/test_handoff_lifecycle_gate.py

key-decisions:
  - "Lifecycle evidence serialization remains test-side and consumes only public observation, classification, and gate seams."
  - "Checkbox progress evidence is accepted only after every source-commit blob matches its tracked handoff claim and the real current-tree comparison is specification-clean."
  - "Real OpenSpec/GSD/host smoke remains opt-in, separate from deterministic lifecycle evidence, and was not run without an explicit request."

patterns-established:
  - "One immutable OPERATION_CASES source feeds both the sole five-operation test matrix and reviewer evidence."
  - "Tracked machine evidence must equal an independent literal golden and a second producer run byte-for-byte."

requirements-completed: [HND-03]

duration: 11min
completed: 2026-07-23
status: complete
---

# Phase 03 Plan 03: Source-Pinned Lifecycle Evidence Summary

**Bounded Git provenance and the public lifecycle gate now produce deterministic reviewer evidence for all five required outcome families without mutating canonical or handoff inputs.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-07-23T01:14:39Z
- **Completed:** 2026-07-23T01:25:50Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Consolidated clean, canonical drift, incomplete unknown, real checkbox-only progress, and phase/capability stale-decision rejection into one fixed public-gate evidence record.
- Retrieved all four canonical blobs from `4d8b5b173927ed518d39dee18a29b0271628afbd` through bounded fixed-argv Git calls and verified every blob against the schema-2 handoff claim before observation.
- Reused one immutable five-row operation table for `plan`, `execute`, `resume`, `verify`, and `finalize`, with no second operation matrix or production serializer.
- Published tracked evidence SHA-256 `f84eed82f07ca00dca05bb24af8c2774e2764c9bc4fc34c263d7a37a1017e234`, byte-identical to the independent golden.
- Recorded real-tool smoke separately as `not-run` / `opt-in-not-requested`; smoke artifact SHA-256 is `b67f645e6ed191762690018ece083d8a7b39923414b40011abf18280a23d09d9`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build one fixed public-gate evidence table** - `22eccfc` (`test`)
2. **Task 2: Publish deterministic evidence and isolate optional smoke** - `11e13cd` (`test`)

## Evidence Results

| Outcome | State | Admitted | Decision identity |
|---|---|---:|---|
| clean | clean | yes | `4e7605ce41fdc12e5a7b9d7278408b55e84e2ee84352eb5832209a18ec5309c9` |
| canonical_drift | drifted | no | `439907917f5ded7b71a8b7b3a0d880cde05cdd7b8b03331577d63c9b10ce7011` |
| unknown | unknown | no | none |
| checkbox_only_progress | clean | yes | `855d733fd20d0b901f3396158d88963fcd476182369f9400343bce07d774d6f5` |
| phase_capability_stale | drifted | no | `e7bddd237be443e3674a9fbc384d83654ae650537e73710e61d8f521149efd34` |

### Checkbox-Only Provenance

- Handoff claim and source-pinned raw tasks SHA-256: `cf4a9dc56afc15b98a008cff686989bd446215c95b3962ea3efd5a4f9eb30220`
- Working-tree raw tasks SHA-256: `c12d93a780b03bcf8b1c8a3c1df888f53433b5f5399528d3f1f23699f11a3935`
- Both specification-normalized SHA-256 values: `84aa8fa2ff5ac53d091f76e89a94ffb98816dfa3b0406472a61fe8e4f0849d63`
- Source-pinned progress: 4 complete / 8 remaining; working-tree progress: 5 complete / 7 remaining.
- Public classification: `clean`, with empty changed source IDs and drifted artifact paths.

## Files Created/Modified

- `tests/test_handoff_lifecycle_gate.py` - shared operation rows, bounded Git blob reader, real pinned/current comparison, deterministic producer, and tracked-record tests.
- `tests/fixtures/openspec_gsd_handoff/lifecycle/expected-lifecycle-evidence.json` - independent literal outcome, identity, remediation, hash, and progress golden without canonical prose.
- `.planning/phases/03-lifecycle-drift-gate/03-LIFECYCLE-EVIDENCE.json` - compact deterministic reviewer evidence with protected before/after hashes and zero mutations.
- `.planning/phases/03-lifecycle-drift-gate/03-OPTIONAL-REAL-TOOL-SMOKE.md` - honest opt-in smoke status and normal-CI isolation contract.

## Decisions Made

- Kept all evidence composition and serialization in the test module; no production admission or serialization surface was added.
- Stored progress IDs and done states without task descriptions, preserving complete progress evidence without duplicating canonical specification prose.
- Treated missing explicit smoke authorization as `not-run`, never as verified runtime compatibility.

## Verification

- `uv run pytest tests/test_handoff_lifecycle_gate.py -q -k "operation_matrix or fixed_canonical_evidence"` - 6 passed.
- `uv run pytest tests/test_handoff_lifecycle_gate.py::test_repository_root_lifecycle_evidence_matches_tracked_record tests/test_taskfile.py::test_handoff_smoke_is_explicit_and_isolated_from_normal_check -q` - 2 passed.
- `uv run pytest tests/test_handoff_lifecycle_gate.py tests/test_taskfile.py::test_handoff_smoke_is_explicit_and_isolated_from_normal_check -q` - 49 passed.
- `task check` - formatting, lint, basedpyright, and all 567 tests passed; the opt-in smoke task was not invoked.
- `git diff --check` - passed.
- Protected proposal, design, spec, tasks, and tracked handoff hashes matched before and after; no `.handoff.*.tmp` existed.

## Threat Results

- T-03-10: exact commit/root checks, per-blob output limits, UTF-8 validation, claim hashes, protected before/after hashes, and empty staging evidence passed.
- T-03-11: versioned compact JSON matched the independent literal golden and a second producer run byte-for-byte.
- T-03-12: the changed complete phase/capability observation recomputed remediation and rejected the earlier clean identity as stale.
- T-03-13: five representative outcomes reuse existing public seams; no fault cross-product or repository-wide scan was added.
- T-03-14: real-tool smoke remains explicitly opt-in and mechanically absent from normal `task check`.
- No unresolved high-severity threats remain.

## Protected Surface Evidence

- Canonical proposal SHA-256 remained `d8a53d581a0e69f9aa730d61166bfbaf14dcf7e488e267b6f123e76c2e60856a`.
- Canonical design SHA-256 remained `3561792edfe750f5815fad72ff2e133888848b2733e770e2b6f66f87c413e783`.
- Canonical spec SHA-256 remained `7d076d2a946a8e8f3346f48ae80d4fbeb8ae0fb9ea6d20ccf19e01847edfd784`.
- Current canonical tasks SHA-256 remained `c12d93a780b03bcf8b1c8a3c1df888f53433b5f5399528d3f1f23699f11a3935`.
- Tracked handoff SHA-256 remained `6cc9bcf4caa3f9f839742f6d86660a8039c2370cf5cf7d054ba04199e3775fc5`.
- No production module, canonical artifact, tracked handoff, Taskfile, package export, or CLI file changed.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The first local golden-generation attempt included formatter status text before the JSON. The file was replaced with pure producer bytes and the focused test then passed.
- The first Task 1 commit attempt was stopped by the EOF fixer, which removed an extra blank line. The corrected file was re-tested and committed through the normal hooks.

## User Setup Required

None - no external service configuration required. The optional real-tool smoke remains unexecuted because no opt-in request was supplied.

## Known Stubs

None. The `not-run` smoke status is an intentional opt-in boundary, not a placeholder for deterministic lifecycle evidence.

## Self-Check: PASSED

- All four planned artifacts and this summary exist.
- Task commits `22eccfc` and `11e13cd` exist in repository history.
- No tracked files were deleted and no generated/runtime files remain untracked beyond this pending summary.

## Next Phase Readiness

- Phase 03 is complete and provides fixed HND-03 / HARD-R2 evidence for downstream ownership, recovery, and finalize phases.
- OpenSpec remains the final-completion authority; canonical boundary task 3.1 is not modified by this read-only evidence plan.
- No blockers or unresolved high-severity threats remain.

---
*Phase: 03-lifecycle-drift-gate*
*Completed: 2026-07-23*
