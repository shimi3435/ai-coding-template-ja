# bounded review convergence を運用契約へ追加する

## Why

ADR-0009 はエージェント作業を恒久成果と distinct failure / seam / risk の検証価値へ比例させるが、
review finding の修正をどこまで反復し、どの証跡を再利用し、どの時点で人間へ判断を戻すかは定義して
いない。Issue #43 では、必要な blocker 修正を維持したまま、同じ入力と同じ risk に対する全スコープ
review、全体 check、fresh agent の無制限な反復を止める具体的な収束契約が必要である。

## What Changes

- OpenSpec 直接経路では change、GSD 経路では phase を単位とする bounded review convergence cycle を定義する。
- self-review、initial full review、最大3回の fix / focused validation / diff review、fresh final full review、
  `task check`、同じ cycle の executor / reviewers と別の独立 verifier の順序を固定する。
- green evidence の command 単位の入力同一性と fail-closed な再利用条件を定義する。
- self-review の tracked / untracked inventory と、安全に全文検査できない file の未検証分類を定義する。
- required evidence 欠落 / 不明を blocker とし、optional / out-of-scope / 研究環境制約だけを理由付き未検証にできる境界を定義する。
- material 実装、review、finding 修正、final review、verification の標準 agent 配分を定義する。
- `STATE`、`ROADMAP`、checkbox、report path の機械的補正を main の責務として分離する。
- blocker、iteration exhaustion、仕様判断、material expansion、agent failure、CI failure の soft-stop と
  再計画条件を定義する。
- ADR-0009、`AGENTS.md`、`CONTEXT.md`、workflow、`self-review`、`verify-change` を同じ契約へ整合する。
  `CONTEXT.md` には4用語だけを追加して詳細 owner である workflow への明示リンクを置き、恒久文書と
  skill の stable policy anchors を最小の静的 contract test で検査する。
- 変更する2つの first-party skill の実体と `skills.lock.json` の SHA-256 integrity contract を同期する。

## Capabilities

### New Capabilities

- `agent-review-convergence`: review / fix / validation / verification を有界に収束させ、blocker を成功扱い
  せずに人間へ判断を戻す運用契約。

### Modified Capabilities

- なし。

## Impact

- 変更対象はテンプレート所有の policy docs、workflow、2つの local skill、その直接依存である
  `skills.lock.json` の2 digest、静的 contract test に限る。
- 既存 ADR-0009 の比例性と evidence economy は再定義せず、その実行時運用を具体化する。
- runtime、公開 API、永続データ、trust boundary、外部 GSD runtime は変更しない。
- 通常 CI は pre-merge close で削除する OpenSpec artifacts、外部 GSD 文面、一時 `.planning` state、
  全文 snapshot に依存しない。
- standalone skill の自己完結性を優先し、minimum evidence fields の重複を workflow 参照や共通 fixture へ
  抽象化せず、既存の静的 contract test で整合を検査する。

## Acceptance Criteria

- bounded topology、最大3 iterations、fresh final reviewer、同じ cycle 内で独立した verifier、blocker 非成功が恒久文書と
  skill に一貫して定義される。
- command 単位の green evidence identity、再利用可能条件、入力不明時の再実行が定義される。
- self-review が ignored を除く未追跡 file を検査し、large / binary / truncation 不明を required 性で分類する。
- standalone self-review の evidence が command / exit 0 を含み、`verify-change` が required evidence 欠落 /
  不明を blocker、限定した optional evidence だけを理由・影響付き未検証として扱う。
- executor 継続、finding ごとの fresh agent 禁止、distinct verification value がある場合だけの追加配分が
  定義され、既存の task 単位 fresh 委譲規約を置換し、機械的補正を main に残す。
- exhaustion、仕様判断、material expansion、連続 agent failure、再現する infrastructure failure が
  soft-stop となり、継続時は新しい cycle として再計画される。
- stable headings / policy anchors / 重要数値・順序を検査する静的 test が1ファイルに追加される。
- `openspec validate bound-agent-review-convergence --strict`、`task openspec:validate`、`task check` が green になる。
- pre-merge close policy に従い、軽量 retrospective を既存記録先へ1行だけ残す。

## Current Convergence Replan

旧 cycle は3 iterationsを消費しても Issue #43 本文との整合 blocker が残ったため soft stop した。
[Issue #43](https://github.com/shimi3435/ai-coding-template-ja/issues/43) は 2026-08-09T12:43:36Z に更新され、
correctness / contract defect の RED / probe、純 prose と mechanical defect の例外、main の機械的補正責務が
明記された。これにより旧 blocker は解消した。

人間の継続判断を新 convergence cycle として再計画する。iteration は0へ戻し、新しい最大3 iterationsを持つ。
同じ full-scope inventory で initial full review、必要な fix / focused validation / diff review、別 reviewer の
final full review、最新入力の `task check`、独立 verifier の再確認を順に行う。旧 cycle の verifier は
agent tree に存在せず再利用条件を満たさなかったため、新しい独立 verifier を1名割り当てた。旧 cycle の
review 完了を新 cycle の full review の代用にしない。

## Out of Scope

- token accounting、課金集計、dashboard、常時 resource accounting。
- review 回数を永続管理する state machine、新しい CLI / validator / orchestration wrapper。
- 外部 GSD runtime / workflow の fork、共通実行契約、自動停止実装。
- `harden-openspec-gsd-handoff-lifecycle` の仕様・実装変更。
- blocker を残したまま品質を打ち切る hard cap。
- OpenSpec artifacts、外部 GSD 文面、一時 `.planning` state、全文 snapshot を通常 CI へ固定すること。
