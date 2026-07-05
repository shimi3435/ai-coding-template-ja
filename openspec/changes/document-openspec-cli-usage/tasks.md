# Tasks: OpenSpec engine の CLI 利用導線を文書化する

- [x] 1. docs/agents/workflow.md の engine 節に CLI apply 導線を追記する（`openspec list` /
       `instructions apply --change <id>` / `status --change <id>` / `validate <id>` / `archive`）。
- [x] 2. workflow.md でエンジンアクセスを (a) `openspec` CLI / (b) スラッシュコマンド `/opsx:*` の
       2形態に分離して記述する。
- [x] 3. workflow.md の `openspec init` 注記を更新する（新規プロジェクト用・既存リポジトリでは
       project.md→config.yaml 移行のため非推奨・既存 change の実装に init 不要）。
- [x] 4. AGENTS.md / docs/optional/gsd.md / openspec/project.md の `/opsx:apply` 表記に CLI 等価を
       最小併記するか workflow.md へリンクする（4箇所複製は避け単一の正は workflow.md）。
- [x] 5. `task check` と `openspec validate document-openspec-cli-usage` が green であることを確認する。
- [ ] 6. close: マージ前の最終コミットで本 change ディレクトリを削除する（main に change
       ディレクトリを載せない・経緯は PR とブランチ履歴が保持）。
