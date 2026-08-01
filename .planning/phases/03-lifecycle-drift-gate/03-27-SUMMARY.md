---
phase: 03-lifecycle-drift-gate
plan: 27
subsystem: manifest-migration-source-identity
tags:
  - tdd
  - source-identity
  - migration-preview
  - supported-subclass
status: complete
requires:
  - phase: 03-lifecycle-drift-gate
    plan: 26
    provides: falsey previous-state preservation and tombstone collision control
provides:
  - canonical source-state validator admission for migration preview shape
  - consistency-local exact-base state projection for strict manifest-v2 round-trip comparison
  - public falsey subclass preview and approved apply regression with malformed, exact-base, and collision controls
affects:
  - Phase 03 Plan 23 fresh independent all-27-plan exit review
  - HND-03 independent security and verification exit gates
tech-stack:
  added: []
  patterns:
    - supported source-state subclasses are admitted through the canonical validator
    - exact-base projection is confined to strict serialization comparison
key-files:
  created:
    - .planning/phases/03-lifecycle-drift-gate/03-27-SUMMARY.md
  modified:
    - src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py
    - tests/test_handoff_migration.py
key-decisions:
  - Require validate_source_identity_state Success before preview consistency, serialization, or identity work.
  - Preserve the supplied previous-state object and use a field-identical base SourceIdentityState only for previous-validation serialization.
  - Leave clean review, security, verifier, HND-03, and Phase 03 completion authority to fresh independent Plan 03-23 execution.
patterns-established:
  - "Validator-aligned admission: migration preview accepts exactly the supported source-state contract already owned by source identity."
requirements-completed: []
duration: 8 min
completed: 2026-08-01
---

# Phase 03 Plan 27: Supported Source-State Subclass Admission Summary

**Migration preview and approved apply now retain a valid falsey source-state subclass while strict manifest-v2 comparison receives only a field-identical exact-base projection.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-08-01T12:12:54Z
- **Completed:** 2026-08-01T12:20:57Z
- **Tasks:** 2
- **Files modified:** 2, plus this summary

## Accomplishments

- Closed current CR-01 through a public RED-to-GREEN preview/apply regression using a
  canonical-validator-approved falsey `SourceIdentityState` subclass with counters 1/1.
- Replaced the conflicting exact-base preview-shape predicate with the existing
  `validate_source_identity_state` Result authority before consistency and identity work.
- Kept the exact supplied object in public preview/source-context/apply paths while
  projecting its four validated fields to base `SourceIdentityState` only for strict
  manifest-v2 serialization/reparse comparison.
- Preserved malformed preview-invalid, exact-base success, and the exact 03-26 tombstone
  collision outcome without changing manifest-v2, taxonomy, schema, dependencies, or
  persistence contracts.

## TDD Gate Compliance

| Gate | Commit | Evidence |
|---|---|---|
| RED | `fe6d5b9` | The validator returned `Success` with the exact falsey object, but the old exact-base guard returned PERSISTENCE / `migration-preview-invalid` / UNKNOWN. |
| GREEN | `f1bec7a` | Public preview and exact approved apply returned `Success`, retained the supplied object, allocated literal `REQ-000001` / `SCN-000001`, installed candidate bytes, and left no staging residue. |
| REFACTOR | None | The GREEN diff already reuses one validator and confines one necessary projection; no behavior-preserving cleanup was needed. |

## Task Commits

1. **Task 1 RED: expose supported-subclass preview rejection** - `fe6d5b9` (test)
2. **Task 1 GREEN: align preview admission and consistency serialization** - `f1bec7a` (feat)
3. **Task 2: verify validator alignment and exit handoff** - verification-only; no additional production/test commit

## Files Created/Modified

- `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py` - Reuses
  canonical source-state validation and creates a consistency-local exact-base projection.
- `tests/test_handoff_migration.py` - Adds public subclass preview/apply success,
  explicit exact-base success, and malformed previous-state apply coverage.
- `.planning/phases/03-lifecycle-drift-gate/03-27-SUMMARY.md` - Records TDD,
  verification, authority integrity, and Plan 03-23 handoff evidence.

## Exact Public Behavior Evidence

### RED: old exact-base guard

- `validate_source_identity_state` returned `Success` with
  `validation.value is state` for the falsey subclass with counters 1/1 and empty tuples.
- The committed RED node failed at public preview because the old implementation returned
  exact PERSISTENCE / `migration-preview-invalid` / UNKNOWN rather than `Success`.
- A direct old-guard behavior probe confirmed the schema-1 target, complete repository
  tree, and staging absence remained unchanged.

### GREEN: retained subclass and approved apply

- Public preview returned `Success` and retained
  `preview.previous_source_items is state`.
- Candidate active identities were exactly `REQ-000001` and `SCN-000001`; both
  `source_context_sha256` and `preview_sha256` were populated 64-character identities.
- Applying the exact preview with literal approval and its exact preview hash returned
  `Success`, installed exactly `candidate_bytes`, retained candidate source items, and
  performed only `create`, `write`, and `replace` with no staging residue.
- The post-apply repository tree differed from the pre-apply tree only at the manifest
  target, whose bytes exactly matched the preview candidate.

### Fail-closed controls

- An explicit exact-base empty `SourceIdentityState` still produced preview `Success` and
  retained the exact supplied object without mutation.
- A reviewed preview whose previous state was replaced with an arbitrary object returned
  exact `migration-preview-invalid` at STATE_GUARD with UNKNOWN target, ABSENT staging,
  zero mutations, and unchanged target/tree.
- The 03-26 falsey tombstone collision remained exact INPUT /
  `source-tombstone-identity-collision` / MANIFEST_ABSENT with unchanged target/tree and
  absent staging.

## Validator and Consistency Rationale

- `_preview_has_valid_shape` performs exact outer preview and bounded scalar/container
  admission first, then requires canonical validator `Success` before nested consistency,
  serialization, or identity hashing. Malformed nested source state therefore fails through
  one authority and collapses to the existing public preview-invalid result.
- `_preview_is_consistent` constructs a local exact-base `SourceIdentityState` using the
  validated counters, active tuple, and tombstone tuple only for `previous_validation =
  serialize_manifest_v2(...)`. This avoids parsed-base-versus-subclass dataclass inequality
  without relaxing manifest-v2 equality.
- `_source_context_object`, `_candidate_changes_from_states`, public
  `preview.previous_source_items`, candidate reconciliation, preview identity, and apply
  reconciliation continue to consume the original supported object or its exact fields.

## Decisions Made

- The canonical source-state validator defines supported subclass admission; migration
  preview does not maintain a second exact-runtime-type policy.
- Strict manifest-v2 serializer/parser/equality behavior remains unchanged. Adapting only
  the previous-validation input is narrower than changing the schema or general equality
  contract.
- Plan 03-27 records implementation and behavior evidence only. Fresh independent Plan
  03-23 remains the sole owner of clean review, ASVS L1 security, all-27-plan verification,
  HND-03 traceability, Phase 03 completion, and Phase 04 unblocking.

## Self-Review

- Reviewed the clean working/staged state and complete source/test diff from starting
  commit `ff76a78`; the diff contains only the two owned implementation/test files.
- Confirmed validator admission precedes consistency serialization and identity work, and
  the base projection appears only in `_preview_is_consistent` previous-validation
  serialization.
- Confirmed public previous-state retention, source-context identity, candidate/change
  derivation, exact approval, target guards, and apply reconciliation remain bound to the
  supplied object or exact fields.
- Confirmed `manifest_v2.py`, serializer/parser/schema, taxonomy, dependency, CAS and
  persistence behavior, and protected planning/OpenSpec authorities have no diff.
- **Fixed findings:** changed the preliminary `not Failure` validator check to require
  explicit `Success`, preserving fail-closed behavior if the Result family later expands.
- **Judgment-only findings:** none.

## Verification

- RED focused node — failed as required with exact PERSISTENCE /
  `migration-preview-invalid` / UNKNOWN after validator same-object `Success`.
- GREEN focused and control set — 10 passed, covering public subclass preview/apply,
  malformed previous state, explicit exact-base state, deterministic preview, and 03-26
  collision behavior.
- Complete migration suite — 53 passed.
- Source-identity malformed-counter/tombstone analogs plus refresh falsey-adapter analog —
  5 passed.
- Targeted Ruff — passed.
- Targeted BasedPyright — 0 errors, 0 warnings, 0 notes.
- `task check` — Ruff format/check passed, BasedPyright reported 0 errors, and all 961
  tests passed in 106.91 seconds.
- `git diff --check` — passed.
- Direct public behavior probe — observed exact object retention, 64-character identities,
  deterministic candidate IDs, apply `Success`, exact target candidate bytes, absent
  staging, malformed zero-mutation rejection, and exact collision Failure.
- **Unverified items:** none; no external runtime, credential, service, or manual step is
  required by this change.

## Authority Integrity

- Before this summary, the exact diff from `ff76a78` contained only the two owned
  source/test files and the required RED then GREEN commits.
- SHA-256/diff checks confirmed canonical OpenSpec design/spec/tasks, `REQUIREMENTS.md`,
  `ROADMAP.md`, `STATE.md`, current `03-REVIEW.md`, `03-23-PLAN.md`,
  `03-VALIDATION.md`, `manifest_v2.py`, and all completed phase plan/summary artifacts
  remained identical to their pre-execution snapshots.
- No OpenSpec task, HND-03 traceability row, Phase 03 state, clean review/security/verifier
  result, or Phase 04 gate was advanced.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The first RED commit attempt was correctly stopped because the configured Ruff hook
  reformatted one multiline assertion. The formatter-owned result was reviewed, restaged,
  and committed normally with no semantic change.

## Known Stubs

None introduced. The modified source/test lines contain no placeholder, TODO, FIXME,
hardcoded empty UI value, or unwired data source.

## User Setup Required

None - no dependency, secret, external service, or manual configuration was added.

## Next Phase Readiness

- Plan 03-27 implementation and verification evidence are complete.
- Plan 03-23 can now start fresh independent review, ASVS L1 security audit, and
  all-27-plan verification that rejudges current CR-01 without accepting this
  implementation-owned summary as independent evidence.
- HND-03 and Phase 03 remain incomplete, and Phase 04 remains blocked, until Plan 03-23
  completes those canonical exit gates.

## Self-Check: PASSED

- Source, test, and summary files exist.
- Commits `fe6d5b9` and `f1bec7a` exist in required RED then GREEN order.
- Summary frontmatter records `status: complete` and `requirements-completed: []` without
  claiming HND-03 completion.
- Protected authorities remain unchanged, the implementation diff is limited to the two
  owned source/test files, and only this summary is pending its documentation commit.

---
*Phase: 03-lifecycle-drift-gate*
*Completed: 2026-08-01*
