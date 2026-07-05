# Tasks: 実行中の情報損失を防ぐ規約の追加

- [x] 1. AGENTS.md「Workflow」に能動規約を追記する（実行主体は手動・GSD 駆動問わず各タスク
       完了時に `tasks.md` のチェックを更新する。engine 不在の Markdown fallback でも同じ）。
- [x] 2. docs/agents/workflow.md の fallback 節（tasks.md の形式だけ定義している箇所）に同じ
       能動規約を追記する。
- [x] 3. AGENTS.md「General Engineering Rules」の「無関係なリファクタリングを行わない」直後に、
       別スコープの発見を記録する補完 bullet を追記する（GitHub 非依存の中立表現・外部 write は
       事前確認・閾値=正確性/セキュリティ/データ損失/設計負債）。
- [x] 4. `.agents/skills/self-review/SKILL.md` の検査観点に「active change の tasks.md が実装
       実態を反映しているか」の照合行を追加する。
- [x] 5. `.agents/skills/skills.lock.json` の self-review エントリの sha256 を更新し、
       `uv run pytest tests/test_skills_lock.py -q` が green であることを確認する。
- [x] 6. docs/optional/codex-review.md に「Codex クロスレビューは PR 前に限らず任意のレビュー
       チェックポイントで使える（人起点）」の一文を追記する。
- [x] 7. `task check` が green であることを確認する。engine 導入時は
       `openspec validate add-execution-tracking-rules` も green を確認する（不在時は未実行と明記）。
- [ ] 8. close: マージ前の最終コミットで本 change ディレクトリを削除する（main に change
       ディレクトリを載せない・経緯は PR とブランチ履歴が保持）。
