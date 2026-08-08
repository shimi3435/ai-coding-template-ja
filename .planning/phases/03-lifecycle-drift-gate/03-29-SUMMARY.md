---
phase: 03-lifecycle-drift-gate
plan: 29
subsystem: refresh-and-source-state-validation
tags:
  - tdd
  - exception-totality
  - refresh-preview
  - lifecycle-drift
status: complete
requires:
  - phase: 03-lifecycle-drift-gate
    plan: 28
    provides: migration preview getter-exception totality
provides:
  - ordinary getter-exception normalization across refresh serializer and apply identity validation
  - ordered specific-code then generic normalization in the canonical source-state validator
  - public reconciliation, mapping, drift classifier, and lifecycle gate totality regressions
  - explicit BaseException propagation and zero-mutation filesystem evidence
affects:
  - Phase 03 Plan 23 fresh independent all-29-plan exit review
  - HND-03 independent security and verification exit gates
tech-stack:
  added: []
  patterns:
    - ordinary exceptions at untrusted runtime-value boundaries reuse existing structured failure taxonomies
    - process-control BaseException subclasses remain visible to callers
key-files:
  created:
    - .planning/phases/03-lifecycle-drift-gate/03-29-SUMMARY.md
  modified:
    - src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py
    - src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py
    - tests/test_handoff_manifest_refresh.py
    - tests/test_handoff_identity.py
    - tests/test_handoff_execution_mapping.py
    - tests/test_handoff_lifecycle_drift.py
    - tests/test_handoff_lifecycle_gate.py
key-decisions:
  - Preserve _SourceInputError-specific issue codes before normalizing other ordinary source-state validation exceptions.
  - Keep reconciliation, mapping, classifier, and gate as consumers of the one canonical validator without downstream catch duplication.
  - Add no REFACTOR commit because the minimal GREEN changes already preserve one authority at each boundary.
  - Leave clean review, security, verifier, HND-03, and Phase 03 completion authority to fresh independent Plan 03-23 execution.
patterns-established:
  - "Fail-closed totality: ordinary untrusted getter exceptions become existing non-success evidence before identity reuse or mutation."
requirements-completed: []
duration: 9 min
completed: 2026-08-08
---

# Phase 03 Plan 29: Refresh and Source-State Getter-Exception Totality Summary

**Refresh preview serialization/apply and the canonical source-state validator now convert ordinary getter exceptions into their existing fail-closed results while preserving specific codes, process-control propagation, and mutation-free UNKNOWN evidence.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-08-08T09:53:56Z
- **Completed:** 2026-08-08T10:02:27Z
- **Tasks:** 3
- **Files modified:** 7, plus this summary

## Accomplishments

- Added seven named public regression nodes across refresh, identity, mapping, canonical drift,
  and lifecycle gate suites. Parameterization exercises eight focused cases.
- Widened only the existing refresh serializer and preview-identity handlers to ordinary
  `Exception`, retaining `refresh-preview-invalid` and pre-mutation STATE_GUARD behavior.
- Added an ordered ordinary-exception fallback after `_SourceInputError` in
  `validate_source_identity_state`, retaining every specific validation code first.
- Proved reconciliation, both mapping public APIs, direct drift classification, and the
  public lifecycle gate reach their existing structured projections through the canonical
  validator without new downstream catches.
- Preserved BaseException-derived process-control propagation and exact target/tree/staging
  state for both ordinary and process-control refresh failures.

## TDD Gate Compliance

| Gate | Commit | Evidence |
|---|---|---|
| RED | `1402305` | The integrated suite failed only because ordinary `RuntimeError("boom")` escaped refresh and source-state boundaries; BaseException and specific-code controls passed. |
| GREEN | `30199ab` | The same eight focused cases passed with exact existing serializer/apply/validator/reconciliation/mapping/classifier/gate results. |
| REFACTOR | None | Self-review found no concrete behavior-preserving cleanup; GREEN retained the minimal single-authority changes. |

## Task Commits

1. **Task 1 RED: lock getter-exception behavior across every public seam** — `1402305` (test)
2. **Task 2 GREEN: normalize ordinary exceptions at the two canonical boundaries** — `30199ab` (fix)
3. **Task 3 REFACTOR: prove one authority and run complete backstops** — verification-only; no additional source/test commit

## Files Created/Modified

- `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py` — Normalizes
  ordinary machine-view and preview-identity exceptions using the existing invalid-preview
  projections.
- `src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py` — Preserves
  `_SourceInputError.code` before mapping other ordinary exceptions to
  INPUT / `source-state-invalid` / MANIFEST_ABSENT.
- `tests/test_handoff_manifest_refresh.py` — Covers serializer/apply RuntimeError
  normalization, BaseException propagation, zero mutations, and exact target/tree/staging
  preservation.
- `tests/test_handoff_identity.py` — Covers direct validator and reconciliation generic
  normalization, specific-code precedence, and BaseException propagation.
- `tests/test_handoff_execution_mapping.py` — Covers `mapping-input-invalid` from both
  public mapping APIs.
- `tests/test_handoff_lifecycle_drift.py` — Covers identity-free UNKNOWN on either
  expected or observed canonical source side.
- `tests/test_handoff_lifecycle_gate.py` — Covers the wholly-unknown public gate result.
- `.planning/phases/03-lifecycle-drift-gate/03-29-SUMMARY.md` — Records TDD,
  verification, threat mitigation, authority integrity, and Plan 03-23 handoff evidence.

## Exact Public Behavior Evidence

### Refresh serializer and apply

- `serialize_manifest_refresh_preview` returns Failure with category PERSISTENCE, code
  `refresh-preview-invalid`, known state UNKNOWN, and no value when
  `previous_source_items.active` raises an ordinary RuntimeError.
- `apply_manifest_refresh` returns `ManifestRefreshFailure` with code
  `refresh-preview-invalid`, failure point STATE_GUARD, target state UNKNOWN, staging state
  ABSENT, cleanup outcome NOT_NEEDED, and no value.
- The supplied operations adapter records exactly zero mutations. Target bytes, every file
  in the repository tree, and the staging path set remain byte-for-byte unchanged.

### Canonical validator and downstream projections

- `validate_source_identity_state` and `reconcile_source_items` return INPUT /
  `source-state-invalid` / MANIFEST_ABSENT Failure without a value for the getter
  RuntimeError.
- An exact-base invalid counter retains INPUT / `source-state-counter-invalid` /
  MANIFEST_ABSENT, proving specific `_SourceInputError` precedence.
- `build_manifest_mappings` and `validate_mapping_readiness` both return INPUT /
  `mapping-input-invalid` / UNKNOWN without a value.
- `classify_canonical_source_drift` returns `canonical-observation-incomplete` UNKNOWN with
  empty artifact/source/progress evidence for malformed expected and observed sides.
- `gate_lifecycle_operation` returns wholly-unknown
  `canonical-observation-incomplete`: non-admission, no identity, no manifest digest, and
  empty artifact/source/progress/revalidation/replanning/next-action fields.

### Process-control behavior

- Dedicated BaseException-derived sentinels propagate from both refresh public seams and
  both source-state public seams.
- Source scanning confirms neither production file contains `except BaseException`.

## Decisions Made

- Refresh serializer and identity handling retain their existing taxonomy; no issue code,
  schema, API, dependency, approval order, lock, staging, replace, or cleanup behavior was
  introduced or changed.
- `validate_source_identity_state` remains the sole canonical source-state validation
  authority. Reconciliation, mapping, classifier, and gate compose its Result rather than
  adding catches or taxonomies.
- Plan 03-29 records implementation and behavior evidence only. Plan 03-23 remains the sole
  owner of fresh clean review, ASVS L1 security, all-29-plan verification, HND-03
  traceability, Phase 03 completion, and Phase 04 unblocking.

## Self-Review

- Reviewed the complete `0fe2350..HEAD` production/test diff and adjacent public consumers.
- Confirmed production behavior changed only at the two existing refresh exception
  boundaries and the ordered fallback in the one public source-state validator.
- Confirmed `_SourceInputError` precedence, supported-subclass success, exact-base controls,
  BaseException propagation, failure taxonomies, approval/persistence order, and wholly
  unknown public drift evidence remain intact.
- Confirmed no duplicate catch was added to reconciliation, execution mapping, lifecycle
  drift, or lifecycle gate.
- Confirmed canonical OpenSpec, REQUIREMENTS, ROADMAP, current REVIEW, completed plans, and
  completed summaries were not edited during implementation. The pre-existing STATE change
  from phase start was preserved.
- **Fixed findings:** none.
- **Judgment-only findings:** none.

## Verification

- RED integrated command — 6 failed and 2 passed controls; every failure was the expected
  escaping `RuntimeError: boom`, with no import, syntax, fixture, or setup failure.
- GREEN integrated command — 8 passed.
- Existing supported-subclass, exact-base, counter, malformed mapping, drift, gate,
  approval, and apply controls — 107 passed.
- Complete refresh, identity, execution-mapping, lifecycle-drift, and lifecycle-gate files
  — 592 passed in 75.94 seconds.
- Targeted Ruff — passed.
- Targeted BasedPyright — 0 errors, 0 warnings, 0 notes.
- Process-control superclass source scan — passed.
- `task check` — Ruff format/check passed, BasedPyright reported 0 errors, and all 970
  tests passed in 84.16 seconds.
- `task openspec:validate` — 1 passed, 0 failed.
- `git diff --check` — passed.
- Direct refresh apply and lifecycle gate public nodes — each passed independently with the
  exact structured evidence asserted above.
- **Unverified items:** none; no external runtime, credential, service, or manual step is
  required by this change.

## Threat Mitigations

- **T-03-29-REFRESH / STATE / PROPAGATION:** Ordinary getter exceptions now terminate in
  existing structured invalid/UNKNOWN results without reusable identity or evidence.
- **T-03-29-WRITE:** Public refresh failure proves zero mutations and exact target/tree/
  staging preservation.
- **T-03-29-BOUNDARY:** BaseException-derived sentinels remain unsuppressed and the source
  scan rejects a process-control superclass handler.
- **T-03-29-CONTRACT:** Existing supported-subclass, exact-base, and specific-code controls
  remain green.
- **T-03-29-REVIEW:** Plan 03-23 retains independent canonical exit authority.

No security-relevant surface outside the plan threat model was introduced.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None introduced. The modified source/test lines contain no placeholder, TODO, FIXME,
hardcoded empty UI value, or unwired data source.

## User Setup Required

None - no dependency, secret, external service, or manual configuration was added.

## Next Phase Readiness

- Plan 03-29 implementation and verification evidence are complete.
- Plan 03-23 can start its fresh independent review, ASVS L1 security audit, and
  all-29-plan verification that rejudges CR-01 and CR-02 without accepting this
  implementation-owned summary as independent evidence.
- HND-03 and Phase 03 remain incomplete, and Phase 04 remains blocked, until Plan 03-23
  completes those canonical exit gates.

## Self-Check: PASSED

- All seven source/test files and this summary exist.
- Commits `1402305` and `30199ab` exist in required RED then GREEN order.
- Summary frontmatter records `status: complete` and `requirements-completed: []` without
  claiming HND-03 completion.
- Protected authorities remain unchanged, and the implementation diff is limited to the
  seven declared source/test files plus this summary.

---
*Phase: 03-lifecycle-drift-gate*
*Completed: 2026-08-08*
