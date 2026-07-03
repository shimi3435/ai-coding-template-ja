# Tasks: spec-holes skill の追加

- [x] 1. `.agents/skills/spec-holes/SKILL.md` を作成する（proposal「skill 仕様」の
       2 フェーズ手順・タクソノミー全項目・穴の潰し方 3 択・property 化の向き不向き
       基準を含む。本文日本語・description 英語主体＋日本語トリガー語併記）。
- [x] 2. `.agents/skills/skills.lock.json` に 1 エントリを追加する（source_type: local /
       source: "local (first-party)" / commit: "local" / license: MIT /
       license_file: LICENSE / redistribution: allowed / SKILL.md の sha256）。
- [x] 3. `task skills:update` を実行し `.claude/skills`・`.codex/skills` の symlink を
       生成する。
- [x] 4. AGENTS.md の Workflow に追記する（フェーズ 1 =「OpenSpec で仕様を確定する
       前に `spec-holes` で未定義の振る舞いを列挙して潰す」（無条件）、
       フェーズ 2 =「列挙した穴は可能なら例示テスト / Hypothesis property に落とす」）。
- [x] 5. docs/agents/workflow.md の skill 表に 1 行を追加し（供給元 = 自作 / local）、
       2 フェーズ運用の短い補足を書く。
- [ ] 6. `task skills:doctor` と `task check` が green であることを確認する。
- [ ] 7. smoke: 実在の要件に対しフェーズ 1 の列挙とフェーズ 2 の対応表出力を
       1 回実行する（タクソノミー各項目に該当 / 非該当の判断が付くこと）。
- [ ] 8. close: 全タスク完了・PR マージ前に本 change ディレクトリを削除する
       （proposal 設計判断 5。`git rm -r` → chore コミット → push → PR）。
