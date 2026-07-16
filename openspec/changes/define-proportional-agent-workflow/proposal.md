# Change: エージェント実行を恒久成果と検証価値へ比例させる

## Why

大規模 change では OpenSpec / GSD により安全な計画・復帰・検証を得られる一方、生成可能な plan、
evidence、micro commit、静的 contract test を増やし続けると、恒久成果より一時証跡へ多くの AI 資源を
使い、高リスクな実動作 seam の検証が後回しになる。ADR-0008 の適応型経路を維持したまま、何を
作らないか、いつ停止・再計画するかを全エージェント共通の workflow に固定する。

## What Changes

- 恒久成果、一時実行証跡、実行予算、検証価値を project language として定義する。
- change の実装開始前に、経路、恒久 / 一時 artifacts、早期 CI parity、停止・再計画条件を記録する。
- evidence は distinct failure / seam / risk、復帰、レビュー判断のいずれかへ価値を持つ場合だけ追加する。
- 検証を実動作 seam から静的 prose contract までリスク順に優先する。
- green 後の nit / 独立 hardening を別 change へ送り、現在 change の無制限な拡張を止める。

## Impact

- `CONTEXT.md`
- `AGENTS.md`
- `docs/agents/workflow.md`
- `docs/template/adr/0009-proportional-agent-workflow-evidence-economy.md`
- 実行 engine、CI job、依存、プロダクト API は変更しない。
