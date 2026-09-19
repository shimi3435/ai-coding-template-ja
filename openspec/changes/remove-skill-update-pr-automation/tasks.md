# Tasks

## Execution Constraints

- 最初の CI parity: Node 24 / npm / Python >=3.14とlocked dependencyを用意し、実装全完了前にtask checkを実行する。PoC結果は再利用しない。
- 停止・再計画条件: AGENTS.md / OSWF-5に従う。仕様拡張、利用者差分との衝突、必須検証失敗は完了扱いにしない。
- 一時 artifact cleanup: 検証用copy・log・tool cacheはrepository外の専用一時領域へ置き、終了時に削除する。元worktreeと外部resourceを削除しない。

## Tasks

### T1: 実装環境と基点の確認

- 成果: 最新main基点、利用者差分の分離、locked runtime/dependencyと初回CI parityを確立する。
- 依存: なし
- 対象:
  - `package.json`
  - `package-lock.json`
  - `uv.lock`
- [x] 実装: 既存runtimeをPATHへ明示し、npm ci --ignore-scriptsとuv sync --lockedを実行する（追跡ファイルは変更しない）。
- [x] 検証: runtime-preflightとtask checkが成功する。

T1 evidence（fresh、source `80d0bb7`）: Node v24.14.1 / npm 11.11.0 / Python 3.14.6。`npm ci --ignore-scripts`、`uv sync --locked`、`node repo-tools/entrypoint.mjs runtime-preflight`、`task check` はexit 0。Python 153 tests成功。追跡dependency/lock無変更。

### T2: 自動化資産と検証経路の撤去

- 成果: 専用資産、CLI、test route、専用contracts/fixturesを除去し、残存機能を検証する。
- 依存: T1
- 対象:
  - `.github/workflows/skill-update-prs.yml`
  - `repo-tools/skill-update-automation`
  - `repo-tools/cli.ts`
  - `repo-tools/repository-contracts.ts`
  - `repo-tools/repository-contracts.test.ts`
  - `Taskfile.yml`
  - `tests/test_taskfile.py`
- [x] 実装: 旧CLI拒否/automationなしfixtureでREDを確認し、専用資産と外側参照を撤去する。
- [x] 検証: repository-contracts、skill-updater、Taskfile/CI tests、skills:verify、TypeScript typecheck、diff監査が成功する。

T2 evidence（fresh、source `80d0bb7`＋作業差分）: preflightはactive change 1件、必須artifacts/36分類/未解決なし、T1→T2→T3→T4、対象pathの非重複/依存順を確認。元worktreeのdirtyは対象外、作業worktreeは自作OpenSpecのみで実装開始。`node --test --test-name-pattern='without retired|retired CLI' repo-tools/repository-contracts.test.ts` は修正前に3件RED。修正後 `node --test repo-tools/repository-contracts.test.ts repo-tools/skill-updater-*.test.ts` は144件成功、`node_modules/.bin/tsc --noEmit`、`node repo-tools/entrypoint.mjs skills:verify` はexit 0。`uv run --no-sync pytest tests/test_taskfile.py tests/test_runtime_foundation_contract.py -q` は16件成功（coverage対象moduleを実行しないためcoverage警告）。共通updaterへの逆importなし。

### T3: 手動運用と移行手順

- 成果: 現行文書を整合し、停止・棚卸し・手動更新の順序と保護境界を提供する。
- 依存: T2
- 対象:
  - `README.md`
  - `docs/guide.md`
  - `docs/agents/safety.md`
  - `docs/template/v2-boundary-audit.md`
- [x] 実装: 専用運用節を手動更新/撤去手順に置換し、historical本文を保持する。
- [x] 検証: live referencesと文書リンク・spec-holes対応をreviewする。

T3 evidence（fresh、source `80d0bb7`＋作業差分）: `git diff --check`、live reference検索、変更文書の相対リンク先検査、spec-holes対応review成功。停止/取消確認/棚卸し/撤去/手動更新の順序を記述し、旧運用経路は提供終了。historical監査は導線7行のみ追加。実GitHub停止・resource操作は対象外・未実施。

### T4: Reviewと最終検証

- 成果: OSWF-5の順序で検証を収束し、最新入力の結果を記録する。
- 依存: T3
- 対象:
  - `openspec/changes/remove-skill-update-pr-automation`
- [x] 実装: self-review、initial independent review、必要なfinding修正/差分reviewを完了する。
- [x] 検証: 最新task check、check:isolated、使い捨てcopyのrename apply後check、OpenSpec validation、別の独立verifierを完了する。

T4 self-review（fresh、source `80d0bb7`＋作業差分）: 変更コード・tests・文書・OpenSpecをreview。111件の削除は承認済み専用subtree/workflowだけ。残存relative import・文書pathを検査し、共通updater/skills/locks/通常CI不変を確認。spec-holes 36分類の検証対応を照合し、blockerなし。`openspec validate remove-skill-update-pr-automation --strict` と `task openspec:validate` はexit 0。

T4 initial independent review（fresh、source `80d0bb7`＋作業差分、reviewer `issue75_initial_review`）: #71/PoC/#75・OpenSpec・変更範囲を照合しblocker 0件。`node --test --test-reporter=dot repo-tools/repository-contracts.test.ts repo-tools/skill-updater-*.test.ts` は144件成功、`node repo-tools/entrypoint.mjs skills:verify` と `git diff --check` はexit 0。finding修正iteration 0回。

T4 project checks（fresh、source `80d0bb7`＋作業差分、Node v24.14.1 / npm 11.11.0 / Python 3.14.6）:

- `task check`: exit 0。Node 160件、Python 153件成功。contracts / offline skills:verify / tsc / ruff / basedpyright成功。
- `task check:isolated`: exit 0。同じ160件/153件成功。空HOME/CODEX_HOME、UV_OFFLINE=1、無効proxy、OpenSpec/npxなしのPATHで実行。
- 使い捨てcloneに現在のtracked/untracked差分・削除・symlinkを反映し、`npm ci --ignore-scripts`、`uv sync --locked`、`uv run python scripts/rename-package.py ci_rename_smoke --apply`、`task check`: 全てexit 0。Node 160件、Python 153件成功。改名後packageと検証入力を確認。rename時のuv syncには既存依存metadataの正規化WARNがあったが失敗なし。元worktreeのpackage/lock/skillsは無変更。
- `git diff --check`: exit 0。元PoC文書のSHA-256は開始時と一致。
- 実GitHubのworkflow停止、外部resourceのcleanup、GitHub-hosted CI run、WSL実機は対象外・未検証。CIと同じcheck/rename経路をローカルLinuxで検証した。

T4 independent verifier（source `80d0bb7`＋作業差分、verifier `issue75_verifier`）: PASS、blocker 0件。freshでNode focused 144件・Taskfile/CI 16件成功、skills:verify/check-contracts/git diff --checkはexit 0。renameコピーの改名と元PoC digestを直接確認。全体check/isolated/rename/OpenSpecは最新入力のgreen evidenceを再利用。再利用の照合対象は同worktree/source・tests・依存環境・lock・CI・fixtures・実行環境で、全体check後の変更は通常checkが読まないtasks.mdの証跡だけ。

ふりかえり: 逃した欠陥0件（self-review=0 / independent review=0 / verifier=0）。削除境界と残存check経路をfocused testsおよび実renameで確認した。

完了状態: T1〜T4の実装・検証は全完了。2026-09-20の利用者指示でcommit・pushを承認。仕様・証跡を含む実装commitの後、pre-merge closeの最終commitでchange directoryを削除する。実GitHub移行は提供した手順に基づく別操作であり、本作業では未実施。

## Evidence

全commandのsource commitは `80d0bb7bc445e11de4e6dfff744f5add574f44b3` とその作業差分。各taskにfresh/再利用、結果、未検証理由だけを追記する。PR作成・merge・外部resource操作は対象外のままとする。

Push前検証（fresh、source `80d0bb7`＋作業差分）: `task check` はexit 0、Node 160件・Python 153件成功。実装・依存・CIの入力はreview/verifier時点から無変更。close準備は本証跡更新とretrospectives.mdへの1行追記のみであり、機能・仕様変更はない。
