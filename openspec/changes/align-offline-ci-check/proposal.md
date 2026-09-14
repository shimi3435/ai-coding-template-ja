# 通常 CI とローカル offline check の一致

## Why

Issue #69: 通常 CI と rename-smoke はローカル task check の Skill integrity と automation tests を欠いている。検証一覧の重複をなくし、同じ構成・入力で同じ検証を実行する。

## What Changes

- 両ジョブで固定版 Task を準備し、検証を task check に一元化する。
- 恒久 contract tests で呼び出し、準備順序、失敗伝播、必要な検証の包含を保証する。
- fresh / rename の正常系と lock 破損・automation test 失敗を今回の受け入れ検証で確認する。
- 既存ガイドに実行範囲を反映する。仕様の穴と検証対応は design.md に記録する。

## Impact

対象: .github/workflows/ci.yml、tests/test_runtime_foundation_contract.py、tests/test_taskfile.py、docs/guide.md。
既存 Taskfile の検証一覧を再利用し、通常 CI は一時 OpenSpec artifacts に依存しない。
#51 の prune は後続で task check の残存構成を更新する。#64 候補 validate job、#65、一般的な CI 最適化は対象外。

## Acceptance

1. fresh / rename の両ジョブが準備後に同一の task check を無条件の失敗ゲートとして実行する。
2. 同梱 automation は機能無効でも検証し、Skill lock 破損と automation test 失敗を両経路で検出する。
3. offline gate に外部 host、認証、network、OpenSpec artifacts の依存を追加しない。
4. focused validation、self-review、OSWF-5 の review / project checks / verifier が完了する。
