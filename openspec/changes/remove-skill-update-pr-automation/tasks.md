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

cycle 1完了記録の訂正: close後のadversarial reviewでguide §4のlive reference残存が判明した。T1〜T4の実行済みcheckboxと当時の結果は保持するが、live references除去完了の判定は撤回する。利用者は新cycleを承認済みであり、以下のT5/T6が完了するまで再closeしない。

### T5: 現行CI説明の修正と回帰検査

- 成果: guideの旧機能説明を除去し、限定回帰検査と欠陥計上を追加する。
- 依存: T4
- 対象:
  - `docs/guide.md`
  - `tests/test_tool_neutral_documentation_contract.py`
  - `docs/template/retrospectives.md`
- [x] 実装: 説明節の回帰検査でREDを確認し、本文とふりかえりを修正する。
- [x] 検証: focused testsと表記揺れmutation probe、live docs再監査を完了する。

T5 evidence（fresh、source `ae2cc0e`＋作業差分）: `uv run --no-sync pytest tests/test_tool_neutral_documentation_contract.py -k current_ci_guide --no-cov -q` は修正前に1件REDで両方の旧説明を検出した。修正後 `uv run --no-sync pytest tests/test_tool_neutral_documentation_contract.py tests/test_taskfile.py tests/test_runtime_foundation_contract.py --no-cov -q` は28件成功。`uv run --no-sync ruff check tests/test_tool_neutral_documentation_contract.py` と `uv run --no-sync ruff format --check tests/test_tool_neutral_documentation_contract.py`、`git diff --check` はexit 0。一時Python mutation probeで5種類の表記揺れと説明節欠落を拒否し、現在のguide・撤去手順・履歴節を受理した。README/guide/agents文書を表記揺れを含む検索と目視で再確認し、残存は手動更新/撤去案内のみ。一時probeはTemporaryDirectoryでcleanup済み。

### T6: Correction cycleのreview・検証

- 成果: 新cycleの独立review・project checks・別verifierと証跡を完了する。
- 依存: T5
- 対象:
  - `openspec/changes/remove-skill-update-pr-automation`
- [x] 実装: self-review・独立reviewと必要なfinding修正を完了する。
- [x] 検証: 最新task check、strict OpenSpec validation、前cycleと別の独立verifierを完了する。

cycle 2基点は`ae2cc0e`。作業開始時に対象worktreeはcleanであり、元worktreeの利用者PoCはSHA-256が初回と同一。active changeは本change 1件だけ。必須artifacts・spec-holes・対象path・依存順のpreflightを確認して続行する。


T6 initial independent review（fresh、source `ae2cc0e`＋作業差分、reviewer `issue75_cycle2_review`）: PASS、blocker 0件。documentation/Taskfile/CI focused testsは28件成功、元HEAD本文・5種類の表記揺れ・別節の許容・節欠落のin-memory probeは13ケース成功。`git diff --check`はexit 0。finding修正iteration 0回。

T6 project checks（fresh、source `ae2cc0e`＋作業差分、Node v24.14.1 / npm 11.11.0 / Python 3.14.6）: `task check` はexit 0。Node 160件、Python 154件成功、contracts/skills:verify/tsc/ruff/basedpyright成功。`openspec validate remove-skill-update-pr-automation --strict`、`task openspec:validate` はexit 0。実GitHub停止・hosted CI・WSL実機は本cycleの対象外・未検証。隔離check/rename smokeはruntime/CI/renameを変更しない今回のcycleでは再実行せず、前cycleの結果を当時の証跡として保持する。

T6 self-review（fresh、source `ae2cc0e`＋作業差分）: 恒久差分3ファイルと再開したOpenSpecを照合。検査範囲はguide §4だけで、正規化後の既知表現を検出する。撤去手順・historical文書の言及は許容する。元の不整合2表現は同じfindingとしてreview=1へ計上。合意範囲外変更・blockerなし。

T6 independent verifier（source `ae2cc0e`＋作業差分、verifier `issue75_cycle2_verifier`）: PASS、blocker 0件。freshのfocused testsは28件、in-memory probeは15ケース成功。旧HEAD本文、既知表現6種類の§4内拒否・別節許容、節欠落を検証した。`git diff --check`はexit 0。最新task checkとOpenSpec gateはgreen evidenceを再利用。全体check後の変更は検証対象外のtasks.md証跡だけで、source/tests/依存/lock/CI/fixtures/実行環境は不変。

cycle 2完了: T5/T6の実装・検証を完了し、元findingは解消した。既知の逃した欠陥は計1件（review=1）である。修正と再開した仕様・証跡をcommit後、最終close commitでchange directoryを削除し、既存branchへ通常pushする。PR作成・mergeは行わない。

cycle 2完了記録の訂正: ADR-0011の現行効力表示とPR番号未反映のclose contractを見逃していた。既存T1〜T6の実行記録を保持するが最終完了判定を撤回し、利用者承認済みcycle 3を実行する。

### T7: ADRの部分改訂と欠陥記録

- 成果: #64方針の撤回をADR冒頭に示し、本文を保持する。2件を追加計上する。
- 依存: T6
- 対象:
  - `docs/template/adr/0011-v2-distribution-boundaries.md`
  - `tests/test_tool_neutral_documentation_contract.py`
  - `docs/template/retrospectives.md`
- [x] 実装: ADRの回帰検査RED→部分改訂とreview=3反映を完了する。
- [x] 検証: focused tests・本文不変probe・diff検査を完了する。

### T8: 独立reviewとPR準備

- 成果: self-reviewと独立reviewを収束し、Draft PRのレビュー可能な差分と説明を準備する。
- 依存: T7
- 対象:
  - `openspec/changes/remove-skill-update-pr-automation`
- [x] 実装: self-review・initial independent reviewと必要な修正を完了する。
- [x] 検証: strict OpenSpec validation、focused checks、PR本文と変更範囲の確認を完了する。

### T9: Draft PR・実番号・最終検証

- 成果: Draft PRを作成し実番号を記録して最新検証を通す。
- 依存: T8
- 対象:
  - `docs/template/retrospectives.md`
  - `openspec/changes/remove-skill-update-pr-automation`
- [ ] 実装: 同一headのPR不在を確認してDraft PRを作成し、実番号を規定形式へ反映する。
- [ ] 検証: PR identityと形式を確認し、最新task checkと前cycle/initial reviewerとは別のverifierを完了する。

cycle 3の基点は`577f1b1`。作業開始時はclean、元worktreeの未追跡PoCのdigestは初回と一致。active change 1件、必須artifacts・spec-holes・依存順・重複対象の推移依存・dirty ownershipを確認して実装する。PR作成/metadata更新は利用者承認済み。最終close後のgate確認とpush、hosted checksの観測まで実施する。

## Evidence

cycle 1のcommandのsource commitは `80d0bb7bc445e11de4e6dfff744f5add574f44b3` とその作業差分。cycle 2は `ae2cc0e` とその作業差分。cycle 3は`577f1b1`とその作業差分。各taskにfresh/再利用、結果、未検証理由だけを追記する。cycle 3ではDraft PR作成・metadata更新だけを外部writeの承認範囲へ追加する。mergeと旧automation resource操作は対象外とする。

Push前検証（fresh、source `80d0bb7`＋作業差分）: `task check` はexit 0、Node 160件・Python 153件成功。実装・依存・CIの入力はreview/verifier時点から無変更。close準備は本証跡更新とretrospectives.mdへの1行追記のみであり、機能・仕様変更はない。

T7 evidence（fresh、source `577f1b1`＋作業差分）: 新ADR testは修正前にmissing amendmentでRED。修正後 `uv run --no-sync pytest tests/test_tool_neutral_documentation_contract.py tests/test_taskfile.py tests/test_runtime_foundation_contract.py --no-cov -q` は29件成功。ruff check/formatとdocumentation tests再実行は成功（13件）。一時Python probeでADRの`## 文脈`以降が基点とbyte一致し、現行guideへのrelative linkが存在することを確認した。`git diff --check`成功。PR番号はT9で実番号へ置換する未完了作業として保持する。

T8 self-review（fresh、source `577f1b1`＋作業差分）: 恒久差分3ファイルを確認し、部分改訂の効力と当時の本文を区別した。runtime/CI/dependencyの差分なし。今回の2件を加えreview=3、merge後=0とする。strict OpenSpec validationと`task openspec:validate`はexit 0。

T8 independent review（fresh、source `577f1b1`＋作業差分、reviewer `issue75_cycle3_review`）: PASS、blocker 0件。documentation/Taskfile/runtime focused testsは29件成功。ADR本文byte一致・guideリンク存在・diff check成功。finding修正iteration 0回。PR本文を一時ファイルへ準備し、全撤去差分と保持する手動更新経路、移行順、検証の実施済み/未実施を照合した。T9完了までは最終closeしない。
