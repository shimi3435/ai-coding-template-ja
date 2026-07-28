---
phase: 03-lifecycle-drift-gate
reviewed: 2026-07-28T14:10:03Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - src/ai_coding_template_ja/openspec_gsd_handoff/execution_mapping.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py
  - tests/fixtures/openspec_gsd_handoff/lifecycle/expected-lifecycle-evidence.json
  - tests/test_handoff_execution_mapping.py
  - tests/test_handoff_lifecycle_drift.py
  - tests/test_handoff_lifecycle_gate.py
findings:
  critical: 2
  warning: 0
  info: 0
  total: 2
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-07-28T14:10:03Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

指定された lifecycle drift classifier、mapping readiness、公開 lifecycle gate、source identity validation、および対応するテスト・golden evidence を標準深度でレビューした。対象テスト 338 件は成功したが、追加の public-seam 反例で 2 件の fail-closed 違反を再現した。

第一に、source-pinned observation 自身が reconciliation change を報告している矛盾した状態を classifier が無視し、公開 gate が `clean` として admit する。第二に、`reconcile_source_items` の inventory / explicit-match validation は検証前に外部値を参照し、不正構造で structured `Failure` ではなく例外終了する。どちらも「完全かつ整合した観測だけを受理し、不完全な入力は fail closed する」という lifecycle domain の中核条件に反する。

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: source-pinned reconciliation evidence を無視して不整合な baseline を clean admission する

**Classification:** BLOCKER
**File:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py:358-399`
**Issue:** `classify_canonical_source_drift` は両 observation の構造を検証した後、`changed_source_item_ids` を `observed.value` からしか取得しない（393 行目）。`expected.value.changed_source_item_ids` が非空でも、その事実は比較にも completeness 判定にも使われない。このため source-pinned observation が「manifest の source identity baseline に対して REQ-000001 が created/updated/tombstoned」と自己申告する矛盾した証拠でも、working-tree 側が空なら classifier は `CLEAN` を返す。`gate_lifecycle_operation` でも同じ値を boundary の `SourceCommitObservation.canonical_source` に入れると `state=clean`, `admitted=True`, `issue_codes=()` が再現する。source-pinned baseline が manifest と一致していない以上、これは保守的な許容ではなく admission bypass である。

再現結果:

```text
clean True () ()
```

**Fix:** comparison 前に source-pinned/expected observation の reconciliation delta が空であることを必須にする。非空なら `source-reconciliation-incomplete` または専用の安定 code で `UNKNOWN` にし、公開 gate では `admitted=False`、空の部分 evidence、`decision_identity=None` を返す。少なくとも direct classifier と `FakeBoundary` 経由の public gate に、`expected.changed_source_item_ids=("REQ-000001",)` / `observed.changed_source_item_ids=()` の regression を追加する。

### CR-02: source reconciliation の入力 validator が不正構造を検証前に参照して例外終了する

**Classification:** BLOCKER
**File:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py:966-1003,1076-1088,1155-1173`
**Issue:** `reconcile_source_items` は fail-closed な `Result` API であるにもかかわらず、`_validate_inventory` が outer `SourceInventory` を確認せず `inventory.items` を参照する（967 行目）。scenario の `parent_locator` も `SourceParentLocator` の型確認前に `parent.source_path` を参照する（993-996 行目）。さらに `_validate_explicit_matches` は sequence 型を確認せず `len(explicit_matches)` を呼ぶ（1084-1087 行目）。その結果、`inventory=object()` は `AttributeError`、`explicit_matches=None` は `TypeError`、文字列の `parent_locator` は `AttributeError` となり、`source-inventory-invalid` / `source-explicit-match-invalid` の structured failure に変換されない。canonical drift producer は通常 reader-generated inventory を渡すが、この関数自体は public reconciliation seam であり、Phase 03 の malformed structured-input 防御と同じ trust-boundary 規律を満たしていない。

再現結果:

```text
outer-inventory AttributeError 'object' object has no attribute 'items'
explicit-matches-none TypeError object of type 'NoneType' has no len()
AttributeError 'str' object has no attribute 'source_path'
```

**Fix:** `_validate_inventory` の最初で outer value が exact `SourceInventory`、`items` が tuple であることを member 参照前に確認する。scenario の parent は exact `SourceParentLocator` と各 string field を確認してから dereference する。`explicit_matches` も許可する sequence container を `len`/iteration 前に検証する。outer/container/member/nested-parent/explicit-match の各 malformed family を `reconcile_source_items` の public seam に追加し、すべて `Failure` かつ部分 state なしを固定する。

## Verification Performed

- `uv run pytest -q tests/test_handoff_execution_mapping.py tests/test_handoff_lifecycle_drift.py tests/test_handoff_lifecycle_gate.py` — 338 passed
- public-gate probe: source-pinned `changed_source_item_ids=("REQ-000001",)` — `clean`, `admitted=True`
- public reconciliation probes: malformed outer inventory / explicit matches / parent locator — `AttributeError` / `TypeError`

---

_Reviewed: 2026-07-28T14:10:03Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
