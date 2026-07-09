# Change: workflow.md に「初めての change」quickstart 節を追加する

## Why

v1.0 リリース準備（3 change 直列の 2 本目・backlog #12）。change の切り方
（proposal → spec delta → tasks → 実装 → close）に必要な制約は
docs/agents/workflow.md・openspec/project.md に揃っているが、複数節に散在しており、
初めて change を切る読者が一連の順序として辿れる場所がない。1 箇所にまとめた最小手順
（quickstart）を workflow.md に置き、guide からの導線を 1 行足す。

## What Changes

1. `docs/agents/workflow.md` に「初めての change」quickstart 短節を追加する。
   proposal → spec delta（振る舞い変更時のみ）→ tasks → 実装（`openspec instructions
   apply` / Markdown fallback）→ PR 前チェック（`task openspec:validate`）→
   pre-merge close の最小手順を一連の順序で示す。最低限含めるもの:
   - change ディレクトリ構成（`proposal.md` / `tasks.md` 必須・振る舞い変更時のみ `specs/`）
   - spec delta の requirement 本文 1 行目 SHALL / MUST 制約
   - `tasks.md` のチェックボックス規律（実行主体がマーク）
   - proposal 確定前の `spec-holes` フェーズ 1（1 行言及・AGENTS.md 参照）
   - PR 前チェック `task openspec:validate`（`proposal.md` / `tasks.md` 欠落は
     preflight で FAIL する旨を 1 行言及）
   - pre-merge close（main に change ディレクトリを載せない・openspec/project.md 参照）
2. `docs/guide.md` §4 に quickstart 節への 1 行参照を追加する。

## 設計制約（spec-holes フェーズ 1 反映）

- **本文を二重化しない**: 既存節（Markdown fallback 最小形式・CLI 導線）と
  openspec/project.md（close 規約）に定義済みの制約は、本文を複製せずリンク・
  簡潔参照で束ねる。各制約の owner は既存の記載箇所のまま動かさない。
- **短節・最小形**: quickstart は順序の提示に徹し、詳細説明を持ち込まない。
- **engine 不在でも成立**: 各ステップは Markdown fallback（手書き運用）でも辿れる
  導線にする（apply の代替は fallback 節参照）。
- **配置**: 「OpenSpec engine のアクセス形態と Markdown fallback」節の直後に置く
  （quickstart が参照する概念が上に揃うため）。
- **guide 側は参照のみ**: 手順の owner は workflow.md（SoT 境界・ADR-0007 系の整理を
  維持）。guide §4 には手順本文を書かない。リンクは guide の既存流儀どおり
  ファイルリンク＋節名は文中言及（見出しアンカーは使わない・見出し変更で壊れるため）。
  §5 の既存 workflow.md 参照（change 運用の詳細）とは役割を分け、§4 は
  「初めての change の最小手順」の導線に限定する。

## Impact

- Affected specs: `first-change-quickstart`（新規 capability delta）
- Affected code: `docs/agents/workflow.md` / `docs/guide.md`（docs のみ・コード変更なし）
- 互換性: 既存節の本文・owner は変更しない。CI・Taskfile 変更なし。
