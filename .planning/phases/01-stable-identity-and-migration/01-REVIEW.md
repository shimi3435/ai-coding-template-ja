---
phase: 01-stable-identity-and-migration
reviewed: 2026-07-18T12:45:58Z
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
  warning: 1
  info: 0
  total: 5
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-07-18T12:45:58Z
**Depth:** standard
**Status:** issues_found

## Summary

指定された実装、fixture、testsをOpenSpec changeのHARD-R1およびGate Bと突き合わせた。focused suiteは
`uv run pytest -q tests/test_handoff_identity.py tests/test_handoff_manifest_v2.py tests/test_handoff_migration.py`
で`140 passed`だった。一方、canonical snapshotの一貫性、target保持証拠、staging inode、strict UTF-8、
structured failureの5点に未検証の不具合を再現した。documented standards上の独立したstyle findingはない。

## Findings

### CR-01: artifact snapshotとsource inventoryが異なるspec bytesを承認対象にできる

**Classification:** BLOCKER
**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py:1033-1038, 1074-1126`

`_read_artifact_snapshot()`は`repository_anchor`からspecを読む一方、`_validate_source_snapshot()`はその後に
`read_source_inventory(repository, ...)`でrepository pathを別途openする。artifact側が読んだspec bytesをinventory
入力へ渡さず、hash同士も比較しない。最初のartifact read直後にspecを変更し、2回のinventory read後かつ確認用
artifact read直前に元へ戻すadapterでは、元bytesのartifact SHA-256と変更後bytesのsource fingerprintを同時に持つ
previewが`Success`になった。同じhelperはapplyのpre-staging / pre-replace guardでも使われるため、source-pinned
snapshotを一つの観測として証明できない。

**Fix:** descriptor-anchored artifact snapshotが取得したexact spec bytesからinventoryを構築し、artifact hash、
source observation、progressを一つのimmutable snapshot valueとして比較する。この切替をpreviewとfinal guardの
双方で行う回帰testを追加する。

### CR-02: path-based target observationが別inodeを根拠に`v1-preserved`を報告する

**Classification:** BLOCKER
**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py:890-901, 1717-1782`

applyはrepository / target parentをdescriptor-anchorする前に`read_bounded_bytes(target)`を行い、anchor取得失敗時の
証拠にも`_observe_target_state_path()`を使う。target parentを退避し、owned targetを変更した後、元pathを外部
directoryへのsymlinkにして外部側へpreview済みv1 bytesを置く再現では、applyはfailureになったものの
`target_state=v1-preserved`を返した。実際のowned targetは変更済みであり、failure evidenceが別inodeを観測している。

**Fix:** approval後はrepository rootとtarget parentを先にanchorし、target hash / parseと全failure observationを
`read_bounded_bytes_at()`だけで行う。anchor前またはanchor検証不能時は`target_state=unknown`とする回帰testを追加する。

### CR-03: stagingを作成時inodeへ固定せず、書込み前の差し替えでv1 targetを破壊できる

**Classification:** BLOCKER
**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py:309-349, 462-483, 1444-1504`

`create_staging_at()`は安全に作成したdescriptorをcloseして名前だけを返し、`write_bytes_at()`はその名前を再openする。
作成後にstaging entryをunlinkし、同directoryの`handoff.json`へのhard linkへ差し替えてから書込ませる隔離probeでは、
applyは`migration-state-changed-before-replace`で失敗したが、target bytesは既にcandidate v2へ変更され、v1は保持されなかった。
`O_NOFOLLOW`はsymlinkだけを防ぎ、regular-file / hard-link置換のinode同一性を証明しない。

**Fix:** staging descriptorをcreateからwrite、fsync、reread、validation、replaceまで保持するか、作成時の
`st_dev/st_ino`を各操作の前後でdirectory entryと照合する。stagingをtarget hard linkまたは別regular fileへ置換する
fault-injection testで、target v1 bytes不変とcleanup evidenceを検証する。

### CR-04: embedded surrogateをvalid v2として受理し、public source seamは例外を漏らす

**Classification:** BLOCKER
**Files:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_v2.py:203-214, 236-281, 344-405, 680-735`;
`src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py:654-686, 861-913`

escaped JSONの`raw_heading="### Requirement: Valid\ud800"`を含むmanifestは
`parse_manifest_v2_bytes()`が`Success`を返すが、そのvalueの`serialize_manifest_v2()`は`Failure`になる。また同形の
`SourceObservation`を`fingerprint_source_observation()`へ渡すと`UnicodeEncodeError`が外へ漏れる。strict UTF-8と
exact round-trip、およびpublic `Result` seamのtotalityを満たさない。

**Fix:** decoded treeとpublic source inputsの全stringをstrict UTF-8 encodableなUnicode scalarとして検査し、
encode例外をstable structured `Failure`へ変換する。valid prefix / suffix内にsurrogateを埋めたparser、serializer、
fingerprint、reconcileの回帰testを追加する。

### WR-01: preview target descriptorのclose failureがraw `OSError`を送出する

**Classification:** WARNING
**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py:1229-1268, 1329-1349`

`_read_preview_snapshot_at_root()`の`finally`はtarget anchorを無条件にcloseするが、closeの`OSError`をstructured
failureへ変換しない。descriptorを実際にcloseした後でfaultを返すadapterでは、public
`preview_manifest_migration()`からraw `OSError`が送出された。read-only previewのwhole-operation failure handlingが
他のread / parse failureと不整合になる。

**Fix:** target-anchor close failureを既存snapshotの破棄を伴うstructured `Failure`へ変換し、repository-anchorの
cleanupも維持する。target / repository closeを個別にfault injectし、例外漏れとfd増加がないことを検証する。

## Test reliability

既存testsは近接するsymlink race、source drift、staging write / reread / cleanup fault、malformed JSONを広く覆い、
focused suiteは安定してgreenだった。ただし上記5入力は未収載で、関連testがgreenでも同じ契約の別failure modeを
検出できない。特にCR-03はfailureを返すだけでは不十分で、失敗後のtarget bytesを必ず検査する必要がある。

---

_Reviewer: fresh standard-depth review_
_Depth: standard_
