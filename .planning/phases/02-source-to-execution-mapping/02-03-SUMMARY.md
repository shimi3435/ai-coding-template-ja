---
phase: 02-source-to-execution-mapping
plan: 03
subsystem: source-mapping
tags: [manifest-refresh, read-only-preview, approval-hash, hypothesis, tdd]

requires:
  - phase: 02-source-to-execution-mapping
    provides: exact 49-ID assignment baseline and operation readiness from Plan 02-02
provides:
  - exact started schema-2 source/artifact/progress/mapping refresh candidate
  - complete bounded read-only machine preview and SHA-256 identity
  - explicit no-op evidence and sole Phase-2 preview-builder property family
affects: [02-04-refresh-apply, lifecycle-drift, recovery, finalize]

tech-stack:
  added: []
  patterns:
    - repeated bounded observations before returning immutable preview evidence
    - fixed-order compact JSON plus final LF as approval identity bytes
    - complete active-source mapping validation before candidate creation

key-files:
  created:
    - src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py
    - tests/test_handoff_manifest_refresh.py
    - tests/fixtures/openspec_gsd_handoff/manifest/expected-refresh-preview.json
  modified: []

key-decisions:
  - "Refresh preview is a dedicated read-only schema-2 seam and exposes no apply, migration, MVP state transition, retry, rollback, repair, or route switch."
  - "The approval identity binds explicit old/new artifact, progress, source, mapping, policy, assignment, protected-subtree, candidate-byte, repository, and target evidence."
  - "Caller declaration order is normalized before candidate and preview hashing; semantic candidate order remains exact and deterministic."

requirements-completed: [HND-02]

duration: 16min
completed: 2026-07-18
status: complete
---

# Phase 2 Plan 3: Started-v2 Read-Only Refresh Preview Summary

**The pinned 42-item started manifest now yields one complete 49-item, 49-mapping schema-2 candidate and a bounded review hash without changing any filesystem state**

## Performance

- **Duration:** 16 min
- **Started:** 2026-07-18T17:38:16Z
- **Completed:** 2026-07-18T17:54:03Z
- **Tasks:** 2
- **Files created:** 3

## Accomplishments

- Reconciled the pinned manifest from 42 to exactly 49 active source items with zero tombstones and next counters `7/44`.
- Created `SCN-000037` through `SCN-000043` and updated only `REQ-000001` and `SCN-000018`, with literal old/new fingerprint evidence in the reviewed fixture.
- Built the complete deterministic 49-entry D-01 mapping baseline before candidate creation and preserved `handoff_state=started`, capabilities, ownership, and lifecycle canonical projections exactly.
- Added a compact fixed-field machine view that binds repository/target identity, explicit old/new views and hashes, policy/assignment evidence, complete candidate bytes, exclusions, protected-subtree hashes, and no-op state.
- Kept publication unreachable: no write, mkdir, staging, replacement, migration, MVP transition, apply API, CLI operation, retry, rollback, repair, or route switch was added.

## TDD Evidence

### Task 1: Reconcile the pinned started-v2 snapshot into one exact candidate

- **RED `1218065`:** collection failed because the dedicated `manifest_refresh` module and public preview seam did not exist.
- **GREEN `fb32adf`:** added exact reconciliation, current artifact/progress validation, complete mapping construction, protected-subtree equality, literal candidate bytes/value fixture, and read-only reobservation.

### Task 2: Bind a complete bounded preview and its sole property family

- **RED `0d4fd5f`:** the declared-order property falsified on reversed phase declarations because approval bytes retained caller order.
- **GREEN `33d7c5f`:** normalized declarations before candidate/hash construction and completed determinism, no-op, independent-bound, final-LF, and approval-hash checks.
- **Self-review fix `54ad422`:** made previous artifact/progress views and hashes plus normalized explicit matches first-class machine evidence instead of relying only on the old target hash.

## Exact Reconciliation Evidence

- Previous/candidate active counts: `42 -> 49`
- Created: `SCN-000037..SCN-000043`
- Updated: `REQ-000001`, `SCN-000018`
- Tombstones: `0`
- Candidate counters: requirement `7`, scenario `44`
- Candidate mappings: `49`, exactly equal to the active source-ID set
- Candidate SHA-256: `7c55fa4acee5ce69a294a0cb8c7449008eb6958e693f17a159eaeb3e3ca84558`

The preview SHA-256 intentionally changes with canonical isolated repository identity. One real exercise produced `12128eeb3a26858cfdb3d16726693364b2d3ad3d817fd8ec68d6c1ef87ef5eb8`; the test independently verifies each returned digest against the complete serialized machine bytes.

## Property Scope

The only new Phase-2 Hypothesis decorators are in `test_preview_builder_normalizes_declared_order_and_binds_identity`. The family covers bounded valid builder inputs, determinism, declaration-order normalization, candidate idempotence, and approval-hash binding. It generates no filesystem or apply behavior.

## Verification

- `uv run pytest tests/test_handoff_manifest_refresh.py tests/test_handoff_execution_mapping.py tests/test_handoff_policy_reference.py -q` — 67 passed.
- `uv run pytest tests/test_handoff_identity.py tests/test_handoff_manifest_v2.py tests/test_handoff_migration.py tests/test_handoff_manifest.py tests/test_handoff_cli.py -q` — 186 passed.
- `task check` — ruff format/check passed, basedpyright reported 0 errors, and 452 tests passed.
- Direct isolated preview exercise — 49 active, 0 tombstones, counters 7/44, 49 mappings, candidate hash above, target bytes unchanged.
- `git diff --check` — passed.
- Hypothesis scope grep — one new `@given` and its `@settings`, both in the refresh preview-builder family.

## Protected Surface Evidence

- Tracked handoff before/after SHA-256: `554690a1eee6e632eaf7c4fce3517cba69ff38eb8a06a1873b7a5e6822e59914`.
- Canonical OpenSpec `tasks.md` SHA-256 remains `cf4a9dc56afc15b98a008cff686989bd446215c95b3962ea3efd5a4f9eb30220`.
- ROADMAP SHA-256 remains `72ac480ad6c0b9331a20acd5f2735d8e43160842fcd0751ceea0be6c9ffe0a34`.
- The pre-existing orchestrator-owned STATE working-tree change remains byte-identical at `7dfc1471ef5fec5d06d7354f2d67031d6f42da0ce704e7e5c1e38fd651a22fda` and was not staged.
- Package root exports, CLI, canonical OpenSpec tasks, tracked handoff, ROADMAP, and MVP public operations have no Plan 02-03 diff.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added explicit old artifact/progress and source-match machine evidence**

- **Found during:** self-review after Task 2 GREEN
- **Issue:** The old target hash transitively bound prior artifact/progress state, but the exact machine view did not expose their required old views/hashes or explicit source matches as first-class fields.
- **Fix:** Added explicit previous artifact/progress views and hashes, normalized explicit-match evidence, and structured malformed-input failure.
- **Files modified:** `manifest_refresh.py`, `test_handoff_manifest_refresh.py`
- **Verification:** focused 12 tests, basedpyright, both regression groups, direct exercise, and full `task check` passed.
- **Committed in:** `54ad422`

---

**Total deviations:** 1 auto-fixed Rule 2 completeness issue. **Impact:** Approval evidence is more explicit; API, mutation surface, and plan scope are unchanged.

## Issues Encountered

- Pre-commit hooks normalized import order and the large literal JSON fixture before the affected commits were retried successfully.
- A literal preview digest cannot be portable across pytest temporary repositories because canonical repository identity is approval-relevant. The fixed fixture therefore owns literal candidate bytes/value/hash, while each isolated test independently recomputes the preview digest from its complete machine bytes.

## Self-Review

- **Fixed:** the explicit old-view/match evidence omission described above.
- **Report-only findings:** none.
- Checked correctness, byte bounds, fail-closed paths, unnecessary abstraction, scope, root/CLI stability, OpenSpec tasks, property scope, secret leakage, and AGENTS.md compliance.

## Known Stubs

None.

## User Setup Required

None - no external tools, credentials, dependency changes, or optional smoke environment are required.

## Next Phase Readiness

Plan 02-04 can consume the exact immutable preview and add a separately approved, freshly guarded apply seam. This plan deliberately provides no apply implementation or public CLI/root export.

## Self-Check: PASSED

- All three declared files exist.
- All five RED/GREEN/fix commits exist in order.
- Focused, mapping/policy, Phase-1/v1 regression, type, lint, full project, and direct real-function checks passed.
- Tracked handoff, canonical tasks, root/CLI, ROADMAP, and pre-existing STATE bytes remain unchanged.

---
*Phase: 02-source-to-execution-mapping*
*Completed: 2026-07-18*
