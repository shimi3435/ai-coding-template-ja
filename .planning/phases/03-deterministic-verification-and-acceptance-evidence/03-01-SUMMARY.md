---
phase: 03-deterministic-verification-and-acceptance-evidence
plan: "01"
subsystem: testing
tags: [openspec, gsd, smoke, filesystem, taskfile]
requires:
  - phase: 01-bridge-core-persistence-and-preflight
    provides: fixed-argv OpenSpec/GSD probes and canonical discovery parsers
  - phase: 02-approval-gated-skill-orchestration
    provides: explicit host-level unverified evidence boundary
provides:
  - ignored-inclusive streaming repository fingerprint with stable mutation failures
  - explicit read-only OpenSpec 1.3.1 / GSD 1.5.0 smoke CLI and Taskfile entrypoint
  - isolated real task check proving normal CI does not need Node, OpenSpec, or GSD
affects: [03-02-acceptance-evidence, openspec-final-acceptance]
tech-stack:
  added: []
  patterns: [fixed-argv read-only probes, before-after repository fingerprint, opt-in task isolation]
key-files:
  created:
    - src/ai_coding_template_ja/openspec_gsd_handoff/smoke.py
    - scripts/openspec-gsd-handoff-smoke.py
    - tests/test_handoff_smoke.py
  modified:
    - Taskfile.yml
    - tests/test_taskfile.py
key-decisions:
  - "The repository snapshot skips only the exact root .git entry and streams every other regular file without canonical artifact byte limits."
  - "The opt-in task emits one JSON stdout line and one human stderr line; normal check remains unchanged."
  - "Unsafe host dispatch and mutation observations remain explicitly unverified because no safe dry-run exists."
patterns-established:
  - "Optional compatibility proof: fake-runner normal CI plus explicit real-tool smoke."
  - "Mutation proof: stable no-follow inventory before and after every permitted probe."
requirements-completed: [VERIFY-01]
duration: 12min
completed: 2026-07-15
status: complete
---

# Phase 3 Plan 1: Read-only Real-tool Smoke Summary

**Exact OpenSpec/GSD probes now run behind an opt-in, repository-write-detecting smoke while normal `task check` is proven in an isolated no-GSD environment.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-15T20:17:34+09:00
- **Completed:** 2026-07-15T20:29:38+09:00
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added a sorted, no-follow, ignored-inclusive repository snapshot that hashes regular bytes in 1 MiB chunks and classifies inventory, metadata, timeout, unreadable, unstable, and write failures.
- Added a thin validated CLI and silent opt-in Taskfile task that report exact pinned versions/signals without absolute roots or canonical Markdown bodies.
- Proved the unchanged normal `check` passes under `env -i` with empty HOME/CODEX_HOME/GSD_HOME, offline uv, and a curated PATH where node, OpenSpec, npm/npx, and GSD launchers are absent.
- Ran the real opt-in smoke successfully against local OpenSpec 1.3.1 and GSD 1.5.0; it observed the JSON route, initialized `gsd-phase` signal, 13,959 repository entries, and no repository write.

## Task Commits

1. **Task 1 RED: smoke core contract** - `adc0c38` (test)
2. **Task 1 GREEN: read-only compatibility smoke** - `41272a5` (feat)
3. **Task 2 RED: CLI and task isolation contract** - `187287d` (test)
4. **Task 2 GREEN: explicit smoke and no-GSD check** - `03a9c4d` (feat)
5. **Task 2 RED: shell-safe Task input contract** - `847ed6c` (test)
6. **Task 2 GREEN: environment-mediated Task inputs** - `2c416d0` (fix)
7. **Review fix: special entry type identity** - `10b12d7` (fix)
8. **Review refactor: single command evidence field** - `1c5103d` (refactor)

## Files Created/Modified

- `src/ai_coding_template_ja/openspec_gsd_handoff/smoke.py` - streaming repository snapshot, read-only smoke orchestration, and deterministic renderers.
- `scripts/openspec-gsd-handoff-smoke.py` - lower-kebab/path validation and exit/report delegation.
- `tests/test_handoff_smoke.py` - exact evidence, mutation, limits, special-entry, redaction, and CLI tests.
- `Taskfile.yml` - explicit smoke and isolated `check:without-gsd` tasks; normal `check` body unchanged.
- `tests/test_taskfile.py` - public task wiring and shell-isolation contract.

## Decisions Made

- Snapshot bounds apply to entry/path metadata and time only; regular file contents are always fully streaming-hashed.
- Actual host prompt, generic-agent spawn, real GSD mutation, and route-specific postconditions remain `no-safe-dry-run` unverified evidence rather than inferred success.
- Task variables cross the shell as environment values, not direct Go-template command interpolation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Prevented Task-variable shell interpolation**
- **Found during:** Task 2 self-review
- **Issue:** Direct template interpolation could turn a user-supplied change ID or GSD path into shell syntax before argparse validation.
- **Fix:** Added a RED contract and passed Task variables through process environment values quoted by the shell.
- **Files modified:** `Taskfile.yml`, `tests/test_taskfile.py`
- **Verification:** focused Taskfile test and real opt-in smoke passed.
- **Committed in:** `847ed6c`, `2c416d0`

**2. [Rule 1 - Bug] Distinguished safe special repository entry types**
- **Found during:** Task 1 self-review
- **Issue:** FIFO and Unix socket entries shared a generic special label, so a special-to-special type replacement could retain the same identity.
- **Fix:** Added distinct FIFO/socket/block/character-device labels and a FIFO-to-socket regression test.
- **Files modified:** `src/ai_coding_template_ja/openspec_gsd_handoff/smoke.py`, `tests/test_handoff_smoke.py`
- **Verification:** 18 focused smoke tests passed.
- **Committed in:** `10b12d7`

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 bug).
**Impact on plan:** Both fixes enforce the planned command-dispatch and repository-type trust boundaries; no lifecycle or host-mutation scope was added.

## Issues Encountered

- Task's command runtime accepted `trap ... EXIT` but rejected additional named/numeric signals in this environment. Cleanup remains registered for every normal/error shell exit through the portable accepted form.

## Verification

- `uv run pytest tests/test_handoff_smoke.py tests/test_taskfile.py -q`: 24 passed after the final review test.
- Focused ruff and basedpyright over all five plan paths: passed with 0 errors/warnings.
- `task check:without-gsd`: passed; nested `task check` collected and passed 221 tests.
- Real `task openspec:gsd-handoff:smoke CHANGE_ID=automate-openspec-gsd-handoff GSD_HOME=/home/shimi3435/.codex`: exit 0, exactly one JSON stdout line and one human stderr line, repository `write_detected=false`.
- `task --list`: normal `check`, isolated `check:without-gsd`, `openspec:validate`, and opt-in smoke are distinct public tasks.

## Evidence Limits

- **Unverified:** actual host prompt, generic-agent spawn, real GSD mutation, and route-specific postconditions. No safe dry-run exists; Plan 03-02 records these as separate reasoned-unverified acceptance rows.
- No prepare, manifest persistence, brief creation, `gsd-new-project`, `gsd-phase`, mark-started, lifecycle hardening, push, PR, or merge operation was invoked by the smoke.

## User Setup Required

None - the smoke is optional and uses an explicitly supplied existing GSD installation.

## Next Phase Readiness

- Plan 03-02 can map deterministic tests and the observed real-tool result into source-pinned acceptance evidence.
- OpenSpec tasks 5.1/5.2 remain for the main/orchestrator final boundary; this plan does not claim OpenSpec completion.

## Self-Check: PASSED

- All five planned code/test/config paths exist.
- All eight task/review commits exist in branch history.
- Focused checks, isolated full check, and real read-only smoke passed after implementation.

---
*Phase: 03-deterministic-verification-and-acceptance-evidence*
*Completed: 2026-07-15*
