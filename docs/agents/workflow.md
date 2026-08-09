# ワークフロー（OpenSpec / GSD の境界・Skills）

作業方針の単一の正は [AGENTS.md](../../AGENTS.md)。本書はその補助詳細。

## OpenSpec / GSD の責務境界（ADR-0008）

OpenSpec は実行経路を問わず、change の proposal / design / spec delta / 受け入れ基準 /
`spec-holes` と、原本に対する最終完了判定を所有する。GSD は opt-in であり、大規模な単一
change の詳細計画、phase の実行順序・進捗、セッション跨ぎの復帰を所有できる。どちらを使う
場合も仕様と進捗を二重管理しない。

**小規模 change（OpenSpec 直接経路）**

- OpenSpec `tasks.md` が実装・検証の詳細タスク、順序、checkbox 進捗を持つ。
- 人または agent が OpenSpec CLI の指示、もしくは同じ Markdown artifacts を読み、各 task を
  実装・検証して checkbox を更新する。

**大規模 change（GSD 経路）**

- OpenSpec `tasks.md` は handoff、全対応 phases 完了、OpenSpec 原本検証、project checks、close
  の境界ゲートだけを持つ。詳細 plan / task / phase 進捗は GSD が持ち、OpenSpec へ複製しない。
- 各 GSD phase は一つの OpenSpec change と担当範囲を参照する。一つの change を複数 phases に
  分けることはできるが、一つの phase に複数 changes の要件を混在させない。
- 外部動作、受け入れ基準、公開 API、永続データ、trust boundary、重要アーキテクチャ、既存 ADR
  へ影響する判断が必要になったら GSD を停止する。OpenSpec または ADR を先に更新し、
  `spec-holes` と validate を再実行してから影響 phases を再計画する。可逆な内部実装だけは GSD
  側で決めてよい。

### 実行経路の判定

proposal / design / spec delta と `spec-holes` Phase 1 の確定後、`tasks.md` を確定する前に
次の順で判定し、選択理由を `tasks.md` に記録する。

1. 独立してレビュー・出荷できる成果が複数あれば、実行 engine を選ぶ前に OpenSpec changes を
   分割する。
2. 一体の成果が複数セッション、依存順を持つ複数 phases、有益な隔離並列単位、または単一
   コンテキストで安全に完了・検証できない条件のいずれかを持つなら GSD 候補とする。
3. 上記の大規模条件がなく、単一セッションと単一コンテキストで安全に完了・検証できるなら
   OpenSpec 直接経路とする。

直接実行中に大規模条件を満たした場合は、完了済み checkbox を保持し、未完了範囲を境界ゲートへ
再構成する。理由と状態を提示して承認を得た後にだけ GSD へ昇格する。GSD が利用不能または安全に
継続できない場合も直接経路へ自動で戻さず、既存 commits、完了済み phases、未完了範囲、詳細
`tasks.md` の再構成案を提示して承認を得る。

### 実装開始前の実行予算（ADR-0009）

直接 / GSD のどちらの経路でも、仕様と経路の確定後、実装開始前に `tasks.md` へ次の5項目を短く
記録する。これは token 見積もりではなく、恒久成果に対して計画・証跡・検証を比例させる境界である。

| 項目 | 記録内容 |
| --- | --- |
| Route | 直接 / GSD と ADR-0008 の選択理由 |
| 恒久成果 | close / merge 後も main に残り、下流または保守へ直接価値を持つもの |
| 一時実行証跡 | planning / handoff / review 用にだけ保持し、close 前に削除するもの |
| 早期検証 | 最初の環境依存 vertical slice で実行する CI parity / safe dry-run |
| 停止・再計画 | 当初の change / phase / trust boundary を超える条件 |

固定 token、行数、commit、phase 数の一律上限は、変更ごとの安全性と依存関係を表せないため品質の
代理にしない。ただし次の追加は実質的な拡張（material expansion）とし、続行前に同じ実行予算を
更新する。独立して出荷できる恒久成果は先に別 OpenSpec change へ分割し、経路変更は ADR-0008 の
承認境界に従う。

- 独立して出荷できる恒久成果または OpenSpec change
- GSD phase、外部依存、trust boundary
- 通常 CI、永続データ、公開 API

### evidence economy と検証順序

plan、evidence、test、review は、次のいずれかを満たす場合だけ追加する。

1. 既存 gate では捕捉できない distinct failure / seam / risk を検証する。
2. セッション跨ぎの復帰に必要である。
3. 人または agent のレビュー判断に必要である。

該当しなければ新規 artifact を作らず、既存の spec、test、log、review を参照する。通常 CI は main に
残る恒久成果だけに依存させ、pre-merge close で削除する change directory / `.planning/`、または
squash / 履歴なし配布で到達不能になる Git commit を前提にしない。GSD を使う場合も、各 phase / plan
には依存順、隔離レビュー、復帰のいずれかの利用者を要求し、生成可能であることだけを作成理由にしない。

検証は次の順で優先する。上位 seam を安全に実行できない場合は理由付き未検証を記録できるが、その
代替として下位の静的証跡を無制限に増やさない。

1. 高リスクな実動作または safe dry-run seam
2. 公開 interface / integration behavior
3. security property / 境界条件
4. 静的 fixture / prose contract

Git 履歴、rename、offline / tool availability、OS 固有機構へ依存する最初の vertical slice では、該当する
shallow / historyless check、rename-smoke、offline check、実行対象 OS の smoke を全実装完了前に行う。
実行不能なら理由、未検証範囲、代替確認を記録し、成功へ読み替えない。

受け入れ基準と project checks が green で blocker がなければ、nit、独立 hardening、測定 tooling、
自動 token accounting は別 change / 提案へ送り、現在 change の実装と証跡を拡張しない。同じ blocker の
反復または実質的な拡張は追加生成の理由ではなく、停止・再計画の signal とする。

## bounded review convergence

OpenSpec 直接経路では change、GSD 経路では phase を convergence cycle の単位とする。
全スコープ inventory は cycle 開始時に固定する。次の範囲を initial / final review で共通して使う。

- change / phase が所有する変更ファイル。
- canonical spec と acceptance criteria。
- 直接依存と直接利用元、関連 tests / fixtures。
- 変更で触れた trust boundary。

無関係な repository 全体、過去 report、全 `.planning` は inventory に含めない。承認済み scope 外の
要素を追加する必要があれば、下記 material expansion として先に soft stop する。

### Review topology と iteration

実行順序は次に固定する。

1. self-review（cycle の先頭に1回）
2. initial full review
3. fix → focused validation → diff review（最大3 iterations）
4. fresh final full review
5. task check
6. 同じ cycle の executor / reviewers と別の独立 verifier

initial review が clean でも、initial reviewer と別の fresh agent が同じ inventory を final full review する。
finding 修正後は finding、変更差分、直接依存だけを同じ reviewer が再確認する。final reviewer が新しい
finding を報告した場合も、同じ reviewer が修正差分を閉じる。全スコープ review は initial と final の
2回だけとし、差分修正後に反復しない。

1 iteration は、未解決 blocker finding 一式の fix、focused validation、変更差分と直接依存の review が
完了した組を指す。finding 件数では数えない。initial review 開始後から final review と全体 check の収束
完了まで合計最大3 iterationsとする。self-review と full review 自体は数えない。
correctness / contract finding は RED test または再現 probe を先に作る。純 prose の事実誤りは、
矛盾箇所、修正前 evidence、テスト化しない理由を記録する。
mechanical typo / format / unused import は RED を要求せず focused validation だけを行う。

blocker は reviewer の severity label ではなく、次の意味で判定する。

- acceptance criteria または MUST / SHALL の未達。
- correctness、security、data loss、trust boundary の欠陥。
- 必須 validation の失敗または必須 evidence の欠落。
- 安全な merge または phase completion を許可できない状態。

style nit、主観的 refactor、独立 hardening は blocker ではない。defer または dismiss を明示し、iteration や
final review を追加しない。独立価値があれば別 Issue / change 候補の文面を提示できるが、外部 Issue は
自動作成しない。

### Validation cadence と reusable green evidence

各 fix 中は上記3分類に従い、対象に近い focused validation を実行する。全 review 収束後、最新入力で
`task check` を原則1回実行する。focused test で隔離できない integration finding は理由を記録して
`task check` を早く実行でき、その後入力が変わらなければ最終の全体 check として再利用できる。

reusable green evidence は command 単位で、次を現在状態と照合する。

- 実行 command と exit 0。
- source commit。
- 検証入力を含む dirty diff digest、または検証後に input files が無変更である同等の証明。
- source、tests、dependency environment、lockfile、build / CI 設定、対象 fixtures。
- repository real path、worktree、source snapshot、command に影響する OS、locale、認証などの環境。

入力同一性が1項目でも不明なら再実行する。別 worktree / container / toolchain は同一性を証明できる場合だけ
例外とする。`task check` と `task openspec:validate` は入力集合が異なるため evidence を相互に代用しない。
`.planning` の進捗や report など証跡だけの変更も、対象 command が読むならその evidence を無効にする。

全体 check の source / test failure は blocker finding とし、残 iteration で fix、focused validation、
diff review、全体 check 再実行を行う。full review は再実行しない。source 変更のない infrastructure /
flaky failure は iteration に数えず、同一入力の自律 retry を1回だけ許す。再現した場合は blocker として
soft stop する。source / test を変更した場合は通常の iteration と数える。

verifier は同じ cycle の executor / reviewers と別の独立 agent とする。soft-stop 後の新 cycle では、
旧 cycle の verifier が fix に関与せず、context contamination がなく、最新入力との evidence identity を
再確認できる場合だけ再利用する。条件を満たさなければ別の独立 verifier を割り当てる。直前の green evidence の command 単位の
入力同一性を確認できれば同じ全体 check を再実行しない。ただし acceptance evidence の独立確認と、不足する
focused tests / 実動作 seam は省略しない。

### Agent allocation

一体の change / phase の material 実装は原則1 executorが継続する。executor が利用可能で working state と
context が健全なら finding fixer に再利用する。終了、失敗、context contamination の場合だけ fixer を1名
追加し、以後の iterations は同じ fixer が継続する。finding ごとに fresh agent を作らない。

main は各 material task の成果を検証してから `tasks.md` を更新する。`STATE`、`ROADMAP`、checkbox、
report path の機械的補正は main が処理する。追加 executor は実行予算に記録した
独立・非重複・個別検証可能な実装単位、agent failure、context contamination に限る。並列化自体を追加理由に
しない。独立単位だけは並列実行できるが、統合 review / fix / final review / verification は規定順序で直列に行う。

成果ゼロ、無応答、採用しない部分差分は iteration を消費しない。部分差分を採用した場合、working state を
既知に収束させ、focused validation と diff review を完了した時点で1 iteration と数える。agent 追加理由を
review / fix report または応答へ記録する。同じ役割の連続失敗2回、または working state の安全性が不明な場合は
soft stop する。

ユーザーが vendored `code-review` skill を明示選択した場合だけ、Standards / Spec の2軸を distinct
verification value のある例外配分として記録する。この場合は追加の標準 reviewer を重ねない。

### Soft stop と新しい cycle

次の場合は iteration 数に関係なく、または上限到達時に作業を停止し、blocker を成功扱いしない。

- 3 iterations 後も blocker が残る。
- blocker 修正に仕様判断が必要である。
- 承認済み scope 外で trust boundary、公開 API、永続データ形式 / migration、runtime dependency /
  lockfile、build / CI / 配布経路、独立出荷可能な成果、OpenSpec change、GSD phase、外部依存を追加・拡張する。
- 同じ役割の連続 agent failure 2回、working state の安全性不明、または許可した retry 後にも
  infrastructure failure が再現する。

承認済み scope 内の変更は、それだけでは material expansion にしない。仕様判断は推測で修正せず、未解決
finding、選択肢、影響 scope、既実行 evidence を提示する。soft stop 時は既存 phase review / fix report または
応答に、cycle と iteration `3/3`（上限到達時）、未解決 blockers、各 iteration の追加差分、focused tests と
最新 green evidence、使用 agent と追加理由、停止理由、継続・再計画・別 change 化・中断の選択肢を記録する。
専用 state / report file は作らない。

人間が継続を選んでも、単純に追加3回を認めない。scope、残予算、全スコープ inventory を再計画し、
iteration 0 の新しい convergence cycle として full scope review から開始する。

### pre-merge close 後の検証

close 前に strict target validate、`task openspec:validate`、`task check`、verifier を完了する。retrospective と
tasks を更新した後は、変更入力に影響する command だけを再実行する。change directory を削除した後、
`task openspec:validate` で active change 0 / green を確認する。静的 contract tests が削除 change artifacts を
入力にしないことを確認済みで、その後の入力同一性を証明できる場合だけ `task check` evidence を再利用する。

### 大規模 change の手動 handoff

自動 bridge が無くても、実行主体は次の固定手順で GSD へ引き渡す。

1. change ID、proposal / design / spec delta / tasks の相対パス、`spec-holes` 完了、validate 結果を
   確認する。
2. GSD を選ぶ理由を `tasks.md` に記録し、詳細 task の代わりに handoff / phases / 原本検証 /
   project checks / close の境界ゲートを置く。
3. 非デフォルトの専用 branch 上で canonical artifacts をレビュー可能な commit に固定する。
   既存 dirty changes を自動 stash / commit しない。
4. GSD に change ID、canonical artifact paths、source commit、完了済み境界ゲート、未解決事項を
   渡す。必要な GSD capability を確認できなければ存在を推測して artifacts を生成せず、停止する。
5. 各 phase に元 change と担当範囲を対応付け、一つの phase に複数 changes を混在させない。
6. 各 phase 完了後に GSD の進捗を更新し、main 実行主体が対応する OpenSpec 境界ゲートを更新する。

自動化する場合の入口は first-party `execute-openspec-change` skill である。規範は canonical
OpenSpec の `design.md` §「5. skillはhandoff開始までをオーケストレーションする」/ §「10. GSD
capability contractは1.5.0 exactの複合signalへ固定する」と、`spec.md` §「Requirement:
policyとcapabilityのpreflight後にGSD handoffを開始する」のままであり、skill は handoff 開始後の
lifecycle や最終完了を所有しない。

operator sequence は次の順序に固定する。

1. Phase 1 bridge の read-only inspect と host schema 検査を行い、change ID、全 canonical paths、
   source commit、manifest path、capabilities、dispatch と決定論的な `input_route` label/state
   （`json` / `markdown-fallback`）を preview する。bridge seam は fallback 原因を返さないため、理由を
   推測して表示しない。
2. preview 全体を見せた後に、新たな明示回答を求める。過去の承認、flag、auto mode、tool の存在は
   承認の代用にならない。
3. 承認後だけ同じ frozen inputs を prepare へ渡し、structured result が `ok=true`、
   `operation=prepare`、`known_state=prepared` をすべて満たしたことを確認する。
4. 一つの `PARITY_PAYLOAD` に `change_id`、**全** `canonical_paths`、`source_commit`、
   `completed_boundary_gates`、`unresolved_items`、`one_phase_one_change`、
   `specification_nonduplication` を一度ずつ保持する。未初期化ならその完全な payload だけから
   source-pinned brief を作り `$gsd-new-project --auto @<brief>` へ渡し、初期化済みなら完全な payload を
   change 専用 `$gsd-phase` へ inline で渡す。GSD に仕様・requirement・scenario・受け入れ基準を複製しない。
5. host workflow の **structured completed-success** と、次の route 固有 read-only postcondition の
   両方が成功した場合だけ accepted とする。exit 0 や prose marker は補助情報にすぎず、それだけで
   `started` を許可しない。
6. accepted 後だけ Phase 1 の started transition を呼ぶ。欠落、checkpoint、空、malformed、partial、
   ambiguous、dispatch failure、postcondition mismatch は `prepared` を保持する。

未初期化 route の postcondition は、dispatch 後に
`node ${GSD_HOME}/gsd-core/bin/gsd-tools.cjs init progress --raw` を再実行し、`project_exists` /
`roadmap_exists` / `state_exists` が true、`project_root` が対象 repository real path、
`agents_installed=true`、`missing_agents=[]` であることを要求する。さらに `.planning/PROJECT.md`、
`.planning/REQUIREMENTS.md`、`.planning/ROADMAP.md`、`.planning/STATE.md` が存在し、その集合が exact
change ID、source commit、全 canonical paths または exact brief reference、completed gates、unresolved
items、one-phase/one-change、specification nonduplication を保持することを read-only で確認する。

初期化済み route は dispatch 直前に maximum integer phase、phase directories、ROADMAP の snapshot を
取り、dispatch 後と比較する。新規追加が exactly one max+1 phase と対応 directory だけで、他 phase /
directory に変化がなく、新 ROADMAP section が inline `PARITY_PAYLOAD` を正確に保持することを要求する。
選択した語句や要約だけでは postcondition を満たさない。

`agent_type` のない host では `generic-agent workaround` を typed dispatch と同等に扱わない。bridge
inspect を read-only で先に使って entrypoint を選べるが、preview approval / prepare より前に、導入済み
local GSD 1.5.0 の選択 entrypoint workflow、選択分岐から到達可能な実 spawn 名すべて、active-config
配下の対応 TOML と完全な role preamble、全 isolation requirement を解決する。reachability、TOML
mapping、preamble、isolation が不明、typed-only / worktree-isolated、または generic schema と非互換なら
fail-closed する。

inspect failure / refusal は pre-prepare で停止し、brief、dispatch、manifest state の mutation を一切
行わない。prepare 後の dispatch が accepted でなければ `prepared` を保持し、完了済み step と同じ
frozen inputs による manual continuation evidence を報告する。自動 retry、route switch、rollback は
行わない。manifest 成功後は常に manifest path と source commit を示し、operator がレビュー後に
**別の後続 tracking commit**を作るよう案内する。skill 自身は Git commit、push、PR、merge を行わない。

`.planning/openspec/<change-id>/handoff.json` は canonical artifacts を固定した source commit の後続
commit で feature branch に追跡する復帰用索引であり、仕様の正本ではない。`git check-ignore` と
repository policy で追跡可能性を確認できなければ prepare 前に停止する。MVP は handoff 後の
plan / execute / resume / verify / finalize、retry / recovery、cleanup を自動化しない。

Phase 2 の通常 CI が検証するのは静的な SKILL / fixture instruction contract と既存 Phase 1 の動的
state seam だけである。実 host prompt、generic spawn、実 GSD route mutation、route postcondition は
Phase 2 では未検証で、Phase 3 の opt-in / manual evidence が所有する。

全 GSD phases の完了だけでは change 完了にならない。main 実行主体は OpenSpec 原本の全
requirement / scenario / `spec-holes` を実装・テスト・理由付き未検証へ対応付け、
`task openspec:validate`、`task check`、文書リンクを検証してから最終境界ゲートを完了にする。

テンプレート自身は一つの PR に一つの active change だけを載せる。依存 changes は先行 change の
pre-merge close / merge 後を base とする専用 branches で順番に実装し、main や OpenSpec backlog
へ proposal を複製しない。各 PR の最終コミットで対象 change directory を削除し、main の
`openspec/changes/` を空に保つ。追跡manifestも既存close policyに従いpre-mergeで人が削除し、MVPは
自動finalize / cleanupしない。

## OpenSpec engine のアクセス形態と Markdown fallback（ADR-0008）

OpenSpec engine には **2 つのアクセス形態**があり、両者は別物。実機は `openspec` CLI が
入る形態のため CLI を第一線に置く。

**(a) `openspec` CLI（Node 製・第一線）** — `task doctor` は `which openspec` で可用性を確認し、
不在でも WARN に留める（FAIL にしない・自動実行しない）。既存 change を CLI で駆動する導線:

- `openspec list` … change / spec の一覧を出す。
- `openspec instructions apply --change <id>` … 対象 change の apply 指示と context ファイルを
  出力する。出力の `Progress` は `tasks.md` の**チェックボックス進捗**（n/m complete）で、
  タスクの実際の進捗確認はここを見る。CLI は実装や checkbox 更新を自動実行しない。
- `openspec instructions apply --change <id> --json` … `contextFiles` の artifact paths と、
  `progress` / `tasks` を返す。JSON に canonical な本文は含まれないため、proposal / design /
  spec delta / tasks の内容は必ず列挙された Markdown ファイルから読む。JSON は artifact discovery
  と進捗取得だけに使う。
- `openspec status --change <id>` … **artifact 単位**の完了状態（`proposal` / `tasks` / `specs`
  ファイルが存在するか）を表示する。`tasks` artifact は `tasks.md` が在れば未チェック項目が
  残っていても done 扱いになるため、**タスクのチェックボックス進捗は上の `instructions apply`
  の `Progress` で確認する**（status では見落とす）。
- `openspec validate <id>` … proposal / spec delta の形式検証（SHALL 1 行目制約など）。
  PR 前チェック: change を含むブランチでは `task openspec:validate`（invalid で FAIL する
  ゲート・engine 必須）で全 change の validate green を確認する。CI（ci.yml の
  `openspec-validate` ジョブ）でも同じ gate が走る（空の changes/ では trivially green）。
- `openspec archive <id>` … change を確定し `specs/` へマージする。ただし**このテンプレートは
  archive せずマージ前の削除で close する**（テンプレ自身の change 運用は
  [openspec/project.md](../../openspec/project.md)）。

CLI は実装 engine ではなく、tasks の**自動チェックマークを付けない**。小規模 change では、
各タスク完了時に `tasks.md` の `- [ ]` を `- [x]` へ更新するのは実行主体（能動規律）。大規模
change では GSD が詳細 plan / phase 進捗を更新し、main 実行主体が OpenSpec の対応する境界ゲート
だけを更新する。task をサブエージェントへ委譲した場合、サブエージェントはマークしない
（下記「material task の executor 配分」）。

**(b) スラッシュコマンド `/opsx:*`（任意・別導入）** — Claude Code のスラッシュコマンド統合で、
上記 CLI とは**別物**。CLI をインストールしただけでは `/opsx:apply` 等は存在しない（別途導入が
要る・このテンプレートは同梱しない）。動詞の対応は `/opsx:apply` ≈
`openspec instructions apply --change <id>`。

どちらの形態も無くても（engine 不在でも）境界は崩れない。JSON 契約が非互換な場合も含め、
固定された OpenSpec directory 規約から同じ Markdown files を読み、`tasks.md` の checkbox から
進捗を算出する。エンジンはあくまで discovery と検証の補助で、境界の前提ではない。手書きで
運用する場合の最小形式（エージェントが勝手な形式を作らないための固定形式）:

- 各 change ディレクトリは `proposal.md` / `tasks.md` を必須とし、振る舞いが変わる場合のみ
  `specs/<capability>/spec.md` を持つ。
- `spec.md` の各 requirement 本文は **1 行目**に SHALL / MUST を置く。engine parser は
  1 行目のみで判定するため、折返しで 2 行目以降に落とすと `openspec validate` が ERROR に
  なる（全角括弧は可）。
- `tasks.md` は GitHub チェックボックス形式の番号付きリスト。例:
  ```markdown
  - [ ] 1. 実装 ...
  - [ ] 2. テスト追加 ...
  - [ ] 3. `task check` を通す
  ```
- 小規模 change の実行主体は各詳細 task の実装・検証後に `tasks.md` を `- [x]` へ更新する。
  CLI 不在の fallback でも同じ能動規律を適用する。
- 大規模 change は上記の固定手順で手動 handoff し、GSD の詳細 plan / phase 進捗と OpenSpec の
  境界ゲートを分離する。GSD は change の canonical paths を参照し、仕様や受け入れ基準を複製・
  再定義しない。GSD が利用不能でも直接経路へ自動 fallback しない。

`openspec init` は**新規プロジェクト用**。既存テンプレでは `openspec/project.md` を
`config.yaml` へ移行するハザードがあるため**このリポジトリでは実行しない**。既存 change の
実装に init は不要（CLI は init 無しで `instructions apply` / `status` / `validate` が機能する）。
engine の生成物もこのテンプレートにはコミットしない（Node 依存・engine version 結合を避けるため）。

## 初めての change（quickstart）

初めて change を切るときの最小手順。各制約の定義本文は上記「OpenSpec engine のアクセス形態と
Markdown fallback」節（以下 fallback 節）と [openspec/project.md](../../openspec/project.md) が
owner のままで、ここでは順序だけを示す。

1. **proposal 作成** — `openspec/changes/<id>/proposal.md` に何を・なぜを書く。change
   ディレクトリは `proposal.md` / `tasks.md` が必須で、振る舞いが変わる場合のみ
   `specs/<capability>/spec.md` を持つ（構成は上記 fallback 節）。proposal 確定前に
   `spec-holes` フェーズ 1 で未定義の振る舞いを列挙して潰す（[AGENTS.md](../../AGENTS.md)）。
2. **spec delta 作成（振る舞い変更時のみ）** — 各 requirement 本文の 1 行目に SHALL / MUST
   を置く（制約の詳細は上記 fallback 節）。
3. **経路判定** — 独立出荷可能な成果が複数あれば changes を分割する。一体の成果は上記の
   大規模条件を一つでも満たせば GSD 候補、それ以外は直接経路とし、理由を `tasks.md` に記録する。
4. **tasks / handoff 準備** — 直接経路の `tasks.md` には詳細 task を置く。GSD 経路では境界ゲート
   だけを置き、上記固定手順で専用 branch の reviewable commit から手動 handoff する。
5. **実装** — 直接経路では `openspec instructions apply --change <id>` の指示、または engine
   不在時の Markdown fallback に沿い、各 task の実装・検証後に checkbox を更新する。GSD 経路
   では詳細 plan / phase 進捗を GSD で管理し、仕様変更は OpenSpec へ戻してから再計画する。
6. **原本検証 / PR 前チェック** — 実行経路とは別に OpenSpec 原本との対応を確認し、
   `task openspec:validate` で全 change の validate green を確認する
   （engine 必須・CLI 不在時は導入案内を出して FAIL する）。`proposal.md` / `tasks.md` を
   欠く change と、`tasks.md` に整形式の checkbox 行（`- [ ] ` / `- [x] `）が無い・
   checkbox が崩れている change は preflight で FAIL する。engine を導入しない運用では、
   上記 fallback 節の最小形式（全項目）を手動で確認する。
7. **pre-merge close** — 一つの PR に一つの active change だけを載せ、マージ前の最終コミットで
   change ディレクトリを削除して main に載せない。依存 change は先行 change の merge 後を base
   とする専用 branch で段階的に実装する（規約は [openspec/project.md](../../openspec/project.md)）。

## change close 時の軽量ふりかえり（テンプレート自身の運用）

各ゲート（self-review / クロス AI レビュー / CI）の欠陥補足率を事後に集計できるようにする
軽量規約。**テンプレート自身の change 運用にのみ適用**する（下流リポジトリは任意採用。
採用する場合は自リポジトリの記録先を定める）。機械検査・集計自動化は持たず、backstop は
self-review の規約適合チェックと目視。

- **記録先**: `docs/template/retrospectives.md`（`docs/template/` 配下＝
  prune-template-docs の削除対象。テンプレ運用データを下流に漏らさない。prune 済み環境には
  存在しないため意図的にリンクにしない）。ファイルが無ければヘッダ付きで再作成してから
  追記する。
- **タイミング**: close コミット（マージ前の最終コミット）までに末尾へ 1 行追記する。
  忘れたままマージした場合は気づいた時点で遡及追記する。マージに至らず破棄された
  change は記録対象外。
- **形式（固定 1 行・改行しない・1 change = 1 行）**:
  ```markdown
  - YYYY-MM-DD <change-id>（PR #N）: 逃した欠陥 <計> 件（self-review=a / review=b / CI=c / merge後=d）— 一言（任意）
  ```
  日付は close 時のローカル日付（厳密性不要）。`<計>` は 4 経路の合計。
- **「逃した欠陥」の定義**: 当該成果物を作った実装 task の完了マーク（`- [x]`）後に発見され、
  **修正を要した正しさ・仕様不一致の欠陥**（docs の事実誤り含む）。実装中の自己修正・
  style nit・主観的リファクタ提案・回答のみで済む質問は数えない。同一欠陥は最初に発見された
  経路でのみ数える。**0 件でも記録する**（不在と記録忘れを区別するため）。境界の判断は
  記録者に委ね、迷ったら一言欄に補足する。
- **発見経路（4 分類固定）**: `self-review`（自己 diff 検査）/ `review`（自分以外のマージ前
  レビュー。クロス AI・人間を問わない）/ `CI`（自動チェックの赤）/ `merge後`（マージ後に
  発見された欠陥全般。revert 含む）。
- **更新規則**: 行の記入後に発見があれば（マージ前後を問わず）該当経路のカウントへ既存行を
  更新する（新行を足さない）。`merge後` の更新時は一言欄に発見場所（修正 PR / commit /
  issue 等）を追記する。原因 change を特定できない欠陥は無理に帰属させず記録対象外とする。
- **soft stop の任意 suffix**: soft stop が発生した場合だけ、既存 Issue または上記 retrospective の
  どちらか一方の1行へ `soft-stop: cycle=<n> iterations=<n> full-checks=<n> added-agents=<n> reason=<理由>`
  を追記する。発生しなければ省略し、両方への重複記録や常時 accounting は行わない。

この記録は、仕様時列挙（spec-holes）＋PBT 先行の**効果測定**であり、追加のバグ削減注入点
（契約 / 敵対的仕様攻撃 / mutation testing）の採否判断材料になる（判断は人起点）。

## material task の executor 配分

一体の change / phase では、一つの executor が canonical artifacts 一式を読み、material tasks を継続する。
main は task ごとに diff と必要な focused validation を確認し、合格後だけ `tasks.md` を更新する。executor は
main の検証前に checkbox を更新しない。`STATE`、`ROADMAP`、checkbox、report path の機械的補正は main が処理する。

独立・非重複・個別検証可能な実装単位がある場合だけ、実行予算へ単位と統合方法を記録して追加 executor
へ委譲できる。依存する tasks、review / fix / final review / verification は直列にする。長大化や context
contamination が見込まれる場合は task 分割と実行予算を再計画し、task ごとの fresh agent 生成で代用しない。

agent failure、無応答、空報告、部分成果がある場合、main は採用・修正・不採用を明示し、working state を
既知に収束させてから続行する。成果・受け入れ基準・設計判断に影響する新しい決定は prompt だけに置かず、
proposal / design / spec delta へ戻してから executor を再開する。

## Skills（vendoring・コア候補のうち再配布可のもの）

skill 実体は `.agents/skills/<name>/` が単一の正。Claude Code 用 `.claude/skills/` と Codex 用
`.codex/skills/` はそこへの相対 symlink で、両エージェントが同一 SKILL.md を参照する。

vendoring しているコア skill（すべて MIT・再配布可。供給元 / commit / sha256 は
[`.agents/skills/skills.lock.json`](../../.agents/skills/skills.lock.json) に記録）:

| skill | 用途 | 供給元 |
| --- | --- | --- |
| `grill-me` | 設計・実装方針・PR 前のセルフレビュー（`grilling` を呼ぶ） | mattpocock/skills |
| `grill-with-docs` | ドキュメント込みの設計レビュー（`grilling`＋`domain-modeling`） | mattpocock/skills |
| `grilling` | 実際の relentless インタビュー本体（上記 2 つが依存） | mattpocock/skills |
| `domain-modeling` | ドメインモデル / ADR / 用語の整備（`grill-with-docs` が依存） | mattpocock/skills |
| `tdd` | failing test 先行で実装暴走を防ぐ | mattpocock/skills |
| `code-review` | 2 軸（Standards / Spec）でブランチ diff をレビュー（`tdd` のリファクタ段が参照） | mattpocock/skills |
| `diagnosing-bugs` | bootstrap / uv sync / pre-commit / MCP 起動失敗の切り分け | mattpocock/skills |
| `caveman` | 過度な複雑化・不要な抽象化・テンプレ肥大化を止める | JuliusBrussee/caveman |
| `self-review` | コミット / PR 前の自己 diff 検査（明白な欠陥は修正・判断事項は報告のみ） | 自作（local） |
| `verify-change` | 変更後の実動作確認（command 単位 evidence 確認→全体 check の再利用 / 実行→個別テスト→実動作） | 自作（local） |
| `spec-holes` | 仕様の穴（未定義の振る舞い）の機械的列挙とテスト化（固定タクソノミー 12 分類） | 自作（local） |
| `execute-openspec-change` | source-pinned OpenSpec change の preview・明示承認・GSD handoff 開始（最終完了や lifecycle は対象外） | 自作（local） |

> `grill-me` / `grill-with-docs` は薄いラッパーで、本体の `grilling`・`domain-modeling`
> skill に委譲する。再現性のため依存先も同梱している（単体では機能しないため）。

> `code-review` は特殊ケース。`tdd/SKILL.md` がリファクタ段の導線として名前で参照するため、
> 上流兄弟 skill を byte-match で同梱した（名は `code-review` 固定・別名不可）。Claude Code の
> ビルトイン `code-review` と**名前衝突するが許容**（機能重複・意味的に正参照）。本体は
> `docs/agents/issue-tracker.md` 等のソフト依存を持つが、この repo に無くても Spec 軸は
> degrade する（hard-stop しない）。また Spec 軸の spec 自動探索は OpenSpec レイアウト
> （`openspec/changes/*/`）を含まない（byte-match 維持のため上流のまま）。この repo で Spec
> 軸を使う時は spec 引数に `openspec/changes/<id>/` を明示すれば回復する（spec 適合自体は
> `spec-holes`＋`openspec validate` が別途担うため劣化の実害は小さい）。経緯は Issue #35。

> `spec-holes` は 2 フェーズ運用で強制度が非対称。**フェーズ 1（仕様時）は無条件**:
> OpenSpec proposal / spec delta の確定前にタクソノミーを全項目当て、穴を
> 「仕様に明記 / スコープ外と明記 / ユーザ確認」のいずれかで必ず潰す。
> **フェーズ 2（実装時）は努力目標**: 穴を例示テスト / Hypothesis property に対応付け、
> 落とせないものは「未検証」と理由を明記する（対応表の漏れは `self-review` が照合）。

- 起動: 各エージェントの skill 機構で名前指定（例 `grill-me`）。`caveman` は明示起動が基本。
- `caveman` の自動発火（hook）は Claude 固有のオプション。手順は
  [docs/optional/caveman-hook.md](../optional/caveman-hook.md)（自動登録しない）。
- 外部 skill は自動で latest 更新しない。symlink の修復は `task skills:update`、整合検証は
  `task skills:doctor`（`tests/test_skills_lock.py` がハードゲート）。上流乖離の可視化は
  `task skills:upstream`（opt-in・ネットワーク使用・gh 必須・報告のみで更新は人起点）。
- 上流取り込み手順（WARN 検知後）: WARN 確認 → 上流 diff レビュー → 取り込み判断（人起点）
  → `.agents/skills/<name>/` の実体更新（上流実体をそのまま反映）→ `skills.lock.json` の
  `commit` / `sha256` 更新 → `task skills:doctor` green で完了判定。doctor が red の間は
  取り込み未完として lock / 実体を修正して再実行する。取り込みは lock・skill 実体の変更を
  伴うため軽微変更に当たらず OpenSpec change を切る。複数 skill の同時取り込みは可
  （lock は skill ごとに更新する）。据え置きと判断した WARN は次回実行時も再表示される
  （据え置きの記録は任意・人判断）。
- `caveman` と AGENTS.md の「最小変更」ルールは役割が近い。caveman は**設計判断時に明示的に
  呼ぶ skill**、AGENTS.md は**常時適用される原則**と整理して重複を避ける。
- 再配布の前提: vendored skill は各 `LICENSE` に従う（ルート LICENSE=MIT とは別。ADR-0001）。

## クロス AI レビュー（オプション）

PR 前後の Codex クロス AI レビュー（人起点のみ・自動送信しない）は
[docs/optional/codex-review.md](../optional/codex-review.md)。
