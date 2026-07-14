# Phase 1: Bridge Core, Persistence, and Preflight - Research

**Researched:** 2026-07-15
**Domain:** source-pinned OpenSpec handoff bridge の functional core、persistence、preflight
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Production structure and dependency direction
- **D-01:** production bridge は `src/ai_coding_template_ja/openspec_gsd_handoff/` に配置する。
- **D-02:** validation、normalization、state transition、serialization の functional core を、OpenSpec / GSD
  subprocess、Git、filesystem の boundary adapter から分離する。
- **D-03:** skill から利用できる薄い module entrypoint を設け、業務規則を entrypoint や単一 script に集約しない。

#### Host capability boundary
- **D-04:** visible host の `spawn_agent` schema は skill が runtime 上で検査する。Python bridge や OpenSpec / GSD
  CLI probe から host capability を推測しない。
- **D-05:** skill は検査済みの明示的な host capability 値を bridge / manifest 境界へ渡す。未検査値や暗黙の既定値を
  capability 成立の根拠にしない。

#### Atomic persistence boundary
- **D-06:** manifest は target と同じ directory に staging し、完成形を検証してから `os.replace` で置換する。
- **D-07:** serialization は決定論的かつ timestamp-free とし、同じ入力から volatile な差分を生成しない。
- **D-08:** staging または置換が失敗した場合は可能な範囲で staging を片付け、失敗点と既知状態を報告する。
  追加の crash durability、retry、resume、rollback、auto-repair は保証しない。

#### Result and error surface
- **D-09:** error は bridge / skill が分岐可能な分類済み結果として表現する。JSON candidate を破棄して fallback する
  場合を含め、異なる route から得た値を一つの結果へ混在させない。
- **D-10:** bridge は skill が機械的に消費できる structured result を返す。利用者向け表示の構成は skill が担当する。

### the agent's Discretion
- package 内の具体的な module 名と public symbol の最小構成。
- CLI の具体的な subcommand 名、structured result の細部、および利用者向け表示形式。ただし skill が結果を
  機械的に判定でき、route、error classification、validated host capability が曖昧にならないこと。
- error code / exception class の具体的な taxonomy と、unit / integration test のファイル分割。
- canonical contract を越えない staging file の命名と cleanup 実装の詳細。

### Deferred Ideas (OUT OF SCOPE)
- `harden-openspec-gsd-handoff-lifecycle` が所有する stable mapping、multi-manifest ownership、高度な drift / recovery。
- push、PR、merge、自動 stash / commit / reset。
- OpenSpec change の finalize / close と GSD phase 完了後の最終境界処理。
- retry、resume、rollback、auto-repair、追加の crash durability 保証。
- handoff 開始後の plan / execute / verify / finalize lifecycle 自動制御。
</user_constraints>

## Project Constraints (from AGENTS.md)

- OpenSpec が仕様・受け入れ・最終完了の正、GSD が大規模 change の詳細 plan / phase 進捗の正であり、GSD artifact に規範本文を複製しない。`[VERIFIED: AGENTS.md]`
- 変更は必要最小限とし、責務分割、具体的な命名、既存設計の尊重、無関係な refactor の禁止を守る。`[VERIFIED: AGENTS.md]`
- 実装成果は新しいコンテキストへ委譲し、main が diff と検証結果を確認してから進捗を更新する。`[VERIFIED: AGENTS.md]`
- 可能なら TDD と spec-holes Phase 2 の test 対応を行い、対象近傍 test と少なくとも `task check` の実行可否を確認する。`[VERIFIED: AGENTS.md]`
- secret を追跡・ログ出力せず、破壊的変更、外部 write、依存の大規模更新を行わない。`[VERIFIED: AGENTS.md]`
- `.planning/config.json` の `workflow.nyquist_validation` は `false` であるため、本書に Validation Architecture セクションを設けない。`[VERIFIED: .planning/config.json]`

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BRIDGE-01 | source commit `5a1f78b81f546c900745328fad24f9adb073e768` の canonical `tasks.md` heading `## 2. Bridge MVP phase` だけを指す proxy | package / adapter / persistence / preflight の責務配置、既存 fixture seam、主要 pitfall を特定した。規範的挙動は再掲しない。 |
</phase_requirements>

## Summary

Phase 1 は、新規 dependency を足さず Python 3.12 標準 library で小さな typed package を作るのが最短経路である。production package は現在 `__init__.py` と `py.typed` だけで、bridge production code と専用 tests はまだない。固定済み OpenSpec / GSD / manifest fixtures が boundary 入力を提供している。`[VERIFIED: repository tree, pyproject.toml, canonical fixtures]`

planner は pure models / validation / normalization と、filesystem・Git・subprocess adapters を別 task にするべきである。JSON route は candidate 全体の成功時だけ採用し、fallback は独立結果として再構築する。manifest は validated bytes を same-directory staging から `os.replace` し、追加の recovery/lifecycle を作らない。`[VERIFIED: 01-CONTEXT.md D-02, D-06, D-08, D-09]`

最大の実装リスクは、既存 `doctor.py` の寛容な checkbox 規則を bridge に流用すること、Python の `bool` を JSON integer と誤認すること、source commit と working bytes の不一致、path の lexical 判定、CLI probe から host capability を推測することである。`[VERIFIED: scripts/doctor.py, canonical design, project research summary]`

**Primary recommendation:** pure core → safe reader/discovery → Git/GSD preflight → atomic manifest repository → thin module entrypoint の順で縦に実装し、各境界を fixture/fake adapter で固定する。

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| values、validation、normalization、state transition | Functional core | — | I/O なしで決定論的に検証できる。`[VERIFIED: D-02]` |
| OpenSpec discovery と Markdown read | Boundary adapter | Functional core | raw process/path/bytes を検証済み artifact value へ変換する。`[VERIFIED: project research]` |
| Git / GSD preflight | Boundary adapter | Functional core | command result を分類済み capability/source verdict へ変換する。`[VERIFIED: fixtures]` |
| manifest serialization / persistence | Storage adapter | Functional core | schema/value 検証と filesystem mutation を分離する。`[VERIFIED: D-06–D-09]` |
| `python -m` entrypoint | Composition root | Boundary adapters | argv、adapter wiring、structured output のみを所有する。`[VERIFIED: D-03]` |
| host schema inspection | Phase 2 skill/runtime | Phase 1 explicit input | bridge は検査済み値を受け取り、推測しない。`[VERIFIED: D-04–D-05]` |

## Standard Stack

### Core

| Technology | Version | Purpose | Why Standard |
|------------|---------|---------|--------------|
| Python | project `>=3.12`; local `3.12.9` | production bridge | 既存 wheel、typing、lint/test 対象。`[VERIFIED: pyproject.toml; local probe]` |
| Python stdlib | 3.12 | `dataclasses`, `enum`, `pathlib`, `json`, `hashlib`, `subprocess`, `tempfile`, `os` | 必要 primitive が揃い、runtime dependency を増やさない。`[VERIFIED: project research]` |
| pytest / Hypothesis | existing dev group | fixture tests / pure properties | repo 既存 toolchain。現 worktree では未同期で実行不能だった。`[VERIFIED: pyproject.toml; local probe]` |

### External Boundaries

| Tool | Contract | Role | Availability |
|------|----------|------|--------------|
| Git | CLI argv boundary | source/blob/ignore/worktree の read-only probe | local `2.34.1`。`[VERIFIED: local probe]` |
| OpenSpec | exact `1.3.1` | optional JSON fast path | local `1.3.1`。`[VERIFIED: contract.json; local probe]` |
| GSD Core | exact `1.5.0` | read-only init/capability probe | local `1.5.0`、project root/agents probe 成功。`[VERIFIED: contract.json; local probe]` |

**Installation:** Phase 1 は新規 package を install しない。dev tools が必要なら既存 `uv sync` で同期するが、本 research では実行していない。

## Package Legitimacy Audit

Not applicable。Phase 1 は外部 package を追加しないため registry / postinstall audit 対象はない。`[VERIFIED: pyproject.toml, phase constraints]`

## Architecture Patterns

### System Architecture Diagram

```text
change ID + source commit + validated host verdict
  -> composition root
  -> OpenSpec probe candidate
       -> whole candidate valid? -- no --> fresh directory discovery
       -> explicit terminal state? ------> classified stop/final result
  -> one safe reader -> immutable artifacts + hashes
  -> one progress normalizer -> immutable progress
  -> Git/GSD preflight adapters -> classified capability/source verdicts
  -> structured read-only result
  -> approved caller only -> manifest build -> same-dir staging -> validate -> os.replace
```

### Recommended Project Structure

```text
src/ai_coding_template_ja/openspec_gsd_handoff/
├── __init__.py       # deliberate public surface
├── __main__.py       # thin module entrypoint
├── models.py         # immutable values, enums, classified issues/results
├── discovery.py      # OpenSpec candidate and independent fallback routing
├── reader.py         # containment, bounded UTF-8 bytes, kinds, hashes
├── progress.py       # strict task normalization and parity
├── preflight.py      # injected Git/GSD/OpenSpec command boundaries
└── manifest.py       # schema, deterministic serialization, atomic repository
```

この分割は推奨であり、public symbol の細部は planner の裁量である。`errors.py` を別にするのは taxonomy が `models.py` を肥大化させる場合だけにする。

### Pattern 1: Immutable candidate, adopt-or-discard

JSON route の raw 値を canonical model に直接書き込まず、candidate 全体を検証してから採用する。fallback 開始時は route-local 値を再利用しない。`[VERIFIED: D-09, OpenSpec contract fixtures]`

### Pattern 2: Bounded read once

各 file は binary で上限 + 1 byte まで読み、同じ verified bytes を UTF-8 decode と SHA-256 に使う。`stat()` 後の無制限 `read_text()` や hash 時の再読込を避ける。`[VERIFIED: canonical limits, project PITFALLS.md]`

### Pattern 3: Injected argv runner

subprocess adapter は shell 文字列を作らず、argv、cwd、timeout、exit、stdout bytes、stderr text を明示的な値として扱う。pure parser は command を実行しない。`[VERIFIED: repository subprocess convention, security constraints]`

### Pattern 4: Atomic repository with explicit state guard

manifest value の canonical JSON bytes を作り、target directory 内に staging、再 parse/validate、close 後に `os.replace` する。既存 malformed/incompatible state は上書きしない。directory `fsync`、retry、rollback は保証に追加しない。`[VERIFIED: D-06–D-08]`

### Anti-Patterns to Avoid

- `scripts/doctor.py` の checkbox parser をそのまま再利用しない。既存 parser は indentation と大文字 `X` を許すが、bridge fixture contract は fail-closed を要求する。`[VERIFIED: scripts/doctor.py; fixture README]`
- `isinstance(value, int)` だけで JSON integer を受理しない。Python では `bool` も `int` なので、exact type と非負/invariant を検査する。`[VERIFIED: Python behavior; canonical numeric constraints]`
- resolved path の文字列 prefix 比較、shell interpolation、unbounded recursive glob、JSON/fallback field merge を使わない。`[VERIFIED: project PITFALLS.md]`
- GSD probe の `agent_runtime` や file 在席から host `spawn_agent` schema を推測しない。`[VERIFIED: D-04; local probe returned agent_runtime=claude]`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON / hash | 独自 parser / digest | `json`, `hashlib.sha256` | fixture と標準 primitive に一致する。 |
| path containment | prefix sanitizer | `Path.resolve()` + resolved containment | sibling prefix / symlink escape を防ぐ。 |
| atomic replacement | cross-directory temp rename | `tempfile` in target dir + `os.replace` | same-filesystem boundaryを保つ。 |
| Git model | GitPython や独自 index parser | fixed `git` argv adapter | dependency と mutation surface を増やさない。 |
| lifecycle recovery | retry/resume/rollback engine | classified stop + known-state report | hardening change の ownership を侵さない。 |

## Common Pitfalls

1. **Route poisoning:** fallback result に JSON candidate の path/progress が残る。route-local builder と parity test で防ぐ。
2. **Source drift:** manifest hash が source commit blob でなく working tree bytes を指す。write 直前の blob/bytes 比較を adapter integration test に含める。
3. **TOCTOU/path escape:** resolve/check 後に別 read を行う。verified bytes を一度だけ後段へ渡す。
4. **Partial manifest:** staging validation または replace 失敗後に最終 path/state が進む。fault-injected filesystem seam で防ぐ。
5. **Capability conflation:** GSD installed verdict と host dispatch verdict を混ぜる。別 model/input とする。
6. **Over-broad errors:** stack trace/string parsing だけで caller が route/stop/write 状態を判定できない。stable code/category と known state を返す。
7. **Scope creep:** timestamp、phase ID、mapping、ownership、finalize/recovery state を manifest に足さない。

## Code Examples

```python
# Pattern only: strict numeric boundary (bool is rejected)
def non_negative_int(value: object) -> int:
    if type(value) is not int or value < 0:
        raise ValueError("expected non-negative integer")
    return value
```

```python
# Pattern only: command boundary is argv-based and injectable
completed = runner(
    ["git", "cat-file", "-p", f"{source_commit}:{relative_path}"],
    cwd=repo_root,
    timeout=timeout_seconds,
)
```

## State of the Art

| Existing/old approach | Phase 1 approach | Impact |
|-----------------------|------------------|--------|
| manual handoff only | structured local bridge preparation | repetitive discovery/progress/persistence checks become fixture-testable. |
| permissive general OpenSpec handling | exact 1.3.1 candidate + clean fallback | unknown schema is not guessed. |
| file/version presence as GSD signal | exact version + required files + init probe | partial capability is fail-closed. |

## Assumptions Log

No `[ASSUMED]` claims. Recommendations derive from tracked canonical files, repository code, fixtures, or local read-only probes.

## Open Questions (RESOLVED)

1. **RESOLVED — Public operation names** — expose Python operations `inspect_handoff`, `prepare_handoff`, and `mark_handoff_started`, with CLI operations `inspect`, `prepare`, and `mark-started`. `inspect_handoff` / `inspect` is read-only. `prepare_handoff` / `prepare` persists a `prepared` manifest only after every preflight succeeds. `mark_handoff_started` / `mark-started` atomically transitions `prepared` to `started` only after the caller confirms GSD entrypoint acceptance. This naming decision adds no lifecycle, retry, finalization, or other behavior.
2. **RESOLVED — Repository-policy trackability signal** — accept a caller-supplied explicit `RepositoryPolicyVerdict`; only `tracked` succeeds. A missing, unknown, or false verdict fails closed. Do not infer repository-policy success from `git check-ignore` or any other local Git signal.
3. **RESOLVED — Dev-tool execution** — tool availability is an execution-time gate, not a planning blocker. The execution phase must run the close-to-change pytest targets and `task check`; if either cannot run, report it as unverified and stop phase completion.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Python | bridge runtime | ✓ | 3.12.9 | none needed |
| Git | source/tracking preflight | ✓ | 2.34.1 | fail-closed; no library fallback |
| OpenSpec | optional fast path | ✓ | 1.3.1 | fixed-directory Markdown route per canonical contract |
| GSD Core | capability preflight | ✓ | 1.5.0 | stop and report manual policy; no automatic route switch |

**Unavailable/unchecked:** project dev tools were not synced in this worktree; `task check` and close-to-change tests were not run during research. GSD required-file presence was represented by successful init probe and prior project research, but every required path was not re-enumerated in this bounded pass.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | no identity/auth surface |
| V3 Session Management | no | no session surface |
| V4 Access Control | limited | repository/change containment and explicit approval boundary |
| V5 Input Validation | yes | exact schema/types/invariants, lower-kebab ID, bounded bytes/tasks, resolved containment |
| V6 Cryptography | limited | standard SHA-256 for content identity only; no authenticity claim |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| traversal/symlink escape | Information Disclosure / Tampering | resolve repo/change/file, require regular Markdown file inside both roots, read/hash same bytes |
| command injection | Elevation / Tampering | validated ID, fixed argv, `shell=False`, explicit cwd/timeout |
| unbounded input | Denial of Service | bounded file/count/aggregate/task parsing; never truncate |
| source/manifest mismatch | Tampering / Repudiation | compare source blob and verified bytes, deterministic schema, classified known state |
| partial/stale manifest | Tampering | state guard, same-dir staging, revalidation, atomic replace, cleanup attempt |

Security review is limited to repository-local path, subprocess, Git source, and manifest risks. Authentication, network service, database, and secret-handling features are outside Phase 1. `[VERIFIED: phase boundary]`

## Sources

### Primary (HIGH confidence)

- canonical OpenSpec proposal/design/spec/tasks at commit `5a1f78b81f546c900745328fad24f9adb073e768`
- `.planning/phases/01-bridge-core-persistence-and-preflight/01-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`
- `tests/fixtures/openspec_gsd_handoff/{openspec/contract.json,gsd/contract.json,manifest/expected-prepared.json}`
- `pyproject.toml`, `Taskfile.yml`, `scripts/doctor.py`, `scripts/openspec-validate-gate.py`, repository tree and local read-only probes

### Secondary (MEDIUM confidence)

- `.planning/research/SUMMARY.md` and its already-verified official OpenSpec/GSD documentation cross-checks; current upstream details are not substituted for pinned contracts.

### Tertiary (LOW confidence)

- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — repository config and local versions directly checked.
- Architecture: HIGH — locked CONTEXT decisions and fixed package/fixture seams.
- Pitfalls: HIGH — canonical negative contracts and existing parser/probe evidence.

**Research date:** 2026-07-15
**Valid until:** source commit or Phase 1 CONTEXT changes; upstream version changes do not alter the pinned contract automatically.
