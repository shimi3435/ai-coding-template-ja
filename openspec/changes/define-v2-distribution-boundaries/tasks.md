# Tasks: v2配布境界監査

## 実行制約

1. 最初のCI parity: Node 24 / npm / Python 3.14、locked dependenciesで変更前task checkの実行可否を確認し、最終入力でも検証する。
2. 停止・再計画: 合意外の仕様判断、material expansion、固定環境の反復障害はAGENTS.md / workflowの停止規約に従う。未検証を完了扱いしない。
3. 一時artifact cleanup: probeは使い捨てdirectoryだけで行い、生logや検査scriptを追跡しない。依存キャッシュと.venvはgitignore済みの作業環境に限定する。

## Tasks

### 1. 仕様と監査固定点を確定する

- 成果: 最新main、Issue本文・コメント、共有policy、dirty状態、12分類と検証対応を確認する。
- 依存: なし。
- 対象:
  - `openspec/changes/define-v2-distribution-boundaries/`
- [x] 実装: proposal / design / spec delta / spec-holes / tasksを作成する。
- [x] 検証: 最新入力、対象外、未決判断の境界、最初のCI parityを確認する。

検証証跡（source commit: `00d3a9713a8eecbe3e0a1af594293f97121e0c5c`、全てfresh）:

- `git fetch origin main` / `git rev-parse origin/main`: 最新mainは上記commit。元worktreeは`agent/rebuild-automate-skill-update-prs`、tracked/untracked差分なし。専用worktreeは`../ai-coding-template-ja-issue-67`、branchは`agent/issue-67-boundary-audit`。元branchは変更していない。
- `gh issue view 67/51/65/66 --repo shimi3435/ai-coding-template-ja --json body,comments`（番号ごとに実行）: 最新本文・全コメント確認。#65/#66の古い順序コメントは最新#67/#65本文で更新済み。
- `cat AGENTS.md docs/agents/workflow.md` と最新mainとの差分確認: 適用規約確認。`spec-holes`の3要件×12分類と検証対応を作成。
- Context7 resolve-library-id / query-docs (`/fission-ai/openspec`): validateとarchiveの公式資料を確認。archive実行は今回対象外。
- 既定PATHの`task check`: Node v26.1.0でexit 201（内部preflight exit 1）。Node 24選択後のruntime-preflightはsystem Python 3.10.12でexit 1。いずれも成功扱いせず、既存Node 24.14.1と新worktreeのPython 3.14.6環境を選択して解消。
- `npm ci --ignore-scripts` / `uv sync --locked`: exit 0。tracked lock変更なし。hook installは行っていない。
- `export PATH=/home/shimi3435/.nvm/versions/node/v24.14.1/bin:$PWD/.venv/bin:$PATH; task check`: exit 0、Node 24.14.1 / npm 11.11.0 / Python 3.14.6、Python 152 passed。最初のCI runtime parityを確認。GitHub上のCI自体は実行していない。

### 2. 保守者向け監査と移行引き渡しを作成する

- 成果: ADR、必須監査項目・全public task・CI分類、prune境界、後続Issueの受け入れ条件、独立Issue提案。
- 依存: 1。
- 対象:
  - `docs/template/adr/0011-v2-distribution-boundaries.md`
  - `docs/template/v2-boundary-audit.md`
  - `docs/template/release.md`
- [x] 実装: 文書を作成し、既存release手順から参照する。
- [x] 検証: 使い捨てmainで既知問題を再確認し、ファイル・task・CI coverageとリンクを確認する。

検証証跡（source commit: `00d3a9713a8eecbe3e0a1af594293f97121e0c5c`、全てfresh）:

- `git archive HEAD`をPython標準ライブラリのTemporaryDirectoryへ展開し、`python scripts/prune-template-docs.py` / 同`--apply` / `node repo-tools/entrypoint.mjs check-contracts`を実行: fresh validator exit 0、preview/apply exit 0、prune後validator exit 1（docs/template/release.mdのENOENT）。由来情報と研究ADR scaffoldは残存。
- 同コピーで`.venv/bin/pytest --no-cov -q tests/test_runtime_foundation_contract.py tests/test_review_convergence_contract.py tests/test_openspec_direct_workflow_contract.py`（実行ファイルは専用worktreeの絶対path）: exit 1、5 failed / 23 passed。失敗はprune対象release/ADRへの参照。欠陥再現として採用し、prune成功の証拠にはしない。
- 別コピーで#64 workflow単独を欠落させcheck-contracts実行: exit 1、skill-update-prs.ymlのENOENT。validatorのCLI/smoke/runbook無条件要求はsource readで確認。
- #57保持probeの初回はGit indexのない展開先だったためskills:verifyがtracked LICENSE条件でexit 1。#57の破損とは判定しない。使い捨てコピー内だけで`git init -q` / `git add .`してtracked入力を再現し、#64 workflowと専用subtreeを除去した状態で`skills:verify` exit 0（up-to-date）、`skills:lock-local` exit 0（unchanged）、check-contracts exit 1を確認。CLI/contract参照は未修復なので、正常pruneとは扱わない。全コピーは自動削除済み。
- `rg`によるTaskfile/ci.yml、release/runtime契約、全tests、#57/#64 import、catalog/links、OpenSpec gate、bootstrap/doctor/rename、policy/docsの責務照合: 既知6項目が現在も成立。#57に#64への逆importなし。ownership=pluginは外部manager宣言でありbundle integrity実装とは異なる。
- `gh issue list --repo shimi3435/ai-coding-template-ja --state all --limit 100 --json number,title,state`: 対応する独立CI修正/release準備Issueは見当たらない。監査末尾に2件の文面を用意し、発行していない。
- 一時Python coverage/link probe（git ls-files、YAML解析、明示path/glob展開、裸の* / **除外）: 274 tracked assets、29 public tasks、12 CI jobs、Dependabot 2設定の参照漏れなし。全8変更文書の相対リンク/改行/空白と3要件×12分類を確認。既存tracked-only residual検査を新規文書にも明示適用してexit 0。
- 初回草稿のtask数、policyのsymlink誤記、存在しないnotebook overlay path、configs案内の漏れは、実treeとの照合で修正済み。新たな実行処理の変更ではないため恒久テストを追加せず、一時path/coverage検査で再確認した。

### 3. self-reviewと最終検証を完了する

- 成果: 未追跡を含む差分の自己検査、独立reviewと別verifier、focused validation、project checks、retrospective、実Issueへの接続、未検証の区別。
- 依存: 2。
- 対象:
  - `docs/template/adr/0011-v2-distribution-boundaries.md`
  - `docs/template/v2-boundary-audit.md`
  - `docs/template/release.md`
  - `docs/template/retrospectives.md`
  - `openspec/changes/define-v2-distribution-boundaries/`
- [x] 実装: self-reviewを実施し、明白な文書欠陥があれば修正する。
- [x] 検証: strict target validate、task openspec:validate、task check、文書coverage確認を完了する。

検証証跡（source commit: `00d3a9713a8eecbe3e0a1af594293f97121e0c5c`、全てfresh）:

- self-review: `git diff` / `git diff --cached` / `git diff origin/main...HEAD`、untracked全7ファイルを含む全8文書の全文を確認。合意方針、owner、shared/prune境界、scope、spec-holes検証対応を照合。既知不具合は実装修復せず後続へ記録。当時は実装変更なしを理由にOSWF-5非該当としたが、削除/migration契約を確定するPRとしての判定は誤りであり、cycle 2で撤回する。
- `node --test repo-tools/repository-contracts.test.ts repo-tools/skill-updater-cli.test.ts`: exit 0、54 passed。
- `uv run --no-sync pytest -q tests/test_runtime_foundation_contract.py tests/test_tool_neutral_documentation_contract.py`: exit 0、15 passed。文書契約のみの実行なのでアプリ未importのcoverage warningあり。
- `task doctor`: exit 0、FAIL=0 / WARN=3（既定package名、.env不在、Context7 key未設定）。資格情報の有効性は検証していない。
- `openspec validate define-v2-distribution-boundaries --strict --no-interactive`: exit 0（OpenSpec 1.3.1）。`task openspec:validate`: exit 0、active change 1件valid。
- `export PATH=/home/shimi3435/.nvm/versions/node/v24.14.1/bin:$PWD/.venv/bin:$PATH; task check`: 最終文書入力でexit 0。Node tests 162 + automation tests 272、Python tests 152 passed。contracts/skills:verify/tsc/ruff/basedpyrightも成功。
- `git diff --check`と一時文書coverage/link/新規文書residual scan: exit 0。self-review後の未解決指摘なし。証跡更新後はtasksを読むOpenSpec gateを再実行する。task checkが読むsource/tests/lock/CI/live docsは変更していないため、同じfull checkを重複実行しない。
- 一時mainコピーはTemporaryDirectoryで削除済み。検証log3件は必要な要約を本tasksへ記録した後に削除。専用worktreeのignored .venv/node_modulesだけを再開用の環境として保持する。

未検証・対象外: #51/#65/#66の修復後動作、Genshijin実host互換、実GitHub CI、online audit、実upstream更新、実host write、rename後/正常prune後の最終構成checkは本監査では未実施。既存testsの成功や欠陥再現で代替しない。設計文書専用の恒久testは追加せず、一時coverage/link/prose検査をfocused validationとして用いた。
当初の監査依頼ではcommit・push・PR作成・Issue更新・close・mergeを対象外とした。
追加のcode-review依頼により、Standards / Specの独立2軸reviewを実施し、両軸とも指摘0件。
PR作成時点ではcommit・push・PR作成だけを追加し、Issue更新・change close・mergeは対象外としていた。
PRは#67を参照し、自動close指定は付けず、active changeをレビュー入力として保持した。次のcycle 2で承認範囲を更新した。

## Cycle 2: PR #68のレビュー指摘対応（利用者合意済み）

利用者はgrillingで、(1) OSWF-5対象として新cycleで検証、(2) 独立Issue 2件の起票と実番号への置換、
(3) 成功後のpre-merge closeとPR更新を承認した。Issue #67のcloseとPR mergeは行わない。
先行taskの達成済み監査と検証証跡は保持し、task 3のvalidationを再開する。新cycle完了までchange全体は未完了。

- レビュー指摘1: ADRで削除/migrationの契約を確定しているためOSWF-5対象。実装コードの変更がないことは例外ではない。
- レビュー指摘2: 未発行文面だけでは完了handoffに不足。承認された2件を起票し、監査内の全追跡参照を実番号へ接続する。
- 前cycleのStandards / Specはinitial independent review相当の2軸review。別verifierは未実施であり、今回の代用にはしない。
- 実行順: 修正方針の反映 → self-review → 新しいinitial independent review → 必要なfix/focused validation/diff review → 最新入力task check → initial reviewerと別のindependent verifier。
- close前に全taskの検証、strict target validate、task openspec:validate、retrospectiveと必要な再検証を完了し、tasksを含む修正commitを保存する。
- closeは対象changeの5文書だけを最終commitで削除する。削除後task openspec:validateでactive change 0 / green、必要なproject checksと最終GitHub CIを確認する。恒久文書と他changeは保持する。

検証証跡（source commit: `b156ccd7df9ea7719a88a642605e2b233ed5c810`、fresh）:

- 一時Python probeでdesignの非該当文とauditの未発行状態を再現。純proseのpolicy解釈・完了境界の修正であり、恒久の文字列固定testは追加しない。
- git fetch / gh pr view: mainは00d3a97、PR headはb156ccd、worktree clean。PRの既存CIは5 jobs成功。
- AGENTS.md / workflowとIssue #67/#51/#65/#66の最新本文・全コメントを再確認。root policyの例外追加と#57/#64/Nodeの再設計は行わない。
- `gh issue list --state all`で重複確認後、利用者承認に基づき#69（通常CI範囲）と#70（prepare-v2-release）を起票した。監査の追跡先を置換した。実装修復は未完了。
- `gh issue view 69/70 --json number,title,state,body,url`（番号ごと）: 両方OPEN、本文・対象外・#69→#70の前提参照を照合した。
- self-review: 未コミットdiff、mainとの差分の全9文書、未追跡（0件）、関連policyとIssueを確認。OSWF-5、scope、shared/prune境界、4要件×12分類の検証対応に未解決指摘なし。表の空行とretrospectiveのtask対象記載を整えた。
- `openspec validate define-v2-distribution-boundaries --strict --no-interactive` / `task openspec:validate`: exit 0、active 1 valid。
- `node --test repo-tools/repository-contracts.test.ts repo-tools/skill-updater-cli.test.ts`: exit 0、54 passed。
- `uv run --no-sync pytest --no-cov -q tests/test_runtime_foundation_contract.py tests/test_tool_neutral_documentation_contract.py`: exit 0、15 passed。
- 一時Python coverage/link/residual probe: 274 main tracked paths、29 public tasks、12 CI jobs、Dependabot 2設定、全9文書の相対リンク、4要件×12分類を確認。初回probeのdirectory symlink自身の集計漏れを修正して再実行しexit 0。repository側の欠落ではない。
- `git diff --check`: exit 0。
- initial independent review（`/root/review_68_cycle2`）: 全PR/dirty差分、policy、Issue、限定close計画を照合し指摘0件。fix iterationは0回。過去の2軸reviewと別にfresh実施した。
- `export PATH=/home/shimi3435/.nvm/versions/node/v24.14.1/bin:$PWD/.venv/bin:$PATH; task check`: initial review後の最新入力でfresh実行、exit 0。Node 162、automation 272、Python 152 passed、contracts/skills:verify/tsc/ruff/basedpyright成功。Node 24.14.1 / npm 11.11.0 / Python 3.14.6。
- independent verifier（`/root/verify_68_cycle2`、initial reviewerと別agent）: close前gate PASS、blockerなし。全9文書とIssue #67/#51/#65/#66/#69/#70、policy、review順序と証跡を独立照合。strict target/gate（active 1）、diff --check、相対リンク11件/48穴もfresh再確認し成功。
- close前の全task検証は完了。retrospectiveはreview/check/verifier入力に含めた。最後のtasks証跡・checkbox更新後はOpenSpec gateと文書residualを再検証する。source/tests/lock/CI/恒久文書は最新task checkから無変更であり、close前full checkの再実行は不要。
- close後active change 0検証と最終CIは未実施。この証跡commit保存後、承認済みの5文書限定削除とfresh project checksを実施し、結果はPR #68へ記録する。Issue #67 closeとPR mergeは行わない。
