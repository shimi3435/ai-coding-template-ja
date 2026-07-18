---
phase: 01-stable-identity-and-migration
reviewed: 2026-07-18T13:08:41Z
head: 68361d425d82d0ed0e293a267197ee494e09ddd7
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
  critical: 1
  warning: 1
  info: 0
  total: 2
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-07-18T13:08:41Z
**HEAD:** `68361d425d82d0ed0e293a267197ee494e09ddd7`
**Depth:** standard
**Status:** issues_found

## Summary

指定8ファイルをAGENTS.md、OpenSpecのHARD-R1 / Gate B、Phase 1の全PLAN / SUMMARY / VALIDATIONと
freshに照合した。前回5 findingsの修正は現HEADで確認でき、対応回帰testsもgreenだった。しかし、staging
差し替え後のcleanupが作成inode以外を削除できるatomic failureと、symlink loopがpublic `Result` seamから
raw `RuntimeError`として漏れるtotality gapを新たに再現した。documented standardsおよびsmell baseline上の
独立したcode-quality findingはない。

## Findings

### CR-01: staging差し替え後のcleanupが作成inode以外のfileを削除する

**Classification:** BLOCKER
**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py:572-578,930-975,1571-1588`

`create_staging_at()`は作成した`st_dev/st_ino`を保存し、write / reread / replaceではそのidentityを検査するが、
失敗後の`unlink_at()`は現在のdirectory entryをidentity検査なしで削除する。作成直後にstaging entryをunlinkし、
同directoryの一意な別fileをその名前へrenameするfault probeでは、write guardは正しく失敗した一方、cleanupが
別fileを削除して`cleanup_outcome=removed`を返した。target v1は保持されたが、migrationが所有を証明していない
fileを失うため、staging failure時の安全なatomic postconditionを満たさない。

**Fix:** cleanup前に保存済み`st_dev/st_ino`、regular-file、`st_nlink == 1`、directory entryとdescriptorの一致を
再検査し、一致しなければunlinkせず`cleanup_outcome=failed`またはidentity不明の専用evidenceを返す。staging名を
別の一意なregular fileへ差し替えるfault-injection testで、そのfileとtarget v1の両方が不変であることを検証する。

### WR-01: symlink loopがpublic Result seamからRuntimeErrorとして漏れる

**Classification:** WARNING
**Files:** `src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py:680-683`;
`src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py:999-1008`

`read_source_inventory()`とmigrationの`_resolve_target()`は`Path.resolve(strict=True)`の`OSError`だけを捕捉する。
Python 3.12ではrepository rootが自己参照symlink loopの場合に`RuntimeError`が発生するため、両public operationを
同じ入力で呼ぶprobeはいずれもstructured `Failure`ではなく`RuntimeError: Symlink loop ...`を送出した。
仕様が要求するpath / symlink fail-closedとwhole-operation exception totalityに反するが、書込み前のため状態変更はない。

**Fix:** resolution boundaryで`RuntimeError`も含めてstable structured failureへ変換する。通常のsymlink escapeに加え、
repository rootおよびtarget parentの自己参照・相互参照loopをpublic seamから検証する回帰testを追加する。

## Test reliability

- `uv run pytest -q tests/test_handoff_identity.py tests/test_handoff_manifest_v2.py tests/test_handoff_migration.py`
  — `149 passed`。
- 対象7 Python filesへの`ruff check`と`basedpyright` — green。
- `task check` — Ruff format/check、basedpyright、`380 passed`。
- 現行testsは前回のartifact/source byte binding、descriptor-anchored target evidence、staging hard-link差し替え、
  embedded surrogate、descriptor close faultsを直接覆う。
- CR-01は「failureを返した」「target v1が不変」だけでは検出できず、差し替え先の別file不変もassertする必要がある。
  WR-01は通常symlink testだけではPython 3.12の`Path.resolve()`固有例外を検出できない。

---

_Reviewer: fresh standard-depth review_
_Depth: standard_
