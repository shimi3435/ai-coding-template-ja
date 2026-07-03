# agent-skills（vendored skill セット）仕様差分

本 change による capability `agent-skills` への追加分。本 change は archive しない
（close 時にディレクトリごと削除・proposal 設計判断 5）ため、この delta が
`openspec/specs/` へマージされることはない（specs/ の「出荷時空・下流所有」と両立）。

## ADDED Requirements

### Requirement: self-review skill の同梱
テンプレートは自己 diff 検査 skill `self-review` を同梱しなければならない（SHALL）。
実体は `.agents/skills/self-review/` に置き、Codex / Claude Code の両方から symlink 経由で
利用できること。検査観点はバグ・不要な複雑化・スコープ逸脱・AGENTS.md 遵守とする。

#### Scenario: 明白な欠陥は修正する
- **WHEN** self-review が diff 内に明白な欠陥（off-by-one・未使用 import・型不整合・typo 等）を検出した
- **THEN** その場で修正し `task check` で確認する

#### Scenario: 判断事項は報告に留める
- **WHEN** self-review が設計判断・スコープ変更・仕様解釈に関わる問題を検出した
- **THEN** 修正せず指摘として報告する（AGENTS.md「変更は必要最小限」「破壊的変更は事前確認」と整合）

### Requirement: verify-change skill の同梱
テンプレートは実動作確認 skill `verify-change` を同梱しなければならない（SHALL）。
実体は `.agents/skills/verify-change/` に置き、Codex / Claude Code の両方から symlink 経由で
利用できること。

#### Scenario: 標準の検証手順
- **WHEN** まとまった変更後に verify-change が起動された
- **THEN** `task check` → 変更対象に近いテストの個別実行 → 可能なら実動作確認（REPL・スクリプト実行・`task doctor` 等）の順に検証する

#### Scenario: 実動作確認が不可能な場合
- **WHEN** GPU 必須・長時間実行・外部データ依存等で実動作確認ができない
- **THEN** 該当項目を「未検証」と理由付きで明記して報告する（検証済み扱いにしない）

### Requirement: local vendoring の整合
両 skill は `skills.lock.json` に `source_type: local` で登録しなければならない（SHALL）。
既存のハードゲート（`tests/test_skills_lock.py`）の検証対象に含める。

#### Scenario: lock 整合の検証
- **WHEN** `task skills:doctor` を実行した
- **THEN** 孤児なし・sha256 一致・`.claude/skills` / `.codex/skills` の symlink 解決を含めて green になる
