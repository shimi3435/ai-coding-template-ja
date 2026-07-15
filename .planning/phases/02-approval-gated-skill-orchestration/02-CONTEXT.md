# Phase 2: Approval-Gated Skill Orchestration - Context

**Gathered:** 2026-07-15
**Status:** Ready for planning

<domain>
## Phase Boundary

source commit `5a1f78b81f546c900745328fad24f9adb073e768` の canonical
`openspec/changes/automate-openspec-gsd-handoff/tasks.md` にある `## 3. Skill phase` を指す
`SKILL-01` の実装境界を扱う。`execute-openspec-change` skill と必要最小限の agent 用導線を、Phase 1 の
public bridge seam 上で実装し、read-only preflight、入力表示、明示承認、manifest の `prepared` 化、
契約済み GSD entrypoint の受付、`started` 遷移までを計画対象とする。handoff 後の lifecycle 自動制御と
後続 hardening は含めない。

</domain>

<decisions>
## Implementation Decisions

### Skill and bridge responsibility split
- **D-01:** `execute-openspec-change` は `.agents/skills/` を正本とする first-party skill とし、Claude / Codex
  の既存 relative-symlink 配布規約へ載せる。
- **D-02:** skill は表示、runtime host schema 検査、利用者承認、GSD skill dispatch を所有する。artifact
  discovery、tool / Git preflight、manifest persistence、state transition は Phase 1 の public bridge API / CLI
  だけを利用し、skill 本文へ Python 業務規則を複製しない。
- **D-03:** skill の machine-facing seam は Phase 1 の structured JSON result と分類済み error code を使う。
  human-readable prose の解析や exit 0 だけを handoff 成立の根拠にしない。

### Read-only preview and approval
- **D-04:** 最初の mutable operation より前に `inspect` を一度実行し、change ID、canonical paths、route reason、
  fallback state、source commit、manifest path、OpenSpec / GSD capabilities、repository policy、host schema を
  一つの approval preview として表示する。
- **D-05:** approval は表示後の明示的な利用者回答だけを受理する。過去の route 承認、CLI flag の暗黙値、
  GSD 自動モード、または tool の存在を approval の代用にしない。
- **D-06:** inspect failure / refusal では `prepare`、handoff brief 作成、GSD dispatch、`mark-started` を行わず、
  分類済み不足項目と canonical 手動 handoff 手順を表示する。

### Prepared-to-started orchestration
- **D-07:** 承認後は同じ表示済み入力を Phase 1 `prepare` へ渡し、`prepared` manifest の成功を確認してからだけ
  GSD entrypoint を起動する。preview と prepare の入力差替えを許さない。
- **D-08:** GSD 未初期化時は canonical paths、source commit、one-change 制約、仕様非複製を持つ deterministic
  handoff brief を `$gsd-new-project --auto @<brief>` へ渡す。初期化済み時は同じ参照を change 専用
  `$gsd-phase` へ渡す。混在初期化状態ではどちらも起動しない。
- **D-09:** `mark-started` は契約済み GSD skill が入力を受け付けたことを確認できた場合だけ呼ぶ。dispatch failure、
  checkpoint、曖昧な返却では `prepared` を保持し、自動 retry / rollback / route switch をせず、完了済み操作と
  手動再開情報を報告する。

### Host capability and distribution gates
- **D-10:** runtime の visible `spawn_agent` schema は skill が検査する。`agent_type` がなければ対応 agent `.toml`
  の role preamble を使う generic-agent workaround を明示し、typed dispatch または worktree isolation が
  正しさに必須なら fail-closed する。
- **D-11:** first-party skill の lock entry、sha256、Claude / Codex symlink、agent guidance、契約テストを同じ phase
  で整合させる。symlink の手動生成ロジックは増やさず既存 `scripts/setup-skills.sh` を使う。

### the agent's Discretion
- approval preview の具体的な Markdown レイアウトと、structured result を検査する shell / Python 呼出しの最小形。
- handoff brief の一時ファイル名と成功時 cleanup。ただし source-pinned 入力だけから決定論的に作り、失敗時は
  既知の path / 内容再構成手順を報告し、manifest schema や tracked ownership を拡張しないこと。
- GSD skill 返却を「accepted」と判定する repository-local fixture / contract test の具体形。
- skill 契約テスト、配布テスト、guidance テストのファイル分割。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.** Canonical OpenSpec files は source commit
`5a1f78b81f546c900745328fad24f9adb073e768` の内容を規範とする。

### Canonical OpenSpec authority
- `openspec/changes/automate-openspec-gsd-handoff/proposal.md` — MVP の目的、依存、対象範囲を定める。
- `openspec/changes/automate-openspec-gsd-handoff/design.md` § `5. skillはhandoff開始までをオーケストレーションする` — skill の責務境界を定める。
- `openspec/changes/automate-openspec-gsd-handoff/specs/openspec-gsd-handoff-automation/spec.md` § `Requirement: policyとcapabilityのpreflight後にGSD handoffを開始する` — Phase 2 の normative scenarios の正本。
- `openspec/changes/automate-openspec-gsd-handoff/tasks.md` § `## 3. Skill phase` — `SKILL-01` が参照する boundary gate。

### Policy and operator guidance
- `AGENTS.md` § `Workflow（OpenSpec / GSD の適応型実行境界 / ADR-0008）` — OpenSpec / GSD ownership と delegation 規則。
- `docs/agents/workflow.md` § `大規模 change の手動 handoff` — policy preconditions と handoff 順序。
- `docs/optional/gsd.md` § `大規模 change の手動 handoff` — opt-in GSD operator guidance と retention boundary。
- `docs/template/adr/0008-adaptive-openspec-gsd-execution-boundary.md` — route、failure、close policy の設計判断。

### Phase 1 seam and executable contracts
- `src/ai_coding_template_ja/openspec_gsd_handoff/__init__.py` — `inspect_handoff`、`prepare_handoff`、`mark_handoff_started` の public seam。
- `src/ai_coding_template_ja/openspec_gsd_handoff/__main__.py` — skill が機械的に呼べる thin structured CLI。
- `src/ai_coding_template_ja/openspec_gsd_handoff/preflight.py` — explicit repository-policy / host-verdict と GSD initialization signal。
- `tests/fixtures/openspec_gsd_handoff/README.md` — pinned OpenSpec / GSD / host contract の説明。
- `tests/fixtures/openspec_gsd_handoff/gsd/contract.json` — GSD 1.5.0 entrypoint と acceptance fixture。
- `tests/fixtures/openspec_gsd_handoff/gsd/handoff-brief.md` — canonical-reference-only brief の fixture。

### Skill distribution contracts
- `.agents/skills/skills.lock.json` — vendored / first-party skill の provenance と sha256 gate。
- `scripts/setup-skills.sh` — `.agents/skills` から `.claude/skills` / `.codex/skills` への安全な relative-symlink 配布。
- `tests/test_skills_lock.py` — lock、sha256、symlink の hard gate。
- `docs/agents/workflow.md` § `Skills（vendoring・コア候補のうち再配布可のもの）` — skill 正本と配布方針。

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 1 public API / CLI は inspect、prepared write、started transition を分離済みで、skill に新たな persistence
  logic を持たせず orchestration できる。
- `tests/fixtures/openspec_gsd_handoff/gsd/contract.json` と `handoff-brief.md` は未初期化 / 初期化済み dispatch の
  入出力期待を固定している。
- `scripts/setup-skills.sh` は新しい `.agents/skills/<name>/` を既存二 runtime へ冪等に露出できる。

### Established Patterns
- first-party skill も `skills.lock.json` に `source_type=local` と SKILL.md sha256 を持ち、runtime symlink は
  `tests/test_skills_lock.py` で検証する。
- optional GSD は通常 Python dependency / core CI runtime にせず、固定 fixture と文書契約でテストする。
- caller-only evidence（approval、repository policy、visible host schema）は Python bridge が推測せず明示引数で受ける。

### Integration Points
- 新規 `.agents/skills/execute-openspec-change/SKILL.md` が Phase 1 module CLI、visible host tool schema、GSD skills を順に接続する。
- `.claude/skills/execute-openspec-change` と `.codex/skills/execute-openspec-change` は setup script が作る relative symlink とする。
- `AGENTS.md` / `docs/agents/workflow.md` / `docs/optional/gsd.md` は skill 名と handoff 開始境界だけを案内し、normative OpenSpec scenarios を複製しない。
- focused tests は skill contract、distribution、approval前無変更、GSD accepted 前後の state transition を検査する。

</code_context>

<specifics>
## Specific Ideas

- approval preview は route / fallback と host schema を省略せず、利用者が source pin と dispatch degradation を一度に確認できる形にする。
- generic-agent workaround の表示は成功メッセージに埋没させず、typed dispatch と同等でないことを明記する。
- GSD acceptance が曖昧な場合は `prepared` のまま止めることで、後続 lifecycle hardening を先取りしない。

</specifics>

<deferred>
## Deferred Ideas

- `harden-openspec-gsd-handoff-lifecycle` が所有する stable mapping、multi-manifest ownership、高度な drift / recovery。
- handoff 後の plan / execute / resume / verify / finalize 自動制御。
- automatic retry、rollback、route switch、manifest auto-repair、cleanup preview。
- push、PR、merge、自動 stash / commit / reset、および OpenSpec change の finalize / close。

</deferred>

---

*Phase: 02-approval-gated-skill-orchestration*
*Context gathered: 2026-07-15*
