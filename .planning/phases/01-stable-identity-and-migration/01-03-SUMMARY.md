---
phase: 01-stable-identity-and-migration
plan: 03
subsystem: openspec-gsd-handoff
tags: [manifest-v2, exact-schema, version-dispatch, hypothesis, tdd]

requires:
  - phase: 01-stable-identity-and-migration
    provides: stable active/tombstone source identity state from Plan 01-02
provides:
  - frozen exact eleven-field schema-2 aggregate and canonical codec
  - bounded exact schema-version dispatch preserving the schema-1 compatibility island
  - independent schema-2 golden bytes and the approved manifest round-trip property
affects: [01-04-migration-preview, 01-05-migration-apply]

tech-stack:
  added: []
  patterns:
    - exact schema parser delegation over the same bounded bytes
    - frozen complete values with serialize-reparse equality
    - one bounded manifest round-trip property family

key-files:
  created:
    - src/ai_coding_template_ja/openspec_gsd_handoff/manifest_v2.py
    - src/ai_coding_template_ja/openspec_gsd_handoff/versioned_manifest.py
    - tests/test_handoff_manifest_v2.py
    - tests/fixtures/openspec_gsd_handoff/manifest/expected-migrated-v2.json
  modified: []

key-decisions:
  - "Schema 2 delegates its unchanged seven-field prefix to the existing exact schema-1 parser instead of duplicating or weakening that contract."
  - "Requested schema 2 may read schema 1 for migration preview, while requests below the on-disk version fail as downgrades."
  - "Non-empty mapping, ownership, and lifecycle values are strictly schema-validated, but Phase 1 migration output remains the exact empty placeholder shape."

patterns-established:
  - "Inspect only the discriminator, then require one selected complete parser to succeed on the same bytes."
  - "Keep versioned reads module-local; do not expand package-root exports or CLI operations."

requirements-addressed: [HND-01]
requirements-completed: []

duration: 12 min
completed: 2026-07-17
status: complete
---

# Phase 1 Plan 3: Exact Schema-2 Manifest Summary

**Exact eleven-field schema-2 codec with bounded v1/v2 dispatch, independent golden bytes, and fail-closed downgrade handling**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-16T21:23:39Z
- **Completed:** 2026-07-16T21:35:24Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added frozen schema-2 values for source identity state, mappings, ownership declarations, and lifecycle record references.
- Reused the unchanged schema-1 parser for the seven common fields and added strict schema-2 validation for exact fields, primitive types, IDs, counters, parents, paths, ordering, allowlists, states, collection bounds, and the 8 MiB envelope.
- Added canonical deterministic serialization with one final newline, complete strict reparse, and value equality.
- Added a read-only versioned facade that performs one bounded file read, dispatches only exact schema 1 or 2, rejects malformed/unknown versions and downgrades, and does not expose a partial version-probe success.
- Preserved the exact package-root operations and CLI subcommands.

## TDD Evidence

### Task 1: Encode and validate the exact schema-2 aggregate

- **RED:** `d3121db` added the independent eleven-field fixture and failing public-seam tests; collection failed because `manifest_v2` did not exist.
- **GREEN:** `17c6926` implemented the complete exact schema-2 aggregate, validators, and canonical codec.

### Task 2: Dispatch exact schema versions and prove schema-2 round trip

- **RED:** `b2288e5` added exact dispatch, single-read, downgrade, and Hypothesis round-trip tests; collection failed because `versioned_manifest` did not exist.
- **GREEN:** `7453ea3` implemented bounded version dispatch and the read-only file facade.
- **REFACTOR:** No separate refactor commit was needed.

### Post-GREEN collision audit

- **RED:** `7288b80` added a regression where distinct active/tombstone IDs share one normalized source identity.
- **GREEN:** `5594a1d` rejected normalized identity collisions across both persisted collections.

## Task Commits

1. **Task 1: Encode and validate the exact schema-2 aggregate**
   - `d3121db` — test: exact schema-2 contract RED
   - `17c6926` — feat: exact schema-2 codec GREEN
2. **Task 2: Dispatch exact schema versions and prove schema-2 round trip**
   - `b2288e5` — test: exact version-dispatch contract RED
   - `7453ea3` — feat: bounded exact version dispatch GREEN
3. **Post-GREEN collision audit**
   - `7288b80` — test: active/tombstone identity collision RED
   - `5594a1d` — fix: cross-state identity collision GREEN

## Files Created

- `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_v2.py` — frozen schema-2 values, strict exact validators, and canonical codec.
- `src/ai_coding_template_ja/openspec_gsd_handoff/versioned_manifest.py` — bounded one-read schema discriminator and exact parser dispatch.
- `tests/test_handoff_manifest_v2.py` — golden, rejection, dispatch, downgrade, single-read, and round-trip evidence.
- `tests/fixtures/openspec_gsd_handoff/manifest/expected-migrated-v2.json` — hand-reviewed exact schema-2 bytes with Phase-1-valid empty placeholders.

## Decisions Made

- Schema 2 keeps all seven schema-1 fields unchanged in meaning by delegating a reconstructed exact seven-field object to `parse_manifest_bytes`; the existing parser and repository transition code remain untouched.
- The versioned facade treats `requested_schema_version=2` with on-disk schema 1 as a valid read for later migration preview, but rejects any requested version below the disk version before a write seam exists.
- Mapping, ownership, and lifecycle types accept only their exact canonical shapes and allowlists. Their empty values are schema-valid migration placeholders and do not claim later-phase readiness.
- `HND-01` remains pending because Plans 01-04 and 01-05 still own read-only migration preview and approval-bound atomic persistence.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected incomplete GSD state progress rendering**
- **Found during:** Plan metadata close-out
- **Issue:** `state.update-progress` counted three summaries but wrote `percent: 0`, left the human-readable position at Plan 01-02 / 40%, and appended the metric outside its table.
- **Fix:** Reconciled `STATE.md` to the on-disk 3/5 summary count, 60% progress, Plan 01-04 readiness, and the cumulative performance totals.
- **Files modified:** `.planning/STATE.md`
- **Verification:** State and roadmap both report 3/5 plans, while `01-04-SUMMARY.md` remains absent.
- **Committed in:** `702287d`

**2. [Rule 1 - Bug] Rejected normalized identity collisions across active and tombstone state**
- **Found during:** Final canonical collision audit
- **Issue:** Exact IDs were globally unique, but a tombstone with a different ID could duplicate an active item's normalized category/path/heading/parent identity.
- **Fix:** Validate one combined persisted-identity set across active and tombstone records before returning a schema-2 value.
- **Files modified:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_v2.py`, `tests/test_handoff_manifest_v2.py`
- **Verification:** The new RED regression fails before the fix; focused 72 tests and the full 312-test project check pass after it.
- **Committed in:** `5594a1d`

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs).
**Impact on plan:** Both fixes are required for accurate progress and fail-closed schema correctness; no scope expansion.

## Issues Encountered

- Context7 CLI was unavailable. No dependency or package API was added; the implementation used Python stdlib plus the already locked Hypothesis API and existing repository test conventions.

## Test Results

- `uv run pytest tests/test_handoff_manifest_v2.py tests/test_handoff_manifest.py tests/test_handoff_cli.py -q` — 72 passed.
- `task check` — ruff format/check, basedpyright, and 312 tests passed.
- Focused `ruff` and `basedpyright` checks for both new modules and their tests passed.
- `python -m ai_coding_template_ja.openspec_gsd_handoff --help` still showed exactly `inspect`, `prepare`, and `mark-started`.
- `git diff --check` passed.
- Historical `.planning/openspec/.../handoff.json`, `handoff-brief.md`, canonical `tasks.md`, schema-1 `manifest.py`, package root, and CLI module remained unchanged from the source authority.

## TDD Gate Compliance

- Both tasks have a failing `test(01-03)` commit immediately before their corresponding `feat(01-03)` commit.
- RED failed because each planned public module seam was absent, not because of syntax or unrelated infrastructure.
- The only property family added is the approved complete manifest round-trip seam.
- No refactor commit was necessary after GREEN.

## Known Stubs

None. Empty mappings, ownership arrays, and lifecycle arrays are intentional exact Phase-1 schema placeholders; later readiness behavior remains owned by Phases 2–6.

## Threat Surface

No unplanned threat surface was introduced. Exact discriminator dispatch, nested input validation, 4096-item bounds, and the 8 MiB limit implement threat register entries T-01-07 through T-01-09.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 01-04 can consume exact schema-1 or schema-2 reads and construct a complete read-only migration preview. The real historical handoff manifest remains untouched, and migration apply, filesystem staging, replace-failure classification, mapping readiness, ownership, drift, recovery, and finalize behavior remain unimplemented or deferred to their owning plans/phases.

## Self-Check: PASSED

- All four declared created files exist.
- All six RED/GREEN task and regression commits exist in order.
- Focused and full project checks pass.
- Historical manifest, brief, OpenSpec tasks, schema-1 implementation, package root, and CLI remain unchanged.

---
*Phase: 01-stable-identity-and-migration*
*Completed: 2026-07-17*
