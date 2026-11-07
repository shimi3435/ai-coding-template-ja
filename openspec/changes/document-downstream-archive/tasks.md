# 下流archiveフローの実装と検証

## Execution Constraints

- 最初の CI parity: 最初の文書・contract test sliceでfocused pytestと対象OpenSpec validationを実行し、全実装完了前に環境を確認する。
- 停止・再計画条件: 仕様判断、material expansion、検証失敗、review収束上限は共通workflowに従う。未検証を完了扱いしない。
- 一時 artifact cleanup: 検証用一時データはrepository外に置く。今回のchangeは引き渡しまで保持し、削除型closeは明示された保守操作へ委ねる。

## Tasks

- [x] 1. 下流archive手順とtemplate closeを分離する
  - 成果: R1/R2/R4/R5/R6の正本・配置・guideと恒久contract testを整える。
  - 依存: なし
  - 対象: `docs/agents/workflow.md`, `openspec/project.md`, `docs/template/release.md`, `docs/template/retrospectives.md`, `docs/guide.md`, `AGENTS.md`, `tests/test_openspec_archive_contract.py`
  - [x] 実装
  - [x] 検証: focused pytest、対象strict validate、文書の例示シナリオreview。
  - 結果: `uv run --no-sync pytest tests/test_openspec_archive_contract.py tests/test_openspec_direct_workflow_contract.py --no-cov -q` は17 passed。
    `openspec validate document-downstream-archive --strict --no-interactive` はexit 0。
    CI baselineのNode 24.14.1 / npm 11.11.0 / Python 3.14.6でruntime-preflight成功。
    R1/R2/R4/R5/R6の例示（別PR、deltaなし、4種の手動同期、部分同期、衝突、日付またぎ、archive内修正）を文書へ照合した。

- [x] 2. Executorのarchive-ready引き渡しを明記する
  - 成果: R3の完了状態・次操作・未確認PR報告を追加しactive-only/Git操作境界を維持する。
  - 依存: 1
  - 対象: `.agents/skills/execute-openspec-change/SKILL.md`, `tests/test_openspec_archive_contract.py`
  - [x] 実装
  - [x] 検証: executor / workflow / archive focused pytest、Skill整合検証。
  - 結果: `uv run --no-sync pytest tests/test_openspec_archive_contract.py tests/test_execute_openspec_change_skill.py tests/test_openspec_direct_workflow_contract.py --no-cov -q` は35 passed。
    Node 24環境で`node repo-tools/entrypoint.mjs skills:verify` はexit 0。

- [x] 3. 独立reviewと最終検証を完了し引き渡す
  - 成果: self-review、initial independent review、必要なfix/差分review、project gate、別verifierを完了する。
  - 依存: 2
  - 対象: `tests/test_openspec_archive_contract.py`
  - [x] 実装
  - [x] 検証: `./scripts/check.sh`、`task openspec:validate`、対象strict validate、関連保守テスト、独立verifier。
  - self-review: 対象6 tracked files、新規contract test、全OpenSpec artifactsと呼出元を検査。
    R1〜R6とspec-holes全12分類の対応を確認し、blockerなし。実host運用は対象外の未検証として維持する。
  - initial review: archive_initial_reviewから2 blocker。projectの新規markerは実prune対象外、retrospectivesの正本案内が旧workflow節を指す。
    iteration 1として修正する。後者は参照移設に伴う純prose修正のため専用テストを作らずリンク先とheadingを照合する。
    前者は実際の保持範囲を反映した新規contract testでREDを確認してから修正する。
  - iteration 1: entrypoints testのRED（1 failed）を確認し、projectの未対応markerと保守文書直linkを除去した。
    retrospectivesのownerをreleaseへ更新し、移設先headingが存在することを確認した。
    focused 3 files + history/release contractは56 passed、strict validateとdiff check成功。
    archive_initial_reviewの差分reviewで2 blocker解消・新規blockerなし。iteration 1で収束した。
  - 検証経過: 保守focused tests初回はNode 26の環境でruntime-preflightが失敗（25 passed / 1 failed）。
    Node 24.14.1へPATHを合わせた再実行は26 passed。設定・依存変更は行っていない。
    修正後の`./scripts/check.sh`はexit 0（Node 638 passed、Python 646 passed / 126 skipped）。
    再開時にHEAD、tracked diff、新規test、利用者差分の同一性を確認した。一時logと実行sessionが失われたため、
    現環境でproject gate・保守focused tests・OpenSpec validationをfresh再実行した。
  - 最終結果: `./scripts/check.sh` exit 0（Node 638 passed、Python 646 passed / 126 skipped）、
    `task openspec:validate` exit 0（1 passed）、対象strict validate exit 0。
    `uv run --no-sync pytest template-maintenance/tests/test_history_contract.py template-maintenance/tests/test_release_contract.py template-maintenance/tests/test_prune_integration.py --no-cov -q` は26 passed。
    上記は`PATH="$PWD/.venv/bin:/home/shimi3435/.nvm/versions/node/v24.14.1/bin:$PATH"`の環境でfresh実行した。
  - 独立verifier: archive_final_verifierがfocused 3 filesをfresh実行して35 passed、strict validateとdiff check成功。
    HEAD・diff・新規test・環境・入力無変更を照合してproject gateのgreen evidenceを再利用し、保守検証logも確認した。
    R1〜R6・spec-holes全12分類を検証しblockerなし。initial reviewerとは別agentで完了した。

## 引き渡し

- implementation complete / archive-ready。全taskとローカル必須検証は完了、既知blockerなし。
- PRレビューは未確認、hosted CIは未実行。archive complete、削除型close完了、merge済みとは報告しない。
- 次の操作はPRレビュー収束後、明示選択した保守手順による削除型close。commit・push・PR作成・closeは別の明示依頼まで実行しない。
- 実host acceptanceは後続#47へ引き渡す。実agent動作を静的テストで検証済みとはしない。

## 実行情報

- 実装担当: main executorのみ。追加executorなし。initial reviewerとverifierは別agentで順次起動する。
- source commit: 4b9fdc193a282696936da0e1ca82498f4afcbb25。mainの検証はfresh実行、verifierのproject gateだけgreen evidence再利用。
- preflight: active exactly one、必須artifactsとstrict validation、12分類解決、3 constraints・task依存・対象pathを確認済み。
  初回dirty overlapなし。作成した仕様artifactsは本セッション所有、利用者差分は下記の対象外pathのみ。
  CLIは1.3.1。archive --helpと公式契約が一致することを確認した。
- 作業前の利用者差分: `docs/template/issue-71-ownership-poc.md`（untracked）。対象外として保持する。
  SHA-256: 392fe2e3395ffbaa8836e41bf1ae10b5df6f83d791d3918b8d450f1ec554c144。
- 未実施: 実host acceptance（後続#47）、hosted CI・PR review（ローカル作業の対象外）。
