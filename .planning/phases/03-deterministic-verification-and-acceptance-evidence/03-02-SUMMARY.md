---
phase: 03-deterministic-verification-and-acceptance-evidence
plan: "02"
subsystem: testing
tags: [openspec, gsd, acceptance, source-pinning, evidence]
requires:
  - phase: 03-deterministic-verification-and-acceptance-evidence
    plan: "01"
    provides: read-only real-tool smoke and isolated no-GSD normal check
  - phase: 02-approval-gated-skill-orchestration
    provides: explicit host-level evidence limits and approval-gated skill contract
provides:
  - canonical-derived fail-closed acceptance-evidence validator
  - exact 5 requirement, 26 scenario, and 60 spec-hole traceability matrix
  - operator contract for the explicit read-only real-tool smoke
affects: [openspec-final-acceptance, phase-03-verification]
tech-stack:
  added: []
  patterns: [fixed-argv bounded Git blobs, document-local coordinates, reasoned-unverified evidence]
key-files:
  created:
    - scripts/validate-handoff-acceptance-evidence.py
    - tests/test_handoff_acceptance_evidence.py
    - .planning/phases/03-deterministic-verification-and-acceptance-evidence/03-ACCEPTANCE-EVIDENCE.md
  modified:
    - tests/test_handoff_discovery.py
    - docs/optional/gsd.md
key-decisions:
  - "Acceptance coordinates are derived only from proposal/design/spec blobs at fixed commit 5a1f78b; worktree drift is never authority."
  - "Requirement, scenario, and spec-hole labels are document-local evidence coordinates, not new stable OpenSpec identifiers."
  - "Actual host prompt, generic-agent spawn, real GSD mutation, and route postconditions remain reasoned-unverified because no safe dry-run seam exists."
patterns-established:
  - "Evidence validation: validate fixed metadata, read bounded fixed-path Git blobs, derive canonical order, then validate claims."
  - "Acceptance honesty: installed-tool smoke cannot stand in for host dispatch or mutation evidence."
requirements-completed: [VERIFY-01]
duration: 8min
completed: 2026-07-15
status: complete
---

# Phase 3 Plan 2: Source-pinned Acceptance Evidence Summary

**A bounded validator now derives and enforces the complete OpenSpec acceptance matrix while preserving four unsafe host observations as explicitly unverified.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-15T20:37:02+09:00
- **Completed:** 2026-07-15T20:45:15+09:00
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Added a stdlib validator that accepts only the fixed source commit and canonical paths, reads proposal/design/spec with fixed `git show` argv and bounded output, and derives the exact 5/26/60 coordinate sequence.
- Added 33 validator tests covering every stable failure class, path/SHA injection before Git calls, bounded and invalid blobs, worktree drift, ordering, duplicate metadata, global/local-path/raw-body leakage, and the four host rows.
- Made JSON/fallback artifact kind, path, SHA-256, canonical bytes, and normalized progress parity explicit in the existing integration test without adding production behavior.
- Recorded an exact source-pinned acceptance matrix and successful no-GSD/real-tool observations without absolute local paths, raw probe output, or canonical Markdown bodies.

## Task Commits

1. **Task 1 RED: acceptance evidence contract** - `aaf8ac0` (test)
2. **Task 1 GREEN: source-pinned validator** - `0601246` (feat)
3. **Task 2: read-only smoke operator contract** - `191d671` (docs)
4. **Task 3: explicit route parity projection** - `7518f46` (test)
5. **Task 3: complete acceptance evidence** - `23fa846` (docs)
6. **Main review RED: global body and metadata gaps** - `5e43209` (test)
7. **Main review GREEN: fail-closed global and duplicate checks** - `0a00ce2` (fix)

## Files Created/Modified

- `scripts/validate-handoff-acceptance-evidence.py` - bounded fixed-argv canonical blob reader, coordinate derivation, evidence parser, fail-closed validation, and one-line JSON CLI.
- `tests/test_handoff_acceptance_evidence.py` - positive 5/26/60+4 matrix and table-driven negative validator contract.
- `tests/test_handoff_discovery.py` - explicit sorted artifact identity/hash/bytes and progress projection over both routes.
- `docs/optional/gsd.md` - exact opt-in invocation, output/exit contract, read-only scope, normal-CI isolation, and host evidence limits.
- `.planning/phases/03-deterministic-verification-and-acceptance-evidence/03-ACCEPTANCE-EVIDENCE.md` - source-pinned Phase 2 spec-hole mapping and actual smoke evidence.

## Decisions Made

- The evidence header's exact fixed SHA and four paths are validated before any Git process. Evidence-supplied paths are never interpolated into argv.
- `tasks.md` remains a required fixed header path but is not read from the pinned commit because its progress checkboxes intentionally change during implementation.
- Pinned proposal/design/spec bodies define coordinate and leakage authority; worktree drift neither changes expected coordinates nor provides an alternate leakage baseline.
- GSD plan completion enables OpenSpec tasks 5.1/5.2 review but does not mark or complete those canonical boundary tasks.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The first evidence commit attempt was stopped by the end-of-file pre-commit hook. The hook's formatting-only correction was revalidated before the successful commit.
- The query-form state metric/decision calls rejected positional arguments in this installed GSD version. The documented named-argument state commands succeeded; their initially unknown phase label was corrected to Phase 03, and `state validate` passed without warnings.

## Main Review Fixes

- A pinned non-heading canonical body line is now rejected even when copied into ordinary prose outside all evidence tables. The validator compares normalized global lines as well as locator/reason cells, while allowing headings, the five exact metadata lines, and short references.
- Duplicate Source commit metadata now fails as `source-commit-invalid`; duplicate Proposal/Design/Spec/Tasks path metadata fails as `canonical-paths-mismatch`. All five cases stop before any Git call.
- These gaps were closed with a separate RED commit followed by the minimal GREEN fix; the existing tracked evidence remains valid.

## Verification

- `uv run pytest tests/test_handoff_acceptance_evidence.py -q`: 33 passed after main review fixes.
- `uv run pytest tests/test_handoff_discovery.py tests/test_handoff_acceptance_evidence.py -q`: 47 passed.
- Phase 1/2/smoke audit suite: 143 passed before evidence implementation.
- `task check:without-gsd`: exit 0; nested normal check passed 248 tests with optional launchers absent.
- `task check`: Ruff format/check, basedpyright, and all 254 tests passed after main review fixes.
- Validator CLI: `ok`, with 5 requirements, 26 scenarios, 60 spec holes, and 4 host-unverified rows.
- Real opt-in smoke: two exit-0 read-only runs; exact OpenSpec 1.3.1 / GSD 1.5.0, route `json`, initialized `gsd-phase` signal, and `write_detected=false`. The tracked evidence records the first bounded snapshot; the final verification run observed 13,965 entries after the evidence file existed.
- `git diff --check` and absolute-home-path scans: passed.

## Evidence Limits

- **Unverified:** actual host prompt, generic-agent spawn, real GSD mutation, and JSON/Markdown-fallback route-specific postconditions.
- **Reason:** no read-only or dry-run host seam exists; invoking these would cross the approval/mutation boundary.
- No hardening, lifecycle automation, retry, resume, rollback, finalize, cleanup, push, PR, or merge was performed.

## Known Stubs

None.

## User Setup Required

None - the real-tool smoke remains an explicit operator opt-in using an already active GSD configuration root.

## Next Phase Readiness

- The GSD implementation/verification boundary for VERIFY-01 is complete and mechanically reviewable.
- OpenSpec tasks 5.1/5.2 and final completion remain with the main/orchestrator; this summary does not mark them.

## Self-Check: PASSED

- All five changed paths exist.
- Task commits `aaf8ac0`, `0601246`, `191d671`, `7518f46`, `23fa846`, `5e43209`, and `0a00ce2` exist on the worktree branch.
- No canonical OpenSpec task checkbox was modified by this plan.

---
*Phase: 03-deterministic-verification-and-acceptance-evidence*
*Completed: 2026-07-15*
