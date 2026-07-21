---
phase: 02-source-to-execution-mapping
fixed_at: 2026-07-21T20:25:04Z
review_path: .planning/phases/02-source-to-execution-mapping/02-REVIEW.md
iteration: 1
findings_in_scope: 1
fixed: 1
skipped: 0
status: all_fixed
---

# Phase 2: Code Review Fix Report

**Fixed at:** 2026-07-21T20:25:04Z
**Source review:** `.planning/phases/02-source-to-execution-mapping/02-REVIEW.md`
**Iteration:** 1

**Summary:**

- Findings in scope: 1
- Fixed: 1
- Skipped: 0

## Fixed Issues

### CR-01: refresh の source commit guard が Git state を観測していない

**Files modified:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py`, `tests/test_handoff_manifest_refresh.py`
**Commits:** `4357fbc` (RED regression), `779d2ea` (fix)
**Status:** fixed: requires human verification
**Applied fix:** Existing bounded fixed-argv subprocess handling now observes the approved historical commit object, exact repository root, and every canonical artifact blob byte-for-byte. Preview performs the observation before candidate construction and at final reobservation; apply inherits the same fail-closed guard before staging and immediately before replacement through its two fresh preview rebuilds. No HEAD-equality requirement, retry, repair, rollback, or route switch was added.

**TDD evidence:** The missing-Git, unknown-commit, and commit-blob-mismatch cases first failed 3/3, then passed 3/3. Apply also rejects Git disappearance before staging and after validated staging but before replacement, with no target mutation.

**Verification:**

- Phase 2 focused: 103 passed (102 in isolated worktree plus the absolute-path-bound repository-root evidence test run against the original repository path).
- Phase 1/v1 regression: 186 passed.
- Ruff and BasedPyright: passed with 0 errors/warnings/notes.
- `openspec validate harden-openspec-gsd-handoff-lifecycle --strict`: valid.
- `task openspec:validate`: 1 passed, 0 failed.
- `task check`: passed (Ruff format/check, BasedPyright 0 errors/warnings/notes, pytest 488 passed).
- Protected tracked handoff, tasks, canonical design/spec, refresh preview, expected golden, ROADMAP, STATE, REQUIREMENTS, and source review hashes/diffs: unchanged.

---

_Fixed: 2026-07-21T20:25:04Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
