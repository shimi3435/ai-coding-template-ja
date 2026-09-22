# 実行記録: remove-node-installer

## Execution Constraints

- 最初のCI parity: Node 24 / npm / Python >=3.14をPATHへ指定し、CIと同じ `uv sync --locked`、`npm ci --ignore-scripts` とbaseline `task check` を最初の実装前に実行する。
- 停止・再計画: AGENTS.mdのOSWF-5とworkflowのbounded convergenceを適用する。仕様拡張・未解決判断、規定回数の失敗、verifier blockerでは未完了を保持して停止する。
- 一時artifact cleanup: 一時logと検証用HOMEはrepository外に置く。change closeは別途commit / PR作業時に行い、証跡を保持したまま未commitのchangeを削除しない。

## Tasks

### 1. CI parity
- 成果: 最新main基点と依存環境を確定する。
- 依存: なし
- 対象:
  - `openspec/changes/remove-node-installer/tasks.md`
- [x] 実装: 既存runtimeを選択し、lock通りに検証依存を用意する。
- [x] 検証: baseline `task check` が成功する。

- 証跡: `uv sync --locked`、`npm ci --ignore-scripts`、`task check` exit 0。Python 155 tests成功。source commit `66a1cba`、fresh実行。Node 24.14.1 / npm 11.11.0 / Python 3.14.6。

### 2. Installer撤去と引数契約
- 成果: 旧optionを拒否し、副作用のないhelpを提供する。
- 依存: 1
- 対象:
  - `scripts/bootstrap.sh`
  - `tests/test_bootstrap.py`
  - `openspec/changes/remove-node-installer/tasks.md`
- [x] 実装: 公開CLIのREDを確認し、installerと専用fixtures / testsを撤去して引数契約を実装する。
- [x] 検証: bootstrap focused testsと構文確認が成功する。

- 証跡: `.venv/bin/pytest --no-cov tests/test_bootstrap.py -q` 33 passed、`bash -n scripts/bootstrap.sh` exit 0。旧optionの3例は変更前REDを確認。source commit `66a1cba` + working diff、fresh実行。

### 3. Runtime復旧案内と環境保護
- 成果: Node / npmの原因別診断と復旧案内、既存環境と通常setupを保証する。
- 依存: 2
- 対象:
  - `scripts/bootstrap.sh`
  - `tests/test_bootstrap.py`
  - `openspec/changes/remove-node-installer/tasks.md`
- [x] 実装: 公開CLIでREDから復旧案内と環境保護の検証を整える。
- [x] 検証: bootstrap / doctor / runtime testsと実CLIのsafe probeが成功する。

- 証跡: `.venv/bin/pytest --no-cov tests/test_bootstrap.py tests/test_smoke.py tests/test_runtime_foundation_contract.py -q` 84 passed。`node --test repo-tools/runtime-preflight.test.ts` 14 passed。`node repo-tools/entrypoint.mjs runtime-preflight`、`task doctor` exit 0。runtime失敗10例で変更前REDを確認。実 `/bin/bash scripts/bootstrap.sh` のhelp / 廃止option / 混在をruntimeなしPATHで確認（exit 0/2/2、HOME変更なし）。source commit `66a1cba` + working diff、fresh実行。

### 4. 移行文書
- 成果: 現行導線とrelease条件を揃え、旧判断を部分改訂として示す。
- 依存: 3
- 対象:
  - `README.md`
  - `docs/guide.md`
  - `docs/template/v2-release-notes.md`
  - `docs/template/release.md`
  - `docs/template/adr/0011-v2-distribution-boundaries.md`
  - `docs/template/v2-boundary-audit.md`
  - `openspec/changes/remove-node-installer/tasks.md`
- [x] 実装: 合意済み移行と歴史注記を反映する。
- [x] 検証: residual scan、文書diff review、関連contract testsが成功する。

- 証跡: `git diff --check` exit 0。installer識別子のresidual scanで実装・専用fixturesが残らず、残存参照は廃止診断・移行・回帰tests・注記付き歴史のみと確認。関連contract tests 18 passed。`openspec validate remove-node-installer --strict --no-interactive`、`task openspec:validate` exit 0。source commit `66a1cba` + working diff、fresh実行。

### 5. Reviewと最終検証
- 成果: AGENTS.mdのOSWF-5に従い最新入力を検証する。
- 依存: 4
- 対象:
  - `scripts/bootstrap.sh`
  - `tests/test_bootstrap.py`
  - `README.md`
  - `docs/guide.md`
  - `docs/template/v2-release-notes.md`
  - `docs/template/release.md`
  - `docs/template/adr/0011-v2-distribution-boundaries.md`
  - `docs/template/v2-boundary-audit.md`
  - `openspec/changes/remove-node-installer`
- [x] 実装: self-review、独立reviewと必要なfinding修正を完了する。
- [x] 検証: 最新入力のproject checks、strict target validate、別の独立verifierを完了する。

- self-review: 差分、影響箇所、未追跡OpenSpec、48分類と検証対応を確認。実装のblockerなし。specの旧optionシナリオを設計済みの「最初の不正引数」に合わせて明確化した。通常checkへ一時artifact依存は追加していない。

- initial independent review (`issue52_review`): blocker・修正要求なし。`.venv/bin/pytest --no-cov tests/test_bootstrap.py -q` 47 passed、`bash -n scripts/bootstrap.sh` / `git diff --check` exit 0。source commit `66a1cba` + working diff、fresh実行。修正iteration 0。追加docsリンク検査と実Node 26でのexit 1 / 復旧案内 / HOME不変のsafe probeも成功。

- 最終project checks: `task check` exit 0（Node 160 tests / Python 175 tests、ruff format/lint・TypeScript・basedpyright成功）。`openspec validate remove-node-installer --strict --no-interactive`、`task openspec:validate` exit 0。続けてbootstrap focused 47 passed。source commit `66a1cba` + working diff、fresh実行。Node 24.14.1 / npm 11.11.0 / Python 3.14.6、同worktree・同lock依存。検証済みtracked diff SHA-256: `1e711f6147e6917081de21714798781badc57271e6757a4be7a061b03303a705`。以後のtasks証跡更新は通常check入力を変更しない。

- 独立verifier (`issue52_verify`): PASS、blockerなし。`.venv/bin/python -` によるread-only差分比較と追加safe probe 5件が成功（runtimeなし・別cwd・混在・重複help・既存HOME不変）。Python検査不変、Node/npm受理文法不変を確認。source commit `66a1cba` + 同一tracked diff。safe probeはfresh実行、project checksは入力同一性確認後のgreen evidence再利用。
- 完了: 全5 tasksの実装・検証完了。未検証はdesignで対象外とした実WSL、runtime commandのtimeout・巨大出力・#50文法変更。リモートCIは未実行。commit / PR / change closeは未実施。

### 6. PR公開とpre-merge close
- 成果: 仕様・証跡をcommit履歴に保存し、PR番号付きのふりかえりを残してactive changeをcloseする。
- 依存: 5
- 対象:
  - `openspec/changes/remove-node-installer`
  - `docs/template/retrospectives.md`
- [ ] 実装: 実装・仕様のcommitを保存し、PR作成、ふりかえり追記とchange削除を行う。
- [ ] 検証: close前strict validate、close後active change 0とproject checks、公開PRの差分・状態を確認する。

## 開始状態

- Source commit: `66a1cbae4afe0afff00ce786aa86e54fabc97b87`（2026-09-22にremote mainと一致確認）。
- Worktree: `/home/shimi3435/workspace/python/ai-coding-template-ja-issue-52`。
- Branch: `fix/issue-52-remove-node-installer`。
- 作成前のworktree差分はなし。元worktreeの未追跡 `docs/template/issue-71-ownership-poc.md` は対象外で、変更していない。
- Node: `/home/shimi3435/.nvm/versions/node/v24.14.1/bin`、Python: `/home/shimi3435/.local/share/uv/python/cpython-3.14-linux-x86_64-gnu/bin` をcommand限定PATHで選択する。
- 2026-09-22のPR作成依頼により、commit / push / PR作成と規約に沿うpre-merge closeが承認された。mergeは含まない。

## 追加code-review

- Standards / Specの独立2軸reviewは指摘0件。Spec軸のbootstrap focused実行は47 passed。source `66a1cba` + 同一tracked diff、fresh実行。ファイル変更なし。
