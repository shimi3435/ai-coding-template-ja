---
phase: 02-approval-gated-skill-orchestration
verified: 2026-07-15T10:32:41Z
status: passed
score: 22/22 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 2: Approval-Gated Skill Orchestration Verification Report

**Phase Goal:** canonical `tasks.md` heading `## 3. Skill phase` と source commit を唯一の規範として、approval-gated skill orchestration の実装・検証境界を Phase 1 の seam 上で成立させる
**Verified:** 2026-07-15T10:32:41Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Phase 2 の plan、変更、検証証拠から `SKILL-01` の canonical path、heading、source commit へ追跡できる | ✓ VERIFIED | `REQUIREMENTS.md`、両 PLAN、`02-CONTEXT.md` が `openspec/.../tasks.md` の `## 3. Skill phase` と `5a1f78b...` を参照する。source commit の proposal/design/spec は現作業木と同一で、tasks の差分は境界 checkbox の進捗だけ。 |
| 2 | Phase 2 の証拠は approval-gated skill orchestration の境界に限定され、Phase 1 契約や OpenSpec 規範本文を再定義しない | ✓ VERIFIED | Phase 2 の実変更は SKILL/fixture/static tests/lock/symlinks/guidance に限定され、`e0f2757..HEAD -- src scripts` に差分なし。SKILL は Phase 1 の 3 public operations を参照し、仕様本文を payload に複製しない。 |
| 3 | runtime 固有の判断と検証結果を区別し、scope 変更時に OpenSpec gate へ戻せる | ✓ VERIFIED | SKILL、fixture、AGENTS、両 guidance が static/Phase 1 seam と actual host evidence を分離し、actual host evidence を Phase 3 に割り当てる。 |
| 4 | `execute-openspec-change` は `.agents/skills` を正本とする first-party skill | ✓ VERIFIED | canonical SKILL は `.agents/skills/execute-openspec-change/SKILL.md` に存在し、lock は `source_type=local`, `source=local (first-party)`。 |
| 5 | skill は preview、runtime-host inspection、explicit approval、GSD dispatch を所有し、bridge mechanics は Phase 1 seam を再利用する | ✓ VERIFIED | SKILL の ordered stages と `inspect_handoff` / `prepare_handoff` / `mark_handoff_started` 参照を実体確認。Phase 2 に Python bridge 差分なし。 |
| 6 | structured Phase 1 values と classified codes を使い、prose または exit 0 単独に依存しない | ✓ VERIFIED | SKILL は structured success/known state/classified gaps を要求し、prose marker と exit 0 を supplemental に限定。static contract tests が green。 |
| 7 | mutation 前に complete read-only preview を一度表示する instruction contract | ✓ VERIFIED | `capture-input` → `inspect-host` → `inspect-bridge` → `resolve-dispatch` → `preview` → `approve` の順序と 13 preview fields を fixture/test/SKILL で照合。fallback cause は表示しない。 |
| 8 | complete preview 後の fresh explicit answer だけが prepare を許可する | ✓ VERIFIED | forbidden substitutes 5 種を fixture と SKILL が列挙。`test_approval_contract_requires_fresh_answer_and_freezes_preview_tuple` が通過。 |
| 9 | inspect failure/refusal/no-answer は mutable stages 前に停止し、classified gaps と manual guidance を返す | ✓ VERIFIED | `terminal_before_mutation` fixture と SKILL が prepare/brief/dispatch/mark-started を到達不能と定義。static test 通過。 |
| 10 | frozen preview tuple を prepare へ再送し、structured prepared success 前に GSD action を行わない | ✓ VERIFIED | `prepare_gate` は `ok=true`, `operation=prepare`, `known_state=prepared` の全件一致を要求。SKILL の stage order と fixture equality を確認。 |
| 11 | 両 GSD route が同じ完全な parity payload を受け取る | ✓ VERIFIED | fixture の uninitialized idea payload と initialized inline payload は同一 object。7 fields と全 4 canonical paths をテストが equality 比較。 |
| 12 | GSD acceptance は structured completed-success と route-specific read-only postcondition の conjunction | ✓ VERIFIED | acceptance matrix は marker/checkpoint/empty/malformed/partial/ambiguous/failure/mismatch を prepared retention とする。Phase 1 の prepared→started seam は動的テストで通過。 |
| 13 | generic dispatch は local GSD 1.5.0 workflow、全 reachable spawn TOML preamble、isolation を approval 前に解決する | ✓ VERIFIED | SKILL と fixture が active config root 優先順、2 entrypoint workflow、3 reachable uninitialized spawn、complete preamble、fail-closed 7 cases を一致して保持。 |
| 14 | manifest success report は path/source/later tracking commit を示し、自動 commit しない | ✓ VERIFIED | SKILL の report stage と fixture/test が `manifest-path`, `source-commit`, distinct later commit、`automatic_git_commit=false` を固定。 |
| 15 | Phase 2 evidence は static instruction contract と Phase 1 dynamic seam に限定し、actual host orchestration を Phase 3 に残す | ✓ VERIFIED | SKILL の Evidence limits、fixture `evidence_scope`、AGENTS、両 guidance、両 SUMMARY が同じ境界を明記。Phase 3 roadmap は deterministic/opt-in evidence を所有。 |
| 16 | lock SHA-256 が final SKILL.md bytes と一致する | ✓ VERIFIED | lock/actual とも `f456311687c476ec807d5e28eb8e2c89a179a449e99ff69f34f482c62ef4ff51`。 |
| 17 | Claude と Codex は同じ canonical skill を relative symlink 経由で解決する | ✓ VERIFIED | 両 literal target は `../../.agents/skills/execute-openspec-change`、両 resolved path は同じ canonical directory。 |
| 18 | agent/operator guidance は preview、approval、parity payload、prepared retention を一致して案内する | ✓ VERIFIED | AGENTS.md、`docs/agents/workflow.md`、`docs/optional/gsd.md` の該当節を相互照合。 |
| 19 | guidance は structured completion と route postcondition を acceptance とし、prose-only を拒否する | ✓ VERIFIED | workflow lines 82–99 と optional GSD lines 66–75 が両 route postcondition を具体化。 |
| 20 | guidance は generic-agent workaround を typed dispatch と同等扱いせず fail-closed boundary を示す | ✓ VERIFIED | workflow lines 101–106、optional GSD lines 80–84、SKILL resolve-dispatch が一致。 |
| 21 | guidance は handoff start で停止し、lifecycle/final completion/retry/recovery/cleanup を約束しない | ✓ VERIFIED | SKILL は禁止 operation を否定形で列挙。guidance も automation しないと明記。Phase 2 に lifecycle 実装・script 差分なし。 |
| 22 | guidance は actual host orchestration を Phase 2 で未検証、Phase 3 opt-in/manual evidence 所有とする | ✓ VERIFIED | AGENTS.md lines 45–46、workflow lines 119–121、optional GSD lines 90–92、および fixture evidence scope が一致。 |

**Score:** 22/22 truths verified (0 present, behavior-unverified)

## Evidence Boundary Decision

実 host prompt、generic-agent spawn、実 `$gsd-new-project` / `$gsd-phase` mutation、route-specific postcondition は実行していないため、実 host/GSD orchestration としては未検証である。これは Phase 2 の欠落ではない。Phase 2 の PLAN must-have 自体が static instruction contract と既存 Phase 1 state seam を成果境界として定め、ROADMAP の Phase 3 が deterministic CI、opt-in smoke、OpenSpec acceptance evidence を所有しているためである。

したがって、Phase 2 の `passed` は「実 host orchestration が動作確認済み」を意味しない。Phase 3 の opt-in/manual evidence が得られるまで、その主張は行わない。

## Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `.agents/skills/execute-openspec-change/SKILL.md` | first-party approval-gated orchestration instruction contract | ✓ VERIFIED | 261 lines。9 ordered stages、conservative acceptance、generic preflight、evidence limits を持つ。dual-runtime links、tests、guidance から参照。 |
| `tests/fixtures/openspec_gsd_handoff/skill/contract.json` | ordered stages、payload、acceptance、report matrix | ✓ VERIFIED | 325 linesの valid JSON。static tests が全主要 field を消費。 |
| `tests/test_execute_openspec_change_skill.py` | static executable-instruction contract checks | ✓ VERIFIED | 418 lines、17 tests。focused/full suite とも green。 |
| `.agents/skills/skills.lock.json` | local provenance と exact digest | ✓ VERIFIED | local/MIT/allowed metadata と exact SHA-256 を確認。 |
| `.claude/skills/execute-openspec-change` | canonical skill への relative symlink | ✓ VERIFIED | symlink、literal target、resolved identity を確認。 |
| `.codex/skills/execute-openspec-change` | canonical skill への relative symlink | ✓ VERIFIED | symlink、literal target、resolved identity を確認。 |
| `tests/test_skills_lock.py` | lock/hash/distribution regression | ✓ VERIFIED | focused first-party assertionと既存 orphan/hash/link gates が通過。 |
| `AGENTS.md` | concise agent routing guidance | ✓ VERIFIED | optional entry、input route、fresh approval、Phase 2/3 evidence boundaryを記載。 |
| `docs/agents/workflow.md` | authoritative operator sequence | ✓ VERIFIED | exact parity payload、両 postcondition、generic fail-closed、retentionを記載。 |
| `docs/optional/gsd.md` | opt-in user guidance | ✓ VERIFIED | workflow と同じ boundary を簡潔に案内。 |

## Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| SKILL.md | Phase 1 `__init__.py` | 3 public operation names | ✓ WIRED | operation namesは public `__all__` と一致。Phase 1 focused tests green。 |
| SKILL.md | GSD contract fixture | version/routes/probe | ✓ WIRED | `1.5.0`, `init progress --raw`, two entrypoints が一致。 |
| static tests | skill fixture | `contract.json` load + assertions | ✓ WIRED | `CONTRACT_PATH` を読み、ordered stages/payload/acceptance/reportを検査。 |
| skills lock | canonical SKILL.md | local entry + SHA-256 | ✓ WIRED | actual digest と一致。 |
| Claude symlink | canonical skill | relative target | ✓ WIRED | literal/real path とも一致。 |
| Codex symlink | canonical skill | relative target | ✓ WIRED | literal/real path とも一致。 |
| workflow guidance | canonical skill | named entrypoint/boundary | ✓ WIRED | skill 名、ordered flow、evidence limits が一致。 |

## Data-Flow Trace (Level 4)

該当なし。Phase 2 は UI/dynamic-data artifact ではなく、instruction/fixture/distribution/guidance contract である。

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Phase 2 static contract + Phase 1 seam + distribution | `uv run pytest tests/test_execute_openspec_change_skill.py tests/test_handoff_cli.py tests/test_handoff_preflight.py tests/test_skills_lock.py tests/test_setup_skills.py -q` | 78 passed | ✓ PASS |
| workspace quality/test gate | `task check` | format/Ruff/basedpyright green、201 passed | ✓ PASS |
| canonical OpenSpec validation | `task openspec:validate` | 1 passed、0 failed | ✓ PASS |
| lock/link identity | `sha256sum` / `readlink` / `readlink -f` inspection | digest と両 target/resolution が一致 | ✓ PASS |

## Probe Execution

Phase 2 の PLAN/SUMMARY に実行対象の `probe-*.sh` 宣言はない。実 host/GSD probe は Phase 3 opt-in/manual evidence の範囲なので、本検証では実行していない。

## TDD Commit History

| Slice | RED | GREEN | Verification |
|---|---|---|---|
| preview/approval | `3eac8bb` | `f70a803` | RED 時点で canonical SKILL 自体が存在せず、GREEN で ordered preview/approval stages を追加。 |
| prepared/parity route | `38a7eb6` | `194b44e` | RED 時点の SKILL に `PARITY_PAYLOAD` なし。GREEN で common payload dispatch を追加。 |
| conservative acceptance | `df9e8bf` | `5a30500` | RED 時点に structured completion + route postcondition contract なし。GREEN で追加。 |
| generic/report | `2a07637` | `3fc8f50` | RED 時点に complete TOML preamble/fail-closed contract なし。GREEN で追加。 |
| distribution | `fa49eeb` | `e82d959` | RED 時点に lock entry と両 runtime links なし。GREEN で exact digest と links を追加。 |

全 RED commit は対応 GREEN より先にあり、`bd0bad5` が review 中に発見した canonical-path freeze ordering を追加修正している。

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| SKILL-01 | 02-01, 02-02 | source commit `5a1f78b...` の canonical `tasks.md` `## 3. Skill phase` への proxy | ✓ SATISFIED | source-pinned traceability、canonical skill、static contract、Phase 1 seam tests、lock/symlinks/guidance が成立。orphaned Phase 2 requirement なし。 |

現在の canonical `tasks.md` の 3.1 checkbox は未チェックである。これは Phase 2 verifier が変更を許可されていない OpenSpec 境界進捗であり、実装欠落の証拠ではない。main/orchestrator が本 verification を受け入れた後に更新する境界として残っている。

## Scope and Prohibition Check

| Prohibition | Status | Evidence |
|---|---|---|
| lifecycle hardening / post-handoff automation | ✓ ABSENT | Phase 2 commit rangeに production Python/script 差分なし。SKILL/guidance は明示的に scope out。 |
| automatic retry / rollback / route switch | ✓ ABSENT | fixture は false/forbidden、SKILL と guidance は否定形のみ。 |
| automatic finalize / cleanup | ✓ ABSENT | forbidden operations に含まれ、実装なし。 |
| automatic Git commit / push / PR / merge | ✓ ABSENT | tracking commit は operator action として案内するだけ。SKILL は Git commit を実行しないと明記。 |

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| — | — | Phase 2 変更ファイルに unreferenced `TBD` / `FIXME` / `XXX`、placeholder、empty implementation なし | — | Blocker なし。 |

Disconfirmation pass では、static tests の一部が禁止 token の「存在」を検査し、否定文としての意味までは実行しない点を確認した。ただし actual SKILL 本文を独立に読み、該当 token が `Do not perform or promise` / `never execute` の禁止文脈にあることを確認した。actual host failure path が通常 CI で未実行である点は隠さず、上記 Evidence Boundary と Phase 3 ownership に記録した。

## Human Verification Required

なし。actual host/GSD orchestration は Phase 2 の human item ではなく、Phase 3 の明示的な opt-in/manual verification scope である。

## Gaps Summary

Phase 2 goal を妨げる gap は見つからなかった。Phase 2 は static instruction/distribution contract と Phase 1 dynamic state seam の境界として成立している。実 host orchestration の有効性は未検証であり、Phase 3 完了前に検証済みと扱ってはならない。

---

_Verified: 2026-07-15T10:32:41Z_
_Verifier: the agent (gsd-verifier)_
