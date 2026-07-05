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

## OpenSpec engine と Markdown fallback（ADR-0003 / Q12）

`/opsx:*`（OpenSpec engine）は Node 製 CLI で、コアのハード依存ではない。`task doctor` は
`which openspec` で可用性を確認し、不在でも WARN に留める（FAIL にしない・自動実行しない）。

engine 不在でも境界は崩れない。エンジンはあくまで自動化で、境界の前提ではない。手書きで
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
- GSD（導入時）は change ディレクトリへ**リンク**するのみで `tasks.md` の内容を複製しない。

engine を導入する場合は各自で `openspec init` を実行する（生成物はこのテンプレートには
コミットしない。Node 依存・engine version 結合を避けるため）。

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
