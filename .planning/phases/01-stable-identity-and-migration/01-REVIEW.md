---
phase: 01-stable-identity-and-migration
reviewed: 2026-07-16T22:46:17Z
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
  critical: 6
  warning: 1
  info: 0
  total: 7
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-07-16T22:46:17Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Narrative Findings (AI reviewer)

### Summary

修正対象だった3件の狭い回帰入力は解消済みである。parent swap integration testはrepository外を変更せずstructured failure、削除済みlocatorの直接再導入は`source-tombstone-identity-collision`、10,000階層のobject/arrayは両JSON parserでstructured invalid JSONになり、focused suiteは`104 passed`だった。

ただし、同じfail-closed契約の別入力で6件のblockerと1件のwarningを再現した。特にsource readの親差し替え、allocatorが返すcodec-invalid state、staging作成後失敗、およびreplace後close失敗は、path ownershipまたはpartial-failure evidenceを破るためPhase 1完了前に修正が必要である。

### Critical Issues

#### CR-01: source path検査後の親差し替えでrepository外のMarkdownを成功値として読む

**Classification:** BLOCKER

**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py:424-490`

**Issue:** `_contains_symlink()`と`resolve(strict=True)`で検査した後、`Path.open()`まで親directory identityを固定していない。検査後にspecの親directoryをrenameし、同じlogical pathをrepository外directoryへのsymlinkへ差し替える再現では、`read_source_inventory()`が`Success`を返し、outside側の`### Requirement: Outside`とbodyをinventoryへ取り込んだ。これはHARD-R1のpath/symlink escape拒否と、Plan 01の「lexical rejection plus component lstat/resolved containment before reads」を破る。

**Fix:** repository rootから各componentを`O_DIRECTORY | O_NOFOLLOW`と`dir_fd`でwalkし、最終`spec.md`も同じanchored descriptorから`O_NOFOLLOW`でopenして`fstat()`したregular fileだけをlimit+1 readする。path-based validationとopenの間を残さず、親swap時にstructured `source-path-symlink`またはidentity-changed failureを返すintegration testを追加する。

#### CR-02: 既存activeとtombstoneが同じnormalized identityを持つstateからduplicate tombstoneを成功生成する

**Classification:** BLOCKER

**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py:620-679, 926-1065`

**Issue:** `_validate_source_state()`のidentity uniquenessはactive itemsだけを集合へ追加する。異なるIDのactive `REQ-000001`とtombstone `REQ-000002`へ同じpath/normalized headingを与え、empty inventoryでreconcileすると`Success`になり、同一locatorのtombstoneが2件残った。そのstateを`serialize_manifest_v2()`へ渡すと`manifest-v2-serialization-invalid`になる。直接のtombstone再導入は修正されたが、public allocatorは依然codecが受理できないstateを返せる。

**Fix:** `_validate_source_state()`でactive/tombstoneを共通のnormalized identity setへ登録し、cross-stateおよびtombstone同士の衝突をallocation前に`source-tombstone-identity-collision`等のstructured collisionとして拒否する。active+tombstone同一locatorからempty inventoryへ遷移する回帰テストと、成功したreconciliationは必ずschema-v2 serialize/parseできる不変条件を追加する。

#### CR-03: schema-v2 parserがplatform case aliasのsource pathsを同時に受理する

**Classification:** BLOCKER

**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_v2.py:286-456`

**Issue:** source identity uniquenessはpath文字列のexact equalityだけで、path alias keyを検査しない。fixtureのactive itemに、同じheadingを持つ`.../fixture-capability/spec.md`と`.../Fixture-Capability/spec.md`を別IDで追加したmanifestが`Success`になった。source inventoryはcasefold aliasを拒否しており、codecだけがHARD-R1/designのUnicode/platform-case alias collision拒否と異なるstateを受理する。

**Fix:** active/tombstone全件のcanonical pathへNFC済みcasefold alias keyを作り、異なるraw pathが同じaliasへ畳まれる場合は`manifest-v2-value-invalid`にする。同じ検査をallocatorのpersisted-state validatorにも共有し、case/NFC alias fixtureを追加する。

#### CR-04: staging作成後にcreate処理が失敗するとorphanを残してcleanupを`not-needed`と報告する

**Classification:** BLOCKER

**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py:259-283, 882-907`

**Issue:** `create_staging_at()`は`os.open(...O_CREAT|O_EXCL)`後の`fstat()`または`close()`でも例外になり得るが、apply側はmethodがnameをreturnする前の全例外を`staging_name=None`として扱う。実ファイルを作成した直後に`OSError`を注入すると、target v1は維持される一方、`.handoff.*.tmp`が残り、結果は`staging_state=unknown`かつ`cleanup_outcome=not-needed`だった。staging existenceとcleanup evidenceが事実に反する。

**Fix:** creation ownershipをadapter内で完結させ、open成功後の全失敗で同じdir fdから一度だけunlinkを試すか、作成済みnameとcleanup outcomeを運ぶ専用exception/resultをapplyへ返す。post-open `fstat`/close failureを注入し、orphan有無とcleanup evidenceが一致する回帰テストを追加する。

#### CR-05: target置換後のparent descriptor close失敗がstructured resultを上書きする

**Classification:** BLOCKER

**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py:1178-1199`

**Issue:** `_apply_anchored_manifest_migration()`のreturnを`finally`内の`close_parent_directory()`が上書きできる。closeを「実際にcloseしてから`OSError`」にすると、targetはschema 2へ置換済みなのに`apply_manifest_migration()`は`OSError`を外へ送出した。callerは成功値もmigration failure evidenceも受け取れず、partial effectの既知状態を失う。

**Fix:** apply resultを先に保持し、close exceptionを捕捉して外へ漏らさない。replace済み候補をanchored/bounded rereadで証明できる場合は正確なsuccess、証明不能なら専用failure pointとtarget stateを持つstructured resultを返す。replace後close faultの回帰テストを追加する。

#### CR-06: malformed/tampered previewがapproval failureではなく`AttributeError`を送出する

**Classification:** BLOCKER

**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py:406-435, 1072-1089`

**Issue:** approval guardは`_preview_identity(preview)`をschema validationより先に呼び、machine view builderの例外を捕捉しない。valid previewを`replace(preview, changes=("bad",))`で改変し、保存済みpreview hashとliteral approvalを渡すと、target v1を維持するものの`'str' object has no attribute 'kind'`が外へ漏れた。Plan 04/05の「incomplete previewはpartial evidenceなしでfail closed」「applyはimmutable successまたはmigration-specific failure evidence」を満たさない。

**Fix:** preview machine view/identity計算をtotal validatorにし、全field型・bounds・candidate consistencyを検査して例外を`migration-preview-invalid`へ分類する。nested `changes`、artifacts、progress、source pathsを1項目ずつ壊すtable testを追加し、mutation zeroとstructured failureを確認する。

### Warnings

#### WR-01: exact JSON parserがduplicate object namesをlast-value-winsで受理する

**Classification:** WARNING

**Files:**

- `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_v2.py:649-663`
- `src/ai_coding_template_ja/openspec_gsd_handoff/versioned_manifest.py:38-68`

**Issue:** `json.loads()`のdefault object decoderはduplicate namesを上書きする。golden v2の先頭へ`"schema_version": 1`を追加し、後段の既存`"schema_version": 2`を残したbytesは、direct v2 parserとversion dispatcherの双方でschema 2 `Success`になった。Python内では一貫するが、first-wins parserとの間でschema discriminator解釈が分かれ、exact/strict wire contractに曖昧なdocumentを持ち込む。

**Fix:** 全object levelでduplicate nameを検出する`object_pairs_hook`を使い、direct parserは`manifest-v2-json-invalid`、dispatcherは`manifest-json-invalid`へ分類する。rootとnested objectのduplicate-key fixturesを追加する。

---

_Reviewed: 2026-07-16T22:46:17Z_
_Reviewer: generic-agent workaround (gsd-code-reviewer role contract; not typed-dispatch equivalent)_
_Depth: standard_
