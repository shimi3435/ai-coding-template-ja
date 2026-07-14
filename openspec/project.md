# OpenSpec プロジェクト規約

このファイルは **OpenSpec 固有の運用規約**のみを書く（ADR-0008 / CONTEXT.md Q24）。

- 作業方針（意図・自然言語）の単一の正は [AGENTS.md](../AGENTS.md)。ここに重複させない。
- 技術値（Python バージョン・依存・lint 設定）は [pyproject.toml](../pyproject.toml) を参照する。
- 用語定義は [CONTEXT.md](../CONTEXT.md)。

## OpenSpec / GSD の適応型実行境界（ADR-0008）

- OpenSpec は全 change の proposal、design、spec delta、受け入れ基準、`spec-holes`、最終完了判定を
  所有する。独立して出荷できる成果は先に別 changes へ分割する。
- 小規模 change は `tasks.md` が詳細タスクと進捗を所有し、
  `openspec instructions apply --change <id>` または同じ Markdown artifacts から直接実行する。
- 大規模 change は opt-in の GSD が詳細 plan、phase 実行、phase 進捗を所有する。OpenSpec
  `tasks.md` は handoff、全 phases 完了、原本検証、project checks、close の境界ゲートだけを持ち、
  GSD の詳細タスクを複製しない。GSD も仕様と受け入れ基準を再定義しない。
- GSD phases 完了後も OpenSpec 原本へ実装・検証を対応付け、全境界ゲート成功後にだけ完了とする。
- 詳細とエンジン不在時の Markdown fallback 形式は [docs/agents/workflow.md](../docs/agents/workflow.md)。

## ディレクトリ

- `specs/` … capability 仕様（出荷時は空。コピー先が自分の能力仕様を書く）。
- `changes/` … 変更提案（出荷時は空）。各 change は `proposal.md` と `tasks.md` を必須とし、
  振る舞いが変わる場合のみ `specs/<capability>/spec.md` を持つ。

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
- 軽微変更の基準: spec（振る舞い・規約）に触れない軽微修正（typo・リンク切れ・表現修正等）は
  change 不要・直接 PR 可。判定はファイル種別（docs かコードか）ではなく振る舞い・規約に
  触れるかで行う（複数の軽微修正を束ねた PR も同じ基準で、1 件でも規約に触れれば change を切る）。
- 規約に触れるか迷う場合は change を切る側に倒す。
- 軽微として開始した修正が途中で振る舞い・規約に触れると判明した場合は change を切り直す。

## エンジン（任意）

OpenSpec engine のアクセス形態は **(a) `openspec` CLI** と **(b) スラッシュコマンド `/opsx:*`**
（別物）。CLI 動詞（`openspec instructions apply --change` / `status` / `validate` / `list`）と
各形態の使い分けは [docs/agents/workflow.md](../docs/agents/workflow.md) が単一の正。engine は
コアのハード依存ではなく（ADR-0002/0008）、未導入でも上記ディレクトリ規約を手書きで運用できる
（Markdown fallback）。`openspec init` は新規プロジェクト用で、既存リポジトリでは
project.md→config.yaml 移行のハザードがあるため実行しない（同 workflow.md）。生成物はこの
テンプレートにはコミットしない。
