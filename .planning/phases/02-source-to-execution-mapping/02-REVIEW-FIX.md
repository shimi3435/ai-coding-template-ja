---
phase: 02-source-to-execution-mapping
fixed_at: 2026-07-22T03:58:11Z
review_path: .planning/phases/02-source-to-execution-mapping/02-REVIEW.md
iteration: 2
findings_in_scope: 1
fixed: 1
skipped: 0
status: all_fixed
---

# Phase 2: Code Review Fix Report

**Fixed at:** 2026-07-22T03:58:11Z
**Source review:** `.planning/phases/02-source-to-execution-mapping/02-REVIEW.md`
**Iteration:** 2

**Summary:**

- Findings in scope: 1
- Fixed: 1
- Skipped: 0

## Fixed Issues

### CR-02: 4 MiB 超の有効 artifact を source-pin guard が誤拒否する

**Files modified:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py`, `src/ai_coding_template_ja/openspec_gsd_handoff/preflight.py`, `tests/test_handoff_manifest_refresh.py`
**Commits:** `7d7a169` (RED regression), `5982d29` (fix)
**Status:** fixed: requires human verification
**Applied fix:** The bounded fixed-argv subprocess runner now accepts a backward-compatible per-call `output_limit` keyword while resolving the unchanged 4 MiB default at call time. Refresh Git blob probes alone use `RefreshLimits.artifact_bytes`; commit and repository-root probes retain the 4 MiB default. Output remains bounded at limit+1 and the existing timeout, terminate/kill, and process-reap paths are unchanged.

**TDD evidence:** One public `preview_manifest_refresh` boundary test first produced `.FF.`: exact 4 MiB and 8 MiB+1 behaved as specified, while valid 4 MiB+1 and exact 8 MiB blobs failed with `refresh-source-pin-invalid`. After the fix, 4 MiB, 4 MiB+1, and 8 MiB exact working-tree/Git blob pairs succeed; 8 MiB+1 fails before source-pin probing with `refresh-artifact-limit-exceeded`. Every case records zero mutation operations and preserves target bytes.

### Prior Iteration Status

### CR-01: refresh の source commit guard が Git state を観測していない

**Files modified:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py`, `tests/test_handoff_manifest_refresh.py`
**Commits:** `4357fbc` (RED regression), `779d2ea` (fix)
**Status:** fixed: requires human verification
**Iteration 2 state:** The prior fix remains in place and passed the current focused, Phase 1/v1, and full project regression gates. No CR-01 source change was required in this iteration. Historical pins may still differ from HEAD; missing Git, unknown commit, exact root/blob mismatch, pre-staging, and pre-replace guards remain fail-closed.

## Verification

- Refresh/preflight focused: 76 passed.
- Phase 2 focused: 107 passed.
- Phase 1/v1 regression: 186 passed.
- Ruff and BasedPyright: passed with 0 errors/warnings/notes.
- `openspec validate harden-openspec-gsd-handoff-lifecycle --strict`: valid.
- `task openspec:validate`: 1 passed, 0 failed.
- `task check`: passed (Ruff format/check, BasedPyright 0 errors/warnings/notes, pytest 492 passed).
- Protected tracked handoff, tasks, canonical design/spec, refresh preview, expected golden, ROADMAP, STATE, REQUIREMENTS, and source review hashes/diffs: unchanged.
- Tracked apply was not invoked; no `.handoff.*.tmp` staging file exists.

---

_Fixed: 2026-07-22T03:58:11Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 2_
