---
phase: 02-source-to-execution-mapping
plan: 04
subsystem: source-mapping
tags: [manifest-refresh, atomic-persistence, approval-binding, read-only-evidence, tdd]

requires:
  - phase: 02-source-to-execution-mapping
    provides: complete bounded started-v2 refresh preview from Plan 02-03
provides:
  - exact fresh-approval-bound atomic refresh apply for isolated repositories
  - structured staging, cleanup, preserved-v2, and unknown failure evidence
  - complete tracked read-only refresh preview with byte-invariance proof
affects: [phase-2-verification, lifecycle-drift, recovery, finalize]

tech-stack:
  added: []
  patterns:
    - exact immutable preview identity plus repeated state guards before mutation
    - bounded no-follow same-directory staging with one atomic replace
    - repository-root evidence generation through preview_manifest_refresh only

key-files:
  created:
    - .planning/phases/02-source-to-execution-mapping/02-REFRESH-PREVIEW.json
  modified:
    - src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py
    - tests/test_handoff_manifest_refresh.py

key-decisions:
  - "Tracked publication remains unexecuted; this plan records a concrete preview that requires a separate fresh user approval before any later apply."
  - "Refresh failures report preserved-v2 only after a bounded fresh target proof; otherwise the target state is unknown and no recovery action is attempted."
  - "Repository-root evidence includes exact target/tasks hashes, zero mutation operations, absent staging, complete reconciliation, and 49-of-49 mapping coverage."

patterns-established:
  - "Refresh apply accepts no caller-supplied repository, target, candidate, retry flag, or alternate route."
  - "Approval evidence and review evidence are deterministic compact JSON with a final LF and strict candidate reparse."

requirements-completed: [HND-02]

duration: 10 min
completed: 2026-07-21
status: complete
---

# Phase 2 Plan 4: Approval-Bound Refresh and Read-Only Evidence Summary

**Exact approved refresh apply is verified on isolated copies, while the real 42-item tracked manifest remains unchanged beside a complete 49-item read-only preview**

## Performance

- **Duration:** 10 min
- **Started:** 2026-07-21T17:22:43Z
- **Completed:** 2026-07-21T17:32:14Z
- **Tasks:** 2
- **Files created/modified:** 3

## Accomplishments

- Completed the refresh-specific apply seam with literal approval, exact preview identity, fresh target/source/artifact/progress/assignment/policy guards, durable staging validation, and one atomic replace.
- Covered approval rejection, replay, every preview-bound drift class, no-op, create/write/reread/validation/cleanup faults, replace failure, and pre-replace drift in isolated repositories.
- Generated the tracked read-only evidence using `preview_manifest_refresh` only; `apply_manifest_refresh` was not called for the tracked target.
- Recorded complete old/new artifact, progress, source, mapping, policy, assignment, candidate bytes, candidate hash, preview hash, reconciliation counts, exclusions, and no-op state without copying canonical requirement/scenario bodies.

## TDD Evidence and Commits

1. **Task 1: Apply only an exact freshly approved refresh in isolated repositories**
   - `7378964` — RED: missing public apply/failure seam caused collection failure.
   - `682c1f8` — GREEN: exact approved atomic apply and complete fault evidence.
2. **Task 2: Generate the real tracked read-only preview and stop before apply**
   - `7bcbff7` — RED: repository-root regression failed because `02-REFRESH-PREVIEW.json` did not exist.
   - `4961be2` — GREEN: generated the exact complete tracked read-only preview artifact.
   - `d3bad0c` — self-review fix: persisted and asserted zero mutation operations for T-02-12.

No separate refactor commit was needed.

## Isolated Apply Fault Matrix

| Boundary | Result | Target evidence | Staging / cleanup evidence |
| --- | --- | --- | --- |
| approval absent/wrong, malformed/replayed preview | rejected before mutation | unknown without mutation | absent / not-needed |
| target/source/artifact/progress/assignment/policy drift | rejected before staging | unchanged isolated target | absent / not-needed |
| exact approved candidate | success | exact candidate bytes installed | validated staging, one replace |
| complete no-op | success without write | original bytes unchanged | absent / not-needed |
| create/write/reread/validation fault | failure | `v2-preserved` only after fresh bounded proof | separate state and one cleanup outcome |
| replace failure | failure | unchanged target is `v2-preserved`; changed/unreadable/oversized is `unknown` | validated / one cleanup attempt |
| source/policy drift after staging | state-guard failure | `v2-preserved` after fresh proof | validated / removed |

No failure path retries, rolls back, repairs, switches route, invokes migration, or calls MVP `inspect` / `prepare` / `mark-started`.

## Real Preview Evidence

- Evidence artifact SHA-256: `6775ff40a9e01aa634ff67098a0a1d020808ef11be80ece4e06f881dab5270cf`
- Target before/after SHA-256: `554690a1eee6e632eaf7c4fce3517cba69ff38eb8a06a1873b7a5e6822e59914`
- Candidate SHA-256: `7c55fa4acee5ce69a294a0cb8c7449008eb6958e693f17a159eaeb3e3ca84558`
- Immutable preview SHA-256: `e71378ff57a70ed09396ed41b5c6827d844effd641a1884899e0b0d06d863dcc`
- Active source items: `42 -> 49`
- Reconciliation: `7` created, `2` updated, `0` tombstoned; counters `7/44`
- Mapping coverage: `49/49`
- Exclusions: empty
- No-op: `false`
- Recorded mutation operations: empty
- Staging files before/after: empty

The candidate is reviewable but is not installed. Its `handoff_state=started`, capabilities, ownership, and lifecycle subtrees match the tracked preimage exactly.

## Protected Surface Evidence

- Tracked handoff remained exactly `554690a1eee6e632eaf7c4fce3517cba69ff38eb8a06a1873b7a5e6822e59914` before and after all preview generation and verification.
- OpenSpec `tasks.md` remained exactly `cf4a9dc56afc15b98a008cff686989bd446215c95b3962ea3efd5a4f9eb30220`; task 2.2 was not changed.
- `git diff --exit-code` for those two protected files passed, and no `.handoff.*.tmp` file exists.
- Public CLI remains exactly `inspect`, `prepare`, and `mark-started`.

## Verification

- Task 1 resumed focused check: `uv run pytest tests/test_handoff_manifest_refresh.py -q` — 32 passed before Task 2.
- Phase 2 focused suite: `uv run pytest tests/test_handoff_manifest_refresh.py tests/test_handoff_execution_mapping.py tests/test_handoff_policy_reference.py -q` — 88 passed.
- Phase 1/v1 regression suite: `uv run pytest tests/test_handoff_identity.py tests/test_handoff_manifest_v2.py tests/test_handoff_migration.py tests/test_handoff_manifest.py tests/test_handoff_cli.py -q` — 186 passed.
- `uv run python -m ai_coding_template_ja.openspec_gsd_handoff --help` — exactly `inspect`, `prepare`, `mark-started`.
- `git diff --check` — passed.
- `task check` — Ruff format/check passed, basedpyright reported 0 errors, and 473 tests passed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added explicit mutation-count evidence for the tracked preview**

- **Found during:** self-review after Task 2 GREEN
- **Issue:** Hash and staging invariance were proven, but the T-02-12 mitigation explicitly required a mutation-counting regression.
- **Fix:** Passed a recording filesystem adapter through the repository-root preview invocation, asserted no mutating operation occurred, and persisted the empty operation list in the evidence artifact.
- **Files modified:** `tests/test_handoff_manifest_refresh.py`, `.planning/phases/02-source-to-execution-mapping/02-REFRESH-PREVIEW.json`
- **Verification:** focused root test, 88-test Phase 2 suite, 186-test Phase 1/v1 suite, and 473-test `task check` all passed.
- **Committed in:** `d3bad0c`

---

**Total deviations:** 1 auto-fixed Rule 2 completeness issue. **Impact:** strengthens the planned tracked-manifest safety proof without changing the preview/candidate hashes or expanding the mutation surface.

## Self-Review

- **Fixed:** explicit mutation-count evidence described above.
- **Report-only findings:** none.
- Reviewed correctness, approval binding, partial-failure classification, strict bounds, symlink/path safety, no-op behavior, scope, CLI/API stability, canonical prose nonduplication, secret leakage, and AGENTS.md compliance.

## Known Stubs

None. Empty exclusions, mutation operations, staging observations, ownership, and lifecycle collections are exact evidence/state values, not placeholders.

## Threat Flags

None. The new approval/persistence and tracked-preview trust boundaries are fully declared in Plan 02-04 threats T-02-10 through T-02-12.

## User Setup Required

None - no dependency, credential, optional tool, or external service is required.

## Unverified Boundaries

- **Actual tracked apply is intentionally unexecuted.** A later user-originated request must review this concrete preview and provide a separate fresh approval for exact preview hash `e71378ff57a70ed09396ed41b5c6827d844effd641a1884899e0b0d06d863dcc` before any real apply may be considered.
- Independent Phase 2 verifier/reviewer and the OpenSpec boundary task 2.2 update remain for the main orchestrator.
- Real OpenSpec/GSD/host smoke remains reasoned-unverified because it is opt-in Phase 3/manual evidence and outside normal Phase 2 CI.

## Next Phase Readiness

All four Phase 2 plans are implemented and locally green. Phase 3 must not start until independent review/verification passes and the main orchestrator updates the Phase 2/OpenSpec boundary state.

## Self-Check: PASSED

- All three declared task files exist.
- All five Plan 02-04 RED/GREEN/fix commits exist in order.
- Focused, Phase 1/v1, CLI, hash/diff, strict JSON/candidate reparse, and full project checks passed.
- Tracked handoff and OpenSpec tasks remain byte-identical, with no staging file and no tracked apply.

---
*Phase: 02-source-to-execution-mapping*
*Completed: 2026-07-21*
