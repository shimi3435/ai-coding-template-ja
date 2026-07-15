---
phase: 02-approval-gated-skill-orchestration
plan: "01"
subsystem: skill-orchestration
tags: [openspec, gsd, approval, static-contract, generic-agent]

requires:
  - phase: 01-bridge-core-persistence-and-preflight
    provides: exact inspect_handoff, prepare_handoff, and mark_handoff_started public operations
provides:
  - approval-gated first-party execute-openspec-change instruction contract
  - exact route-parity payload and conservative observable GSD acceptance matrix
  - fail-closed generic-agent workflow, TOML preamble, and isolation preflight
affects: [02-02-skill-distribution, 03-deterministic-verification]

tech-stack:
  added: []
  patterns: [frozen-preview-tuple, parity-payload, conjunctive-observable-acceptance]

key-files:
  created:
    - .agents/skills/execute-openspec-change/SKILL.md
    - tests/fixtures/openspec_gsd_handoff/skill/contract.json
    - tests/test_execute_openspec_change_skill.py
  modified: []

key-decisions:
  - "Approval requires a complete source-pinned preview followed by a fresh explicit answer; refusal and unknown evidence have no mutable successor."
  - "Both GSD routes consume one exact parity payload, and started requires structured completed-success plus a route-specific read-only postcondition."
  - "Generic dispatch resolves the selected local workflow, every reachable active-config TOML preamble, and isolation evidence before approval, or fails closed."

patterns-established:
  - "Static instruction contracts disclose that they verify text/fixture consistency, not actual host orchestration."
  - "Non-accepted dispatch retains prepared without retry, rollback, route switching, or lifecycle expansion."

requirements-completed: [SKILL-01]

duration: 12min
completed: 2026-07-15
status: complete
---

# Phase 2 Plan 1: Approval-Gated Skill Orchestration Summary

**A source-pinned first-party skill now gates manifest preparation and GSD dispatch on a complete preview, fresh approval, exact parity payload, and observable conservative acceptance.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-15T10:02:40Z
- **Completed:** 2026-07-15T10:14:53Z
- **Tasks:** 4
- **Files modified:** 3

## Accomplishments

- Added ordered read-only host/bridge inspection, complete preview, and fresh explicit approval with classified manual fallback and no pre-approval mutation.
- Added a structured prepared gate and one exact payload shared by uninitialized `$gsd-new-project --auto @<brief>` and initialized change-specific `$gsd-phase` routes.
- Added conservative acceptance matrices and route-specific read-only postconditions; only accepted evidence calls `mark_handoff_started(..., gsd_accepted=True)`.
- Added generic-agent preflight over the selected GSD 1.5.0 workflow, reachable spawn names, complete active-config TOML preambles, and isolation requirements, plus non-mutating manifest tracking reports.

## Task Commits

Each planned vertical slice retains a focused RED commit before its GREEN commit:

1. **Task 1: read-only preview and fresh approval**
   - `3eac8bb` — RED static preview/approval contract
   - `f70a803` — GREEN preview and approval gate
2. **Task 2: prepared gate and route parity**
   - `38a7eb6` — RED prepared/parity contract
   - `194b44e` — GREEN prepared route dispatch
3. **Task 3: conservative acceptance and state transition**
   - `df9e8bf` — RED acceptance matrix
   - `5a30500` — GREEN observable acceptance gate
4. **Task 4: generic-agent preflight and reporting**
   - `2a07637` — RED generic/report contract
   - `3fc8f50` — GREEN generic preflight and report

Post-task correction: `bd0bad5` freezes discovered canonical paths only after structured inspection success.

## Files Created/Modified

- `.agents/skills/execute-openspec-change/SKILL.md` — canonical first-party ordered orchestration instructions.
- `tests/fixtures/openspec_gsd_handoff/skill/contract.json` — preview, parity, acceptance, generic preflight, reporting, and evidence-limit fixture.
- `tests/test_execute_openspec_change_skill.py` — static executable-instruction and fixture-consistency checks.

## Decisions Made

- Kept all bridge mechanics on the three Phase 1 public operations and consumed structured values/classified codes rather than prose or exit 0.
- Treated a prose completion marker as supplemental only; accepted requires structured completion and the complete route-specific postcondition.
- Recorded the exact local 1.5.0 `--auto` reachable agent names while still requiring runtime traversal of the selected skill/workflow under frozen arguments and configuration.
- Required reporting of manifest path/source commit and a distinct later operator tracking commit, while forbidding the skill from committing automatically.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Froze discovered paths after inspection rather than before discovery**

- **Found during:** Post-task self-review
- **Issue:** Initial wording placed `canonical_paths` in the tuple frozen before `inspect_handoff`, although Phase 1 inspection is the source of those paths.
- **Fix:** Split immutable invocation evidence from the final preview tuple and add sorted paths exactly once after structured inspection success.
- **Files modified:** `.agents/skills/execute-openspec-change/SKILL.md`
- **Verification:** 17 focused skill tests, Ruff, and basedpyright passed.
- **Committed in:** `bd0bad5`

**Total deviations:** 1 auto-fixed bug. **Impact:** Corrected instruction ordering without changing scope or public seams.

## Issues Encountered

- RED commits for Tasks 3 and 4 initially triggered the Ruff format hook; reformatted failing tests were rerun red and committed before their GREEN changes.
- `task check` reached 199 passed / 1 failed. The failure is `test_no_orphans_between_lock_and_dirs`, because Plan 02-02 owns the intentionally absent `execute-openspec-change` lock entry and runtime symlinks. Those forbidden out-of-plan files were not modified.

## Verification

- `uv run pytest tests/test_execute_openspec_change_skill.py tests/test_handoff_cli.py tests/test_handoff_preflight.py -q` — 61 passed.
- `uv run ruff check tests/test_execute_openspec_change_skill.py` — passed.
- `uv run basedpyright tests/test_execute_openspec_change_skill.py` — 0 errors, 0 warnings, 0 notes.
- `uv run python -m json.tool tests/fixtures/openspec_gsd_handoff/skill/contract.json` — valid JSON.
- `task openspec:validate` — 1 passed, 0 failed for the canonical change.
- Git history confirms all four RED commits precede their matching GREEN commits.

## Evidence Limits

Normal tests verify static SKILL/fixture instructions plus the existing Phase 1 dynamic public state seam. The following remain explicitly **unverified** and belong to Phase 3 opt-in/manual evidence:

- actual host prompt execution;
- generic-agent spawning and injected role behavior;
- real `$gsd-new-project` or `$gsd-phase` mutation;
- both route-specific filesystem/read-only postconditions.

No claim in this plan treats static instruction checks as actual host orchestration evidence.

## Known Stubs

None. The scanned `missing_agents=[]` text is an intentional successful postcondition, not a placeholder value flowing to runtime output.

## User Setup Required

None - no dependency, service, secret, or runtime installation was changed.

## Next Phase Readiness

- Plan 02-02 can add the local lock digest, relative runtime symlinks, and operator guidance using the final SKILL.md bytes.
- Phase 3 remains responsible for opt-in/manual host orchestration evidence; Phase 2 does not claim OpenSpec final completion.

## Self-Check: PASSED
