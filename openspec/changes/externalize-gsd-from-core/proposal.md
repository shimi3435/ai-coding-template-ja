# Change: GSD をコアワークフローから外部化する

## Status

提案中。実装と進捗は本 change の `tasks.md` を単一の正とする。

## Why

現行ワークフローは、change の規模やセッション数など主観的な条件から OpenSpec 直接経路と GSD 経路を選ぶ。経路選択、source pin、handoff、phase state、OpenSpec への再同期が追加の判断と保守を生み、仕様・進捗・完了の正本を理解しにくくしている。

品質に必要なのは、仕様の確定、詳細タスク、検証、停止・再計画、レビュー、最終完了判定である。これらを OpenSpec artifacts とリポジトリ規約に集約し、外部 orchestrator の有無を品質条件から外す。

## Dependencies

- v2 runtime foundation は `origin/main` の `1093b8080978e8b5961dac5ac0902c1654b1e887` で利用可能。
- `add-deterministic-skill-updater` の実装は本 change の merge まで停止する。本 change の merge 後、最新 `main` から再構成し、有用な実装順序だけを同 change の `tasks.md` へ移す。
- 一つの PR に一つの active change だけを置く。`add-deterministic-skill-updater` を本 change に混在させない。

## What Changes

- OpenSpec 直接実行を唯一のコア経路とし、`tasks.md` を実装順序、進捗、検証状態の正本にする。
- OpenSpec change が必要な変更を列挙条件で定め、独立出荷可能な成果だけを別 change へ分割する。
- `tasks.md` に最小タスク契約と、CI parity、停止・再計画、一時 artifact cleanup の実行制約を定める。
- `execute-openspec-change` skill を GSD handoff から OpenSpec 直接 executor へ再設計する。
- 全変更のself-reviewと適用可能なfocused validation、およびリスク列挙条件に基づく独立review、最大3回の修正cycle、project checks、独立verifierを定める。
- GSD 固有の package、CLI、Taskfile entry、handoff skill behavior、tests、fixtures、現行運用文書を互換 shim なしで削除する。
- 旧判断は Superseded ADR と v2 release notes にだけ残し、現行コード・tests・skills・設定・運用文書から GSD 名と契約を除く。実装中は本 change directory だけを一時的な追加例外とし、pre-merge close で消えることを要求する。
- `check:isolated` を OpenSpec CLI、外部 orchestrator、network がなくても core checks が通る tool-neutral contract にする。
- OpenSpec CLI は任意 engine のままとし、Markdown fallback を正式経路として維持する。

## Capabilities

### New Capabilities

- `openspec-direct-workflow`: OpenSpec artifacts と明文化された実行・検証規約だけで change を完了できるコアワークフローを提供する。

### Modified Capabilities

- なし。

## Impact

- **Breaking:** `openspec-gsd-handoff` Python CLI、`openspec:gsd-handoff:smoke` task、GSD handoff manifest / brief contract を削除し、互換 alias を残さない。
- **Workflow:** 経路選択、GSD phase、source-pinned handoff、GSD state 同期を廃止する。
- **Skills:** `execute-openspec-change` は同名のまま直接実行 skill へ意味を変更する。
- **Validation:** OpenSpec validation、self-review、適用可能なfocused validation、risk-based review、`task check` が完了条件を担う。
- **History:** ADR-0003 / ADR-0008 など旧判断は ADR-0010 から Superseded 履歴として保持する。v2 release notes に削除と移行方法を記録する。

## Out of Scope

- 特定の外部 orchestrator の導入、互換性、handoff 形式、利用手順を提供しない。
- `add-deterministic-skill-updater` の実装または仕様変更を本 change に含めない。
- OpenSpec CLI を core runtime dependency にしない。
- 利用者が外部orchestratorを選ぶ前の一般的な候補提示は妨げない。ただしread-only探索、在席確認、plugin検索、version probe、install、起動は提供しない。
