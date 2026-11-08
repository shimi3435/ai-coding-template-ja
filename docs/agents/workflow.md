# ワークフロー（OpenSpec 直接実行・Skills）

作業方針の単一の正は [AGENTS.md](../../AGENTS.md)。本書は ADR-0010 に基づく補助詳細。

## OpenSpec 直接実行（ADR-0010）

proposal、design、spec delta、受け入れ基準、`spec-holes` を仕様の正本とし、`tasks.md` を実装順序、
進捗、検証状態、セッション復帰の正本とする。コアの実行経路は OpenSpec 直接実行だけである。
OpenSpec CLI や外部 tool 固有 state の有無は品質条件にしない。

### OpenSpec change の適用範囲と分割

changeが必要となる条件は[AGENTS.md](../../AGENTS.md)を正とする。直接変更中に条件への該当が
判明した場合は停止し、changeを確定してから再開する。

独立して受け入れ、review、mergeできる成果は、実行 engine を選ぶ前に別 changes へ分割する。一体の
受け入れ結果に必要な成果は、task 数、行数、セッション数を分割基準にせず、同じ `tasks.md` の
依存付き section で管理する。

### tasks.md の最小契約

`## Execution Constraints` から次のheadingまでをExecution Constraints sectionとし、exactly 3 項目を置く。
最初の CI parity、停止・再計画条件、一時 artifact cleanupをそれぞれ1回だけ要求し、欠落、重複、余剰を拒否する。
固定token、行数、commit、task数、セッション数を品質判定や分割の代理にしない。

`## Tasks` sectionに番号付きtask entry を1件以上置く。task が0件なら実装前に拒否する。
各taskは成果、依存、対象、実装 checkbox、検証 checkboxを持つ。
task IDの重複、未知の依存、自己依存、循環依存、壊れたcheckboxを拒否する。

対象pathの各項目は単一の Markdown inline code spanとし、repository-relative pathとして解決する。
Unicodeと空白を許可し、trim または Unicode 正規化をせず exact に保持する。
閉じていない code span、code span外のpath値、一項目内の複数の code span、曖昧なpath、repository外pathを拒否する。
異なるtaskの対象pathがexact match または directory containmentで重なる場合、一方から他方への
推移的な依存 pathを要求し、依存関係で順序化されない重複を拒否する。

### 実行・進捗・blocker記録

preflight、dirty ownership、再開時のsnapshot照合は
[execute-openspec-change](../../.agents/skills/execute-openspec-change/SKILL.md)が所有する。
この確認に失敗した段階はreport-onlyであり、tasks.mdを含めrepositoryを変更しない。
両確認に成功したsafe boundary後、以下を順に行う。

1. 依存が全て完了した先頭の未完了 taskを選ぶ。文書順の先頭が実行不能ならskipし、次の実行可能taskを選ぶ。
   未完了taskがあるのに実行可能 task がない場合は、文書順で先頭の未解決 task直下にblockerと再開条件を記録して停止する。
2. taskの成果・対象・受入条件に必要な最小実装を行う。適用可能なら一つのvertical sliceの失敗テストから始める。
3. diffと成果を確認して実装 checkboxを完了にし、指定のfocused validationを実行する。
4. 指定検証が成功したら検証 checkboxを完了にする。両checkboxが完了した場合だけ親taskを完了にし、
   tasks.mdを保存して次の依存済みtaskへ進む。完了済みtaskの再実行は不要である。

環境制約または検証失敗の場合、実装だけを完了にできるが、検証 checkbox は未完了に保ちchange close を禁止する。
focused validationと代替静的検証が構造上非該当の場合だけ、N/A 理由を記録して検証を完了できる。
実装・検証のblockerは選択中taskへ、review / project checkのblockerは先頭の未完了 validation taskへ記録する。
未完了validation taskがなければ、文書順で最後の taskへ記録する。

initial / diff review、project check、verifierのblockerを記録するtaskに完了済みの検証 checkboxがある場合、
停止前に検証 checkbox と親 task を未完了へ戻す。blocker 解消後の新しい evidenceが成功した場合だけ再度完了にする。
中断・再開のownership詳細はexecutor Skillへ戻る。

通常 CIのpreflight検証範囲はstatic skill / instruction fixturesと恒久contract testsまでである。
実 agent session の preflightはmanual / out-of-scopeとし、通常CIへ含めない。runtime parserまたは実agent CIを
追加する場合は、新しい OpenSpec changeで仕様、spec-holes、検証、実行制約を再設計する。

### 外部 orchestrator の opt-in 境界

利用前のopt-in境界は[AGENTS.md](../../AGENTS.md)に従う。明示選択後も仕様を複製せず、
各taskの進捗と検証状態を同じtasks.mdへ同期する。外部tool stateとtasksが競合する場合はtasksを優先し、
外部toolの完了だけではchange closeを許可しない。

### 停止・再計画

仕様判断または material expansion が必要になった場合、完了済み checkbox を保持して利用者承認まで停止する。
影響と OpenSpec 更新案を提示し、承認後にだけ仕様、spec-holes、validation、tasks を更新する。承認済み
scope 内の可逆な実装判断は再計画を要求しない。

### evidence economy と検証順序

plan、evidence、test、review は、次のいずれかを満たす場合だけ追加する。

1. 既存 gate では捕捉できない distinct failure / seam / risk を検証する。
2. セッションをまたぐ復帰に必要である。
3. 人または agent のレビュー判断に必要である。

通常 CI は main に残る恒久成果だけに依存させ、pre-merge close で削除する change directory や、
squash / 履歴なし配布で到達不能になる Git commit を前提にしない。検証は次の順で優先する。

1. 高リスクな実動作または safe dry-run seam。
2. 公開 interface / integration behavior。
3. security property / 境界条件。
4. 静的 fixture / prose contract。

最初の環境依存 vertical slice では該当 CI parity を全実装完了前に確認する。実行不能なら理由、
未検証範囲、代替確認を記録し、成功へ読み替えない。受け入れ基準と project checks が green なら、
blocker でない nit、独立 hardening、測定 tooling は別 change 候補とする。

## bounded review convergence

全変更で self-review と適用可能な focused validation を行う。独立 review / verifier の発火条件は
[AGENTS.mdの独立レビュー必須条件](../../AGENTS.md#独立レビュー必須条件) だけを単一の正とし、本書では列挙を複製しない。

### Review topology と iteration

独立レビュー必須条件に該当する change は、次の順序で実行する。

1. self-review（cycle の先頭に1回）。standalone時もreport-onlyとし、修正は実行担当が行う。
2. initial independent review。
3. fix → focused validation → diff review（最大3 iterations）。
4. 最新入力の `./scripts/check.sh`。
5. initial reviewer と別の独立 verifier。

高リスク条件に該当しない change は self-review、適用可能な focused validation、通常の final checks で
完了判定でき、独立 reviewer / verifier を必須にしない。

1 iteration は、未解決 blocker finding 一式の fix、focused validation、変更差分と直接依存の review が
完了した組を指す。finding 件数では数えない。correctness / contract finding は RED test または再現 probe
を先に作る。純 prose の事実誤りは矛盾箇所、修正前 evidence、テスト化しない理由を記録する。
mechanical typo / format / unused import は RED を要求せず focused validation だけを行う。

blocker は reviewer の severity label ではなく、次の意味で判定する。

- acceptance criteria または MUST / SHALL の未達。
- correctness、security、data loss、trust boundary の欠陥。
- 必須 validation の失敗または必須 evidence の欠落。
- 安全な merge または change completion を許可できない状態。

style nit、主観的 refactor、独立 hardening は blocker ではない。defer または dismiss を明示し、現在の
change を拡張しない。独立価値があれば別 Issue / change 候補の文面を提示できるが、外部 Issue は
自動作成しない。

### Validation cadence と reusable green evidence

本テンプレートの正式な project gate は次のコマンドである。依存導入後に実行する。
script が Task から独立した先行検査を実行し、失敗したら Task を起動しない。

```bash
./scripts/check.sh
```

CI の `check` / 改名後の `rename-smoke` も同じ script を呼ぶ。Taskfile 自身の検査起動を
Taskfile に依存させない。ローカル完了後も、merge 前に PR の hosted CI 成功を確認する。

各 fix 中は対象に近い focused validation を実行する。review 収束後、最新入力で `./scripts/check.sh` を実行する。
focused validation が構造上非該当の場合だけ N/A 理由で完了できる。環境制約または失敗による未実行は
完了にできない。

reusable green evidence は command 単位で、次を現在状態と照合する。

- 実行 command と exit 0。
- source commit。
- 検証入力を含む dirty diff digest、または検証後に input files が無変更である同等の証明。
- source、tests、dependency environment、lockfile、build / CI 設定、対象 fixtures。
- repository real path、worktree、source snapshot、command に影響する OS、locale、認証などの環境。

上記の full input identity は既存のgreen evidenceを再利用する場合だけ要求する。永続化するのは
command、結果、source commit、fresh実行 / green evidence再利用の別、未検証理由の要約だけとし、
full identity bundleは永続化しない。最新入力でfresh実行する場合は旧green evidenceを再利用しない。

入力同一性が1項目でも不明なら再実行する。別 command の evidence は代用しない。focused tests と
実動作 seam は毎 cycle 実行する。証跡だけの変更も対象commandが読む場合はevidenceを無効にする。source 変更のない infrastructure failure は同じ環境、command、入力を
固定して1回だけ再試行でき、再現したら soft stop する。

verifier は initial reviewer と別の独立 agent とする。verifier が blocker を報告した場合、change を
未完了へ戻して soft stop する。利用者が新 cycle を承認した後だけ fix、独立 review、project checks、
前 cycle と別の verifier を実行する。

### Required evidenceと結果の分類

受入条件、MUST / SHALL、project gateに必要なrequired evidenceが欠落する場合、またはrequired性が不明な場合は
blockerとする。未検証をnon-blockerにできるのはoptional seam、明示的scope外、研究環境制約だけであり、理由と影響を示す。
研究環境制約であっても必須検証の欠落を完了扱いしない。

検証結果はverified（成功したcommandと挙動）、not applicable（構造上非該当とN/A 理由）、
unverified（環境制約・失敗・未確認範囲と影響）を区別する。環境制約や失敗による未実行は完了にできない。
実行担当が結果と進捗をtasks.mdへ記録し、report-onlyのself-reviewやspec-holesへ更新を委譲しない。

### Agent allocation

一体の change の material 実装と finding 修正は原則1 executor が継続する。追加 executor は
`tasks.md` に記録した独立・非重複・個別検証可能な実装単位、agent failure、context contamination に
限り、起動前に別の利用者承認を必要とする。finding ごとに fresh agent を作らない。依存tasks、review / fix / verificationは直列にする。
新しい設計判断はpromptだけに置かず、canonical artifactsへ反映する。

main は各 material task の成果を検証してから `tasks.md` を更新する。checkbox や report path の
機械的補正は main が処理する。成果ゼロ、無応答、採用しない部分差分は iteration を消費しない。
部分差分を採用した場合、working state を既知に収束させ、focused validation と diff review を完了した
時点で1 iteration と数える。

### Soft stop と新しい cycle

次の場合は blocker を成功扱いせず停止する。

- 3 iterations 後も blocker が残る。
- 仕様判断または material expansion が必要である。
- 同一役割・task の agent が利用可能な成果を返さず連続2回失敗する。
- 同じ環境、command、入力で infrastructure failure が2回再現する。
- verifier が blocker を報告する。

停止時は finding と影響を提示し、command、結果、source commit、fresh実行 / green evidence再利用の別、
未検証理由の要約だけを `tasks.md` へ記録する。生 log、専用 state、一時 report は追跡しない。利用者が継続を選んでも単純に追加3回を認めず、scope と実行制約を再計画した
新しい cycle として開始する。

## 完了操作の運用選択

close/archiveの直前に、会話・承認済み仕様で選択された運用を確認する。選択済みなら引き継ぎ、毎回の再確認は
要求しない。未選択でも実装・検証は進められるが、完了操作を推測して実行しない。

- **下流archiveを選択**: [下流のarchiveフロー](#下流の-archive-フロー)に従い、同一PRでspec同期・履歴保存を行う。
- **テンプレート保守を選択**: 明示された専用保守手順が提供されている場合だけ、その削除型closeを適用する。手順がなければ停止する。
- **未選択**: close/archiveの前に停止し、運用の選択を求める。実装完了・検証結果と選択待ちを報告し、archive-ready / close-ready判定は保留する。

選択は操作の実行許可と別である。運用選択済みでもreview・検証や明示操作の条件を省略しない。
repository名・remote・保守文書の存在から選択せず、専用手順がない場合に別運用へ自動で切り替えない。

## 下流の archive フロー

下流・通常のOpenSpecでは、同じ実装PRでdeltaをcanonical `openspec/specs/`へ同期し、changeを
`openspec/changes/archive/YYYY-MM-DD-<change-name>/`へ移動して履歴を残す。
実装と仕様の更新を一緒にreview・mergeできるため、archive専用PRを既定にしない。
repository名・remote・保守文書の存在から削除型closeを推測しない。

### 完了状態と引き渡し

- **implementation complete**: 実装checkboxが完了した状態。必須検証・reviewの完了とは別である。
- **archive-ready**: [運用選択](#完了操作の運用選択)で下流archiveを選択済みで、全taskの実装・検証checkbox、必要なローカルreview・verifier・project gateが完了し、
  既知の未解決blockerがない引き渡し状態。PRレビュー待ち・未確認でも報告できるが、その状態を必ず併記し、
  レビュー収束を確認するまでarchiveを実行しない。既知のPR blockerがあればreadyではない。
- **close-ready**: テンプレート保守を明示選択し、専用保守手順が提供されている場合の引き渡し表現。
  実装・検証・review・blockerの条件はarchive-readyと同じで、PRレビュー待ち・未確認も併記し、収束前はcloseしない。
  archiveの許可を意味せず、次操作は専用手順に従う削除型closeとする。
- **archive complete**: spec同期・履歴保存に加え、archive後のreview・必要な再検証が成功した状態。
  archiveコマンドの成功だけでは宣言しない。最終CI、merge、deployの状態とは分けて報告する。

executorは自動archiveせず、対象change、運用モード、上記状態、PRレビューの確認済み/未完了/未確認、blocker、
次の明示操作を報告する。下流は`archive-ready / next: archive`、テンプレート保守は
`close-ready / next: deletion close`とし、新しい状態管理機構は追加しない。
利用者による明示操作または明示的に呼ばれたarchive workflowへ引き渡す。
commit・push・PR作成・mergeの依頼とは区別する。未完了task・必須検証未実行・blockerがあれば、
upstream CLIが警告だけで続行できてもarchive-ready / close-readyにしない。

### 同一実装PRでの手順

1. **実装・focused validation**を完了する。
2. **artifacts・tasks・実装の対応をverify**する。受入条件と必須検証の欠落がないことを確認する。
3. **reviewを収束**させる。共通review手順のself-review、必要な独立review・verifierとproject checks、
   PRレビュー指摘を確認する。PR状態を取得する新しいorchestratorは導入せず、不明ならarchive前で待つ。
4. **同じPRでspec同期・archive**を行う。次節の事前確認後、明示対象だけを処理する。
5. **archive後diffをreview**する。canonical specs、保存したartifacts/tasks、移動先、最終diffを
   実装と照合する。移動前の承認だけで済ませず、適用される独立review条件も確認する。
6. **影響する検証と最終CI**を成功させてからmergeする。証跡再利用は共通の入力同一性に従う。
   [archive後のcanonical検証](#archive後のcanonical検証)、`./scripts/check.sh`とrepositoryで必須のOpenSpec validationを満たす。
   merge直前にarchive・修正commitを含む最新HEADのPRレビュー状態を再確認する。repository規約とGitHub設定に
   適用される必須review・承認、未解決review threadの条件を確認し、失効した必要承認は再取得する。
   必須CIとreviewの両方が成立した場合だけmergeし、不明・未成立ならmergeしない。
   ローカルreviewだけでGitHub上の必要承認を代替しない。archiveはreviewなしの最終追記ではない。

別PRを選べるのは、組織の完了条件がmainへのmerge済み・本番deploy済みである場合、spec管理の責任分離、
またはspec同期の独立reviewが必要な場合だけである。理由、実装PR、担当、対象changeを引き継ぎ、
その条件を満たしてから別PRで手順4〜6を行う。別PRでもOpenSpec validationとarchive後reviewは省略しない。

### 同期・移動前の確認と実行

1. 対象active changeとcanonical spec、予定archive先をrepository-relative pathで明示する。
   欠落・不正なartifacts、repository外・symlink越境・曖昧なpathは変更前に停止する。
   pathはUnicodeや空白を含めexactに扱い、正規化しない。
   v1.3.1のarchive名はUTC日付であり、canonical更新後に算出される。CLI実行直前のUTC日付で予定先を確認する。
   実行日時・報告は日本時間（JST、UTC+09:00）とし、UTC基準の保存先名と区別して記録する。
   change名は確認済みの単一active directory名に限る。空名、`.`、`..`、予約directoryの`archive`、
   使用OSのpath separatorを含む名前を拒否する。利用するCLI版が非対応の名称も実行前に停止し、勝手に改名しない。
2. 対象の既存差分と所有者を確認し、無関係な差分を保持する。既知の実装差分を含む開始前の三者の状態を
   復旧時に照合できるよう確保する。所有者不明の重複差分があれば変更前に停止する。
3. 同名archiveだけでなく同じchangeの既存archive、activeの有無を確認する。既存先へ上書きしない。
   日付を変えて衝突を回避しない。同じcapabilityへの並行changeは、実装事実とdeltaの意図から順序を
   確定して一件ずつ同期する。順序・競合解消が不明なら停止する。bulk処理や自動競合解決はこの手順に含めない。
4. deltaのADDED / MODIFIED / REMOVED / RENAMEDをcanonicalに対応付け、未変更の要件・scenarioを保持する。
   不明な対象を推測したり、deltaファイルでcanonical全体を上書きしたりしない。deltaなしなら同期不要。
   全効果が内容から同期済みと確認できる場合も再適用せず、確認根拠をtasksの検証記録へ残す。
   canonicalに書き込む場合は、全対象について[書き込み先の保護](#canonical書き込み先の保護)を確認してから実行する。
5. CLIが利用できる場合は対象changeを明示して実行する。確認済みの実名を環境変数`change_name`に
   データとして渡してから、次の非対話コマンドを使う。未設定・空ならCLIを起動せず停止する。

   ```bash
   : "${change_name:?確認済みのchange名を環境変数に設定してください}" &&
     openspec archive --yes -- "$change_name"
   ```

   名前をコマンド本文へ直接埋め込んだり`eval`で解釈したりしない。引用は空白・Unicode・shell記号を保持し、
   `--`は先頭ハイフンをoptionとして解釈させない。v1.3.1の新規作成は`^[a-z][a-z0-9]*(-[a-z0-9]+)*$`を
   要求するが、既存changeのarchiveには同じ命名制約はない。shellで安全に渡せることとCLIが受理することは別である。
   `--yes`は対話入力の省略だけであり、利用者の確認や
   前段の完了条件を省略する許可ではない。同期済みを手順4で確認した場合だけ`--skip-specs`で履歴移動する。
   optionはすべて`--`の前に置く。`--no-validate`による検証省略は行わない。利用するCLI版のhelp・公式契約を確認する。
6. canonicalの結果、activeからの移動、archive内の全artifactsとtasksの保持を照合する。
   CLI出力と実際の保存先を予定先と照合する。処理中のUTC日付境界越えによる差なら、その根拠と実保存先を記録する。
   日付差を自動改名・再archiveで直さない。不明・衝突・部分失敗は[復旧手順](#部分失敗再実行とarchive後修正)へ渡す。
   保存先path、同期したcapability（または同期不要の理由）、commandと結果を対象tasksへ記録し、事後reviewへ進む。

### canonical書き込み先の保護

canonical更新前に、書き込み対象を全て列挙し、次の順序で確認する。CLI同期・手動同期・復旧・archive後の
canonical修正に同じ条件を適用する。v1.3.1の`writeFile`はaliasを辿るため、repository内への解決だけでは安全としない。

1. real repository rootを確定し、そこから対象までの既存の全親componentと対象自身を`lstat`相当で確認する。
   内部を指す場合もsymlinkは拒否する。dangling symlinkも拒否し、新規ファイルやdirectoryを作る場合も既存親を確認する。
2. 既存対象は通常ファイルかつリンク数1（`st_nlink` / `nlink`）だけを許可する。hardlinkは共有先が対象内でも拒否する。
   このリンク数条件は親directoryのリンク数には適用しない。親は通常directoryであることを確認する。
3. filesystemのmetadataや対象対応が判定不能なら停止する。リンクの自動unlink・コピー置換などで条件を満たそうとせず、
   既存内容と対象外ファイルを保護し、修復が必要なら別の明示判断へ戻す。
4. 対象と親pathの並行変更を止め、書き込み直前に上記を再確認する。変化・確認不能なら書き込まず停止する。
   文書上の事前確認だけで、確認後のpath差し替えを原子的に防ぐ保証はない。

deltaなし・同期済み確認後の`--skip-specs`など、canonicalを書き込まない操作にはこの書込条件を課さない。
既存のpath・所有者・衝突・事後検証の条件は省略しない。自動同期engineや検査runtimeは追加しない。

### archive後のcanonical検証

CLIが利用できる場合、今回同期・修正したcapabilityを列挙し、仕様が要求するspecの存在・削除と照合する。
存在すべきspecが欠落していれば停止する。同期済みdeltaの履歴移動だけの場合も、その同期先を対象とする。
存在する各対象について、確認済みのcapability名を環境変数`capability`へデータとして渡し、次を実行する。

```bash
: "${capability:?確認済みのcapability名を環境変数に設定してください}" &&
  openspec validate --type spec --strict --no-interactive -- "$capability"
```

同名changeとの曖昧性を`--type spec`で避ける。`--specs`を併用すると全spec検証になるため付けない。
全specの検証を要求するかは既存repository policyに従う。この手順のためにCI gateを追加しない。
deltaなしなどで対象がなければ理由を記録し、対象0件を検証成功に数えない。
CLIの対象0件のexit 0や、`task openspec:validate`のactive-only gateの成功を完了根拠にしない。
保存済みtasksに未完了・検証失敗がある場合も、activeが0件であることを理由にarchive completeへ戻さない。
対象path、commandと結果、未検証理由を保存済みtasksに記録する。失敗・必須検証未実行なら完了を宣言しない。
CLIがない場合は次節の手動確認を行い、CLI検証の未実施と手動確認結果を分けて記録する。
repositoryで必須とされるCLI gateの未実行は、引き続き未完了として扱う。

### CLIなしのMarkdown fallback

[同期・移動前の確認と実行](#同期移動前の確認と実行)の事前確認と同一PRの順序を維持し、同手順5を担当者の手作業に置き換える。
canonicalを書き換える前に[書き込み先の保護](#canonical書き込み先の保護)を確認する。
deltaの4種類を意味に沿ってcanonicalへ反映し、対応するrequirement・scenarioと未変更部分を照合する。
同期済みまたはdeltaなしの場合はその根拠を記録し、specを書き換えない。
保存先名はUTC、実行日時・報告はJSTとする。移動直前のUTC日付で予定先を再確認し、同名先がないことを確認して
change全体を移動する。同手順6で結果を照合する。
自作の同期engineは追加しない。手動操作でも対象path、変更結果、検証結果を明示する。

`task openspec:validate`はCLI必須のactive change向けgateであり、CLI不在時の失敗を手動確認成功へ
読み替えない。またactiveが0件でgreenでもcanonical・archive内容を検証した証拠にはならない。
手動確認では構成・Markdown形式・requirement/scenario・tasks完了・実装対応を対象ごとに検査する。
repositoryがCLI gateを必須としている場合、実行可能な環境で成功するまで未検証・未完了とする。
新しい完了条件の対象は今回作成・変更するarchiveであり、過去archive全件へ最新tasks形式の移行を要求しない。

### 部分失敗・再実行とarchive後修正

衝突、timeout、disk不足、途中失敗時は処理を止め、canonical・active・archiveの実状態を開始前と照合する。
終了コードや表示だけで無変更・成功と推測しない。無条件再実行・自動rollbackは禁止する。
既存差分を保護し、同期済みの部分と未処理部分を特定してから復旧する。方針が一意に決まらなければ利用者へ確認する。
canonicalへの復旧書き込みも[書き込み先の保護](#canonical書き込み先の保護)を満たしてから行う。
既存archiveがあっても再実行の成功とは扱わず、activeの残存・二重適用・artifactsの対応を確認する。
復旧後は同期済み内容を再適用せず、残る移動と事後review・検証を完了する。

merge前に同scopeの修正が発生した場合は、次の順序を守る。

1. 対象archive pathと修正範囲を明示し、既存差分の所有者を確認する。不明な重複があれば停止する。
2. 該当taskの検証checkboxと親taskを未完了へ戻し、blockerと再開条件を記録する。
3. archiveの場所を維持し、実装・canonical specs・保存済みartifacts/tasksを再整合する。
   canonical修正前に[書き込み先の保護](#canonical書き込み先の保護)を再確認する。
   activeへ戻さず、active-onlyのexecute-openspec-changeを再呼出しない。本節の手順を直接適用する。
4. [archive後のcanonical検証](#archive後のcanonical検証)と、影響するfocused validation・review・project checks、最終CIを再実行する。
   stale evidenceは再利用しない。
   新しい検証が成功した場合だけtaskとarchiveの完了状態を戻す。

仕様判断・scope拡大が必要なら共通の停止・再計画に従う。新しい決定をarchiveへの追記だけで確定しない。

参考: [公式archive CLI（v1.3.1）](https://github.com/Fission-AI/OpenSpec/blob/v1.3.1/docs/cli.md#openspec-archive)、
[公式sync](https://github.com/Fission-AI/OpenSpec/blob/main/docs/commands.md#opsxsync)。
v1.3.1はcanonical更新後にarchive先の衝突を検出する経路があり、部分同期が残りうる
（[実装](https://github.com/Fission-AI/OpenSpec/blob/v1.3.1/src/core/archive.ts)）。最新版のrollback保証を遡って適用しない。

## OpenSpec engine と Markdown fallback（ADR-0010）

OpenSpec engine は任意の discovery / validation 補助であり、実装や checkbox 更新を所有しない。
`openspec` CLIはterminalで、`/opsx:*` スラッシュコマンドは対応するAI assistantのchatで使う別の入口である。
詳細は[上流のコマンド説明](https://github.com/Fission-AI/OpenSpec/blob/main/docs/how-commands-work.md)を参照する。

- `openspec list` — change / spec 一覧。
- `openspec instructions apply --change <id>` — 対象 change の context と checkbox 進捗。
- `openspec status --change <id>` — artifact 単位の状態。task 完了判定には使わない。
- `openspec validate <id>` — proposal / spec delta の形式検証。
- `task openspec:validate` — 全 active changes の追加 validation gate。

CLI がない場合も固定ディレクトリから Markdown files を読み、同じ順序と完了条件で直接実行する。

artifact配置と必須fileは[openspec/project.md](../../openspec/project.md)に従う。
spec deltaのrequirement本文は先頭行にSHALL / MUSTを置く。spec-holesに未解決判断を残さず、
task形式・実行順序は上記の共通契約に従う。engineの有無で完了条件を変えない。

`openspec init` は新規プロジェクト用である。既存テンプレートでは `openspec/project.md` からの移行を
伴うため実行しない。engine 生成物もコミットしない。

## 初めての change（quickstart）

1. `openspec/changes/<id>/proposal.md` に何を・なぜを書く。
2. 振る舞いを変える場合、`specs/<capability>/spec.md` を作る。
3. proposal 確定前に `spec-holes` で未定義の振る舞いを列挙して解決する。
4. 独立出荷可能な成果を別 changes に分割し、一体成果の詳細 task と依存を `tasks.md` に書く。
5. `tasks.md` の依存完了済み先頭未完了 task から実装・検証し、checkbox を更新する。
6. 全 requirements / scenarios / `spec-holes` を実装と検証へ対応付け、`./scripts/check.sh` と
   repositoryで必要なOpenSpec validationを実行する。未実行の必須gateは未完了とする。
7. [完了操作の運用選択](#完了操作の運用選択)を確認する。下流を選択した場合は同一PRのarchive手順、
   テンプレート保守を選択した場合は提供された専用close手順に進む。未選択・手順欠落なら操作前に停止する。
   executorの完了報告だけでarchiveせず、選択した手順のreview・再検証・最終CIを完了してからmergeする。

<!-- template-maintenance:start -->
## テンプレート保守のclose（明示選択時のみ）

テンプレート自身の保守作業として明示選択された場合だけ、[保守側の削除型close手順](../template/release.md#テンプレート自身の削除型close)に従う。
<!-- template-maintenance:end -->

## Skills（vendoring・コア候補のうち再配布可のもの）

skill 実体は `.agents/skills/<name>/` が単一の正。Claude Code 用 `.claude/skills/` と Codex 用
`.codex/skills/` はそこへの相対 symlink で、両エージェントが同一 `SKILL.md` を参照する。

vendoring しているコア skill の用途:

- `grill-me` / `grill-with-docs` / `grilling` — 設計の質問と絞り込み。
- `domain-modeling` — ドメインモデル、ADR、用語整備。
- `codebase-design` — module・interface・seam の設計用語と設計原則。
- `tdd` — failing test 先行の実装。
- `code-review` — 利用者が明示的に呼ぶStandards / Specの2軸review。必須工程には追加しない。
- `diagnosing-bugs` — 不具合の再現と切り分け。
- `caveman` — 過度な複雑化の抑制。
- `self-review` — 自己diffの検査と指摘。全モードreport-only。
- `verify-change` — 全体 check、focused test、実動作確認。
- `spec-holes` — 未定義の振る舞いの列挙と検証候補。実行は実行担当が所有する。
- `execute-openspec-change` — OpenSpec change の preflight、直接実装、検証、進捗更新。

code-review等の既存結果は、対象差分・仕様・独立性が当該cycleと一致する場合に独立reviewとして利用できる。
必要なreview結果が欠ける場合は共通review手順で補い、同じ根拠のreviewを重ねない。

上流 engineering Skills の repository 設定は [Issue tracker](issue-tracker.md) と
[用語集・ADR](domain.md) を参照する。用語集の正本は `GLOSSARY.md` である。

### Skill間の呼出とhost差

上流Skillの「Call the Skill tool」は、次の手順で同じrepository Skillへ到達させる。
remote-owned本文の書き換えや、新しいrouter Skillの追加は行わない。

1. 呼出先を `.agents/skills/<name>/SKILL.md` の同名Skillに解決する。両hostのlinkは同じ実体を指す。
   同名のuser Skillや類似Skillで代替しない。未同梱・読込不能・明示的な利用禁止の場合は、
   不足または制約を報告して依存作業を止める。自動installで補完しない。
2. hostがSkill toolを提供していれば、その通常の呼出方法を使う。tool自体が未提供の場合だけ、
   対象のSKILL.mdを読み、必要な参照と指示を同じ作業内で適用する。
   tool呼出の失敗や権限拒否を、ファイル直接読込によって迂回しない。
3. 呼出元の操作範囲、read-only、利用者承認待ち、停止条件を引き継ぐ。参照資料としての呼出は
   参照のままとし、別セッションの開始や実装委譲へ変えない。
   `tdd` からの `codebase-design` は設計用語の参照であり、独立した実行セッションではない。
4. 呼出先の指示を適用してから依存作業へ戻る。`grill-me` は `grilling`、`grill-with-docs` は
   `grilling` と `domain-modeling` の両方を適用し、質問への回答や合意が必要ならそこで待つ。

### 上流Skillのrepository設定と復旧

本テンプレートはIssue trackerと用語文書の設定を同梱し、setup-matt-pocock-skillsは配布しない。
code-reviewに残る「tracker未提供ならsetupを案内する」という条件付きの入口は、このprojectでは次の手順で満たす。

1. AGENTS.mdからdocs/agents/issue-tracker.mdとdomain.mdを読み、利用者指定のrepository・仕様・配置があれば優先する。
   設定が揃っていればその入力で作業を進める。setupの実行や再設定は不要である。
2. 設定が欠落している場合、利用者指定と既存のproject情報・Git履歴から復旧内容を確認する。
   trackerを特定できない場合は利用者へ確認し、trackerに依存する操作を止める。配布元repositoryを作業対象と推測しない。
3. 確定した内容でdocs/agents/の設定文書を復旧・編集する。trackerや用語配置を変更する場合も同じownerを使う。
   共有設定の参照入口はAGENTS.mdに置き、CLAUDE.mdには共通設定を追加しない。
4. 復旧後に参照先と入力を再確認して依存作業へ戻る。setupの自動導入や、設定を理由としたIssue・ラベル等への
   外部writeは行わない。設定文書への編集と、レビュー自体のreport-only等の操作範囲は区別する。
   read-onlyで呼ばれた場合は復旧案と不足入力を報告し、呼出範囲を超えて文書を変更しない。

### Skill配布の管理

review済み供給元、ref、subtree、license、ownershipは [`.agents/skills/skills.sources.json`](../../.agents/skills/skills.sources.json)、
remoteだけのresolved commit、tree hash、legal hashは [`.agents/skills/skills.lock.json`](../../.agents/skills/skills.lock.json) に記録する。
local本文はGitとレビューで管理し、内容lockを持たない。外部由来localのoriginとLICENSE / NOTICEは保持する。

`task skills:links` は現在checkoutのlinkを直接・冪等に修復し、`task skills:verify` はoffline検証する。
上流確認は `skills:check --source <repository> --base <full-sha>`、update / repin / adopt-local / migrateは
これらに `--candidate <independent-clone>` が必須で、`--apply` 指定時だけ候補へ書き込む。
旧 `skills:lock-local`、SemVer探索、元repositoryへのtransaction / rollbackは提供しない。
[公開操作と短絡停止手順](../reference/skill-maintenance.md)、[metadata v2](../reference/skill-metadata-v2.md)を参照する。
通常checkはnetworkや移行用履歴に依存しない。vendored skillは各 `LICENSE` に従う。

## クロス AI レビュー（オプション）

PR 前後のクロス AI レビューは人起点のみとし、自動送信しない。手順は
[docs/optional/codex-review.md](../optional/codex-review.md)。
