# 検証計画

1. 旧lockのCI監査失敗と同じコアexport/auditのREDを確認する。
2. 選択更新のlock差分を照合し、必要な推移更新以外がないこととlocked sync/exportを確認する。
3. コアpip-audit、npm audit、bandit、生成環境pathの実動作、既存pre-commitを実行する。
4. self-review、独立review、最新 `./scripts/check.sh`、別verifierを順に実行する。
5. PRのCIとTemplate maintenanceを確認し、OpenSpec strict validationとふりかえりを確定する。
6. close後のactive0、正式gate、最新HEADのCIを確認する。mergeは行わない。

upstream全CVEの独自再実装テストや研究extras全監査は範囲外とする。
