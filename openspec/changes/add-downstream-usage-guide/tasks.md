# Tasks: 下流ユーザ向けの通し読み利用ガイドを出荷する

- [ ] 1. `docs/guide.md` を新規作成する（7 章: 位置づけ / 全体像・メンタルモデル / 立ち上げの
       「なぜ」/ 日々のループ / エージェント入口 / オプション決定表 / 詰まったとき）。
- [ ] 2. §6 を機構別 3 グループの決定表で書く（(a) extras=uv / (b) エージェント拡張=GSD・Codex
       レビュー・caveman hook / (c) MCP server=Serena・GitHub）。列＝機能 / 何を足す / いつ要る・
       避ける（前提）/ 入れ方 / 詳細リンク。前提（Node / ChatGPT sub or API key / Claude Code 限定）を明記。
- [ ] 3. §6 冒頭に opt-in 前提（既定で入らない・不在が正常・`task doctor` が INFO 報告）と
       自己完結 1 行を置く。security 単体行は作らず extras 込み監査は付随注（extras-audit.md）へ。
       GitHub MCP の owner リンクは docs/agents/mcp.md。
- [ ] 4. ガードレールを守る: guide に task コマンド / extra 名 / version / 各導入手順の実体を
       再掲せず参照する。guide 内に `docs/template/` への参照を置かない（依存方向 ADR→guide）。
- [ ] 5. README に guide への冒頭ナッジ（通し解説は docs/guide.md）と「ドキュメント構成」行を追加する。
- [ ] 6. `docs/template/adr/0007-*.md` を作成する（下流ユーザガイド出荷の判断・SoT 境界＝文脈は
       重複可 / 事実は owner 参照・依存方向 ADR→guide・guide は prune 耐性）。ADR-0006 と同型の
       「機能依存しない」注記を含める。
- [ ] 7. 検査: `grep -n 'docs/template' docs/guide.md` が空・guide 内相対リンク実在・
       `task prune-template-docs -- --apply` 後もリンク切れゼロ（verify-change で確認）。
- [ ] 8. `task check` と `openspec validate add-downstream-usage-guide` が green であることを確認する。
- [ ] 9. self-review で spec-holes の穴リスト（#1/#3/#4/#6/#12）と本文の突き合わせを行う。
- [ ] 10. close: マージ前の最終コミットで本 change ディレクトリを削除する（main に change
       ディレクトリを載せない・経緯は PR とブランチ履歴が保持）。
