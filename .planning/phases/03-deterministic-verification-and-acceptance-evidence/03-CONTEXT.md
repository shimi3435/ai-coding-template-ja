# Phase 3: Deterministic Verification and Acceptance Evidence - Context

**Gathered:** 2026-07-15
**Status:** Ready for planning

<domain>
## Phase Boundary

source commit `5a1f78b81f546c900745328fad24f9adb073e768` の canonical
`openspec/changes/automate-openspec-gsd-handoff/tasks.md` にある `## 4. Test phase` を指す
`VERIFY-01` の検証境界を扱う。通常 CI の deterministic fixture evidence、実 OpenSpec / GSD の read-only
opt-in smoke、実行できない host-level observation の理由付き未検証、OpenSpec acceptance 用の追跡証拠を
整える。新しい handoff behavior、GSD mutation、lifecycle automation は実装しない。

</domain>

<decisions>
## Implementation Decisions

### Normal-CI evidence
- **D-01:** `task check` は GSD の install、`GSD_HOME`、network、host agent dispatch を要求しない。Phase 1/2 の
  fixtures、public seam tests、skill/lock/symlink tests を通常 pytest collection のまま維持する。
- **D-02:** Phase 3 は canonical scenarios と existing fixtures/tests の対応を機械的に監査し、実際に不足する
  integration/property case だけを TDD で追加する。既に成立している Phase 1/2 tests を意味なく複製しない。
- **D-03:** JSON route と Markdown fallback は canonical bytes、sorted artifact identities/hashes、normalized progress
  が一致し、route label だけが異なることを一つの integration evidence で確認する。

### Opt-in real-tool smoke
- **D-04:** dedicated opt-in Taskfile entrypoint は実 OpenSpec 1.3.1 と GSD 1.5.0 を read-only probe だけで検査し、
  normal `check` から到達不能にする。未導入・version mismatch・signal mismatch は opt-in invocation を非ゼロにするが、
  通常 CI には影響させない。
- **D-05:** smoke は OpenSpec path discovery/progress parity、GSD VERSION/required files/`init progress --raw`、
  entrypoint に read-only/dry-run がないことを報告する。`prepare`、manifest write、brief creation、`gsd-new-project`、
  `gsd-phase`、`mark-started` は絶対に実行しない。
- **D-06:** smoke result は machine-readable summary と明確な human summary を返し、実行した command、versions、route、
  signals、未検証項目を区別する。secret、home 固有 absolute path、canonical Markdown 本文は出力しない。

### Host evidence and acceptance traceability
- **D-07:** actual host prompt、generic-agent spawn、実 GSD mutation、route-specific postcondition は安全な dry-run がないため
  自動 smoke で実行しない。Phase 3 verification / OpenSpec acceptance 対応表へ理由付き未検証として記録し、実行済みと
  主張しない。
- **D-08:** OpenSpec requirement/scenario/spec-hole の全項目を production/tests/smoke/unverified reason のいずれかへ
  対応付ける。GSD phase 完了は OpenSpec final completion を意味せず、最終 task 5.1/5.2 は main/orchestrator が判断する。

### the agent's Discretion
- opt-in smoke script/module、test file、Taskfile task の具体名。ただし `task check` から非到達で read-only と分かる名前にする。
- structured smoke summary の最小 JSON shape と human rendering。
- acceptance matrix を GSD verification report、test metadata、または repository-local evidence artifact のどこへ置くか。
  pre-merge close で消える一時 GSD artifact と、恒久的 product/test evidence を混同しないこと。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.** Canonical OpenSpec files は source commit
`5a1f78b81f546c900745328fad24f9adb073e768` の内容を規範とする。

### Canonical OpenSpec authority
- `openspec/changes/automate-openspec-gsd-handoff/proposal.md` — MVP の目的と optional GSD boundary。
- `openspec/changes/automate-openspec-gsd-handoff/design.md` § `7. fixture CIとopt-in smokeを分離する` — normal/smoke 分離。
- `openspec/changes/automate-openspec-gsd-handoff/specs/openspec-gsd-handoff-automation/spec.md` — requirements/scenarios の唯一の正本。
- `openspec/changes/automate-openspec-gsd-handoff/tasks.md` § `## 4. Test phase` — `VERIFY-01` boundary。

### Existing deterministic evidence
- `tests/fixtures/openspec_gsd_handoff/README.md` — fixture groups と pinned tool contracts。
- `tests/fixtures/openspec_gsd_handoff/openspec/contract.json` — OpenSpec positive/negative matrix。
- `tests/fixtures/openspec_gsd_handoff/gsd/contract.json` — GSD probe/entrypoint matrix。
- `tests/fixtures/openspec_gsd_handoff/manifest/expected-prepared.json` — deterministic manifest shape。
- `tests/fixtures/openspec_gsd_handoff/skill/contract.json` — approval/dispatch/acceptance static contract。
- `tests/test_handoff_core.py`、`tests/test_handoff_discovery.py`、`tests/test_handoff_manifest.py`、`tests/test_handoff_preflight.py`、`tests/test_handoff_cli.py` — Phase 1 dynamic evidence。
- `tests/test_execute_openspec_change_skill.py`、`tests/test_skills_lock.py`、`tests/test_setup_skills.py` — Phase 2 static/distribution evidence。

### Task and operator boundaries
- `Taskfile.yml` — normal `check` と explicit opt-in tasks の既存分離パターン。
- `tests/test_taskfile.py` — Taskfile public task contract tests。
- `scripts/openspec-validate-gate.py` — optional OpenSpec CLI の explicit failure/reporting pattern。
- `.agents/skills/execute-openspec-change/SKILL.md` § `Evidence limits` — Phase 3 に渡された unverified host observations。
- `docs/agents/workflow.md`、`docs/optional/gsd.md` — operator sequence、read-only probe、manual fallback。

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 1 `collect_openspec_probe` / GSD preflight adapters は fixed argv、cwd、timeout、bounded stdout の既存 read-only seam。
- `discover_openspec_artifacts` と normalized progress は actual OpenSpec response を common reader へ通す比較に再利用できる。
- fixture contract JSON は required commands/files/signals を新しい smoke に二重定義せず読み込める。

### Established Patterns
- optional tools は Taskfile の専用 task から `uv run --no-sync python scripts/...` で起動し、`task check` へ入れない。
- script tests は subprocess runner / temp repository を注入し、実 tool/network なしで command/output behavior を検証する。
- normal tests は `tests/` 全体で自動収集されるため、optional smoke 本体に pytest skip marker を混ぜず task 境界で隔離できる。

### Integration Points
- 新しい read-only smoke entrypoint は `Taskfile.yml` から起動し、fixture contract と Phase 1 adapter/core を利用する。
- focused tests は fake runner で absence/version/signal/mutation-prohibition を通常 CI に固定する。
- actual opt-in execution result と未実行理由は Phase 3 VERIFICATION / OpenSpec acceptance mapping へ流す。

</code_context>

<specifics>
## Specific Ideas

- smoke は一行 JSON を automation 用に返し、stderr の短い human summary でどこまで検証したかを示す。
- 実 entrypoint の dry-run 不在は entrypoint を呼ぶことで確認せず、pinned skill/workflow/contract inspection で報告する。
- GSD 不在環境の normal `task check` 成功は PATH を制限した focused subprocess test または task dependency inspection で証明する。

</specifics>

<deferred>
## Deferred Ideas

- 実 GSD project を破壊可能な sandbox で作成する full host E2E harness。
- `harden-openspec-gsd-handoff-lifecycle` が所有する retry/resume/rollback/finalize/cleanup/drift/ownership。
- push、PR、merge、自動 stash / commit / reset、OpenSpec close automation。

</deferred>

---

*Phase: 03-deterministic-verification-and-acceptance-evidence*
*Context gathered: 2026-07-15*
