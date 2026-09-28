# Issue #77 実行タスク

## Execution Constraints

1. 最初の CI parity: Node.js 24 / npm、Python 3.14、locked dependencies を用意し、各 cycle の最初の実装前に正式 gate を実行する（script 導入前の baseline は `node repo-tools/entrypoint.mjs check-contracts && task check`、導入後は `./scripts/check.sh`）。実装完了後へ先送りしない。
2. 停止・再計画: AGENTS.md / OSWF-5 の停止条件に従う。仕様拡張、必須検証失敗、verifier blocker を完了にしない。
3. 一時 artifact cleanup: fixture は test の cleanup で削除し、生 log / probe は repository 外へ置く。元 worktree の未追跡文書を変更しない。

## Tasks

### 1. 実行環境と基準状態
- 成果: main 41dc839 の隔離 worktree、CI baseline、spec-holes 確定。
- 依存: なし。
- 対象: `openspec/changes/delegate-repository-parsers/tasks.md`
- [x] 実装: baseline の確認と実行環境を用意する。
- [x] 検証: Node 24 / Python 3.14 で `task check` と OpenSpec validation を成功させる。
- 証跡（fresh / source 41dc839）: `npm ci --ignore-scripts`、`uv sync --locked --python 3.14` 成功。Node 24.14.1 / npm 11.11.0 / Python 3.14.6。`task check` exit 0（Node 242、Python 176 tests）。`openspec validate delegate-repository-parsers --strict --no-interactive` と `task openspec:validate` exit 0。
- preflight: active change 1件、必須 artifacts / 12分類 / task依存・対象・checkboxを確認。既存 dirty overlap なし。元 worktree の対象外文書 SHA-256: `392fe2e3395ffbaa8836e41bf1ae10b5df6f83d791d3918b8d450f1ec554c144`。

### 2. exact version の委譲
- 成果: 合意済み数値・文字数・正規形の受理契約。
- 依存: 1。
- 対象: `repo-tools/repository-contracts.ts`, `repo-tools/repository-contracts.test.ts`
- [x] 実装: CLI 境界の RED 後、semver へ委譲し旧 parser を削除する。
- [x] 検証: `node --test repo-tools/repository-contracts.test.ts` と `npm run typecheck` を成功させる。
- 証跡（fresh / source 41dc839 + task 2 差分）: `node --test --test-name-pattern='property: exact semver' repo-tools/repository-contracts.test.ts` は旧実装の `9007199254740992.0.0` 受理で RED。実装後の focused 33 tests と typecheck は exit 0。

### 3. YAML 構文と Taskfile policy の分離
- 成果: YAML parse、構造検査、必須入口、禁止 runner の解析後検査。
- 依存: 2。
- 対象: `repo-tools/repository-contracts.ts`, `repo-tools/repository-taskfile.ts`, `repo-tools/repository-contracts.test.ts`, `repo-tools/repository-taskfile.test.ts`, `repo-tools/repository-contracts-test-fixture.ts`
- [x] 実装: CLI 境界の RED 後、yaml へ委譲し行解析を削除する。
- [x] 検証: focused tests、`npm run typecheck`、実 repository の `node repo-tools/entrypoint.mjs check-contracts` を成功させる。
- 証跡（fresh / source 41dc839 + task 2–3 差分）: duplicate key と description-only check command の CLI tests は旧実装で RED。`node --test repo-tools/repository-contracts.test.ts repo-tools/repository-taskfile.test.ts` は113 tests成功、`npm run typecheck` と実 repository `node repo-tools/entrypoint.mjs check-contracts` は exit 0。

### 4. 恒久仕様と review
- 成果: 受理範囲・breaking 差分の恒久記録、独立 review の収束。
- 依存: 3。
- 対象: `docs/template/repository-contracts.md`, `docs/template/v2-release-notes.md`, `repo-tools/repository-contracts.ts`, `repo-tools/repository-taskfile.ts`, `repo-tools/repository-contracts.test.ts`, `repo-tools/repository-taskfile.test.ts`, `repo-tools/repository-contracts-test-fixture.ts`, `repo-tools/cli.ts`
- [x] 実装: reference / release notes を記載し self-review と initial independent review を行う。
- [x] 検証: finding の fix / focused validation / diff review を最大3 iterations 内で収束させる。
- self-review（fresh / source 41dc839 + task 2–4 差分）: tracked diff、untracked code / tests / docs / spec-holes、CLI caller を照合。仕様違反なし。既存 fixture を共有化し、新規 test は公開 CLI に限定。非string依存・数値境界直前・check cmds欠損の検証対応を補充。
- 証跡（fresh / 同 source）: focused 121 tests成功、`npm run typecheck`、`git diff --check`、`openspec validate delegate-repository-parsers --strict --no-interactive`、`task openspec:validate` は exit 0。文書相対リンク、active change 1件、12分類の3要件分を確認。
- initial independent review（fresh / 同 source）: blocker なし、修正 iteration 0。`node --test --test-reporter=dot repo-tools/repository-contracts.test.ts repo-tools/repository-taskfile.test.ts` は121 tests成功。空の第2document拒否、終端後コメント・core tag・文字列内alias記号の受理を独立 probe で確認。`git diff --check` 成功。
- project check finding / iteration 1: `task check` は330 Node tests中1件失敗（runtime-preflight runs before Node dependencies are installed）。`node --test --test-name-pattern='runs before Node dependencies' repo-tools/runtime-preflight.test.ts` で同じ `Node package import blocked: semver` を再現。新規 package import が CLI の静的 import 経由で preflight に波及した回帰。既存の再現 test と import 経路で原因が特定できるため、追加 instrumentation / 仮説列挙は不要。CLI の contract module import を check-contracts 分岐へ遅延し、既存 startup 契約を維持する。runtime 受理文法は変更しない。
- iteration 1 focused validation（fresh / source 41dc839 + 最新差分）: `node --test repo-tools/runtime-preflight.test.ts repo-tools/entrypoint.test.ts repo-tools/repository-contracts.test.ts repo-tools/repository-taskfile.test.ts` は137 tests成功、`npm run typecheck` と `git diff --check` は exit 0。
- iteration 1 independent diff review（fresh / 同 source）: blocker なし。CLI 遅延 import と直接依存、OpenSpec を確認。`node --test --test-name-pattern='runs before Node dependencies' repo-tools/runtime-preflight.test.ts` は1 test成功、`git diff --check` exit 0。

### 5. Cycle 1 の最終検証と引渡し
- 成果: 最新入力の project checks と別 agent による verifier の成功。
- 依存: 4。
- 対象: `openspec/changes/delegate-repository-parsers/tasks.md`
- [x] 実装: 全要件・spec-holes と検証の対応を確認する。
- [x] 検証: `task check`、OpenSpec validation、別 independent verifier を成功させる。
- project checks（fresh / source 41dc839 + iteration 1 を含む最新差分）: `task check` exit 0（Node 330 tests、Python 176 tests、TypeScript / ruff / basedpyright 成功）。`openspec validate delegate-repository-parsers --strict --no-interactive` と `task openspec:validate` は exit 0。過去の green evidence は再利用していない。
- independent verifier（initial reviewer と別 agent / fresh / 同 source）: verified、blocker なし。`node --test --test-reporter=dot repo-tools/repository-contracts.test.ts repo-tools/repository-taskfile.test.ts repo-tools/runtime-preflight.test.ts repo-tools/entrypoint.test.ts` は137 tests成功、公開 entrypoint の独立8 probes と `git diff --check` 成功。escape後重複キー、collection anchor / custom tag、空の第2document、終端コメント、core tag、Unicode類似コマンド、入力無変更を確認。project checks は上記fresh成功後の実装入力不変を確認して採用。
- 未検証: 合意済み対象外の Task schema 全体、shell 実行意味、任意サイズ・深度の resource 保証、runtime #50。GitHub hosted CI / WSL 実機は今回未実行。必須ローカル検証の未実行・失敗はなし。
- 完了状態: task 1–5 の実装・検証が完了。元 worktree の未追跡文書は開始時と同じ SHA-256。利用者が専用ブランチへの commit / push を承認した。pre-merge close / PR / merge は未実施で、仕様・検証記録をレビュー用に保持する。
- commit 前検証（fresh / source 41dc839 + staging 差分）: test fixture の末尾空行を除去し、`uv run --no-sync pre-commit run`、`task check`（Node 330 / Python 176 tests）、OpenSpec strict / gate はすべて exit 0。機能変更はなく、独立 review / verifier 後の意味上の実装差分はない。

### 6. Cycle 2: 補助実行と skip の拒否
- 成果: 許可リスト、補助値の型、限定した成功表示、CLI 回帰 tests。
- 依存: 5。
- 対象: `repo-tools/repository-taskfile.ts`, `repo-tools/repository-contracts.ts`, `repo-tools/repository-taskfile-policy.test.ts`, `repo-tools/repository-taskfile.test.ts`
- [x] 実装: P1 の RED を確認し、合意した許可リストを実装する。
- [x] 検証: focused CLI tests と typecheck を成功させる。

- 証跡（fresh / source 80e83c4 + task 6 差分）: 新規 CLI tests は旧実装で RED。`node --test repo-tools/repository-contracts.test.ts repo-tools/repository-taskfile.test.ts repo-tools/repository-taskfile-policy.test.ts` は181 tests成功、`npm run typecheck` exit 0。

### 7. Cycle 2: CI と最終検証手順の独立化
- 成果: CI の独立先行検査、ローカル最終検証の明示、恒久仕様の更新。
- 依存: 6。
- 対象: `.github/workflows/ci.yml`, `tests/test_runtime_foundation_contract.py`, `repo-tools/repository-taskfile-gate.test.ts`, `docs/guide.md`, `docs/agents/workflow.md`, `docs/template/repository-contracts.md`, `docs/template/v2-release-notes.md`
- [x] 実装: 独立先行 step と文書を更新し、CI順序の回帰 test を追加する。
- [x] 検証: CI順序 test、real Task gate tests、OpenSpec validation を成功させる。

- 証跡（fresh / source 80e83c4 + task 6–7 差分）: CI順序 test は独立 step 追加前に RED、追加後 `uv run --no-sync pytest tests/test_runtime_foundation_contract.py -q` は5 tests成功。`node --test repo-tools/repository-taskfile-gate.test.ts` は10 tests成功（real Task 3.51.1、skip と補助 shell の単独再現・先行拒否・正常実行・失敗伝播）。`npm run typecheck`、OpenSpec strict / gate、`git diff --check` exit 0。

### 8. Cycle 2: review と最終検証
- 成果: self-review、独立 review の収束、project checks、前 cycle と別 verifier。
- 依存: 7。
- 対象: `openspec/changes/delegate-repository-parsers/tasks.md`
- [x] 実装: self-review と独立 review を行い finding を収束させる。
- [x] 検証: `node repo-tools/entrypoint.mjs check-contracts && task check`、OpenSpec、別 verifier を成功させる。
- baseline（fresh / source 80e83c4）: `node repo-tools/entrypoint.mjs check-contracts && task check` exit 0（Node 330 / Python 176 tests）。
- self-review（fresh / source 80e83c4 + cycle 2 差分）: 許可リストと補助値の型、CLI caller、CI順序、公開 seam tests、spec-holes 対応、tracked / untracked 差分を照合。設計文書の返値説明を実装に合わせ修正。追加の仕様判断なし。
- initial independent review（fresh / source 80e83c4 + cycle 2 差分）: 前 cycle と別 reviewer、blocker なし、修正 iteration 0。`node --test repo-tools/repository-taskfile-policy.test.ts repo-tools/repository-taskfile-gate.test.ts` は70 tests成功、`git diff --check` exit 0。全変更15ファイルを確認。
- project checks（fresh / source 80e83c4 + cycle 2 差分）: `node repo-tools/entrypoint.mjs check-contracts && task check` exit 0（Node 400 / Python 176 tests、TypeScript / ruff / basedpyright 成功）。`openspec validate delegate-repository-parsers --strict --no-interactive`、`task openspec:validate`、`git diff --check` exit 0。全変更ファイルの `uv run --no-sync pre-commit run --files ...` も exit 0、修正なし。
- independent verifier（前 cycle および initial reviewer と別 agent / source 80e83c4 + cycle 2 差分）: verified、blocker なし。fresh の `node --test repo-tools/repository-taskfile*.test.ts repo-tools/repository-contracts.test.ts` は191 tests、`uv run --no-sync pytest tests/test_runtime_foundation_contract.py -q` は5 tests成功。公開 `check-contracts` と `git diff --check` も成功。最新 project checks は実装・テスト・CI・依存入力が不変であることを確認し green evidence を再利用。
- 完了状態: task 6–8 の実装・ローカル検証が完了。元 worktree の未追跡文書は開始時の SHA-256 と一致。既存の commit / push 依頼に従って専用ブランチへ記録する。PR / merge / change close は未実施。
- Cycle 2 承認: 利用者の「おｋ」。base は `80e83c40ae60f96470a416f59493f08fb86a222b`。開始時 worktree clean、active change 1件。
- 未実行の hosted CI は PR 作成後の merge 条件として残す。ローカル完了と merge-ready を区別する。

### 9. Cycle 3: vars と任意 template の拒否
- 成果: CLI_ARGS の10組以外を評価前に拒否する policy。
- 依存: 8。
- 対象: `repo-tools/repository-taskfile.ts`, `repo-tools/repository-taskfile-templates.ts`, `repo-tools/repository-taskfile-policy.test.ts`, `repo-tools/repository-taskfile.test.ts`, `repo-tools/repository-taskfile-templates.test.ts`
- [x] 実装: 回帰 RED 後、vars を禁止し template 例外を限定する。
- [x] 検証: focused Node tests、typecheck、実 repository の checker を成功させる。

- 証跡（fresh / source c5ec849 + task 9 差分）: template 回帰は旧実装で RED。focused template / policy / YAML tests、`npm run typecheck`、実 repository `check-contracts` は成功。

### 10. Cycle 3: 正式 gate と Task tests の分離
- 成果: scripts/check.sh と CI の共通入口、通常 tests の exact pin 撤去。
- 依存: 9。
- 対象: `scripts/check.sh`, `Taskfile.yml`, `.github/workflows/ci.yml`, `repo-tools/repository-taskfile-gate.test.ts`, `repo-tools/integration/repository-taskfile-gate.test.ts`, `tests/test_runtime_foundation_contract.py`, `tests/test_taskfile.py`
- [x] 実装: script と公開 seam tests を追加し、CI / 隔離 check を移行する。
- [x] 検証: script 実動作、固定版 CI probes、Python CI順序 tests を成功させる。

- 証跡（fresh / source c5ec849 + task 9–10 差分）: script 不在と CI 旧順序の RED 後、通常 gate / CI専用の19 tests、Python CI / Taskfile の16 tests、typecheck が成功。通常 tests の Task exact assertion は CI専用へ移動。

### 11. Cycle 3: SoT と入口案内の統一
- 成果: local / Agent の最終判定を正式 script に統一する。
- 依存: 10。
- 対象: `AGENTS.md`, `CONTEXT.md`, `README.md`, `scripts/bootstrap.sh`, `scripts/rename-package.py`, `.agents/skills/execute-openspec-change/SKILL.md`, `.agents/skills/verify-change/SKILL.md`, `docs/agents/workflow.md`, `docs/guide.md`, `docs/template/repository-contracts.md`, `docs/template/v2-release-notes.md`, `docs/template/skill-maintenance.md`, `docs/template/release.md`, `tests/test_review_convergence_contract.py`, `tests/test_execute_openspec_change_skill.py`, `tests/test_project_gate_contract.py`
- [x] 実装: SoT / 現行ガイド / local skill と回帰 tests を更新する。
- [x] 検証: 文書 contract tests、skills:verify、OpenSpec validation を成功させる。

- 証跡（fresh / source c5ec849 + task 9–11 差分）: 新規入口案内 tests は旧文書で RED。文書 / review / executor contract の39 tests、`skills:verify`、OpenSpec strict / gate は成功。local skills の編集で source / lock の更新は不要。

### 12. Cycle 3: review と引渡し
- 成果: 独立 review / verifier、正式 gate、commit / push。
- 依存: 11。
- 対象: `openspec/changes/delegate-repository-parsers/tasks.md`
- [x] 実装: self-review と独立 review の finding を収束させる。
- [x] 検証: 最新 ./scripts/check.sh、CI probes、OpenSpec、別 verifier を成功させる。
- baseline（fresh / source c5ec849）: `node repo-tools/entrypoint.mjs check-contracts && task check` exit 0、Node 400 / Python 176 tests。preflight は active change 1件、artifacts / spec-holes / 依存順を確認、対象 dirty overlap なし。
- self-review（fresh / source c5ec849 + cycle 3 差分）: template / vars の拒否、CLI_ARGS の10組、script の root / 引数 / 終了伝播、CI順序と通常 glob、SoT / 現行ガイド / local skills を照合。任意 shell と外部入力は合意した対象外。初期文書の旧入口説明を修正し、focused Node tests、Python 55 tests、typecheck、全差分の pre-commit、sh -n、diff check が成功。元 worktree の未追跡文書 SHA-256 は不変。
- initial independent review / iteration 1（source c5ec849 + cycle 3 差分）: rename-package.py の apply 成功案内が旧 `task check` を示す P2 を検出。project gate contract の対象へ追加して RED を確認し、案内を正式 script に修正。現行手順の統一に含まれる修正で仕様拡張なし。
- iteration 1 focused / diff review（fresh / source c5ec849 + cycle 3 差分）: `pytest tests/test_project_gate_contract.py tests/test_smoke.py -q --no-cov` は44 tests、`pytest tests/test_rename_package.py -q --no-cov` は1 test成功。変更ファイルの pre-commit 成功。独立 diff reviewer は13 testsを実行して blocker なし、iteration 1 収束。
- project checks（fresh / source c5ec849 + cycle 3 差分）: `./scripts/check.sh` exit 0（Node 450 / Python 188 tests、TypeScript / ruff / basedpyright 成功）。CI専用 `node --test repo-tools/integration/repository-taskfile-gate.test.ts` は11 tests成功。`task check:isolated` はネットワーク・OpenSpec CLI なしで正式 gate を実行し exit 0（Node 450 / Python 188）。OpenSpec strict / gate と diff check も成功。hosted CI の結果ではない。
- verifier 起動: 初回は利用上限による infrastructure failure で結果なし。利用者の再開依頼後、同じ verifier を再実行する。未検証を成功扱いしない。
- independent verifier（fresh / source c5ec849 + cycle 3 差分）: 前 cycle および initial reviewer と別 agent が再開後に verified、blocker なし。focused Node 214 tests、Python contract 56 tests、公開 checker、sh -n、diff check 成功。正式 gate / isolated gate の Node 450 / Python 188 は source・tests・CI・依存・環境の入力不変を確認して green evidence を再利用。実装変更なし。
- 完了状態: task 9–12 の実装・ローカル検証が完了。全変更の pre-commit 成功。利用者承認済みの専用ブランチへの commit / push を行う。PR / merge / change close は未実施。
- 承認: 利用者「OK」。source c5ec849、開始時 worktree clean、active change 1件。過去の完了 checkbox は保持する。
- hosted CI は PR 作成後に確認する。PR / merge / close は本 cycle に含まない。

## 実行情報

- 作業場所: `/home/shimi3435/workspace/python/ai-coding-template-ja-issue-77`。
- Source commit: `41dc839d05dc8134f1f7509f38fb14cbd87f2d60`。
- 元 worktree の対象外差分: `docs/template/issue-71-ownership-poc.md`（未追跡）。隔離 worktree には持ち込まない。
- 同じ executor が全実装を継続する。追加 executor は使用しない。
- commit / push は利用者承認済み。PR / merge は未依頼。change artifacts はレビュー用に保持し、pre-merge close はその段階で行う。
