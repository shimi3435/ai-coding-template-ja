# OpenSpec プロジェクト規約

このファイルは **OpenSpec 固有の運用規約**のみを書く（ADR-0010）。

- 作業方針（意図・自然言語）の単一の正は [AGENTS.md](../AGENTS.md)。ここに重複させない。
- 技術値（Python バージョン・依存・lint 設定）は [pyproject.toml](../pyproject.toml) を参照する。
- 用語定義は [GLOSSARY.md](../GLOSSARY.md)。

## OpenSpec 直接実行（ADR-0010）

changeの適用条件と仕様・進捗の正本は[AGENTS.md](../AGENTS.md)に従う。
`tasks.md` の形式・実行・検証・停止・完了は[共通workflow](../docs/agents/workflow.md)を参照する。
CLIの有無でMarkdown artifactsと完了条件は変わらない。

## ディレクトリ

- `specs/` … capability 仕様（出荷時は空。コピー先が自分の能力仕様を書く）。
- `changes/` … 変更提案（出荷時は空）。各 change は `proposal.md` と `tasks.md` を必須とし、
  必要な設計判断を `design.md` に記録する。振る舞いが変わる場合のみ `specs/<capability>/spec.md` を持つ。

## テンプレート自身の change 運用

テンプレート自身が change を切る場合:

- spec delta は `changes/<id>/specs/` に置く（`openspec validate` green と `specs/` の出荷時空が両立）。
- 一つの PR は一つの active change だけを運ぶ。依存 changes は専用 branches に保持し、先行 change の
  close / merge 後を base として段階的に実装する。blocked proposal を main や backlog へ複製しない。
- close は archive ではなくマージ前の最終コミットでのディレクトリ削除で行う（main に change ディレクトリを載せない）。
- これにより `specs/` / `changes/` の出荷時空と validate green を維持する。経緯は PR とブランチ履歴が保持する。
- close までに軽量ふりかえり（逃した欠陥の件数と発見経路）を 1 行記録する
  （記録先・形式は [docs/agents/workflow.md](../docs/agents/workflow.md) の
  「change close 時の軽量ふりかえり」節）。
- changeの要否はfile種別ではなく振る舞い・規約への影響で判定する。複数修正を束ねても一つが条件に該当すれば
  changeを必要とする。迷う場合はchangeを作る側に倒し、直接変更中に該当した場合はworkflowに従って切り直す。

## エンジン（任意）

OpenSpec engineは任意のdiscovery / validation補助であり、artifactの配置や完了条件を所有しない。
CLI / スラッシュコマンドの使い分け、Markdown fallback、既存repositoryでの初期化制約は
[workflowのengine手順](../docs/agents/workflow.md#openspec-engine-と-markdown-fallbackadr-0010)を正とする。
