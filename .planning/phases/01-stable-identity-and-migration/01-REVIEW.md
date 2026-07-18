---
phase: 01-stable-identity-and-migration
reviewed: 2026-07-18T13:22:13Z
head: 5c4afd3d1080098877ed61ec6b365588f59f976d
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
  warning: 0
  info: 0
  total: 1
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-07-18T13:22:13Z
**HEAD:** `5c4afd3d1080098877ed61ec6b365588f59f976d`
**Depth:** standard
**Status:** issues_found

## Summary

指定8ファイルをAGENTS.md、OpenSpec HARD-R1 / Gate B、Phase 1の全PLAN / SUMMARY / VALIDATIONと
freshに照合した。直前レビューのstaging cleanup identityとsymlink-loop totalityの修正、および対応回帰testは
現HEADで確認できた。一方、replace後の成功判定がdescriptorでanchorされた旧parentだけを再読し、canonical
target pathの再束縛を検査しないため、canonical targetがv1のままでもmigrationが`Success`を返すblockerを
再現した。documented standards、例外totality、schema/stable identity、smell baseline上の独立したfindingはない。

## Findings

### CR-01: replace後のparent再束縛でcanonical targetがv1のままでも`Success`を返す

**Classification:** BLOCKER
**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py:1751-1792`

`replace_at()`後のinstalled-byte検査は、replace前に開いた`anchor.descriptor`からtargetを再読するだけである。
replace完了直後にtarget parentを別名へrenameし、元のcanonical parentを再作成してv1 targetを置くfault probeでは、
旧parent内の移動済みtargetはcandidate v2、canonical targetはexact v1だったにもかかわらず、
`apply_manifest_migration()`は`Success`を返した。成功結果が承認対象のcanonical repository/targetへv2をinstallした
ことを証明しないため、HARD-R1の明示migrationとPlan 01-05のfrozen target / atomic migration postconditionを
満たさない。

**Fix:** replace後かつsuccess返却前にrepository rootとtarget parentのdescriptor/path identityを再検査し、
canonical targetをfreshly anchoredしてcandidate bytes/valueを検証する。identity変化または再読不能なら成功を
返さず、target stateを`unknown`とするstructured failureに閉じ込める。replace後にparentをrenameしてcanonical
pathへv1 directoryを再作成するfault-injection testを追加し、`Success`にならないことを検証する。

## Test reliability

- `uv run pytest -q tests/test_handoff_identity.py tests/test_handoff_manifest_v2.py tests/test_handoff_migration.py`
  — `152 passed`。
- `task check` — Ruff format/check、basedpyright、`383 passed`。
- 追加read-only probe — replace直後にparentを再束縛すると、canonical targetはexact v1、移動先targetはcandidate
  v2の状態で`Success`を再現した。
- 現行testsはreplace前のparent/source drift、replace後のtarget reread failure、close faultを覆うが、replace後の
  canonical parent identityとcanonical target bytesを同時にはassertしていない。

---

_Reviewer: fresh standard-depth review_
_Depth: standard_
