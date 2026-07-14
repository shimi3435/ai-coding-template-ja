# OpenSpec が per-change タスクを所有し GSD は横断ロードマップに限定する

> Status: Superseded by [ADR-0008](0008-adaptive-openspec-gsd-execution-boundary.md). 本文は当時の判断を示す履歴として保持する。

OpenSpec の change フォルダは `tasks.md`（実装チェックリスト）を標準内包し、`/opsx:apply` がそれを実装・進捗マークする。したがって**単一 change 内のタスク分解・順序・進捗は OpenSpec が所有**し、GSD（オプション）は**複数 change を横断する上位ロードマップ / フェーズ順序 / マイルストーン / セッション跨ぎ復帰**のみを担う。GSD は `openspec/changes/*/tasks.md` を二重化しない。

## Considered Options

- **OpenSpec=何を/なぜ、GSD=順序/進捗（初版 §7）**: OpenSpec が tasks.md で順序・進捗を既に担うため境界が重複し、GSD 導入時に「タスクの正」が二重化する。却下。

## Consequences

- GSD 未導入でも per-change のタスク管理は OpenSpec `tasks.md` が担うため手薄にならない。横断ロードマップが要るときのみ PR チェックリスト等で簡易代替する。
- この境界は AGENTS.md と `docs/agents/workflow.md` に明記する。
- この境界の**自動化**（tasks.md の進捗マーク）は `/opsx:apply` に依存するが、**境界自体は依存しない**（fallback で維持できる。下記参照）。テンプレがコミットするのは `openspec/`（project.md + 空 specs/changes）データのみで、エンジン（スラッシュコマンド / CLI）の実体は別途要る。PR2 で配布形態（Claude Code / Codex の plugin か、独立 CLI か）を実機確認し（§27）、doctor に openspec 可用性診断を追加する（不在なら WARN）。
- engine が再現困難な環境でも崩れないよう、fallback として「OpenSpec を Markdown 規約として最小成立」を保証する: 空の `openspec/specs|changes` + project.md があれば、エージェントが手で change / tasks.md を運用でき、per-change タスク所有の境界は維持される。`/opsx:apply` はあくまで自動化であり、境界の前提ではない。
- fallback の最小形式を `docs/agents/workflow.md` に固定し、エージェントが勝手な形式を作らないようにする:
  - 各 change ディレクトリは `proposal.md` / `tasks.md` を必須とし、振る舞いが変わる場合のみ `specs/<capability>/spec.md` を持つ。
  - `tasks.md` は GitHub チェックボックス形式の番号付きリスト（例: `- [ ] 1. 実装 ...` / `- [ ] 2. テスト追加 ...` / `- [ ] 3. \`task check\` を通す`）。
  - GSD（導入時）は change ディレクトリへ**リンク**するのみで、`tasks.md` の内容を複製しない。
