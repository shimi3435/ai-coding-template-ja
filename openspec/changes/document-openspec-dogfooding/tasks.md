# Tasks: テンプレート自身の OpenSpec change 運用の明文化

- [ ] 1. openspec/project.md に「テンプレート自身の change 運用」小節を追記する
       （delta は change 内 / archive せずマージ前の最終コミットで削除して close /
       validate green 維持）。
- [ ] 2. docs/agents/workflow.md の fallback 形式説明に SHALL 1 行目制約の注記を
       追記する（parser は requirement 本文 1 行目のみ判定・全角括弧は可）。
- [ ] 3. 既存 in-flight change の close 記述が pre-merge close に揃っていることを
       確認する（add-self-review-verify-skills は `feat/self-review-verify-skills`
       ブランチ上・add-dependabot は `feat/dependabot` ブランチ上）。
- [ ] 4. `task check` と `openspec validate document-openspec-dogfooding` が green で
       あることを確認する。
- [ ] 5. close: マージ前の最終コミットで本 change ディレクトリを削除する（main に
       change ディレクトリを載せない・経緯は PR とブランチ履歴が保持）。
