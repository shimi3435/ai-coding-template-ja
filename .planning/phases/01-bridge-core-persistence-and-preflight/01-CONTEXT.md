# Phase 1: Bridge Core, Persistence, and Preflight - Context

**Gathered:** 2026-07-15
**Status:** Ready for planning

<domain>
## Phase Boundary

source commit `5a1f78b81f546c900745328fad24f9adb073e768` の canonical
`openspec/changes/automate-openspec-gsd-handoff/tasks.md` にある
`## 2. Bridge MVP phase` を指す `BRIDGE-01` の実装境界を扱う。bridge の functional core、
OpenSpec / GSD / Git / filesystem adapter、薄い module entrypoint、およびこの境界に近い検証を計画対象とする。
仕様上の requirement、scenario、受け入れ基準、最終完了は canonical OpenSpec artifacts が所有し、
この文書では複製または再定義しない。

</domain>

<decisions>
## Implementation Decisions

### Production structure and dependency direction
- **D-01:** production bridge は `src/ai_coding_template_ja/openspec_gsd_handoff/` に配置する。
- **D-02:** validation、normalization、state transition、serialization の functional core を、OpenSpec / GSD
  subprocess、Git、filesystem の boundary adapter から分離する。
- **D-03:** skill から利用できる薄い module entrypoint を設け、業務規則を entrypoint や単一 script に集約しない。

### Host capability boundary
- **D-04:** visible host の `spawn_agent` schema は skill が runtime 上で検査する。Python bridge や OpenSpec / GSD
  CLI probe から host capability を推測しない。
- **D-05:** skill は検査済みの明示的な host capability 値を bridge / manifest 境界へ渡す。未検査値や暗黙の既定値を
  capability 成立の根拠にしない。

### Atomic persistence boundary
- **D-06:** manifest は target と同じ directory に staging し、完成形を検証してから `os.replace` で置換する。
- **D-07:** serialization は決定論的かつ timestamp-free とし、同じ入力から volatile な差分を生成しない。
- **D-08:** staging または置換が失敗した場合は可能な範囲で staging を片付け、失敗点と既知状態を報告する。
  追加の crash durability、retry、resume、rollback、auto-repair は保証しない。

### Result and error surface
- **D-09:** error は bridge / skill が分岐可能な分類済み結果として表現する。JSON candidate を破棄して fallback する
  場合を含め、異なる route から得た値を一つの結果へ混在させない。
- **D-10:** bridge は skill が機械的に消費できる structured result を返す。利用者向け表示の構成は skill が担当する。

### the agent's Discretion
- package 内の具体的な module 名と public symbol の最小構成。
- CLI の具体的な subcommand 名、structured result の細部、および利用者向け表示形式。ただし skill が結果を
  機械的に判定でき、route、error classification、validated host capability が曖昧にならないこと。
- error code / exception class の具体的な taxonomy と、unit / integration test のファイル分割。
- canonical contract を越えない staging file の命名と cleanup 実装の詳細。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.** Canonical OpenSpec files は source commit
`5a1f78b81f546c900745328fad24f9adb073e768` の内容を規範とする。

### Canonical OpenSpec authority
- `openspec/changes/automate-openspec-gsd-handoff/proposal.md` — MVP の目的、依存、対象範囲、除外範囲を定める。
- `openspec/changes/automate-openspec-gsd-handoff/design.md` — discovery、progress、manifest、capability、Git 境界の設計判断を定める。
- `openspec/changes/automate-openspec-gsd-handoff/specs/openspec-gsd-handoff-automation/spec.md` — normative requirements と scenarios の唯一の正本。
- `openspec/changes/automate-openspec-gsd-handoff/tasks.md` § `## 2. Bridge MVP phase` — `BRIDGE-01` が参照する Phase 1 境界。

### GSD planning and source pin
- `.planning/PROJECT.md` — OpenSpec / GSD ownership、source pin、one-change 制約を定める。
- `.planning/REQUIREMENTS.md` — `BRIDGE-01` を canonical task heading へ結び付ける proxy reference。
- `.planning/ROADMAP.md` § `Phase 1: Bridge Core, Persistence, and Preflight` — Phase 1 の goal と phase 間依存を定める。
- `.planning/STATE.md` — Phase 1 を current focus とする planning state。
- `.planning/research/SUMMARY.md` — repository-grounded な stack、architecture、pitfall の調査結果。

### Executable contract inputs
- `tests/fixtures/openspec_gsd_handoff/README.md` — pinned fixture 群の利用境界と route / capability の説明。
- `tests/fixtures/openspec_gsd_handoff/openspec/contract.json` — OpenSpec 1.3.1 の probe、上限、positive / negative route 契約。
- `tests/fixtures/openspec_gsd_handoff/gsd/contract.json` — GSD 1.5.0 の複合 signal と entrypoint 契約。
- `tests/fixtures/openspec_gsd_handoff/manifest/expected-prepared.json` — timestamp-free minimal manifest の期待 shape と並び順。

### Repository integration contracts
- `pyproject.toml` — Python `>=3.12`、`src` package、pytest / Hypothesis、Ruff、basedpyright の既存 toolchain。
- `Taskfile.yml` — `task check` と opt-in task の既存 command / CI 境界。
- `scripts/openspec-validate-gate.py` — OpenSpec CLI の fail-closed gate と `doctor.py` 再利用パターン。
- `scripts/setup-skills.sh` — skill 実体と `.claude/skills` / `.codex/skills` relative symlink の配布パターン。
- `tests/test_skills_lock.py` — vendored skill、lock hash、runtime symlink を検証する既存 hard gate。

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/fixtures/openspec_gsd_handoff/`: OpenSpec 1.3.1、GSD 1.5.0、minimal manifest の positive / negative 入力を
  production contract の fixture として再利用できる。
- `scripts/doctor.py` の `list_change_dirs` / `broken_change_dirs` / `malformed_tasks_changes`: 既存 OpenSpec
  directory と task-format 診断の repository convention を示す。Phase 1 の厳密 contract と一致する範囲だけを
  再利用し、意味を拡張しない。
- `scripts/openspec-validate-gate.py` の `_load_doctor` と subprocess gate: optional CLI を core package dependency に
  せず、失敗を明示的な exit status へ写す既存例である。

### Established Patterns
- `src/ai_coding_template_ja/` が wheel package の単一 root で、`py.typed` を公開し、Ruff / basedpyright / pytest が
  `src` と `tests` を通常 gate で検査する。
- tests は `REPO_ROOT = Path(__file__).resolve().parent.parent` と temporary project / subprocess seam を用いて、
  repository 外部作用を隔離する。
- optional tool は `task check` に必須化せず、専用 Taskfile entrypoint と fixture tests に分離する。
- vendored skill は `.agents/skills/` を単一の正とし、lock entry と relative symlink の一致を pytest hard gate にする。

### Integration Points
- 新 package は `src/ai_coding_template_ja/openspec_gsd_handoff/` から Python API と薄い `python -m` entrypoint を公開する。
- OpenSpec / GSD adapter は pinned fixture と同じ command/result boundary を持ち、subprocess 呼出しは注入可能な seam に置く。
- Git / filesystem adapter は repository real path、source commit、ignore / trackability、same-directory staging を検査する。
- Phase 2 の `.agents/skills/execute-openspec-change/` は Phase 1 の structured result だけを消費し、host schema 検査値を
  明示的に渡す。
- Phase 3 は通常 `task check` と opt-in real-tool smoke の境界で Phase 1 の tests / fixtures を統合する。

</code_context>

<specifics>
## Specific Ideas

- module entrypoint は orchestration policy を所有せず、bridge の structured operation を薄く公開する。
- deterministic output に timestamp を含めず、manifest review で source input の差だけが見えるようにする。
- fallback は JSON candidate の値を残さず、固定 directory から独立した新しい route result を構築する。

</specifics>

<deferred>
## Deferred Ideas

- `harden-openspec-gsd-handoff-lifecycle` が所有する stable mapping、multi-manifest ownership、高度な drift / recovery。
- push、PR、merge、自動 stash / commit / reset。
- OpenSpec change の finalize / close と GSD phase 完了後の最終境界処理。
- retry、resume、rollback、auto-repair、追加の crash durability 保証。
- handoff 開始後の plan / execute / verify / finalize lifecycle 自動制御。

</deferred>

---

*Phase: 01-bridge-core-persistence-and-preflight*
*Context gathered: 2026-07-15*
