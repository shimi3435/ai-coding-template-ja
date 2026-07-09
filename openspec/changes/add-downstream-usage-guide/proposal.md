# 下流ユーザ向けの通し読み利用ガイドを出荷する

## Why

テンプレート利用者（下流の研究者・人間）が、テンプレの使い方とオプションの選び方を
**通し読みで把握する導線が無い**。

- README は quickstart（新規作成→rename→green・タスク表）に最適化されており、
  「なぜその手順か」「どのオプションをいつ入れるか」の物語が無い。
- オプションの手順は `docs/optional/*.md`（6 枚）と `docs/agents/mcp.md` に**個別分散**しており、
  どれが在るか・自分に要るかを俯瞰して取捨選択する入口が無い。`docs/optional/` に索引も無い。
- 「デフォルトでは入らないがオプション指定で入るもの」（uv extras / GSD / Serena MCP /
  GitHub MCP / Codex レビュー / caveman hook）の**選定と前提（Node / ChatGPT sub / Claude Code 限定）**を
  一望できる決定表がどこにも無い。
- 人間読者向けのトラブル入口（詰まったら `task doctor` → `diagnosing-bugs`）が README に無い
  （エージェント向け AGENTS.md にはある）。

## What Changes

- **新規 `docs/guide.md`**（単一ファイル・人間下流ユーザ向けの通し読みガイド・7 章）:
  1. 位置づけ（README=quickstart / docs/agents=エージェント向 / docs/optional=手順 への地図）
  2. 全体像・メンタルモデル（コア/オプション層・SoT=AGENTS.md・green の意味・task=共通入口）
  3. 立ち上げの「なぜ」（bootstrap→rename→green。手順の実体は README にリンク）
  4. 日々のループ（check / fix / pre-commit / doctor の読み方）
  5. エージェントに渡す入口（→ docs/agents/workflow.md。**初回 change 手順は埋めない**）
  6. **オプションの選び方と入れ方**（機構別 3 グループの決定表・本ガイドの中核）
  7. 詰まったとき（`task doctor` → `diagnosing-bugs` ＋ 典型詰まり）
- **README 配線**: 冒頭付近に 1 行ナッジ（通し解説は `docs/guide.md`）＋「ドキュメント構成」節に
  `docs/guide.md` 行を追加する。
- **新規 `docs/template/adr/0007-*.md`**（軽量 ADR）: 下流ユーザガイドを出荷する判断と
  SoT 境界（文脈は重複可・事実は owner 参照）を永続記録する。pre-merge close で change ディレクトリが
  main から消えても根拠が残るようにするため。

spec delta は `changes/add-downstream-usage-guide/specs/downstream-usage-guide/spec.md` に置く
（engine のデルタ必須要件を満たす。close 時削除で `openspec/specs/` 出荷時空を維持）。

## 設計判断

1. **README は quickstart のまま・guide は深い版**。usage の walkthrough を README から移さず、
   guide は why / when / メンタルモデル / トラブルを物語る。GitHub ランディングの第一印象を保つ。
2. **ガードレール「文脈は重複可・事実は参照」**。guide は why / when / メンタルモデルを自由に
   物語ってよいが、owner が別にある**事実**は再掲せず参照する。ドリフト源を増やさないため。
   ここで「事実」を **task コマンド名・extra 名・パッケージ version・各オプションの導入コマンド列・
   ファイルパス** と定義する（これ以外は文脈扱い）。
3. **§6 は機構別 3 グループの決定表**（(a) extras=uv / (b) エージェント拡張=GSD・Codex レビュー・
   caveman hook / (c) MCP server=Serena・GitHub）。列は 機能 / 何を足す / いつ要る・避ける（前提含む）/
   入れ方 / 詳細リンク。導入機構と前提がグループで揃い、入れ方列が混在しない。
4. **guide は `docs/template/` を参照しない**（依存方向は ADR-0007 → guide の一方向）。
   `task prune-template-docs -- --apply` で ADR-0007 が消えても guide が壊れないため。
   ADR-0006 の「AGENTS.md / doctor はテンプレ ADR に機能依存しない」と同型。
5. **SoT 境界の根拠は ADR-0007 に永続化**。pre-merge close で change ディレクトリは main から
   消えるため、`proposal.md` にだけ書くと根拠が失われる。ADR は prune 可（下流が不要なら削除）。
6. **security dependency-group は §6 に独立行を作らない**（コア運用側）。extras 込みの任意監査は
   extras 行の付随注として `docs/optional/extras-audit.md` を指す。**GitHub MCP** の owner リンクは
   `docs/agents/mcp.md`（`docs/optional/` 配下でない）。

## 受け入れ基準

- [ ] `docs/guide.md` が存在し、7 章（位置づけ / 全体像 / 立ち上げの「なぜ」/ 日々のループ /
      エージェント入口 / オプション決定表 / 詰まったとき）を持つ。
- [ ] §6 が機構別 3 グループの決定表で、各行に「いつ要る・避ける（前提）」列を持ち、GSD＝Node /
      Codex レビュー＝ChatGPT sub or API key / caveman hook＝Claude Code 限定 の前提が記載されている。
- [ ] §6 冒頭に opt-in 前提（既定で入らない・不在が正常・在席は `task doctor` が INFO 報告）と、
      §6 単独で読んでも誤読しない自己完結 1 行がある。
- [ ] guide 内に `docs/template/` への参照が無い（`grep -n 'docs/template' docs/guide.md` が空）。
- [ ] guide 内の相対リンク先が出荷時に実在する（リンク切れゼロ）。
- [ ] `task prune-template-docs -- --apply` 後も guide が壊れない（リンク切れゼロ・verify で確認）。
- [ ] guide が task コマンド / extra 名 / version / 各オプション導入手順の**実体を再掲せず**参照している。
- [ ] README に guide への冒頭ナッジと「ドキュメント構成」行がある。
- [ ] `docs/template/adr/0007-*.md` が SoT 境界（文脈は重複可・事実は参照）と依存方向（ADR→guide）を記録している。
- [ ] `task check` が green。
- [ ] `openspec validate add-downstream-usage-guide` が green。
- [ ] `openspec/specs/` の出荷時空を維持する（spec delta は change 配下）。

## Non-goals

- **OpenSpec 初回 change の quickstart 埋め込み**（backlog #12・§5 は `docs/agents/workflow.md` へ委譲。
  OpenSpec 不使用の研究者もいるため意見を注入しない）。
- **意見的な研究ワークフロー**（例実験の同梱・data / results / configs / notebooks の運用規範）。
  gitignore 方針の事実接続のみ（コア最小主義）。
- **README の usage walkthrough を guide へ移すこと**（README は quickstart のまま）。
- **各 `docs/optional/*.md` の手順を guide へ再掲すること**（guide は参照に留める）。
- **`docs/optional/` の索引ファイル新設**（本 change では guide §6 が俯瞰導線を担う）。
