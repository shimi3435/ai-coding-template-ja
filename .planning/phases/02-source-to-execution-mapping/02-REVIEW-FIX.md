---
phase: 2
fixed_at: 2026-07-21T18:09:21Z
review_path: .planning/phases/02-source-to-execution-mapping/02-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 2: Code Review Fix Report

**Fixed at:** 2026-07-21T18:09:21Z
**Source review:** `.planning/phases/02-source-to-execution-mapping/02-REVIEW.md`
**Iteration:** 1

**Summary:**

- Findings in scope: 4
- Fixed: 4
- Skipped: 0

## Fixed Issues

### CR-01: Planning inventory が symlink・`..`・絶対パスを canonical input として受理する

**Files modified:** `src/ai_coding_template_ja/openspec_gsd_handoff/execution_mapping.py`, `tests/test_handoff_execution_mapping.py`
**Commit:** `ff842dd`
**Applied fix:** inventory path を canonical repository-relative path として字句検証し、repository descriptor から各 component を no-follow で開く bounded read と、読取り前後の identity 再検証を追加した。
**Regression tests:** `test_planning_inventory_rejects_noncanonical_and_symlink_paths`, `test_planning_inventory_rejects_identity_change_during_bounded_read`

### CR-02: Refresh preview の canonical reads に symlink-swap TOCTOU が残る

**Files modified:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py`, `tests/test_handoff_manifest_refresh.py`
**Commit:** `fa9d21f`
**Applied fix:** refresh target と canonical artifact の読取りを Phase 1 と同じ repository-root descriptor、component no-follow、identity 再検証、limit+1 read に置き換え、初回観測と再観測で共有した。
**Regression test:** `test_preview_rejects_symlink_swap_at_canonical_read`

### WR-01: Invalid registry が structured non-success ではなく `AttributeError` を送出する

**Files modified:** `src/ai_coding_template_ja/openspec_gsd_handoff/policy_reference.py`, `tests/test_handoff_policy_reference.py`
**Commit:** `0399dcd`
**Applied fix:** public seam と内部 validator の両方で registry の exact type を属性参照前に検証し、invalid input を `policy-registry-invalid` の structured `Failure` にした。
**Regression test:** `test_validation_returns_structured_failure_for_invalid_registry`

### WR-02: Tracked preview の mutation-count evidence は adapter が未接続で反証能力がない

**Files modified:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py`, `tests/test_handoff_manifest_refresh.py`
**Commit:** `62369b4`
**Applied fix:** 注入された read-only operations boundary を refresh target と canonical artifact の初回・再観測読取りへ接続し、recording adapter が実際の filesystem access を観測できるようにした。
**Regression test:** `test_preview_uses_supplied_read_only_operations_boundary`

## Verification

- Finding ごとの RED/GREEN regression test と対象モジュールの Ruff、BasedPyright を実行した。
- Phase 1 / v1 regression: `186 passed`。
- Phase 2 focused suite: canonical repository root で `95 passed`。temporary worktree では tracked preview の絶対 repository root との差だけで1件不一致になり、canonical root で解消することも個別に確認した。
- `task check`: Ruff format/check、BasedPyright（0 errors）、pytest（`480 passed`）がすべて成功した。
- protected handoff、OpenSpec `tasks.md`、tracked refresh preview の SHA-256 と差分は変更なし。

---

_Fixed: 2026-07-21T18:09:21Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
