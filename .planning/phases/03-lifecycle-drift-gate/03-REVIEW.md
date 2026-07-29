---
phase: 03-lifecycle-drift-gate
reviewed: 2026-07-29T05:46:06Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - src/ai_coding_template_ja/openspec_gsd_handoff/execution_mapping.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py
  - tests/fixtures/openspec_gsd_handoff/lifecycle/expected-lifecycle-evidence.json
  - tests/test_handoff_execution_mapping.py
  - tests/test_handoff_identity.py
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

**Reviewed:** 2026-07-29T05:46:06Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

指定された lifecycle gate、canonical drift、execution mapping、source identity と対応するテスト・golden evidence を標準深度でレビューした。前回レビューの stale decision identity、repository root identity、malformed public reader の 3 件は現実装で閉じており、対象テスト 450 件も成功した。

一方、adversarial probe で 2 件の admission 契約違反を再現した。完全に観測できる phase 追加が `DRIFTED` ではなく `UNKNOWN` に短絡して必要な再計画情報を失う。また、同一ファイルを plan とその source/plan evidence の両方に宣言すると、独立した evidence が存在しなくても VERIFY readiness が green になる。

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: [BLOCKER] 完全に観測できる phase 追加が drift ではなく unknown に短絡する

**File:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py:551-556`
**Issue:** `_validate_phase_graph` は source-pinned `expected_nodes` と current `observed_nodes` の両方について、phase ID/path の集合が単一の `planning_inventory` と完全一致することを要求する。このため、current graph と current inventory に同じ新 phase が追加され、各入力が個別には完全・valid でも、source-pinned expected graph だけが旧集合である正規の phase-addition drift を observation incomplete として拒否する。後段 `_phase_changes` の `phase-added:*` / `phase-removed:*` / `phase-path-changed:*` 分岐はこの validation により到達不能で、canonical HARD-R2 の「phase の追加・削除を検出したら必要な mapping 更新・再計画手順を示す」を満たさない。

再現結果:

```text
unknown ('lifecycle-phase-observation-incomplete',) () ()
```

この結果には `phase-added:07`、`phase:07`、`replan-affected-phases` が一切含まれない。

**Fix:** source-pinned graph と current graph をそれぞれ対応する snapshot inventory に照合できるデータモデルへ分ける。少なくとも expected/current の集合差を malformed evidence と混同せず、各 graph 自体の shape、path、dependency、DAG を検証した後に `_phase_changes` へ渡す。current mapping inventory との整合は observed side に適用し、expected side は source-pinned inventory または manifest snapshot に照合する。phase add/remove/path-change が public gate から `DRIFTED` と正確な remediation を返す固定回帰テストを追加する。

### CR-02: [BLOCKER] plan ファイル自身を enforcement evidence として再利用すると VERIFY が green になる

**File:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/execution_mapping.py:513-533`
**Issue:** planning inventory validation は plan path 内と evidence path 内の重複だけを拒否し、両 collection 間の path 衝突を拒否しない。したがって 1 つの `EvidenceDeclaration` に `path == plan_path` を設定し、同じ path に `source_id` も付ければ、1 個の `*-PLAN.md` が「plan 本体」「source evidence」「plan evidence」の全役割を同時に満たす。`_readiness_issues` は owner coverage と regular-file existence しか確認しないため、独立した実行・検証 evidence が 0 件でも VERIFY を `ready=True` にする。これは stable mapping / enforcement evidence を検査してから操作を許可する admission 契約を迂回する。

再現結果:

```text
Success(value=MappingReadiness(
    operation=<MappingOperation.VERIFY: 'verify'>,
    target_phase_id='02',
    ready=True,
    issues=()
))
```

**Fix:** inventory invariant で phase、plan、evidence の canonical path namespace を役割横断で disjoint にする。最低限 `evidence.path` が任意の `plan.path` または `phase.phase_path` と一致する場合は structured non-success にする。

```python
if evidence_path in plan_paths or evidence_path in phase_ids_by_path:
    raise _InventoryError("mapping-evidence-path-conflict")
```

同一 plan path を source/plan evidence に兼用した inventory が builder と readiness の双方で拒否される public regression を追加する。1 個の独立した evidence artifact が source と plan の両 owner を持つ既存の合法ケースは維持できる。

## Verification Performed

- `uv run pytest tests/test_handoff_execution_mapping.py tests/test_handoff_identity.py tests/test_handoff_lifecycle_drift.py tests/test_handoff_lifecycle_gate.py -q --no-cov` — 450 passed
- current graph/current inventory に phase 07 を追加し、source-pinned expected graph を保持する public gate probe — `UNKNOWN`, `lifecycle-phase-observation-incomplete`, remediation 空
- 1 個の `02-01-PLAN.md` を plan/source evidence/plan evidence に兼用する public readiness probe — `VERIFY ready=True`

---

_Reviewed: 2026-07-29T05:46:06Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
