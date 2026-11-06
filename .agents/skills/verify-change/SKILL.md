---
name: verify-change
description: >
  Verify a change through focused tests, applicable real operation, and required
  project gates. Report verified / not applicable / unverified. Use after a
  sizeable change or when asked for 動作確認 / verify-change.
---

# verify-change（実動作確認）

テスト成功だけでは分からない公開挙動と実行環境を確認する。
レビューの起動・修正・tasks.mdの進捗更新は実行担当が所有する。
開始時に[検証順序・証跡再利用・完了条件](../../../docs/agents/workflow.md#validation-cadence-と-reusable-green-evidence)を読む。

## 実行

1. 受入条件と変更されたinterfaceから、検証するseamと成功条件を選ぶ。高リスクな実動作 / safe dry-runを優先する。
2. 変更対象に近いテストを個別に実行する。実動作が適用可能なら関数、公開CLI、設定の診断を実際に試し、
   出力・副作用・失敗時の振る舞いを確認する。focused tests / 実動作seamは毎cycle実行する。
3. 必須project gate `./scripts/check.sh` は共通workflowの入力同一性を満たすgreen evidenceがあれば再利用し、
   なければ最新入力で実行する。独立検証として呼ばれた場合も同じ規則に従う。
4. 各結果を下記に分類して実行担当へ返す。検証のために仕様を拡張したり、失敗を成功へ読み替えたりしない。

## 出力

- **verified**: command、結果、対象の挙動。全体gateはfresh実行 / green evidence再利用を区別する。
- **not applicable（N/A）**: focused validationと代替静的検証が構造上非該当である理由。
- **unverified**: 環境制約、検証失敗、確認できない範囲と影響。必須検証は未実行のまま完了にできない。

required evidenceの欠落・required性不明はblockerとする。optional seam、明示的scope外、研究環境制約の
区別と、tasks.mdへ残す証跡形式は共通workflowに従う。未検証を検証済みとして報告しない。
