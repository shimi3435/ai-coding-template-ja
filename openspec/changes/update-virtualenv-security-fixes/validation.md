# 検証計画（2026-10-24新cycle）

1. Node24 / Python3.14 / Task3.51.1で旧版probeのREDを確認し、上流差分と配布metadataを照合する。
2. 指定版へ選択更新し、全lock record比較、配布hash照合、locked sync/export、再同期後のlock不変を確認する。
3. 最初のsliceでCI同一コアexport/pip-audit、一時app-dataとbash prompt probeを実行する。
   `uv export --locked --format requirements-txt --no-emit-project -o <一時requirements>`と
   `uv run --locked --group security pip-audit -r <一時requirements>`を用い、対象版が含まれることを確認する。
4. `npm audit --audit-level=high`、`uv run --locked --group security bandit -c pyproject.toml -r src -ll`、
   隔離PRE_COMMIT_HOMEで`uv run --no-sync pre-commit run --all-files`を実行する。
5. self-review→initial independent review→必要なfix/focused validation/diff review→
   `./scripts/check.sh`（内部のtask checkを含む）→別verifierの順序を維持する。
   対象に近い既存testがなければprobeをその検証とする。同一infrastructure failureの再現2回で停止する。
6. `openspec validate update-virtualenv-security-fixes --strict`、`task openspec:validate`を実行する。
   commit/push/PR本文更新の承認後、最新HEADのCI全5jobとTemplate maintenanceの成功を確認する。
7. ふりかえりと完了証跡を確定しpre-merge closeする。active0と必要なgate、close後の最終HEAD CIを確認する。
   外部反映未承認・失敗・未実施は未完了のままとする。mergeしない。

probe、requirements、生成環境、hook cache、logは一時領域で管理しcleanupする。
通常CIは一時probeや削除予定OpenSpec artifacts、Git履歴へ依存させない。
