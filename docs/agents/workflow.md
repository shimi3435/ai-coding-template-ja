# ワークフロー（OpenSpec 直接実行・Skills）

作業方針の単一の正は [AGENTS.md](../../AGENTS.md)。本書は ADR-0010 に基づく補助詳細。

## OpenSpec 直接実行（ADR-0010）

proposal、design、spec delta、受け入れ基準、`spec-holes` を仕様の正本とし、`tasks.md` を実装順序、
進捗、検証状態、セッション復帰の正本とする。コアの実行経路は OpenSpec 直接実行だけである。
OpenSpec CLI や外部 tool 固有 state の有無は品質条件にしない。

### OpenSpec change の適用範囲と分割

次のいずれか一つでも該当する変更は OpenSpec change を必要とする。

- 外部挙動。
- 公開 interface。
- security / trust boundary。
- 永続データ。
- dependency / lockfile。
- build / CI。
- 複数の恒久成果。

どれにも該当しない局所 bugfix、内部 refactor、軽微な文書修正は change を作らず直接変更できる。
直接変更中に列挙条件への該当が判明した場合は作業を停止し、change を確定してから再開する。

独立して受け入れ、review、mergeできる成果は、実行 engine を選ぶ前に別 changes へ分割する。一体の
受け入れ結果に必要な成果は、task 数、行数、セッション数を分割基準にせず、同じ `tasks.md` の
依存付き section で管理する。

### tasks.md の最小契約

各 task は次の項目を持つ。

- 成果。
- 依存。
- 対象。
- 実装 checkbox。
- 検証 checkbox。

冒頭の実行制約は、最初の CI parity、停止・再計画条件、一時 artifact cleanup の3項目だけとする。
固定 token、行数、commit、task 数、セッション数は品質判定や分割の代理にしない。

`## Tasks` sectionにはtask entryを1件以上置く。各対象pathは単一の Markdown inline code span とし、
Unicodeと空白を含むcode span内の値をtrimまたはUnicode正規化せずexactに保持する。閉じていないcode span、
code span外のpath値、一項目内の複数code spanはpreflightで拒否する。異なるtaskの対象pathがexact matchまたは
directory containmentで重なる場合、一方から他方への推移的な依存 pathを要求し、依存関係で順序化されない
重複を拒否する。task entryが0件の場合もrepository変更前に拒否する。

通常 CI が検証する preflight 境界は、`execute-openspec-change` の static skill / instruction fixtures と
恒久 contract tests までとする。実 agent session の preflight は manual / out-of-scope とし、runtime parser
または実 agent CI を追加する場合は、新しい OpenSpec change で仕様、`spec-holes`、検証、実行制約を再設計する。

依存が全て完了した先頭の未完了 task を再開点とする。文書順の先頭 task の依存が未完了なら skip し、
次の実行可能 task を選ぶ。preflight と dirty ownership 確認の失敗は report-only とし、repository を変更しない。
両確認が成功した後に実行可能 task がなければ、文書順で先頭の未解決 task 直下へ blocker と再開条件を記録して
停止する。実装、検証、review、project check の blocker も、選択中 task または先頭の未完了 validation task
直下へ記録する。未完了 validation task がなければ、文書順で最後の task 直下へ記録する。実装と指定検証が成功した
順に対応 checkbox を更新する。環境制約または失敗で検証できない場合、実装 checkbox だけを完了できるが、
検証 checkbox は未完了に保ち change close を禁止する。focused validation と代替静的検証が構造上
存在しない場合だけ、N/A 理由を記録して検証 checkbox を完了できる。

safe boundary 後に file を変更し、実装 checkbox 完了前に `orderly stop` する場合、実装途中 task の
変更 path と digest を `implementation-in-progress` 状態で累積 ownership snapshot へ記録する。再呼出時に
path 集合と digest が一致すれば同じ task の実装を継続する。不一致なら変更前に停止する。process kill や
host crash による `abrupt termination` では snapshot 更新を保証できないため、未記録差分を executor 所有と
推測せず dirty overlap として fail-closed で停止する。

### 外部 orchestrator の opt-in 境界

agent は外部 orchestrator を一般的な候補として提案できる。ただし、利用者が特定の名前を選ぶ前の
read-only 探索、在席確認、plugin 検索、version probe、install、起動は禁止する。明示選択後に使う
場合も OpenSpec の仕様を複製せず、各 task の進捗と検証状態を同じ `tasks.md` へ同期する。外部 tool
state と tasks が競合する場合は tasks を優先し、外部 tool の完了だけでは change close を許可しない。

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
`AGENTS.md` の OSWF-5 だけを単一の正とし、本書では列挙を複製しない。

### Review topology と iteration

OSWF-5 の高リスク条件に該当する change は、次の順序で実行する。

1. self-review（cycle の先頭に1回）。
2. initial independent review。
3. fix → focused validation → diff review（最大3 iterations）。
4. 最新入力の `task check`。
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

各 fix 中は対象に近い focused validation を実行する。review 収束後、最新入力で `task check` を実行する。
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
実動作 seam は毎 cycle 実行する。source 変更のない infrastructure failure は同じ環境、command、入力を
固定して1回だけ再試行でき、再現したら soft stop する。

verifier は initial reviewer と別の独立 agent とする。verifier が blocker を報告した場合、change を
未完了へ戻して soft stop する。利用者が新 cycle を承認した後だけ fix、独立 review、project checks、
前 cycle と別の verifier を実行する。

initial / diff review、project check、verifier のblockerを記録するtaskで検証checkboxが完了済みなら、
停止前にその検証checkboxと親taskを未完了へ戻す。blocker解消後の新しいevidenceが成功した場合だけ、
両checkboxを再度完了へ更新する。

### Agent allocation

一体の change の material 実装と finding 修正は原則1 executor が継続する。追加 executor は
`tasks.md` に記録した独立・非重複・個別検証可能な実装単位、agent failure、context contamination に
限り、起動前に別の利用者承認を必要とする。finding ごとに fresh agent を作らない。

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

close 前に strict target validate、`task openspec:validate`、`task check`、必要な verifier を完了する。
retrospective と tasks 更新後は、変更入力に影響する command だけを再実行する。change directory 削除後、
`task openspec:validate` で active change 0 / green を確認する。削除した artifacts が通常 CI の入力でないと
確認でき、入力同一性を証明できる場合だけ `task check` evidence を再利用する。

## OpenSpec engine と Markdown fallback（ADR-0010）

OpenSpec engine は任意の discovery / validation 補助であり、実装や checkbox 更新を所有しない。

- `openspec list` — change / spec 一覧。
- `openspec instructions apply --change <id>` — 対象 change の context と checkbox 進捗。
- `openspec status --change <id>` — artifact 単位の状態。task 完了判定には使わない。
- `openspec validate <id>` — proposal / spec delta の形式検証。
- `task openspec:validate` — 全 active changes の追加 validation gate。

CLI がない場合も固定ディレクトリから Markdown files を読み、同じ順序と完了条件で直接実行する。

- 各 change は `proposal.md`、`tasks.md`、必要な `design.md` を持つ。振る舞い変更時は
  `specs/<capability>/spec.md` も持つ。
- spec delta の各 requirement 本文は1行目に SHALL / MUST を置く。
- proposal、design、spec delta の `spec-holes` に未解決判断を残さない。
- `tasks.md` は上記の実行制約3項目と、成果、依存、対象、実装 checkbox、検証 checkbox を持つ
  番号付き task で構成する。
- 実行主体は依存完了済みの先頭未完了 task から実装・検証し、結果に対応する checkbox を更新する。

`openspec init` は新規プロジェクト用である。既存テンプレートでは `openspec/project.md` からの移行を
伴うため実行しない。engine 生成物もコミットしない。

## 初めての change（quickstart）

1. `openspec/changes/<id>/proposal.md` に何を・なぜを書く。
2. 振る舞いを変える場合、`specs/<capability>/spec.md` を作る。
3. proposal 確定前に `spec-holes` で未定義の振る舞いを列挙して解決する。
4. 独立出荷可能な成果を別 changes に分割し、一体成果の詳細 task と依存を `tasks.md` に書く。
5. `tasks.md` の依存完了済み先頭未完了 task から実装・検証し、checkbox を更新する。
6. 全 requirements / scenarios / `spec-holes` を実装と検証へ対応付け、`task openspec:validate` と
   `task check` を実行する。
7. テンプレート自身ではマージ前の最終コミットで change directory を削除し、active change 0 を検証する。

## change close 時の軽量ふりかえり（テンプレート自身の運用）

close までに `docs/template/retrospectives.md` へ固定形式の1行を追記する。

```markdown
- YYYY-MM-DD <change-id>（PR #N）: 逃した欠陥 <計> 件（self-review=a / review=b / CI=c / merge後=d）— 一言（任意）
```

「逃した欠陥」は実装 checkbox 完了後に発見され、修正を要した correctness / contract defect とする。
実装中の自己修正、style nit、主観的 refactor、回答だけで済む質問は含めない。同一欠陥は最初の発見経路
だけに数え、0件でも記録する。後から発見した場合は新しい行を足さず既存行を更新する。

例外として、change ID 自体が retired legacy token を含み、固定形式の行を
`docs/template/retrospectives.md` に置くと最終 residual allowlist に違反する場合だけ、固定形式の本体を exact history allowlist
として指定済みの ADR または release notes に保存し、`docs/template/retrospectives.md` には archive pointer を残す。
この例外は既存 allowlist を拡張せず、両条件を満たさない change の保存先を変更しない。

## material task の executor 配分

一体の change では一つの executor が canonical artifacts 一式を読み、material tasks を継続する。
main は task ごとに diff と必要な focused validation を確認し、合格後だけ `tasks.md` を更新する。

独立・非重複・個別検証可能な実装単位だけ、`tasks.md` へ単位と統合方法を記録して追加 executor へ
委譲できるが、起動前に別の利用者承認を得る。依存 tasks、review / fix / verification は直列にする。成果や設計判断に影響する新しい決定は
prompt だけに置かず、proposal、design、spec delta へ戻してから再開する。

## Skills（vendoring・コア候補のうち再配布可のもの）

skill 実体は `.agents/skills/<name>/` が単一の正。Claude Code 用 `.claude/skills/` と Codex 用
`.codex/skills/` はそこへの相対 symlink で、両エージェントが同一 `SKILL.md` を参照する。

vendoring しているコア skill の用途:

- `grill-me` / `grill-with-docs` / `grilling` — 設計の質問と絞り込み。
- `domain-modeling` — ドメインモデル、ADR、用語整備。
- `tdd` — failing test 先行の実装。
- `code-review` — Standards / Spec の2軸 review。
- `diagnosing-bugs` — 不具合の再現と切り分け。
- `caveman` — 過度な複雑化の抑制。
- `self-review` — コミット / PR 前の自己 diff 検査。
- `verify-change` — 全体 check、focused test、実動作確認。
- `spec-holes` — 未定義の振る舞いの列挙とテスト対応。
- `execute-openspec-change` — OpenSpec change の preflight、直接実装、検証、進捗更新。

供給元、commit、sha256 は [`.agents/skills/skills.lock.json`](../../.agents/skills/skills.lock.json) に記録する。
外部 skill は自動更新しない。symlink 修復は `task skills:update`、整合検証は `task skills:doctor`、
上流乖離確認は `task skills:upstream` を使う。vendored skill は各 `LICENSE` に従う。

## クロス AI レビュー（オプション）

PR 前後のクロス AI レビューは人起点のみとし、自動送信しない。手順は
[docs/optional/codex-review.md](../optional/codex-review.md)。
