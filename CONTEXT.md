# ai-coding-template-ja

日本語で AI コーディングエージェント（Codex / Claude Code）を使う研究用 Python プロジェクトのテンプレート。このリポジトリで用いる中核語を定義する。

## Language

**コア層**:
新規プロジェクト作成直後に `task check` と `task doctor` が通り、エージェントが安全に作業を始められる最小実用セット。常に有効。
_Avoid_: 標準セット, 基本機能

**オプション層**:
コア層を変更せずに opt-in で足せる拡張。既定では無効。
_Avoid_: 追加機能, プラグイン

**単一の正（AGENTS.md）**:
全エージェント共通の作業方針の実体を一元化したファイル。CLAUDE.md・docs/agents は AGENTS.md と矛盾しない補助に留まる。
_Avoid_: ルートルール, マスター設定

**Skill 実体**:
vendoring した SKILL.md の正本。`.agents/skills/` に置き、Claude Code 用 `.claude/skills` はそこへの symlink とする。
_Avoid_: スキル本体, オリジナル
