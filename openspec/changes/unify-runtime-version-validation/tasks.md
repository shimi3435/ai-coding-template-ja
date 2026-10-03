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

### 5. Cycle 2: locale非依存のbootstrap判定
- 成果: ASCII数字と数値比較を呼出元localeから独立させ、子process・setupのlocaleを維持する。
- 依存: 4。
- 対象:
  - `scripts/bootstrap.sh`
  - `tests/test_runtime_contract.py`
  - `openspec/changes/unify-runtime-version-validation/`
- [x] 実装: 非C localeのREDを確認後、数字の明示列挙と比較関数内のC locale固定を適用する。
- [x] 検証: C / C.utf8 / 一時生成en_US.UTF-8で共通fixtureとlocale継承を確認する。
- 証跡: `LOCPATH=<一時locale dir> uv run --no-sync pytest tests/test_runtime_contract.py -k bootstrap -q --no-cov` は修正前en_US.UTF-8のnpm全角数字でRED（1 failed / 377 passed）。修正後 `LOCPATH=<一時locale dir> uv run --no-sync pytest tests/test_runtime_contract.py tests/test_bootstrap.py -q --no-cov` は514 passed。通常環境の `./scripts/check.sh` も成功し、任意のen_US.UTF-8不在skipを確認。source commitはCycle 2 Evidence参照、fresh実行。

### 6. Cycle 2: CLIのspawn失敗を恒久回帰へ追加
- 成果: node / npm / python3の実不在・実行権限なし、計6ケースを公開CLIから検証する。
- 依存: 5。
- 対象:
  - `repo-tools/runtime-contract.test.ts`
- [x] 実装: 実Nodeの絶対pathと隔離PATHを用いて6ケースを追加し、既存exit 127ケースを保持する。
- [x] 検証: CLI focused testsとTypeScript型検査を実行する。
- 証跡: `node --test repo-tools/runtime-contract.test.ts repo-tools/runtime-preflight.test.ts` 144 passed、`node_modules/.bin/tsc --noEmit` 成功。6ケースは既存の正常な失敗処理を固定する追加テストであり、runtime実装の変更は不要。source commitはCycle 2 Evidence参照、fresh実行。

### 7. Cycle 2: reviewと最終検証
- 成果: 新cycleの独立review / project checks / 別verifierが成功する。
- 依存: 6。
- 対象:
  - `scripts/bootstrap.sh`
  - `tests/test_runtime_contract.py`
  - `repo-tools/runtime-contract.test.ts`
  - `openspec/changes/unify-runtime-version-validation/`
- [x] 実装: self-review、独立reviewと必要な修正を完了する。
- 独立review: `runtime_review` が基点からの全差分を確認しblockerなし。非C locale付きPython 514 passed / Node 144 passed、旧patternの全角npm誤受理を独立再現。proposalの初回cycle出荷範囲が残る軽微な文書不整合は、Cycle 2承認済み範囲を明記して解消。`openspec validate unify-runtime-version-validation --strict --no-interactive` / `git diff --check` と同reviewerのprose差分再確認が成功。code/testsはreview後無変更。
- [x] 検証: 最新入力の `./scripts/check.sh`、OpenSpec validate、前cycleと別のverifierを完了する。
- Project checks: `LOCPATH=<一時locale dir> ./scripts/check.sh` exit 0（Node 580 tests / Python 655 tests、skipなし、format / lint / typecheck / contracts / skills verify）。`openspec validate unify-runtime-version-validation --strict --no-interactive` と `task openspec:validate` も成功。source commitはCycle 2 Evidence参照、fresh実行。
- 独立verifier: 前cycleとは別の `runtime_verifier_cycle2_retry` がPASS、blockerなし。`LOCPATH=<一時locale dir> uv run --no-sync pytest tests/test_runtime_contract.py tests/test_bootstrap.py -q --no-cov` は514 passed（skipなし）、`node --test --test-reporter=dot repo-tools/runtime-contract.test.ts repo-tools/runtime-preflight.test.ts` は144件成功。`env -u LOCPATH uv run --no-sync pytest tests/test_runtime_contract.py -k 'bootstrap and unicode' -q --no-cov -rs` は6 passed / 3 skippedで、en_US未導入時だけ理由付きskipを確認。OpenSpec strict validate / `git diff --check` も成功。以上はfresh実行、source commitはCycle 2 Evidence参照。全体gateは上記の最新成功証跡を再利用し、必須受入条件の未検証なし。

## Evidence
- 基点: `9904295c8f26cef4de1c30de79341912b889e8f5`。記載する検証は特記以外fresh実行。
- Context7: Node.js 24 child_process execFileSyncのstdout戻り値、非0時例外、stdio pipeを確認。
- preflight: active changeは本件のみ。必須artifactsと12分類監査、依存・対象pathを確認。未解決仕様なし。開始時worktreeはclean、元worktreeの利用者差分は対象外。
- self-review: tracked diffと新規fixture / tests / OpenSpecを確認。scope、取得時の改行保持、NUL拒否、数値overflow、sys.version_infoに現れないbuild suffix、12分類の検証対応を確認。型検査のNotRequiredアクセスを明示assertで修正。`ruff format --check`、`ruff check`、`basedpyright`、`tsc --noEmit`、`git diff --check` 成功。

- 完了範囲: 実装・ローカル検証・独立review / verifierまで完了。GitHub CIとPR / mergeは後続工程とする。仕様と証跡を作業branchに保持し、PR番号確定後、merge前の最終commitでふりかえりの記録とchange closeを行う。

## Cycle 2 Evidence
- 基点: `46c9e906b4172bfd5c783d16d98b13b92d696fc0`。以下は特記以外fresh実行。Tasks 1–4は前cycleの完了履歴であり、今回の完了判定はTasks 5–7による。
- 利用者がP2 / P3の修正方式、locale追加導入の非必須化、今回の非C locale実検証、再review / verifier、commit / pushを承認した。active changeは本件のみ、開始時worktreeはclean。既存checkboxを保持して仕様と検証を更新した。
- Context7のGNU Bash公式資料で、range expressionと `[[ < ]]` のlocale依存、およびlocal変数のscope復元を確認済み。
- 通常checkは新しいOS packageを要求しない。en_US.UTF-8が利用不能な環境では追加localeテストだけ理由付きskipを許可し、C / C.utf8は必須とする。今回の受け入れには一時生成したen_US.UTF-8での成功を要求する。locale生成物と一時logはrepository外に置き、完了時に削除する。

- Cycle 2 self-review: 全差分、locale probeの限定skip、呼出元locale継承、PATH fallback防止、実不在とEACCESの診断、12分類対応を確認。blockerなし。`git diff --check` 成功。
- 出荷方針: 利用者の明示依頼に基づき、Task 7の検証後に修正をcommitし、既存branchへ通常pushする。commit / pushの実行結果はGit履歴とremote一致で確認する。
