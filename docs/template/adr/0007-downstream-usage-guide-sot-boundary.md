# 下流ユーザ向け通し読みガイドを出荷し SoT 境界を「文脈は重複可・事実は参照」に固定する

README は quickstart（新規作成 → rename → green・タスク表）に最適化されており、オプションの手順は `docs/optional/*.md` と `docs/agents/mcp.md` に個別分散している。その結果、下流の人間ユーザ（研究者）が「なぜその手順か」「どのオプションをいつ入れるか」「詰まったらどこを見るか」を通し読みで把握する導線が無かった。オプション（extras / GSD / Serena MCP / GitHub MCP / Codex レビュー / caveman hook）の選定と前提（Node / ChatGPT サブスクリプション or API key / Claude Code 限定）を一望できる決定表もどこにも無かった。

そこで人間下流ユーザ向けの通し読みガイド `docs/guide.md`（7 章: 位置づけ / 全体像・メンタルモデル / 立ち上げの「なぜ」/ 日々のループ / エージェント入口 / オプション決定表 / 詰まったとき）を出荷する。

- **配置**: `docs/guide.md` は `docs/template/` 配下に**置かない**。テンプレのメタ文書（作り方の記録）ではなく下流の永続成果物であり、`task prune-template-docs -- --apply` で消えてはならないため。
- **SoT 境界「文脈は重複可・事実は参照」**: ガイドは why / when / メンタルモデル / トラブルの物語（文脈）を README 等と重複して語ってよいが、owner が別にある**事実**は再掲せず owner（README / `docs/optional/*.md` / `docs/agents/*.md`）を参照する。ここで「事実」とは **task コマンド名・extra 名・パッケージ version・各オプションの導入コマンド列・ファイルパス**を指す。ドリフト源（同じ事実の二重管理）を増やさないための線引き。
- **依存方向は ADR-0007 → ガイドの一方向**: ガイドは `docs/template/` を参照しない。ADR-0006 の「AGENTS.md / doctor はテンプレ ADR に機能依存しない」と同型で、下流が `docs/template/` を prune してもガイドにリンク切れが生じない（本 ADR 自体も prune 可。消えてもガイドは機能的に自己完結する）。
- **§6 決定表は導入機構別 3 グループ**: (a) extras（uv）・(b) エージェント拡張（GSD / Codex レビュー / caveman hook）・(c) MCP server（Serena / GitHub）。各行に「いつ要る・避ける（前提）」列を必須とし、§6 冒頭に opt-in 前提（既定で入らない・不在が正常・在席は `task doctor` の INFO 報告のみ）を置く。
- **security dependency-group は独立行にしない**: コア運用側（CI audit ジョブ / `task security`）であってユーザが選ぶオプションではないため。extras 込みの任意監査は extras グループの付随注として `docs/optional/extras-audit.md` を指す。GitHub MCP の owner リンクは `docs/agents/mcp.md`（`docs/optional/` 配下に手順ファイルが無いため）。
- **根拠の永続化**: 本判断を導いた OpenSpec change（`add-downstream-usage-guide`）はマージ前 close で `openspec/changes/` から削除されるため、proposal にだけ書くと根拠が main から失われる。本 ADR がその永続記録を担う。

## Considered Options

- **README に walkthrough を吸収**: 導線は一本化されるが README が肥大し、GitHub ランディングの quickstart としての第一印象を毀損する。却下。
- **`docs/optional/` に索引 README を新設**: オプションの俯瞰は担えるが、立ち上げ・日々のループ・トラブル導線の物語が置けず、ガイド §6 と二重化する。却下（§6 が俯瞰導線を担う）。
- **ガイドに手順・コマンドを再掲**: 単体で完結し即時性は上がるが、owner との二重管理になりドリフト源が倍化する。却下（事実は参照・文脈のみ重複可）。
- **根拠を change の proposal のみに記録（ADR 無し）**: マージ前 close 規約で change ディレクトリごと main から消え、SoT 境界の根拠が失われる。却下。

## Consequences

- 事実の変更（タスクの改名・extra の追加・手順の変更）ではガイドの更新は原則不要で、owner 側だけを直せばよい。ガイドが壊れるのはリンク先ファイルの移動・削除時のみで、相対リンクの実在確認で機械的に捕捉できる。
- オプションを新設するときは、owner となる手順文書（`docs/optional/*.md` 等）に加えてガイド §6 の該当グループへ 1 行足す（3 グループ分類と「いつ要る・避ける（前提）」列を保つ）。
- ガイドは `docs/template/` を参照しないという制約を将来の編集でも維持する（`grep -n 'docs/template' docs/guide.md` が空であることで検査できる）。
