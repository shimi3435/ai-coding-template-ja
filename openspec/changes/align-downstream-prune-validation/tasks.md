# 実装タスク: align-downstream-prune-validation

## Execution Constraints

1. **最初の CI parity**: Task 1 の最初の環境依存 slice で Node.js 24 / npm、Python >=3.14 と既存 lock による fresh / rename の正式 gate を確認する。全実装完了まで延期しない。
2. **停止・再計画条件**: 今回はレビュー後の OpenSpec 6文書の修正・検証だけが承認されており、実装開始指示まで全 task を実行しない。開始後は AGENTS.md / workflow の停止・再計画規律に従い、仕様外拡張・必須検証失敗を完了扱いしない。
3. **一時 artifact cleanup**: disposable repository・失敗注入用一時物は検証側が cleanup し、生 log や専用 state を追跡しない。close は全実装・検証・review 完了後だけとし、現在は change directory を保持する。

## Tasks

### 1. 共通検証と保守検証を分離する

- 成果: DPV-1 / DPV-2 の入口、M16〜M18 の pytest 3ファイル、下流文書移設、M19 の専用 CI と S01〜S03、residual contract の exact path 限定許可を一体で導入する。
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
- [ ] 実装: gate 確認前に design §2 の residual contract 限定変更を行い、保守意味検証を分離する。共通検証・共有 fixture を維持する。履歴は許可した link target だけ修正し、移設と live links を整合させる。
- [ ] 検証: V01 / V03 / V04 / V05 / V15 の該当部分、旧名称の exact path 許可と他の残存拒否、履歴の許可差分比較、focused tests、最初の CI parity を実行する。active change は保持する。

### 2. 構成判定と read-only preview を実装する

- 成果: design §3.1 の全行、§3.2 の R01〜R06 / C・P・J・M を実装し、DPV-3 / DPV-4 の状態・preview と保証限界を提供する。
- 依存: 1。
- 対象:
  - `repo-tools/`
  - `scripts/prune-template-docs.py`
  - `scripts/doctor.py`
  - `tests/`
  - `template-maintenance/`
  - `Taskfile.yml`
  - `docs/reference/prune-template-assets.md`
- [ ] 実装: 先に既存解析機構と限定処理の方式を確認する。状態判定を共通 gate・doctor・prune で整合させ、effective cwd と未対応入力の拒否を実装する。K05 の JSON 負例を通常 tests から読み込み、実行コードを検査除外しない。
- [ ] 検証: V06 の manifest 各行と全 surface、V07 / V09 / V10 / V11 / V16 の read-only 部分を実行する。cwd 優先順位・相対参照・固定 root 初期化2構文の限定許可・未対応移動の変更ゼロ、部分欠落・参照残存の拒否と説明・fixture の非検出を確認する。

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
- [ ] 検証: V01〜V16 を照合し、setup / rename / prune / 再setup / gate / doctor の実動作と負例を確認する。V15 で残存する全 R01〜R06、履歴リンクの許可差分、完全除去後の gate 不在を確認する。

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
- [ ] 検証: active change を残した最新入力の正式 gate・保守 gate・OpenSpec validation、hosted CI、および別 agent の verifier を完了する。gate 成功のための先行 close は禁止する。

### 6. 承認された実装完了後に change を close する

- 成果: 恒久文書へ契約を残し、retrospective と一時成果 cleanup を行う。
- 依存: 5。
- 対象:
  - `docs/template/retrospectives.md`
  - `openspec/changes/align-downstream-prune-validation/`
- [ ] 実装: policy に従う retrospective を追記し、全 task 完了を確認して pre-merge close する。
- [ ] 検証: active change 0 と cleanup 後の影響範囲の検証を確認する。通常 CI が削除した artifacts に依存しないことを確認する。

## 初稿作成時の証跡

- source commit: `b5a70047a294c7424c0c0398bd5eb434edb42b9a`。
- 初稿作成時の指示は「OpenSpec の作成まで、実装は行わない」であった。以下は初稿の証跡であり、改訂後の成功として再利用しない。全 task は未着手。
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

## 第1回レビュー対応時の文書検証（過去の証跡）

- source commit: `0d655d98ac717970957c7b688968bd948477fef1` に本改訂の6文書差分を加えた入力。
  以下は fresh 実行であり、初稿の green evidence は再利用していない。
- 実装は未着手。全12 checkbox を未完了のまま保持する。
- `openspec validate align-downstream-prune-validation --strict --no-interactive`:
  exit 0、valid。
- `/home/shimi3435/.local/share/uv/python/cpython-3.14-linux-x86_64-gnu/bin/python3.14 -B scripts/openspec-validate-gate.py`:
  exit 0、1 passed / 0 failed。
- `python3 -` による一時的な読取監査: exit 0。
  6 artifacts、6要件・26 scenarios、12分類×6要件、6 tasks・未完了 checkbox 12件、
  実行制約3件、16検証ID、manifest 34行、文書内リンク・末尾空白を確認した。
- `git diff --check`: exit 0。
- self-review: レビューの3 blocker と DPV-2 の限定を6文書間で照合し、
  manifest 全件・参照構文の保証限界・履歴の許可差分・検証対応を確認した。
  実装後の独立 review / verifier と V01〜V16 は未検証であり、この確認で代用しない。
- `task check`: exit 201。runtime-preflight が
  `Node.js 24 が必要です（検出: v26.1.0）` で停止した。全体 gate の成功は未確認。
- 当時の既存契約との衝突（第2回レビュー後に修正仕様を確定、実装は未着手）: Python 3.14 の `runpy.run_path` で
  `tests/test_tool_neutral_documentation_contract.py` を読み込み、
  `test_legacy_token_remains_only_in_exact_history_allowlist()` を直接実行した結果、exit 1。
  manifest が歴史 ADR の exact path を列挙すると、既存の全追跡ファイル対象の旧名称検査が
  本 change の `design.md` を違反とする。違反 path は同ファイル1件だった。
  これは runtime の版不一致とは別の既存テスト失敗である。
  必須 path の難読化、既存 allowlist の拡張、テスト変更による回避は行っていない。
  当時は修正判断を未解消として残していた。現在は design §2 / DPV-2 に限定的な契約変更を定め、
  Task 1 の未完了実装として扱う。この過去の失敗結果を成功へ書き換えない。
  OpenSpec 形式検証の成功を全体 gate の成功や実装開始承認として扱わない。

## 第2回レビュー対応の状態と証跡

- source commit: `d3178fe1a260d8df04e6adc50f6c0c3875dd0b05` に今回の6文書差分を加えた入力。
  以下は fresh 実行であり、過去の green evidence を再利用していない。
- residual contract の修正方針は design §2 / DPV-2 / V05 / V15 に確定した。
  実装・実動作検証は未着手であり、全12 checkbox を未完了で保持する。
- 追加判断（解決済み）: `rg -n '\b(cd|pushd|popd)\b'` による現行 source の読取確認で、
  design §3.2 に挙げた4 script の root 初期化が一律拒否に該当すると判明した。
  利用者承認後、固定 root 初期化2構文の限定許可を design / DPV-3 / V06・V11 に反映した。
  ファイル全体の除外や任意変数追跡は追加しない。仕様判断の確定を実装開始承認とは扱わない。
- `openspec validate align-downstream-prune-validation --strict --no-interactive`: exit 0、valid。
- `/home/shimi3435/.local/share/uv/python/cpython-3.14-linux-x86_64-gnu/bin/python3.14 -B scripts/openspec-validate-gate.py`:
  exit 0、1 passed / 0 failed。
- `python3 -` による一時的な読取監査: exit 0。
  6 artifacts、6要件・30 scenarios、12分類×6要件、6 tasks・未完了 checkbox 12件、
  実行制約3件、16検証ID、manifest 34行、文書内リンク・末尾空白を確認した。
  design の固定 root 初期化2構文が現行4 script の連続2行に一致し、
  各 script の top-level の移動がその1件であることと、変更が6文書のみであることも読取確認した。
  scanner の実装検証ではなく、仕様の記述と現行 source の対応確認である。
- `git diff --check`: exit 0。
- self-review: 6文書の差分と現行 source を照合した。既存 root 初期化の限定例外、cwd 優先順位、
  residual contract の token 単位の許可、active change を残した gate 順序と検証対応を確認した。
  追加判断待ちの記述を残さず、仕様の確定と既存テストの未修正・未検証を区別した。
  実装後の独立 review / verifier、V01〜V16、hosted CI は未検証。
- `task check`: exit 201。`Node.js 24 が必要です（検出: v26.1.0）` で停止。
- Python 3.14 の `runpy.run_path` 経由で既存
  `test_legacy_token_remains_only_in_exact_history_allowlist()` を直接実行: exit 1。
  違反は本 change の `design.md` 1件。これは契約変更が未実装であることによる失敗であり、
  修正判断は Task 1 に組み込まれている。テストの除外や先行 close による回避は行っていない。
