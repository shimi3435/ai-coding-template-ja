---
phase: 2
fixed_at: 2026-07-21T18:32:09Z
review_path: .planning/phases/02-source-to-execution-mapping/02-REVIEW.md
iteration: 2
findings_in_scope: 1
fixed: 1
skipped: 0
status: all_fixed
---

# Phase 2: Code Review Fix Report

**Fixed at:** 2026-07-21T18:32:09Z
**Source review:** `.planning/phases/02-source-to-execution-mapping/02-REVIEW.md`
**Iteration:** 2

**Summary:**

- Findings in scope: 1
- Fixed: 1
- Skipped: 0

## Previous Fixed Issues (Iteration 1)

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

## Follow-up Fixed Issue (Iteration 2)

### CR-01: Readiness が観測中に消失・差替えされた path を ready と判定する

**Status:** fixed: requires human verification
**Files modified:** `src/ai_coding_template_ja/openspec_gsd_handoff/execution_mapping.py`, `tests/test_handoff_execution_mapping.py`
**Commit:** `108f275`
**Applied fix:** repository root と phase / plan / evidence の全componentをno-follow descriptorで固定し、entryとdescriptorの`st_dev` / `st_ino` / file typeをopen直後と成功判定直前に照合した。fileはlimit+1のbounded read後にも全componentを再検証し、最終phase directoryもdescriptorで固定する。unlink・rename・swapによるidentity変化は`mapping-path-identity-changed`のnon-ready issueになる。
**Regression tests:** `test_readiness_rejects_evidence_removed_during_bounded_read`, `test_readiness_rejects_phase_directory_renamed_after_descriptor_open`

## Verification

- Reviewer指定のevidence unlink回帰は修正前に`ready=True`でRED、修正後にGREENを確認した。
- 対象module: `25 passed`、Ruff green、BasedPyright `0 errors, 0 warnings, 0 notes`。
- Phase 1 / v1 regression: `186 passed`。
- Phase 2 focused suite: canonical repository rootで`97 passed`。
- `task check`: Ruff format/check、BasedPyright（0 errors）、pytest（`482 passed`）がすべて成功した。
- protected handoff、OpenSpec `tasks.md`、tracked refresh preview、ROADMAP、STATEのSHA-256と差分は変更なし。

## Protected Surface Evidence

- tracked handoff: `554690a1eee6e632eaf7c4fce3517cba69ff38eb8a06a1873b7a5e6822e59914`
- OpenSpec `tasks.md`: `cf4a9dc56afc15b98a008cff686989bd446215c95b3962ea3efd5a4f9eb30220`
- tracked refresh preview: `6775ff40a9e01aa634ff67098a0a1d020808ef11be80ece4e06f881dab5270cf`
- ROADMAP: `10cb18a19943da7a5c9b41f5a65f21a5bfd6f462451c32e9a3f76adf21801f4d`
- STATE: `81a99f6c42fa7a92c4d236f3a452b5526a7ef334dad1782fae9565d43fbbf89f`

## Unverified / Out of Scope

- Actual tracked apply、Phase 3の実host orchestration、OpenSpec task 2.2、push / PRは未実行。

---

_Fixed: 2026-07-21T18:32:09Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 2_
