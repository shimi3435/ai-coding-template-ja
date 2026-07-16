---
phase: 01-stable-identity-and-migration
reviewed: 2026-07-16T22:17:52Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/manifest_v2.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/versioned_manifest.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py
  - tests/test_handoff_identity.py
  - tests/test_handoff_manifest_v2.py
  - tests/test_handoff_migration.py
  - tests/fixtures/openspec_gsd_handoff/manifest/expected-migrated-v2.json
findings:
  critical: 3
  warning: 0
  info: 0
  total: 3
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-07-16T22:17:52Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Narrative Findings (AI reviewer)

### Summary

Stable identity、exact schema v2、migration preview/apply とその tests を adversarial に確認した。既存の focused suite は `98 passed` だが、fail-closed contract を破る blocker を3件再現した。指定された fixture path `tests/fixtures/handoff/expected-migrated-v2.json` は存在しないため、diff 上の実ファイル `tests/fixtures/openspec_gsd_handoff/manifest/expected-migrated-v2.json` をレビューした。

### Critical Issues

#### CR-01: 最終 guard 後の親ディレクトリ差し替えで repository 外を置換できる

**Classification:** BLOCKER

**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py:846-879`

**Issue:** 最後の `_resolve_target()` と target hash 検査後、`replace()` は absolute pathname を再解決して `os.replace()` する。両者の間に manifest の親ディレクトリを rename し、同名 path を repository 外への symlink に差し替えると、intermediate symlink が追従される。再現では `apply_manifest_migration()` が `Success` を返しながら repository 外の `handoff.json` を candidate bytes で置換した。`O_NOFOLLOW` は final component の read/write にしか効かず、この replace-time parent swap を防がない。これは HARD-R1 の path/symlink escape fail-closed と atomic target ownership を破る。

**Fix:** target parent を `O_DIRECTORY | O_NOFOLLOW` で開いた directory fd に固定し、staging の作成・再読・unlink・replace を basename と同じ directory fd に対して行う。`os.replace(..., src_dir_fd=parent_fd, dst_dir_fd=parent_fd)` の直前にも `fstat()` した directory identity と repository containment evidence を再確認する。親 swap を replace hook で注入し、repository 外が不変かつ structured failure になる integration test を追加する。

#### CR-02: tombstone と同一 locator の再出現を allocator は成功させるが codec は拒否する

**Classification:** BLOCKER

**Files:**

- `src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py:1028-1047`
- `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_v2.py:321-425`

**Issue:** reconciliation は previous active だけを exact match 対象にするため、削除済み locator が再出現すると新しい ID を active に割り当て、同じ normalized identity の tombstone を残した `Success` を返す。一方、schema-v2 parser は active と tombstone で共有する `persisted_identities` set により同状態を拒否する。再現では `REQ-000003` の allocation が成功した直後、`serialize_manifest_v2()` が `manifest-v2-serialization-invalid` になった。正常な API 同士が異なる invariant を実装しており、migration preview は collision/manual-resolution evidence ではなく generic serialization failure で停止する。

**Fix:** canonical contract の「normalized identity collision は自動 merge/reallocation せず報告」に合わせ、reconciliation 前に active candidate と tombstone locator の衝突を検出して専用 structured collision failure を返す。もし同一 locator の再導入を新 ID で許す仕様判断なら、先に OpenSpec を更新し、codec の global identity rule を同じ invariant に変更する。削除、同一 locator 再追加、serialize/parse の一連を regression test にする。

#### CR-03: bounded JSON の深い nesting が Result ではなく `RecursionError` を送出する

**Classification:** BLOCKER

**Files:**

- `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_v2.py:649-657`
- `src/ai_coding_template_ja/openspec_gsd_handoff/versioned_manifest.py:38-55`

**Issue:** 両 parser は byte 上限を検査するが、`json.loads()` の `RecursionError` を捕捉しない。約60 KiBの deeply nested object で `parse_manifest_v2_bytes()` と `parse_versioned_manifest_bytes()` の双方が structured `Failure` ではなく例外を送出した。8 MiB未満の malformed input だけで handoff/migration caller を中断でき、unknown/malformed/巨大入力の fail-closed contract を破る。

**Fix:** JSON decode boundary で `RecursionError` を structured invalid-JSON failure に変換するか、bounded depth scanner を decode 前に適用する。schema-v2 direct parser と version dispatcher の両方に、上限未満の deeply nested array/object fixtures を追加し、例外を外へ漏らさないことを検証する。

---

_Reviewed: 2026-07-16T22:17:52Z_
_Reviewer: generic-agent workaround (gsd-code-reviewer role contract)_
_Depth: standard_
