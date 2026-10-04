# Tasks: update-virtualenv-audit

## Execution Constraints
- 最初のCI parity: Node 24 / Python 3.14でlocked installし、最初のtaskでコア監査と全体checkの実行可否を確認する。
- 停止・再計画: AGENTS.md / OSWF-5に従い、失敗や未検証を完了扱いせず、無関係な更新を追加しない。
- 一時artifact cleanup: export・監査log・virtualenv probeはrepository外に置き、完了時に回収する。changeは最終commitでcloseする。

## Tasks

### 1. 必要な推移依存だけを更新する
- 成果: virtualenvと必須のpython-discoveryだけを更新した再現可能なlock。
- 依存: なし。
- 対象:
  - `uv.lock`
  - `openspec/changes/update-virtualenv-audit/`
- [x] 実装: resolverで対象2packageを更新し、他package不変を確認する。
- [x] 検証: locked sync、コアpip-audit、一時virtualenv作成、最初のCI parityを確認する。
- 証跡: `uv lock --upgrade-package virtualenv==21.7.13 --upgrade-package python-discovery==1.6.0`、`uv lock --check`、`uv sync --locked` 成功。TOMLの全package差分はこの2件だけ。`uv export --locked --format requirements-txt --no-emit-project` の出力に対する `uv run --locked --group security pip-audit -r <一時file>` は既知脆弱性0。CIのbandit / npm auditも成功。`uv run --no-sync python -m virtualenv --no-download <一時path>` とbash activateでPython 3.14.6を確認し、pathに含むコマンド置換文字列が実行されないことも確認。`./scripts/check.sh` 成功（Python 188 passed）。source commitはEvidence参照、fresh実行。

### 2. 独立検証と先行PR
- 成果: self-review・独立review・全体check・別verifierとhosted CIの成功。
- 依存: 1。
- 対象:
  - `uv.lock`
  - `openspec/changes/update-virtualenv-audit/`
- [x] 実装: self-reviewと独立reviewを完了する。
- 独立review: virtualenv_review PASS、blockerなし。全record比較で他273 package不変を確認。freshの `uv lock --check`、`uv pip check`（48 package互換）、OpenSpec strict validate、virtualenv作成・activate probe、`git diff --check` 成功。source commitはEvidence参照。
- [ ] 検証: 全体check・OpenSpec validate・別verifierを完了し、PRのhosted CIを確認する。
- Project checks: reviewer後の最新入力で `./scripts/check.sh` 成功（Node 450 / Python 188）、OpenSpec strict validate / `task openspec:validate` 成功。fresh実行、source commitはEvidence参照。
- 独立verifier: virtualenv_verifier PASS、blockerなし。freshの `uv lock --check`、`uv pip check`、全lock比較、installed metadata照合、taskfile / OpenSpec workflow / smokeのfocused tests 56 passed、OpenSpec両gateとdiff check成功。全体check・監査は上記の最新証跡を再利用。source commitはEvidence参照。hosted CIはPR作成後に確認する。

### 3. closeと先行merge
- 成果: PR番号付きふりかえりとchange close、最終hosted CI成功後の先行merge。
- 依存: 2。
- 対象:
  - `docs/template/retrospectives.md`
  - `openspec/changes/update-virtualenv-audit/`
- [ ] 実装: ふりかえりとclose準備を完了する。
- [ ] 検証: close前の必須検証と通常CI入力の独立性を確認する。
- close後のactive change 0とhosted CI結果、merge結果はPRとGit履歴に記録する。

## Evidence
- source commit: 9904295c8f26cef4de1c30de79341912b889e8f5。開始時clean、active changeは本件のみ。以後特記以外fresh実行。
- 利用者はPR #85のgrillingで、依存を別PRに分離して先行mergeする方針を承認済み。

- self-review: lock全差分、upstream metadataの必要依存、全package比較、監査scope維持、12分類とvalidationを照合しblockerなし。`git diff --check` 成功。
