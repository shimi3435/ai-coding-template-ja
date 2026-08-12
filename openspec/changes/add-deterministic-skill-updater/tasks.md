## Execution Constraints

- **最初の CI parity:** Task 2 の source / lock decoder、canonical JSON / path / hash、SemVer / YAML parser vertical slice 完了直後、Node.js 24 で focused Node tests、`node_modules/.bin/tsc --noEmit`、最新入力の `task check` を実行する。全実装完了後まで環境・dependency・lockfile不整合を持ち越さない。
- **停止・再計画条件:** private repository、GitLab、archive、history rewrite override、local patch、追加 external write、新しい trust boundary、承認済み3 packages以外の dependencyまたはversion変更、公開 schema / command / status / exit semanticsの変更、multi-path OS-level atomicity要求、独立出荷可能な成果追加、一つのPRで複数active changes、その他の仕様判断またはmaterial expansionが必要なら、完了済みcheckboxを保持して利用者承認まで停止する。
- **一時 artifact cleanup:** `.agents/skills/.skill-updater-txn/`、test repository、fake `gh` transcript生成物、coverage、debug logは追跡せず、正常完了または証明済みrollback後に削除する。OpenSpec change directoryはpre-merge closeまで保持し、`.planning/`、GSD artifacts、source-pinned handoff metadataを作成・移行しない。

## Tasks

- [ ] 1. Migration baseline と planning 境界を固定する
  - **成果:** 最新 `main` 由来 branch の tracked treeとbranch diffに旧 `.planning/`、GSD planning artifacts、handoffが存在しないことを最初に証明し、現行 lock全entryとH1〜H11 / 補助casesを移行入力として棚卸しする。ignored local cacheは移行・削除しない。
  - **依存:** なし。
  - **対象:**
    - `.agents/skills/skills.lock.json`
    - `tests/test_skills_upstream_check.py`
    - `openspec/changes/add-deterministic-skill-updater/tasks.md`
  - [ ] **実装 checkbox:** `git ls-files -- .planning` と `git diff --name-only origin/main...HEAD -- .planning` が空、active changeが本changeだけ、旧planning/handoff fileがbranch diffにないことを確認し、lock entry数・identity fields・H1〜H11 / 補助case一覧を後続migration testsの入力として記録する。
  - [ ] **検証 checkbox:** 上記read-only commandsをfresh実行し、`.planning/` tracked / migrated 0件、active change exactly one、現行lock inventoryとlegacy test IDsの欠落0件を確認する。command、結果、source commit、fresh実行であることだけを本task直下へ記録する。

- [ ] 2. Deterministic local foundation をTDDで作る
  - **成果:** exact pinned parsers、source / lock decoder、ownership variants、variant別legal mapping、license / redistribution policy、canonical JSON / path / final installed tree hash、SKILL metadata、resource boundariesをpure foundationとして実装し、golden bytesとdeterministic property matrixで固定する。
  - **依存:** Task 1。
  - **対象:**
    - `package.json`
    - `package-lock.json`
    - `repo-tools/skill-updater/`
    - `repo-tools/skill-updater-foundation.test.ts`
    - `repo-tools/fixtures/skill-updater/`
    - `openspec/changes/add-deterministic-skill-updater/tasks.md`
  - [ ] **実装 checkbox:** failing testsを先に追加し、`semver@7.8.5`、`yaml@2.9.0`、`@types/semver@7.8.0`、schema v1 decoders、plugin target禁止、remote target legal / local repository-level legal variants、license / redistribution exact-copyとblocked policy、canonical serializer、u64-BE tree frame、legal overlapの同bytes重複排除 / 異bytes拒否、path collision、metadata / legal hash、limit validationを最小実装する。
  - [ ] **検証 checkbox:** focused Node tests、`node_modules/.bin/tsc --noEmit`、最新入力の`task check`をNode.js 24でfresh実行し、最初のCI parityを成立させる。dependency / lockfile差分とlifecycle scriptsの有無もreviewする。

- [ ] 3. GitHub observation と ref policy を実装する
  - **成果:** injected runnerを境界に、public visibility、explicit ref、fast-forward、SemVer tags、complete subtree / legal blobsを一つのimmutable cohort observationへ変換する。credential非露出と全resource limitsをfail-closedにする。
  - **依存:** Task 2。
  - **対象:**
    - `repo-tools/skill-updater/`
    - `repo-tools/skill-updater-github.test.ts`
    - `repo-tools/fixtures/skill-updater/`
    - `openspec/changes/add-deterministic-skill-updater/tasks.md`
  - [ ] **実装 checkbox:** fake `gh` RED testsから開始し、visibility、branch / commit / SemVer resolution、locked tag移動・削除とdowngradeを含むhistory rewrite拒否、pagination completeness、special file、legal、warning verification state、credential redactionを実装する。
  - [ ] **検証 checkbox:** fake transcript integration tests、foundation regression tests、typecheckをfresh実行し、networkなしでsuccess / malformed / timeout / rate-limit / partial pagination / rewrite casesを確認する。

- [ ] 4. Immutable plan と read-only command routes を接続する
  - **成果:** sources / lock / installed / remote observationsからexpected-before / candidate-after lock chainを持つcanonical cohort planと、全local entriesの単一lock-only planを一度だけ構築し、`skills:verify`、`skills:check`、`skills:update` dry-run、`skills:lock-local` dry-run、stable human / JSON output、exit 0 / 3 / 1へ接続する。
  - **依存:** Task 3。
  - **対象:**
    - `repo-tools/skill-updater/`
    - `repo-tools/cli.ts`
    - `repo-tools/entrypoint.mjs`
    - `repo-tools/entrypoint.test.ts`
    - `repo-tools/skill-updater-planner.test.ts`
    - `openspec/changes/add-deterministic-skill-updater/tasks.md`
  - [ ] **実装 checkbox:** cohort collision、canonical ordering、連鎖lock digest、全local target / repository-level legal / expected-before lockのfresh inputsを固定するlock-only plan、no-content-change、warning / error coexistence、unknown options、JSON schema、dry-run no-writeをRED testsから実装する。
  - [ ] **検証 checkbox:** planner / CLI focused tests、before / after filesystem digest probe、typecheckをfresh実行し、read-only commandsがrepositoryとlockを変更しないことを確認する。

- [ ] 5. Recoverable transaction と ownership-specific mutation を実装する
  - **成果:** dirty / per-step freshness guards、exclusive same-filesystem transaction root、staging reread、target-first / lock-last replacement、reverse rollback、runtime failure後の即停止 / not-attempted、unknown stop、全local entries一括lock-only transaction、symlink links routeを接続する。
  - **依存:** Task 4。
  - **対象:**
    - `.gitignore`
    - `repo-tools/skill-updater/`
    - `repo-tools/skill-updater-transaction.test.ts`
    - `scripts/setup-skills.sh`
    - `tests/test_setup_skills.py`
    - `openspec/changes/add-deterministic-skill-updater/tasks.md`
  - [ ] **実装 checkbox:** I/O transition failure injection testsを先に追加し、managed / unrelated dirty matrix、cohort別expected-before freshness、concurrent apply、applied / rolled-back / unknown / not-attempted、失敗後即停止、残存manifest拒否、`skills:lock-local`の全local一括freshness / 単一lock置換 / rollback / partial update禁止、`skills:links`を実装する。
  - [ ] **検証 checkbox:** temporary repositoryのremote cohort / local lock-only transaction tests、setup-skills regression tests、typecheck、同一filesystem safe dry-run / apply smokeをfresh実行し、stale local input、lock置換failure、rollback failureを含む各失敗点のpost-state digestとentry欠落0件を確認する。

- [ ] 6. 全entry migration、legacy parity、offline cutover を完了する
  - **成果:** 現行lock全entryをnew sources / generated lockへ一対一移行し、H1〜H11と補助casesをNode testsへ対応付ける。全gate成立後だけlegacy checker / test / commandを削除し、new command docsとoffline `task check`へ切り替える。
  - **依存:** Task 5。
  - **対象:**
    - `.agents/skills/skills.sources.json`
    - `.agents/skills/skills.lock.json`
    - `repo-tools/skill-updater-migration.test.ts`
    - `repo-tools/repository-contracts.ts`
    - `repo-tools/repository-contracts.test.ts`
    - `scripts/skills-upstream-check.py`
    - `tests/test_skills_upstream_check.py`
    - `tests/test_skills_lock.py`
    - `Taskfile.yml`
    - `README.md`
    - `docs/agents/workflow.md`
    - `docs/agents/safety.md`
    - `docs/template/release.md`
    - `openspec/changes/add-deterministic-skill-updater/tasks.md`
  - [ ] **実装 checkbox:** inventory bijection、canonical metadata、installed integrity、現行local 4 entriesが共有root `LICENSE`をrepository-level legal sourceとして保持しtargetへ複製しないmigration fixtures、H1〜H11 / supplemental parity、legacy residual scanをRED testsで成立させ、そのgreen evidence後にのみPython checker、旧test、`skills:upstream`を削除する。`skills:update`旧semanticsとaliasを残さない。
  - [ ] **検証 checkbox:** migration / repository contract / CLI tests、`task skills:verify`、`task check:isolated`、最新入力の`task check`をfresh実行し、network / `gh`なしの通常check、legacy残存0件、全entry欠落0件を確認する。

- [ ] 7. Self-review、OSWF-5 convergence、final validation を完了する
  - **成果:** 全requirements / scenarios / spec-holesをimplementation / testsへ対応付け、self-review、OSWF-5のinitial independent review、finding修正、最新project checks、別verifierを順番どおり完了し、pre-merge close可能な状態にする。
  - **依存:** Task 6。
  - **対象:**
    - `.agents/skills/`
    - `repo-tools/skill-updater/`
    - `repo-tools/cli.ts`
    - `repo-tools/entrypoint.mjs`
    - `package.json`
    - `package-lock.json`
    - `scripts/`
    - `tests/`
    - `Taskfile.yml`
    - `README.md`
    - `docs/`
    - `openspec/changes/add-deterministic-skill-updater/`
  - [ ] **実装 checkbox:** spec / test trace、diff、scopeと`AGENTS.md`のOSWF-5対象リスクをself-reviewし、OSWF-5 findingsを最大3 iterationsのfix→focused validation→diff reviewで解消し、retrospectiveをclose前に記録する。
  - [ ] **検証 checkbox:** strict target OpenSpec validation、`task openspec:validate`、focused transaction / migration tests、最新入力の`task check`、initial reviewerと別のverifierをfresh inputsで完了する。全checkbox green後だけ別の明示作業でchange directoryを削除し、active change 0を再検証する。
