## ADDED Requirements

### Requirement: OSWF-1 OpenSpec を仕様・進捗・完了の単一の正にする

repository は MUST OpenSpec proposal / design / spec delta を仕様の正本、`tasks.md` を実装順序・進捗・検証状態の正本として扱い、外部 orchestrator の存在または固有 state を品質条件にしない。agentは外部orchestratorを一般的な候補として提案できるが、利用者が特定の名前を選ぶ前に探索、在席確認、plugin検索、version probe、install、起動をしてはならない。選択後に利用する場合も、完了状態を`tasks.md`へ同期しなければならない。

#### Scenario: 外部 orchestrator なしで change を実行する
- **WHEN** valid な OpenSpec change と詳細 `tasks.md` があり、外部 orchestrator が導入されていない
- **THEN** executor は Markdown artifacts または任意の OpenSpec engineから同じtasksを直接実行・検証・完了できる

#### Scenario: 利用者が外部 orchestrator を明示指定する
- **WHEN** 利用者が特定の外部 orchestrator の使用を明示する
- **THEN** executor はそのtoolを実行支援に利用できるが、仕様を複製せず、各taskの進捗と検証状態をOpenSpec `tasks.md`へ反映する

#### Scenario: 外部 tool state と tasks が競合する
- **WHEN** 外部 tool が完了を示すが対応する検証checkboxが未完了である
- **THEN** repository はchangeを未完了と判定し、tool固有stateだけではcloseを許可しない

#### Scenario: agentが外部orchestratorを候補として提案する
- **WHEN** 利用者が外部orchestratorを名前付きで選択していない
- **THEN** agentは一般的な候補説明だけを提示できるが、read-onlyを含む探索、在席確認、plugin検索、version probe、install、起動を行わず、OpenSpec直接経路を維持する

### Requirement: OSWF-2 OpenSpec change の適用範囲と分割境界を列挙条件で決める

repository は MUST 外部挙動、公開interface、security / trust boundary、永続データ、dependency / lockfile、build / CI、または複数の恒久成果を変更するときにOpenSpec changeを要求する。これらに該当しない局所bugfix、内部refactor、軽微文書修正は直接実行できる。独立して受け入れ、review、mergeできる成果は、task数やセッション数ではなく出荷可能性に基づいて別changeへ分割しなければならない。

#### Scenario: 列挙条件に該当する
- **WHEN** 変更が一つ以上の列挙条件に該当する
- **THEN** 実装前にOpenSpec change、spec-holes、詳細tasksを確定する

#### Scenario: 列挙条件に該当しない
- **WHEN** 変更が局所的で外部挙動と規約を変えず、列挙条件にも該当しない
- **THEN** OpenSpec changeを作らず既存の実装・検証規約で直接変更できる

#### Scenario: 独立出荷可能な成果が複数ある
- **WHEN** 各成果を個別に受け入れ、review、mergeできる
- **THEN** executorは実行engineを選ぶ前に成果を別OpenSpec changesへ分割する

#### Scenario: 一体の成果が大きい
- **WHEN** 一つの受け入れ結果に必要なtaskが多い、または複数セッションにまたがる
- **THEN** task数、行数、セッション数だけではchangeを分割せず、同じ`tasks.md`内の依存付きsectionとして管理する

### Requirement: OSWF-3 tasks.md が詳細実行と復帰を自己完結させる

各OpenSpec changeの`tasks.md`は MUST 各taskの成果、依存、対象、実装checkbox、検証checkboxを持つ。冒頭には最初のCI parity、停止・再計画条件、一時artifact cleanupだけを実行制約として記録する。再開点は依存が全て完了した先頭の未完了taskとする。preflightとdirty ownership確認が成功した後のtask実行blockerは該当task直下へ記録し、両確認のいずれかが失敗した場合はreport-onlyとしてrepositoryを変更してはならない。未commit差分から再開する場合は、呼出終了時に先頭の実行可能な未完了task直下へ記録した累積executor-owned paths、task state、post-task diff digestを使い、完了task、実装済み・検証未完了task、orderly stopした`implementation-in-progress` taskを含む前回executorの差分と後発変更を区別しなければならない。abrupt termination後の未記録差分をexecutor所有と推測してはならない。

#### Scenario: taskを実装・検証する
- **WHEN** taskの実装と指定検証が成功する
- **THEN** executorは対応する実装checkboxと検証checkboxを順に完了へ更新する

#### Scenario: 検証を実行できない
- **WHEN** 環境制約により実装後の指定検証を実行できない
- **THEN** 実装checkboxは完了にできるが、検証checkboxは未完了のまま理由を記録し、change closeを禁止する

#### Scenario: focused validationが構造上非該当である
- **WHEN** taskに対応するtestまたは代替静的検証が構造上存在せず、環境制約や検証失敗が理由ではない
- **THEN** executorはN/A理由を記録して検証checkboxを完了にできる

#### Scenario: セッションを再開する
- **WHEN** 一つ以上のtaskが未完了である
- **THEN** executorは依存が全て完了した先頭の未完了taskを選び、別のSTATE / ROADMAPを必要としない

#### Scenario: 実装済みtaskの未commit差分から検証を再開する
- **WHEN** 実装checkboxが完了し検証checkboxが未完了で、現在の対象pathとdigestがtask直下のexecutor ownership記録に一致する
- **THEN** executorは前回自身の差分として保持し、dirty overlapで停止せず検証から再開する

#### Scenario: 実装途中taskをorderly stopする
- **WHEN** safe boundary後にfileを変更し、実装checkboxを完了する前に制御可能な停止条件へ到達する
- **THEN** executorは対象pathとdigestを`implementation-in-progress`状態で累積ownership snapshotへ記録して停止する

#### Scenario: 実装途中taskの未commit差分から再開する
- **WHEN** `implementation-in-progress`のpath集合とdigestが現在状態に一致する
- **THEN** executorは前回自身の差分を保持して同じtaskの実装を継続する

#### Scenario: abrupt termination後に未記録差分が残る
- **WHEN** process killまたはhost crashによりownership snapshot更新前に終了する
- **THEN** executorは未記録差分の所有者を推測せず、dirty overlapとしてfail-closedで停止する

#### Scenario: 実装済みtaskの対象pathが記録後に変化する
- **WHEN** 現在の対象path集合またはdigestがtask直下のexecutor ownership記録と一致しない
- **THEN** executorは後発変更の所有者を推測せず、重複pathを示して変更前に停止する

#### Scenario: 完了taskのdirty pathが後続taskの対象と重なる
- **WHEN** 完了taskが変更したdirty pathが後続の未実装taskの対象でもあり、現在状態が累積executor ownership記録に一致する
- **THEN** executorは前回自身の差分を保持したまま後続taskの実装を続行する

#### Scenario: taskが依存先より先に並ぶ
- **WHEN** 文書順の先頭未完了taskの依存が未完了である
- **THEN** executorはそのtaskをskipし、依存完了済みの先頭未完了taskを選ぶか、実行可能taskがなければ文書順で先頭の未解決task直下へblockerを記録して停止する

#### Scenario: safe boundary後にtask実行blockerが発生する
- **WHEN** preflightとdirty ownership確認が成功した後、実装、検証、review、またはproject checkを継続できない
- **THEN** executorは理由と再開条件を選択中task、または該当する先頭の未完了validation task直下へ記録して停止し、未完了validation taskがなければ文書順で最後のtask直下へ記録する

#### Scenario: taskの必須項目が欠落する
- **WHEN** taskに成果、依存、対象、実装checkbox、検証checkboxのいずれかがない
- **THEN** direct executorはpreflightを失敗させ、実装を開始しない

### Requirement: OSWF-4 execute-openspec-change は直接実行をfail-closedで開始する

`execute-openspec-change` skillは MUST 明示呼出を実装と必要なreviewer / verifier起動の承認として扱い、active changeが一つ、必須OpenSpec artifactsがvalid、spec-holesに未解決判断がない、詳細tasksが有効、という4条件を実装前にfail-closedで確認する。変更対象と重なる既存dirty差分だけをblockし、記録済みexecutor-owned差分の検証再開は許可し、commit、push、PR、mergeを自動実行してはならない。追加executorは別の利用者承認なしに起動してはならない。

#### Scenario: preflightが成功する
- **WHEN** 4条件が成立し、対象pathに重複dirty差分がない
- **THEN** skillは追加preview承認を求めず、依存済み先頭未完了taskから直接実行する

#### Scenario: active changeが0件または複数件である
- **WHEN** changeを一意に決められない
- **THEN** skillは推測せず、対象を列挙して実装前に停止する

#### Scenario: spec-holesに未解決判断がある
- **WHEN** user confirmationまたは仕様への反映が未完了の穴が残る
- **THEN** skillはcodeを変更せず、未解決箇所を報告する

#### Scenario: 対象pathに既存dirty差分がある
- **WHEN** taskの対象fileと利用者の未commit差分が重なる
- **THEN** skillはstash、上書き、commitせず、tasksを変更せずに重複pathを示して停止する

#### Scenario: preflightまたはdirty ownership確認が失敗する
- **WHEN** 実装前の4条件またはdirty ownership確認が成立しない
- **THEN** skillは失敗をreport-onlyで示し、tasksを含むrepositoryを変更しない

#### Scenario: 無関係なpathだけがdirtyである
- **WHEN** 未commit差分がtask対象外にだけ存在する
- **THEN** skillは差分を保持し、その理由だけでは実行を拒否しない

#### Scenario: task実行が完了する
- **WHEN** 実装、検証、必要reviewが完了する
- **THEN** skillはtasksを更新して結果を報告するが、Git commit、push、PR、mergeは利用者の別の明示依頼まで行わない

#### Scenario: 破壊的操作または仕様拡張が必要になる
- **WHEN** task遂行に不可逆操作、外部write、または承認済み仕様を超える変更が必要になる
- **THEN** skillは実行を停止し、通常の安全確認または再計画承認を求める

### Requirement: OSWF-5 検証と再計画をリスク列挙条件で制御する

executorは MUST 全変更でself-reviewと適用可能なfocused validationを行う。focused validationが構造上非該当の場合だけN/A理由で完了でき、環境制約または失敗による未実行は完了にできない。security / trust boundary、外部write、永続データ、公開interface、dependency / lockfile、build / CI、削除 / migrationのいずれかを変更する場合、self-review、独立review、finding修正、最新入力の`task check`、reviewerと別の独立verifierの順で検証する。initial reviewのfinding修正は最大3回とし、結果はcommand、成否、未検証理由の要約だけを`tasks.md`へ記録する。initial / diff review、project check、verifierのblocker保存先taskで検証checkboxが完了済みなら、その検証checkboxと親taskを未完了へ戻し、blocker解消後の新しいevidenceが成功した場合だけ再完了できる。恒久的なreview発火条件列挙は`AGENTS.md`のOSWF-5を単一の正とし、design、tasks、workflow、skillsは同requirement IDを参照する。

#### Scenario: review発火条件に該当しない
- **WHEN** 変更が列挙された高リスク条件を一つも変更しない
- **THEN** self-review、適用可能なfocused validation、通常のfinal checksで完了判定でき、独立reviewer / verifierを必須にしない

#### Scenario: review発火条件に該当する
- **WHEN** 変更が列挙条件を一つ以上変更する
- **THEN** direct executorの明示呼出を承認としてreviewerとverifierを順次起動し、並列executorは別の利用者承認なしに追加しない

#### Scenario: reviewerがblockerを報告する
- **WHEN** 独立reviewで修正可能なblockerが見つかる
- **THEN** executorは保存先taskの検証checkboxと親taskが完了済みなら未完了へ戻し、同じexecutorがfix、focused validation、diff reviewを一組として最大3回反復する

#### Scenario: 3回後もblockerが残る
- **WHEN** 3回目の修正cycle後もblockerが解消しない
- **THEN** executorは成功扱いせず停止し、状態と再計画案を利用者へ提示する

#### Scenario: final verifierがblockerを報告する
- **WHEN** initial reviewの修正と最新入力のproject checks後、独立verifierがblockerを報告する
- **THEN** executorは保存先taskの検証checkboxと親taskを未完了へ戻してfinding、影響、再計画案を提示し、利用者の新cycle承認後だけfix、独立review、project checks、前cycleと別のverifierを実行する

#### Scenario: 同じagent taskが連続失敗する
- **WHEN** 同一役割・taskのagentが利用可能な成果を返さず連続2回失敗する
- **THEN** executorは自動再試行を停止し、失敗状態と再計画案を利用者へ提示する。正常なfinding報告はagent failureに数えない

#### Scenario: infrastructure failureが再現する
- **WHEN** 環境、command、入力を記録した後の許可された1回の再試行でも同じinfrastructure failureが再現する
- **THEN** executorは成功扱いせず停止し、2回の同一性と代替案を利用者へ提示する

#### Scenario: 仕様判断が必要になる
- **WHEN** 承認済みrequirements / scenariosから導出できない外部挙動またはtrade-offを決める必要がある
- **THEN** executorは実装を停止し、利用者承認後だけ仕様、spec-holes、validation、tasksを更新する

#### Scenario: material expansionが必要になる
- **WHEN** 公開interface、security / trust boundary、外部write、永続データ、dependency / lockfile、build / CI、独立成果が実行予算外で必要になる
- **THEN** executorは実装を停止し、影響とOpenSpec更新案を提示し、利用者承認後だけspec-holes、validation、tasks再構成を行う

#### Scenario: 検証証跡を記録する
- **WHEN** focused test、review、project check、verificationを実行する
- **THEN** repositoryにはcommand、結果、未検証理由の要約だけを残し、生log、一時report、tool固有stateを品質判定へ使わない

### Requirement: OSWF-6 GSD 固有統合をコアから互換なしで削除する

repository は MUST GSD 固有package、CLI、Taskfile entry、scripts、skill behavior、tests、fixtures、現行運用文書を削除し、compatibility shimまたはaliasを残さない。tracked pathとtextに対するcase-insensitiveな`(?i)(^|[^a-z0-9])gsd([^a-z0-9]|$)`相当のtoken境界scanを行い、`-`、`_`、`/`を含むseparator違いを検出しなければならない。該当tokenは最終的にSuperseded ADRとv2 release notesのexact pathだけに許可し、現行code、tests、skills、設定、OpenSpec project規約、利用者向け現行docsでは拒否する。実装中は本OpenSpec change directoryだけを一時例外にできるが、pre-merge close後に残してはならない。

#### Scenario: 旧CLIまたはtaskを呼ぶ
- **WHEN** 利用者が削除済みhandoff CLI、module、またはTaskfile entryを呼ぶ
- **THEN** repositoryは互換転送や説明専用shimを提供せず、通常の不存在errorを返す

#### Scenario: GSD文字列が現行contractへ再導入される
- **WHEN** allowlist外のtracked pathまたはtextに大文字小文字や`-`、`_`、`/`を含むseparator違いの`gsd` tokenが追加される
- **THEN** offline contract testと`task check`は失敗する

#### Scenario: 外部化changeを実装中である
- **WHEN** 本changeのproposal、design、spec、tasksがactive directoryに存在する
- **THEN** residual scanはそのexact directoryだけを一時例外として許可し、pre-merge close後のtracked treeではSuperseded ADRとv2 release notesだけを許可する

#### Scenario: 旧判断を参照する
- **WHEN** 設計判断の履歴を調査する
- **THEN** Superseded statusと後継ADRへのlinkを持つ旧ADRから確認できる

#### Scenario: v2利用者が移行方法を確認する
- **WHEN** v1のhandoff integration利用者がv2 release notesを読む
- **THEN** 削除された入口、shimなしのbreaking change、OpenSpec直接実行への移行方法を確認できる

#### Scenario: 旧grillまたはretrospectiveを配布する
- **WHEN** 現行テンプレートの設計資料を検索する
- **THEN** ADRとrelease notes以外の旧資料にGSD前提を残さず、現在の規範と競合させない

#### Scenario: paused updater changeを再構成する
- **WHEN** 本changeのmerge後に`add-deterministic-skill-updater`を最新`main`から再開する
- **THEN** 同changeの最初のmigration taskはGSD planning artifactsを移植せず、再構成後のtracked treeに`.planning/`が存在しないことを検証する実装・検証checkboxを持つ

### Requirement: OSWF-7 core checksを外部tool非依存にする

`task check:isolated`は MUST network、OpenSpec CLI、外部orchestratorがない隔離環境で通常の`task check`を実行し、特定orchestratorのHOME、command、version、在席を検査しない。OpenSpec CLIは任意validation engineとし、不在時も同じMarkdown artifactsとcheckbox規律で実装できなければならない。

#### Scenario: 隔離環境でcore checksを実行する
- **WHEN** network proxyが到達不能で、OpenSpec CLIと外部orchestrator commandがPATHにない
- **THEN** `task check:isolated`はcore dependenciesだけで`task check`を完了する

#### Scenario: 外部orchestratorが導入済みである
- **WHEN** 通常環境に任意の外部orchestratorが存在する
- **THEN** core check結果はその在席、version、stateに依存しない

#### Scenario: OpenSpec CLIが不在である
- **WHEN** executorがvalidなchange directoryを直接読む
- **THEN** proposal、design、spec、tasksとcheckboxを使って同じ実装順序と完了条件を適用できる

#### Scenario: OpenSpec CLIでvalidationする
- **WHEN** `task openspec:validate`またはCI validation jobを明示実行する
- **THEN** engineによるschema validationを追加で行うが、その導入を通常の`task check`へ要求しない

#### Scenario: external toolが失敗する
- **WHEN** 利用者が明示指定した外部toolが利用不能または途中失敗する
- **THEN** core workflowはtool stateを成功扱いせず、`tasks.md`の完了済みcheckboxと未完了範囲から直接実行を再開できる
