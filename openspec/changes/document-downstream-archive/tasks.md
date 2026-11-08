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
  - 依存: 4
  - 対象: `tests/test_openspec_archive_contract.py`
  - [x] 実装
  - [x] 検証: `./scripts/check.sh`、`task openspec:validate`、対象strict validate、関連保守テスト、独立verifier。
  - 新cycleの最終結果（source commit: 2f553a8d1a9c76c29c16aceaa932c1e3a02a3dd4）:
    `./scripts/check.sh`はfresh実行でexit 0（Node 638 passed、Python 660 passed / 126 skipped）。
    `uv run --no-sync pytest template-maintenance/tests/test_prune_integration.py --no-cov -q`は最終入力で5 passed。
    実prune前の保守導線、実prune後に残る通常導線を実ファイルとheadingまで検証した。
    `task openspec:validate`と対象strict validationもexit 0。実行環境は下記と同じNode 24 / Python 3.14。
  - 新cycleの独立verifier: archive_revision_verifierが49 focused tests、strict validation、OpenSpec gate、diff checkをfresh実行し成功。
    一時環境の実CLIでもcanonical正常/不正/欠落のexit 0/1/1、bulk対象0件のexit 0を確認した。
    HEAD・diff・新規test・runtimeを照合し、今回cycleのproject gateと最終pruneの成功証跡を確認。blockerなし。
    初回は利用上限で中断したが、再開後に上記検証を完了した。前cycleのverifierとは別agentである。
  - 以下は初回cycleの履歴であり、新cycleの検証結果とは区別する。
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

- [x] 4. 外部reviewで合意した境界と回帰検証を追加する
  - 成果: P2-1〜P2-3、P3-1を修正し、運用3ケース、実prune後参照整合、掲載shellのargv、対象canonical検証を確認する。
  - 依存: 2
  - 対象: `AGENTS.md`, `docs/agents/workflow.md`, `docs/guide.md`, `openspec/project.md`, `.agents/skills/execute-openspec-change/SKILL.md`, `tests/test_openspec_archive_contract.py`, `tests/test_openspec_archive_commands.py`, `template-maintenance/tests/test_prune_integration.py`
  - [x] 実装
  - [x] 検証: 回帰RED→GREEN、archive/executor/workflow focused tests、prune cleanupと導線helperのfocused確認、対象strict validate。
  - 検証順序: 実prune integration全経路はtask 3の最終検証として、review修正後の入力でfresh実行する。
    task 4では変更に近いshell argv、3運用の文書contract、導線の最終target照合と欠落時の拒否、cleanupを確認した。
  - 新cycle: 利用者がgrilling修正Q1〜Q5と最終合意を承認。task 1/2の履歴を保持し、task 3の検証完了を取り消す。
    task 4の完了後、task 3でself-review→新しい独立review→必要なfix/diff review→fresh project gate→別verifierを行う。
    本cycleのsource commitは2f553a8d1a9c76c29c16aceaa932c1e3a02a3dd4。前cycleのgreenを今回の結果に代用しない。
  - preflight: active exactly one、必須artifacts、追補spec-holes12分類解決、3 constraintsと依存1→2→4→3、対象重複順序を確認。
    利用者差分は前回と同じ対象外untracked fileだけ。仕様・tasks更新は本セッションの承認済み再計画である。
  - focused: 回帰REDは13 failed / 7 passed。修正後のarchive/executor/workflow 4 filesは49 passed。
    prune cleanupを含むfocusedは53 passed / 1 deselected。ruffと対象basedpyrightは成功。
    実prune初回は整形前snapshotのruff format失敗（1 failed / 4 passed）。整形後の最終入力では5 passed。
  - 実動作probe: 一時repositoryとinstalled CLI 1.3.1で対象canonicalの正常exit 0、不正exit 1、欠落exit 1、
    bulk対象0件exit 0を確認した。本repositoryのcanonical/archiveは変更していない。
  - self-review: 今回の差分と新規shell test、全仕様追補を検査。canonical検証節の追加によりfallbackの
    「前節の事前確認」が誤った節を指すprose defectを検出。明示リンクへ置換する。
    純proseの参照位置修正のため専用RED testは作らず、見出しとリンク先を照合する。他にblockerなし。
    明示リンクへ修正後、focused 4 filesは49 passed、対象strict validateとdiff check成功。
  - 新cycle initial review: archive_initial_reviewが現差分と仕様追補を検査しblockerなし。
    独立実行したarchive contract + shell testsは20 passed。修正iterationは不要。

- [x] 5. 再reviewのP3を修正しPRへ引き渡す
  - 成果: 保守側のclose-readyと次操作を明確化し、既存の完了条件を維持する。
  - 依存: 3
  - 対象: `docs/agents/workflow.md`, `.agents/skills/execute-openspec-change/SKILL.md`, `docs/template/release.md`, `tests/test_openspec_archive_contract.py`
  - [x] 実装
  - [x] 検証: focused tests、文書3運用の照合、self-review、独立review、fresh project gate、OpenSpec validation、別verifier。
  - source commit: 442d6dc144099b77b5d639bd7e0d61e2f2f1af03。利用者はP3修正とPR作成を依頼済み。
    既存完了taskは履歴として保持する。追加executorは起動せず、mainが実装する。
  - preflight: active exactly one、artifactsと12分類監査、依存1→2→4→3→5、対象外の利用者差分とdigestを確認した。
    今回は報告表現のみを変え、CLIの呼出仕様は変更しない。
  - self-review: 442d6dcからの9 files差分、呼出元guide、仕様・12分類監査を照合しblockerなし。
    下流／保守／未選択、PR未確認、専用手順欠落、必須検証欠落時の条件を文書で確認した。
    focused 4 filesはfresh実行で49 passed。実host acceptanceは引き続き#47で未検証。
  - independent review: close_label_reviewerが仕様と差分を検査しblockerなし。独立fresh focusedも49 passed。
  - 最終検証（source commit: 442d6dc144099b77b5d639bd7e0d61e2f2f1af03）:
    Node 24.14.1 / Python 3.14.6環境のfresh `./scripts/check.sh`はexit 0（Node 638 passed、Python 660 passed / 126 skipped）。
    fresh `uv run --no-sync pytest template-maintenance/tests/test_prune_integration.py --no-cov -q`は5 passed。
    `openspec validate document-downstream-archive --strict --no-interactive`と`task openspec:validate`はexit 0。
    focused ruffは長い文字列を行分割した後check/formatとも成功。CLI仕様・依存の変更はない。
  - final verifier: 別agentのclose_label_verifierが49 focused、strict validation、OpenSpec gate、diff checkをfresh実行し成功。
    HEAD・diff・runtimeと入力無変更を照合し、今回のproject gate・実pruneのgreen evidenceを再利用。blockerなし。
    利用上限で一度中断したが、利用者の再開指示後に同じ役割で最終確認を完了した。
    実host acceptance（#47）、hosted CI、PRレビュー収束は未確認として区別した。

## 引き渡し

- implementation complete。前cycleの修正は外部再reviewでAPPROVE。追加P3も修正し、task 5の必須検証・独立review/verifierを完了した。
- 完了操作の運用を明示選択するまではarchive-ready / close-ready判定を保留する。実装・検証完了をclose/archiveの実行許可と扱わない。
- PRレビュー収束・hosted CI・実host acceptanceは未確認。close/archive/mergeは実行しない。

## 実行情報

- 実装担当: main executorのみ。追加executorなし。initial reviewerとverifierは別agentで順次起動する。
- 初回source commit: 4b9fdc193a282696936da0e1ca82498f4afcbb25。新cycleは2f553a8d1a9c76c29c16aceaa932c1e3a02a3dd4。
  mainの検証はfresh実行、verifierは今回cycle内のproject gate / prune成功証跡だけを入力照合して再利用した。
- preflight: active exactly one、必須artifactsとstrict validation、12分類解決、3 constraints・task依存・対象pathを確認済み。
  初回dirty overlapなし。作成した仕様artifactsは本セッション所有、利用者差分は下記の対象外pathのみ。
  CLIは1.3.1。archive --helpと公式契約が一致することを確認した。
- 作業前の利用者差分: `docs/template/issue-71-ownership-poc.md`（untracked）。対象外として保持する。
  SHA-256: 392fe2e3395ffbaa8836e41bf1ae10b5df6f83d791d3918b8d450f1ec554c144。
- 未実施: 実host acceptance（後続#47）、hosted CI・PR review（ローカル作業の対象外）。
