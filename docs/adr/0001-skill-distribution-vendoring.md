# Skill は vendoring し `.agents/skills` を単一の正とする

コア Skills（grill-me / grill-with-docs / tdd / diagnose / caveman）は実体をリポジトリに同梱（vendoring）し、`.agents/skills/` を正本とする。`.claude/skills` はそこへの symlink とし、Claude Code / Codex の両方が同一 SKILL.md を参照する（Codex も `$HOME/.agents/skills` 等を skill root として読む）。再現性を最優先し、外部からの自動 latest 更新は行わず、更新は `task skills:update` で明示的にのみ行う。

## Considered Options

- **npx / CLI でセットアップ時取得**: リポジトリは軽いがネットワーク・供給元依存でオフライン不可。再現性が弱い。
- **git submodule**: 版固定は厳密だが「Use this template」/ clone を複雑化し template repo との相性が悪い。

## Consequences

- 第三者 skill を公開 template に同梱＝再配布になるため、各 skill の LICENSE が再配布可か・帰属表示要否を取り込み時に確認し、供給元 commit と併せて `docs/agents/mcp.md`（または skills lock）へ記録する。
- symlink は Ubuntu 限定前提で安全。`.codex/skills` の symlink 要否は Codex の repo スコープ解決を実機確認して決める。
