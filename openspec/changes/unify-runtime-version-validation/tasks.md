# Tasks: unify-runtime-version-validation

## Execution Constraints
- 最初のCI parity: Node 24 / Python 3.14、locked install、最初のvertical slice完了までに `./scripts/check.sh` の実行可否とCI同等環境を確認する。
- 停止・再計画: 承認仕様を超える変更とblockerはAGENTS.md / OSWF-5に従う。失敗・未実行は未完了に保つ。
- 一時artifact cleanup: fixture PATHと一時logをrepository外へ置き、テスト内一時領域をfinally / tmp_pathで回収する。OpenSpecのclose削除は最終commit段階とし、今回の未commit成果は保持する。

## Tasks

### 1. CLIの契約と共通fixture
- 成果: 永続fixtureとCLIの厳密な文法・stdout判定。既存診断を保持。
- 依存: なし。
- 対象:
  - `tests/fixtures/runtime_versions.json`
  - `repo-tools/runtime.ts`
  - `repo-tools/runtime-contract.test.ts`
  - `repo-tools/runtime-preflight.test.ts`
- [x] 実装: REDを確認してCLIを更新する。
- [x] 検証: CLI focused tests、型検査、CI parityを確認する。
- 証跡: `node --test repo-tools/runtime-contract.test.ts repo-tools/runtime-preflight.test.ts` 成功（137 tests）、`node_modules/.bin/tsc --noEmit` 成功。REDは先頭空白1件と拡張fixtureの12件を確認。基点はEvidence参照、fresh実行。
- CI parity: Node 24.14.1 / Python 3.14.6、`uv sync --locked`、`npm ci --ignore-scripts`、変更前 `./scripts/check.sh` 成功（pytest 188 tests）。同じ環境で後続も実行する。

### 2. bootstrapの契約
- 成果: 同じfixtureによるBash入口の一致、改行・stderr・失敗時の保護。
- 依存: 1。
- 対象:
  - `scripts/bootstrap.sh`
  - `tests/test_runtime_contract.py`
  - `tests/fixtures/runtime_versions.json`
- [x] 実装: bootstrap seamのRED後に取得・判定を更新する。
- [x] 検証: bootstrap / 共通fixtureのfocused testsを実行する。
- 証跡: `uv run --no-sync pytest tests/test_runtime_contract.py tests/test_bootstrap.py -q --no-cov` 成功。共通fixture RED 45件からGREENを確認。source commitはEvidence参照、fresh実行。

### 3. doctorと恒久文書
- 成果: 自身のPythonを検査しながら合否を一致させ、利用者へ制約を示す。
- 依存: 2。
- 対象:
  - `scripts/doctor.py`
  - `tests/test_smoke.py`
  - `tests/test_runtime_contract.py`
  - `tests/fixtures/runtime_versions.json`
  - `docs/guide.md`
- [x] 実装: doctor seamのRED後にruntime取得と正式版判定を更新し文書化する。
- [x] 検証: doctor / smoke / 全共通fixtureのfocused testsと実runtimeのdoctorを実行する。
- 証跡: doctor seamのRED 40件を確認後、`uv run --no-sync pytest tests/test_runtime_contract.py tests/test_smoke.py tests/test_bootstrap.py -q --no-cov` 成功（292 tests）。`node --test repo-tools/runtime-contract.test.ts repo-tools/runtime-preflight.test.ts` 成功（138 tests）。`task doctor` 成功（FAIL=0 / WARN=3、任意設定・認証の警告）。source commitはEvidence参照、fresh実行。

### 4. Reviewと最終検証
- 成果: OSWF-5のreview / project checks / verifier成功と検証証跡。
- 依存: 3。
- 対象:
  - `scripts/bootstrap.sh`
  - `scripts/doctor.py`
  - `repo-tools/runtime.ts`
  - `repo-tools/runtime-contract.test.ts`
  - `repo-tools/runtime-preflight.test.ts`
  - `tests/test_runtime_contract.py`
  - `tests/test_smoke.py`
  - `tests/fixtures/runtime_versions.json`
  - `docs/guide.md`
  - `openspec/changes/unify-runtime-version-validation/`
- [x] 実装: self-review、独立review、必要な修正を完了する。
- 独立review: `runtime_review`、基点からの全差分・未追跡成果を確認しblockerなし。fresh focused validationはPython 292 / Node 138成功、`git diff --check`成功。修正iterationは0回。
- [x] 検証: 最新入力の `./scripts/check.sh`（task checkを内包）、OpenSpec validate、別agentの独立verifierを完了する。
- 独立verifier: `runtime_verifier` PASS、blockerなし。`uv run --no-sync pytest tests/test_runtime_contract.py tests/test_smoke.py tests/test_bootstrap.py -q --no-cov` 292 passed、`node --test repo-tools/runtime-contract.test.ts repo-tools/runtime-preflight.test.ts` 138 passed、`git diff --check` 成功（fresh、source commitはEvidence参照）。追加の一時Python probeでspawn失敗8経路の拒否とbootstrap失敗時のuv/task/curl未実行を確認。必須受入条件の未検証なし。
- Project checks: `./scripts/check.sh` exit 0（内部の `task check`、Node 574 tests / Python 401 tests、format / lint / typecheck / contracts / skills verify）。`openspec validate unify-runtime-version-validation --strict --no-interactive`、`task openspec:validate` ともにexit 0。source commitはEvidence参照、fresh実行。
- 実動作: `node repo-tools/entrypoint.mjs runtime-preflight` exit 0（Node 24.14.1 / npm 11.11.0 / Python 3.14.6）、`bash -n scripts/bootstrap.sh`、`./scripts/bootstrap.sh --help` exit 0。bootstrap通常入口はfixture PATHの実processで検証。ホストへのsetup再実行は対象外。

## Evidence
- 基点: `9904295c8f26cef4de1c30de79341912b889e8f5`。記載する検証は特記以外fresh実行。
- Context7: Node.js 24 child_process execFileSyncのstdout戻り値、非0時例外、stdio pipeを確認。
- preflight: active changeは本件のみ。必須artifactsと12分類監査、依存・対象pathを確認。未解決仕様なし。開始時worktreeはclean、元worktreeの利用者差分は対象外。
- self-review: tracked diffと新規fixture / tests / OpenSpecを確認。scope、取得時の改行保持、NUL拒否、数値overflow、sys.version_infoに現れないbuild suffix、12分類の検証対応を確認。型検査のNotRequiredアクセスを明示assertで修正。`ruff format --check`、`ruff check`、`basedpyright`、`tsc --noEmit`、`git diff --check` 成功。

- 完了範囲: 実装・ローカル検証・独立review / verifierまで完了。GitHub CIとPR / mergeは後続工程とする。仕様と証跡を作業branchに保持し、PR番号確定後、merge前の最終commitでふりかえりの記録とchange closeを行う。
