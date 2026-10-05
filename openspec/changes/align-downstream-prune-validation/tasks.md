# 実装タスク: align-downstream-prune-validation

## Execution Constraints

1. **最初の CI parity**: Task 1 の最初の環境依存 slice で Node.js 24 / npm、Python >=3.14 と既存 lock による fresh / rename の正式 gate を確認する。全実装完了まで延期しない。
2. **停止・再計画条件**: 今回は OpenSpec 作成だけが承認されており、実装開始指示まで全 task を実行しない。開始後は AGENTS.md / workflow の停止・再計画規律に従い、仕様外拡張・必須検証失敗を完了扱いしない。
3. **一時 artifact cleanup**: disposable repository・失敗注入用一時物は検証側が cleanup し、生 log や専用 state を追跡しない。close は全実装・検証・review 完了後だけとし、現在は change directory を保持する。

## Tasks

### 1. 共通検証と保守検証を分離する

- 成果: DPV-1 / DPV-2 の入口、責務別テスト、下流文書移設、保守専用 CI を一体で導入する。
- 依存: なし。
- 対象:
  - `repo-tools/`
  - `tests/`
  - `template-maintenance/`
  - `Taskfile.yml`
  - `.github/workflows/`
  - `docs/reference/`
  - `docs/template/`
  - `docs/agents/workflow.md`
  - `docs/guide.md`
  - `README.md`
  - `CONTEXT.md`
- [ ] 実装: 保守意味検証を分離し、共通検証・共有 fixture を維持する。移設と live links を整合させる。
- [ ] 検証: V01 / V03 / V04 / V05 / V15 の該当部分、focused tests、最初の CI parity を実行する。

### 2. 構成判定と read-only preview を実装する

- 成果: DPV-3 / DPV-4 の固定対象、同梱・完全除去・不整合、preview と診断を提供する。
- 依存: 1。
- 対象:
  - `repo-tools/`
  - `scripts/prune-template-docs.py`
  - `scripts/doctor.py`
  - `tests/`
  - `template-maintenance/`
  - `Taskfile.yml`
  - `docs/reference/prune-template-assets.md`
- [ ] 実装: 状態判定を共通 gate・doctor・prune で整合させ、全入力を読む preview を提供する。
- [ ] 検証: V06 / V07 / V09 / V10 / V16 の read-only 部分を実行し、通常 gate の部分欠落拒否を確認する。

### 3. 保護付き apply と途中失敗の復旧案内を実装する

- 成果: DPV-5 / DPV-6 の差分保護、共有部分編集、適用後確認、失敗診断、再実行を提供する。
- 依存: 2。
- 対象:
  - `repo-tools/`
  - `scripts/prune-template-docs.py`
  - `tests/`
  - `template-maintenance/`
  - `docs/reference/prune-template-assets.md`
- [ ] 実装: 全件 preflight 後だけ適用し、対象外 bytes を保持する。自動 rollback は追加しない。
- [ ] 検証: V02 / V08〜V13 / V16 を実行する。正常 prune の未コミット再実行と部分失敗の再実行を区別する。

### 4. 実構成の acceptance と引き渡しを完了する

- 成果: 全構成の通常開発・保守検証が成立し、#74 への境界と旧 prune からの復旧を文書化する。
- 依存: 3。
- 対象:
  - `template-maintenance/`
  - `tests/`
  - `repo-tools/`
  - `docs/reference/`
  - `docs/guide.md`
  - `docs/agents/workflow.md`
  - `docs/template/release.md`
  - `README.md`
- [ ] 実装: disposable smoke、offline / host 非依存、CI parity の検証入口と最小の利用案内を整える。
- [ ] 検証: V01〜V16 を照合し、setup / rename / prune / 再setup / gate / doctor の実動作と負例を確認する。

### 5. Review と最終 project checks を完了する

- 成果: AGENTS.md OSWF-5 に従う実装後の review / verifier と最新入力の正式 gate が成功する。
- 依存: 4。
- 対象:
  - `repo-tools/`
  - `scripts/`
  - `tests/`
  - `template-maintenance/`
  - `Taskfile.yml`
  - `.github/workflows/`
  - `docs/`
  - `README.md`
  - `CONTEXT.md`
- [ ] 実装: self-review、initial independent review、必要な finding 修正を policy 順に完了する。
- [ ] 検証: 最新入力の正式 gate・保守 gate・OpenSpec validation、hosted CI、および別 agent の verifier を完了する。

### 6. 承認された実装完了後に change を close する

- 成果: 恒久文書へ契約を残し、retrospective と一時成果 cleanup を行う。
- 依存: 5。
- 対象:
  - `docs/template/retrospectives.md`
  - `openspec/changes/align-downstream-prune-validation/`
- [ ] 実装: policy に従う retrospective を追記し、全 task 完了を確認して pre-merge close する。
- [ ] 検証: active change 0 と cleanup 後の影響範囲の検証を確認する。通常 CI が削除した artifacts に依存しないことを確認する。

## 文書作成時の状態と証跡

- source commit: `b5a70047a294c7424c0c0398bd5eb434edb42b9a`。
- 利用者の最新指示は「OpenSpec の作成まで、実装は行わない」である。全 task は未着手。
- proposal / design / spec / spec-holes / validation の作成は実装 task 完了に数えない。
- 実動作、V01〜V16、実装後の独立 review / verifier、hosted CI は未検証。
- 文書検証（以下はすべて上記 source commit に文書差分を加えた入力での fresh 実行）:
  - `openspec validate align-downstream-prune-validation --strict --no-interactive`:
    exit 0。OpenSpec CLI 1.3.1 で valid。
  - `/home/shimi3435/.local/share/uv/python/cpython-3.14-linux-x86_64-gnu/bin/python3.14 scripts/openspec-validate-gate.py`:
    exit 0、1 passed / 0 failed。project の必須 artifacts / checkbox preflight を含む。
  - `python3 -` による一時的な読取監査:
    exit 0。6 artifacts、依存順の6 tasks、実行制約3件、12分類×6要件、16検証ID、
    21 scenarios、文書内リンク、末尾空白を確認した。恒久テストは追加していない。
  - `git diff --check`: exit 0。未追跡の新規文書の空白は上記読取監査で別途確認した。
  - self-review: 合意した scope、安全境界、文書だけの変更、全 task 未着手、
    spec-holes の検証対応を確認した。正常 no-op と Git 前提の関係、専用 CI の不要な
    共通 gate 重複を文書内で明確化した。実装後の独立 review / verifier の代用にはしない。
- 全体 gate の環境確認（fresh 実行、成功 evidence として再利用しない）:
  - `./scripts/check.sh`: exit 1。`Node.js 24 が必要です（検出: v26.1.0）`。
  - `task check`: Task exit 201、内部 runtime-preflight exit 1。同じ Node 版不一致で停止。
  - `python3 scripts/openspec-validate-gate.py`: exit 1。
    既定 Python に `tomllib` がなく、上記の既存 Python 3.14 に切り替えた実行で成功した。
  - `task openspec:validate` の uv wrapper と full tests は未実行。
    この worktree の依存環境は初期化せず、OpenSpec CLI と gate 実体を直接検証した。
- 実装再開時は Node 24 / Python >=3.14 と locked dependency を準備し、
  最新 base と仕様の差分を確認する。ここでの文書検証を Task 1 の CI parity に流用しない。
