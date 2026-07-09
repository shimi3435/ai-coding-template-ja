# Tasks: OpenSpec task のサブエージェント委譲ルールを追加する

- [x] 1. AGENTS.md Workflow 節に委譲原則を中立表現で 1〜2 行追加する（成果物を作る task は
       原則サブエージェントへ委譲・main が検証して進捗マーク・見送り時は理由一言）。
- [x] 2. `docs/agents/workflow.md` に「task 単位のサブエージェント委譲」節を新設する
       （判定基準＝成果物の新規作成 / 大幅変更・文脈受け渡し＝change ディレクトリ一式＋
       task 番号＋実行上の一時情報のみ（決定は委譲前にファイルへ追記）・検証と進捗マーク＝
       main・直列実行・不合格（失敗・無応答・空報告含む）時は working tree を採用・修正・
       破棄で収束させてから再委譲 or 直接修正・機構不在時は main 直接で可・
       機構名の例示＝Claude Code: Agent tool / Codex: `multi_agent`）。
- [x] 3. workflow.md の既存「実行主体が tasks.md を更新」規約に、委譲時の読み替え
       （実行主体＝オーケストレータ＝main・サブエージェントはマークしない）を追記する。
- [x] 4. `task check` と `openspec validate add-task-delegation-rule` が green であることを確認する。
- [ ] 5. self-review で spec-holes の穴リスト（proposal 記載 H1〜H9）と本文の突き合わせを行う。
- [ ] 6. close: マージ前の最終コミットで本 change ディレクトリを削除する（main に change
       ディレクトリを載せない・経緯は PR とブランチ履歴が保持）。
