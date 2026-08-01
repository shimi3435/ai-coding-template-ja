---
phase: 03-lifecycle-drift-gate
reviewed: 2026-08-01T11:47:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - src/ai_coding_template_ja/openspec_gsd_handoff/execution_mapping.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py
  - tests/fixtures/openspec_gsd_handoff/lifecycle/expected-lifecycle-evidence.json
  - tests/fixtures/openspec_gsd_handoff/manifest/expected-refresh-preview.json
  - tests/fixtures/openspec_gsd_handoff/mapping/hardening-phase-assignments.json
  - tests/test_handoff_execution_mapping.py
  - tests/test_handoff_identity.py
  - tests/test_handoff_lifecycle_drift.py
  - tests/test_handoff_lifecycle_gate.py
  - tests/test_handoff_manifest_refresh.py
  - tests/test_handoff_migration.py
findings:
  critical: 1
  warning: 0
  info: 0
  total: 1
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-08-01T11:47:00Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Plan 03-26 後の Phase 03 実装を、canonical OpenSpec design/spec と Plan 03-23 Task 1 の
behavior/action/acceptance に照らして fresh review した。指定された過去4 counterexample、refresh の
malformed/valid control、migration の falsey operations preview/apply、falsey previous-state collision、
graph/path-role、identity/refresh analog はすべて public seam で green だった。

03-25 operations-adapter blocker は修正済みである。preview/apply とも default adapter を選ぶのは
`operations is None` の場合だけで、falsey な正規 adapter の call/effect と target/tree preservation を
確認した。03-26 の tombstone collision blocker も、falsey state の tombstone/counter を保持して
INPUT / `source-tombstone-identity-collision` / MANIFEST_ABSENT、value なし、target/tree 不変となるため、
報告済みの collision counterexample 自体は修正済みである。

しかし collision しない同じ valid falsey `SourceIdentityState` は、reconciliation を通過した後の preview
shape 検査で exact base type を要求され、public preview が `migration-preview-invalid` になる。Plan 03-26 が
明示した「every supplied supported state」を満たさず、有効な migration preview を生成できないため、
本レビューは `clean` ではない。

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: [BLOCKER] valid な SourceIdentityState subclass を後段の exact-type guard が拒否する

**File:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py:933`

**Related test gap:** `/home/shimi3435/workspace/python/ai-coding-template-ja/tests/test_handoff_migration.py:767`

**Issue:** `preview_manifest_migration` は `previous_source_items` の型を
`SourceIdentityState | None` とし、`reconcile_source_items` / `validate_source_identity_state` は
`isinstance(value, SourceIdentityState)` で supported subclass を受理する。03-26 の regression も
`FalseySourceIdentityState` が validation `Success` で同一 object のまま reconciliation authority になることを
契約化している。一方 `_preview_has_valid_shape` は
`type(preview.previous_source_items) is not SourceIdentityState` を使用する。そのため tombstone collision を含まない
valid falsey state（counter 1/1、active/tombstones 空）を public preview に渡す fresh probe では、validator は
`Success` (`validation.value is state`) だが preview は PERSISTENCE / `migration-preview-invalid` / UNKNOWN になる。
対象と repository tree は不変だが、正規 input から approvable migration preview を生成できない。

既存の 03-26 test は tombstone collision が line 933 より前に Failure となるケースだけなので、この後段の契約不整合を
検出しない。これは単なる subclass style の問題ではなく、Plan 03-26 が明示した supported-state behavior の未達である。

**Fix:** preview shape validation を source-state validator と同じ admission contract に揃える。少なくとも exact-type
比較を `isinstance` に変更し、`validate_source_identity_state(preview.previous_source_items)` の成功も確認する。
collision のない falsey subclass で preview `Success` と approved apply を public seam から固定し、既存 collision
Failure、target/tree preservation、通常の exact base state を併せて回帰テストする。

```python
validated_previous = validate_source_identity_state(
    preview.previous_source_items,
)
if isinstance(validated_previous, Failure):
    return False
```

## Rejudgments

- **Historical refresh boundary:** non-finding。canonical scope は bridge-owned migration/refresh writers と同じ
  change-directory advisory lock に従う cooperating writers、および各 path の final observation までである。
  実装は lock 内再観測、target hash 再検査、conditional replace を行う。final observation 後の
  non-cooperating writer に対する CAS 完全保証は canonical scope 外なので要求していない。
- **03-25 operations CR:** fixed。falsey supplied adapter は preview で exactly one supplied call、apply で
  `mutations == ["create"]` を示し、default filesystem effect を迂回させず target/tree/staging を保持する。
- **Current previous-state CR:** reported collision defect is fixed, but broader supported-state path remains defective as
  CR-01。collision のない valid falsey state を implementation summary ではなく public fresh probe で再判定した。

## Verification Performed

- 指定重点回帰 15 nodes / parameter families — 77 passed
- migration suite — passed
- refresh valid-string controls and tracked candidate/fixture controls — 3 passed
- scoped six test modules — 実行（個別重点回帰と migration suite の完了結果を別途確認）
- `task check` — Ruff format/check と BasedPyright は green。全 pytest gate は本レビュー中にも実行した
- JSON fixtures 3件 — `python -m json.tool` passed
- `git diff --check` — passed
- secret/dangerous-function/debug-artifact scan — finding なし
- fresh falsey previous-state no-collision probe — validation `Success` / same object、preview PERSISTENCE /
  `migration-preview-invalid` / UNKNOWN、target/tree unchanged

---

_Reviewed: 2026-08-01T11:47:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
