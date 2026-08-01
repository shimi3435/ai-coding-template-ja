---
phase: 03-lifecycle-drift-gate
reviewed: 2026-08-01T12:38:49Z
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

**Reviewed:** 2026-08-01T12:38:49Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Plan 03-27 後の指定 15 ファイルを、canonical OpenSpec design/spec と Plan 03-23 Task 1 の
behavior/action/acceptance に照らして fresh review した。指定重点回帰 13 件、対象 6 test modules の
637 件、および repository-wide `task check` の 961 件はすべて成功した。fixtures 3 件も有効な JSON である。

03-25 の falsey operations defect、03-26 の falsey previous-state collision defect、03-27 の
正常な supported subclass に対する exact-type defectは、それぞれ public preview/apply 回帰で修正済みと
再判定した。historical refresh canonical-scope/CAS 論点も、canonical guarantee が bridge-owned/cooperating
writers と各 final observation までを対象とし、その後の non-cooperating write を対象外と明記しているため
non-finding である。

ただし、03-27 が受理対象に広げた `SourceIdentityState` subclass の属性取得が例外を送出する場合、
malformed preview の state guard が分類失敗を返さず `RuntimeError` を public apply seam から漏らす。
`_preview_identity` 自身の「input exceptions を漏らさない」という契約にも反し、Plan 03-23 Task 1 の
malformed previous-state acceptance を満たさないため、本レビューは `clean` ではない。

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: [BLOCKER] malformed SourceIdentityState subclass が apply の state guard を例外で突破する

**File:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py:949-952`

**Related validator:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py:869-875`

**Related test gap:** `/home/shimi3435/workspace/python/ai-coding-template-ja/tests/test_handoff_migration.py:1469-1518`

**Issue:** `_preview_identity` は line 1048 で「validated preview identity without leaking input
exceptions」を契約化しているが、例外捕捉へ入る前に `_preview_has_valid_shape` を呼ぶ。03-27 の変更で
`validate_source_identity_state` は `isinstance(value, SourceIdentityState)` により subclass を supported
input として受理する一方、属性取得を保護していない。したがって `active` getter が `RuntimeError` を送出する
subclass を `previous_source_items` に持つ otherwise-valid preview を `apply_manifest_migration` に渡すと、
`migration-preview-invalid` / `STATE_GUARD` / mutation なしを返さず、line 950 から未処理例外が送出される。

fresh counterexample では target/tree mutation より前に停止したが、public API の fail-closed structured
contract を失い、呼び出し元をクラッシュさせる。既存 malformed matrix は exact-base でない `object()` のみを
検査するため、この supported-subclass 経路を検出しない。

**Fix:** shape 検査を含む preview validation 全体を state-guard の例外境界内へ移し、untrusted preview の
属性取得から発生する `Exception` を `None` identity に正規化して、既存の
`migration-preview-invalid` failure を返す。通常 subclass の object identity を保持する 03-27 契約は維持する。
同じ getter-throwing subclass を用い、apply が structured failure、mutation list 空、target/tree 不変となる
回帰テストを追加する。

```python
def _preview_identity(preview: object) -> str | None:
    try:
        if (
            not isinstance(preview, ManifestMigrationPreview)
            or not _preview_has_valid_shape(preview)
            or not _preview_is_consistent(preview)
        ):
            return None
        machine_bytes = _compact_json(_preview_machine_view(preview))
    except Exception:
        return None
    if len(machine_bytes) > MAX_MANIFEST_BYTES:
        return None
    return _sha256(machine_bytes)
```

## Rejudgments

- **03-25 operations CR:** fixed。default adapter は `operations is None` の場合だけ選択され、falsey supplied
  adapter は preview/apply の両 seam で保持される。
- **03-26 collision CR:** fixed。falsey previous state の tombstones/counters は保持され、再利用は
  INPUT / `source-tombstone-identity-collision` / MANIFEST_ABSENT、value なし、tree 不変となる。
- **03-27 exact-type CR:** well-behaved supported subclass については fixed。preview は同一 object を保持し、
  no-collision preview/apply と exact-base control は成功する。ただし malformed subclass の totality は
  CR-01 として未解決である。
- **Historical refresh boundary:** non-finding。lock 内の source/target 再観測と conditional replace は
  canonical scope を満たす。final observation 後の non-cooperating writer に対する CAS 保証は要求されない。
- **Graph/path-role/identity analogs:** inventory path-role conflict、anchored path identity change、lifecycle
  decision identity の各回帰は成功し、新規 finding はない。

## Verification Performed

- Plan 03-23 Task 1 指定重点回帰 — 13 passed
- 指定 6 test modules — 637 passed
- `task check` — Ruff format/check、BasedPyright、全 961 pytest passed
- fixtures 3 件 — `jq empty` passed
- fresh malformed-subclass counterexample — `RuntimeError: boom` を
  `apply_manifest_migration` → `_preview_identity` → `_preview_has_valid_shape` →
  `validate_source_identity_state` で再現

---

_Reviewed: 2026-08-01T12:38:49Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
