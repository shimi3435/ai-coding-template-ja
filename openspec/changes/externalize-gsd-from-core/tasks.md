## Execution Constraints

- **最初の CI parity:** `execute-openspec-change` のexactly-three preflightとtask blocker永続化contract、tracked-only residual scanを最初のvertical sliceとし、対象fixture / contract testsを先に実行する。review収束後に`task check:isolated`、`task openspec:validate`、最新入力の`task check`を実行する。
- **停止・再計画:** 仕様判断、公開interface、security / trust boundary、外部write、永続データ、dependency / lockfile、build / CIの新規変更、削除対象外の独立成果、OpenSpec CLI必須化、外部orchestrator固有supportが必要になった時点で停止する。同一役割・taskのagentが利用可能な成果を返さず連続2回失敗した場合、または環境・command・入力を固定した1回の再試行でも同じinfrastructure failureが再現した場合も停止する。影響とOpenSpec更新案を提示し、利用者承認後に`spec-holes`、validation、tasks再構成を行う。initial review blockerの修正は最大3回とし、未解決なら停止する。
- **一時 artifact cleanup:** test用一時repository、cache、実行logを追跡しない。一時Git repositoryはtest終了時に破棄し、生logや専用stateを恒久artifactにしない。

## Tasks

- [x] 1. Superseding ADR とコア規約を OpenSpec 直接経路へ更新する
  - **成果:** GSD を品質条件と経路選択から外し、OpenSpec scope、change 分割、tasks 正本、外部 orchestrator の提案・選択境界を現行規約に反映する。
  - **依存:** なし。
  - **対象:** `AGENTS.md`、`CONTEXT.md`、`openspec/project.md`、`docs/agents/workflow.md`、`docs/template/adr/0003-openspec-gsd-boundary.md`、`docs/template/adr/0008-adaptive-openspec-gsd-execution-boundary.md`、`docs/template/adr/0010-openspec-direct-execution.md`。
  - [x] 1.1 実装: 現行規約を更新し、ADR-0003 / ADR-0008 をADR-0010から Superseded として参照する。
  - [x] 1.2 検証: OpenSpec直接経路、列挙型scope、最小task契約、明示opt-in、再計画条件が単一の規範として矛盾なく記載されていることを静的contract testで確認する。
    - 証跡: `uv run pytest tests/test_openspec_direct_workflow_contract.py -q` → 6 passed。

- [x] 2. `execute-openspec-change` を直接 executor へ再設計する
  - **成果:** 明示呼出後、4条件の preflight、詳細tasksの順次実装、検証、checkbox更新、リスク比例reviewを実行する skill。
  - **依存:** Task 1。
  - **対象:** `.agents/skills/execute-openspec-change/SKILL.md`、`.agents/skills/skills.lock.json`、`tests/test_execute_openspec_change_skill.py`、`tests/test_skills_lock.py`。
  - [x] 2.1 実装: active change一つ、必須artifacts有効、spec-holes未解決なし、詳細tasksありを fail-closed で確認する。
  - [x] 2.2 実装: 呼出を実装・必要reviewer / verifier起動の承認とし、重複dirty差分だけ停止する。累積executor-owned paths / post-task diff digest一致時は完了taskと後続taskの対象が重なっても再開し、追加executorは別の利用者承認を要求し、commit / push / PRを自動実行しない契約を追加する。
  - [x] 2.3 検証: 未成立preflight、依存順、検証未完了、dirty重複、無関係dirty、同一taskと完了task→後続taskのownership一致 / 不一致再実行、追加executor承認、禁止Git操作をfixture / static contract testsで確認する。
    - 証跡: `uv run pytest tests/test_execute_openspec_change_skill.py tests/test_skills_lock.py -q` → 19 passed。
    - review修正後証跡: direct workflow / review / docs / skill lockのfocused contract 5 files → 44 passed。

- [x] 3. GSD handoff 実装と公開入口を互換 shim なしで削除する
  - **成果:** GSD package、CLI、smoke task、scripts、fixtures、専用testsがコアからなくなる。
  - **依存:** Task 2。
  - **対象:** `src/ai_coding_template_ja/openspec_gsd_handoff/`、`scripts/openspec-gsd-handoff-smoke.py`、`tests/fixtures/openspec_gsd_handoff/`、`tests/test_handoff_cli.py`、`tests/test_handoff_core.py`、`tests/test_handoff_discovery.py`、`tests/test_handoff_manifest.py`、`tests/test_handoff_preflight.py`、`tests/test_handoff_smoke.py`、`pyproject.toml`、`Taskfile.yml`、`scripts/rename-package.py`、`repo-tools/repository-contracts.ts`、`repo-tools/repository-contracts.test.ts`、`tests/test_rename_package.py`、`tests/test_removed_handoff_contract.py`。
  - [x] 3.1 実装: package、entry point、task、script、fixtures、専用testsを同じ変更で削除し、互換aliasを追加しない。
  - [x] 3.2 実装: rename、doctor、repository contracts、isolated environmentからGSD固有path、command、environment変数を除く。
  - [x] 3.3 検証: 削除済みCLI / task / importが利用不能であり、case-insensitiveな`gsd` token境界scanが`-`、`_`、`/`を含むallowlist外のtracked path / textを拒否することを確認する。
    - 証跡: `uv run pytest tests/test_removed_handoff_contract.py tests/test_taskfile.py tests/test_rename_package.py tests/test_execute_openspec_change_skill.py tests/test_skills_lock.py -q` → 42 passed。
    - 実動作: 削除済み module は exit 1 / `No module named`、削除済み task は exit 200 / `does not exist`。

- [x] 4. 現行文書をtool-neutralなOpenSpec運用へ整理する
  - **成果:** 利用者向け文書からGSD導入・handoff・経路選択を除き、Markdown fallbackと直接skill実行を案内する。
  - **依存:** Task 1、Task 3。
  - **対象:** `README.md`、`docs/guide.md`、`docs/optional/gsd.md`、`docs/template/grill/ai-coding-template-ja.md`、`docs/template/retrospectives.md`、`docs/template/adr/0006-template-meta-docs-isolated.md`、`docs/template/adr/0007-downstream-usage-guide-sot-boundary.md`、`docs/template/release.md`、`docs/template/v2-release-notes.md`、`Taskfile.yml`、`scripts/doctor.py`、`scripts/prune-template-docs.py`、`tests/test_tool_neutral_documentation_contract.py`、`tests/test_taskfile.py`、`tests/test_smoke.py`。
  - [x] 4.1 実装: `docs/optional/gsd.md` を削除し、旧grill / retrospectiveのGSD前提を削除または現方針へ更新する。
  - [x] 4.2 実装: Superseded ADRとv2 release notesだけを最終残存allowlistにする。実装中は本change directoryだけを一時例外にし、現行docsに外部orchestrator固有名を残さない。
  - [x] 4.3 検証: quickstart、workflow、OpenSpec fallback、release migrationのリンクと用語が矛盾しないことを文書contract testsとlink scanで確認する。
    - 証跡: `uv run pytest tests/test_tool_neutral_documentation_contract.py -q` → 5 passed。
    - review修正: broken symlink payload scanを追加し、PR #40 / #41の欠陥履歴7件をv2 release notesへ保持した。
    - new cycle修正: README / Taskfile / doctor / pruneを「テンプレ固有メタ文書」へ統一し、ADR-0006へv2現状を追補。focused docs / task / smoke / direct workflow contracts → 60 passed。

- [x] 5. リスク比例reviewと検証証跡の契約を更新する
  - **成果:** 全変更のself-review / 適用可能なfocused validationと、OSWF-5の列挙条件で発火する独立review / verifierがGSD phaseなしで完結する。
  - **依存:** Task 1、Task 2。
  - **対象:** `AGENTS.md`、`CONTEXT.md`、`docs/agents/workflow.md`、`docs/template/adr/0009-proportional-agent-workflow-evidence-economy.md`、`.agents/skills/self-review/SKILL.md`、`.agents/skills/verify-change/SKILL.md`、`tests/fixtures/review_convergence/cases.json`、`tests/test_review_convergence_contract.py`。
  - [x] 5.1 実装: review発火条件の全列挙を`AGENTS.md`のOSWF-5だけに置き、現行規約とtestsはrequirement IDを参照する。
  - [x] 5.2 実装: self-review、独立review、最大3修正cycle、`task check`、別verifierの順序、verifier blocker時のsoft-stop / 新cycle承認、結果要約だけを`tasks.md`へ残す契約を定める。
  - [x] 5.3 検証: risk非該当 / 該当、focused validationのN/A / 環境未実行、3回上限、agent連続2回失敗、同一入力のinfrastructure failure 2回再現、verifier blocker、外部tool state不使用をcontract testsで確認する。
    - 証跡: `uv run pytest tests/test_review_convergence_contract.py tests/test_skills_lock.py tests/test_tool_neutral_documentation_contract.py -q` → 23 passed。
    - initial independent review: blocker 6件、履歴data-loss 1件。fix cycle 1で6件解消、cycle 2で残るresume blockerを解消。diff review後の未解消 blocker / major 0件。
    - focused証跡: direct executor / review / docs / direct workflow / skill lock contracts → 44 passed。

- [x] 6. tool-neutral isolation と最終品質gateを通す
  - **成果:** 外部orchestrator、OpenSpec CLI、networkがない隔離環境でcore checksが通り、OpenSpec engine使用時のvalidationもgreenになる。
  - **依存:** Task 1〜5。
  - **対象:** `Taskfile.yml`、`repo-tools/repository-contracts.ts`、`repo-tools/repository-contracts.test.ts`、`tests/test_taskfile.py`、`openspec/changes/externalize-gsd-from-core/.openspec.yaml`、`openspec/changes/externalize-gsd-from-core/proposal.md`、`openspec/changes/externalize-gsd-from-core/design.md`、`openspec/changes/externalize-gsd-from-core/specs/openspec-direct-workflow/spec.md`、`openspec/changes/externalize-gsd-from-core/tasks.md`。
  - [x] 6.1 実装: `check:isolated` からGSD固有HOME / command検査を除き、外部tool非依存のcontractへ変更する。
  - [x] 6.2 検証: focused tests、現在のchange directoryだけを一時例外にした残存参照scan、`task check:isolated`、`task openspec:validate`、`task check`を最新入力で実行し、commandと結果を本tasksへ要約する。
    - verifier前証跡: focused contracts 44 passed。Node 24 / Python 3.14で`task check:isolated` → Node 42 / pytest 175 passed、`npm exec --yes --package=@fission-ai/openspec@1.3.1 -- task openspec:validate` → 1 passed / 0 failed、`task check` → Node 42 / pytest 175 passed。
    - New cycle最終証跡: focused docs / task / smoke / direct workflow contracts → 60 passed。Node 24 / Python 3.14で`task check:isolated` → Node 42 / pytest 177 passed、`npm exec --yes --package=@fission-ai/openspec@1.3.1 -- task openspec:validate` → 1 passed / 0 failed、`task check` → Node 42 / pytest 177 passed。
  - [x] 6.3 検証: 全requirements / scenarios / spec-holesと実装・testsを再対応付けし、未完了の検証checkboxがないことを確認する。
    - Prior verifier blocker: final independent verifierが、削除済み`docs/template/grill/ai-coding-template-ja.md`を`README.md`、`Taskfile.yml`、`scripts/prune-template-docs.py`、`scripts/doctor.py`が現行資料として案内する残存参照を検出。OSWF-6 / Task 4.3未達としてsoft stopした。
    - New cycle承認: Task 4親 / 4.3だけ未完了へ戻し、現行interfaceをtool-neutralな総称へ統一する。ADR-0006は履歴を保持してv2現状を追補し、既存OSWF-6内で回帰contractを追加する。pre-merge close / commit / pushは対象外。
    - New cycle initial review: Standards / Specともblocker・major 0件。前cycle blocker解消、履歴保持、scope、allowlist、checkbox整合を確認。document contract 10 passed、`git diff --check` green。
    - verifier証跡: focused 67 passed、削除済みmodule exit 1 / `No module named`、削除済みtask exit 200 / `does not exist`、isolated / OpenSpec / project checks green。未検証はpost-merge updater再構成とpre-merge close（follow-up / out-of-scope）。
    - New cycle final verifier: blocker 0。focused 60 + removed-handoff 11 passed、`task doctor` exit 0 / FAIL 0、`task prune-template-docs` dry-run exit 0、旧module / task不存在、OSWF-1〜7と全該当spec-holesの実装・tests対応を確認。未検証はpost-merge updater再構成とpre-merge close（follow-up / out-of-scope）。

- [x] 7. final code-reviewのpreflight / blocker / residual scan findingsを解消する
  - **成果:** execution constraintsをexactly 3へ収束し、安全境界通過後のtask blockerだけを永続化し、residual scanをtracked path / textへ限定する。
  - **依存:** Task 1〜6。
  - **対象:** `openspec/changes/externalize-gsd-from-core/tasks.md`、`openspec/changes/externalize-gsd-from-core/design.md`、`openspec/changes/externalize-gsd-from-core/specs/openspec-direct-workflow/spec.md`、`docs/agents/workflow.md`、`.agents/skills/execute-openspec-change/SKILL.md`、`.agents/skills/skills.lock.json`、`tests/fixtures/execute_openspec_change/cases.json`、`tests/test_execute_openspec_change_skill.py`、`tests/test_openspec_direct_workflow_contract.py`、`tests/test_tool_neutral_documentation_contract.py`。
  - [x] 7.1 実装: 本tasksを恒久3項目契約へ移行し、skill preflightでExecution Constraintsの欠落・重複・余剰をfail-closedに拒否する。
  - [x] 7.2 実装: preflight / dirty ownership失敗はreport-only、通過後のtask実行blockerは該当task直下へ記録する境界をspec、design、workflow、skillへ同期する。
  - [x] 7.3 実装: residual scanのrepository対象をtracked path / current worktree textだけへ限定し、untracked pathを通常checkから除く。
  - [x] 7.4 検証: exactly-three正常 / 欠落 / 重複 / 余剰、task実行blocker永続化 / pre-mutation report-only、一時Git repositoryのtracked違反検出 / untracked無視をfixture / contract testsで確認する。
    - TDD証跡: exactly-three、blocker persistence、tracked-only collectorの各contract testが修正前に失敗し、実装後に成功。
    - focused証跡: `uv run pytest tests/test_execute_openspec_change_skill.py tests/test_openspec_direct_workflow_contract.py tests/test_tool_neutral_documentation_contract.py tests/test_skills_lock.py -q` → 40 passed。
  - [x] 7.5 検証: finding元Spec reviewerのdiff review、最新入力のfocused tests / `task check:isolated` / `task openspec:validate` / `task check`、別の独立verifierを完了する。
    - diff review: iteration 1で全validation完了後のreview / project-check blocker保存先欠落を検出。iteration 2で文書順最後taskへのfallbackを追加し、残存severity / 新規blocker 0件。
    - verifier前証跡: focused 40 passed、`task check:isolated` → Node 42 / pytest 181 passed、OpenSpec 1.3.1 validation → 1 passed / 0 failed、repository `.venv`使用の`task check` → Node 42 / pytest 181 passed。誤PATHの初回`task check`はsystem Python 3.10を検出して停止し、commandを修正した。
    - 独立verifier: blocker / major / nit 0。focused 5 files → 51 passed、isolated / OpenSpec / project checks green、削除済みmodule exit 1 / `No module named`、削除済みtask exit 200 / `does not exist`、`task doctor` exit 0 / FAIL 0、`task prune-template-docs` dry-run exit 0、skill lock SHA-256一致。
    - 未検証: 実agent sessionによるpreflight実行は承認済みstatic skill / fixture contractの対象外。pre-merge closeとpost-merge updater再構成は明示的follow-up / out-of-scope。

- [x] 8. final code-reviewの完了遷移・partial ownership・delivery findingsを解消する
  - **成果:** review以降のblockerで完了状態を確実に再openし、orderly stopした実装途中差分から安全に復帰でき、新規artifactをreview可能なpatchへ含める。
  - **依存:** Task 1〜7。
  - **対象:** `openspec/changes/externalize-gsd-from-core/tasks.md`、`openspec/changes/externalize-gsd-from-core/design.md`、`openspec/changes/externalize-gsd-from-core/specs/openspec-direct-workflow/spec.md`、`docs/agents/workflow.md`、`.agents/skills/execute-openspec-change/SKILL.md`、`.agents/skills/skills.lock.json`、`tests/fixtures/execute_openspec_change/cases.json`、`tests/test_execute_openspec_change_skill.py`、`tests/test_openspec_direct_workflow_contract.py`、`docs/template/adr/0010-openspec-direct-execution.md`、`docs/template/v2-release-notes.md`、`tests/fixtures/review_convergence/cases.json`、`tests/test_removed_handoff_contract.py`、`tests/test_tool_neutral_documentation_contract.py`。
  - [x] 8.1 実装: initial / diff review、project check、verifier blockerの保存先taskで検証checkboxが完了済みなら、その検証checkboxと親taskを未完了へ戻す。
  - [x] 8.2 実装: safe boundary後のorderly stopで実装途中taskの変更path / digest / `implementation-in-progress`状態を累積ownership snapshotへ含め、一致時は実装継続、不一致またはcrash後の未記録差分はfail-closedにする。
  - [x] 8.3 実装: focused validation後、change-owned未追跡7 pathsだけを限定stageし、cached / unstaged diffの両方をreview対象にする。commitは行わない。
    - delivery証跡: 既存stageが空であることを確認後、指定7 pathsだけを`git add -- <exact paths>`でstage。`git ls-files --others --exclude-standard`は空、commit未実施。
  - [x] 8.4 検証: review以降のblocker再open、全validation完了fallback、partial snapshot一致 / 不一致、abrupt terminationをfixture / static contract testsで確認する。
    - TDD証跡: completion再openとpartial ownershipのskill / canonical contract testsが修正前に失敗し、実装後に成功。
    - focused証跡: `uv run pytest tests/test_execute_openspec_change_skill.py tests/test_openspec_direct_workflow_contract.py tests/test_review_convergence_contract.py tests/test_skills_lock.py -q` → 43 passed。`git diff --check` green。
    - delivery seam: stage後のtracked-only scanが新規direct workflow test内のlegacy token literalを拒否。active change pathをfragment化し、focused 6 files → 65 passed。cached / unstaged diff check green、untracked 0。
  - [x] 8.5 検証: finding元Spec reviewerのdiff review、最新入力のfocused tests / `task check:isolated` / `task openspec:validate` / `task check`、別の独立verifierを完了する。
    - initial code-review: Standardsはhard violation 0、判断事項Medium 1 / Low 3を別Issueへdefer。Specはblocker 3件。
    - diff review iteration 1: 3 blockers全件解消、canonical spec / design / workflow / skill / tasks / testsの矛盾なし、新規blocker 0件。reviewerはcached 7 pathsとuntracked 0も確認。
    - follow-up: review収束後、runtime version validation、repository contract validator分割、Node installer / bootstrap fixture整理を3件のGitHub Issuesとして作成する。
    - external write承認: 利用者が`/grilling`で「Issue作成」と「3 Issues」を選択し、3件の作成前に明示承認した。
    - verifier前証跡: focused 65 passed、`task check:isolated` → Node 42 / pytest 185 passed、OpenSpec 1.3.1 validation → 1 passed / 0 failed、repository `.venv`使用の`task check` → Node 42 / pytest 185 passed。
    - 独立verifier: blocker / major / nit 0。focused 65、isolated / OpenSpec / project checks green、`task doctor` FAIL 0、prune dry-run exit 0、削除済みmodule / task不存在、cached exactly 7、untracked 0、skill SHA-256一致。
    - verifier環境補足: 初回doctorはNode 26、初回project checkはsystem Python 3.10でpreflight停止。Node 24とrepository `.venv/bin`のPATHへ修正後green。実装欠陥なし。
    - follow-up Issues: [#50 runtime version validation](https://github.com/shimi3435/ai-coding-template-ja/issues/50)、[#51 repository contract validator](https://github.com/shimi3435/ai-coding-template-ja/issues/51)、[#52 Node installer / bootstrap fixture](https://github.com/shimi3435/ai-coding-template-ja/issues/52)。
    - 未検証: 実agent sessionによるpreflight実行、pre-merge close、post-merge updater再構成は明示的out-of-scope。

- [x] 9. PR code-reviewのpreflight spec-hole・検証証跡・rename-smoke findingsを解消する
  - **成果:** task 0件、対象path重複、Unicode・空白pathをfail-closedな静的contractで定義し、fresh検証証跡と改名後format checkを再現可能にする。
  - **依存:** Task 1〜8。
  - **対象:** `AGENTS.md`、`.agents/skills/execute-openspec-change/SKILL.md`、`.agents/skills/verify-change/SKILL.md`、`.agents/skills/skills.lock.json`、`openspec/changes/externalize-gsd-from-core/design.md`、`openspec/changes/externalize-gsd-from-core/specs/openspec-direct-workflow/spec.md`、`openspec/changes/externalize-gsd-from-core/tasks.md`、`docs/agents/workflow.md`、`tests/fixtures/execute_openspec_change/cases.json`、`tests/test_execute_openspec_change_skill.py`、`tests/test_openspec_direct_workflow_contract.py`、`tests/test_removed_handoff_contract.py`、`tests/test_review_convergence_contract.py`、`tests/test_skills_lock.py`、`tests/test_tool_neutral_documentation_contract.py`。
  - [x] 9.1 実装: task 0件を拒否し、重複対象pathを推移依存で順序化し、対象pathのMarkdown code span exact表記を検証するpreflight contractを同期する。
    - 仕様判断承認: 利用者が`/grilling`でOSWF-4をstatic skill / instruction fixturesへ修正し、runtime parserを追加せず、実agent preflightをmanual / out-of-scopeにする方針を選択後、共有方針を確定した。
  - [x] 9.2 実装: fresh実行とgreen evidence再利用の証跡境界、self-review、Issue事前承認を記録し、rename後もruff format結果が変わらないtest構造へ修正する。
    - TDD証跡: empty task list、推移依存の有無、Unicode・空白code span、active tasksのexact target path、rename後format seamを修正前に個別RED、実装後にGREEN化した。
    - rename-smoke証跡: source commit `62b192fb9270a482a6393d27cd5838c8b5afa560`、fresh実行、旧green evidence再利用なし。`git archive 62b192f`へ`git diff --binary 62b192f`を適用した一時Git repositoryで`npm ci --ignore-scripts`、`python scripts/rename-package.py ci_rename_smoke --apply`、`task check`を順次実行 → Node 42 / pytest 191 passed、ruff format 20 files。package path式とhistorical template slugを名称長・rename置換から独立させ、元repositoryは無変更。
    - self-review: `origin/main...HEAD`と現fix diff、staged / unstaged / untracked、spec-hole対応、Task 9状態を照合。既存tasksの非path対象略記とTask 9対象2 paths欠落を修正。残存する明白な欠陥なし。重複test helperはtest独立性を保つstyle nitとしてdismiss。
  - [x] 9.3 検証: focused contract tests、rename-smoke相当、finding元diff review、最新入力のproject checks、fresh final reviewer、別の独立verifierを完了する。
    - 利用者追加承認: `/grilling`でfinding元diff review → latest checks → fresh final reviewer → 別verifierを本change限りの追加reviewとして明示選択した。OSWF-5の恒久topologyを変更せず、必須verifierを置換しない。
    - finding元diff review: Spec 4 findingsとStandards 4 findingsを解消。static verification mapping、preflight 3 holes、self-review、evidence境界、Issue事前承認、rename-smokeを照合し、残存blocker / major 0。重複test helperはdismiss。
    - fresh final reviewer: evidence owner同期のblockerをRED contract testから修正し、diff reviewで残存blocker / major / 新規finding 0。恒久topologyと本change限りの追加review境界も整合。
    - fresh project checks: source commit `62b192fb9270a482a6393d27cd5838c8b5afa560`、旧green evidence再利用なし。`uv run pytest tests/test_execute_openspec_change_skill.py tests/test_openspec_direct_workflow_contract.py tests/test_review_convergence_contract.py tests/test_removed_handoff_contract.py tests/test_skills_lock.py tests/test_tool_neutral_documentation_contract.py -q` → 71 passed。Node 24.14.1 / Python 3.14.6で`task check:isolated` → Node 42 / pytest 191 passed、`task openspec:validate` → 1 passed / 0 failed、`task check` → Node 42 / pytest 191 passed。checkbox / evidence更新後も同focused、OpenSpec、project checkをfinal rerunして同結果。
    - 独立verifier: blocker / major / nit 0。source commit `62b192fb9270a482a6393d27cd5838c8b5afa560`、fresh実行、旧green evidence再利用なし。focused 71、project / isolated Node 42 + pytest 191、OpenSpec 1/1、rename後full check Node 42 + pytest 191、`task doctor` exit 0 / FAIL 0、skill SHA lock一致、diff checks green、staged / untracked 0。
    - 未検証: 実agent sessionによるpreflight実行は利用者承認済みmanual / out-of-scope。pre-merge closeとpost-merge updater再構成は明示的follow-up / out-of-scope。

## Post-merge Follow-up

本 change の merge 後、`add-deterministic-skill-updater` を最新 `main` から再構成する。GSD planning artifacts と source-pinned handoffは移植せず、有用な実装順序だけを同 change の詳細 `tasks.md` へ移し、`spec-holes` と OpenSpec validation を再実行する。同changeの最初のmigration taskには、`.planning/`を移植しない実装checkboxと、再構成後のtracked treeに`.planning/`が存在しないことを確認する検証checkboxを置く。

pre-merge closeでは本change directoryを削除し、最終残存allowlistがSuperseded ADRとv2 release notesだけになることを確認する。
