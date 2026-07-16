---
phase: 01-stable-identity-and-migration
reviewed: 2026-07-16T23:23:27Z
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
  critical: 4
  warning: 0
  info: 0
  total: 4
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-07-16T23:23:27Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Narrative Findings (AI reviewer)

### Summary

前回の6件のBLOCKERと1件のWARNINGに対する修正は、指定された回帰入力では成立している。
descriptor-anchored source read、active / tombstone identityとcasefold aliasの拒否、directory-fd
migration、post-open staging cleanup、post-replace result保持、malformed previewの例外封じ込め、deep
JSON / duplicate object name拒否をコードとfocused suite（`124 passed`）で再確認した。

ただし同じcanonical契約の別入力で4件のBLOCKERを再現した。read-only previewのpath race、最終source
snapshot後のdrift、candidateと一致しないapproval evidence、JSON codecの非total入力であり、いずれも
HARD-R1のfail-closed / migration preview / stale approval / exact schema境界を破る。

### Critical Issues

#### CR-01: read-only previewが差し替えられたtargetまたはartifact pathをrepository外まで追従する

**Classification:** BLOCKER

**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py:781-819, 949-954`

**Issue:** applyのreplace pathはdirectory descriptorへ固定されたが、previewのv1 target readは
`_resolve_target()`のpath検査後に`filesystem.read_bounded_bytes(target)`を行い、canonical artifact snapshotも
path-basedな`read_canonical_artifacts()`へ委譲している。target parentを検査後・read直前にrepository外の
directory symlinkへ差し替え、外側へvalid v1 bytesを置く再現では、`preview_manifest_migration()`が
`Success`を返した。またproposalを検査後・`Path.open()`直前だけ外側fileへのsymlinkへ差し替え、descriptor
取得直後に元へ戻す再現では、2回のartifact snapshotがともに外側bytesを採用し、外側hashを持つpreviewが
`Success`になった。readを2回比較しても、各openが同じraceを踏めばpath ownershipは証明できない。

**Fix:** previewでもrepository descriptorからtargetと全canonical artifactsを`dir_fd`、`O_NOFOLLOW`、
regular-file `fstat()`でopenし、同じanchored descriptorからlimit+1 readする。artifact readerには
descriptor-anchored APIを追加するかmigration専用adapterを使い、logical entryとopened inodeの一致を
read前後に検査する。target parent swapとproposal / tasks file swapを、外側bytesが一度もpreviewへ入らない
integration regressionにする。

#### CR-02: final replace seamでcanonical sourceが変わってもstale candidateをinstallする

**Classification:** BLOCKER

**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py:1160-1233`

**Issue:** `_validate_source_snapshot()`はstaging validation後に一度実行されるが、その後の
`before_replace_at()`とfinal guardはtarget parent / target v1 hashだけを再検査する。
`before_replace_at()`でcanonical `spec.md`へ1行追加するfault adapterを使うと、sourceはapproved previewから
driftしたにもかかわらず`apply_manifest_migration()`が`Success`を返し、旧fingerprint / artifact hashを持つ
v2 candidateをtargetへreplaceした。これはpreview後のstate changeでapprovalを失効させる契約を破る。

**Fix:** test seamを含む全pre-replace actionの後、replace直前の一つのguardでcanonical artifacts、tasks
progress、source inventory、target parent、target v1 bytesを再取得・照合する。いずれか一つでも違えばvalidated
stagingをcleanupして`STATE_GUARD` failureを返す。spec、proposal、tasksそれぞれをfinal seamで変更する
regression testを追加する。

#### CR-03: approval previewのchanges / exclusionsがcandidate source stateと一致しなくてもapplyできる

**Classification:** BLOCKER

**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py:578-657, 1297-1314`

**Issue:** `_preview_is_consistent()`はcandidate bytes、artifact / progress hash、source commitは検査するが、
`changes`と`exclusions`がreconciliationおよび`candidate_manifest.source_items`から導出された完全なevidenceかを
検査しない。valid previewのcreated changeを空配列にする、またはsource path / candidate fingerprintを別の
valid-shaped値へ変更し、そのmachine viewから新しいpreview hashを作って明示承認すると、
`apply_manifest_migration()`は`Success`を返してcandidateをinstallした。承認hashは虚偽のchange summary自体には
正しく結び付くため、単なるhash mismatchでは拒否できない。

**Fix:** previous source stateまたはそのcanonical digestをpreviewのfrozen evidenceへ含め、candidateとの比較から
`changes` / `exclusions`をvalidation時に再導出する。再導出した完全な順序付きevidenceとpreview fieldが一致しない
場合は`migration-preview-invalid`としてapproval / staging前に拒否する。created項目の欠落、余分な項目、valid
hexだが誤ったfingerprint、誤ったsource pathをtable regressionに追加する。

#### CR-04: exact JSON codecがbounded malformed inputをstructured failureへ閉じ込めない

**Classification:** BLOCKER

**Files:**

- `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_v2.py:95-98, 670-700, 865-881`
- `src/ai_coding_template_ja/openspec_gsd_handoff/versioned_manifest.py:57-79`

**Issue:** 8 MiB未満の`{"schema_version": <5000桁の整数>}`を渡すとPythonのinteger digit limitによる
`ValueError`がdirect v2 parserとversion dispatcherの両方から外へ漏れる。valid v2 JSONのtask descriptionを
escaped lone surrogate `"\\ud800"`へ変えると`_parse_common_manifest()`のUTF-8 encodeで
`UnicodeEncodeError`が漏れる。一方、source itemの`raw_heading`へ同じlone surrogateを置く入力はparserが
`Success`を返すが、直後のserializerはFailureになり、strict UTF-8 source itemとround-trip契約を破る。
さらにvalid valueの`schema_version`を5000桁integerへ差し替えたserializer入力も`ValueError`を送出する。

**Fix:** JSON decodeでgeneral `ValueError`をstructured invalid-JSONへ分類し、decoded treeの全stringをUnicode
scalar / UTF-8 encodableとしてbounded validationする。`_parse_common_manifest()`とserializerも
`UnicodeEncodeError`、`ValueError`、`OverflowError`、`RecursionError`を対応するstructured failureへ閉じ込める。
huge integer、lone surrogate in common field、lone surrogate in source item、huge integer serializer valueを
regressionへ追加する。

---

_Reviewed: 2026-07-16T23:23:27Z_
_Reviewer: generic-agent workaround (gsd-code-reviewer role contract; not typed-dispatch equivalent)_
_Depth: standard_
