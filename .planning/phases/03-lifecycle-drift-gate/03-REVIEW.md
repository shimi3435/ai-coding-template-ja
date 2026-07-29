---
phase: 03-lifecycle-drift-gate
reviewed: 2026-07-29T11:33:08Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - src/ai_coding_template_ja/openspec_gsd_handoff/execution_mapping.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py
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
findings:
  critical: 2
  warning: 2
  info: 0
  total: 4
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-07-29T11:33:08Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Phase 03 の lifecycle drift、gate、mapping、manifest refresh、source identity と対応するテスト・fixture を標準深度でレビューした。前回レビューで指摘された phase graph の集合差短絡と mapping path role 競合は現実装で修正されている。

一方、canonical phase path の検証漏れにより malformed graph が再利用可能な identity を持つ `DRIFTED` として扱われる契約違反と、refresh の最終 state guard 後の競合書き込みを成功扱いで上書きするデータ損失リスクを再現した。加えて、source identity の malformed limits が structured failure ではなく例外になる問題と、refresh preview の source change 一覧が tombstone を欠落させる問題がある。

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: [BLOCKER] malformed な expected phase path が identity 付き DRIFTED として受理される

**File:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py:408-420`
**Issue:** `_canonical_phase_path` は `PurePosixPath` の形と phase prefix だけを確認し、backslash、NUL、非 NFC component を拒否しない。`observed_nodes` は planning inventory との一致で間接的に拒否されるが、source-pinned `expected_nodes` にはその照合がないため、これらの path が `_validate_phase_nodes` を通過する。public gate の実測では `.planning/phases/03-bad\path`、NUL を含む path、NFD path のすべてが `phase-path-changed:03` を持つ identity 付き `DRIFTED` になった。仕様は expected / observed graph の canonical scalar を独立検査し、malformed graph を identity と remediation のない `UNKNOWN` にするよう要求しているため、malformed source-pinned evidence に再利用可能な decision identity を発行する契約違反である。

**Fix:**

```python
def _canonical_phase_path(value: object, phase_id: str) -> bool:
    if (
        type(value) is not str
        or not value
        or value.startswith("/")
        or "\\" in value
        or "\0" in value
    ):
        return False
    parts = tuple(value.split("/"))
    if any(
        part in {"", ".", ".."} or unicodedata.normalize("NFC", part) != part
        for part in parts
    ):
        return False
    return (
        len(parts) == 3
        and parts[:2] == (".planning", "phases")
        and parts[2].startswith(f"{phase_id}-")
    )
```

expected / observed の両側について backslash、NUL、NFD を public gate へ与え、`UNKNOWN`、identity なし、remediation なしを確認する回帰テストを追加する。

### CR-02: [BLOCKER] refresh の最終 state guard 後の target 更新を上書きして Success を返す

**File:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py:1193-1226`
**Issue:** apply は `_current_preview` と target hash を再検査した後、別呼び出しの `replace_at` で staging を target へ置換する。この検査と置換の間に target が更新されても compare-and-swap または排他制御がない。`replace_at` の冒頭で target を別 bytes に更新してから通常の replace を実行する固定 probe では、競合更新が失われ、candidate bytes が入り、`apply_manifest_refresh` は `Success` を返した。承認後に変化した disk bytes を変更せず non-success にする state-guard 契約に反し、並行 refresh/operator update を失うデータ損失リスクがある。

**Fix:** target の再観測から置換完了までを repository/change 単位の排他ロック下で行い、同じロック規約を全 writer に適用する。`replace_at` 境界にも expected target identity/hash を渡し、ロック下で一致を再確認してから rename する。最終検査直後に target を変更する固定 integration test を追加し、structured non-success と競合 bytes の保持を要求する。

## Warnings

### WR-01: [WARNING] source identity の malformed limits が structured failure ではなく例外になる

**File:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py:405-409`
**Issue:** `_valid_limits` は outer object の型を確認せず `max_items` 等を直接参照する。したがって `source_inventory_from_bytes(..., limits=object())` と `read_source_inventory(..., limits=object())` はどちらも `AttributeError` を送出する。両 public reader は他の malformed aggregate を structured `Failure` に変換しているため、limits だけが fail-closed 境界を迂回する。

**Fix:**

```python
def _valid_limits(limits: object) -> bool:
    return type(limits) is SourceIdentityLimits and all(
        type(value) is int and value > 0
        for value in (limits.max_items, limits.bytes_per_file, limits.bytes_total)
    )
```

`None`、`object()`、subclass、bool/float/zero/negative field を両 public reader で検証し、`source-limits-invalid` を確認する。

### WR-02: [WARNING] refresh preview の change 一覧が tombstone 差分を欠落させる

**File:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py:449-482`
**Issue:** `_changes` は candidate の active items だけを走査するため、previous active item が candidate tombstone に移った差分を返さない。1 active item を同じ ID の tombstone に移した有効な state の実測結果は空 tuple だった。preview 本体には before/after state があるものの、`RefreshCandidateChange` が「one exact source-state difference」と定義され、machine view が `changes` を承認 evidence として公開している以上、削除差分を空と表示するのは誤解を招き、reviewer が source removal を見落とす。

**Fix:** previous/candidate の ID 集合差を計算し、candidate tombstone に移った item を `kind="tombstoned"`、`reason="source-removed"` として決定的に追加する。created / updated / tombstoned がすべて exact、unique、UTF-8 byte 順になる回帰テストを追加する。

## Verification Performed

- `uv run pytest tests/test_handoff_execution_mapping.py tests/test_handoff_identity.py tests/test_handoff_lifecycle_drift.py tests/test_handoff_lifecycle_gate.py tests/test_handoff_manifest_refresh.py -q` — 542 passed
- `uv run ruff check <reviewed Python files>` — passed
- `uv run basedpyright <reviewed source files>` — 0 errors, 0 warnings, 0 notes
- malformed expected phase path の public gate probe — 3/3 が identity 付き `DRIFTED` として再現
- final state guard 後の target race probe — 競合 bytes を上書きし `Success` として再現
- malformed source limits probe — 両 reader で `AttributeError` を再現
- active-to-tombstone change probe — `_changes(...) == ()` を再現

---

_Reviewed: 2026-07-29T11:33:08Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
