# Change: OpenSpec / GSD の適応型実行境界を定義する

## Why

現行 ADR-0003 は、単一 change 内の詳細タスクと進捗を OpenSpec `tasks.md` が所有し、GSD は
複数 changes を横断するロードマップだけを担うと定めている。この境界は小規模 change では
単純だが、複数セッションや依存する実装 phase を必要とする一体の成果では、GSD の計画・復帰・
検証機能を使えないか、OpenSpec と GSD に詳細計画を二重化することになる。

OpenSpec を仕様・スコープ・受け入れ基準・最終完了判定の単一の正に保ちながら、小規模 change は
OpenSpec CLI（または Markdown fallback）で直接実行し、大規模 change は GSD が詳細計画と実行を
担う境界を定義する。独立して出荷できる成果は別 OpenSpec changes とし、一体の成果に必要な実装
分割だけを同一 change の GSD phases とする。

## What Changes

- ADR-0003 を履歴として残し、ADR-0008 が supersede する。ADR-0003 には `Superseded by`、
  ADR-0008 には `Supersedes` を記載する。
- OpenSpec は全経路で proposal、design、spec delta、受け入れ基準、`spec-holes`、最終完了判定を
  所有する。
- 単一セッションかつ単一コンテキストで安全に実装・検証できる小規模 change は、OpenSpec
  `tasks.md` に詳細タスクを置き、`openspec instructions apply --change <id>` の指示に沿って
  実行する。CLI は実装や checkbox 更新を自動化しないため、実行主体が完了時に `- [x]` へ更新する。
- 複数セッション、依存順序を持つ複数 phase、有益な隔離並列単位、または単一コンテキストで安全に
  完了・検証できない条件のいずれかを満たす大規模 change は、経路と理由を記録して GSD へ手動で
  handoff する。OpenSpec `tasks.md` は handoff、全 phases 完了、OpenSpec 原本検証、project checks、
  close の境界ゲートだけを持ち、詳細計画と進捗は GSD に一本化する。
- 手動 handoff は change ID、canonical artifact paths、完了済み境界ゲート、対象 branch / commit、
  未解決事項を GSD に渡す。GSD phases は元の change を参照し、仕様や受け入れ基準を複製・再定義
  しない。
- `openspec instructions apply --json` は artifact のパス列挙と task progress の取得にだけ使う。
  canonical 内容は列挙された Markdown ファイルから読む。JSON が利用できない場合は固定された
  OpenSpec directory 規約から同じファイルを読み、`tasks.md` の checkbox から進捗を算出する。
- 実装中に大規模条件を満たした場合は、完了済み tasks を保持し、未完了範囲を境界ゲートへ再構成
  して承認後に GSD へ昇格する。独立出荷可能な成果を発見した場合は、実行を止めて OpenSpec
  changes を分割する。
- GSD 実行中に仕様変更が必要になった場合は OpenSpec 原本を先に更新し、`spec-holes` と validate
  後に影響 phases を再計画する。GSD が利用不能または安全に継続できない場合も自動で経路変更せず、
  状態と `tasks.md` 再構成案を提示して承認を得る。
- 全 GSD phases の検証後も、OpenSpec 原本の全 requirements / scenarios と実装・テストの対応を
  独立して検証する。`task openspec:validate` と `task check` を含む全ゲート成功後だけ change を
  完了とする。
- `AGENTS.md`、`openspec/project.md`、`docs/agents/workflow.md`、`docs/optional/gsd.md`、
  `docs/guide.md` を新しい境界と具体的な手動 handoff 手順へ整合させる。
- `docs/template/grill/ai-coding-template-ja.md` は当時の設計入力として本文を改稿せず、ADR-0003 の
  境界が ADR-0008 により supersede され、現行規約は `AGENTS.md` / workflow を参照する旨を
  冒頭へ注記する。
- テンプレートの pre-merge close 規約を維持するため、一つの PR は一つの active change だけを
  運ぶ。本 change を先に専用 branch で close / merge し、blocked な後続 changes は main や
  backlog へ複製せず、依存順の別 branch に保持して段階的に merge する。
- bridge、統一 skill、manifest、stable requirement ID、drift / ownership / cleanup の機械化、
  fixtures、smoke test は後続 change `automate-openspec-gsd-handoff` へ分離する。

## Capabilities

### New Capabilities

- `adaptive-change-execution`: OpenSpec が change の仕様と最終完了を所有したまま、規模に応じて
  OpenSpec CLI / Markdown fallback の直接実行または GSD phases の手動実行を選ぶ運用規約。

### Modified Capabilities

- なし。`openspec/specs/` はテンプレート出荷時に空であるため、現行運用の変更を新 capability
  として定義する。

## Impact

- **Governance**: `docs/template/adr/0003-openspec-gsd-boundary.md` を ADR-0008 により superseded
  とし、`AGENTS.md`、`openspec/project.md`、workflow、optional GSD、guide を更新する。historical
  grill 文書には現行 authority への注記だけを追加する。
- **Execution**: 小規模 change は OpenSpec CLI / Markdown fallback、大規模 change は手動 GSD
  handoff とし、どちらも OpenSpec を仕様と最終完了の正にする。
- **Dependencies**: GSD は引き続き opt-in。OpenSpec CLI と GSD のどちらが不在でも Markdown
  fallback により仕様管理は維持できる。
- **Deferred implementation**: bridge / skill / manifest とそのテストは後続 change に属し、
  本 change では作成しない。
- **Delivery**: 本 change、MVP、hardening は専用 branches / PRs で依存順に merge し、各 PR は
  pre-merge close 後に `openspec/changes/` を main へ残さない。
