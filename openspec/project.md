# OpenSpec プロジェクト規約

このファイルは **OpenSpec 固有の運用規約**のみを書く（ADR-0003 / CONTEXT.md Q24）。

- 作業方針（意図・自然言語）の単一の正は [AGENTS.md](../AGENTS.md)。ここに重複させない。
- 技術値（Python バージョン・依存・lint 設定）は [pyproject.toml](../pyproject.toml) を参照する。
- 用語定義は [CONTEXT.md](../CONTEXT.md)。

## OpenSpec の責務境界（ADR-0003）

- 「何を・なぜ作るか」（仕様・受け入れ基準）と、**単一 change 内のタスク分解・順序・進捗**は
  OpenSpec が所有する（`openspec/changes/<change>/tasks.md`）。
- GSD（オプション・導入時のみ）は複数 change を横断するロードマップのみを担い、
  `tasks.md` を二重化しない。受け入れ基準も新規定義しない。
- 詳細とエンジン不在時の Markdown fallback 形式は [docs/agents/workflow.md](../docs/agents/workflow.md)。

## ディレクトリ

- `specs/` … capability 仕様（出荷時は空。コピー先が自分の能力仕様を書く）。
- `changes/` … 変更提案（出荷時は空）。各 change は `proposal.md` と `tasks.md` を必須とし、
  振る舞いが変わる場合のみ `specs/<capability>/spec.md` を持つ。

## エンジン（任意）

`/opsx:*`（OpenSpec engine）は Node 製 CLI で、コアのハード依存ではない（ADR-0002/0003）。
未導入でも上記ディレクトリ規約を手書きで運用できる（Markdown fallback）。
導入する場合は `openspec init` を各自で実行する（生成物はこのテンプレートにはコミットしない）。
