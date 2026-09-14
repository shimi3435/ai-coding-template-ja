# Tasks

## Execution Constraints

- 最初の CI parity: Task 導入と共通 gate の最初の slice で Node 24 / Python 3.14、固定 action と Task 3.51.1、locked setup、fresh check を実行する。GitHub hosted runner 自体は未検証と区別する。
- 停止・再計画条件: AGENTS.md OSWF-5 と承認済み scope に従う。必須 evidence 不足は完了にしない。
- 一時 artifact cleanup: 使い捨て repository、action download、注入ファイル、生ログは repository 外に作り、終了時に削除する。通常 CI へ依存させない。

## Tasks

### 1. 共通 offline gate と最初の CI parity
- 成果: CI 両 job が固定 Task を導入して task check を実行する。
- 依存: なし。
- 対象:
  - `.github/workflows/ci.yml`
  - `tests/test_runtime_foundation_contract.py`
- [x] 実装: 呼び出し・準備順序 contract の RED を確認し、CI を変更する。
- [x] 検証: focused tests と固定 action 導入、fresh CI 相当 check が成功する。

### 2. 必須検証と受け入れ確認
- 成果: 必須検証の包含と fresh / rename の破損検出を確認し、実行範囲を説明する。
- 依存: 1。
- 対象:
  - `tests/test_taskfile.py`
  - `docs/guide.md`
- [x] 実装: 恒久 contract と既存ガイドを更新する。
- [x] 検証: focused tests、fresh / rename 正常系、両状態の lock 破損・automation test 失敗検出が成功する。

### 3. Review と最終検証
- 成果: OSWF-5 の review 順序を完了し、証跡を記録する。
- 依存: 2。
- 対象:
  - `.github/workflows/ci.yml`
  - `tests/test_runtime_foundation_contract.py`
  - `tests/test_taskfile.py`
  - `docs/guide.md`
  - `openspec/changes/align-offline-ci-check`
- [x] 実装: self-review と initial independent review の finding を解決する。
- [x] 検証: 最新入力の task check、strict OpenSpec validation、別の独立 verifier を完了する。

## Evidence

- 開始 source commit: 750617b3b826678c67242277a0ef456ed079b607。開始時 tracked / untracked 差分なし。
- 利用者が実装・検証完了後に commit / push を承認。PR / merge / pre-merge close は未依頼。レビュー用の OpenSpec artifacts を保持する。

- Preflight: active change 1件、必須 artifacts / spec-holes / task dependencies / 対象pathの検査成功。開始差分は自身の authoring artifacts のみ。safe boundary 通過。
- Task 1 RED: `uv run --no-sync pytest tests/test_runtime_foundation_contract.py -q` → 1 failed / 4 passed（共通 gate 欠落）。source は開始 commit + 作業差分、fresh実行。
- Task 1 GREEN: `uv run --no-sync pytest tests/test_runtime_foundation_contract.py --no-cov -q` → 5 passed。fresh実行、source は開始 commit + 作業差分。
- 最初の CI parity: 固定 SHA の `go-task/setup-task` の `node dist/index.js`（INPUT_VERSION=3.51.1、空の tool cache / token）→ exit 0。Node 24.14.1 / Python 3.14.6 / Task 3.51.1、使い捨て clone で `runtime-preflight`、`uv sync --locked`、`npm ci --ignore-scripts`、`bash --noprofile --norc -eo pipefail -c 'task check'` → 全 exit 0、pytest 153 passed。認証なし・無効 proxy・UV_OFFLINE=1 で check を fresh実行。source は開始 commit + CI / contract 差分、active change artifacts は未コピー。
- 準備 harness の初回 preflight は PATH 上の Python 3.10.12 を検出して失敗。CI の setup-uv 相当として Python 3.14.6 を PATH へ設定後に上記成功。実装の変更なし。GitHub hosted runner 自体は push 未依頼のため未検証。
- Task 2 focused: `uv run --no-sync pytest tests/test_taskfile.py tests/test_runtime_foundation_contract.py --no-cov -q` → 16 passed。必須 command を Taskfile から個別除去した使い捨て clone で包含 test → 両方 exit 1、復元後 green。source は開始 commit + 作業差分、fresh実行。
- Task 2 acceptance: Node 24.14.1 / Python 3.14.6 / Task 3.51.1、認証なし、SKILLS_AUTO_UPDATE=false、UV_OFFLINE=1、無効 proxy、active change artifacts なし。fresh / rename それぞれで `bash --noprofile --norc -eo pipefail -c 'task check'` → exit 0（Node core 162、automation 272、pytest 153 passed）。同じ command に lock の caveman treeHash をゼロ hash へ変更 → 両方 exit 201、installed tree 不一致。別々に automation report test へ assert.fail を追加 → 両方 exit 201、ISSUE69_AUTOMATION_FAILURE を検出。各注入を復元。source は開始 commit + 恒久差分、fresh実行。
- rename 準備: 初回 harness が改名にも offline を適用し、extras の解決 metadata が空 cache にないため exit 1。使い捨て clone の改名を戻し、準備段階だけ network を許可して `uv run python scripts/rename-package.py ci_rename_smoke --apply` → exit 0。その後の check は上記 offline 条件で成功。repository 実装の修正なし。
- Self-review: `git diff`、cached diff、未追跡 artifacts と影響先 Taskfile / guide を確認。今回差分の correctness / scope / spec-holes 対応 / checkbox に finding なし。`git diff --check`、対象2ファイルの `ruff check` と `ruff format --check` → exit 0。source は開始 commit + 作業差分、fresh実行。main...HEAD は開始時点の既存 #64 系履歴で今回 review 対象外。
- Initial independent review: issue69_review → blocker 0 / nonblocker 0。対象2ファイルの pytest を Node 24 で独立 fresh実行 → 16 passed。source は開始 commit + 作業差分。fix iteration 0。
- `openspec validate align-offline-ci-check --strict --no-interactive` と `task openspec:validate` → exit 0（1 passed）。source は開始 commit + 作業差分、fresh実行。
- Review 後の最新 project check: `PATH="/home/shimi3435/.nvm/versions/node/v24.14.1/bin:$PWD/.venv/bin:$PATH" task check` → exit 0、Node core 162 / automation 272 / pytest 153 passed、format / lint / typecheck / Skill integrity 成功。source は開始 commit + 恒久差分、fresh実行。以後、恒久入力ファイルの変更なし。
- Independent verifier: issue69_verify → PASS、blocker 0。Node 24 の対象2ファイル pytest を独立 fresh実行 → 16 passed、git diff --check → exit 0。全体 check と受け入れ検証は上記 green evidence を確認し再利用。source は開始 commit + 無変更の恒久差分。GitHub hosted runner は仕様上対象外として未検証。
- Cleanup: 今回の使い捨て clone、action download、注入 harness、生ログを削除済み。恒久差分4ファイルと OpenSpec artifacts だけを保持する。
- 完了: Tasks 1–3 の実装・検証完了、未完了 task / blocker なし。change の pre-merge close は未実施。commit / push は利用者承認に基づき実行する。

- ブランチ訂正: 利用者指示により origin/main `ff1063a527926f6124b8f6353358b99bdba89890` から `fix/issue-69-offline-ci` を作成し、今回の変更だけを適用。旧検証 base との差分は既存テンプレート文書4ファイルだけで、今回の恒久変更対象・Taskfile は同一。独立 review / verifier の差分判定を再利用。
- 新 base 検証: source commit `44e3e75`、Node 24 / Python 3.14 で `task check` → exit 0、fresh実行。`git diff --check origin/main...HEAD` → exit 0。
