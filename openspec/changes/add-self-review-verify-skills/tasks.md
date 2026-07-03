# Tasks: self-review / verify-change skill の追加

- [ ] 1. `.agents/skills/self-review/SKILL.md` を作成する（proposal「skill 仕様 >
       self-review」の 2 段階挙動・観点・diff 取得手順を含む。本文日本語・
       description 英語主体＋日本語トリガー語併記）。
- [ ] 2. `.agents/skills/verify-change/SKILL.md` を作成する（proposal「skill 仕様 >
       verify-change」の 4 段手順・未検証明記の報告形式を含む）。
- [ ] 3. `skills.lock.json` に 2 エントリを追加する（source_type: local /
       source: "local (first-party)" / commit: "local" / license: MIT /
       license_file: LICENSE / redistribution: allowed / SKILL.md の sha256）。
- [ ] 4. `task skills:update` を実行し `.claude/skills`・`.codex/skills` の symlink を
       生成する。
- [ ] 5. AGENTS.md の Workflow に推奨 1 行ずつを追記する（非強制トーン）。
- [ ] 6. docs/agents/workflow.md の skill 表に 2 行を追加する（供給元 = 自作 / local）。
- [ ] 7. docs/optional/codex-review.md に self-review との住み分けを 1 行追記する。
- [ ] 8. `task skills:doctor`・`task check`・
       `openspec validate add-self-review-verify-skills` が green であることを確認する。
- [ ] 9. smoke: 両 skill を実際に起動し、self-review が 2 段階挙動（修正 / 報告の
       仕分け）・verify-change が未検証明記を含む報告を出すことを確認する。
- [ ] 10. close: 全タスク完了・PR マージ後に本 change ディレクトリを削除する
       （proposal 設計判断 5。`openspec/changes/` は出荷時空・経緯は git 履歴が保持）。
