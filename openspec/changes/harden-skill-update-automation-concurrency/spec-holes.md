# Spec Holes: harden-skill-update-automation-concurrency

各要件へ固定12分類を適用した。判断3（利用者確認）は0件。未解決判断なし。

## Requirement 1: explicit lease CAS

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | createのexpected値が空 | 1: 空expectだけをabsence CASと定義 |
| 2 | 境界値 | 該当 | absent / first append / delete境界 | 1: create、append、deleteを別scenario化 |
| 3 | 重複・衝突 | 該当 | pre-read後のconcurrent ref mutation | 1: mutation時lease不一致でwrite拒否 |
| 4 | 順序 | 該当 | readとpush順序 | 1: fresh read後もpush自体がCAS必須 |
| 5 | 型・形式不正 | 該当 | ref / SHA / lease形式不正 | 1: exact refと40桁SHA以外をpush前拒否 |
| 6 | エラー経路 | 該当 | push reject後の状態不明 | 1: read-only再取得し、推測retry禁止 |
| 7 | 冪等性・再実行 | 該当 |同じcreate / append / delete再実行 | 1:同じleaseが成立しない限り拒否 |
| 8 | 時刻・タイムゾーン | 非該当 | ref CASは時刻を契約に使わない | 2: 時刻判定をスコープ外化 |
| 9 | 文字列 | 該当 |不正Unicode / 空白ref | 1:既存exact managed ref parserで拒否 |
| 10 | 数値 | 非該当 | 浮動小数、NaN、infを入力に持たない | 2:数値演算をスコープ外化 |
| 11 | 巨大入力・リソース枯渇 | 該当 | command output / stderr肥大 | 1:既存runner上限とnonzero分類を維持 |
| 12 | 状態遷移の未定義パス | 該当 | beforeが期待stateと異なる | 1: mutation 0件でconflict stop |

## Requirement 2: independent cleanup

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | cleanup candidate 0件 | 1:成功no-opとして扱う |
| 2 | 境界値 | 該当 |0 / 1 / 複数merged branches | 1:全件paginated、各ref独立guard |
| 3 | 重複・衝突 | 該当 |同じbranchを重複発見 | 1:identity conflictでdelete 0件 |
| 4 | 順序 | 該当 |publishとcleanup job順 | 1:candidate publishから独立しfresh historyを正とする |
| 5 | 型・形式不正 | 該当 |unknown artifact-kind | 1:job skipではなくfail closed |
| 6 | エラー経路 | 該当 |一branch cleanup failure | 1:他refへ拡大せずfailure journal記録 |
| 7 | 冪等性・再実行 | 該当 |no-op runで再試行 | 1:absenceはclean、present exact SHAだけ再delete |
| 8 | 時刻・タイムゾーン | 非該当 |cleanup eligibilityは時刻非依存 | 2:age-based cleanupを禁止 |
| 9 | 文字列 | 該当 |malformed branch generation | 1:strict identity外はdelete禁止 |
| 10 | 数値 | 該当 |generation / PR number境界 | 1:既存positive safe integer parser適用 |
| 11 | 巨大入力・リソース枯渇 | 該当 |PR history pagination肥大 | 1:full pagination必須、partialでdelete禁止 |
| 12 | 状態遷移の未定義パス | 該当 |unmerged / closed-unmerged / open | 1:merged strict PRだけeligible |

## Requirement 3: immutable root and journal v2

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 |comment 0件、null body、create応答消失後のcommentless root | 1:rootへcanonical full initial snapshotを埋め込み、author一致・`lastEditedAt === null`・fresh live exact一致時だけinitial commentを回復。null root拒否 |
| 2 | 境界値 | 該当 |sequence 1、MAX_SAFE_INTEGER | 1:positive safe integer範囲、初回previousDigest null |
| 3 | 重複・衝突 | 該当 |duplicate sequence / operation / marker | 1:resource write fail closed |
| 4 | 順序 | 該当 |API order、out-of-order IDs | 1:全pagination後comment ID昇順、sequence chain照合 |
| 5 | 型・形式不正 | 該当 |unknown field、noncanonical JSON、v1 | 1:exact codec拒否、v1 migrationなし |
| 6 | エラー経路 | 該当 |partial comment response / parse failure / initial append応答消失 | 1:append再送禁止。fresh complete readにexpected entryがexact 1件だけなら回復、それ以外はwrite 0件 |
| 7 | 冪等性・再実行 | 該当 |同じsnapshotの再append | 1:stable operation IDとsequenceでduplicate拒否 |
| 8 | 時刻・タイムゾーン | 該当 |edited comment / body detection | 1:commentは`created_at === updated_at` exact UTC文字列、commentless rootはresource `lastEditedAt === null`を要求 |
| 9 | 文字列 | 該当 |Unicode、HTML marker injection、空白 | 1:schema-order canonical escapingとsingle markerを要求 |
| 10 | 数値 | 該当 |numeric user ID / comment ID overflow | 1:IDはpositive ASCII decimal string、sequenceはsafe integer |
| 11 | 巨大入力・リソース枯渇 | 該当 |大量comments / oversized snapshot | 1:full paginationと既存response上限、上限超過はfail closed |
| 12 | 状態遷移の未定義パス | 該当 |中間missing / fork / foreign author / body edit / initial snapshot不一致 / terminal truncation | 1:root snapshot digest、resource author、body edit証拠、fresh live stateを照合。検出可能な不整合は全resource mutation禁止。証拠が全消失したstate-only末尾suffixは検出保証外と明記 |

## Requirement 4: prepared / mutation / committed

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 |preparedなし / committedなし | 1:通常開始とrecoveryを明示 |
| 2 | 境界値 | 該当 |最初のoperation、末尾prepared | 1:sequence 1とsingle pendingだけ許可 |
| 3 | 重複・衝突 | 該当 |同operation IDのprepared重複 | 1:fail closed、追加mutationなし |
| 4 | 順序 | 該当 |committed先行、別operation割込み | 1:prepared→mutation→committed以外拒否 |
| 5 | 型・形式不正 | 該当 |operationとsnapshot kind不一致 | 1:tagged union exact codecで拒否 |
| 6 | エラー経路 | 該当 |mutation成功後committed append失敗、またはPR head projectionだけbeforeを返す | 1:exact mixed projectionは有界read-only再取得し、after snapshot一致時だけcommitted-only recovery |
| 7 | 冪等性・再実行 | 該当 |before状態、after状態、branch after / PR beforeの一時状態で再開 | 1:beforeはexact retry、afterはcommitのみ、mixed projectionでは追加mutationせず再取得 |
| 8 | 時刻・タイムゾーン | 該当 |host projection収束時間が不定 | 1:経過時間から成功を推測せず、有界read終了時のexact stateだけで判定 |
| 9 | 文字列 | 該当 |operation ID表現差 | 1:canonical digestだけ許可 |
| 10 | 数値 | 該当 |sequence overflow | 1:safe integer上限到達時stop |
| 11 | 巨大入力・リソース枯渇 | 該当 |full snapshot肥大 | 1:canonical codec / response上限超過でwrite禁止 |
| 12 | 状態遷移の未定義パス | 該当 |live stateがbefore / after以外、複数projectionが一時的にbefore / afterへ分裂、または前phaseでbranch after観測後に後phaseでbefore / missingへ回帰 | 1:exact mixed projectionだけread-only再取得。branch after観測証拠を同一recovery実行の全phaseで保持し、回帰・未収束・別stateはrecovery-required、追加mutation 0件 |

## Requirement 5: closed issue terminal

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 |managed issue 0件 | 1:new failure時new root作成 |
| 2 | 境界値 | 該当 |0 / 1 / 複数open roots | 1:0=create、1=append、複数=conflict |
| 3 | 重複・衝突 | 該当 |同failure重複 | 1:stable entry keyでopen root内dedupe |
| 4 | 順序 | 該当 |closeとfailure detection競合 | 1:append直前fresh state closedならnew issue、reopen禁止。read後closeはconditional comment API不在により検出保証外 |
| 5 | 型・形式不正 | 該当 |partial root / journal | 1:issue writeだけfail closed |
| 6 | エラー経路 | 該当 |new issue create後initial journal失敗または応答消失 | 1:immutable rootから回復条件を検証し、append再送せずfresh journal exact 1件だけを受理。body更新禁止 |
| 7 | 冪等性・再実行 | 該当 |create response消失後retry | 1:fresh discoveryでstrict open rootを再利用。ただしauthor一致、`lastEditedAt === null`、embedded initial snapshotとlive exact一致を必須化 |
| 8 | 時刻・タイムゾーン | 非該当 |issue選択は更新時刻非依存 | 2:latest-by-time推測を禁止 |
| 9 | 文字列 | 該当 |title collision / marker mimic | 1:root marker exact identity必須 |
| 10 | 数値 | 該当 |issue number / creator ID境界 | 1:positive numeric validation |
| 11 | 巨大入力・リソース枯渇 | 該当 |issue / comment pagination | 1:full pagination、partialでwrite禁止 |
| 12 | 状態遷移の未定義パス | 該当 |closed rootへのappend / reopen | 1:常に禁止、新issue作成 |

## Requirement 6: fresh smoke and approval

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 |empty repo、approval空 | 1:managed resource 0件必須、approval空はwrite 0件 |
| 2 | 境界値 | 該当 |approval直前 / 直後state変化 | 1:preview digest束縛＋各write前live precondition |
| 3 | 重複・衝突 | 該当 |既存v1 / v2 resource | 1:fresh precondition違反でpreview停止 |
| 4 | 順序 | 該当 |preview / approval / write順 | 1:同process exact順以外write seam未到達 |
| 5 | 型・形式不正 | 該当 |digest / repository ID / creator ID不正 | 1:preview decoderで拒否 |
| 6 | エラー経路 | 該当 |途中write failure、PR close後にterminal prepared journalがaggregate cleanup discoveryと衝突 | 1:residual identity / journal digest / exact SHAを束縛したterminal-only recovery previewとfresh approvalを要求。terminal pathはaggregate discoveryを使わず単一branchをexact lease delete |
| 7 | 冪等性・再実行 | 該当 |承認済みplan replay | 1:process-scoped single-use approval、live state不一致拒否 |
| 8 | 時刻・タイムゾーン | 該当 |stale preview | 1:source/run/live digest一致を要求、時刻だけでvalid化しない |
| 9 | 文字列 | 該当 |approval whitespace / Unicode | 1:exact ASCII digest入力だけ許可 |
| 10 | 数値 | 該当 |run attempt / ID境界 | 1:positive safe integer / decimal parser適用 |
| 11 | 巨大入力・リソース枯渇 | 該当 |preview plan肥大 / API timeout | 1:closed step set、timeout時write停止 |
| 12 | 状態遷移の未定義パス | 該当 |merge checkpoint未完了、merge後再開、auto-delete、terminal cleanup未達、closed terminal-prepared PRとresidual branch | 1:人手mergeをfresh検証。merge後はsource relationを束縛。auto-deleteはfail closed。別recovery preview＋fresh approval。各terminal write前にbody / journal / state / SHAを再検証 |

## Requirement 7: cross-run transitional recovery

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 |commentless journal、origin artifact欠落 | 1:strict commentlessだけroot recovery。artifact欠落はwrite 0件 |
| 2 | 境界値 | 該当 |run N / N+1、retention 1 / 30 / 31日 | 1:異なるrun identityを必須test化。30日保持、失効後fail closed |
| 3 | 重複・衝突 | 該当 |複数recoverable PR / artifact、同operation再実行 | 1:recoverableはexact 1件だけ。fresh committed確認でduplicate write禁止 |
| 4 | 順序 | 該当 |detect、artifact取得、fresh PR / branch / complete journal read、mutation、validation順 | 1:専用jobのexact順だけ許可。detectのlive projectionをwrite根拠にせず、comment append直前に共通validatorを実行 |
| 5 | 型・形式不正 | 該当 |recovery mode、descriptor、origin manifest不正 | 1:single top-level kind＋5 modeのstrict canonical parser、unknown field拒否 |
| 6 | エラー経路 | 該当 |artifact download失敗、final read後race、mutation / append応答消失、validation中断 | 1:final readで観測した差分はwrite 0件。conditional comment write不在のread後raceはpost-stateで検出し、blind resend禁止 |
| 7 | 冪等性・再実行 | 該当 |N+1も同じcheckpointで停止、stale validation再実行 | 1:root / prepared recoveryは既存operation IDで収束。stable stale validationはmutation 0件 |
| 8 | 時刻・タイムゾーン | 該当 |artifact retention、projection lag | 1:retentionは30日。成功判定は時刻でなくfresh exact state、有界readだけ |
| 9 | 文字列 | 該当 |artifact名へのremote文字列注入 | 1:検証済みdecimal run ID / positive attemptから定数形式で構築 |
| 10 | 数値 | 該当 |run ID / attempt / PR番号境界 | 1:既存decimal / positive safe integer parserで拒否 |
| 11 | 巨大入力・リソース枯渇 | 該当 |100 MiB artifact、download timeout、journal pagination | 1:既存artifact size / digest検証、complete pagination必須、不完全read / timeout時write 0件 |
| 12 | 状態遷移の未定義パス | 該当 |closed / merged、draft / title / repository ID / ref / PR head / branch / creator / body / root / journal divergence、unsupported prepared、pr-ready validation非passed、cleanup競合 | 1:final validatorのfull predicate matrix、5 mode whitelist、pr-ready passed必須、recovery run cleanup除外 |

## Requirement 8: ready recovery tracking reconciliation

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 |tracking issueなし、対象entryなし、current cleanup failureあり | 1:対象entryもobservationもなければ成功no-op。cleanup observationがあれば新issue createを正常完了として扱う |
| 2 | 境界値 | 該当 |対象entry 0 / 1 / 2件、issue 0 / 1 / 複数root | 1:exact candidate scopeの2 keyだけ処理。identity cardinality不正はwrite禁止 |
| 3 | 重複・衝突 | 該当 |同entry重複、別candidate entry、同時issue更新 | 1:既存journal reducerとstable keyでdedupeし、別scopeを保持 |
| 4 | 順序 | 該当 |pr-ready committed、fresh ready / passed検証、commentless issue root回復、fresh rediscovery、issue resolve順、rediscoveryのstale回帰 | 1:`publish-finalize`のreconciliation-only seamでexact順を固定。root initial snapshotとdesired resolved snapshotを別entryにし、root確認後の`recover-root`再観測はwrite 0で停止する。`recover`はissueを書かない |
| 5 | 型・形式不正 | 該当 |recovery descriptor、PR root / journal、issue root / journal不正 | 1:各exact codec / reducerで拒否し、issue write 0件 |
| 6 | エラー経路 | 該当 |permission denial、partial read、append応答消失 | 1:workflowを失敗させ、post-stateをfresh確認。blind resend禁止 |
| 7 | 冪等性・再実行 | 該当 |ready-recovered同run失敗、Issue create / commentless root回復後の中断、stale rediscovery、後続no-op retry | 1:stable ready / passed状態から同candidate keyを再計算。`created` / `recovered` / `updated`を正常化し、root continuation budget消費後はroot entryを再送しない。fresh rediscovery後の解消済みentryはno-op |
| 8 | 時刻・タイムゾーン | 非該当 |reconciliation eligibilityは経過時間を使わない | 2:fresh exact stateだけを根拠にする |
| 9 | 文字列 | 該当 |candidate digest / scope / failure key表現差 | 1:canonical digestと列挙済み2 keyだけ許可 |
| 10 | 数値 | 該当 |PR / Issue / operation ID境界 | 1:既存positive integer / digest parserを使用 |
| 11 | 巨大入力・リソース枯渇 | 該当 |PR / Issue comment pagination、artifact size | 1:complete paginationと既存artifact上限を必須化 |
| 12 | 状態遷移の未定義パス | 該当 |PRはreadyだがvalidation非passed、branch / root不一致、permission / cleanup / updater entry混在、Issue absent / commentless / journal済み | 1:readyかつpassedのexact candidateだけ処理し、Issue lifecycle全variantで対象外entryを保持 |

## Requirement 9: exact write-job permission documentation

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 |permission section / marker欠落 | 1:repository contractを失敗させる |
| 2 | 境界値 | 該当 |write jobが3 / 4 / 5件 | 1:exact 4件だけgreen |
| 3 | 重複・衝突 | 該当 |同job重複、文書とworkflow差分 | 1:`expectedPermissions`をcanonical sourceとしてexact比較 |
| 4 | 順序 | 非該当 |permission意味は文書列挙順に依存しない | 2:job名とpermission setで比較 |
| 5 | 型・形式不正 | 該当 |unknown job / permission / access level | 1:bounded sectionまたはexact marker parserで拒否 |
| 6 | エラー経路 | 該当 |文書parse不能 | 1:contract failure。推測fallback禁止 |
| 7 | 冪等性・再実行 | 該当 |同じ文書 / workflow再検証 | 1:決定論的exact result |
| 8 | 時刻・タイムゾーン | 非該当 |permission契約は時刻非依存 | 2:時刻を入力にしない |
| 9 | 文字列 | 該当 |job名、permission名、access表記差 | 1:canonical literalを要求 |
| 10 | 数値 | 非該当 |permission契約に数値入力なし | 2:数値を使わない |
| 11 | 巨大入力・リソース枯渇 | 該当 |文書 / YAML肥大 | 1:対象bounded sectionだけをparseし、重複を拒否 |
| 12 | 状態遷移の未定義パス | 該当 |recoverへissues write追加、write job追加、文書のみ更新 | 1:workflowと文書を同じexact contractで失敗させる |

## Phase 2: validation mapping

| 穴 | 検証形態 | テスト予定 | 備考 |
| --- | --- | --- | --- |
| branch absence / exact SHA race | 例示 integration test | `publish/production-adapter.test.ts` | bare remote command seam |
| cleanup artifact kind / retry / pagination | 例示 contract test | `workflow/cleanup.test.ts`, `publish/workflow.test.ts` | YAML public seam |
| journal canonical / tamper / detectable missing / fork / foreign author | 例示＋roundtrip | `model/journal.test.ts` | pure codec / reducer。state-only terminal truncationは検出保証外 |
| journal ID / sequence boundaries | 例示 boundary test | `model/journal.test.ts` | safe integer / decimal ID |
| prepared before / after / divergent recovery | 例示 state-machine test | `publish/draft.test.ts`, `finalize/finalize.test.ts` | mutation adapter seam |
| post-mutation GitHub projection lag | 例示 integration test | `smoke/fresh-v2.test.ts`, `publish/draft.test.ts` | public transition seam。fake adapterがPR headだけを有界回数stale返却 |
| cross-phase branch regression | 例示 integration test | `publish/draft.test.ts` | public `publishDraft` recovery seam。`C/C → B/B → C/C`、mutation 0、committed 0 |
| commentless PR / Issue root | security matrix integration test | `publish/draft.test.ts`, `finalize/finalize.test.ts`, `publish/production-adapter.test.ts` | author / `lastEditedAt` / embedded snapshot / live state / append response loss |
| closed issue / duplicate failure / cardinality | 例示 reducer test | `github/issue-reducer.test.ts` | no reopen assertion |
| fresh smoke / stale approval / replay / terminal cleanup | 例示 integration test | `smoke/command.test.ts`, `smoke/production-host.test.ts` | fake host |
| closed terminal-prepared residual cleanup | 例示 integration test | `smoke/fresh-v2.test.ts` | public smoke recovery seam。preview-bound exact deleteだけ実行 |
| cross-run commentless / prepared / stale validation | public command lifecycle test | `recovery/lifecycle.test.ts` | Run NとN+1で異なるID / attempt。recovery後current-run validation artifactを確認 |
| cross-run artifact / identity / live failure matrix | security matrix integration test | `recovery/lifecycle.test.ts` | missing / modified artifact、fork / foreign / edit / digest、multiple候補、divergent時unexpected write 0件 |
| recovery workflow routing / permissions / retention | 静的 contract test | `publish/workflow.test.ts`, `finalize/workflow.test.ts` | recovery job、30日、cleanup除外、`issues: write`不在 |
| commentless final pre-write predicate race matrix | security matrix integration test | `publish/draft.test.ts`, `recovery/lifecycle.test.ts` | initial discovery後に各PR / branch / root / journal predicateを変化させ、initial journal append 0件を確認 |
| ready-recovered issue reconciliation / later no-op retry | public lifecycle / workflow test | `recovery/lifecycle.test.ts`, `finalize/finalize.test.ts`, `finalize/workflow.test.ts` | 同candidateの2 failure keyだけ解消。permission / partial read / identity conflictはworkflow red、対象外entry保持 |
| ready reconciliation Issue lifecycle | public reconciliation / journal test | `finalize/finalize.test.ts` | Issue absent＋cleanup failureはcreate成功。commentless rootはinitial entry回復→fresh rediscovery→stale failure解消。retryで重複なし |
| ready reconciliation stale rediscovery | public reconciliation race test | `finalize/finalize.test.ts` | root entry post-state確認後の2回目discoveryだけcommentlessへ回帰させ、root append 1件、resolution append 0件を確認 |
| exact four-write-job safety documentation | 静的 contract test | `repository-contracts.test.ts` | `expectedPermissions`、workflow、bounded safety sectionのexact一致 |
| real GitHub CAS / comment / cleanup behavior | real-host smoke | fresh smoke repository | fresh approval前は未検証 blocker |
| 時刻非依存契約 | 静的 contract test | focused model / workflow tests | age-based推測がないことを検査 |
| resource exhaustion / host timeout | 未検証 | — |外部host依存。上限超過fail-closedをoffline例示testで代替 |
