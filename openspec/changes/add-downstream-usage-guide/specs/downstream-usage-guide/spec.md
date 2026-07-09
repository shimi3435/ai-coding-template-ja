# downstream-usage-guide（下流ユーザ向け利用ガイド）仕様差分

本 change による capability `downstream-usage-guide` への追加分。archive せず close 時に
ディレクトリごと削除するため、`openspec/specs/` へはマージされない。

## ADDED Requirements

### Requirement: 下流ユーザ向け通し読みガイドの出荷
テンプレートは、人間の下流ユーザ（研究者）向けの通し読み利用ガイドを `docs/guide.md` として出荷しなければならない（SHALL）。ガイドは 7 章（位置づけ・全体像/メンタルモデル・立ち上げの「なぜ」・日々のループ・エージェントに渡す入口・オプションの選び方と入れ方・詰まったとき）で人間の触点を通し、`docs/template/` に置かない（`task prune-template-docs` で消えない永続成果物とする）。

#### Scenario: 初めて使う下流研究者
- **WHEN** テンプレから作成した研究者が使い方の全体像とオプションの選び方を通し読みしたい
- **THEN** `docs/guide.md` を先頭から読むだけで、立ち上げの「なぜ」・日々のループ・オプション選定・詰まったときの導線に到達できる

#### Scenario: メタ文書 prune 後もガイドは残る
- **WHEN** 下流が `task prune-template-docs -- --apply` でテンプレのメタ文書を削除する
- **THEN** `docs/guide.md` は `docs/template/` 配下でないため削除されず、ガイド内にリンク切れが生じない

### Requirement: 事実は参照・文脈は重複可のドリフト防止境界
ガイドは、owner が別に存在する事実を再掲してはならず（SHALL NOT）、owner を参照しなければならない（SHALL）。ここで「事実」とは task コマンド名・extra 名・パッケージ version・各オプションの導入コマンド列・ファイルパスを指す。why / when / メンタルモデル / トラブルの物語（文脈）は README 等と重複してよい。

#### Scenario: 手順の実体は owner を参照
- **WHEN** ガイドがオプション導入や日々のタスクに言及する
- **THEN** 具体的な `task` コマンド・extra 名・version・導入コマンド列は再掲されず、README のタスク表・`docs/optional/*.md`・`docs/agents/*.md` へのリンクで示される

#### Scenario: version を書かない
- **WHEN** ガイドが GSD 等のオプションに言及する
- **THEN** 固定 version は記載されず、在席判定は `task doctor` の INFO 報告に委ねられる

### Requirement: 機構別 3 グループのオプション決定表
ガイドの §6 は、既定で導入されないオプションの選定と導入を、導入機構別の 3 グループの決定表として示さなければならない（SHALL）。グループは (a) extras（uv）・(b) エージェント拡張（GSD / Codex レビュー / caveman hook）・(c) MCP server（Serena / GitHub）とし、各行は「いつ要る・避ける（前提）」列を持ち、前提（Node / ChatGPT サブスクリプション or API key / Claude Code 限定）を明記する。§6 冒頭に opt-in 前提（既定で入らない・不在が正常・`task doctor` が INFO 報告）と、§6 単独で読んでも誤読しない自己完結 1 行を置く。

#### Scenario: 全オプション不在の読者
- **WHEN** どのオプションも入れていない下流ユーザが §6 を読む
- **THEN** 冒頭の opt-in 前提により、表が「入れ忘れリスト」ではなく「要るときだけ入れる選択肢」だと読める

#### Scenario: 前提未達のオプション
- **WHEN** 読者が Node 未導入・ChatGPT サブスクリプション/API key 無し等の環境にある
- **THEN** §6 の「いつ要る・避ける（前提）」列でそのオプションの前提を確認でき、失敗手順の実体は各 `docs/optional/*.md` を参照する

#### Scenario: 監査ゲートと GitHub MCP の配置
- **WHEN** §6 が security 依存グループと GitHub MCP に触れる
- **THEN** security 依存グループは独立行を持たず extras 込み監査の付随注として `docs/optional/extras-audit.md` を指し、GitHub MCP の owner リンクは `docs/agents/mcp.md` を指す

### Requirement: SoT 境界の根拠を ADR に永続化しガイドは prune 耐性を持つ
テンプレートは、下流ユーザガイドを出荷する判断と SoT 境界（文脈は重複可・事実は参照）の根拠を ADR（`docs/template/adr/0007-*.md`）に記録しなければならない（SHALL）。依存方向は ADR-0007 → ガイドの一方向とし、ガイドは `docs/template/` を参照してはならない。

#### Scenario: pre-merge close で根拠が消えない
- **WHEN** 本 change が pre-merge close で `openspec/changes/` から削除される
- **THEN** SoT 境界の根拠は ADR-0007 に残り、main から失われない

#### Scenario: ADR を prune してもガイドが壊れない
- **WHEN** 下流が `task prune-template-docs -- --apply` で ADR-0007 を含む `docs/template/` を削除する
- **THEN** ガイドは ADR-0007 を参照していないためリンク切れが生じず、機能的に自己完結する

### Requirement: ガイドの発見性
README は `docs/guide.md` への導線を持たなければならない（SHALL）。冒頭付近の 1 行ナッジと「ドキュメント構成」節の行の 2 点でガイドを指す。

#### Scenario: README からガイドへ到達
- **WHEN** 利用者が README を開く
- **THEN** 冒頭付近のナッジと「ドキュメント構成」の行から `docs/guide.md` に到達できる
