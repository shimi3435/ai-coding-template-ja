## Context

先行change `revise-openspec-gsd-execution-boundary` はOpenSpec / GSDの責務、route、手動handoff、
完了判定、close policyを定める。本changeはそのpolicyを再定義せず、手動handoffのMVP自動化だけを
実装する。

ローカルOpenSpec CLI 1.3.1の`openspec instructions apply --change <id> --json`は
`contextFiles`、`progress`、`tasks`を返すがartifact本文を返さない。JSONはpath discoveryと進捗
メタデータに限定し、canonical contentは常にMarkdown filesから読む必要がある。

前版はstable ID、詳細mapping、全操作前drift、multi-manifest ownership、finalizeまで一changeに
含めていた。独立出荷可能性を再評価し、本changeをdiscovery / read / progress / minimal manifest /
preflight / handoff開始へ縮小する。高度なlifecycleは`harden-openspec-gsd-handoff-lifecycle`へ移す。

## Status

**Contracts fixed / implementation gate pending.** 対応tool契約はfixturesへ固定済み。OpenSpecのstrict
validate、`spec-holes` Phase 1再確認、利用者承認までproduction codeを実装しない。

## Goals / Non-Goals

**Goals:**

- CLI JSONとMarkdown fallbackを共通readerへ収束させ、canonical artifactsを正確に読む。
- `tasks.md`から決定論的な進捗を算出する。
- cross-session resumeに必要な最小manifestを原子的かつ追跡可能に保存する。
- 先行policyの準備条件とMVP capabilityを検査し、承認後にGSD handoffを開始する。
- GSD不在の通常CIと実toolsを使うopt-in smokeを分離する。

**Non-Goals:**

- route、1 phase / 1 change、OpenSpec原本の最終完了など先行policyを再定義しない。
- stable requirement ID、requirement / phase mapping、multi-manifest ownershipを実装しない。
- plan / execute / resume / verify / finalize前の高度なdrift gateやcleanup previewを実装しない。
- GSD plansや仕様を生成せず、push、PR、merge、自動stash / commit / resetを行わない。

## Decisions

### 1. policyは参照し、MVPは機械的enforcementだけを持つ

経路選択、handoff前提、GSD phaseの所属、最終完了は先行changeの`adaptive-change-execution`を正とする。
本changeのskillはそれらを検査するが、同じMUSTや受け入れ基準を新capabilityへ複製しない。MVPの
仕様はartifact discovery、progress、manifest、preflight、handoff開始という新しい機械動作に限定する。

### 2. JSONはpath discoveryと進捗メタデータにだけ使う

対応JSONの`contextFiles`を検証してMarkdown filesを読み、`progress` / `tasks`は`tasks.md`から
算出した進捗との整合確認に使う。fallbackは固定directory規約でpathsを発見し、同じreaderとprogress
parserを通す。JSON本文とMarkdown本文の同値性はテスト対象にしない。

### 3. progressはtasks.mdを正本として正規化する

行頭から始まる`- [ ] <description>` / `- [x] <description>`だけをtaskとして数え、空description、
大文字`X`、`*` bullet、indent、その他のcheckbox風行は受理しない。IDはMarkdownの番号表現を解釈せず、
出現順の1始まり連続文字列として付与するため、`1.1`などの番号もdescriptionの一部として保持する。
total / complete / remainingを非負整数で算出し、CLI metadataのID重複または正規化結果との不一致は
対応schemaの異常としてfallbackまたは停止する。task本文の順序とUnicodeを保持し、壊れたcheckboxは
validation errorとする。

### 4. minimal manifestを原子的に追跡する

`.planning/openspec/<change-id>/handoff.json`は次だけを持つ。

- manifest schema version、change ID、handoff state
- canonical repo-relative pathsとcontent hashes
- canonical artifactsを固定したsource commit
- 正規化progress
- 検出したOpenSpec / GSD capabilitiesと検査方法

staging fileを完全検証してから置換し、部分生成を正として扱わない。requirement mapping、phase IDs、
owned artifacts、finalize stateは後続changeへ移す。

`handoff_state`はMVPでは`prepared` / `started`だけを持つ。承認済み入力と追跡可能性を確認してmanifestを
配置した時点を`prepared`、契約済みGSD entrypointがhandoffを受け付けた後を`started`とする。ignore、
非追跡policy、entrypoint失敗では先のstateへ進めない。完了 / finalize / cleanup stateは追加しない。

manifestはsource commitの次のcommitとしてfeature branchで追跡する。`.planning/`がignoreされる場合は
cross-session resume可能と主張せず、追跡方針が決まるまで停止する。テンプレート自身は既存close
policyに従ってpre-mergeに手動削除し、下流では明示的な`.planning`保持方針に従う。

### 5. skillはhandoff開始までをオーケストレーションする

`execute-openspec-change`は先行policyの準備状態とMVP capabilityをread-onlyで検査し、入力、経路理由、
source commit、manifest予定path、fallback状態を表示する。明示承認後にbridgeでmanifestを生成し、
契約済みGSD skillへcanonical pathsを渡す。handoff後のplan / execute / resume / verify / finalize制御は
本MVPに含めない。

### 6. capability contractを実装前gateで固定する

version文字列やskill fileの存在だけを十分条件にしない。OpenSpec JSON schemaとMVPで起動するGSD
handoff capabilityについて、構造化output、exit status、read-only probe、entrypointのdry-run有無、
negative fixture、fallback条件を定める。契約が揃うまでproduction codeを実装しない。

### 7. fixture CIとopt-in smokeを分離する

通常CIはGSDを起動せず、固定fixturesでdiscovery、reader、progress、manifest、path safety、atomic write、
preflightの正常・異常系を検証する。実tool versions、JSON schema、GSD read-only probeとentrypointに
dry-runがないことは明示opt-inのsmokeで確認する。

### 8. changeは依存順の専用branch / PRで保持する

本changeはPR #40 merge後の`origin/main` `7c048da`をbaseにした専用branch
`agent/automate-openspec-gsd-handoff`で保持し、そのPRには本changeだけを載せる。policy requirement、
手動handoff、close policyはcommit `a2eb744`由来の`adaptive-change-execution`、ADR-0008、workflowと
整合確認済み。先行changeと同時にmainへ在庫せず、依存未完了のproposalを同一PRへ束ねない。
後続`harden-openspec-gsd-handoff-lifecycle`も本changeのmerge後に別branch / PRで扱う。

### 9. OpenSpec JSON contractは1.3.1 exactへ固定する

MVPは`openspec --version`のexit 0とstdout `1.3.1`を別probeで確認する。apply JSON自体にはversion /
schemaVersionがないため、version文字列をJSONから推測しない。`instructions apply --change <id> --json`
はexit 0で、次をすべて満たす場合だけJSON経路として受理する。

- top-levelの`changeName`、`changeDir`、`schemaName=spec-driven`、`contextFiles`、`progress`、`tasks`、
  `state`、`instruction`を検証する。`changeName`と`changeDir`は要求changeとそのreal pathに一致させる。
- `contextFiles`は`proposal` / `design` / `tasks`が各1 absolute path、`specs`が1以上のabsolute pathsを
  持つobjectとする。全pathはsymlink解決後も対象change内のcanonical Markdown fileでなければならない。
- `progress`は非負整数の`total` / `complete` / `remaining`を持ち、`total = complete + remaining`。
  `tasks`は1始まりの連続した文字列ID、description、boolean doneを持ち、件数、順序、本文、完了状態が
  `tasks.md`の正規化結果と一致する。
- JSON version / schemaVersionは要求しない。将来fieldの存在は対応versionの代用にせず、MVPが使う
  fieldとinvariantを満たす限り無関係な追加fieldはcanonical contentとして扱わず無視する。

version mismatch、non-zero、malformed JSON、field / schema / path / cardinality / progress mismatchの
いずれかならJSON入力を一部採用しない。永続artifactを作らず、固定directoryからMarkdown fallbackを
最初からやり直す。shapeがvalidでも`state=blocked`または`missingArtifacts`が存在する場合は準備不足
として停止し、fallbackで隠さない。`state=all_done`は新規handoffを開始せず最終境界ゲートへ案内する。
`state=ready`だけがhandoff準備を継続できる。contract fixturesは
`tests/fixtures/openspec_gsd_handoff/openspec/`に固定する。

入力上限はchange IDがASCII lower-kebabで1〜128 bytes、canonical Markdownが最大64 files、各
1 MiB、合計4 MiB、tasksが1〜4096件とする。byte数はUTF-8 bytesで測り、上限超過時は切り捨てず
対象と上限を報告して手動handoffを提示する。

### 10. GSD capability contractは1.5.0 exactの複合signalへ固定する

MVPはGSDの`VERSION`が`1.5.0`と完全一致し、runtime、`gsd-new-project` / `gsd-phase` skills、初期化・
計画・実行・検証に必要なagent `.md` / `.toml` filesが存在することに加え、次のread-only probeを
要求する。

```text
node ${GSD_HOME}/gsd-core/bin/gsd-tools.cjs init progress --raw
```

probeはexit 0のJSON objectで、`project_exists` / `roadmap_exists` / `state_exists`、`project_root`、
`agents_installed`、`missing_agents`を含む。`project_root`はrepository real pathと一致し、
`agents_installed=true`かつ`missing_agents=[]`でなければならない。project / roadmap / stateがすべて
falseなら未初期化、すべてtrueなら初期化済みとし、混在状態は自動entryしない。

entrypoint自体にはread-only / dry-run modeがない。未初期化なら明示承認後に、canonical artifact
paths、source commit、完了済み境界ゲート、未解決事項、one-change制約、仕様非複製を記したhandoff
briefをidea documentとして`$gsd-new-project --auto @<handoff-brief>`へ渡す。初期化済みなら
`$gsd-phase`でchange専用phaseを追加する。
いずれもchange ID、canonical artifact paths、source commit、完了済み境界ゲート、未解決事項、
one phase / one change制約を渡す。GSD artifactsへ仕様や受け入れ基準を転記せず、canonical pathsと
source commitを参照させる。

CLI probeだけではCodex hostの`spawn_agent` tool schemaを証明できないため、execute skillは書込前の
runtime preflightでvisible schemaを検査する。`agent_type`を持つschemaではtyped dispatchを使う。
現セッションのように`agent_type`を持たないgeneric schemaでは、active Codex config root配下の対応
agent `.toml`をrole-preambleとしてgeneric agentへ注入し、結果を`generic-agent workaround`と明示する。
typed dispatchまたはworktree isolationが正しさに必須ならgeneric schemaではfail-closedする。この
host判定はbridgeのread-only CLI probe結果から推測しない。

probe前後のrepository書込がないことをopt-in smokeで確認する。non-zero、malformed JSON、version
mismatch、missing agents / files、wrong project root、混在初期化状態、入力上限超過ではGSDを起動せず、
既知状態と先行policyの手動handoffを提示する。fixturesは
`tests/fixtures/openspec_gsd_handoff/gsd/`に固定する。

## Risks / Trade-offs

- **MVPだけではlifecycle全体を保護しない** → handoff後は先行changeの手動policyを使い、後続hardening
  完了前に自動finalizeや高度なownership判定を提供しない。
- **tool schemaへの結合** → 対応schema/signalsをfixtureで公開し、未知形式はfallbackまたは停止する。
- **manifest commitがsource commitの次になる** → source commitをcanonical基準として明示し、manifest
  自身のcommitと混同しない。
- **二つのdiscovery経路** → 共通reader / progress parserへ収束させ、path / progress parityを検証する。
- **ignore環境でresume stateを失う** → 永続化できるまでfail-closedとし、再生成可能という曖昧な保証をしない。

## Migration Plan

1. 先行changeがmerge済みであることを確認し、そのbaseから本changeだけを載せる専用branch / PRを作る。
2. 固定したcontractとfixturesをOpenSpecへ反映してstrict validateする。
3. 先行workflowの手動handoffでMVP実装phasesを作成する。
4. discovery / reader / progress、minimal manifest、preflight、skill、CI / smokeを実装し、`.planning/`を
   ignoreする下流ではcross-session resumeを保証できない旨を`docs/optional/gsd.md`へ追記する。
5. 先行changeの最終完了policyに従って受け入れを確認し、既存close policyで手動closeする。
6. 後続hardening changeはMVPの確定manifest schemaを入力として実装する。

RollbackはMVP skill / bridgeを呼ばず、先行changeの手動handoffへ戻す。生成済みmanifestはsource commitと
状態を確認してから既存close policyで手動処理する。

## Resolved implementation contracts

実装開始をblockしていたOpen QuestionsはDecisions 9–10とfixturesで解決した。manifestのcommit /
gitignore方針はDecision 4、最小shapeは
`tests/fixtures/openspec_gsd_handoff/manifest/expected-prepared.json`に固定する。残るgateはstrict validate、
`spec-holes` Phase 1再確認、利用者承認、手動GSD handoffであり、production codeはその前に開始しない。

## Spec holes Phase 1

各要件へ固定12分類を順番に適用した。該当項目はspec scenarioへ明記し、Phase 2でfixture test、
例示test、property test、または理由付き未検証へ対応付ける。

### R1: canonical OpenSpec artifactsを発見して読む

| # | 分類 | 判断 | 穴の内容 | 潰し方（1: 明記 / 2: スコープ外 / 3: ユーザ確認） |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | empty paths / files | 1: 必須artifact欠落として停止 |
| 2 | 境界値 | 該当 | 0 / 1 / 複数path | 1: schema fixtureでcardinalityを固定 |
| 3 | 重複・衝突 | 該当 | 重複path / artifact種別衝突 | 1: 推測・重複排除せず停止 |
| 4 | 順序 | 該当 | JSON配列 / directory順依存 | 1: 種別とpathで決定論的整列 |
| 5 | 型・形式不正 | 該当 | schema違反 / 非Markdown | 1: JSON経路拒否と明示fallback |
| 6 | エラー経路 | 該当 | CLI / file read部分失敗 | 1: 部分入力を採用しない |
| 7 | 冪等性・再実行 | 該当 | discovery経路で内容が変わる | 1: 共通readerとpath parity test |
| 8 | 時刻・タイムゾーン | 非該当 | mtimeを正本判定に使わない | 2: mtime最適化は対象外 |
| 9 | 文字列 | 該当 | Unicode / 空白 / encoding path | 1: UTF-8とrepo内real pathを検査 |
| 10 | 数値 | 非該当 | artifact本文に数値演算なし | 2: 内容解釈は対象外 |
| 11 | 巨大入力・リソース枯渇 | 該当 | 巨大 / 大量artifact | 1: 64 files、各1 MiB / 合計4 MiBを超えたら切捨てず報告 |
| 12 | 状態遷移の未定義パス | 該当 | JSON失敗後の入力混合 / blocked / all_done | 1: mismatchはfallbackを再開始、blockedは停止、all_doneは最終境界へ案内 |

### R2: task progressを決定論的に算出する

| # | 分類 | 判断 | 穴の内容 | 潰し方（1: 明記 / 2: スコープ外 / 3: ユーザ確認） |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | tasksが空 | 1: 実行準備不足として停止 |
| 2 | 境界値 | 該当 | 0 / 1 / 全件完了 | 1: 0..totalの整数として算出 |
| 3 | 重複・衝突 | 該当 | CLI task ID重複 / metadata不一致 | 1: `tasks.md`正規化結果を優先して異常報告 |
| 4 | 順序 | 該当 | 並び替えで集計が変わる | 1: 集計は順序非依存、表示順保持 |
| 5 | 型・形式不正 | 該当 | 壊れたcheckbox / 大文字X / bullet / indent / progress型 | 1: validation failureとして停止 |
| 6 | エラー経路 | 該当 | parse途中失敗 | 1: 部分集計を返さない |
| 7 | 冪等性・再実行 | 該当 | 同じtasksで値が変化 | 1: 純粋parserとproperty test |
| 8 | 時刻・タイムゾーン | 非該当 | 時刻を進捗に使わない | 2: durationは対象外 |
| 9 | 文字列 | 該当 | Unicode本文 / checkbox風文字列 | 1: 行頭の固定形式だけをtask扱い |
| 10 | 数値 | 該当 | 負数 / overflow / 不整合 | 1: 非負整数とtotal整合を検査 |
| 11 | 巨大入力・リソース枯渇 | 該当 | 大量tasks | 1: 4096 tasksを上限としてbounded stress test |
| 12 | 状態遷移の未定義パス | 該当 | 完了から未完了への変更 | 1: 現在のMarkdownを正として再算出 |

### R3: minimal handoff manifestを管理する

| # | 分類 | 判断 | 穴の内容 | 潰し方（1: 明記 / 2: スコープ外 / 3: ユーザ確認） |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | change / path / SHA / state欠落 | 1: schema必須fieldとして停止 |
| 2 | 境界値 | 該当 | path 0件 / progress 0件 | 1: 必須artifactは1件以上、0 taskは禁止 |
| 3 | 重複・衝突 | 該当 | 同一change manifest / path重複 | 1: 既存state照合、不一致なら停止 |
| 4 | 順序 | 該当 | path順でhash集合が変化 | 1: canonical sortしてserialize |
| 5 | 型・形式不正 | 該当 | 壊れたJSON / SHA / state | 1: strict parserで停止 |
| 6 | エラー経路 | 該当 | manifest部分書込 | 1: staging検証後に原子的置換 |
| 7 | 冪等性・再実行 | 該当 | 同入力でmanifest差 | 1: volatile時刻を必須内容にしない |
| 8 | 時刻・タイムゾーン | 非該当 | 時刻でsource/stateを決めない | 2: audit timestampは任意外部情報 |
| 9 | 文字列 | 該当 | traversal / symlink / Unicode path | 1: repo相対real pathだけを許容 |
| 10 | 数値 | 該当 | schema version / progress不正 | 1: 対応整数範囲をfixture化 |
| 11 | 巨大入力・リソース枯渇 | 該当 | manifest過大 | 1: mappingを含めず上限超過で停止 |
| 12 | 状態遷移の未定義パス | 該当 | ignored / untrackedでprepared化 | 1: 追跡可能性確認まで状態遷移禁止 |

### R4: preflight後にGSD handoffを開始する

| # | 分類 | 判断 | 穴の内容 | 潰し方（1: 明記 / 2: スコープ外 / 3: ユーザ確認） |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | policy / signal / source SHA欠落 | 1: 書込前に不足報告 |
| 2 | 境界値 | 該当 | 必須signalが1件だけ不足 | 1: 全件一致を要求 |
| 3 | 重複・衝突 | 該当 | 同change多重起動 | 1: 既存manifest stateを検査 |
| 4 | 順序 | 該当 | 承認 / probe前に書込 | 1: policy→probe→表示→承認→write→invoke |
| 5 | 型・形式不正 | 該当 | signal / output / ID / host tool schema不正 | 1: CLI probeとruntime schemaを別々に検証し、対応済みと推測しない |
| 6 | エラー経路 | 該当 | probe / bridge / GSD部分失敗 | 1: 既知状態と手動復旧を報告 |
| 7 | 冪等性・再実行 | 該当 | 再実行でhandoff重複 | 1: manifest stateを先に照合 |
| 8 | 時刻・タイムゾーン | 非該当 | capabilityを日時で判定しない | 2: cache TTLは対象外 |
| 9 | 文字列 | 該当 | localized output / Unicode ID | 1: 構造化signalとcanonical IDを使用 |
| 10 | 数値 | 該当 | version / input上限 | 1: OpenSpec 1.3.1 / GSD 1.5.0 exactと固定上限で判定 |
| 11 | 巨大入力・リソース枯渇 | 該当 | context / quota不足 | 1: 切捨てず停止・手動handoff提示 |
| 12 | 状態遷移の未定義パス | 該当 | GSD初期化3状態の混在 / failedからstartedへ遷移 | 1: 混在は停止し、再preflightと再承認を必須化 |

### R5: オプション依存をコアCIから分離する

| # | 分類 | 判断 | 穴の内容 | 潰し方（1: 明記 / 2: スコープ外 / 3: ユーザ確認） |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | GSDなし / empty fixture | 1: 通常CI成功とempty不正testを分離 |
| 2 | 境界値 | 該当 | 0 / 1 / 多数paths・tasks | 1: boundary fixturesを用意 |
| 3 | 重複・衝突 | 該当 | duplicate path / manifest | 1: negative fixturesで停止確認 |
| 4 | 順序 | 該当 | fixture順で結果が変化 | 1: shuffle / reverseで不変性検証 |
| 5 | 型・形式不正 | 該当 | malformed JSON / Markdown / manifest | 1: 種別ごとのnegative fixtures |
| 6 | エラー経路 | 該当 | partial write / tool failure | 1: fault injection例示test |
| 7 | 冪等性・再実行 | 該当 | 二回実行で出力差 | 1: pure処理property、I/O例示test |
| 8 | 時刻・タイムゾーン | 非該当 | MVP出力は時刻非依存 | 2: 実tool時刻はassert対象外 |
| 9 | 文字列 | 該当 | Unicode / 空白 / traversal | 1: path / string fixturesを追加 |
| 10 | 数値 | 該当 | progress / version境界 | 1: boundary / invalid fixtures |
| 11 | 巨大入力・リソース枯渇 | 該当 | large fixture / timeout | 1: bounded stressと明示timeout |
| 12 | 状態遷移の未定義パス | 該当 | opt-inなしで実tool起動 | 1: 通常CIから隔離しflag必須 |

## Spec holes Phase 2の検証対応（実装時）

`tasks.md` 4.1–4.2と5.1で、全「該当」行をfixture test、例示test、property test、または理由付き
未検証へ一対一で対応付ける。reader / progress parser / manifest serializerはproperty test候補、
filesystem / Git / tool orchestrationは例示testとopt-in smoke候補とする。
