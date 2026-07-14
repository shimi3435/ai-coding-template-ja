---
phase: 01-bridge-core-persistence-and-preflight
plan: "02"
subsystem: bridge-persistence
tags: [python, atomic-write, subprocess, git, openspec, gsd]

requires:
  - phase: 01-bridge-core-persistence-and-preflight
    provides: immutable discovery artifacts, progress, route, host input, and classified result values
provides:
  - deterministic timestamp-free prepared/started manifest schema and atomic repository
  - fixed-argv OpenSpec, GSD, and Git preflight with explicit repository/host inputs
  - exact inspect, prepare, and mark-started Python and structured CLI operations
affects: [phase-2-skill-orchestration, phase-3-verification]

tech-stack:
  added: []
  patterns: [validated-same-directory-replace, fixed-argv-probe, explicit-authorization-evidence]

key-files:
  created:
    - src/ai_coding_template_ja/openspec_gsd_handoff/manifest.py
    - src/ai_coding_template_ja/openspec_gsd_handoff/preflight.py
    - src/ai_coding_template_ja/openspec_gsd_handoff/__init__.py
    - src/ai_coding_template_ja/openspec_gsd_handoff/__main__.py
    - tests/test_handoff_manifest.py
    - tests/test_handoff_preflight.py
    - tests/test_handoff_cli.py
  modified: []

key-decisions:
  - "Manifest persistence exposes staging, target, failure-point, and cleanup evidence without claiming retry, rollback, recovery, or directory-fsync durability."
  - "Repository-policy trackability and visible-host capability remain explicit caller inputs and are never inferred from local Git or GSD output."
  - "The public boundary exposes only inspect_handoff, prepare_handoff, and mark_handoff_started; GSD invocation remains owned by Phase 2."

patterns-established:
  - "Validate closed staging bytes before os.replace, and make one best-effort cleanup attempt on failure."
  - "Keep process stdout bytes, stderr text, exit status, argv, cwd, and timeout as separate injected evidence."

requirements-completed: [BRIDGE-01]

duration: 12min
completed: 2026-07-15
status: complete
---

# Phase 1 Plan 2: Manifest, Preflight, and Entrypoint Summary

**A deterministic atomic manifest, source-pinned capability preflight, and three approval-bounded structured operations now complete the mechanical bridge seam.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-14T18:00:09Z
- **Completed:** 2026-07-14T18:12:14Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Added fixture-exact, timestamp-free manifest parsing/serialization and the sole absent-to-prepared / prepared-to-started atomic transitions with injected fault evidence.
- Added bounded fixed-argv OpenSpec, GSD, and Git adapters that consume every pinned contract-table case and compare source-commit blobs to the already verified artifact bytes.
- Added exact `inspect`, `prepare`, and `mark-started` Python/module operations; inspection is read-only, preparation requires approval and trackability, and starting requires caller-confirmed GSD acceptance.

## Task Commits

Each task retained explicit RED and GREEN evidence:

1. **Task 1: deterministic manifest and atomic repository**
   - `48e54a5` (RED: fixture, transition, and fault contract)
   - `b86ae5c` (GREEN: strict manifest and atomic repository)
2. **Task 2: fixed-argv preflight adapters**
   - `2dbfa3f` (RED: pinned tool/source/policy/host contract)
   - `0dc7fed` (GREEN: OpenSpec/GSD/Git preflight)
3. **Task 3: public operations and structured module entrypoint**
   - `097ca01` (RED: public operation and no-write contract)
   - `7b3bd48` (GREEN: exact Python/CLI operations)

## Files Created/Modified

- `src/ai_coding_template_ja/openspec_gsd_handoff/manifest.py` - minimal manifest values, strict parser/serializer, state guard, and same-directory atomic repository.
- `src/ai_coding_template_ja/openspec_gsd_handoff/preflight.py` - bounded fixed-argv tool/Git adapters and explicit repository/host authorization evidence.
- `src/ai_coding_template_ja/openspec_gsd_handoff/__init__.py` - deliberate three-operation public bridge surface.
- `src/ai_coding_template_ja/openspec_gsd_handoff/__main__.py` - argv validation, adapter wiring, structured JSON, and stable exit classes.
- `tests/test_handoff_manifest.py` - deterministic bytes, state guard, and injected validation/replace/cleanup faults.
- `tests/test_handoff_preflight.py` - full pinned contract tables plus source/policy/host fail-closed cases.
- `tests/test_handoff_cli.py` - public seam, no-write-before-approval, transition, help, and machine-readable request failure coverage.

## Decisions Made

- Stored only canonical MVP fields and rejected unknown manifest fields to avoid silently adopting later lifecycle data.
- Normalized GSD entrypoints to `gsd-new-project-auto` / `gsd-phase` as data; no Phase 1 operation invokes either entrypoint.
- Kept host evidence in the prepared manifest exactly as inspected by the Phase 2 caller, with typed and generic dispatch combinations validated independently from GSD.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Commit hooks formatted and import-sorted each new RED test on its first commit attempt; the failing tests were rerun and then committed before production implementation.

## User Setup Required

None - no dependency, external service, or secret configuration was added.

## Verification

- `uv run pytest tests/test_handoff_manifest.py tests/test_handoff_preflight.py tests/test_handoff_cli.py -q` — 39 passed.
- All five Phase 1 focused files — 72 passed.
- `uv run ruff check src/ai_coding_template_ja/openspec_gsd_handoff tests/test_handoff_*.py` — passed.
- Focused `uv run basedpyright ...` — 0 errors, 0 warnings.
- `uv run python -m ai_coding_template_ja.openspec_gsd_handoff --help` — exact `inspect`, `prepare`, and `mark-started` operations shown.
- `task check` — 153 passed; format, lint, and type gates passed.

## Next Phase Readiness

- Phase 1 is complete. Phase 2 can consume the structured inspection result, request approval, call `prepare_handoff`, invoke the selected GSD entrypoint itself, and then call `mark_handoff_started` only after acceptance.
- No lifecycle hardening, retry/resume/rollback, finalize, push, PR, or merge behavior was added.

## Self-Check: PASSED

- All seven declared production/test artifacts exist and all task/plan acceptance commands pass.
- RED precedes GREEN for every task, and every production change is covered through a public seam.
- BRIDGE-01 remains the only canonical requirement trace and source commit `5a1f78b81f546c900745328fad24f9adb073e768` remains authoritative.

---
*Phase: 01-bridge-core-persistence-and-preflight*
*Completed: 2026-07-15*
