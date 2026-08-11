# v2 release notes

## Breaking: GSD handoff integration の削除

v2 は GSD 固有 integration をコアから削除した。次の入口は存在せず、互換 shim なしの breaking change
となる。

- Python package / module: `ai_coding_template_ja.openspec_gsd_handoff`
- script: `scripts/openspec-gsd-handoff-smoke.py`
- Taskfile entry: `openspec:gsd-handoff:smoke`
- handoff manifest、専用 fixtures、専用 tests

旧入口を呼ぶと、module / file / task の通常の不存在 error になる。deprecated alias や説明専用 shim は
提供しない。

## 移行

OpenSpec 直接実行へ移行する。

1. proposal、design、spec delta、受け入れ基準、`spec-holes` を canonical artifacts とする。
2. `tasks.md` に実装・検証の詳細 task、依存、対象、checkbox を置く。
3. 依存が全て完了した先頭の未完了 task から実装・検証し、checkbox を更新する。
4. agent から実行する場合は `execute-openspec-change` を明示呼出する。skill は preflight 後、同じ
   `tasks.md` を直接実行する。
5. OpenSpec CLI がない環境では Markdown fallback を使う。CLI 固有 state は復帰や完了判定に不要。

現行規約は [workflow](../agents/workflow.md)、判断理由は
[ADR-0010](adr/0010-openspec-direct-execution.md) を参照する。

## 旧 integration のふりかえり履歴

- 2026-07-14 revise-openspec-gsd-execution-boundary（PR #40）: 逃した欠陥 1 件（self-review=0 / review=1 / CI=0 / merge後=0）— Claude Code review で README の GSD 説明が旧境界のまま残っていた不整合を検出
- 2026-07-16 automate-openspec-gsd-handoff（PR #41）: 逃した欠陥 6 件（self-review=1 / review=3 / CI=2 / merge後=0）— self-review=Linux capability guard 不足、review=prefix capability sort・Markdown link誤検知・Linux smoke前提の未記載、CI=source-pinned testのshallow clone非互換・rename後のsmoke import残存
