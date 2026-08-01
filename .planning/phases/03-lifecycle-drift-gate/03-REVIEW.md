---
phase: 03-lifecycle-drift-gate
reviewed: 2026-08-01T07:22:01Z
depth: deep
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
  warning: 1
  info: 0
  total: 2
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-08-01T07:22:01Z
**Depth:** deep
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Phase 03 の lifecycle drift / gate、execution mapping、source identity、manifest migration / refresh と対応するテスト・fixture を深度 `deep` で再レビューした。前回の canonical phase path、source identity limits、tombstone projection は修正され、phase graph completeness と mapping path-role の回帰テストも通過した。

一方、refresh writer lock の修正後も、最後の target bytes 読み取りが完了してから `os.replace` するまでに非協調書き込みを失う競合窓が残る。また、refresh preview の公開入力 `current_source_commit` が文字列でない場合、structured `Failure` ではなく `TypeError` を送出する。したがって本レビューは `clean` ではない。

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: [BLOCKER] 最後の target 検証後の同時更新を上書きして Success を返す

**File:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py:721-735`
**Issue:** `replace_at` は共有 writer lock の生存と target hash を再検証するが、最後の `read_bounded_bytes_at` が旧 bytes を返してから `os.replace` を実行するまでの間は target identity を拘束していない。この間に raw operator writer や同じ lock 規約を使わない writer が target を更新すると、更新は candidate で上書きされ、呼び出し元の `apply_manifest_refresh` は `Success` を返す。最後の read が旧 bytes を取得した直後に別の有効な manifest bytes を書き込む public apply probe で、`concurrent_preserved=False`、`candidate_installed=True`、結果 `Success` を再現した。03-22 の回帰テストは最初の locked validation 後に更新を注入するため、2回目の read で検出できるケースしか覆わず、この最終窓を検証していない。承認後に変化した disk bytes を保持して non-success にする契約に反し、データ損失リスクがある。

**Fix:** 現在の advisory lock だけで保護するなら、全 in-scope writer に同一 lock protocol を強制し、非協調 writer を保護対象外とする契約へ明示的に変更する。raw/operator update も保持する現契約を維持するなら、read-then-rename ではなく target の同一性を置換時まで原子的に拘束できる compare-and-swap 相当の protocol を導入する。いずれの場合も、最後の target read が戻った後、rename 前に target を更新する固定回帰テストを追加し、現契約では structured non-success と競合 bytes の保持を要求する。

## Warnings

### WR-01: [WARNING] 非文字列の current source commit が structured failure ではなく TypeError になる

**File:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py:594-598`
**Issue:** `preview_manifest_refresh` は `current_source_commit` の exact type を確認せず `_HEX_40.fullmatch` に渡す。型注釈を迂回する JSON / CLI 境界や直接呼び出しから `None`、整数、任意 object が入ると `TypeError` が公開 API から漏れ、`refresh-input-invalid` の structured `Failure` にならない。3種類すべてで例外を再現した。ほかの refresh limits や operations は同じ admission block で fail-closed に処理しており、この scalar だけ境界挙動が不整合である。

**Fix:** 正規表現評価の前に exact string を検査する。

```python
if (
    not _valid_limits(limits)
    or type(current_source_commit) is not str
    or _HEX_40.fullmatch(current_source_commit) is None
):
    return _failure("refresh-input-invalid", IssueCategory.INPUT)
```

`None`、整数、任意 object を public preview に渡し、repository / filesystem work の前に `refresh-input-invalid` を返す回帰テストを追加する。

## Verification Performed

- `task check` — Ruff format/check、BasedPyright 0 errors、全 952 tests passed
- 既知4修正と graph/path-role 回帰の重点 pytest — 71 passed
- JSON fixture 3件の `python -m json.tool` 検証 — passed
- 最後の target read 後・rename 前の更新を注入する public apply probe — `Success`、`concurrent_preserved=False`、`candidate_installed=True` を再現
- malformed `current_source_commit` の public preview probe — `None`、整数、任意 object の全件で `TypeError` を再現

---

_Reviewed: 2026-08-01T07:22:01Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
