# Issue #77 実行タスク

## Execution Constraints

1. 最初の CI parity: Node.js 24 / npm、Python 3.14、locked dependencies を用意し、最初の実装前に `task check` を実行する。実装完了後へ先送りしない。
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

### 5. 最終検証と引渡し
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

## 実行情報

- 作業場所: `/home/shimi3435/workspace/python/ai-coding-template-ja-issue-77`。
- Source commit: `41dc839d05dc8134f1f7509f38fb14cbd87f2d60`。
- 元 worktree の対象外差分: `docs/template/issue-71-ownership-poc.md`（未追跡）。隔離 worktree には持ち込まない。
- 同じ executor が全実装を継続する。追加 executor は使用しない。
- commit / push は利用者承認済み。PR / merge は未依頼。change artifacts はレビュー用に保持し、pre-merge close はその段階で行う。
