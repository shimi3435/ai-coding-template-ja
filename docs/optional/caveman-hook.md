# caveman hook の自動発火（オプション・Claude Code 固有）

`caveman` skill は本テンプレートにコアとして vendoring 済み（`.agents/skills/caveman/`）で、
両エージェントから明示起動できる（`/caveman` 等）。簡素化原則は AGENTS.md にも内包されており、
hook が無くても方針としては効く。

ここで扱うのは**自動発火**（毎ターン caveman モードを適用する）だけで、これは
`.claude/settings.json` への hook 登録に依存する Claude Code 固有の上乗せ機能。コア保証外の
オプションであり、**このテンプレートは hook を自動登録・コミットしない**（安全境界）。

## 有効化（任意・各自の環境で手動）

1. caveman の配布元（`JuliusBrussee/caveman`）の README / INSTALL に従い、SessionStart /
   UserPromptSubmit hook と必要スクリプトを各自の環境へ導入する。
2. `.claude/settings.json` に hook を登録する。リポジトリにコミットする場合はチーム合意の上で
   行う（個人設定は `.claude/settings.local.json` を使い、コミットしない）。
3. secret / token は hook 設定に埋め込まない。

## 無効化 / 解除

`.claude/settings.json`（または `settings.local.json`）から該当 hook エントリを削除する。
skill 本体（vendored）は残るため、明示起動は引き続き可能。
