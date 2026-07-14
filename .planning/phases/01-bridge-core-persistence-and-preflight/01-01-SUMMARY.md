---
phase: 01-bridge-core-persistence-and-preflight
plan: "01"
subsystem: bridge-core
tags: [python, openspec, bounded-io, deterministic-parsing]

requires: []
provides:
  - immutable artifact, progress, route, host-input, and classified-result values
  - strict source-pinned task progress normalization
  - contained bounded Markdown reader with same-byte decode and SHA-256
  - adopt-or-discard OpenSpec JSON discovery with fresh Markdown fallback
affects: [01-02-manifest-preflight-entrypoint, phase-2-skill-orchestration]

tech-stack:
  added: []
  patterns: [frozen-value-core, whole-operation-result, bounded-read-once, route-local-discovery]

key-files:
  created:
    - src/ai_coding_template_ja/openspec_gsd_handoff/models.py
    - src/ai_coding_template_ja/openspec_gsd_handoff/progress.py
    - src/ai_coding_template_ja/openspec_gsd_handoff/reader.py
    - src/ai_coding_template_ja/openspec_gsd_handoff/discovery.py
    - tests/test_handoff_core.py
    - tests/test_handoff_discovery.py
  modified: []

key-decisions:
  - "Generic Success/Failure values carry complete values or one classified issue; input route remains independent of host capability."
  - "Fallback reconstructs a fixed, non-recursive artifact request and never retains candidate fields."

patterns-established:
  - "Bounded read once: one limit-plus-one byte buffer is decoded and hashed without rereading."
  - "Adopt or discard: a supported JSON candidate is accepted only after full artifact and progress parity validation."

requirements-completed: [BRIDGE-01]

duration: 9min
completed: 2026-07-15
status: complete
---

# Phase 1 Plan 1: Bridge Functional Core and Discovery Summary

**Immutable source-pinned progress and artifact values now flow through a bounded reader and route-isolated OpenSpec discovery seam.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-07-14T17:45:37Z
- **Completed:** 2026-07-14T17:54:30Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Added deterministic immutable values and strict task normalization, including exact JSON integer checks and a 4,096-task limit.
- Added resolved-containment and bounded read-once handling for canonical Markdown bytes.
- Added table-driven OpenSpec 1.3.1 JSON/fallback routing with terminal-state classification and route-poisoning protection.

## Task Commits

Each task retained explicit RED and GREEN evidence:

1. **Task 1: immutable result model and progress normalizer**
   - `6ad277c` (RED: public progress seam)
   - `6e76582` (RED: exact numeric typing)
   - `fc95caf` (GREEN: immutable models and progress core)
2. **Task 2: contained bounded Markdown reader**
   - `112d5f3` (RED: public reader seam)
   - `5a7d490` (GREEN: bounded artifact reader)
3. **Task 3: JSON candidate and fresh Markdown fallback discovery**
   - `efbb7f0` (RED: fixture route seam)
   - `7b642af` (GREEN: OpenSpec discovery routing)

## Files Created/Modified

- `src/ai_coding_template_ja/openspec_gsd_handoff/models.py` - immutable shared values, host input, routes, and classified whole-operation results.
- `src/ai_coding_template_ja/openspec_gsd_handoff/progress.py` - exact Markdown task normalization and candidate metadata parity.
- `src/ai_coding_template_ja/openspec_gsd_handoff/reader.py` - change containment, input limits, UTF-8 decoding, and same-buffer SHA-256.
- `src/ai_coding_template_ja/openspec_gsd_handoff/discovery.py` - supported candidate validation, terminal classification, and fresh fallback composition.
- `tests/test_handoff_core.py` - example/property coverage for progress, reader limits, and path safety.
- `tests/test_handoff_discovery.py` - direct fixture-table coverage for all pinned discovery routes.

## Decisions Made

- Kept failure data machine-oriented through stable category/code/known-state fields; presentation text remains outside the core.
- Used immediate `specs/<capability>/spec.md` discovery rather than an unbounded recursive glob.
- Used the generic-agent workaround supplied by the orchestrator because typed GSD executor dispatch was unavailable in this Codex schema.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Commit hooks reformatted and import-sorted new tests/code on their first commit attempts; files were re-staged, focused tests were rerun, and hooks passed on retry.

## User Setup Required

None - no external service configuration or new dependency was added.

## Verification

- `uv run pytest tests/test_handoff_discovery.py tests/test_handoff_core.py -q` — 33 passed.
- `uv run ruff check src/ai_coding_template_ja/openspec_gsd_handoff tests/test_handoff_*.py` — passed.
- `uv run basedpyright src/ai_coding_template_ja/openspec_gsd_handoff tests/test_handoff_core.py tests/test_handoff_discovery.py` — 0 errors, 0 warnings.
- `task check` — 114 passed; formatting, lint, and type checks passed.

## Next Phase Readiness

- Plan 01-02 can consume the immutable artifacts, progress, route, explicit host input, and classified result values without duplicating them.
- BRIDGE-01 remains phase-level work until Plan 01-02 completes manifest, preflight, and entrypoint delivery.

## Self-Check: PASSED

- All six declared production/test artifacts exist.
- All three task acceptance gates and the plan verification commands pass.
- No dependency, lifecycle hardening, retry/resume/rollback, finalize, push, PR, or merge behavior was added.

---
*Phase: 01-bridge-core-persistence-and-preflight*
*Completed: 2026-07-15*
