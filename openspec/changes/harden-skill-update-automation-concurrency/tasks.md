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
  - `repo-tools/skill-update-automation/publish/command.ts`
  - `repo-tools/skill-update-automation/publish/command.test.ts`
- [ ] **実装:** one-slice RED testsからnew root、append、ready-to-draft、末尾preparedのbefore / after / divergent recoveryを実装する。
- [ ] **検証:** publish focused testsでbody immutable、exact operation ID、entry順、mutation拒否時未committedをgreenにする。
  - **Resolved decision (2026-08-27):** 利用者選択により保証を限定。中間欠落、fork、edit、foreign author、live state不一致はfail closed。state-only末尾suffix全削除は検出不能と正本へ明記し、anchor refは追加しない。

### Task 4: finalize / issue lifecycleをTDDでjournal v2へ移す

- **成果:** PR ready protocol、failure journal、closed issue terminal、新failure新issue、cleanup failure記録。
- **依存:** Task 3。
- **対象:**
  - `repo-tools/skill-update-automation/finalize/`
  - `repo-tools/skill-update-automation/github/issue-discovery.ts`
  - `repo-tools/skill-update-automation/github/issue-discovery.test.ts`
  - `repo-tools/skill-update-automation/github/issue-reducer.ts`
  - `repo-tools/skill-update-automation/github/issue-reducer.test.ts`
- [ ] **実装:** RED testsからready prepared protocol、open issue append、closed issue不変＋new issue、conflict時issue-only fail-closedを実装する。
- [ ] **検証:** finalize / issue focused testsでno reopen、body immutable、journal tamper、recovery、dedupeをgreenにする。

### Task 5: cleanup-mergedを独立workflow jobへ分離する

- **成果:** candidate-update / existing-head-validation / no-op全eligible runで動くleast-privilege cleanup job。
- **依存:** Task 2、Task 4。
- **対象:**
  - `.github/workflows/skill-update-prs.yml`
  - `repo-tools/skill-update-automation/workflow/cleanup.ts`
  - `repo-tools/skill-update-automation/workflow/cleanup.test.ts`
  - `repo-tools/skill-update-automation/publish/workflow.test.ts`
  - `repo-tools/skill-update-automation/finalize/workflow.test.ts`
- [ ] **実装:** workflow contract RED testsから独立job、artifact-kind全variant、fresh discovery、CAS delete、failure journal wiringを実装する。
- [ ] **検証:** no-op retry、existing-head retry、candidate publish skip / failure時cleanup、permission topology、forbidden path absenceをgreenにする。

### Task 6: fresh schema v2 smokeをTDDで作る

- **成果:** fresh repository precondition、v2 root / journal、prepared protocol、CAS、terminal cleanupを束縛するpreview / execution。
- **依存:** Task 5。
- **対象:**
  - `repo-tools/skill-update-automation/smoke/`
  - `repo-tools/skill-update-automation/model/smoke-resource.ts`
  - `repo-tools/skill-update-automation/model/smoke-step.ts`
  - `repo-tools/skill-update-automation/model/smoke.test.ts`
- [ ] **実装:** RED testsからfresh repo guard、comment resources、creator ID、v2 operation plan、preview digest、same-process approval、recovery / cleanupを実装する。
- [ ] **検証:** fake hostで未承認write 0、v1 resource拒否、stale preview拒否、全state chainとterminal cleanupをgreenにする。real GitHub writeは未実行のままfresh approvalで停止する。

### Task 7: public contractsと運用文書を更新する

- **成果:** v2 interface、独立cleanup、immutable body、closed issue lifecycle、fresh smoke runbookを公開contractへ同期する。
- **依存:** Task 6。
- **対象:**
  - `repo-tools/repository-contracts.ts`
  - `repo-tools/repository-contracts.test.ts`
  - `docs/guide.md`
  - `docs/agents/safety.md`
  - `README.md`
- [ ] **実装:** contract RED testsからworkflow / schema /禁止操作を固定し、通常日本語でrunbookを更新する。
- [ ] **検証:** focused contract tests、docs / code / workflow整合、secret / prohibited command scanをgreenにする。

### Task 8: self-review、project check、独立review / verifierを完了する

- **成果:** OSWF-5 convergence evidenceとfresh approval直前の安全な停止点。
- **依存:** Task 7。
- **対象:**
  - `openspec/changes/harden-skill-update-automation-concurrency/tasks.md`
- [ ] **実装:** 全diff self-review、spec-holes対応照合、initial independent review、blocker finding修正を最大3 iterationsで完了する。
- [ ] **検証:** Node 24 focused tests、最新入力の`uv run --no-sync task check`、strict OpenSpec validation、initial reviewerと別verifierをgreenにする。real GitHub writeはread-only previewとfresh approvalまで未完了として保持する。
