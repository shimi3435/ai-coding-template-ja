# OpenSpec engine の CLI 利用導線を文書化する

## Why

テンプレート利用者が OpenSpec の change を CLI で駆動する方法に、docs から到達できない。

- docs（workflow.md・AGENTS.md・gsd.md・project.md・ADR-0003）はエンジンを一貫して
  **`/opsx:*`（スラッシュコマンド）**表記で書いている。だが `/opsx:*` は Claude Code の
  スラッシュコマンド統合で、`openspec` npm CLI とは別物。利用者が `openspec init` 経由で
  **CLI だけ**導入するとスラッシュコマンドは存在せず、`/opsx:apply` を案内する docs が
  存在しないコマンドへ誘導する（実際に発生した）。
- CLI 利用者が使う動詞（`openspec list` / `openspec instructions apply --change <id>` /
  `openspec status --change <id>` / `openspec archive`）が **docs にゼロ**。記載のある CLI
  動詞は `openspec validate`（付随言及）と `openspec init` の2つだけ。
- しかも `openspec init` は既存テンプレの `openspec/project.md` を `config.yaml` へ移行する
  ハザードがあり、docs はそれを注記せず唯一の導入手順として提示している。

実機は `openspec` CLI（v1.3.1）が普通に入る形態で、`openspec instructions apply --change` /
`status` / `validate` は init 無しで機能することを確認済み。docs がこの CLI 形態に追随していない。

## What Changes

- **docs/agents/workflow.md（engine 節）**: エンジンへのアクセスを **(a) `openspec` CLI** と
  **(b) スラッシュコマンド `/opsx:*`** の2形態に分離し、CLI の apply 導線を明記する:
  - `openspec list` / `openspec instructions apply --change <id>` /
    `openspec status --change <id>` / `openspec validate <id>` / `openspec archive`。
  - スラッシュコマンドは別途導入の任意形態と位置づける。
- **workflow.md の `openspec init` 注記を更新**: 「新規プロジェクト用。既存テンプレの
  project.md を `config.yaml` へ移行するため**このリポジトリでは実行しない**。既存 change の
  実装に init は不要」と明記する。
- **AGENTS.md / docs/optional/gsd.md / openspec/project.md** の `/opsx:apply` 表記に、CLI 等価
  （`openspec instructions apply --change`）を**最小併記**するか workflow.md へリンクする。

spec delta は `changes/document-openspec-cli-usage/specs/openspec-engine-access/spec.md` に置く
（engine のデルタ必須要件を満たす。close 時削除で `openspec/specs/` 出荷時空を維持）。

## 設計判断

1. **導線の単一の正は workflow.md に集約する**。AGENTS.md / gsd.md / project.md は最小併記＋
   リンクに留め、CLI 手順を4箇所に複製してドリフト源を増やさない（既存のミラー方針と一貫）。
2. **`/opsx:*` 表記は消さず「スラッシュコマンド形態」と明示し、CLI 形態を第一線に置く**。
   実機は CLI が入る形態のため。両形態を併存させ、CLI-only 利用者の壁を除く。
3. **`openspec init` は in-repo 実行を明示的に非推奨化する**。project.md→config.yaml 移行と
   engine 生成物の非コミット方針（ADR-0002/0003）に反するため。
4. **ADR-0003 本文は改変しない**（歴史的記録）。line 13 の「配布形態（plugin / CLI）を実機確認」
   の保留は、確定導線を workflow.md 側で示すことで解消し、ADR は追補しない。
5. spec delta は前 change（add-execution-tracking-rules）と同じく change 配下に置く。

## 受け入れ基準

- [ ] docs/agents/workflow.md に CLI apply 導線（`instructions apply --change` / `status --change`
      / `validate` / `list` / `archive`）が記載されている。
- [ ] workflow.md でエンジンアクセスが (a) CLI / (b) スラッシュコマンド の2形態に分離されている。
- [ ] workflow.md の `openspec init` 注記に、in-repo 非推奨と理由（project.md→config.yaml 移行）が
      明記されている。
- [ ] AGENTS.md / gsd.md / openspec/project.md の `/opsx:apply` に CLI 等価の最小併記または
      workflow.md へのリンクがある。
- [ ] `task check` が green。
- [ ] `openspec validate document-openspec-cli-usage` が green。
- [ ] `openspec/specs/` の出荷時空を維持する（spec delta は change 配下）。

## Non-goals

- **ADR-0003 本文の改変**（歴史記録・追補しない。確定導線は workflow.md が持つ）。
- **`/opsx:*` スラッシュコマンドのテンプレへの vendoring**（従来どおり非コミット・ADR-0002/0003）。
- **`openspec init` のラッパー / 自動化 / 抑止フックの追加**（docs 注記に留める）。
- **CLI バージョンの固定**（v1.3.1 に結合しない。動詞名は安定前提で記述）。
