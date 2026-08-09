# 実行予算

- **Route**: OpenSpec 直接経路。Issue #43 は一体の運用契約で、独立出荷可能な複数成果、依存 phases、
  有益な隔離並列単位、runtime / trust boundary / 公開 API / 永続データ変更を持たず、単一 executor と
  単一 convergence cycle で安全に実装・検証できる。直接経路では本 change、GSD 経路なら各 phase が
  cycle 単位となる。
- **恒久成果**: ADR-0009 の具体化、`AGENTS.md` の到達可能な要約、`CONTEXT.md` の4用語と詳細 owner である workflow への明示リンク、workflow の
  詳細契約、`self-review` / `verify-change` の evidence reuse 整合、1つの静的 contract test file。
- **一時実行証跡**: 本 change の proposal / design / spec delta / tasks、review / fix report、検証 log。
  pre-merge close 時に change directory を削除し、通常 CI をこれらや `.planning` に依存させない。
- **早期検証**: 恒久 policy docs / skills を更新して静的 test を追加した直後、targeted static contract test を
  実行して通常 CI と同じ恒久入力だけで policy anchors を検査する。OpenSpec 仕様段階では strict target
  validate と `task openspec:validate` までを行い、`task check` は実装収束後に行う。
- **停止・再計画**: trust boundary、公開 API、永続データ形式 / migration、runtime dependency / lockfile、
  build / CI / 配布経路、独立出荷可能な成果、外部 GSD runtime、新しい state machine / CLI / validator /
  orchestration wrapper、複数 runtime 共通契約を追加する場合は即時 soft-stop し、change 分割または GSD 経路を
  再判定する。3 iterations exhaustion、仕様判断、同じ役割の連続 agent failure 2回、working state 安全性不明、
  retry 後の infrastructure failure も同じ停止契約に従う。
- **Executor**: material implementation は同じ executor が全 task と finding fix を継続する。task ごとの fresh
  agent は作らない。main 実行主体が各成果を検証後に checkbox を更新する。独立実装単位はないため並列化しない。

## 新 convergence cycle 再計画（cycle 2）

- **再開理由**: 旧 cycle は iteration 3/3 後も Issue #43 本文との整合 blocker が残り soft stop した。
  Issue 本文は 2026-08-09T12:43:36Z に更新され、RED / probe の適用境界と main の機械的補正責務が
  canonical contract と一致したため、blocker は解消した。
- **Scope / inventory**: Issue #43、本 change の proposal / design / spec delta / tasks、ADR-0009、
  `AGENTS.md`、`CONTEXT.md`、workflow、`self-review`、`verify-change`、`skills.lock.json` の2 digest、
  静的 contract test、直接依存 / 利用元。外部 GSD runtime、無関係な repository 全体、一時 `.planning` は除外する。
- **Iteration budget**: 旧 cycle の3回を引き継がず、iteration 0/3から最大3回を新規に割り当てる。
- **Topology**: full-scope initial review → 必要な fix / focused validation / diff review → 別 reviewer の
  final full review → 最新入力の `task check` → 独立 verifier の再確認。旧 cycle の full review は代用しない。
- **Verifier reuse**: 既存 verifier が executor / reviewers と別役割で、fix 非関与、context contamination なし、
  最新入力との evidence identity を確認できる場合だけ再利用する。

# Tasks

- [x] 1. `docs/template/adr/0009-proportional-agent-workflow-evidence-economy.md` に bounded review convergence を追記し、既存の比例性原則を再定義せず具体化する。
- [x] 2. `CONTEXT.md` に convergence cycle、iteration、reusable green evidence、soft stop の4用語だけを追加し、既存 material expansion 定義を永続データ形式 / migration、runtime dependency / lockfile、build / CI / 配布経路まで整合し、4用語の詳細 owner である workflow 該当節へ明示リンクする。
- [x] 3. `AGENTS.md` に topology、最大3 iterations、command 単位 evidence reuse、soft-stop、executor 継続、main の機械的補正責務の到達可能な要約を追加し、task 単位 fresh 委譲規約を置換する。
- [x] 4. `docs/agents/workflow.md` に full-scope inventory、blocker 意味分類、固定 topology、iteration 計数、validation cadence、evidence identity、agent allocation、main の機械的補正責務、soft-stop / new cycle、close 後再検証の詳細を追加し、既存の task 単位 fresh・直列のみ規約と参照を置換する。
- [x] 5. `.agents/skills/self-review/SKILL.md` を、self-review 1回、明白な欠陥の focused validation、判断事項の initial reviewer 引継ぎ、同一入力への重複 full check 禁止へ整合し、`skills.lock.json` の対応 SHA-256 digest を同期する。
- [x] 6. `.agents/skills/verify-change/SKILL.md` を、command 単位の green evidence identity を fail-closed に確認し、再利用可能なら全体 check を重複せず、focused tests / 実動作 seam は省略しない手順へ整合し、`skills.lock.json` の対応 SHA-256 digest を同期する。
- [x] 7. 恒久 policy docs / skills の stable headings、policy anchors、最大3 iterations、topology 順序、evidence reuse、material expansion、blocker 非成功を検査する静的 contract test を1ファイル追加する。OpenSpec artifacts、外部 GSD 文面、`.planning`、全文 snapshot は参照しない。
- [x] 8. targeted static contract test を実行し、通常 CI と同じ恒久入力だけで CI parity を早期確認する。
- [x] 9. `spec-holes` Phase 2 mapping を実装 test / 理由付き未検証と照合し、canonical requirements / scenarios / acceptance criteria の全項目を成果と evidence に対応付ける。
- [x] 10. self-review を1回行い、明白な欠陥を修正して focused validation し、判断事項を initial reviewer へ渡す。
- [x] 11. 固定 inventory で initial full review を行い、必要なら合計最大3回の fix / focused validation / diff review で blocker を閉じる。
- [x] 12. initial reviewer と別の fresh reviewer が同じ inventory を final full review し、新 blocker は残 iteration 内の fix / focused validation / diff review で閉じる。全スコープ review は再反復しない。
- [x] 13. review 収束後の最新入力で `task check` を1回実行する。source failure は残 iteration へ戻し、infrastructure retry は同一入力で1回だけとする。
- [x] 14. 同じ cycle の executor / reviewers と別の独立 verifier が acceptance evidence と入力同一性を確認し、再利用可能な `task check` は重複実行せず、必要な focused / 実動作 seam を独立確認する。
- [x] 15. `openspec validate bound-agent-review-convergence --strict` と `task openspec:validate` を再実行し、strict target と全 active changes を green にする。
- [x] 15.1 iteration 3 の canonical update として self-review inventory、RED / probe 例外、standalone evidence、required / optional evidence 分類、Standards judgement を proposal / design / spec delta / tasks へ固定する。
- [x] 15.2 `tests/test_review_convergence_contract.py` に stable assertions を RED で追加し、`self-review` / `verify-change` と対応する `skills.lock.json` digest を TDD で整合する。共通 fixture / abstraction は追加しない。
- [x] 15.3 旧 cycle の iteration 3/3 と soft-stop 実績を既存 evidence に照合する。完了済み fix / focused validation / Spec diff review と未完了 gate を区別し、Issue #43 本文との整合 blocker が残ったため成功扱いしなかったことを記録する。
- [x] 15.4 新 cycle を iteration 0/3として開始し、上記 inventory に対する full-scope initial review を実行する。
- [x] 15.5 initial review の blocker があれば、同じ executor が最大3 iterations内で fix / focused validation を行い、initial reviewer が差分と直接依存を review する。
- [x] 15.6 initial reviewer と別の reviewer が同じ inventory を final full reviewし、新 finding は残 iteration 内の差分収束で閉じる。全スコープ review は再反復しない。
- [x] 15.7 review 収束後の最新入力で `task check` を実行し、再利用条件を満たす既存 verifier、または条件不成立時の新しい独立 verifier が acceptance evidence と入力同一性を独立再確認する。
- [x] 15.8 `openspec validate bound-agent-review-convergence --strict` と `task openspec:validate` を実行し、新 cycle の原本整合を green にする。
- [ ] 16. pre-merge close 前に既存 retrospective へ軽量記録を1行追記する。soft-stop 発生時だけ optional suffix を Issue または retrospective の一方に追記し、重複記録しない。
- [ ] 17. retrospective / tasks 更新後に影響 command だけを再実行し、対象 change directory を削除する。削除後 `task openspec:validate` で active change 0 / green を確認し、静的 test が削除 artifacts を入力にしない契約を満たす場合だけ `task check` evidence を再利用する。
