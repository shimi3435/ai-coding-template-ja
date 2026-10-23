# Change: virtualenvの修正済み依存と受入証跡を更新する

## Why

PR #93の21.14.9は監査が成功したが、その後の上流修正との照合が不足していた。
利用者は2026-10-24に、同じPRで21.14.13への最小更新、一時probe、根拠の限定的記録を承認した。
旧cycleの完了済み証跡はtasks.mdに履歴として保持し、新しい入力の成功証跡へ流用しない。

## What Changes

- virtualenvを21.14.13へ更新し、resolverが要求する推移依存だけ追従させる。
- 修正差分との照合、一時app-data削除後のseed利用、bash prompt再描画を確認する。
- 既存監査、hook、正式gate、独立review/verifier、最終HEADのHosted CIを確認する。
- 修正根拠の確認限界をPR本文へ明記し、ふりかえりを訂正する。

## Impact

恒久差分はuv.lockとdocs/template/retrospectives.mdに限定する。
公開設定、CI、監査範囲・ignore、既存環境の自動修復、監査基盤の恒久改修は対象外。
監査基盤の補完は別Issue候補の文面のみ用意し、自動起票しない。mergeは利用者が行う。
仕様はdesign / spec delta / spec-holes、検証計画はvalidation、進捗はtasksを正とする。
