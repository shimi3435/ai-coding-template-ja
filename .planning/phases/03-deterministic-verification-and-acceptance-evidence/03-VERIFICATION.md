---
phase: 03-deterministic-verification-and-acceptance-evidence
verified: 2026-07-15T16:50:42Z
status: gaps_found
score: 10/13 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 13/13
  gaps_closed:
    - regular-file, FIFO, and directory descriptor race variants
    - literal duplicate evidence sections and basic fence/path leakage variants
  gaps_remaining:
    - symlink-target pathname TOCTOU
    - semantic mapping and host-claim sections are ignored
    - multiline raw probe and POSIX root path variants are accepted
  regressions: []
gaps:
  - truth: "Repository fingerprint detects symlink-target drift from stable bytes"
    status: failed
    reason: "The symlink branch reads by mutable pathname; substitution-and-restore returns SnapshotSuccess with replacement target bytes."
    artifacts:
      - path: "src/ai_coding_template_ja/openspec_gsd_handoff/smoke.py"
        issue: "readlink(name, dir_fd=...) is not pinned to the original symlink descriptor"
    missing:
      - "Pin symlink identity/target reads and add a substitution-and-restore regression."
  - truth: "Host observations remain exclusively and separately reasoned-unverified"
    status: failed
    reason: "Semantically equivalent host-claim headings can coexist with the required unverified table while validation remains ok."
    artifacts:
      - path: "scripts/validate-handoff-acceptance-evidence.py"
        issue: "Only headings beginning with Host are rejected outside the required section"
    missing:
      - "Reject every unrecognized table-bearing section and host claim regardless of heading word order."
  - truth: "Acceptance mapping validator fails closed on duplicate/unknown/leaked/raw evidence"
    status: failed
    reason: "Alternate mapping tables, pretty-printed probe JSON, and POSIX network/root path variants are accepted."
    artifacts:
      - path: "scripts/validate-handoff-acceptance-evidence.py"
        issue: "Semantic sections and multiline/path leakage variants are outside current detection"
    missing:
      - "Validate all table-bearing sections and reject multiline raw probe plus // and bare-root paths."
---

# Phase 3: Deterministic Verification and Acceptance Evidence Verification Report

**Phase Goal:** canonical `tasks.md` heading `## 4. Test phase` と source commit を唯一の規範として、deterministic CI、opt-in smoke、OpenSpec acceptance 用 evidence の検証境界を成立させる
**Verified:** 2026-07-15T16:50:42Z
**Status:** gaps_found
**Re-verification:** Yes — security remediation commits through `0164621`

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | `VERIFY-01` は canonical path、`## 4. Test phase`、source commit `5a1f78b81f546c900745328fad24f9adb073e768` へ追跡できる | ✓ VERIFIED | `.planning/REQUIREMENTS.md`、両 PLAN、evidence header が同じ path/heading/SHA を参照。SHA は commit として存在し HEAD の ancestor。proposal/design/spec の worktree drift はなし。 |
| 2 | deterministic CI、opt-in smoke、理由付き未検証が OpenSpec acceptance で照合可能に整理される | ✓ VERIFIED | source-pinned validator の実行結果は `requirements=5, scenarios=26, spec_holes=60, host_unverified=4`、exit 0。 |
| 3 | GSD Phase 3 完了を OpenSpec change の最終完了と主張しない | ✓ VERIFIED | `03-ACCEPTANCE-EVIDENCE.md` の Authority boundary は tasks 5.1/5.2 を main/orchestrator に残す。canonical tasks 4.1/4.2、5.1/5.2、6.1 は未チェックのまま。 |
| 4 | normal `task check` は optional tools から独立し、実 tool は明示 opt-in task だけが所有する | ✓ VERIFIED | `Taskfile.yml` の `check` は Ruff format/check、basedpyright、pytest の4コマンドだけ。`openspec:gsd-handoff:smoke` は独立 task。 |
| 5 | opt-in smoke は OpenSpec 1.3.1 JSON と GSD 1.5.0 composite signal だけを受け付け、mutable operation を呼ばない | ✓ VERIFIED | 実 smoke は versions 1.3.1/1.5.0、route `json`、probe `init-progress-raw`、entrypoint signal `gsd-phase`、exit 0。production argv は3つの read-only commandsだけで、prepare/manifest/brief/dispatch/mark-started import・call はない。 |
| 6 | `.git` 以外の repo entry を before/after fingerprint し、add/delete/bytes/mode/type/symlink-target drift を検出する | ✗ FAILED | regular/FIFO/directory race fixesは通過したが、symlinkを`readlink()`時だけ差し替えて元inodeへ戻すdirect probeは `SnapshotSuccess` となり、replacement target digestと一致した。 |
| 7 | isolated `check:without-gsd` は optional launchers/config を不可視にして実 `task check` を通す | ✓ VERIFIED | 実行 exit 0。curated PATH で node/openspec/npm/npx/gsd launchers 不在、empty HOME/CODEX_HOME/GSD_HOME、UV_OFFLINE=1 の nested `task check` が 280 tests を通過。 |
| 8 | smoke output は one-object JSON + one-line human summary、redacted/relative-only evidenceである | ✓ VERIFIED | actual smoke と `test_supported_smoke_reports_only_bounded_redacted_evidence` で確認。command は `${GSD_HOME}`、artifact paths は repo-relative、canonical body/raw probe/home path は出力されない。 |
| 9 | actual host prompt、generic spawn、real GSD mutation、route postconditionsを smoke 成功から推論せず別々に未検証とする | ✗ FAILED | 正規4行は正しいが、`## Actual host verified`等のcontradictory tableを追記してもvalidatorが`ok`を返すため、document全体としてexclusiveな未検証境界を強制できない。 |
| 10 | JSON/fallback は sorted identity/hash/canonical bytes/progress が一致し route label だけ異なる | ✓ VERIFIED | `test_positive_json_and_fallback_share_values_but_keep_distinct_routes` を含む focused suite 202 tests が通過。 |
| 11 | operator guidance は exact opt-in invocation、inputs、streams、read-only boundary、normal-CI isolationを示す | ✓ VERIFIED | `docs/optional/gsd.md` は CHANGE_ID/GSD_HOME、version、stdout/stderr、allowed probes、forbidden mutations、未検証4件を記載。 |
| 12 | 全5 requirements、26 scenarios、60 spec-hole rows と4 host-unverified rowsが具体 evidence/dispositionへ一意に対応する | ✗ FAILED | tracked matrix自身は5/26/60+4でcleanだが、`Alternate requirements`/`Requirements appendix`のR999 table、pretty probe JSON、`//srv/...`を追記してもvalidatorが`ok`を返す。fail-closed exact document contractは未達。 |
| 13 | evidence authority は fixed 40-hex source commit の bounded pinned blobsで、worktree driftは座標やleakage authorityを変更しない | ✓ VERIFIED | fixed argv/source pin/blob bounds/drift authorityは維持され、55 validator testsはgreen。残るsemantic/leak gapsはtruth 12へ計上。 |

**Score:** 10/13 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/ai_coding_template_ja/openspec_gsd_handoff/smoke.py` | injected, bounded, strictly read-only smoke | ⚠ PARTIAL | 547 lines。L1/L2/L3は成立しbenign actual smokeもpass。symlink-target stable-readだけ未達。 |
| `scripts/openspec-gsd-handoff-smoke.py` | thin explicit CLI | ✓ VERIFIED | argparse validation + one `run_smoke` delegation; no tool parsing/mutation。 |
| `tests/test_handoff_smoke.py` | allowlist/version/signal/mutation/redaction evidence | ⚠ PARTIAL | 22 testsはgreen。regular/FIFO/directory race regressionsはあるがsymlink substitution-and-restore regressionがない。 |
| `Taskfile.yml` | isolated opt-in and no-GSD check | ✓ VERIFIED | explicit tasks are listed; normal check has no dependency/link. |
| `tests/test_taskfile.py` | task wiring/isolation contract | ✓ VERIFIED | smoke and isolated nested check contractsを検査。 |
| `docs/optional/gsd.md` | operator contract and limitations | ✓ VERIFIED | exact invocation/read-only scope/final authority boundaryを記載。 |
| `tests/test_handoff_discovery.py` | exact route parity projection | ✓ VERIFIED | kind/path/SHA/content bytes/progress equality + distinct routeをassert。 |
| `scripts/validate-handoff-acceptance-evidence.py` | source-pinned fail-closed validator | ⚠ PARTIAL | 520 lines。fixed source/required sections/basic leakageは成立。semantic sectionsとmultiline/root variantsが未達。 |
| `tests/test_handoff_acceptance_evidence.py` | validator positive/negative contract | ⚠ PARTIAL | 55 testsはgreenだが、direct re-auditで再現したsemantic/raw variantsをまだ固定していない。 |
| `03-ACCEPTANCE-EVIDENCE.md` | complete source-pinned traceability | ✓ VERIFIED | validatorで 5/26/60+4 exact、absolute path/raw bodyなし。 |

`verify.artifacts` は Plan 03-01 が 5/5、Plan 03-02 が 5/5 (`all_passed=true`)。

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `smoke.py` | `preflight.py` | `collect_openspec_probe` / `collect_gsd_probe` / `parse_gsd_capability` | ✓ WIRED | 実呼び出しと actual smokeで確認。 |
| `smoke.py` | `discovery.py` | `discover_openspec_artifacts` + JSON route requirement | ✓ WIRED | fallbackをreal-contract successにしない。 |
| `Taskfile.yml` | smoke CLI | explicit `uv run --no-sync` | ✓ WIRED | actual task exit 0。 |
| `docs/optional/gsd.md` | `Taskfile.yml` | exact task invocation | ✓ WIRED | task name/inputs一致。 |
| acceptance evidence | canonical spec | Rn/Snn coordinates at source pin | ✓ WIRED | 5/26 exact。 |
| acceptance evidence | canonical design | Rn-Hnn coordinates | ✓ WIRED | 60 exact。 |
| validator | canonical spec/design | bounded fixed-argv Git blob reads | ✓ WIRED | actual CLI exit 0。 |

`verify.key-links` は Plan 03-01 が 3/3、Plan 03-02 が 4/4 (`all_verified=true`)。

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Output | Status |
| --- | --- | --- | --- | --- |
| `smoke.py` | tool capability + artifacts/progress + snapshot | Phase 1 parsers and before/after repository scan | bounded `SmokeResult` -> JSON/human renderers | ✓ FLOWING |
| acceptance validator | pinned proposal/design/spec bytes | fixed `git show` argv at `5a1f78b...` | exact coordinates -> structured verdict | ✓ FLOWING |

UI/data-rendering componentはないため、component/DB向け Level 4 trace は非該当。

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Phase 1/2/3 focused behavior | `uv run pytest tests/test_handoff_core.py ... tests/test_handoff_acceptance_evidence.py -q` | 202 passed | ✓ PASS |
| symlink substitution-and-restore | in-memory temp repo adversarial probe | `SnapshotSuccess`; replacement digest matched | ✗ FAIL |
| semantic/raw acceptance variants | in-memory real validator probes | alternate-map/host-claim/pretty-probe/network-root all `ok` | ✗ FAIL |
| acceptance matrix | `uv run --no-sync python scripts/validate-handoff-acceptance-evidence.py ...` | 5/26/60+4, exit 0 | ✓ PASS |
| strict canonical validation | `openspec validate automate-openspec-gsd-handoff --strict` | valid, exit 0 | ✓ PASS |
| project OpenSpec gate | `task openspec:validate` | 1 passed / 0 failed | ✓ PASS |
| isolated normal gate | `task check:without-gsd` | nested Ruff/basedpyright/280 pytest passed | ✓ PASS |

Full workspace test commandは `check:without-gsd` 内の nested `task check` として1回だけ実行した。

### Probe Execution

| Probe | Command | Result | Status |
| --- | --- | --- | --- |
| real read-only OpenSpec/GSD smoke | `task openspec:gsd-handoff:smoke CHANGE_ID=automate-openspec-gsd-handoff GSD_HOME="$HOME/.codex"` | 静止状態でOpenSpec 1.3.1; GSD 1.5.0; route json; initialized gsd-phase; 13,994 entries; `write_detected=false`; exit 0 | PASS |

最初の再実行は並行security auditのtest/cache更新を正しく`repository-write-detected`として拒否した。audit側停止後の上表の再実行でproduct probeを確定した。

Actual host prompt、generic-agent spawn、real GSD mutation、route-specific postconditionsはこの probe の対象外で、実行済みとは判定していない。

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| VERIFY-01 | 03-01, 03-02 | canonical `tasks.md` `## 4. Test phase` at source commitへのproxy | ✗ BLOCKED | source pinとtracked matrixは成立するが、snapshot stabilityとfail-closed acceptance document contractにmachine-reproduced gapsが残る。 |

Phase 3 に割り当てられた orphaned requirement はない。後続 phase もないため deferred gap はない。

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| Phase 3 changed code/tests/docs | — | `TBD` / `FIXME` / `XXX` / `TODO` / `HACK` / placeholder | — | 該当なし。 |

Mutable operation scanでは production additions に prepare、manifest persistence、mark-started、GSD dispatch、retry/resume/rollback/finalize/cleanup/push/PR/merge callはない。`harden-openspec-gsd-handoff-lifecycle` pathの変更もない。

### Disconfirmation Pass

- **部分要件:** descriptor remediationはregular/FIFO/directory racesを閉じたが、symlink branchはmutable pathname `readlink()`が残りfail。
- **誤解し得るtest:** fake-runner smokeだけではinstalled tool compatibilityを証明しない。独立したactual opt-in smokeを再実行し、exact versions/signalsと無変更を確認。
- **未被覆error path:** literal duplicate/basic leakage testsはgreenだが、semantic table headingsとmultiline/raw root variantsがfail-open。direct validator probeで確認。

### Human Verification Required

なし。残る3 gapsはすべてmachine-reproducedであり、人手確認では解消しない。actual host behavior自体は引き続きreasoned-unverifiedである。

### Gaps Summary

3 must-have truthsが未達。regular/FIFO/directory、literal duplicate section、basic fence/path remediationは回帰なくgreenだが、symlink-target TOCTOU、semantic mapping/host claims、multiline raw/root path variantsが残る。`block_on: high`のsecurity findingsと一致するためPhase 3をpassedへ戻せない。OpenSpec tasks 4.1以降の完了マークとfinal acceptance/closeは実施していない。harden/lifecycleは引き続き対象外。

---

_Verified: 2026-07-15T16:50:42Z_
_Verifier: the agent (gsd-verifier; generic-agent workaround)_
