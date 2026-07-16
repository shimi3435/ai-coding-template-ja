# Tasks: proportional agent workflow

## Route and execution budget

- **Route**: OpenSpec直接経路。文書4点とproject languageの一体的な小規模変更で、依存phase・隔離並列単位・複数セッションを要しない。
- **恒久成果**: `CONTEXT.md`、ADR-0009、`AGENTS.md`、`docs/agents/workflow.md`。
- **一時実行証跡**: 本 change directory。pre-merge closeで削除する。
- **早期検証**: `openspec validate define-proportional-agent-workflow --strict`。実装後に `task openspec:validate` と `task check`。
- **停止・再計画**: 自動metrics、CI job、tooling、固定token accounting、別workflow capabilityが必要になった時点で停止し、別changeを提案する。

## Implementation

- [x] 1.1 `CONTEXT.md` に恒久成果・一時実行証跡・実行予算・検証価値を定義し、ADR-0009へ判断と代替案を記録する
- [x] 1.2 `docs/agents/workflow.md` に実行予算、evidence economy、verification priority、早期CI parity、停止・再計画条件を記録する
- [x] 1.3 `AGENTS.md` に全エージェントが常時守る短い境界規則を追加する
- [x] 1.4 OpenSpec原本、ADR、workflow、AGENTSの対応を確認し、`task openspec:validate`、`task check`、`self-review`を完了する
