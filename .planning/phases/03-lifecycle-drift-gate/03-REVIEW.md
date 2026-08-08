---
phase: 03-lifecycle-drift-gate
reviewed: 2026-08-08T12:51:18Z
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
  critical: 7
  warning: 1
  info: 0
  total: 8
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-08-08T12:51:18Z
**Depth:** deep
**Files Reviewed:** 15
**Status:** issues_found

## Summary

production 6 ファイルの public seam、migration / refresh persistence chain、mapping / drift / gate の
cross-file call chainを deep reviewした。対象 6 test module は fresh runで `646 passed` だが、これは既存の
正常系・既知 malformed family の回帰確認に限られ、今回の read-only counterexample は覆っていない。

凍結 inventory は **BLOCKER 7 件、WARNING 1 件、計 8 件**。旧 CR-01〜CR-04 / WR-01 は履歴を保持して
全件再判定した。新規 3 件は、(1) supported persistence adapter の通常例外が effect taxonomy と cleanup を
迂回する、(2) accepted `Sequence` の列挙途中例外が public preview/source-reader から漏れる、(3) その他の
public Result/decision API が malformed root/scalar/outer wrapper の通常例外を totalize しない、である。

## Gap Inventory Freeze

- **凍結時点:** 2026-08-08T12:51:18Z、HEAD `80dcfef66a5e3ceaea37c11ec320c204eeb37911`。
- **Primary scope:** frontmatter の 15 ファイル。加えて、仕様・exit ordering の照合に OpenSpec proposal / design /
  tasks、03-01〜03-29 PLAN、03-SECURITY、03-VERIFICATION、REQUIREMENTS / ROADMAP / STATE を read-only 参照した。
- **方法:** 全 production public symbol と import/call chain の静的追跡、既存 fixture/test matrix の逆向き確認、
  isolated temporary repository と injected adapter/collection による read-only probe、対象 646 tests の fresh run。
- **判定規則:** test pass は counterexample 不在の証拠にしない。ordinary `Exception` は既存 Result / UNKNOWN /
  persistence taxonomyへ totalizeし、`BaseException` は捕捉せず伝播する契約として確認した。
- **凍結後の扱い:** 本書の 8 件を一括 gap inventory とし、修正途中の追加 micro-gap review で完了判定しない。
  全件修正後に同じ 15-file scope、fresh security、fresh verifierを順に再実行する。

## Existing Finding Reassessment

| ID | 再判定 | 現在の分類 | 根拠 |
|---|---|---|---|
| CR-01 | **confirmed** | BLOCKER | post-replace parent rebind probeが再び `Success / canonical=False / detached=True` を返した。 |
| CR-02 | **confirmed** | BLOCKER | Phase 02を持たない有効 inventory が `refresh-mapping-phase-unknown`。production hardcodeとpackage外fixture依存も現存。 |
| CR-03 | **confirmed** | BLOCKER | NFD pathの初回readはSuccess、永続NFC pathは不存在、再readは`source-path-unreadable`。 |
| CR-04 | **modified** | BLOCKER | artifact getterだけでなく、outer Result、progress/graph/capability getterとgate validation/projectionまで同じ例外境界欠落を確認。 |
| WR-01 | **confirmed** | WARNING | migrationの`None` collectionはraw `TypeError`、wrong-type operationsはraw `AttributeError`のまま。新規CR-05/06とは、unsupported type admissionとsupported protocol実行中failureを分離した。 |

invalidated / downgraded は 0 件。旧 ID は削除・付替えしていない。

## Exit Evidence Ordering

Plan 03-23 が宣言する順序は review → security → verifier → traceability で正しい。過去の clean exitも
`372f1d6` review → `b7ebe11` security → `2c5515d` verifier の順で生成された。しかし、その後の
`3861162` reviewが `issues_found` に更新され、`80dcfef` verifierが `gaps_found` に戻したため、
`03-SECURITY.md` の `status: verified` / `audited_head: 372f1d6` は現在HEADのexit証拠ではない。

現行の completion authority は fail-closed で整合している。OpenSpec tasks 3.1 は未チェック、HND-03 は
Pending、ROADMAPのPhase 3は未完了、Phase 4はblocked、03-VERIFICATIONは`gaps_found`である。したがって
stale SECURITY単体を根拠にtraceabilityやPhase 4を進めてはならない。全8件修正後は、fresh clean review、
fresh security、fresh verifier、HND-03 traceability更新の順を崩さず再生成する必要がある。

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Refresh が detached parent を検証して canonical target 未更新のまま成功する

**Classification:** BLOCKER
**Reassessment:** confirmed
**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py:1315-1350`

**Issue:** `replace_at` 後も置換前の `target_anchor.descriptor` から candidateを再読する。置換直後に
canonical parentをrenameし同じpathへ別directoryを作るadapterで、detached directory内candidateは一致する一方、
canonical `handoff.json` は旧bytesのままでも `Success(candidate_manifest)` になった。no-op branchも
`1217-1218` で最終のcanonical parent identityを確認せずSuccessを返す。同じadapter baseを使うmigrationは
`manifest_migration.py:2034-2110` でfresh canonical anchor、parent identity、fresh bytesを検証しており非対称である。

**Reproduction:** isolated repositoryで `replace_at` のsuper呼出し後にtarget parentをdetached名へrenameし、
canonical pathへ旧targetを再作成する。結果は `Success`, `canonical_is_candidate=False`,
`detached_is_candidate=True`。

**Cross-file impact:** refresh Successを後続gate/approval evidenceが正しいcanonical stateとして利用できる。
migrationだけにあるfresh proofではrefreshを保護できない。

**Fix:** refreshにもmigrationと同じpost-effect proofを共通化する。repository anchorからtarget parentをfresh
no-follow openし、旧/fresh device+inode一致、両parent current、fresh canonical bytesとcandidate bytes一致、
parse結果一致を確認後だけSuccessにする。no-opにもfresh canonical rereadを要求し、parent-rebind、fresh-open/reread
failure、canonical bytes mismatchのpublic regressionsを追加する。

### CR-02: Refresh production API が一つのchange、Phase 02、package外test fixtureへ固定されている

**Classification:** BLOCKER
**Reassessment:** confirmed
**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py:66-71,699-724,886-916`

**Issue:** generic名のpublic APIがcreated/updated ID、active count `{42,49,54}`、target phase `"02"`、
`tests/fixtures/.../hardening-phase-assignments.json`、固定policy registry pathをproduction codeへ埋め込む。
Phase 02を正当なPhase 07へ置換した有効inventoryは `refresh-mapping-phase-unknown` になった。さらに
`pyproject.toml` のwheel対象は `src/ai_coding_template_ja` だけなので、package外 `tests/fixtures` をapply時に
再読する `_current_preview` は通常のinstalled wheelで成立しない。

**Reproduction:** valid 54-item inventoryのPhase 02 declaration/assignmentsをPhase 07へ一貫して変更し、対応phase
directoryを作ってpublic previewを呼ぶ。またはsrc-only wheel相当のinstall treeからapplyを呼ぶ。

**Cross-file impact:** `execution_mapping.py` 自体はcaller-declared phaseを扱えるがrefreshがそのgeneric contractを
狭める。previewはcaller inventoryを承認hashに含める一方、applyは別の固定pathをauthorityとして再読し、
preview/apply identityも移植不能になる。

**Fix:** fixed ID/count gatesを削除し差分をprevious/candidateだけから導出する。target phase、assignment source、
policy sourceをcaller inputとしてpreviewへ保存・hash bindingし、applyはそのexact inputsを再観測する。
production packageからtests依存を除き、別change、Phase 02なし、別canonical inventory path、installed-wheel環境の
public regressionsを追加する。

### CR-03: NFD source path を受理して存在しないNFC pathを永続identityにする

**Classification:** BLOCKER
**Reassessment:** confirmed
**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py:412-431`

**Issue:** `_canonical_source_path` はNFC化したpathを返すが、raw segmentがNFCと一致することを要求しない。
Linux上のNFD名をraw segmentで開いてSuccessにした後、observation/stateには存在しないNFC pathを保存する。
`read → persist → reuse` が冪等でない。

**Reproduction:** NFD `Cafe\u0301` directoryにspec.mdを作る。初回はSuccess、保存pathは入力と不一致かつ不存在、
保存pathの再入力は `Failure(source-path-unreadable)`。

**Cross-file impact:** migration/refreshのsource reconciliation、mapping identity、drift comparison、resumeに
自己再現不能なpathが伝播する。既存alias testはNFC/NFDを同時入力した衝突だけで、NFD単独受理を防がない。

**Fix:** raw pathの各segmentがNFCとbyte-for-byte一致しない場合はfilesystem open前に
`source-path-noncanonical` で拒否する。`source_inventory_from_bytes` と `read_source_inventory` の両public seamで
NFD単独、NFC/NFD alias、persisted-state reuseの回帰を追加する。

### CR-04: Drift classifier / lifecycle gate が malformed structured getter と outer Result 例外を漏出する

**Classification:** BLOCKER
**Reassessment:** modified
**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py:242-310,358-400`; `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py:731-771,782-844,1363-1414`

**Issue:** `_is_complete_observation` とclassifier comparisonにordinary Exception境界がない。well-typed dataclass
subclassのartifact `path` getterが`RuntimeError`を送出するとpublic classifierがUNKNOWNでなくraiseする。
さらにouter `expected/observed` がFailure/Success以外なら `.value` で`AttributeError`になる。gateはboundary method
呼出しだけをcatchし、返却Successのsource/phase/capability getter validation、classifier、projection、decision
identity生成をcatch外で実行するため、同じ入力がpublic gateまでcrashさせる。

**Reproduction:** `CanonicalArtifactObservation` subclassの`path` getterを`RuntimeError("boom")`にし、片側の
`Success(CanonicalSourceObservation)`へ入れると `classify_canonical_source_drift` がraiseする。
`classify_canonical_source_drift(object(), object())` も `AttributeError`。

**Cross-file impact:** `source_identity.validate_source_identity_state` がtotalでも、その前後のartifact/progress/
phase/capability projectionがtotalでない。identity-free UNKNOWN契約を迂回し、全5 lifecycle operationをDoSできる。

**Fix:** public classifier全体とgateのreturned-structure validation/classification/projectionをordinary `Exception`
境界へ入れ、`canonical-observation-incomplete` またはdimension-specific UNKNOWNへ正規化する。`BaseException` は
捕捉しない。outer Result、artifact、progress/task、phase graph/node、capability、mapping readinessの各getterを
expected/observed両sideとpublic gateで回帰する。

### CR-05: Supported persistence adapter の通常例外がtaxonomy/cleanupを迂回してstaging residueを残す

**Classification:** BLOCKER
**Reassessment:** new
**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py:1874-2032,2114-2325`; `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py:990-1103,1106-1360`

**Issue:** migration/refresh applyはinjected adapterをsupported subclassとして受理するが、effect methodsの大半は
`OSError`/`ManifestSizeLimitExceeded` だけをcatchする。adapterが通常の`RuntimeError`を送出するとstructured
failureを返さずraiseする。特に`write_bytes_at` が実write後にraiseするadapterではcleanup pathに入らず、targetは
旧bytesのままだが `.handoff.*.tmp` が残った。replace後ならeffect成否のstructured evidenceも失う。

**Reproduction:** `write_bytes_at` で `super().write_bytes_at(...)` 後に`RuntimeError("after-write")`を送出する
valid migration/refresh adapterをapproved applyへ渡す。両方ともRuntimeErrorが漏れ、各change directoryにstaging
fileが1個残る。`create_staging_at` の単純RuntimeErrorもraw raiseする。

**Cross-file impact:** migration/refreshでtaxonomy、cleanup、target-state proofが非対称かつ不完全になる。
callerはResult unionだけでfailure recoveryできず、後続resume/cleanupが未登録residueを扱うことになる。

**Fix:** 各adapter callをordinary `Exception` failure boundaryで囲み、staging作成後は一つのfinally/owned-staging
cleanup pathを必ず通す。replace前はtarget preservationを再観測し、replace後はfresh canonical proofを試みて
UNKNOWNとして返す。`BaseException` はcleanup finally後に再raiseする。create/write/reread/validate/replace/lock/
release/close各点のRuntimeError fault matrixとresidue/target invariantsを両writerへ追加する。

### CR-06: Accepted Sequence の列挙途中例外がpublic source/preview seamから漏出する

**Classification:** BLOCKER
**Reassessment:** new
**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py:611-672,675-772,1158-1239,1258-1422`; `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py:1584-1645`; `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py:628-647`

**Issue:** public APIsは`isinstance(value, Sequence)`をruntime contractとして受理する一方、`len`、truth test、
`tuple(...)`、generator/list comprehension、`all/any` の途中で起きるordinary Exceptionをtotalizeしない。
`source_inventory_from_bytes` / `read_source_inventory` / `reconcile_source_items`、migration preview、refresh previewの
いずれもcustom Sequenceの`RuntimeError`をraw raiseした。refreshのlimited catchも
`AttributeError, TypeError, UnicodeError`だけでRuntimeErrorを漏らす。

**Reproduction:** `Sequence` subclassを、`len==1`だが最初の`__getitem__`で
`RuntimeError("iteration-boom")`を送出するようにし、各public seamのsource files/paths、artifacts、
explicit matchesへ渡す。5系統すべてでraw RuntimeError。

**Cross-file impact:** migration/refreshがsource_identityへ渡す前のfreezeでcrashするため、下流validatorの
structured failureは到達不能。I/O前だけでなく、一部snapshot読取り後にも起こり得てwhole-operation failure契約を破る。

**Fix:** public入口でcollection freeze/shape validationを一つのordinary `Exception` boundary内に置き、str/bytes
除外、count/member/aggregate limitsを検査してからI/Oへ進む。iteration途中failureを各既存input-invalid taxonomyへ
写像し、`BaseException` propagationを別testで固定する。

### CR-07: 複数のpublic Result/decision APIがmalformed root/scalar/outer wrapperの通常例外を漏出する

**Classification:** BLOCKER
**Reassessment:** new
**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/execution_mapping.py:649-668,1153-1183`; `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py:88-102,358-371`; `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py:646-674,1363-1389`; `src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py:675-810`

**Issue:** runtime validationを持つpublic Result/decision APIでも、型確認前のmethod/field accessを限定catchで囲むため
ordinary Exception totalityが一貫しない。確認した例は、`read_planning_inventory(object(), ...)`、
`validate_mapping_readiness(object(), ...)`、`observe_lifecycle_operation(object(), ...)`、
`gate_lifecycle_operation(object(), ...)` の `.resolve` AttributeError、
`normalize_tasks_specification(object())` の `.splitlines` AttributeError、
`fingerprint_source_observation(object(), ...)` の`.category` AttributeErrorである。migration/refresh root/pathにも
同型の未検証method accessがある。

**Reproduction:** 上記public APIへannotation外のarbitrary objectを1個ずつ渡す。いずれもFailure/UNKNOWNでなく
raw AttributeError。対照として`validate_source_identity_state`はordinary Exceptionをstructured Failureにする。

**Cross-file impact:** callerは「全failureをResult/decisionで扱う」というbridge全体の方針を利用できない。
gate wrapperもobserveのraw exceptionをcontainしないため、public admission seamまで例外が貫通する。

**Fix:** 各public入口でroot/path/text/result wrapperのruntime shapeをdereference前に検査し、残るordinary
Exceptionを既存input-invalid/UNKNOWN taxonomyへ正規化する。全public Result/decision symbolについてarbitrary
object、throwing getter、throwing methodの表形式回帰を追加し、`BaseException`は伝播することを同じmatrixで確認する。

## Warnings

### WR-01: Migration preview/apply がunsupported collection/operations入力をstructured failureにしない

**Classification:** WARNING
**Reassessment:** confirmed
**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py:1584-1645,2114-2152`

**Issue:** `current_artifacts`、`source_paths`、`explicit_matches`をvalidation前に`tuple(...)`化し、`None`でraw
`TypeError`を出す。supplied `operations` のruntime typeを検証せず、previewの`object()`はraw`AttributeError`。
applyはmalformed previewなら偶然先に`migration-preview-invalid`となるが、valid previewとwrong adapterの組合せでは
adapter dereferenceへ進む。refreshがoperations typeを検証するのにmigrationは非対称である。

**Reproduction:** `preview_manifest_migration(... current_artifacts=None/source_paths=None/explicit_matches=None)` と
`operations=object()`。前者はTypeError、後者はAttributeError。

**Cross-file impact:** migrationだけcaller-side try/exceptが必要で、refreshとの共通 orchestrationを分岐させる。
CR-05はsupported adapter実行中failure、CR-06はaccepted Sequence iteration failureであり、本件はunsupported
runtime typeの入口validation/taxonomy欠落として分離する。

**Fix:** filesystem work前にnon-string Sequence、member、limits、operations adapterを明示検証し、
`migration-input-invalid` / `migration-operations-invalid` 相当の一貫したFailureへ写像する。preview/applyで同じ
adapter admission helperを使い、mutation count 0を回帰する。

## Verification Performed

- `uv run pytest tests/test_handoff_execution_mapping.py tests/test_handoff_identity.py tests/test_handoff_lifecycle_drift.py tests/test_handoff_lifecycle_gate.py tests/test_handoff_manifest_refresh.py tests/test_handoff_migration.py -q --no-cov` — **646 passed in 41.77s**。
- refresh post-replace canonical parent rebind probe — `Success`, canonical candidate false, detached candidate true。
- generic refresh Phase 07 probe — `Failure refresh-mapping-phase-unknown`。
- NFD read/persist/reuse probe — `Success`, persisted path absent, second read `source-path-unreadable`。
- artifact getter classifier probe — `RuntimeError("boom")` がpublic classifierから漏出。
- malformed public API matrix — source/mapping/drift/gate/migrationで `AttributeError` / `TypeError` / `RuntimeError` 漏出。
- migration/refresh accepted Sequence mid-iteration probe —両previewとsource readersでraw RuntimeError。
- migration/refresh adapter after-write probe —両applyでraw RuntimeError、target preserved、staging residue各1。
- `git diff --check 1512a29c..HEAD -- <15-file scope>` —差分エラーなし。

## Not Verified

- 実際にbuild/installしたwheelからのrefresh applyは、REVIEW以外の生成物禁止に従い未実行。`pyproject.toml` の
  src-only wheel設定とproductionの`tests/fixtures` path参照を静的に照合した。
- optional real OpenSpec/GSD host smokeは未実行。今回の8件はisolated public seamで再現可能で、外部tool結果を
  判定根拠にしていない。
- `task check` 全体はreview-only作業のため未実行。対象646 testsと`git diff --check`を実行した。

---

_Reviewed: 2026-08-08T12:51:18Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
