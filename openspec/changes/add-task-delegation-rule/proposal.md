# OpenSpec task のサブエージェント委譲ルールを追加する

## Why

長い change の実行では、main のコンテキストが実装の diff・テスト出力・試行錯誤で埋まり、
序盤の spec / proposal 理解や決定事項が薄れて後半 task の品質が落ちるリスクがある
（**予防的動機**。このリポジトリで実害はまだ観測していない）。

- 現状、`docs/agents/workflow.md` は tasks.md の形式と進捗マークの能動規律を規定するが、
  **task 実行時のコンテキスト管理**（何を main に残し、何を切り離すか）の規定が無い。
- 両エージェントに task 単位で新しいコンテキストを使う機構が実在する
  （Claude Code: サブエージェント（Agent tool）/ Codex: `multi_agent`。
  codex-cli 0.142.5 で `multi_agent` = stable・有効を実機確認済み）。機構はあるのに
  使いどころの規約が無く、利用が場当たりになる。

## What Changes

docs のみの変更（コード変更なし）:

- **AGENTS.md**: Workflow 節に委譲原則を中立表現で 1〜2 行追加する
  （成果物を作る task は原則サブエージェントへ委譲し、main が検証して進捗をマークする）。
- **docs/agents/workflow.md**: 「task 単位のサブエージェント委譲」節を新設し、
  対象 task の判定基準・文脈受け渡し・検証と進捗マークの責務・直列実行・見送り時の
  理由記録を規定する。既存の「実行主体が tasks.md を更新する」規約に
  「委譲時の実行主体＝オーケストレータ（main）」の読み替えを 1 文追記する。

spec delta は `changes/add-task-delegation-rule/specs/task-delegation/spec.md` に置く
（engine のデルタ必須要件を満たす。close 時削除で `openspec/specs/` 出荷時空を維持）。

## 設計判断

1. **強制度は SHOULD（推奨）**。動機が予防的（実害未観測）であり、2〜3 task の小 change に
   MUST で委譲を強制するとオーバーヘッドが利益を上回る。黙殺の防止は
   「見送る場合は理由を一言残す」の軽い義務で担保する。
2. **委譲対象の判定基準は「成果物（コード / docs）を新規作成または大幅変更する task」**。
   出力量やコンテキスト残量の測定を要さず機械的に判定できる。検査・進捗マーク・
   git 操作・確認系 task は main が直接行う（委譲オーバーヘッドが本体より重い）。
3. **文脈受け渡しは「change ディレクトリ一式を subagent 自身に読ませる」**。
   proposal / tasks / spec delta のファイルを単一の正とし、prompt には対象 task 番号と
   実行上の一時情報（作業パス・環境等）のみを渡す。main による要約の伝言ゲーム（要約
   自体が劣化点になる）を避ける。成果・受け入れ基準・設計判断に影響するファイル未記載の
   決定は**委譲前に proposal / design / spec delta へ追記する**（prompt のみで渡すと後続の
   委譲・再開・レビューで決定が失われ、防ぎたい context 劣化を再導入するため。
   Codex レビュー [high] 反映）。
4. **検証と進捗マークは main**。subagent は成果物と完了報告を返すのみで、main が
   受け入れ検証（diff 確認・必要なら task check）をしてから tasks.md を `- [x]` に更新する。
   品質ゲートが main に残り、tasks.md 編集の競合も生じない。不合格（失敗・無応答・
   空報告含む）時は、working tree の部分成果物を採用・修正・破棄のいずれかで明示的に
   処理して既知の状態へ収束させてから、再委譲か main の直接修正に進む（どちらかは
   main の判断。Codex レビュー [medium] 反映）。
5. **直列のみ**。目的はコンテキスト劣化の防止であり高速化ではない。並列委譲は独立性判定の
   誤りで競合・手戻りを生むため、番号順に 1 task ずつ委譲→検証→マークする。
6. **中立表現**。ルール本文はエージェント名に依存しない表現とし、機構名
   （Claude Code: Agent tool / Codex: `multi_agent`）は workflow.md の詳細節で例として
   併記するに留める（AGENTS.md の「ツール固有の機構設定は書かない」原則と整合）。
7. **subagent 内部の作業規律は新設しない**。subagent もプロジェクト規約（AGENTS.md）の
   適用下で動く前提とし、遵守の backstop は main の受け入れ検証が担う。
8. **機構在席時のみ適用**。サブエージェント機構が使えない環境では main の直接実行で可と
   し、理由記録も課さない（機構の有無は環境の事実であり、実行主体の判断ではないため）。

## spec-holes フェーズ 1 の穴リスト

確定前にタクソノミー 12 分類 × 5 要件を全数当て、該当 9 件を全て「1: 仕様に明記」で潰した
（ユーザ確認を要するトレードオフなし）。self-review 時はこのリストと spec delta を突き合わせる。

| 穴 | 分類 | 潰した場所（spec delta） |
| --- | --- | --- |
| H1 実装系 task ゼロの change | R1×空 | Scenario: 委譲対象がゼロの change |
| H2 「大幅変更」の境界曖昧 | R1×境界値 | Scenario: 「大幅変更」の判定に迷う |
| H3 subagent 機構不在の環境 | R1×型・形式不正 | R1 本文（機構在席時のみ適用） |
| H4 subagent 失敗・無応答 | R1×エラー経路 | R3 本文＋Scenario: 成果が不合格 |
| H5 再委譲時の前回部分成果 | R1×冪等性 | R3 本文（採用・修正・破棄で working tree を収束させてから進む） |
| H6 1 回で終わらない規模の task | R1×巨大入力 | Scenario: 1 回の委譲で終わらない規模の task |
| H7 「一式」の定義（spec delta 無し） | R2×空 | R2 本文（存在するファイル全部） |
| H8 prompt とファイルの矛盾 | R2×重複・衝突 | Scenario: prompt の内容がファイルと矛盾する |
| H9 空報告・誤マークの是正 | R3×空／重複 | R3 本文＋Scenario: サブエージェントが誤ってマークした |

## 受け入れ基準

- [ ] AGENTS.md Workflow 節に委譲原則（中立表現・main が検証してマーク）が 1〜2 行ある。
- [ ] workflow.md の新節に、判定基準（成果物の新規作成 / 大幅変更）・文脈受け渡し
      （change ディレクトリ一式＋task 番号＋実行上の一時情報のみ。決定は委譲前にファイルへ
      追記）・検証と進捗マークの責務（main）・不合格時の working tree 収束（採用・修正・
      破棄）・直列実行・見送り理由の一言記録、が規定されている。
- [ ] 既存の「実行主体が tasks.md を更新」規約に委譲時の読み替え（実行主体＝main）が
      追記され、矛盾が無い。
- [ ] ルール本文が中立表現で、機構名の言及は workflow.md 詳細節の例示に限られる。
- [ ] `task check` が green。
- [ ] `openspec validate add-task-delegation-rule` が green。
- [ ] `openspec/specs/` の出荷時空を維持する（spec delta は change 配下）。

## Non-goals

- **並列委譲の規約化**（直列のみ。将来実害・需要が出たら別 change）。
- **エージェント別の機構チューニング**（subagent の種類選択・モデル選択・Codex 側の
  multi_agent 設定等は規定しない）。
- **subagent 内部の品質規律の詳細化**（tdd 等の skill 起動を委譲 prompt で強制する規定は
  置かない。backstop は main の検証と self-review）。
- **GSD との統合**（GSD の executor 系 agent との関係整理はスコープ外。GSD はオプションで
  あり、本ルールはコアの OpenSpec 運用のみを対象とする）。
- **コンテキスト劣化の測定・効果検証の仕組み**（予防的ルールとして導入し、測定基盤は作らない）。
