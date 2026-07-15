---
phase: 02-approval-gated-skill-orchestration
plan: "02"
subsystem: skill-distribution-and-guidance
tags: [openspec, gsd, symlink, provenance, approval]

requires:
  - phase: 02-approval-gated-skill-orchestration
    provides: final execute-openspec-change SKILL.md bytes and static instruction contract
provides:
  - exact local provenance and SHA-256 lock for execute-openspec-change
  - Claude and Codex relative-symlink distribution from one canonical skill root
  - approval-gated operator guidance with conservative route acceptance and evidence limits
affects: [03-deterministic-verification, skill-distribution, operator-guidance]

tech-stack:
  added: []
  patterns: [first-party-lock-integrity, canonical-relative-symlinks, structured-conjunctive-acceptance]

key-files:
  created:
    - .claude/skills/execute-openspec-change
    - .codex/skills/execute-openspec-change
  modified:
    - .agents/skills/skills.lock.json
    - tests/test_skills_lock.py
    - AGENTS.md
    - docs/agents/workflow.md
    - docs/optional/gsd.md

key-decisions:
  - "Existing scripts/setup-skills.sh remains the only runtime distribution implementation; both runtimes resolve one canonical .agents skill."
  - "Guidance accepts GSD only on structured completed-success plus the complete route-specific read-only postcondition."
  - "Phase 2 records actual host orchestration as unverified and assigns opt-in/manual evidence to Phase 3."

patterns-established:
  - "First-party skills use local/MIT/allowed provenance with an exact canonical SKILL.md digest."
  - "Pre-prepare refusal and post-prepare non-acceptance report different retained states without lifecycle expansion."

requirements-completed: [SKILL-01]

duration: 5min
completed: 2026-07-15
status: complete
---

# Phase 2 Plan 2: Skill Distribution and Approval-Gated Guidance Summary

**The source-pinned execute-openspec-change skill now has exact lock integrity, canonical Claude/Codex relative links, and operator guidance that requires explicit approval and observable route acceptance.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-15T10:19:24Z
- **Completed:** 2026-07-15T10:24:54Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added a focused TDD distribution contract and exact local first-party lock entry for canonical digest `f456311687c476ec807d5e28eb8e2c89a179a449e99ff69f34f482c62ef4ff51`.
- Used the unchanged collision-first setup script to create Claude and Codex links with literal target `../../.agents/skills/execute-openspec-change`; a second run was idempotent.
- Aligned agent and operator guidance on preview, fresh approval, exact route-parity payload, structured plus postcondition acceptance, generic-agent fail-closed behavior, prepared retention, later tracking commits, and OpenSpec final authority.
- Kept actual host execution, generic spawns, real GSD mutations, and route postconditions explicitly unverified for Phase 3 opt-in/manual evidence.

## Task Commits

1. **Task 1 RED: failing execute skill distribution contract** - `fa49eeb` (`test`)
2. **Task 1 GREEN: lock/hash and dual-runtime distribution** - `e82d959` (`feat`)
3. **Task 2: approval-gated handoff guidance** - `98776a5` (`docs`)

## Files Created/Modified

- `.agents/skills/skills.lock.json` - Records exact local/MIT/allowed provenance and SHA-256.
- `.claude/skills/execute-openspec-change` - Relative link to the canonical `.agents` skill.
- `.codex/skills/execute-openspec-change` - Relative link to the same canonical `.agents` skill.
- `tests/test_skills_lock.py` - Pins exact provenance, digest, literal link targets, and resolved canonical identity.
- `AGENTS.md` - Names the optional automation entry and preserves approval, authority, and evidence boundaries.
- `docs/agents/workflow.md` - Defines the exact operator sequence, parity payload, route-specific acceptance, generic workaround, and retention behavior.
- `docs/optional/gsd.md` - Provides the concise opt-in user route, manual fallback, source/tracking distinction, and Phase 3 evidence assignment.

## Decisions Made

- Reused `scripts/setup-skills.sh` without modification so collision preflight, broken-link repair, and relative-target behavior remain single-sourced.
- Treated prose markers and exit status as supplemental only; started remains unreachable without structured completion and the full route-specific read-only postcondition.
- Documented generic dispatch as a workaround requiring complete local workflow/TOML/isolation resolution, not as typed-dispatch equivalence.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Focused filesystem-only pytest runs emitted expected coverage warnings because no Python package module was imported. The tests passed, and the full `task check` coverage run completed normally.

## Verification

- `uv run pytest tests/test_execute_openspec_change_skill.py tests/test_skills_lock.py tests/test_setup_skills.py -q` - 34 passed.
- `uv run ruff check tests/test_execute_openspec_change_skill.py tests/test_skills_lock.py tests/test_setup_skills.py` - passed.
- `uv run basedpyright tests/test_execute_openspec_change_skill.py tests/test_skills_lock.py tests/test_setup_skills.py` - 0 errors, 0 warnings, 0 notes.
- `bash scripts/setup-skills.sh` - second and final runs reported all links current with no changes.
- `task check` - formatting, Ruff, basedpyright, and all 201 tests passed.
- Git history confirms `fa49eeb` RED precedes `e82d959` GREEN.

## Evidence Limits

Normal CI verifies the static SKILL/fixture instruction contract and the existing Phase 1 dynamic state seams. It does not execute actual host prompts, spawn generic agents, mutate a real GSD project, or observe either route-specific postcondition. Those observations remain unverified and belong to Phase 3 opt-in/manual evidence.

## Known Stubs

None. The documented `missing_agents=[]` value is an intentional successful read-only probe postcondition, not a runtime placeholder.

## Threat Flags

None. The change adds integrity metadata, local relative symlinks, tests, and guidance; it introduces no endpoint, authentication path, schema boundary, or new file-access implementation.

## User Setup Required

None - no dependency, service, secret, or runtime installation changed.

## Next Phase Readiness

- Phase 3 can gather opt-in/manual actual-host evidence against the distributed canonical skill and documented acceptance predicates.
- Phase 2 completion does not imply OpenSpec final completion or authorize lifecycle automation, retry/recovery, cleanup, commit, push, PR, or merge.

## Self-Check: PASSED

- Summary file exists with `status: complete` and `requirements-completed: [SKILL-01]`.
- Task commits `fa49eeb`, `e82d959`, and `98776a5` exist in order.
- Registered requirement metadata marks `SKILL-01` complete; STATE and ROADMAP remain orchestrator-owned in this worktree.
