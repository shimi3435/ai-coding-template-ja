## Context

現行テンプレートは、OpenSpecを仕様と最終完了の正本、GSDを大規模changeの詳細planとphase進捗の正本としている。実際には経路判定がchange規模、セッション数、並列可能性など事前測定しにくい条件へ依存し、source pin、handoff manifest、phase state、OpenSpecへの再同期が必要になる。

GSD handoffはPython package、CLI、Taskfile、fixtures、skill contract、運用文書、CI境界まで広がっている。一方、品質上必要な仕様、詳細task、検証、停止条件、review、再開位置はOpenSpec `tasks.md`とリポジトリ規約で表現できる。

## Goals / Non-Goals

**Goals:**

- OpenSpec直接経路へ一本化し、経路選択をなくす。
- `tasks.md`だけで実装順序、進捗、検証、セッション復帰を再現できるようにする。
- GSD固有integrationを互換shimなしで削除する。
- 外部orchestratorを利用者明示指定時だけ使えるtool-neutralな拡張点として扱う。
- reviewとreplanの発火条件を列挙し、agentの主観判定を減らす。

**Non-Goals:**

- 特定の外部orchestratorを推奨、導入、検出、検証しない。
- OpenSpec CLIを必須化しない。
- task数、行数、セッション数の固定上限を設けない。
- 進行中のskill updater実装を本changeへ混在させない。

## Decisions

### 1. コア実行経路をOpenSpec直接実行へ一本化する

OpenSpec artifactsを仕様と完了の正本、`tasks.md`を詳細実行と進捗の正本にする。外部orchestrator固有のplan、state、evidenceは品質判定に使わない。agentは一般的な候補を提案できるが、利用者が名前を選ぶ前のread-only探索、在席確認、plugin検索、version probe、install、起動は禁止する。選択後に使用する場合も、各task完了後に同じ`tasks.md`を更新する。

### 2. OpenSpec適用とchange分割を出荷境界で決める

外部挙動、公開interface、security / trust boundary、永続データ、dependency / lockfile、build / CI、複数恒久成果に触れる変更だけOpenSpecを必須にする。独立して受け入れ、review、mergeできる成果は別changeへ分ける。一体成果のtask数やセッション数は分割理由にせず、依存付きsectionで管理する。

### 3. tasks.mdに最小で機械判定可能な契約を置く

各taskは成果、依存、対象、実装checkbox、検証checkboxを持つ。再開点は依存完了済みの先頭未完了taskとする。環境制約または失敗により検証不能な場合、実装だけ完了できるが検証checkboxとchange closeは未完了に保つ。focused validationが構造上非該当で、代替静的検証も存在しない場合だけ、N/A理由を記録して検証checkboxを完了にできる。

実行制約は次の3項目だけを冒頭に置く。

1. 最初のCI parity。
2. 停止・再計画条件。
3. 一時artifact cleanup。

### 4. execute-openspec-changeを直接executorへ置き換える

skill呼出自体を実装と必要なreviewer / verifierの順次起動承認とする。追加preview承認は要求しない。実装前にactive change一つ、必須artifacts valid、spec-holes未解決なし、詳細tasks validを確認する。

dirty worktreeは対象pathとの既存重複だけをblockし、無関係差分を保持する。preflightまたはdirty ownership確認の失敗はreport-onlyとしてrepositoryを変更しない。両方が成功したsafe boundary後のtask実行blockerは、選択中task、文書順で先頭の未解決task、または先頭の未完了validation taskのうち該当するtask直下へ理由と再開条件を記録する。reviewまたはproject check時に未完了validation taskがなければ文書順で最後のtaskをfallbackにする。未完了taskを残す呼出終了時に、完了task、実装済み・検証未完了task、orderly stopした`implementation-in-progress` taskを含む累積executor-owned paths、task state、各pathを最後に変更したtaskのpost-task diff digestを`tasks.md`へ記録する。一致する未commit差分は、後続taskの対象と重なっても再呼出時に保持し、partial taskは実装を継続する。不一致または記録欠落は後発変更との区別不能として停止する。abrupt termination後の未記録差分もexecutor所有と推測せずfail-closedで停止する。skillはGit commit、push、PR、mergeを実行しない。追加executorは別の利用者承認なしに起動しない。不可逆操作、外部write、仕様拡張は通常の安全確認または再計画承認へ戻す。

### 5. reviewを列挙リスクへ比例させる

全変更にself-reviewと適用可能なfocused validationを要求する。独立review / verifierの恒久的な発火条件列挙は`AGENTS.md`のOSWF-5だけを単一の正とし、本designとtasksには重複列挙しない。

恒久topologyの順序はself-review、initial independent review、最大3回のfix / focused validation / diff review、最新入力の`task check`、initial reviewerと別のverifierとする。恒久topologyにfresh final reviewer専任は置かずverifierへ統合するが、利用者がone-offの追加reviewを明示選択した場合は、必須verifierを置換せず追加できる。initial / diff review、project check、verifierのblocker保存先taskで検証checkboxが完了済みなら、その検証checkboxと親taskを未完了へ戻し、新しいevidenceが成功した場合だけ再完了する。verifierがblockerを報告した場合はsoft-stopし、利用者承認後の新cycleでfix、review、check、前cycleと別のverifierを実行する。同一役割・taskのagentが連続2回失敗した場合、または同一環境・command・入力のinfrastructure failureが1回の再試行後にも再現した場合もsoft-stopする。生logや一時reportは追跡せず、command、結果、source commit、fresh実行 / green evidence再利用の別、未検証理由の要約だけを`tasks.md`へ残す。

### 6. GSD integrationをv2 breaking changeとして削除する

handoff package、CLI、task、script、fixture、専用tests、handoff skill behavior、導入文書を同時に削除する。deprecated aliasや失敗説明用shimは残さない。現行規約とdocsから固有名を除く。

判断履歴はADR-0010から旧ADRをSupersededにして保持する。case-insensitiveな`gsd` token境界をtracked path / textで検査し、文字列の最終残存先はSuperseded ADRとv2 release notesのexact pathだけをallowlistにする。実装中は本change directoryだけをexact pathで一時例外にし、pre-merge closeで削除する。旧grill、retrospective、通常docsは履歴の正本にせず現方針へ更新する。

### 7. OpenSpec CLIと外部toolをcore checksから分離する

`check:isolated`はcore runtimeだけをPATHへ置き、networkを無効化して`task check`を実行する。特定orchestratorのHOME、command、versionは作成も検査もしない。OpenSpec CLI validationは独立したopt-in / CI gateに残し、CLI不在時のMarkdown fallbackを正式経路として維持する。

## Risks / Trade-offs

- 自動phase dashboardと外部tool固有のsession stateを失う。依存付きtasksとcheckboxを単一の復帰契約にすることで補う。
- 同名skillの意味がhandoffから直接実行へ変わる。v2 release notesでbreaking changeと移行方法を明示する。
- GSD文字列の厳格allowlistは歴史文書追加時にfalse positiveを起こし得る。履歴はADRとrelease notesへ集約し、例外を拡張しない。
- `tasks.md`が長くなるchangeがある。独立出荷可能性でchangeを分割し、一体成果はsectionと依存で読みやすくする。

## Migration Plan

1. 後継ADR、OpenSpec規約、task contract、review contractを更新する。
2. `execute-openspec-change`を直接executorへ再設計し、focused contract testsをgreenにする。
3. GSD handoff package、CLI、task、fixtures、専用testsを削除し、残存scanを有効化する。
4. 現行docs、doctor、rename、repository contracts、isolated checkをtool-neutralに更新する。
5. Superseded ADRとv2 release notesだけを残存allowlistにする。
6. `task check:isolated`、`task openspec:validate`、`task check`を最新入力で実行する。
7. merge後、skill updater changeを最新mainから再構成し、GSD planning artifactsを移植せず詳細tasksへ移行する。同changeのmigration taskで`.planning/`未移植とtracked tree残存なしを検証する。

## Spec Holes Audit

### OSWF-1 OpenSpecを単一の正にする

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | 外部toolが一つもない場合の経路 | 1: OpenSpec直接実行を定義 |
| 2 | 境界値 | 非該当 | 数量境界を入力にしない | — |
| 3 | 重複・衝突 | 該当 | tool stateとtasksの完了状態が競合 | 1: tasksを優先 |
| 4 | 順序 | 該当 | 外部tool完了とtasks同期の順序 | 1: task完了ごとに同期 |
| 5 | 型・形式不正 | 該当 | tool固有stateが読めない | 1: tool stateを品質入力にしない |
| 6 | エラー経路 | 該当 | 外部tool失敗時の復帰 | 1: tasksの未完了範囲から直接再開 |
| 7 | 冪等性・再実行 | 該当 | 同じtaskを再実行する場合 | 1: checkboxと検証状態を再確認 |
| 8 | 時刻・タイムゾーン | 非該当 | 時刻で完了を判定しない | — |
| 9 | 文字列 | 該当 | orchestrator名が未指定・空白 | 1: 一般提案だけ許可し、名前付き選択まで探索・使用禁止 |
| 10 | 数値 | 非該当 | 数値演算なし | — |
| 11 | 巨大入力・リソース枯渇 | 非該当 | tool出力を取り込まない | — |
| 12 | 状態遷移の未定義パス | 該当 | 外部toolだけ完了した状態 | 1: changeは未完了のまま |

### OSWF-2 OpenSpec適用範囲と分割境界

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | 列挙条件に一つも該当しない変更 | 1: 直接実行を許可 |
| 2 | 境界値 | 該当 | 一つだけ該当する場合 | 1: 一つでも該当すればchange必須 |
| 3 | 重複・衝突 | 該当 | 複数条件へ同時に該当 | 1: 一つのchangeで重複なく扱う |
| 4 | 順序 | 該当 | 分割判断が実行開始後になる | 1: 実行engine選択前に分割 |
| 5 | 型・形式不正 | 非該当 | typed inputを受けない規約判断 | — |
| 6 | エラー経路 | 該当 | 直接変更中に対象条件が判明 | 1: 停止してchangeを作る |
| 7 | 冪等性・再実行 | 非該当 | 判定反復でrepository状態を変えない | — |
| 8 | 時刻・タイムゾーン | 非該当 | 時刻依存なし | — |
| 9 | 文字列 | 非該当 | 名前やencodingを境界に使わない | — |
| 10 | 数値 | 該当 | task数・行数・session数の閾値 | 2: 分割基準にしないと明記 |
| 11 | 巨大入力・リソース枯渇 | 該当 | 一体changeのtasksが大きい | 1: sectionと依存で管理 |
| 12 | 状態遷移の未定義パス | 該当 | 実装中に独立成果が生じる | 1: 停止・承認・change分割 |

### OSWF-3 tasks.mdの詳細実行契約

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | task entryが0件または必須項目欠落 | 1: preflight failure |
| 2 | 境界値 | 該当 | 先頭・末尾task、最後の検証未完了 | 1: 依存済み先頭未完了を選び、検証未完了ならclose禁止 |
| 3 | 重複・衝突 | 該当 | 同じ対象を複数taskが変更 | 1: 推移的な依存 pathで順序を明示 |
| 4 | 順序 | 該当 | 文書順と依存順が異なる | 1: 依存完了を優先 |
| 5 | 型・形式不正 | 該当 | checkboxや必須fieldが不正 | 1: preflight failure |
| 6 | エラー経路 | 該当 | 実装成功・検証不能、構造上N/A、abrupt termination | 1: 環境未実行はclose禁止、構造上N/Aだけ理由付き完了、未記録差分はfail-closed |
| 7 | 冪等性・再実行 | 該当 | 完了taskまたは実装途中taskの再実行 | 1: ownership state / digest一致時だけ検証再開または実装継続 |
| 8 | 時刻・タイムゾーン | 非該当 | 時刻を復帰条件に使わない | — |
| 9 | 文字列 | 該当 | 対象pathにUnicode・空白 | 1: 単一のMarkdown inline code spanで無変換のexact値を保持 |
| 10 | 数値 | 非該当 | 固定task上限を設けない | — |
| 11 | 巨大入力・リソース枯渇 | 該当 | tasks肥大化 | 1: 一体成果はsection、独立成果はchange分割 |
| 12 | 状態遷移の未定義パス | 該当 | 実行可能taskがない、または実装途中でorderly stop | 1: blockerを該当taskへ記録し、partial ownershipを`implementation-in-progress`で保持 |

### OSWF-4 直接executor

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | active changeが0件 | 1: 実装前停止 |
| 2 | 境界値 | 該当 | active changeが1件 / 2件 | 1: 1件だけ受理 |
| 3 | 重複・衝突 | 該当 | task対象とdirty差分が重なる | 4: 既存重複は停止、記録済みexecutor差分だけ再開 |
| 4 | 順序 | 該当 | preflightまたはdirty ownership確認前にrepository変更 | 1: 両確認失敗はreport-only、成功後だけtasksへblockerを記録 |
| 5 | 型・形式不正 | 該当 | artifactsまたはtasksがinvalid | 1: fail-closed |
| 6 | エラー経路 | 該当 | safe boundary後の途中失敗、破壊操作、仕様拡張 | 1: 該当taskへ理由と再開条件を記録し、checkboxを偽装せず停止・確認 |
| 7 | 冪等性・再実行 | 該当 | skill再呼出 | 4: 累積ownership digest一致時だけ未完了taskから再開 |
| 8 | 時刻・タイムゾーン | 非該当 | 時刻依存なし | — |
| 9 | 文字列 | 該当 | unsafe / ambiguous change IDとpath | 1: exact active directoryと対象pathを検証 |
| 10 | 数値 | 非該当 | 量的判定なし | — |
| 11 | 巨大入力・リソース枯渇 | 該当 | 長時間task・context枯渇 | 1: tasks更新後に同じ復帰規則を使う |
| 12 | 状態遷移の未定義パス | 該当 | 実装済み・検証未完了・review未完了 | 1: 各checkboxを独立状態として維持 |

### OSWF-5 リスク比例reviewと再計画

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | 高リスク条件0件 | 1: reviewer / verifierを必須にしない |
| 2 | 境界値 | 該当 | blocker修正0 / 3 / 4回、agent失敗1 / 2回、infra失敗1 / 2回 | 1: initial fix最大3回、agent / infra同条件2回で停止 |
| 3 | 重複・衝突 | 該当 | 複数risk条件と複数finding | 1: 一つのreview cycleへ集約 |
| 4 | 順序 | 該当 | review、fix、check、verify、verifier後の再開順序 | 1: blocker保存先の検証と親taskを再openし、verifier blockerはsoft-stop後の承認済み新cycleへ移す |
| 5 | 型・形式不正 | 該当 | review reportが機械形式でない | 1: finding内容を読み、結果要約だけ記録 |
| 6 | エラー経路 | 該当 | reviewer / verifier blocker、agent連続失敗、infra再現 | 1: 成功扱いせず定義済み閾値で停止 |
| 7 | 冪等性・再実行 | 該当 | stale green evidence再利用 | 1: 最新入力の`task check`を再実行 |
| 8 | 時刻・タイムゾーン | 非該当 | 時刻でevidence freshnessを決めない | — |
| 9 | 文字列 | 該当 | secretを含むlog | 1: 生logを追跡せず要約のみ |
| 10 | 数値 | 該当 | initial fix最大3回、agent / infra失敗2回 | 1: 各閾値を超える自動反復を禁止 |
| 11 | 巨大入力・リソース枯渇 | 該当 | report / log肥大化 | 1: command、結果、source commit、fresh実行 / green evidence再利用の別、未検証理由の要約だけ永続化 |
| 12 | 状態遷移の未定義パス | 該当 | 仕様判断、material expansion、review / check / verifier blocker | 1: 完了済み保存先taskを再openし、利用者承認まで停止して必要なら新cycleへ移す |

### OSWF-6 GSD固有統合の削除

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | 残存参照0件 | 1: allowlist外0件を成功条件にする |
| 2 | 境界値 | 該当 | allowlist内1件、allowlist外1件、active changeの一時例外 | 1: path allowlistをexact適用し、close後に一時例外を禁止 |
| 3 | 重複・衝突 | 該当 | 現行docsと旧ADRの判断が競合 | 1: 旧ADRをSupersededにする |
| 4 | 順序 | 該当 | code削除前にskillを切り替える | 1: 直接skillのvertical slice後に旧実装削除 |
| 5 | 型・形式不正 | 該当 | case / separator違いの残存名 | 1: case-insensitiveなtoken境界をpath / textでscan |
| 6 | エラー経路 | 該当 | 一部削除でimportやtaskだけ残る | 1: 同一changeで削除しcontract testsで拒否 |
| 7 | 冪等性・再実行 | 該当 | 削除後のcheck再実行 | 1: 残存0件で安定成功 |
| 8 | 時刻・タイムゾーン | 非該当 | 時刻依存なし | — |
| 9 | 文字列 | 該当 | 大文字小文字、hyphen、underscore、slashの残存 | 1: `(?i)(^|[^a-z0-9])gsd([^a-z0-9]|$)`相当でscan |
| 10 | 数値 | 非該当 | 数値演算なし | — |
| 11 | 巨大入力・リソース枯渇 | 該当 | repository全体scan | 1: tracked filesだけを`rg`相当で検査 |
| 12 | 状態遷移の未定義パス | 該当 | 旧CLI呼出 | 1: shimなしの不存在error |

### OSWF-7 tool-neutral core checks

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | OpenSpec CLI / external toolが0件 | 1: isolated successを要求 |
| 2 | 境界値 | 非該当 | tool数を品質境界にしない | — |
| 3 | 重複・衝突 | 該当 | optional toolがPATHに存在 | 1: core結果を在席から独立させる |
| 4 | 順序 | 該当 | CLI validationとcore checkの順序 | 1: 独立jobとし相互依存させない |
| 5 | 型・形式不正 | 該当 | malformed Markdown artifacts | 1: direct preflight / optional validationで拒否 |
| 6 | エラー経路 | 該当 | external tool failure | 1: tasksから直接再開 |
| 7 | 冪等性・再実行 | 該当 | isolated check再実行 | 1: temp環境を毎回作りcleanup |
| 8 | 時刻・タイムゾーン | 非該当 | 時刻依存なし | — |
| 9 | 文字列 | 該当 | HOME / PATHに空白や任意名 | 1: quoted temp pathsとtool-neutral変数だけ使う |
| 10 | 数値 | 非該当 | 数値演算なし | — |
| 11 | 巨大入力・リソース枯渇 | 該当 | network timeoutやcache増大 | 1: networkを到達不能proxyへ固定しtemp cleanup |
| 12 | 状態遷移の未定義パス | 該当 | CLIなしで実装、後からvalidation | 1: Markdown実行を正式、CLI検証を追加gateとして定義 |

## Planned Verification Mapping

| 穴 | 検証形態 | テスト予定 | 備考 |
| --- | --- | --- | --- |
| OSWF-1 #1/#3/#4/#5/#6/#7/#9/#12 | 例示contract test | direct workflow / external state fixtures | tasks優先と直接復帰を検証 |
| OSWF-2 #1/#2/#3/#4/#6/#10/#11/#12 | 例示contract test | workflow policy parser tests | 列挙条件と出荷境界を検証 |
| OSWF-3 #1/#2/#3/#4/#5/#6/#7/#9/#11/#12 | 例示contract test | execute skill task fixtures | checkbox、依存、未検証、blockerを検証 |
| OSWF-4 #1/#2/#3/#4/#5/#6/#7/#9/#11/#12 | 例示contract test | static skill / instruction fixtures | preflightとdirty overlapを検証 |
| OSWF-5 #1/#2/#3/#4/#5/#6/#7/#9/#10/#11/#12 | 例示contract test | review convergence fixtures | risk trigger、N/A、各反復上限、verifier新cycle、最新check、要約を検証 |
| OSWF-6 #1/#2/#3/#4/#5/#6/#7/#9/#11/#12 | 例示test / residual scan | repository contract tests | token境界、allowlist外の固有名、旧入口を拒否し、active change例外がclose後に残らないことを検証 |
| OSWF-7 #1/#3/#4/#5/#6/#7/#9/#11/#12 | integration test | `task check:isolated` / OpenSpec gate tests | optional toolsとnetworkの不在を検証 |

実agent sessionのpreflight実行は通常CIの対象外とし、manual evidenceへ残す明示的out-of-scopeとする。

## Open Questions

なし。
