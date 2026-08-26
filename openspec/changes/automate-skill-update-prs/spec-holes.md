# automate-skill-update-prs 仕様穴監査

## 判定規則

各 requirement に固定12分類を順番に適用した。状態は次の三つで区別する。

- **解消済み:** requirement 本文または scenario に振る舞いを明記した。
- **仕様判断必要:** 利用者判断なしに確定できない。仕様確定時点では0件。
- **対象外:** 入力や状態が capability に存在しない、または明示的に scope 外とした。

潰し方は `1: 仕様へ明記`、`2: スコープ外を明記`、`3: 利用者確認` を表す。draft と validation の
permission topology は利用者確認により、`publish-draft` と `publish-finalize` の二つの write jobs、
その間の read-only validation として解消した。2026-08-20の利用者確認により、malformed PR は介入停止、
tracking entry key はscope tagged union、weekly scheduleは月曜03:17 UTCとして解消した。後続確認で、issue partial identity
は `issue-identity-conflict`、scope field は closed vocabulary / exact format、policy / license は `updater-rejected` として
解消した。2026-08-20の追加確認で、automation所有JSONは最小exact v1 schema、PRはsame-repository境界、成功後
postcondition failureは`candidate-invalid`、real-host smokeは同一対話のpreview digest承認、OpenSpec CLI不在時は
Markdown直接実行継続と別環境green evidenceとして解消した。
2026-08-20の追加確認で、default branch不一致のsame-repository candidateは`pr-identity-conflict`、smoke approvalは
immutable planの同一process実行、key別state chainとterminal cleanup、失敗後の別recovery previewとして解消した。
同日の後続確認で、real-host smokeは既存operator `gh auth`を使うworkflow外human CLI、present smoke stateはnormalized
value本体＋digest、validation infrastructure failureは`recovery-required`、`pr-identity-conflict`はsummary専用として解消した。
cycle 4確認で、production permission denialはoffline fake 403だけで検証し、smoke workflow runのhead SHAをsource commitへ
束縛するとして解消した。
cycle 5確認で、PR createはopen / draft / unmerged、issue createはopen、PR closeはunmerged維持として解消した。
追加review後の利用者確認で、candidateはpublish target / PR履歴digestとpost-publish receiptへ束縛し、PR conflictは
sorted set scope、未採番smoke resourceはsymbolic keyと閉じた遷移表、tracking issue複数openはissue-only停止として解消した。
2026-08-24のimplementation review後の利用者確認で、open PR branch appendのcross-resource副作用は`SmokePreview` v2の
multi-resource stepへ束縛し、required checkpointはlive normalized stateとproduction reducer判定から生成するとして解消した。
production permission denial evidenceはexact operationと`unchanged` / `applied` / `unknown`のclosed post-stateを保持し、
offline fake 403では`unchanged`とfallbackなしを決定論的に要求する。

## SKAUTO-1 weekly と manual trigger

| ID | # | 分類 | 判断 | 状態 | 穴の内容 | 潰し方 | 予定検証 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| H1-1 | 1 | 空・ゼロ長・None | 該当 | 解消済み | repository variable 未設定、input 欠落時の挙動 | 1: opt-out no-op、必須 input 欠落は usage failure | trigger fixture |
| H1-2 | 2 | 境界値 | 該当 | 解消済み | exact `true` と類似値、週次境界 | 1: exact string、毎週月曜03:17 UTC | exact-value / cron test |
| H1-3 | 3 | 重複・衝突 | 該当 | 解消済み | schedule と manual の同時 run | 1: repository 固定 concurrency group、write直列化 | concurrency fixture |
| H1-4 | 4 | 順序 | 該当 | 解消済み | opt-in / input 検証より先に checkout や write する危険 | 1: 最初の gate で検証 | job-order test |
| H1-5 | 5 | 型・形式不正 | 該当 | 解消済み | unknown key、string boolean、欠落 key | 1: key集合とboolean型を再検証 | malformed event test |
| H1-6 | 6 | エラー経路 | 該当 | 解消済み | gate evaluation / payload parse failure | 1: external write 前に usage failure | failure fixture |
| H1-7 | 7 | 冪等性・再実行 | 該当 | 解消済み | pending / rerun の重複 publish | 1: concurrency と downstream identity check | duplicate-run test |
| H1-8 | 8 | 時刻・タイムゾーン | 該当 | 解消済み | cron timezone、DST、日付境界 | 1: UTC固定、DST非依存 | cron literal test |
| H1-9 | 9 | 文字列 | 該当 | 解消済み | `TRUE`、空白付き `true`、Unicode類似文字 | 1: exact ASCII `true` 以外はopt-out | string matrix |
| H1-10 | 10 | 数値 | 非該当 | 対象外 | numeric input や計算値を持たない | 2: boolean inputだけ | schema testで不存在確認 |
| H1-11 | 11 | 巨大入力・リソース枯渇 | 該当 | 解消済み | payload肥大、run滞留 | 1: input一件、job timeout、concurrency | payload / timeout fixture |
| H1-12 | 12 | 状態遷移の未定義パス | 該当 | 解消済み | resume flag を非paused状態で使う | 1: usage failure | resume-state matrix |

## SKAUTO-2 updater consumer 境界

| ID | # | 分類 | 判断 | 状態 | 穴の内容 | 潰し方 | 予定検証 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| H2-1 | 1 | 空・ゼロ長・None | 該当 | 解消済み | remote cohort 0件、cohorts空、errors空 | 1: current updater no-opを保持しPRを作らない | no-op CLI test |
| H2-2 | 2 | 境界値 | 該当 | 解消済み | updater公開exit 0 / 1 / 3 とautomation seamの境界 | 1: updateはexit 0のreport状態、1は拒否、3専用routeは呼ばない | exit matrix |
| H2-3 | 3 | 重複・衝突 | 該当 | 解消済み | cohort重複やtarget衝突をautomationが再解釈する危険 | 1: updater failureをそのまま拒否 | conflict report fixture |
| H2-4 | 4 | 順序 | 該当 | 解消済み | dry-run前のapply、cohort順の再構成 | 1: dry-run後apply、canonical report順を保持 | command transcript test |
| H2-5 | 5 | 型・形式不正 | 該当 | 解消済み | unknown schema / field、malformed JSON | 1: schema v1をfail-closed decode | decoder test |
| H2-6 | 6 | エラー経路 | 該当 | 解消済み | partial cohort failure、transaction残存、managed外差分 | 1: exit 1 / failedはupdater-rejected、exit 0成功後postcondition不整合はcandidate-invalid | partial failure / precedence test |
| H2-7 | 7 | 冪等性・再実行 | 該当 | 解消済み | 同じapplyの再実行 | 1: no-content-change / no-opを保持 | repeated apply fixture |
| H2-8 | 8 | 時刻・タイムゾーン | 非該当 | 対象外 | updater report判定に時刻を使わない | 2: source / lock / commit identityだけを正とする | clock-free unit test |
| H2-9 | 9 | 文字列 | 該当 | 解消済み | error text解析による誤分類、Unicode cohort key | 1: textを解析せずJSON値として保持 | opaque-string test |
| H2-10 | 10 | 数値 | 該当 | 解消済み | automation seamのexit 0 / 1、schemaVersion、countの不正値 | 1: current command別enum / safe integer外を拒否 | numeric decoder test |
| H2-11 | 11 | 巨大入力・リソース枯渇 | 該当 | 解消済み | updater出力、全cohort candidateの肥大 | 1: updater limitに加え全upload file raw bytes合計100 MiB上限 | oversized report / bundle test |
| H2-12 | 12 | 状態遷移の未定義パス | 該当 | 解消済み | report成功とexit失敗、updater failureとpostcondition failureの同時観測 | 1: exit 1 / failedを優先してupdater-rejected | inconsistent report / precedence test |

## SKAUTO-3 permission 分離

| ID | # | 分類 | 判断 | 状態 | 穴の内容 | 潰し方 | 予定検証 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| H3-1 | 1 | 空・ゼロ長・None | 該当 | 解消済み | permissions省略時のdefault権限 | 1: workflow / jobで明示、未指定scopeはnone | YAML structural test |
| H3-2 | 2 | 境界値 | 該当 | 解消済み | readとwriteの最小境界 | 1: job別scopeを列挙 | exact permission matrix |
| H3-3 | 3 | 重複・衝突 | 該当 | 解消済み | workflow-levelとjob-level permission競合 | 1: job-level expected setを正とする | merged YAML permission test |
| H3-4 | 4 | 順序 | 該当 | 解消済み | draft / validation / finalize の順序 | 1: detect→publish-draft→validate→publish-finalize | needs graph test |
| H3-5 | 5 | 型・形式不正 | 該当 | 解消済み | unknown permission、write-all、malformed YAML | 1: allowlistedscope / accessだけを受理 | YAML schema fixture |
| H3-6 | 6 | エラー経路 | 該当 | 解消済み | production default token permission拒否、operator credentialとの混同 | 1: permission-denied / fallback禁止はoffline fake 403限定、real smoke完了条件外 | fake 403 transcript |
| H3-7 | 7 | 冪等性・再実行 | 該当 | 解消済み | finalize再実行による重複state change | 1: exact head readyはno-op | repeated finalize test |
| H3-8 | 8 | 時刻・タイムゾーン | 非該当 | 対象外 | permission判定は時刻非依存 | 2: token lifetime管理はGitHub責務 | static contract |
| H3-9 | 9 | 文字列 | 該当 | 解消済み | permission名のtypo / case差 | 1: exact allowlist | spelling mutation test |
| H3-10 | 10 | 数値 | 非該当 | 対象外 | permissionに数値入力なし | 2: read / write / noneだけ | schema test |
| H3-11 | 11 | 巨大入力・リソース枯渇 | 該当 | 解消済み | privileged job長時間保持 | 1: publish job timeout | timeout presence test |
| H3-12 | 12 | 状態遷移の未定義パス | 該当 | 解消済み | validation中のwrite、PR / issue partial後のalways finalize、real smokeによる第三workflow write job混入 | 1: productionは二publish jobsだけ、smokeはworkflow外human CLI＋既存`gh auth` | forbidden write / smoke boundary test |

## SKAUTO-4 candidate artifact

| ID | # | 分類 | 判断 | 状態 | 穴の内容 | 潰し方 | 予定検証 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| H4-1 | 1 | 空・ゼロ長・None | 該当 | 解消済み | bundle / manifest / DraftReceipt / report欠落、PR履歴0件、空candidate | 1: candidate-invalid、空履歴digestとno-op targetを明示 | missing-file / empty-history fixtures |
| H4-2 | 2 | 境界値 | 該当 | 解消済み | candidate artifact 100 MiB exact / +1、DraftReceipt 48 KiB exact / +1、retention 1日 | 1: exact上限受理、超過拒否、別run再利用禁止 | size / retention boundary test |
| H4-3 | 3 | 重複・衝突 | 該当 | 解消済み | 同名artifact、repository / run / attempt混線、target / generation / PR履歴競合 | 1: exact publish target、history digest、post-publish DraftReceiptを再検証 | cross-run / stale-target fixture |
| H4-4 | 4 | 順序 | 該当 | 解消済み | PR history / member / schema key / file順、draft write前後snapshot混同 | 1: full pagination、PR number順、detect manifest→publish→DraftReceipt→finalize | canonical / lifecycle transcript |
| H4-5 | 5 | 型・形式不正 | 該当 | 解消済み | target mode field混在、history member / receipt不正、非canonical bytes、SHA / ID不正 | 1: exact v1 target / history / DraftReceipt union、decode後byte一致 | decoder mutation tests |
| H4-6 | 6 | エラー経路 | 該当 | 解消済み | upload/download中断、file集合 / digest / total不一致 | 1: candidate-invalid、bundle import / external writeなし | truncated artifact test |
| H4-7 | 7 | 冪等性・再実行 | 該当 | 解消済み | 同じcandidateを再download / republish、draft publish後に旧history digest再利用 | 1: publish前manifest、publish後receiptを分離しexact stateはno-op | rerun / receipt test |
| H4-8 | 8 | 時刻・タイムゾーン | 該当 | 解消済み | timestamp TZ、clock skew、retention判断 | 1: UTC timestampは表示用、承認identityはrun ID/digest | clock-skew test |
| H4-9 | 9 | 文字列 | 該当 | 解消済み | BOM、不正UTF-8、marker injection、Unicode / escape / whitespace差 | 1: schema-order UTF-8 bytes、HTML-sensitive escape、再encode完全一致 | injection / canonical fixtures |
| H4-10 | 10 | 数値 | 該当 | 解消済み | generation / size / schemaVersionの負数・overflow | 1: safe integerと範囲を検証 | numeric boundary test |
| H4-11 | 11 | 巨大入力・リソース枯渇 | 該当 | 解消済み | bundle / reports / manifest肥大、展開bomb、disk枯渇 | 1: 非圧縮全file合計100 MiB、import前再検証、timeout、cleanup | resource test |
| H4-12 | 12 | 状態遷移の未定義パス | 該当 | 解消済み | artifact validだがtarget / PR履歴 / branch / marker / default base変化、partial / conflictとの優先度 | 1: base不一致candidateもhistoryへ含め、fresh state reducerをgeneric staleより優先し、別target転用禁止 | stale-target / reducer precedence matrix |

## SKAUTO-5 draft-first managed PR

| ID | # | 分類 | 判断 | 状態 | 穴の内容 | 潰し方 | 予定検証 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| H5-1 | 1 | 空・ゼロ長・None | 該当 | 解消済み | managed PR 0件、branch欠落、body空 | 1: identity全不一致の0件は新generation、partial identityのmarker欠落・空bodyは介入停止 | zero-resource tests |
| H5-2 | 2 | 境界値 | 該当 | 解消済み | generation 1 / 999999 / overflow | 1: 6桁範囲、overflow停止 | generation boundary test |
| H5-3 | 3 | 重複・衝突 | 該当 | 解消済み | open managed PR複数、branch名衝突、cross-repository模倣PR、default branch不一致candidate | 1: same-repository candidateはbase refに関係なくidentity判定、base不一致は全write停止、forkはwarning | duplicate / base-ref / fork PR fixture |
| H5-4 | 4 | 順序 | 該当 | 解消済み | ready PRへpush後にdraft化するwindow | 1: 新commit push前にdraftへ戻す | operation-order transcript |
| H5-5 | 5 | 型・形式不正 | 該当 | 解消済み | malformed PrEnvelope、repository / ref / SHA / generation不一致、branch / title部分一致 | 1: exact v1 schema、cross-repo候補外、same-repo partial / base ref不一致は`pr-identity-conflict`でwrite / remote cleanup停止 | marker / repository / base-ref mutation test |
| H5-6 | 6 | エラー経路 | 該当 | 解消済み | push成功 / PR作成失敗、ready化失敗 | 1: remote再読込、一度だけ冪等再試行、unknown停止 | partial publish transcript |
| H5-7 | 7 | 冪等性・再実行 | 該当 | 解消済み | duplicate commit / PR / ready | 1: exact candidate/head/stateはno-op | rerun lifecycle test |
| H5-8 | 8 | 時刻・タイムゾーン | 非該当 | 対象外 | PR identityに時刻を使わない | 2: generation / SHAを使用 | deterministic identity test |
| H5-9 | 9 | 文字列 | 該当 | 解消済み | branch unsafe文字、title類似、marker injection | 1:固定ASCII branch/titleとescaped content | string mutation tests |
| H5-10 | 10 | 数値 | 該当 | 解消済み | PR number / generationのunsafe値 | 1: non-negative safe integer、generation範囲 | decoder test |
| H5-11 | 11 | 巨大入力・リソース枯渇 | 該当 | 解消済み | 過大PR body / cohort report | 1: managed summaryはbounded要約、full reportはartifact/run log | body limit fixture |
| H5-12 | 12 | 状態遷移の未定義パス | 該当 | 解消済み | ready→new update、draft→green、partial identity、default branch rename / retarget、strict identityのhuman head | 1: partial / base不一致は全external write / remote cleanup停止、human headはstrict issue記録だけ許可 | state reducer matrix |

## SKAUTO-6 closed-unmerged と既存 PR

| ID | # | 分類 | 判断 | 状態 | 穴の内容 | 潰し方 | 予定検証 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| H6-1 | 1 | 空・ゼロ長・None | 該当 | 解消済み | PR履歴0件、最新PRなし | 1:初回generationへ遷移 | initial-state test |
| H6-2 | 2 | 境界値 | 該当 | 解消済み | closed直後、generation最大、PR state変化直前 | 1:fresh recheckとgeneration上限 | boundary transcript |
| H6-3 | 3 | 重複・衝突 | 該当 | 解消済み | 同generation複数PR、generation一意の複数open、両方同時 | 1: generation-conflict優先、解消後open-pr-conflict、sorted pr set scope | history collision test |
| H6-4 | 4 | 順序 | 該当 | 解消済み | conflict優先、member順、latest選択、resume前fresh detection | 1: generation重複→複数open→最大generation、memberはgeneration→number順 | ordering test |
| H6-5 | 5 | 型・形式不正 | 該当 | 解消済み | unknown PR state、merged情報矛盾 | 1: fail-closed discovery error | malformed API fixture |
| H6-6 | 6 | エラー経路 | 該当 | 解消済み | state query失敗、resume中candidate失敗 | 1: writeなしでpaused / failed維持 | API failure test |
| H6-7 | 7 | 冪等性・再実行 | 該当 | 解消済み | resume重複、新generation二重作成 | 1: concurrencyとhistory recheckで一件だけ | duplicate resume test |
| H6-8 | 8 | 時刻・タイムゾーン | 非該当 | 対象外 | "latest"をclosed時刻で決めない | 2: unique generationだけを選択identityに使用 | time-independent order test |
| H6-9 | 9 | 文字列 | 該当 | 解消済み | state名 / marker文字列の類似 | 1: API enumとstrict marker | string enum test |
| H6-10 | 10 | 数値 | 該当 | 解消済み | generation / PR number overflow | 1: safe integerと範囲検証 | numeric test |
| H6-11 | 11 | 巨大入力・リソース枯渇 | 該当 | 解消済み | 長いPR履歴のpagination | 1: complete pagination、timeout、partial拒否 | paginated history test |
| H6-12 | 12 | 状態遷移の未定義パス | 該当 | 解消済み | generation-conflict→open-pr-conflict→latest、paused、manual false / true、merged | 1: conflict解消後の次stateと全許可遷移を固定 | exhaustive reducer test |

## SKAUTO-7 failure / recovery

| ID | # | 分類 | 判断 | 状態 | 穴の内容 | 潰し方 | 予定検証 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| H7-1 | 1 | 空・ゼロ長・None | 該当 | 解消済み | error detail欠落、post-state取得不能 | 1: operation名とunknown stateを最低情報にする | empty-error fixture |
| H7-2 | 2 | 境界値 | 該当 | 解消済み | retry 0 / 1 / 2回 | 1:証明可能時だけ一度、以後停止 | retry-count test |
| H7-3 | 3 | 重複・衝突 | 該当 | 解消済み | 複数failureが同時発生 | 1: recovery-requiredをreadyより優先、全detail保持 | precedence matrix |
| H7-4 | 4 | 順序 | 該当 | 解消済み | 失敗後にready / cleanupを続ける危険 | 1: post-state再読込後、unknownなら後続停止 | failure-order transcript |
| H7-5 | 5 | 型・形式不正 | 該当 | 解消済み | API error schema / HTTP response不正 | 1: operation failureとしてfail-closed | malformed response test |
| H7-6 | 6 | エラー経路 | 該当 | 解消済み | updater、push、PR、validation command / infrastructure、issue、cleanupの部分失敗 | 1: command failureはvalidation-failed、infrastructure / 完了済み旧pendingはrecovery-required | fault injection suite |
| H7-7 | 7 | 冪等性・再実行 | 該当 | 解消済み | 無制限retry、同じwriteの重複 | 1: expected state検証とone-retry | retry/idempotency test |
| H7-8 | 8 | 時刻・タイムゾーン | 非該当 | 対象外 | backoffや時刻で安全性を決めない | 2: identity / post-stateで決める | clock-free reducer test |
| H7-9 | 9 | 文字列 | 該当 | 解消済み | secretを含むerror、marker injection | 1: credential redact、JSON escape | redaction / injection test |
| H7-10 | 10 | 数値 | 該当 | 解消済み | HTTP code、retry count、PR numberの不正 | 1: enum / safe integer validation | numeric response test |
| H7-11 | 11 | 巨大入力・リソース枯渇 | 該当 | 解消済み | error storm、log / issue肥大 | 1: bounded summaryとfull run evidence分離 | truncation-with-digest test |
| H7-12 | 12 | 状態遷移の未定義パス | 該当 | 解消済み | expected-before / candidate-after以外、active / 完了済みpending、policy / license subtype | 1: active pendingは維持、完了済み旧pending / unknownはrecovery-required、updater reasonはupdater-rejected | unknown / pending-state test |

## SKAUTO-8 tracking issue dedupe

| ID | # | 分類 | 判断 | 状態 | 穴の内容 | 潰し方 | 予定検証 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| H8-1 | 1 | 空・ゼロ長・None | 該当 | 解消済み | issue 0件、outstanding 0件、body空、generation / PR / cohort不在 | 1:候補0件時だけ一件作成、空bodyのexact titleはpartial conflict、不在identityはstrict scope variantで表現 | zero-state tests |
| H8-2 | 2 | 境界値 | 該当 | 解消済み | open issue 0 / 1 / 2件 | 1: 0はreopen/create、1はupdate、2以上はissue-only停止 | cardinality test |
| H8-3 | 3 | 重複・衝突 | 該当 | 解消済み | duplicate / partial issue、PR single / set scope、stable key重複 | 1: issue conflictはissue-only停止、PR setはsorted全member、key再計算 | duplicate / set fixture |
| H8-4 | 4 | 順序 | 該当 | 解消済み | scope複数該当、closed issue選択、IssueEntry ordering | 1: candidate→resource→pr→cohort→global、最大issue number、key UTF-8昇順 | ordering test |
| H8-5 | 5 | 型・形式不正 | 該当 | 解消済み | malformed IssueEnvelope、pr set 0 / 1件・重複・未sort、summary専用stop state、state / scope field混在 | 1: exact v1 single / set scope、setは2件以上unique sorted、summary専用stateはIssueEntryで拒否 | malformed issue / scope fixture |
| H8-6 | 6 | エラー経路 | 該当 | 解消済み | reopen / update / create部分失敗 | 1:再読込、unknownはrecovery-required | issue fault transcript |
| H8-7 | 7 | 冪等性・再実行 | 該当 | 解消済み | 同failureの複数scope / duplicate row、別run / attempt / detail | 1: scope一意選択、metadata除外、first-seen保持、last-seen / detailだけ更新 | rerun dedupe test |
| H8-8 | 8 | 時刻・タイムゾーン | 該当 | 解消済み | last-seen時刻差、closed日時順 | 1:identityに時刻不使用、表示はUTC | clock-skew test |
| H8-9 | 9 | 文字列 | 該当 | 解消済み | title類似、Unicode、marker injection、人本文、operation / resource / digest類似 | 1: partial候補、escape、closed vocabulary、exact ref / digest format | string preservation test |
| H8-10 | 10 | 数値 | 該当 | 解消済み | issue / PR / generation number不正 | 1:positive safe integer、generation 1〜999999 | numeric fixture |
| H8-11 | 11 | 巨大入力・リソース枯渇 | 該当 | 解消済み | issue全履歴pagination、body肥大 | 1:complete pagination、bounded managed summary | pagination / size test |
| H8-12 | 12 | 状態遷移の未定義パス | 該当 | 解消済み | partial / cardinality conflict中のPR finalize、解消時close、closed issue再利用 | 1: issue operationだけ停止し安全PR継続、通常は自動closeなし / reopen一件 | issue / PR finalize matrix |

## SKAUTO-9 cleanup / idempotency

| ID | # | 分類 | 判断 | 状態 | 穴の内容 | 潰し方 | 予定検証 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| H9-1 | 1 | 空・ゼロ長・None | 該当 | 解消済み | cleanup対象0件、missing temp path | 1:0件no-op、明示対象だけ扱う | empty cleanup test |
| H9-2 | 2 | 境界値 | 該当 | 解消済み | merged / closed境界、exact head一致 / 不一致 | 1:全guard一致時だけremote delete | guard boundary test |
| H9-3 | 3 | 重複・衝突 | 該当 | 解消済み | 同path重複、branchを別open PRが参照 | 1: dedupe後、open参照あれば削除禁止 | reference collision test |
| H9-4 | 4 | 順序 | 該当 | 解消済み | evidence取得前の削除、cleanup後の検証漏れ | 1:guard→delete→absence検証 | cleanup transcript |
| H9-5 | 5 | 型・形式不正 | 該当 | 解消済み | unsafe path / ref、glob、unresolved variable | 1: fixed temp rootとvalidated exact refだけ | unsafe-target test |
| H9-6 | 6 | エラー経路 | 該当 | 解消済み | local / remote cleanup部分失敗 | 1: localはjob failure、remoteはcleanup-failed | fault injection test |
| H9-7 | 7 | 冪等性・再実行 | 該当 | 解消済み | 既に削除済み、同candidate再実行 | 1: absence / expected stateはno-op | repeated cleanup test |
| H9-8 | 8 | 時刻・タイムゾーン | 非該当 | 対象外 | ageだけでbranchを削除しない | 2:merged identityで判断 | time-independent guard test |
| H9-9 | 9 | 文字列 | 該当 | 解消済み | path separator、Unicode ref、shell injection | 1: 固定ASCII branchとargument array | injection test |
| H9-10 | 10 | 数値 | 該当 | 解消済み | generation / resource count overflow | 1: bounded safe integer | numeric guard test |
| H9-11 | 11 | 巨大入力・リソース枯渇 | 該当 | 解消済み | 大量temp resource、disk不足、cleanup timeout | 1: bounded roots、job timeout、残存検査 | resource cleanup test |
| H9-12 | 12 | 状態遷移の未定義パス | 該当 | 解消済み | closed-unmerged / human / unknown branch削除 | 1: 明示禁止しmanual recoveryへ | branch-state matrix |

## SKAUTO-10 validation / real-host smoke

| ID | # | 分類 | 判断 | 状態 | 穴の内容 | 潰し方 | 予定検証 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| H10-1 | 1 | 空・ゼロ長・None | 該当 | 解消済み | active change 0件、approvalなし、SmokePreview step / observation 0件、OpenSpec CLI不在 | 1: offline対象0許可、smoke previewはstepと各before / after observationをnon-empty、CLI不在でもMarkdown直接実行継続 | empty step / observation / approval / CLI test |
| H10-2 | 2 | 境界値 | 該当 | 解消済み | approval直前後、preview対象一致 / 一件差 | 1: 同じ対話・実行cycleのexact preview digestだけ有効 | approval identity test |
| H10-3 | 3 | 重複・衝突 | 該当 | 解消済み | symbolic key重複 / 再束縛、descriptor差替え、step内key重複、複数approval、planned create重複、value kind / digest不一致、run / source commit / mode混線、同sourceの別runによるbranch誤認 | 1: unique key、immutable descriptor、step内sorted unique observation、一度だけactual number束縛、create exactly-once、normalized value再計算、run head SHAとv3 mode一致、branch deleteは同run strict PR / issue相関を必須化 | symbolic / step / state / cross-run collision fixture |
| H10-4 | 4 | 順序 | 該当 | 解消済み | create前symbolic参照、resource別step間before / after chain、cross-resource副作用、write前preview / approval、normal / recovery cleanup順 | 1: normalはpreview→approval→create→bind→multi-resource step検証→terminal cleanup、recoveryはterminal方向だけ | runbook / operation order test |
| H10-5 | 5 | 型・形式不正 | 該当 | 解消済み | v3 mode、base / parent commit relation、resource key / locator、descriptor / normalized identity、operation / primary key / before-after observation組合せ、checkpoint / state / digest不正 | 1: exact normal / recovery schema、complete compare、kindに加えbranch ref、planned PR head / base、planned issue title、再計算digest、mode別閉遷移とcheckpointをwrite前検証 | malformed identity / preview / compare / matrix / checkpoint test |
| H10-6 | 6 | エラー経路 | 該当 | 解消済み | offline greenだがreal lifecycle smoke失敗、PR作成不能run、branch-only cleanup、partial write後の再開、write後のcross-resource observationが一時的にstale、production permission denial混入 | 1: normalはbaseからparentがaheadでない入力を拒否、所有証明できるresidualだけ別v3 recovery preview、branch-onlyはmanual preview、post-write state / number mismatchだけ500 ms間隔・最大10回read-only再取得してwriteは再試行しない、permission denialはoffline fake 403だけ | negative / recovery / branch-only / eventual-consistency fixture |
| H10-7 | 7 | 冪等性・再実行 | 該当 | 解消済み | 古いapproval再利用、create応答再束縛、同一process内の予定変化、別process replay、ambient credential再利用 | 1: immutable planを一processだけ実行し、`gh` child envは非credential allowlist、既存`gh auth`以外を保存せず、終了 / 失敗 / replayでapproval失効 | approval / binding / child-env test |
| H10-8 | 8 | 時刻・タイムゾーン | 該当 | 解消済み | freshの定義、timestamp TZ、時間だけによる失効 | 1: 同じ対話 / cycleとpreview identityで判断、timestampはUTC表示だけ | freshness test |
| H10-9 | 9 | 文字列 | 該当 | 解消済み | repository / branch類似、approval文面曖昧 | 1: owner/repo、exact refs、resource番号を列挙 | target string test |
| H10-10 | 10 | 数値 | 該当 | 解消済み | run / PR / issue number不正 | 1: safe integer / exact identity | numeric fixture |
| H10-11 | 11 | 巨大入力・リソース枯渇 | 該当 | 解消済み | full checks時間、smoke timeout、preview / resource大量生成 | 1: job timeout、SmokePreview raw UTF-8 48 KiB上限、non-empty target | timeout / size test |
| H10-12 | 12 | 状態遷移の未定義パス | 該当 | 解消済み | create直後closed / merged、close時merged化、merged PR reopen、opaque state、step外side effect、chain矛盾、cleanup欠落、operation名だけのcheckpoint、recoveryでcreate / update / ready / reopen、所有証明のないbranch delete、未承認write、途中失敗 | 1: normalは既存closed matrix、recoveryはdraft / close / deleteだけかつbranch deleteに同run strict resource相関、全side effectのstep観測、resource別chain / mode別semantic checkpoint / terminal cleanup以外拒否 | transition / coupled-effect / recovery / cross-run / checkpoint / completion matrix |

## 実装時検証対応表

実装時は次の public seam へ落とす。I/O と GitHub lifecycle は Hypothesis に向かないため、fake transcript と
example-based tests を使う。pure codec / reducer の canonical ordering と idempotency は property test の候補とする。

| 穴 | 検証形態 | テスト予定 | 備考 |
| --- | --- | --- | --- |
| H1-1〜H1-12 の該当行 | 例示テスト | workflow trigger / event fixtures | cron、allowlist、concurrency |
| H2-1〜H2-12 の該当行 | 例示テスト | public updater CLI transcript tests | updater内部実装は再テストしない |
| H3-1〜H3-12 の該当行 | 例示テスト | workflow permission / needs graph tests | YAMLをoffline解析 |
| H4-1〜H4-12 の該当行 | 例示＋property候補 | manifest codec / bundle integrity tests | canonical roundtrip、digest不変条件 |
| H5-1〜H5-12 の該当行 | 例示＋property候補 | PR state reducer / fake GitHub tests | idempotencyと許可遷移をproperty候補にする |
| H6-1〜H6-12 の該当行 | 例示テスト | PR history / pause-resume matrix | complete paginationを含む |
| H7-1〜H7-12 の該当行 | 例示テスト | fault injection / partial publish tests | external I/Oはfake transcript |
| H8-1〜H8-12 の該当行 | 例示＋property候補 | issue marker codec / dedupe tests | 人本文保存、stable key冪等性 |
| H9-1〜H9-12 の該当行 | 例示テスト | temp / branch cleanup guard tests | destructive targetはfake remoteだけで検証 |
| H10-1〜H10-12 の該当行 | 例示＋manual smoke | offline contract tests / approved real-host runbook | real writeはfresh approval後だけ |

## 監査結果

- 解消済み: 全ての該当行。
- 仕様判断必要: 0件。
- 対象外: 各表で明示した非該当行。数値・時刻など capability に存在しない分類も黙って省略していない。
- 実装時の未検証許容: real GitHub write lifecycle だけは local / fake test で代替せず、Task 11 の fresh approval
  付き smoke が完了するまで未検証・completion blocker とする。
