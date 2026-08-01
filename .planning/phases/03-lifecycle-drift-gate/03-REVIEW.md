---
phase: 03-lifecycle-drift-gate
reviewed: 2026-08-01T10:59:44Z
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

**Reviewed:** 2026-08-01T10:59:44Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Plan 03-25 後の Phase 03 実装を、lifecycle drift/gate、execution mapping、source
identity、manifest migration/refresh、対応テストおよび fixture の15ファイルを対象に
fresh independent context で再レビューした。`task check` は全957件成功し、指定された
migration falsey-adapter、refresh、graph、path-role 回帰群も92件成功した。

旧レビューの migration operations CR-01 は修正済みである。preview/apply の両公開 seam は
`operations is None` の場合だけ default adapter を生成し、falsey な正規 adapter を保持する。
対応する公開回帰は exact supplied call/effect と target preservation を検証して成功したため、
旧 CR-01 は本レビューに残していない。

しかし、同じ migration preview の `previous_source_items` には truthiness fallback が残っている。
falsey な正規 `SourceIdentityState` を渡すと caller の tombstone と counter が空状態に置換され、
予約済み ID を再利用する preview が `Success` になる。HARD-R1 の stable ID/no-reuse を破り、承認後の
manifest から過去 identity を失わせるため、本レビューは `clean` ではない。

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: [BLOCKER] falsey な previous source state を空状態に置換して tombstone ID を再利用する

**File:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py:1633`

**Issue:** `preview_manifest_migration` は
`previous_source_items or _EMPTY_SOURCE_ITEMS` で reconciliation 入力を選ぶ。一方、公開型の
validation は `isinstance(value, SourceIdentityState)` を受理するため、`__bool__` が `False` を返す
正規 subclass も有効な state である。その state に `REQ-000001` / `SCN-000001` の tombstone と
次 counter `2` を入れた公開 probe では、state validation 自体は成功したにもかかわらず、preview
から tombstone が0件に消え、同じ2 ID が `created` として再割当てされて `Success` になった。
本来は caller state を reconciliation に渡し、再登場した tombstone locator を
`source-tombstone-identity-collision` として拒否しなければならない。現在の preview を承認・apply
すると、予約済み identity の再利用と tombstone 消失が永続化され、source item の追跡可能性を
破壊する。

**Fix:** default 選択条件を `None` のみに限定し、falsey な正規 state の tombstone/counter を保持する。
falsey state に tombstone を含めた公開回帰を追加し、structured collision failure、candidate/apply
未到達、target preservation を検証する。

```python
previous = (
    _EMPTY_SOURCE_ITEMS
    if previous_source_items is None
    else previous_source_items
)
```

## Historical Refresh Boundary Rejudgment

履歴上の refresh CR-01 は canonical design/spec と 03-22 の clarification に従い、finding として
復活させていない。保証対象は bridge-owned migration/refresh writers と同じ change-directory
advisory lock protocol に従う cooperating writers である。実装は lock 内の再観測と target
再検査を行っており、この scoped guarantee を満たす。final observation 後の non-cooperating writer
まで完全に排除する CAS-like persistence は Phase 03 の契約外である。

## Verification Performed

- `task check` — Ruff format/check、BasedPyright 0 errors/warnings、pytest 957 passed
- 指定重点回帰（migration falsey-adapter、refresh、graph、path-role family）— 92 passed
- malformed canonical phase-path と valid refresh control の対照実行 — 7 passed
- JSON fixture 3件 — `python -m json.tool` 成功
- lifecycle golden evidence — 生成値と追跡 fixture の SHA-256 が一致
- 危険関数、hardcoded secret、debug artifact、empty catch の静的走査 — 該当なし
- `git diff --check` — passed
- falsey previous-state public probe — validation `Success`、preview `Success`、tombstone 0件、予約済み2 IDを `created` として再利用、target bytes は preview 中不変

---

_Reviewed: 2026-08-01T10:59:44Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
