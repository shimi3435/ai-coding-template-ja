# ワークフロー（OpenSpec / GSD の境界・Skills）

作業方針の単一の正は [AGENTS.md](../../AGENTS.md)。本書はその補助詳細。

## OpenSpec / GSD の責務境界（ADR-0003）

> 初版の境界（OpenSpec=何を/なぜ、GSD=順序/進捗）は誤り。OpenSpec の change は
> `tasks.md`（実装チェックリスト）を標準内包し `/opsx:apply` がタスク分解・進捗マークまで
> 担う。よって per-change のタスク所有は OpenSpec 側。GSD は横断ロードマップに限定する。

**OpenSpec（コア）= 「何を・なぜ」＋「単一 change 内のタスク」**
- 機能仕様 / 変更仕様の記述、受け入れ基準の定義、互換性・設計判断の記録、実装前の合意形成
- 単一 change 内の実装タスク分解・順序・進捗（`tasks.md` / `/opsx:apply`）
- 成果物: `openspec/specs/*`、`openspec/changes/*`（proposal / tasks / 必要時 specs）

**GSD（オプション）= 「複数 change を横断する上位管理」**
- 複数 change にまたがるロードマップ / フェーズ順序 / マイルストーン / セッション跨ぎ復帰
- 非責務: per-change のタスク分解（OpenSpec `tasks.md` が所有）
- GSD は `openspec/changes/*/tasks.md` を二重化せず、横断の順序付けのみ行う
- 受け入れ基準を GSD 側で新規定義しない（OpenSpec を参照する）

## OpenSpec engine のアクセス形態と Markdown fallback（ADR-0003 / Q12）

OpenSpec engine には **2 つのアクセス形態**があり、両者は別物。実機は `openspec` CLI が
入る形態のため CLI を第一線に置く。

**(a) `openspec` CLI（Node 製・第一線）** — `task doctor` は `which openspec` で可用性を確認し、
不在でも WARN に留める（FAIL にしない・自動実行しない）。既存 change を CLI で駆動する導線:

- `openspec list` … change / spec の一覧を出す。
- `openspec instructions apply --change <id>` … 対象 change の apply 指示と context ファイル
  （proposal / tasks / spec delta）を出力する。出力の `Progress` は `tasks.md` の**チェック
  ボックス進捗**（n/m complete）で、タスクの実際の進捗確認はここを見る。実装はこの指示に沿う。
- `openspec status --change <id>` … **artifact 単位**の完了状態（`proposal` / `tasks` / `specs`
  ファイルが存在するか）を表示する。`tasks` artifact は `tasks.md` が在れば未チェック項目が
  残っていても done 扱いになるため、**タスクのチェックボックス進捗は上の `instructions apply`
  の `Progress` で確認する**（status では見落とす）。
- `openspec validate <id>` … proposal / spec delta の形式検証（SHALL 1 行目制約など）。
  PR 前チェック: change を含むブランチでは `task openspec:validate`（invalid で FAIL する
  opt-in ゲート・engine 必須）で全 change の validate green を確認する。
- `openspec archive <id>` … change を確定し `specs/` へマージする。ただし**このテンプレートは
  archive せずマージ前の削除で close する**（テンプレ自身の change 運用は
  [openspec/project.md](../../openspec/project.md)）。

CLI は tasks の**自動チェックマークを付けない**。各タスク完了時に `tasks.md` の `- [ ]` を
`- [x]` へ更新するのは実行主体（能動規律）。task をサブエージェントへ委譲した場合の実行主体は
オーケストレータ（main）であり、サブエージェントはマークしない（下記「task 単位のサブエージェント委譲」）。

**(b) スラッシュコマンド `/opsx:*`（任意・別導入）** — Claude Code のスラッシュコマンド統合で、
上記 CLI とは**別物**。CLI をインストールしただけでは `/opsx:apply` 等は存在しない（別途導入が
要る・このテンプレートは同梱しない）。動詞の対応は `/opsx:apply` ≈
`openspec instructions apply --change <id>`。

どちらの形態も無くても（engine 不在でも）境界は崩れない。エンジンはあくまで自動化で、
境界の前提ではない。手書きで運用する場合の最小形式（エージェントが勝手な形式を作らない
ための固定形式）:

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
- change を実行する主体（手動・GSD 駆動問わず）は、各タスク完了時に対応する `tasks.md` の
  チェックを `- [x]` に更新する。engine 不在の fallback では `/opsx:apply` が進捗マークを
  担わないため、この能動規律を実行主体が肩代わりする。
- GSD（導入時）は change ディレクトリへ**リンク**するのみで `tasks.md` の内容を複製しない。

`openspec init` は**新規プロジェクト用**。既存テンプレでは `openspec/project.md` を
`config.yaml` へ移行するハザードがあるため**このリポジトリでは実行しない**。既存 change の
実装に init は不要（CLI は init 無しで `instructions apply` / `status` / `validate` が機能する）。
engine の生成物もこのテンプレートにはコミットしない（Node 依存・engine version 結合を避けるため）。

## task 単位のサブエージェント委譲

長い change の実行で main のコンテキストが実装詳細（diff・テスト出力・試行錯誤）で埋まり、
序盤の spec / proposal 理解が薄れるのを防ぐための規律（予防的）。サブエージェント機構が
使える環境でのみ適用し、機構不在時は main の直接実行で可（理由記録も不要）。機構の例:
Claude Code のサブエージェント（Agent tool）・Codex の `multi_agent`。

- **対象**: 成果物（コード / docs）を新規作成または大幅変更する task は、原則として新しい
  コンテキストのサブエージェントへ委譲する（SHOULD）。見送る場合は理由を一言記録する
  （応答内で可）。検査・進捗マーク・git 操作・確認系の task は main が直接行い、委譲対象と
  しない。判定に迷う境界事例は main の判断でよい（見送るなら理由一言）。1 回の委譲で
  終わらない規模の task は、委譲の前に `tasks.md` の task 分割を検討する。
- **文脈受け渡し**: サブエージェントには change ディレクトリ一式（proposal.md / tasks.md /
  design.md / `specs/**` など存在するファイル全部。spec delta の無い change では `specs/**`
  が無いだけで、ディレクトリ読込自体は省略しない）を読ませる。prompt で渡すのは対象 task
  番号と実行上の一時情報（作業パス・環境等）のみ。成果・受け入れ基準・設計判断に影響するファイル未記載の
  決定は、委譲の前に proposal / design / spec delta へ追記する（prompt のみで渡さない・
  main の要約で代替しない。後続の委譲・再開・レビューで決定が失われないため）。prompt で
  渡す内容がファイル記載と食い違うと気づいたら、ファイルが単一の正であり、委譲の前に
  ファイル側を更新して矛盾を解消する。
- **検証と進捗マーク**: サブエージェントは成果物と完了報告を返すのみで、`tasks.md` を
  マークしない。main が受け入れ検証（diff 確認・必要に応じ `task check`）をしてから
  `- [x]` に更新する。サブエージェントが規約に反してマークしていた場合は、検証が済むまで
  `- [ ]` に戻し、合格後に main が改めてマークする。失敗・無応答・空報告・成果物ゼロは
  不合格として扱い、working tree の部分成果物を採用・修正・破棄のいずれかで明示的に処理
  して既知の状態へ収束させてから、再委譲か main の直接修正に進む（後続のサブエージェント
  が壊れた中間状態を正として読まないため）。
- **直列のみ**: `tasks.md` の番号順に 1 task ずつ委譲→検証→マークする。並列委譲は行わない
  （目的はコンテキスト劣化の防止であり高速化ではない）。

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
| `diagnosing-bugs` | bootstrap / uv sync / pre-commit / MCP 起動失敗の切り分け | mattpocock/skills |
| `caveman` | 過度な複雑化・不要な抽象化・テンプレ肥大化を止める | JuliusBrussee/caveman |
| `self-review` | コミット / PR 前の自己 diff 検査（明白な欠陥は修正・判断事項は報告のみ） | 自作（local） |
| `verify-change` | 変更後の実動作確認（`task check`→個別テスト→実行・未検証は理由付き明記） | 自作（local） |
| `spec-holes` | 仕様の穴（未定義の振る舞い）の機械的列挙とテスト化（固定タクソノミー 12 分類） | 自作（local） |

> `grill-me` / `grill-with-docs` は薄いラッパーで、本体の `grilling`・`domain-modeling`
> skill に委譲する。再現性のため依存先も同梱している（単体では機能しないため）。

> `spec-holes` は 2 フェーズ運用で強制度が非対称。**フェーズ 1（仕様時）は無条件**:
> OpenSpec proposal / spec delta の確定前にタクソノミーを全項目当て、穴を
> 「仕様に明記 / スコープ外と明記 / ユーザ確認」のいずれかで必ず潰す。
> **フェーズ 2（実装時）は努力目標**: 穴を例示テスト / Hypothesis property に対応付け、
> 落とせないものは「未検証」と理由を明記する（対応表の漏れは `self-review` が照合）。

- 起動: 各エージェントの skill 機構で名前指定（例 `grill-me`）。`caveman` は明示起動が基本。
- `caveman` の自動発火（hook）は Claude 固有のオプション。手順は
  [docs/optional/caveman-hook.md](../optional/caveman-hook.md)（自動登録しない）。
- 外部 skill は自動で latest 更新しない。symlink の修復は `task skills:update`、整合検証は
  `task skills:doctor`（`tests/test_skills_lock.py` がハードゲート）。
- `caveman` と AGENTS.md の「最小変更」ルールは役割が近い。caveman は**設計判断時に明示的に
  呼ぶ skill**、AGENTS.md は**常時適用される原則**と整理して重複を避ける。
- 再配布の前提: vendored skill は各 `LICENSE` に従う（ルート LICENSE=MIT とは別。ADR-0001）。

## クロス AI レビュー（オプション）

PR 前後の Codex クロス AI レビュー（人起点のみ・自動送信しない）は
[docs/optional/codex-review.md](../optional/codex-review.md)。
