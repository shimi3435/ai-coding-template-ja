# 検証計画

1. mainと旧lock一致を確認し、同じコアexport / pip-auditのREDを記録する。
2. filelock4.2.4だけを選択更新する。lock全record比較、installed metadata、locked sync/exportとaudit GREENを確認する。
3. 一時領域でFileLockのnested / process競合timeout / 解放後取得、既存file保持、消滅cwd後のhold回復を確認する。
4. ReadWriteLockのsymlink拒否と被参照file不変、上流advisory / patch包含を確認する。
5. python-discovery disk cache cold/warm、共通app-dataでの並列virtualenv生成、生成python / pip、隔離PRE_COMMIT_HOMEの全hookを実行する。
6. self-review→独立review→最新 `./scripts/check.sh` →別verifier。npm audit / bandit / strict OpenSpec validationも確認する。
7. ローカル受入後のcloseでactive0、変更入力に影響する正式gate、最終HEADのhosted CI（通常・rename・audit・security・OpenSpec・保守）を確認する。

Windows / macOS等の実機、別UID攻撃と全extrasはdesign記載の範囲外。未検証を成功へ読み替えない。
使い捨て環境・payload・監査requirementsはcleanupし、生logや一時probeを恒久テストへ追加しない。
