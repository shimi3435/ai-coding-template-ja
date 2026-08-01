---
phase: 03-lifecycle-drift-gate
reviewed: 2026-08-01T13:19:19Z
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
  critical: 2
  warning: 0
  info: 0
  total: 2
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-08-01T13:19:19Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Plan 03-28 後の指定 15 ファイルを、canonical OpenSpec design/spec と Plan 03-23 Task 1 の
behavior/action/acceptance に照らして fresh review した。repository-wide `task check` は Ruff format/check、
BasedPyright、全 962 pytest を含め成功した。Plan 03-23 の重点回帰 14 件、graph/path-role/identity analog
119 件も成功し、fixtures 3 件は有効な JSON である。

03-25 の falsey operations、03-26 の falsey previous-state collision、03-27 の valid supported subclass、
03-28 の getter-throwing migration apply はすべて修正済みと再判定した。historical refresh の保証範囲も、
bridge-owned/cooperating writer と各 path の final observation までであり、その後の non-cooperating write を
対象外とする canonical contract に一致するため non-finding である。

ただし、同じ supported-subclass threat model を隣接公開境界へ適用すると、refresh apply と canonical
source-state validator が ordinary getter exception を structured non-success に変換せず `RuntimeError` を
漏らす。いずれも malformed input に対する fail-closed/totality 契約を破るため、本レビューは `clean` ではない。

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: [BLOCKER] malformed refresh preview の getter 例外が public apply から漏れる

**File:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py:571-574`

**Related apply guard:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py:862-883`

**Related test gap:** `tests/test_handoff_manifest_refresh.py:1275-1313`

**Issue:** `serialize_manifest_refresh_preview` は Result を返す公開 serializer だが、machine view の属性取得から
発生する例外を列挙した型だけで捕捉する。`_preview_identity` も同じ限定列挙である。したがって otherwise-valid
refresh preview の `previous_source_items` を、`active` getter が `RuntimeError("boom")` を送出する
`SourceIdentityState` subclass に置換して `apply_manifest_refresh` へ渡すと、line 1123 の state guard は
`refresh-preview-invalid` を返さず例外を public seam から漏らす。

fresh counterexample では mutation list は空、target bytes は不変だったが、呼び出し元をクラッシュさせ、
HARD-R1/HARD-R6 の malformed input に対する structured non-success 契約を満たさない。既存 refresh apply
malformed test は `candidate_bytes` の単純な置換だけで、supported subclass の属性例外を覆っていない。

**Fix:** refresh preview の machine-view/identity validation 全体で ordinary `Exception` を
`refresh-preview-invalid` に正規化し、`BaseException` は伝播させる。getter-throwing state を埋めた public
serializer/apply 回帰を追加し、failure point `STATE_GUARD`、mutation なし、target/tree/staging 不変を検証する。

```python
def serialize_manifest_refresh_preview(
    preview: ManifestRefreshPreview,
) -> Result[bytes]:
    try:
        data = _compact(_machine_view(preview))
    except Exception:
        return _failure("refresh-preview-invalid")
    return Success(data)
```

### CR-02: [BLOCKER] canonical source-state validator が supported subclass の属性例外を構造化しない

**File:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py:1002-1011`

**Related dereference:** `src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py:869-882`

**Related test gap:** `tests/test_handoff_identity.py:1120-1154`

**Issue:** `validate_source_identity_state` は「without unsafe member dereference」と明記し、Plan 03-27 では
`SourceIdentityState` subclass の admission authority とされた。しかし `_validate_source_state` は
`isinstance` で subclass を受理した直後にその属性を読み、public wrapper は内部 `_SourceInputError` しか
捕捉しない。`active` getter が `RuntimeError("boom")` を送出する otherwise-valid subclass を直接渡すと、
Failure ではなくその例外が漏れる。

この validator を入口にする `reconcile_source_items`、mapping readiness、canonical drift completeness も同じ
入力で structured Failure/UNKNOWN へ到達できない。既存 malformed matrices は exact-base dataclass の field を
不正値へ置換するケースだけで、supported outer subclass の ordinary attribute failure を覆っていない。

**Fix:** canonical public validator で `_SourceInputError` の詳細 code を維持しつつ、その他の ordinary
`Exception` を汎用 `source-state-invalid` INPUT failure に正規化する。`BaseException` は捕捉しない。validator、
reconciliation、mapping、drift classification の public analog 回帰を追加する。

```python
try:
    state = _validate_source_state(value)
except _SourceInputError as error:
    return _failure(error.code, category=IssueCategory.INPUT)
except Exception:
    return _failure("source-state-invalid", category=IssueCategory.INPUT)
return Success(state)
```

## Rejudgments

- **03-25 operations CR:** fixed。migration preview/apply と refresh apply は `operations is None` の場合だけ
  default adapter を選び、falsey supplied adapter を保持する。
- **03-26 collision CR:** fixed。falsey previous state の tombstones/counters は保持され、再利用は
  INPUT / `source-tombstone-identity-collision` / MANIFEST_ABSENT、value なし、tree 不変となる。
- **03-27 exact-type CR:** fixed。well-behaved supported subclass は同一 object のまま preview/apply を通り、
  exact-base control も成功する。
- **03-28 migration totality CR:** fixed。getter-throwing malformed subclass は public migration apply で
  `migration-preview-invalid` / `STATE_GUARD` / UNKNOWN target / ABSENT staging / NOT_NEEDED cleanup となり、
  mutation なし、target/tree 不変である。`BaseException` を捕捉しない実装も維持される。
- **Historical refresh boundary:** non-finding。shared writer lock 内の source/target 再観測と conditional replace は
  canonical scope を満たす。final observation 後の non-cooperating writer に対する CAS 保証は要求されない。
- **Graph/path-role/identity analogs:** path-role collision、anchored phase/evidence identity change、通常の malformed
  exact-base source state、lifecycle UNKNOWN projection の既存回帰は成功した。ただし getter-throwing supported
  subclass の identity totality は CR-02、refresh totality は CR-01 として未解決である。

## Verification Performed

- `task check` — Ruff format/check、BasedPyright、全 962 pytest passed
- Plan 03-23 Task 1 指定重点回帰 — 14 passed
- graph/path-role/identity analog 回帰 — 119 passed
- fixtures 3 件 — `jq empty` passed
- fresh refresh counterexample — `apply_manifest_refresh` から `RuntimeError: boom`、mutation なし、target 不変
- fresh validator counterexample — `validate_source_identity_state` から `RuntimeError: boom`

---

_Reviewed: 2026-08-01T13:19:19Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
