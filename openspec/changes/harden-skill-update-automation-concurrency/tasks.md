## Execution Constraints

1. **最初の CI parity:** Task 1最初のjournal codec vertical slice後、Node 24 focused test、typecheck、`uv run --no-sync task check`を実行する。green前にproduction write pathへ進まない。
2. **停止・再計画条件:** v1 migration、追加credential、permission拡大、comment update/delete、closed issue reopen、仕様外external write、またはreal GitHub writeが必要になった時点で停止する。real writeはread-only preview後のfresh approvalまで禁止する。
3. **一時 artifact cleanup:** 各task終了時、test repository、bare remote、bundle、artifact download、smoke stateを削除し、残存を検査する。change close前にOpenSpec一時artifactを削除する。

## Tasks

### Task 1: canonical comment journal v2 modelをTDDで作る

- **成果:** immutable root、creator numeric user ID、full snapshot、digest chain、prepared / committedを表すexact codecとreducer。
- **依存:** なし。
- **対象:**
  - `repo-tools/skill-update-automation/model/journal.ts`
  - `repo-tools/skill-update-automation/model/journal.test.ts`
  - `repo-tools/skill-update-automation/model/pr.ts`
  - `repo-tools/skill-update-automation/model/pr.test.ts`
  - `repo-tools/skill-update-automation/model/issue.ts`
  - `repo-tools/skill-update-automation/model/issue.test.ts`
- [x] **実装:** RED testsからroot / entry v2 codec、full snapshot digest、author / timestamp / sequence / previous digest検証、tamper / detectable missing / fork / foreign marker fail-closed、v1 conflictを実装する。
- [x] **検証:** model focused tests、roundtrip / noncanonical / boundary fixtures、typecheck、最初のNode 24 CI parityをgreenにする。
  - `node --test repo-tools/skill-update-automation/model/*.test.ts`: 30 tests passed、exit 0。source commit `d2ab38d4cddcd922d984a1e7a8555aac9fb6037a`、Node 24、最新Task 1入力のfresh実行。
  - `npm run typecheck`: exit 0。同source commit、Node 24、fresh実行。
  - `uv run --no-sync task check`: root Node 160 tests、automation 184 tests、pytest 152 tests、contracts / typecheck / ruff / basedpyright全green、exit 0。同source commit、Node 24、最初のCI parity fresh実行。

### Task 2: production branch / comment adapterをTDDでCAS化する

- **成果:** explicit lease create / append / delete、paginated comment read、comment append-only adapter。
- **依存:** Task 1。
- **対象:**
  - `repo-tools/skill-update-automation/github/adapter.ts`
  - `repo-tools/skill-update-automation/publish/production-adapter.ts`
  - `repo-tools/skill-update-automation/publish/production-adapter.test.ts`
  - `repo-tools/skill-update-automation/publish/workflow.test.ts`
- [x] **実装:** race RED testsから空expect create、exact SHA append / delete、numeric author / created / updated comment取得、comment createを実装する。body update禁止はcall site移行を担うTask 3 / 4で完了する。
- [x] **検証:** command runner focused testsでcheck後race時remote不変、bare lease禁止、pagination、partial responseをgreenにする。
  - `node --test repo-tools/skill-update-automation/publish/production-adapter.test.ts`: 7 tests passed、exit 0。source commit `d2ab38d4cddcd922d984a1e7a8555aac9fb6037a`、Node 24、latest Task 2入力のfresh実行。
  - `npm run typecheck`: exit 0。同source commit、Node 24、fresh実行。
  - `uv run --no-sync task check`: root Node 160 tests、automation 187 tests、pytest 152 tests、contracts / typecheck / ruff / basedpyright全green、exit 0。同source commit、Node 24、latest Task 2入力のfresh実行。

### Task 3: draft publish protocolをTDDでjournal v2へ移す

- **成果:** immutable PR root作成、branch appendとdraft mutationのprepared / mutation / committed protocol、crash recovery。
- **依存:** Task 1、Task 2。
- **対象:**
  - `repo-tools/skill-update-automation/publish/draft.ts`
  - `repo-tools/skill-update-automation/publish/draft.test.ts`
  - `repo-tools/skill-update-automation/publish/pr-journal.ts`
  - `repo-tools/skill-update-automation/publish/command.ts`
  - `repo-tools/skill-update-automation/publish/command.test.ts`
  - `repo-tools/skill-update-automation/publish/workflow.test.ts`
  - `repo-tools/skill-update-automation/candidate/history.ts`
  - `repo-tools/skill-update-automation/candidate/index.test.ts`
  - `repo-tools/skill-update-automation/github/discovery.ts`
  - `repo-tools/skill-update-automation/github/discovery.test.ts`
  - `repo-tools/skill-update-automation/github/fake-adapter.ts`
  - `repo-tools/skill-update-automation/model/pr.ts`
  - `repo-tools/skill-update-automation/model/pr.test.ts`
  - `repo-tools/skill-update-automation/model/journal.ts`
  - `repo-tools/skill-update-automation/model/journal.test.ts`
  - `.github/workflows/skill-update-prs.yml`
- [x] **実装:** one-slice RED testsからnew root、append、ready-to-draft、末尾preparedのbefore / after / divergent recoveryを実装する。
- [x] **検証:** publish focused testsでbody immutable、exact operation ID、entry順、mutation拒否時未committedをgreenにする。
  - **Resolved decision (2026-08-27):** 利用者選択により保証を限定。中間欠落、fork、edit、foreign author、live state不一致はfail closed。state-only末尾suffix全削除は検出不能と正本へ明記し、anchor refは追加しない。
  - `node --test repo-tools/skill-update-automation/model/journal.test.ts repo-tools/skill-update-automation/model/pr.test.ts repo-tools/skill-update-automation/candidate/index.test.ts repo-tools/skill-update-automation/github/discovery.test.ts repo-tools/skill-update-automation/github/fake-adapter.test.ts repo-tools/skill-update-automation/publish/draft.test.ts repo-tools/skill-update-automation/publish/command.test.ts repo-tools/skill-update-automation/publish/production-adapter.test.ts repo-tools/skill-update-automation/publish/workflow.test.ts`: 63 tests passed、exit 0。source commit `10793b5aa64683a6b3ff220acae4f2001a0cbd70` + current worktree diff、Node 24.14.1、latest Task 3入力のfresh実行。
  - `npm run typecheck`: exit 0。同source、Node 24.14.1、fresh実行。
  - `git diff --check`: exit 0。同source、fresh実行。

### Task 4: finalize / issue lifecycleをTDDでjournal v2へ移す

- **成果:** PR ready protocol、failure journal、closed issue terminal、新failure新issue、cleanup failure記録。
- **依存:** Task 3。
- **対象:**
  - `repo-tools/skill-update-automation/finalize/`
  - `repo-tools/skill-update-automation/github/issue-discovery.ts`
  - `repo-tools/skill-update-automation/github/issue-discovery.test.ts`
  - `repo-tools/skill-update-automation/github/issue-reducer.ts`
  - `repo-tools/skill-update-automation/github/issue-reducer.test.ts`
  - `repo-tools/skill-update-automation/github/fake-adapter.ts`
  - `repo-tools/skill-update-automation/publish/production-adapter.ts`
  - `repo-tools/skill-update-automation/publish/pr-journal.ts`
  - `repo-tools/skill-update-automation/model/issue.ts`
  - `repo-tools/skill-update-automation/model/issue.test.ts`
- [x] **実装:** RED testsからready prepared protocol、open issue append、closed issue不変＋new issue、conflict時issue-only fail-closedを実装する。
- [x] **検証:** finalize / issue focused testsでno reopen、body immutable、journal tamper、recovery、dedupeをgreenにする。
  - `node --test repo-tools/skill-update-automation/model/issue.test.ts repo-tools/skill-update-automation/github/issue-discovery.test.ts repo-tools/skill-update-automation/github/issue-reducer.test.ts repo-tools/skill-update-automation/finalize/*.test.ts repo-tools/skill-update-automation/publish/production-adapter.test.ts`: 61 tests passed、exit 0。source commit `10793b5aa64683a6b3ff220acae4f2001a0cbd70` + current worktree diff、Node 24.14.1、latest Task 4入力のfresh実行。
  - `npm run typecheck`: exit 0。同source、Node 24.14.1、fresh実行。
  - `git diff --check`: exit 0。同source、fresh実行。
  - self-review: issue create response loss時のcommentless root回復にresource author照合を追加し、Issue body race時のappendを事前拒否。各RED testと上記focused validationでgreen。workflowのfinalize creator ID配線はTask 5 topology変更と同時に検証する。

### Task 5: cleanup-mergedを独立workflow jobへ分離する

- **成果:** candidate-update / existing-head-validation / no-op全eligible runで動くleast-privilege cleanup job。
- **依存:** Task 2、Task 4。
- **対象:**
  - `.github/workflows/skill-update-prs.yml`
  - `repo-tools/skill-update-automation/workflow/cleanup.ts`
  - `repo-tools/skill-update-automation/workflow/cleanup.test.ts`
  - `repo-tools/skill-update-automation/publish/workflow.test.ts`
  - `repo-tools/skill-update-automation/finalize/workflow.test.ts`
  - `repo-tools/skill-update-automation/finalize/recovery.ts`
  - `repo-tools/skill-update-automation/finalize/recovery.test.ts`
  - `repo-tools/skill-update-automation/finalize/cleanup-command.ts`
  - `repo-tools/skill-update-automation/finalize/detection-command.ts`
  - `repo-tools/skill-update-automation/finalize/detection-command.test.ts`
  - `repo-tools/skill-update-automation/finalize/detection-failure.ts`
  - `repo-tools/skill-update-automation/finalize/detection-failure.test.ts`
- [x] **実装:** workflow contract RED testsから独立job、artifact-kind全variant、fresh discovery、CAS delete、failure journal wiringを実装する。
- [x] **検証:** no-op retry、existing-head retry、candidate publish skip / failure時cleanup、permission topology、forbidden path absenceをgreenにする。
  - `node --test repo-tools/skill-update-automation/workflow/cleanup.test.ts repo-tools/skill-update-automation/finalize/recovery.test.ts repo-tools/skill-update-automation/finalize/detection-command.test.ts repo-tools/skill-update-automation/finalize/detection-failure.test.ts repo-tools/skill-update-automation/publish/workflow.test.ts repo-tools/skill-update-automation/finalize/workflow.test.ts repo-tools/skill-update-automation/finalize/command.test.ts repo-tools/skill-update-automation/publish/production-adapter.test.ts`: 36 tests passed、exit 0。source commit `10793b5aa64683a6b3ff220acae4f2001a0cbd70` + current worktree diff、Node 24.14.1、latest Task 5入力のfresh実行。
  - `npm run typecheck`: exit 0。同source、Node 24.14.1、fresh実行。
  - `git diff --check`: exit 0。同source、fresh実行。
  - self-review: cleanup jobを`publish-draft`完了後に`always()`で起動し、publish成功可否と分離した。cleanup evidence欠落、cancel、矛盾をfail-closed parserで固定し、no-op failure journalと次回resolveをRED→greenで確認した。

### Task 6: fresh schema v2 smokeをTDDで作る

- **成果:** fresh repository precondition、v2 root / journal、prepared protocol、CAS、terminal cleanupを束縛するpreview / execution。
- **依存:** Task 5。
- **対象:**
  - `repo-tools/skill-update-automation/smoke/`
  - `repo-tools/skill-update-automation/model/smoke-resource.ts`
  - `repo-tools/skill-update-automation/model/smoke-step.ts`
  - `repo-tools/skill-update-automation/model/smoke.test.ts`
  - `repo-tools/skill-update-automation/smoke/fresh-v2.ts`
  - `repo-tools/skill-update-automation/smoke/fresh-v2.test.ts`
  - `repo-tools/skill-update-automation/smoke/fresh-cli.ts`
  - `repo-tools/skill-update-automation/smoke/execution.ts`
  - `repo-tools/cli.ts`
- [x] **実装:** RED testsからfresh repo guard、comment resources、creator ID、v2 operation plan、preview digest、same-process approval、recovery / cleanupを実装する。
- [x] **検証:** fake hostで未承認write 0、v1 resource拒否、stale preview拒否、全state chainとterminal cleanupをgreenにする。real GitHub writeは未実行のままfresh approvalで停止する。
  - `node --test repo-tools/skill-update-automation/model/smoke.test.ts repo-tools/skill-update-automation/smoke/*.test.ts`: 42 tests passed、exit 0。source commit `10793b5aa64683a6b3ff220acae4f2001a0cbd70` + current worktree diff、Node 24.14.1、latest Task 6入力のfresh実行。
  - `npm run typecheck`: exit 0。同source、Node 24.14.1、fresh実行。
  - `git diff --check`: exit 0。同source、fresh実行。
  - self-review: previewへfull snapshot comment template、repository / workflow run / source parent / creator identity、fresh live preconditionを束縛。synthetic response-lossでprepared recovery、closed issue不変、新issue世代、exact lease cleanupを確認。real GitHub writeは未実行。

### Task 7: public contractsと運用文書を更新する

- **成果:** v2 interface、独立cleanup、immutable body、closed issue lifecycle、fresh smoke runbookを公開contractへ同期する。
- **依存:** Task 6。
- **対象:**
  - `repo-tools/repository-contracts.ts`
  - `repo-tools/repository-contracts.test.ts`
  - `docs/guide.md`
  - `docs/agents/safety.md`
  - `README.md`
- [x] **実装:** contract RED testsからworkflow / schema /禁止操作を固定し、通常日本語でrunbookを更新する。
- [x] **検証:** focused contract tests、docs / code / workflow整合、secret / prohibited command scanをgreenにする。
  - `node --test repo-tools/repository-contracts.test.ts repo-tools/skill-update-automation/github/fake-adapter.test.ts repo-tools/skill-update-automation/publish/production-adapter.test.ts repo-tools/skill-update-automation/publish/workflow.test.ts repo-tools/skill-update-automation/finalize/workflow.test.ts repo-tools/skill-update-automation/workflow/cleanup.test.ts`: 60 tests passed、exit 0。source commit `10793b5aa64683a6b3ff220acae4f2001a0cbd70` + current worktree diff、Node 24.14.1、latest Task 7入力のfresh実行。
  - `npm run typecheck`: exit 0。同source、Node 24.14.1、fresh実行。
  - `git diff --check`: exit 0。同source、fresh実行。
  - prohibited scan: production sourceに`managedSection`、`updateIssue`、`reopenIssue`、body / closed issue operation labelなし。workflow / automation / docsにPAT名、merge / auto-merge、rebase、bare force pushなし。exit 0。同source、fresh実行。

### Task 8: self-review、project check、独立review / verifierを完了する

- **成果:** OSWF-5 convergence evidenceとfresh approval直前の安全な停止点。
- **依存:** Task 7。
- **対象:**
  - `openspec/changes/harden-skill-update-automation-concurrency/tasks.md`
- [x] **実装:** 全diff self-review、spec-holes対応照合、initial independent review、blocker finding修正を最大3 iterationsで完了する。
- [x] **検証:** Node 24 focused tests、最新入力の`uv run --no-sync task check`、strict OpenSpec validation、initial reviewerと別verifierをgreenにする。real GitHub writeはread-only previewとfresh approvalまで未完了として保持する。
  - initial independent review iteration 1: PR / Issue write直前race、creator束縛、lease rejection後read、cleanup creator、public reopen surfaceを検出。focused fix、tests、diff reviewを実施。
  - `node --test repo-tools/skill-update-automation/**/*.test.ts`: 212 tests passed、exit 0。source commit `10793b5aa64683a6b3ff220acae4f2001a0cbd70` + current worktree diff、Node 24.14.1、latest review fix入力のfresh実行。
  - `npm run typecheck`: exit 0。同source、Node 24.14.1、fresh実行。
  - `openspec validate harden-skill-update-automation-concurrency --strict`: exit 0。同source、fresh実行。
  - `git diff --check`: exit 0。同source、fresh実行。
  - **Resolved decision (2026-08-27):** Issue closed保証は最終pre-write read境界とする。closedならappendせず1回限定rediscovery、新Issue作成。read後の人手close raceはconditional comment API不在による検出保証外としてdesign / spec-holesへ明記。
  - **Resolved decision (2026-08-27):** smokeはfresh approval後の人手merge checkpointを採用。CLIがmerged stateをfresh検証して`cleanupMergedBranches`を実行する。interruption後はresidual identity / journal digest / exact SHAを束縛したterminal-only recovery previewと別fresh approvalを要求する。
  - final independent verifier cycle 1: `repo-tools/skill-update-automation/finalize/recovery.ts`のaggregate cleanupがunmanaged human merged PRも`intervention-required`として全cleanupを停止するblockerを検出。Node 24 automation 221 tests、contracts 34 tests、typecheck、strict OpenSpec、`git diff --check`、full `task check`はgreenだが、verifier blockerのためOSWF-5 soft stop。利用者承認後の新cycleでunmanaged PR skipのRED test、修正、独立review、project checks、cycle 1と別verifierを実行する。real GitHub writeは未実行。
  - cycle 2 (2026-08-28): 利用者承認後、unmanaged human merged PRをskipするRED testを追加し、managed evidence判定をdiscovery / cleanupで共有。managed partial / v1 / malformed v2 / foreign creatorのfail-closedとstrict managed exact lease cleanupを維持した。focused 19 tests、typecheck、diff reviewはgreen。cycle 2 independent code reviewはblocker / High / Medium findingなし。
  - `uv run --no-sync task check`: root Node 161 tests、automation 222 tests、pytest 152 tests、contracts / typecheck / ruff / basedpyright全green、exit 0。source commit `10793b5aa64683a6b3ff220acae4f2001a0cbd70` + current worktree diff、Node 24.14.1、cycle 2 latest入力のfresh実行。
  - `openspec validate harden-skill-update-automation-concurrency --strict`: valid、exit 0。同source、cycle 2 latest入力のfresh実行。
  - cycle 2 final independent verifier（cycle 1 / initial reviewerと別agent）: PASS、blockerなし。cleanup focused 15 tests、automation 222 tests、contracts 34 tests、typecheck、strict OpenSpec、`git diff --check`全green。real GitHub writeは未実行、real-host smokeだけfresh approval待ち。
  - fresh smoke setup (2026-08-28): 利用者のsetup write承認後、`shimi3435/ai-coding-template-ja-test`のexact main `5eb2613aa4e574686591a17fac7ca4e1dc2e3066`をparent / same treeとするempty commit `8dbf23933948219d6ffaee79d0f05472547ab020`、source branch `smoke/skill-update-v2-20260828`、workflow run `33090426859` attempt 1を作成した。事前readでPR / Issue 0件、auto-delete false、production automation不在、target branch不在を確認。source relationはahead 1 / behind 0。CLIをEOFで実行しschema v2 read-only previewを生成、exit 2、smoke resource write 0件。workflow run自体のconclusionはfailureだが、CLIのrepository / run / source identity検証は通過。real-host smoke executionはfresh in-process approval待ち。
  - fresh smoke setup correction (2026-08-28): 初回executionはmanaged branchをdefault branchと同じ`5eb2613aa4e574686591a17fac7ca4e1dc2e3066`へ作成後、差分のないdraft PR createをGitHubがHTTP 422で拒否した。PR / Issue writeは0件、residual managed branch 1件をexact leaseで削除した。
  - 利用者の新しいsetup write承認後、初回source commit `8dbf23933948219d6ffaee79d0f05472547ab020`をparentとするsecond empty commit `a74b8e007eb1136b54d6d7ceea6760a9fe5778e3`を作成し、source branchをexact leaseで更新、workflow run `33093011548` attempt 1をdispatchした。mainからsourceはahead 2 / behind 0、source parentは`8dbf23933948219d6ffaee79d0f05472547ab020`、PR / Issue / managed branchは0件、auto-delete false。新しい入力のCLI read-only previewはexit 2、write 0件。workflow conclusionはfailureだがidentity検証は通過。real-host smoke executionは新しいfresh in-process approval待ち。
  - fresh smoke setup correction 2 (2026-08-28): empty initial commitはmainよりahead 1でもtreeが同一、changed files 0のためdraft PR createがHTTP 422になることをreal hostで確認した。旧入力によるresidual managed branch `5eb2613aa4e574686591a17fac7ca4e1dc2e3066`をexact leaseで削除し、PR / Issue 0件を確認した。
  - 利用者のsetup write再承認後、`smoke-fixture-v2.txt`を追加するinitial commit `87bda54c4a5b29d1ce4856a2136260fe6025228f`と、同fileを変更するcandidate commit `f7df3837bb9174dc29ab69dea29e9dcf97478301`を作成した。source branchを旧`a74b8e007eb1136b54d6d7ceea6760a9fe5778e3`からcandidateへexact lease更新し、workflow run `33093792728` attempt 1をdispatchした。main→initial、initial→candidateはいずれもahead 1 / behind 0 / changed files 1。PR / Issue / managed branchは0件、新入力のCLI read-only previewはexit 2、write 0件。workflow conclusionはfailureだがrepository / run / source identity検証は通過。real-host smoke executionは新しいfresh in-process approval待ち。

### Task 9: post-mutation GitHub projection lagをTDDで収束させる

- **成果:** exact mutation後のbranch after / PR before一時projectionを追加writeなしの有界read-only再取得でafterへ収束させ、未収束・divergent stateはfail closedにする。
- **依存:** Task 8。
- **対象:**
  - `openspec/changes/harden-skill-update-automation-concurrency/proposal.md`
  - `openspec/changes/harden-skill-update-automation-concurrency/design.md`
  - `openspec/changes/harden-skill-update-automation-concurrency/spec-holes.md`
  - `openspec/changes/harden-skill-update-automation-concurrency/specs/skill-update-pr-automation/spec.md`
  - `openspec/changes/harden-skill-update-automation-concurrency/tasks.md`
  - `repo-tools/skill-update-automation/publish/pr-journal.ts`
  - `repo-tools/skill-update-automation/publish/draft.test.ts`
  - `repo-tools/skill-update-automation/smoke/fresh-v2.test.ts`
- [x] **実装:** real-host failureと同じbranch append後PR head遅延をpublic smoke seamのRED testで固定し、exact before / after projectionだけを対象にbounded read-only stabilizationを実装する。
- [x] **検証:** focused publish / smoke tests、typecheck、strict OpenSpec、`git diff --check`をgreenにし、mutation再実行0回、committed 1回、未収束 / divergent fail-closedを確認する。
  - RED: `node --test --test-name-pattern='delayed pull request head projection' repo-tools/skill-update-automation/smoke/fresh-v2.test.ts`: `publish-draft stopped: recovery-required`、1 failed、exit 1。source commit `10793b5aa64683a6b3ff220acae4f2001a0cbd70` + current worktree diff、Node 24.14.1、real-host branch after / PR before patternのfresh実行。
  - GREEN: `node --test repo-tools/skill-update-automation/publish/draft.test.ts repo-tools/skill-update-automation/smoke/fresh-v2.test.ts`: 26 tests passed、exit 0。同source、Node 24.14.1、latest Task 9入力のfresh実行。PR headを3 reads staleにしてもbranch append 1回 / committed 1回、20 reads staleではprepared止まり / branch append 1回、既存divergent testもgreen。
  - `npm run typecheck`: exit 0。同source、Node 24.14.1、latest Task 9入力のfresh実行。
  - `openspec validate harden-skill-update-automation-concurrency --strict`: valid、exit 0。同source、latest Task 9入力のfresh実行。
  - `git diff --check`: exit 0。同source、latest Task 9入力のfresh実行。
  - initial independent review iteration 1: 再取得したPRが一度missingになった後の収束を許可するfail-openと、branch after観測後のbefore回帰を許可するfail-openをblockerとして検出。重複したprojection test proxyはMedium findingとして記録し、現在の修正scopeでは共通化しない。
  - review-fix RED: `node --test --test-name-pattern='disappears before converging|regresses to before' repo-tools/skill-update-automation/smoke/fresh-v2.test.ts`: 2 failed、exit 1。同source、Node 24.14.1、latest review finding入力のfresh実行。
  - review-fix GREEN: 同commandは2 tests passed、exit 0。PR missingを即時fail closed、branch after観測後のbefore / missing回帰をfail closedに固定した。
  - review-fix focused: `node --test repo-tools/skill-update-automation/publish/draft.test.ts repo-tools/skill-update-automation/smoke/fresh-v2.test.ts`: 28 tests passed、exit 0。同source、Node 24.14.1、latest review fix入力のfresh実行。
  - review-fix typecheck: `npm run typecheck`: exit 0。同source、Node 24.14.1、latest review fix入力のfresh実行。

### Task 10: projection lag修正cycleのreview / verifierを完了する

- **成果:** OSWF-5の新cycle evidenceと、別fresh repository real-host smoke直前の安全な停止点。
- **依存:** Task 9。
- **対象:**
  - `openspec/changes/harden-skill-update-automation-concurrency/tasks.md`
- [x] **実装:** 最新diffのself-review、initial independent review、blocker finding修正を最大3 iterationsで完了する。
- [x] **検証:** Node 24 focused tests、最新入力の`uv run --no-sync task check`、strict OpenSpec、initial reviewerと別verifierをgreenにする。current smoke repo terminal recoveryと別fresh repo writeはread-only preview後のfresh approvalまで禁止する。
  - self-review: mutation成功後はread-only再取得だけ、after未収束時はcommittedなし、mutation再実行なし、有界6 observations、exact before / after外はfail closedを確認。review前focused 28 tests、typecheck、strict OpenSpec、`git diff --check`はgreen。
  - initial independent review iteration 1: PR projection missingとbranch after観測後のbefore回帰をblocker 2件として検出。test proxy重複はMedium findingとして記録。
  - iteration 1 fix / diff review: blocker 2件をRED→greenで修正。初回reviewerがfocused 28 tests、typecheck、strict OpenSpec、`git diff --check`を再確認し、Blocker / High / Medium findingなしでPASS。test proxy共通化は最小scope判断で未実施。
  - `PATH=/home/shimi3435/.nvm/versions/node/v24.14.1/bin:$PATH uv run --no-sync task check`: exit 0。Node 24.14.1、repo-tools 161 tests、automation 227 tests、Python 152 tests、TypeScript typecheck、Ruff、basedpyright全green。source commit `10793b5aa64683a6b3ff220acae4f2001a0cbd70` + latest review fix worktree diffのfresh実行。
  - final independent verifier cycle 3: `recoverExactPreparedTransition`内の2回のstabilization間でbranch after観測履歴が失われ、最初のafter確定後にbranchがbeforeへ回帰しても、2回目のstabilizationがbeforeから再初期化して後続after収束をcommittedできるblockerを検出。focused 28 tests、automation 227 tests、contracts 34 tests、typecheck、strict OpenSpec、`git diff --check`はgreenだが、cross-call regression testが欠落し仕様違反を捕捉できていない。OSWF-5 soft stop。利用者承認後の新cycleでcross-call回帰RED test、観測履歴を保持する修正、独立review、project checks、cycle 3と別verifierを実行する。real GitHub writeは未実行。
  - terminal recovery execution (2026-08-28): 利用者がexact recovery preview digest `sha256:fd57340fa366f5720f5c2b595590bad2fc7b813f1b0989d469d2029df1abd72e`を同processで承認した。PR #1 closeは成功したが、terminal prepared `branch-append` journalを持つclosed PRをaggregate cleanup discoveryが`pr-identity-conflict`と分類し、`cleanupMergedBranches`が`stopped`を返したためbranch delete前にexit 1。residual branchはexact `f7df3837bb9174dc29ab69dea29e9dcf97478301`、PR #1はclosed、comments 2件とIssue 0件は不変。新しいread-only recovery previewはbranch exact delete 1件、digest `sha256:a94a0ff7ed83d254f79259f2d38e32e48357fb27238f5963c6bf67fd0478b6d6`、EOFでexit 2、追加write 0件。write禁止adapterによるread-only診断でもdiscovery `pr-identity-conflict` / cleanup `stopped`を再現した。旧approvalは失効。新cycleでclosed terminal-prepared recoveryのRED testと、previewに束縛したexact branch deleteへ安全に到達する修正が必要。
  - next fresh smoke setup (2026-08-28): 利用者がprivate template repository `shimi3435/ai-coding-template-ja-smoke-v2-20260828`（repository ID `1349213360`）を作成した。default mainは`18d63e936a97f3e85a93d974fc8bb4ee4ed5a310`、validation baseは実file追加commit `3199e4dd9fa4255f7fad6d0f1a524b85c602cfc9`、sourceは同file変更commit `a1ffb43e865ffd3828163e81a10ca6d4b2d23e17`。source branchは`smoke/skill-update-v3-v2`。`extras-smoke.yml` run `33143140664` attempt 1はsource exact SHAへdispatch済み。Actions billing制約でstep開始前failureだがrun identityは取得可能。default branchにproduction `skill-update-prs.yml`は存在せず、merged branch auto-deleteはfalse、managed PR / Issue / `g900001` branchは0件。Dependabotのunmanaged PR 3件は存在する。real-host smoke writeはterminal recovery blocker修正、review gates、fresh read-only preview、fresh approvalまで未実行。
  - cycle 3 verifier blocker後の検証はTask 11〜14とcycle 5 review / verifierへ繰り越し、latest focused 74 tests、project checks、cycle 5別verifierのPASSで完了した。real-host writeはfresh approval待ちを維持する。

### Task 11: recovery correctness blockerをTDDで修正する

- **成果:** 同一recovery実行のstabilization phase間でbranch after観測証拠を保持し、terminal recoveryがpreview-bound residual branchだけをexact lease deleteできる。
- **依存:** Task 9。Task 10検証はverifier blockerによりTask 13へ繰り越す。
- **対象:**
  - `repo-tools/skill-update-automation/publish/pr-journal.ts`
  - `repo-tools/skill-update-automation/publish/draft.test.ts`
  - `repo-tools/skill-update-automation/smoke/fresh-v2.ts`
  - `repo-tools/skill-update-automation/smoke/fresh-v2.test.ts`
  - `openspec/changes/harden-skill-update-automation-concurrency/tasks.md`
- [x] **実装:** public recovery seamのRED testsで`C/C → B/B → C/C`をmutation 0 / committed 0に固定し、closed terminal-prepared PR＋exact residual branchのrecoveryをaggregate cleanupから分離して修正する。
- [x] **検証:** focused publish / smoke tests、typecheck、strict OpenSpec、`git diff --check`をgreenにし、normal aggregate cleanup契約が不変と確認する。
  - RED: `node --test --test-name-pattern='after-before-after|closed terminal-prepared' repo-tools/skill-update-automation/publish/draft.test.ts repo-tools/skill-update-automation/smoke/fresh-v2.test.ts`: 2 failed、exit 1。cross-phase回帰がcommittedされ、terminal recoveryが`fresh smoke recovery cleanup identityが不正です`で停止することを再現。source commit `10793b5aa64683a6b3ff220acae4f2001a0cbd70` + current worktree diff、Node 24.14.1、fresh実行。
  - GREEN / focused: `node --test repo-tools/skill-update-automation/publish/draft.test.ts repo-tools/skill-update-automation/smoke/fresh-v2.test.ts repo-tools/skill-update-automation/finalize/recovery.test.ts`: 39 tests passed、exit 0。同source、Node 24.14.1、latest Task 11入力のfresh実行。cross-phase回帰はmutation 0 / committed 0、terminal recoveryはclose後にpreview-bound exact branch deleteだけを実行。normal aggregate cleanup testsもgreen。
  - `npm run typecheck`: exit 0。同source、Node 24.14.1、fresh実行。
  - `openspec validate harden-skill-update-automation-concurrency --strict`: valid、exit 0。同source、fresh実行。
  - `git diff --check`: exit 0。同source、fresh実行。

### Task 12: recoverable immutable rootをTDDで強化する

- **成果:** canonical full initial snapshotを持つroot schemaと、creator / body未編集 / live exact一致に限定したcommentless PR / Issue回復。
- **依存:** Task 11。
- **対象:**
  - `repo-tools/skill-update-automation/model/pr.ts`
  - `repo-tools/skill-update-automation/model/pr.test.ts`
  - `repo-tools/skill-update-automation/model/issue.ts`
  - `repo-tools/skill-update-automation/model/issue.test.ts`
  - `repo-tools/skill-update-automation/github/discovery.ts`
  - `repo-tools/skill-update-automation/github/issue-discovery.ts`
  - `repo-tools/skill-update-automation/github/fake-adapter.ts`
  - `repo-tools/skill-update-automation/publish/production-adapter.ts`
  - `repo-tools/skill-update-automation/publish/pr-journal.ts`
  - `repo-tools/skill-update-automation/publish/draft.test.ts`
  - `repo-tools/skill-update-automation/finalize/issue-journal.ts`
  - `repo-tools/skill-update-automation/finalize/finalize.test.ts`
  - `repo-tools/skill-update-automation/smoke/fresh-v2.test.ts`
  - `openspec/changes/harden-skill-update-automation-concurrency/tasks.md`
- [x] **実装:** security matrix RED testsからroot full snapshot / digest一致、resource author numeric ID、`lastEditedAt === null`、fresh live exact一致、initial append response-loss fresh rereadを既存writer経路へ実装する。
- [x] **検証:** model / discovery / publish / finalize / smoke focused tests、typecheck、strict OpenSpec、`git diff --check`をgreenにする。fresh real-host smoke writeは未実行のまま保持する。
  - RED: root snapshot欠落 / digest不一致、PR / Issue resource metadata欠落、commentless recovery、initial append response lossのfocused testsを追加し、期待したschema / recovery failureを確認した。candidate jobがcommentless rootを常にidentity conflictへ落とすself-review findingもadapter metadata hydration testでREDにした。
  - GREEN / focused: `node --test repo-tools/skill-update-automation/candidate/index.test.ts repo-tools/skill-update-automation/github/discovery.test.ts repo-tools/skill-update-automation/model/pr.test.ts repo-tools/skill-update-automation/model/issue.test.ts repo-tools/skill-update-automation/publish/draft.test.ts repo-tools/skill-update-automation/publish/production-adapter.test.ts repo-tools/skill-update-automation/finalize/finalize.test.ts repo-tools/skill-update-automation/github/issue-discovery.test.ts repo-tools/skill-update-automation/smoke/fresh-v2.test.ts repo-tools/repository-contracts.test.ts`: 140 tests passed、exit 0。source commit `10793b5aa64683a6b3ff220acae4f2001a0cbd70` + current worktree diff、Node 24.14.1、latest Task 12入力のfresh実行。
  - `npm run typecheck`: exit 0。同source、Node 24.14.1、fresh実行。
  - `openspec validate harden-skill-update-automation-concurrency --strict`: valid、exit 0。同source、fresh実行。
  - `git diff --check`: exit 0。同source、fresh実行。

### Task 13: 修正cycleのreview / verifierを完了する

- **成果:** OSWF-5 convergence evidenceとreal-host recovery / fresh smoke直前の安全な停止点。
- **依存:** Task 11、Task 12、Task 14。
- **対象:**
  - `openspec/changes/harden-skill-update-automation-concurrency/tasks.md`
- [x] **実装:** 全diff self-review、initial independent review、blocker finding修正を最大3 iterationsで完了する。`fresh-v2.ts`分割とprojection test proxy共通化は別change候補として記録し、本changeでは実施しない。
- [x] **検証:** Node 24 focused tests、最新入力の`uv run --no-sync task check`、strict OpenSpec、initial reviewerとcycle 3とは別のindependent verifierをgreenにする。旧smoke terminal recoveryとfresh repo smokeはread-only preview後の各fresh approvalまで禁止する。
  - self-review: commentless rootの作成response lossが次workflowのcandidate discoveryで回復不能になるmetadata欠落を検出。REST numeric author IDと、commentless v2 rootだけを対象にしたGraphQL `lastEditedAt` hydrationを追加し、metadata取得不能時はfail closedを維持した。unused importと不明瞭なmetadata parserも整理した。
  - 別change候補: `smoke/fresh-v2.ts`の責務分割、projection test proxyの共通化。本changeでは実施しない。
  - initial independent review iteration 1: GitHub REST `GET /issues`に混在するPRへIssue GraphQLを実行して`null`で停止するblockerを検出。PRをGraphQL前に除外し、strict commentless v2 Issue rootだけをhydration対象に限定するRED testを追加して修正した。
  - iteration 1 diff review: blocker解消。marker-free human commentを物理comment数でjournal有りと誤判定するMedium findingを検出。
  - iteration 2 fix / final diff review: semantic journal reducerでcommentlessを判定し、通常commentを無視、foreign / malformed markerを後段fail closedに維持するRED testを追加して修正。focused 34 tests、typecheck、`git diff --check`はgreen。initial reviewerがBlocker / High / Medium残存なしでPASSした。
  - `PATH=/home/shimi3435/.nvm/versions/node/v24.14.1/bin:$PATH uv run --no-sync task check`: exit 0。Node 24.14.1、repo-tools 161 tests、automation 237 tests、Python 152 tests、TypeScript typecheck、Ruff、basedpyright全green。source commit `10793b5aa64683a6b3ff220acae4f2001a0cbd70` + latest iteration 2 worktree diffのfresh実行。
  - `openspec validate harden-skill-update-automation-concurrency --strict`: valid、exit 0。同source、latest入力のfresh実行。
  - `git diff --check`: exit 0。同source、latest入力のfresh実行。
  - final independent verifier cycle 4（initial reviewer / cycle 3 verifierと別agent）: commentless判定の一部がsemantic journal entry数ではなく物理comment数を使用するblockerを検出。marker-free human comment 1件があるとcandidate historyはGraphQL `lastEditedAt` hydrationを省略し、publish / finalize writerもinitial root recoveryへ入らずidentity conflictになる。設計上human commentは無視対象のため仕様違反。Node 24 focused 141 tests、latest `task check`、strict OpenSpec、`git diff --check`はgreenだが、該当cross-path regression testが欠落している。OSWF-5 soft stop。利用者承認後の新cycleでcandidate / publish / finalizeのsemantic commentless RED tests、修正、独立review、project checks、cycle 4と別verifierを実行する。real GitHub writeは未実行。
  - cycle 5 self-review: candidate metadata hydration、publish initial root recovery、finalize existing-head recoveryの3 public seamがcreator-bound `reduceJournalCommentsV2(...).entries.length === 0`を使用し、marker-free human commentだけを無視することを確認。foreign / malformed / edited v2 markerはreducer exceptionまたは後段identity validationでfail closed。物理comment数によるproduction判定の残存なし。追加findingなし。
  - cycle 5 initial independent review iteration 1: fresh smoke PR create checkpointに物理comment数判定が残り、PR作成直後のmarker-free human commentでbranch＋draft PRを残して停止するMedium findingを検出。他Blocker / High / Mediumなし。
  - cycle 5 iteration 1 fix / diff review: creator-bound semantic journal reductionへ統一し、persistent human comment回帰をRED→greenで修正。initial reviewerがBlocker / High / Medium残存なしでPASSした。
  - `PATH=/home/shimi3435/.nvm/versions/node/v24.14.1/bin:$PATH uv run --no-sync task check`: exit 0。Node 24.14.1、repo-tools 161 tests、automation 238 tests、Python 152 tests、TypeScript typecheck、Ruff、basedpyright全green。source commit `10793b5aa64683a6b3ff220acae4f2001a0cbd70` + cycle 5 iteration 1 latest worktree diffのfresh実行。
  - `openspec validate harden-skill-update-automation-concurrency --strict`: valid、exit 0。同source、latest入力のfresh実行。
  - `git diff --check`: exit 0。同source、latest入力のfresh実行。
  - verify-change: Task 14 focused 55 testsとfresh smoke 19 testsを個別fresh実行し、semantic human comment保持、initial append 1回、terminal exact cleanupを確認。real-host recovery / fresh smoke writeはfresh approvalが必要なため未検証であり、本taskの停止点以降へ保持する。
  - final independent verifier cycle 5（cycle 4 verifier / initial reviewerと別agent）: PASS。Blocker / High / Mediumなし。Node 24 focused 74 tests、`task check`（repo-tools 161、automation 238、Python 152、typecheck / Ruff / basedpyright）、strict OpenSpec、`git diff --check`全green。Task 11 / 12退行なし。real GitHub recovery / fresh smoke writeは未実行、fresh approval待ち。
  - fresh repo read-only preview (2026-08-28): `shimi3435/ai-coding-template-ja-smoke-v2-20260828`、run `33143140664` attempt 1、source `a1ffb43e865ffd3828163e81a10ca6d4b2d23e17`のlatest CLI previewをEOFで実行。managed PR / Issue 0件、`g900001` branch absent、source relation ahead。exit 2、write 0件。fresh approval digest `sha256:7609b0ee6b867da046419a4c9a2d4e28c5df1b6045115616216476180e84c3b1`。
  - old smoke recovery read-only preview (2026-08-28): current CLIは新しいembedded snapshot必須schemaにより旧rootを`fresh smoke recovery PR identityが不正です`として拒否、exit 1、write 0件。v1 / old-v2 migrationをproductionへ追加しない方針を維持。REST fresh readでPR #1 closed / unmerged / draft、creator `45839485`、branch exact `f7df3837bb9174dc29ab69dea29e9dcf97478301`、creator-bound unedited journal 2件、他Issueなしを確認し、manual exact-lease delete preview `sha256:c11c978a0ffe2fb16eb2e3decb304ff9fa5cbd4331681fdeab98cde62950c483`を生成。各writeは別fresh approval待ち。
  - old smoke terminal cleanup execution (2026-08-28): 利用者がmanual preview digest `sha256:c11c978a0ffe2fb16eb2e3decb304ff9fa5cbd4331681fdeab98cde62950c483`を明示承認。repository ID、PR #1 closed / unmerged / draft、creator、head ref / SHA、root marker、journal 2件のauthor / timestamp / body digest、resource集合、branch exact SHAをfresh再検証し、同digest一致時だけ`--force-with-lease=refs/heads/automation/skill-updates/g900001:f7df3837bb9174dc29ab69dea29e9dcf97478301`でbranchを削除。exit 0。post-readでbranch absent、PR terminal state、journal 2件、他Issueなしが不変。削除branchは復元していない。
  - fresh repo real-host smoke execution (2026-08-28): source objectsを持つfresh repository cloneからCLIを起動し、利用者がin-process preview digest `sha256:362e92043e8eea516dea8b125710f4a7e3af1801c93f61ebfbccb1d349a2c5b8`を明示承認。exact lease branch create / append、draft PR #4、creator-bound immutable rootとjournal sequence 1〜6、closed tracking Issue #5 / #6、branch append response-loss recovery、PR readyを実行した。利用者がPR #4を手動merge後、checkpoint digest `sha256:79bf5b1d722d989013332870c33f108db09832ad20ea7c90577835ae3f4883bb`を同processで承認し、merged stateをfresh検証してexact lease cleanupを実行。CLIは`{"kind":"executed","prNumber":4,"issueNumbers":[5,6]}`、exit 0。post-readでPR #4 merged（merge commit `936b2ed5d46cb5a13a1704dda7363aa76211fca5`）、Issue #5 / #6 closed、managed branch absent、journal full snapshot / digest chain不変を確認した。
  - final post-smoke validation (2026-08-29): `PATH=/home/shimi3435/.nvm/versions/node/v24.14.1/bin:$PATH uv run --no-sync task check`はrepo-tools 161 tests、automation 238 tests、Python 152 tests、TypeScript typecheck、Ruff、basedpyright全green、exit 0。`openspec validate harden-skill-update-automation-concurrency --strict`と`git diff --check`もexit 0。source commit `10793b5aa64683a6b3ff220acae4f2001a0cbd70` + real-host smoke evidenceを含むcurrent worktree diffのfresh実行。

### Task 14: semantic commentless recoveryを全writer経路へ統一する

- **成果:** marker-free human commentをjournal stateから除外し、candidate discovery、publish recovery、finalize recoveryが同じsemantic commentless rootを回復する。
- **依存:** Task 12。
- **対象:**
  - `repo-tools/skill-update-automation/candidate/history.ts`
  - `repo-tools/skill-update-automation/candidate/index.test.ts`
  - `repo-tools/skill-update-automation/publish/draft.ts`
  - `repo-tools/skill-update-automation/publish/draft.test.ts`
  - `repo-tools/skill-update-automation/finalize/finalize.ts`
  - `repo-tools/skill-update-automation/finalize/finalize.test.ts`
  - `repo-tools/skill-update-automation/smoke/fresh-v2.ts`
  - `repo-tools/skill-update-automation/smoke/fresh-v2.test.ts`
  - `openspec/changes/harden-skill-update-automation-concurrency/tasks.md`
- [x] **実装:** public candidate / publish / finalize seamsのRED testsから、物理comment数によるcommentless判定をcreator-bound semantic journal reductionへ置換する。foreign / malformed / edited markerはfail closedを維持する。
- [x] **検証:** Node 24 focused tests、typecheck、strict OpenSpec、`git diff --check`をgreenにし、human comment共存時もGraphQL metadata取得とinitial append recoveryが行われ、mutation再送がないことを確認する。real GitHub writeは未実行のまま保持する。
  - RED: candidate history adapterはmarker-free human comment 1件でGraphQL metadataを取得せず`lastEditedAt`が欠落、publish recoveryは`publish-target-changed`、finalize recoveryは`pr-identity-conflict`となることを各public seamで再現。各test exit 1。source commit `10793b5aa64683a6b3ff220acae4f2001a0cbd70` + current worktree diff、Node 24.14.1、fresh実行。
  - GREEN / focused: `node --test repo-tools/skill-update-automation/candidate/index.test.ts repo-tools/skill-update-automation/publish/draft.test.ts repo-tools/skill-update-automation/finalize/finalize.test.ts`: 55 tests passed、exit 0。同source、Node 24.14.1、latest Task 14入力のfresh実行。candidateはGraphQL metadata取得後にopen PRを復元し、publish / finalizeはhuman commentを保持したままroot entryを1回だけappendした。
  - `npm run typecheck`: exit 0。同source、Node 24.14.1、fresh実行。
  - `openspec validate harden-skill-update-automation-concurrency --strict`: valid、exit 0。同source、fresh実行。
  - `git diff --check`: exit 0。同source、fresh実行。
  - review-fix RED: `node --test --test-name-pattern='persistent marker-free human comment' repo-tools/skill-update-automation/smoke/fresh-v2.test.ts`: `fresh smoke created PR root pre-stateが不正です`、1 failed、exit 1。同source、Node 24.14.1、latest review finding入力のfresh実行。
  - review-fix GREEN / focused: `node --test repo-tools/skill-update-automation/smoke/fresh-v2.test.ts`: 19 tests passed、exit 0。同source、Node 24.14.1、latest review fix入力のfresh実行。persistent human commentを保持したままroot entry 1件でterminal cleanupまで完了。
  - review-fix `npm run typecheck`、`git diff --check`: exit 0。同source、fresh実行。
