# Skill更新PR自動化の撤去

## Why

[Issue #71](https://github.com/shimi3435/ai-coding-template-ja/issues/71)の合意・[比較PoC](https://github.com/shimi3435/ai-coding-template-ja/issues/71#issuecomment-5685204779)に基づき、[Issue #75](https://github.com/shimi3435/ai-coding-template-ja/issues/75)の不要な運用責務を撤去する。
基点は取得時の最新main `80d0bb7bc445e11de4e6dfff744f5add574f44b3`。
保守者専用や下流optionalとして移植せず、手動更新と通常PRを提供する。

## What Changes

- **BREAKING**: 専用workflow・automation subtree・candidate/smoke CLI・専用testsを削除する。
- 混在CLI、repository contracts、Taskfileのtest route、現行README/guide/safetyを残存構成に整合させる。
- 旧workflowを無効化し、進行中runを停止してから移行する手順を提供する。外部resourceは自動削除しない。
- 手動updater、source/lock、取得前上限、integrity、legal、offline verify、linksは保持する。
- CI check/rename-smokeは既存の共通 `task check` 経路を維持する。

## Scope / Impact

対象: `.github/workflows/skill-update-prs.yml`、`repo-tools/skill-update-automation/` と外側の専用参照。
仕様は `specs/skill-update-retirement/spec.md`、判断理由は `design.md`、12分類監査は `spec-holes.md`、実装・検証状態は `tasks.md`。
#76のupdater/lock移行、#52のinstaller撤去、#77のparser置換、#51のprune修復は対象外。
historical ADR/retrospective/監査本文は保持し、監査の現行導線だけ追記する。
実GitHubの停止・close・resource削除・push・PR作成・mergeは本ローカル実装の対象外。移行手順で人が扱う。

## Acceptance

1. 専用資産・公開経路・必須存在検査・live運用参照が除去され、代替automationもdangling importもない。
2. 残存updaterのremote/legal/手動更新testsとoffline verifyが成功する。
3. Node 24 / Python >=3.14でローカルcheck、offline隔離check、rename後checkが成功する。
4. 移行手順が未完了run、既存PR/branch/artifacts/設定、利用者差分を保護する。
5. OSWF-5の順序でself-review、独立review、最新入力check、別verifierを通す。

## Correction cycle 2（利用者合意済み）

close後のadversarial reviewで、guideの現行CI説明に旧automation testsとcandidate validate jobの言及が残っていたことが判明した。既存のlive references除去要件の未達として扱う。
修正対象はdocs/guide.md、既存documentation contract、retrospectives.mdである。現行CI説明節に限定した回帰検査を追加し、手順・historical文書の正当な言及は許容する。テストは一般的な自然言語の意味判定を保証しない。
利用者はgrillingで本範囲、同じchangeの再開、独立review→task check→別verifier→close→commit・pushを承認した。
