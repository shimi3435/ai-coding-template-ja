# ai-coding-template-ja

研究者が AI コーディングを安全に始める開発基盤を提供する、日本語対応の研究用 Python プロジェクトテンプレート（Codex / Claude Code、Ubuntu 対象）。このリポジトリで用いる中核語を定義する。

## Language

**コア層**:
新規プロジェクト作成直後に `task check` と `task doctor` が通り、エージェントが安全に作業を始められる最小実用セット。常に有効。
_Avoid_: 標準セット, 基本機能

**オプション層**:
コア層を変更せずに opt-in で足せる拡張。既定では無効。
_Avoid_: 追加機能, プラグイン

**単一の正（AGENTS.md）**:
全エージェント共通の**作業方針（意図・自然言語）**の実体を一元化したファイル。CLAUDE.md・docs/agents は AGENTS.md と矛盾しない補助に留まる。MCP 接続・承認モード・サンドボックス等の**ツール固有の機構設定は管轄外**（`.codex/config.toml` / `.mcp.json` が担い、AGENTS.md の意図を各ツールで実現する設定と位置づける）。
_Avoid_: ルートルール, マスター設定

**Skill 実体**:
vendoring した SKILL.md の正本。`.agents/skills/` に置き、Claude Code 用 `.claude/skills` はそこへの symlink とする。
_Avoid_: スキル本体, オリジナル

**green（doctor / check が通る状態）**:
`task doctor` と `task check` がともに exit 0 の状態を指す。`task doctor` では FAIL（機械コアの破損）がゼロであること（WARN・INFO は green を壊さない。到達性チェックは既定で行わず、作成直後・CI・オフラインでも green になる）。`task check`（ruff / basedpyright / pytest）は全て通ること。
_Avoid_: 成功, パス, OK
