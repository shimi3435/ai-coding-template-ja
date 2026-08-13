@AGENTS.md

# Claude Code 固有の補足

作業方針の単一の正は [AGENTS.md](AGENTS.md)（上記 import）。ここには Claude Code 固有の
事項のみを薄く書く。Codex と共通の方針は AGENTS.md 側に書き、ここで重複させない。

## Skills
- vendored skill の実体は `.agents/skills/<name>/`。Claude Code は `.claude/skills/`
  （`.agents/skills` への symlink）から同一 SKILL.md を参照する。
- symlink が壊れた / 欠落したときは `task skills:links` で冪等に再生成する。
  offline 整合確認は `task skills:verify`。

## caveman hook（任意）
- `caveman` skill 本体（明示起動・簡素化原則）はコアで vendoring 済み（両エージェント対応）。
- SessionStart / UserPromptSubmit での**自動発火**は `.claude/settings.json` への hook 登録に
  依存する Claude Code 固有の上乗せで、コア保証外（オプション）。
- 手順は [docs/optional/caveman-hook.md](docs/optional/caveman-hook.md)。このテンプレートは
  hook を自動登録・コミットしない（簡素化原則は AGENTS.md に内包済みで hook 無しでも効く）。
