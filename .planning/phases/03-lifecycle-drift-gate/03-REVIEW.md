---
phase: 03-lifecycle-drift-gate
reviewed: 2026-08-01T10:16:21Z
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

**Reviewed:** 2026-08-01T10:16:21Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Phase 03 の lifecycle drift / gate、execution mapping、source identity、manifest
migration / refresh と対応するテスト・fixture を fresh independent context で再レビューした。
`task check` は全955件成功し、以前の4 counterexample、refresh source commit の
`None` / `int` / arbitrary object と valid-string control、既存 graph/path-role family
の重点83件も成功した。

保存済み review の CR-01 は canonical OpenSpec と 03-22 の完全な履歴・末尾 clarification
に照らして再判定した。保証対象は bridge-owned migration/refresh writers と同じ
change-directory advisory lock protocol に従う cooperating writers であり、final
observation 後の non-cooperating writer は対象外である。target hash 再検査は
defense-in-depth であって完全な原子保証ではなく、Phase 03 は CAS-like persistence を
導入しない。この境界は canonical design/spec の final-observation scope と一致するため、
歴史的 CR-01 は本レビューの finding として再現しなかった。

一方、manifest migration の公開 preview/apply seam は、caller が渡した正規の
`ManifestMigrationFileOperations` subclass が falsey の場合、その adapter を無視して
default filesystem adapter へ切り替える。public integration probe では supplied adapter
の呼び出し0回のまま preview が `Success`、apply が実 target を変更して `Success` となった。
caller が指定した effect boundary を迂回して実 filesystem を変更するため、本レビューは
`clean` ではない。

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: [BLOCKER] falsey な migration operations adapter を無視して実 filesystem を変更する

**File:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py:1596,2117`

**Issue:** `preview_manifest_migration` と `apply_manifest_migration` は
`operations or ManifestMigrationFileOperations()` で adapter を選択する。このため
`ManifestMigrationFileOperations` の正規 subclass が `__bool__` で `False` を返すと、
caller-supplied boundary が黙って捨てられ、default adapter が実行される。公開 seam の固定
probe で、注入 adapter の `open_parent_directory` / `create_staging_at` は一度も呼ばれず、
preview は `Success`、承認済み apply は target bytes を candidate に変更して `Success` を
返した。refresh seam は同じ問題を `operations is None` で回避している。migration だけが
依存性注入・fault containment を迂回し、caller の想定外に永続データを変更できるため、
incorrect behavior と data-loss risk である。

**Fix:** truthiness ではなく `None` だけを default 選択条件にし、非対応 adapter は
filesystem work 前に structured failure とする。preview/apply の両方に falsey valid-adapter
regression を追加し、注入した failure/recorder が必ず観測され、実 target が保持されることを
確認する。

```python
filesystem = (
    ManifestMigrationFileOperations() if operations is None else operations
)
if not isinstance(filesystem, ManifestMigrationFileOperations):
    return _failure_or_migration_failure("migration-operations-invalid")
```

## Verification Performed

- `task check` — Ruff format/check、BasedPyright 0 errors、pytest 955 passed
- 以前の4 counterexample、refresh wrong-type/valid-string control、graph/path-role family — 83 passed
- refresh public wrong-type node — `None` / `int` / arbitrary object の3件が exact structured INPUT failure、filesystem probe 0
- valid-string refresh control — complete read-only candidate を `Success` で生成
- 03-22 append-only evidence — 7740 bytes、先頭6626 bytesの SHA-256 が記録値 `d80dda930f03f1a9c0ccd8b646bb480a9cec8bea0bff81a5bfbdb0e299c820a5` と一致
- JSON fixture 3件 — `python -m json.tool` 成功
- falsey migration adapter public probe — preview `Success` / supplied calls 0、apply `Success` / supplied calls 0 / target changed
- `git diff --check` — passed

---

_Reviewed: 2026-08-01T10:16:21Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
