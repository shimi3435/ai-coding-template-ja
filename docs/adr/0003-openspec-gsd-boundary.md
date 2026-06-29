# OpenSpec が per-change タスクを所有し GSD は横断ロードマップに限定する

OpenSpec の change フォルダは `tasks.md`（実装チェックリスト）を標準内包し、`/opsx:apply` がそれを実装・進捗マークする。したがって**単一 change 内のタスク分解・順序・進捗は OpenSpec が所有**し、GSD（オプション）は**複数 change を横断する上位ロードマップ / フェーズ順序 / マイルストーン / セッション跨ぎ復帰**のみを担う。GSD は `openspec/changes/*/tasks.md` を二重化しない。

## Considered Options

- **OpenSpec=何を/なぜ、GSD=順序/進捗（初版 §7）**: OpenSpec が tasks.md で順序・進捗を既に担うため境界が重複し、GSD 導入時に「タスクの正」が二重化する。却下。

## Consequences

- GSD 未導入でも per-change のタスク管理は OpenSpec `tasks.md` が担うため手薄にならない。横断ロードマップが要るときのみ PR チェックリスト等で簡易代替する。
- この境界は AGENTS.md と `docs/agents/workflow.md` に明記する。
