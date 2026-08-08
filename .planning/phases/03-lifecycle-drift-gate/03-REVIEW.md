---
phase: 03-lifecycle-drift-gate
reviewed: 2026-08-08T11:33:49Z
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
  critical: 4
  warning: 1
  info: 0
  total: 5
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-08-08T11:33:49Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

指定された production 6 ファイル、test 6 ファイル、fixture 3 ファイルを adversarial に確認した。
対象テスト 6 ファイルは `646 passed` だが、公開 seam の未検証境界に、canonical target と成功値が
食い違う refresh persistence、特定 change / fixture への production hardcode、NFD path の非冪等な
canonicalization、getter 例外による drift classifier の例外漏出を確認した。加えて migration preview の
不正 collection 入力が structured failure にならない。

## Narrative Findings (AI reviewer)

以下の 5 件。CR-01〜CR-04 は **BLOCKER**、WR-01 は **WARNING** である。

## Critical Issues

### CR-01: Refresh が detached parent を検証して canonical target 未更新のまま成功する

**Classification:** BLOCKER

**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py:1327-1350`

**Issue:** `replace_at` 後の検証は、置換前から保持している `target_anchor.descriptor` を通じて
`handoff.json` を再読するだけである。置換直後に canonical parent が rename され、同じ canonical path に
別 directory が作られると、descriptor は detached directory 内の candidate を読み続ける。そのため
`apply_manifest_refresh` は `Success(candidate_manifest)` を返す一方、repository の canonical
`handoff.json` は candidate ではない状態になる。実際に `replace_at` の直後に parent を rebind する
operations adapter で再現し、結果は
`Success canonical_is_candidate=False detached_is_candidate=True` だった。migration 側には
`manifest_migration.py:2042-2110` の fresh canonical anchor 検証があるが、refresh 側にはない。

**Fix:** replace 後に repository anchor から target parent を新しく no-follow で開き直し、旧 anchor と
device/inode が一致し、fresh canonical path から読んだ bytes が candidate と一致することを確認してから
Success を返す。migration と同じ post-replace proof を共通 helper に抽出し、refresh に parent-rebind と
fresh-reread-failure の回帰テストを追加する。

### CR-02: Refresh の production API が一つの fixture・source count・Phase 02 に固定されている

**Classification:** BLOCKER

**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py:66-71,699-724,886-916`

**Issue:** 汎用の `preview_manifest_refresh` / `apply_manifest_refresh` であるにもかかわらず、実装は
特定 change の created/updated ID、active item 数 `{42, 49, 54}`、target phase `"02"`、さらに
`tests/fixtures/.../hardening-phase-assignments.json` と固定 policy path を production code に埋め込んでいる。
このため構造上正しい別 change は `refresh-canonical-snapshot-stale` または
`refresh-mapping-phase-unknown` で拒否される。Phase 02 を正当な Phase 07 へ置換した valid inventory の
最小反例でも `Failure refresh-mapping-phase-unknown` を再現した。また wheel は `src` package のみを
収録するため、apply の固定 `tests/fixtures` 再読は通常のインストール先で成立しない。

**Fix:** `_EXPECTED_CREATED` / `_EXPECTED_UPDATED` / source-count gate を削除し、差分は previous と
candidate からのみ導出する。refresh を operation-specific readiness と分離するか、必要なら caller が
指定した target phase を preview hash に束縛する。assignment/policy の canonical source path も caller
入力として preview に保持・hash 化し、apply はその exact path を再観測する。package 外の test fixture を
production dependency にしない。異なる change ID、Phase 02 を持たない inventory、インストール済み wheel
からの apply を public seam で検証する。

### CR-03: NFD source path を受理して存在しない NFC path を永続 identity にする

**Classification:** BLOCKER

**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py:412-431`

**Issue:** `_canonical_source_path` は各 segment を NFC 化して返すが、raw segment が NFC と一致することを
要求しない。Linux 上で NFD 名の実ファイルを読むと `read_source_inventory` は成功し、observation には NFC
path が保存される。しかしその保存 path は filesystem 上に存在せず、同じ path を次回入力すると
`source-path-unreadable` になる。最小反例では
`Success -> input==persisted False -> persisted exists False -> Failure source-path-unreadable` となった。
stable source identity が一回の読取りだけで自己再現不能になり、refresh/migration の再開を阻害する。

**Fix:** canonical source path は全 raw segment が NFC と byte-for-byte 一致する場合だけ受理する。
NFD 単独 path を `source-path-noncanonical` で拒否する回帰テストを、既存の二 path alias テストとは別に追加する。

### CR-04: Canonical drift classifier が structured input の getter 例外を漏出する

**Classification:** BLOCKER

**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py:242-310,358-371`

**Issue:** `_is_complete_observation` は `isinstance` で dataclass subclass を受理した後、artifact / progress /
observation の getter を例外境界なしで繰り返し参照する。`CanonicalArtifactObservation.path` が
`RuntimeError` を送出する well-typed subclass を `Success` に入れると、公開
`classify_canonical_source_drift` は UNKNOWN を返さず `RuntimeError: boom` を送出した。
`lifecycle_gate.py` も boundary call 自体だけを catch し、返却 structured value の validation は catch 外なので、
同じ種類の値で public gate 全体が crash する。既存テストは `source_items.active` getter だけを覆い、他の
structured members を覆っていない。

**Fix:** public classifier の complete-observation validation と比較全体を ordinary `Exception` 境界で囲み、
`canonical-observation-incomplete` の identity-free UNKNOWN に正規化する。gate も boundary 返却値の
validation/projection を同じ境界に含める。一方 `BaseException` 派生の process-control signal は従来どおり
伝播させる。outer observation、artifact、progress/task、phase graph、capability の getter 例外を左右両 side
で回帰テストに追加する。

## Warnings

### WR-01: Migration preview が不正 collection / operations 入力を structured failure にしない

**Classification:** WARNING

**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py:1584-1640,2114-2152`

**Issue:** `current_artifacts`、`source_paths`、`explicit_matches` を runtime validation 前に `tuple(...)` 化して
おり、`None` ではそれぞれ raw `TypeError` が public preview から漏れる。さらに preview/apply は supplied
`operations` の型を検証せず、`object()` では raw `AttributeError` が漏れる。確認結果は
`current_artifacts/source_paths/explicit_matches: RAISED TypeError`、
`preview/apply operations: AttributeError` だった。refresh API が同じ operations 境界を structured failure
へ正規化しているのに migration だけ契約が分岐しており、caller が全失敗を Result として扱えない。

**Fix:** filesystem 読取りより前に Sequence（`str` / `bytes` 除外）、member、limits、operations adapter を
検証し、不正値は `migration-input-invalid` または `migration-operations-invalid` の Failure にする。
iteration/getter の ordinary `Exception` も preview validation failure へ正規化し、`BaseException` は捕捉しない。

---

_Reviewed: 2026-08-08T11:33:49Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
