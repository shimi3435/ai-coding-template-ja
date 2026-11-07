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

- `specs/<capability>/spec.md` … 現在のcanonical仕様。changeのdeltaを同期して維持する。
- `changes/<change-name>/` … activeな変更提案。各 change は `proposal.md` と `tasks.md` を必須とし、
  必要な設計判断を `design.md` に記録する。振る舞いが変わる場合のみ `specs/<capability>/spec.md` を持つ。
- `changes/archive/YYYY-MM-DD-<change-name>/` … 同期・完了したchangeのartifactsを保存する履歴。
  archive後修正中は未完了状態も保持する。directoryの存在だけでは完了の証拠にならない。

## 下流の完了操作

下流では[workflowのarchive手順](../docs/agents/workflow.md#下流の-archive-フロー)を正とする。
同じ実装PRでreview収束後にspec同期・履歴保存を行い、archive後diffのreview・再検証・最終CI後にmergeする。
CLIなしの手動操作、衝突、archive後修正、別PRの例外も同手順を参照する。

テンプレート自身の保守作業を明示選択する場合も、[workflow](../docs/agents/workflow.md)から専用手順を参照する。
下流の通常運用へ削除型closeを適用しない。

## エンジン（任意）

OpenSpec engineは任意のdiscovery / validation補助であり、artifactの配置や完了条件を所有しない。
CLI / スラッシュコマンドの使い分け、Markdown fallback、既存repositoryでの初期化制約は
[workflowのengine手順](../docs/agents/workflow.md#openspec-engine-と-markdown-fallbackadr-0010)を正とする。
