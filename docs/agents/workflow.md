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

### pre-merge close 後の検証

close 前に strict target validate、`task openspec:validate`、`./scripts/check.sh`、必要な verifier を完了する。
retrospective と tasks 更新後は、変更入力に影響する command だけを再実行する。change directory 削除後、
`task openspec:validate` で active change 0 / green を確認する。削除した artifacts が通常 CI の入力でないと
確認でき、入力同一性を証明できる場合だけ `./scripts/check.sh` evidence を再利用する。

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
6. 全 requirements / scenarios / `spec-holes` を実装と検証へ対応付け、`task openspec:validate` と
   `./scripts/check.sh` を実行する。
7. テンプレート自身ではマージ前の最終コミットで change directory を削除し、active change 0 を検証する。

## change close 時の軽量ふりかえり（テンプレート自身の運用）

<!-- template-maintenance:start -->
テンプレート自身の close では[保守側のふりかえり手順](../template/release.md#change-close-時の軽量ふりかえりテンプレート自身の運用)に従う。
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
