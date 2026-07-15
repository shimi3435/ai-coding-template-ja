---
phase: 03-deterministic-verification-and-acceptance-evidence
verified: 2026-07-15T17:07:42Z
status: passed
score: 13/13 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 10/13
  gaps_closed:
    - symlink-target pathname TOCTOU
    - semantic mapping and host-claim section fail-open variants
    - multiline raw probe and POSIX network/root path variants
  gaps_remaining: []
  regressions: []
---

# Phase 3: Deterministic Verification and Acceptance Evidence Verification Report

**Phase Goal:** canonical `tasks.md` heading `## 4. Test phase` と source commit を唯一の規範として、deterministic CI、opt-in smoke、OpenSpec acceptance 用 evidence の検証境界を成立させる
**Verified:** 2026-07-15T17:07:42Z
**Status:** passed
**Re-verification:** Yes — remediation-2 commits through `bde6b74`

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | `VERIFY-01` は canonical path、`## 4. Test phase`、source commit `5a1f78b81f546c900745328fad24f9adb073e768` へ追跡できる | ✓ VERIFIED | `.planning/REQUIREMENTS.md`、両 PLAN、evidence header が同じ path/heading/SHA を参照。SHA は commit として存在し HEAD の ancestor。proposal/design/spec の worktree drift はなし。 |
| 2 | deterministic CI、opt-in smoke、理由付き未検証が OpenSpec acceptance で照合可能に整理される | ✓ VERIFIED | source-pinned validator の実行結果は `requirements=5, scenarios=26, spec_holes=60, host_unverified=4`、exit 0。 |
| 3 | GSD Phase 3 完了を OpenSpec change の最終完了と主張しない | ✓ VERIFIED | `03-ACCEPTANCE-EVIDENCE.md` の Authority boundary は tasks 5.1/5.2 を main/orchestrator に残す。canonical tasks 4.1/4.2、5.1/5.2、6.1 は未チェックのまま。 |
| 4 | normal `task check` は optional tools から独立し、実 tool は明示 opt-in task だけが所有する | ✓ VERIFIED | `Taskfile.yml` の `check` は Ruff format/check、basedpyright、pytest の4コマンドだけ。`openspec:gsd-handoff:smoke` は独立 task。 |
| 5 | opt-in smoke は OpenSpec 1.3.1 JSON と GSD 1.5.0 composite signal だけを受け付け、mutable operation を呼ばない | ✓ VERIFIED | 実 smoke は versions 1.3.1/1.5.0、route `json`、probe `init-progress-raw`、entrypoint signal `gsd-phase`、exit 0。production argv は3つの read-only commandsだけで、prepare/manifest/brief/dispatch/mark-started import・call はない。 |
| 6 | `.git` 以外の repo entry を before/after fingerprint し、add/delete/bytes/mode/type/symlink-target drift を検出する | ✓ VERIFIED | symlinkは`O_PATH|O_NOFOLLOW` descriptorへpinし、`readlink("", dir_fd=...)`とdescriptor/path identityを検査。substitution-and-restore direct probeはoriginal baseline digestを保持しreplacement digestと不一致。 |
| 7 | isolated `check:without-gsd` は optional launchers/config を不可視にして実 `task check` を通す | ✓ VERIFIED | 実行 exit 0。curated PATH で node/openspec/npm/npx/gsd launchers 不在、empty HOME/CODEX_HOME/GSD_HOME、UV_OFFLINE=1 の nested `task check` が 300 tests を通過。 |
| 8 | smoke output は one-object JSON + one-line human summary、redacted/relative-only evidenceである | ✓ VERIFIED | actual smoke と `test_supported_smoke_reports_only_bounded_redacted_evidence` で確認。command は `${GSD_HOME}`、artifact paths は repo-relative、canonical body/raw probe/home path は出力されない。 |
| 9 | actual host prompt、generic spawn、real GSD mutation、route postconditionsを smoke 成功から推論せず別々に未検証とする | ✓ VERIFIED | exact six-section schema、word-boundary host heading rejection、正規4 ordered rowsを強制。`Actual host verified` direct probeは`evidence-section-invalid`。actual host behavior自体を検証済みとはしていない。 |
| 10 | JSON/fallback は sorted identity/hash/canonical bytes/progress が一致し route label だけ異なる | ✓ VERIFIED | `test_positive_json_and_fallback_share_values_but_keep_distinct_routes` を含む focused suite 222 tests が通過。 |
| 11 | operator guidance は exact opt-in invocation、inputs、streams、read-only boundary、normal-CI isolationを示す | ✓ VERIFIED | `docs/optional/gsd.md` は CHANGE_ID/GSD_HOME、version、stdout/stderr、allowed probes、forbidden mutations、未検証4件を記載。 |
| 12 | 全5 requirements、26 scenarios、60 spec-hole rows と4 host-unverified rowsが具体 evidence/dispositionへ一意に対応する | ✓ VERIFIED | tracked matrixは5/26/60+4でvalidator exit 0。alternate mapping/host tableは`evidence-section-invalid`、pretty JSONは`raw-output-forbidden`、`//srv/...`は`absolute-path-leak`をdirect probeで確認。 |
| 13 | evidence authority は fixed 40-hex source commit の bounded pinned blobsで、worktree driftは座標やleakage authorityを変更しない | ✓ VERIFIED | fixed argv/source pin/blob bounds/drift authorityは維持され、73 validator testsがgreen。 |

**Score:** 13/13 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/ai_coding_template_ja/openspec_gsd_handoff/smoke.py` | injected, bounded, strictly read-only smoke | ✓ VERIFIED | 563 lines。L1/L2/L3とdescriptor-pinned symlink target behaviorを確認。 |
| `scripts/openspec-gsd-handoff-smoke.py` | thin explicit CLI | ✓ VERIFIED | argparse validation + one `run_smoke` delegation; no tool parsing/mutation。 |
| `tests/test_handoff_smoke.py` | allowlist/version/signal/mutation/redaction evidence | ✓ VERIFIED | 24 tests。regular/FIFO/directory/symlink descriptor race regressionsを含みgreen。 |
| `Taskfile.yml` | isolated opt-in and no-GSD check | ✓ VERIFIED | explicit tasks are listed; normal check has no dependency/link. |
| `tests/test_taskfile.py` | task wiring/isolation contract | ✓ VERIFIED | smoke and isolated nested check contractsを検査。 |
| `docs/optional/gsd.md` | operator contract and limitations | ✓ VERIFIED | exact invocation/read-only scope/final authority boundaryを記載。 |
| `tests/test_handoff_discovery.py` | exact route parity projection | ✓ VERIFIED | kind/path/SHA/content bytes/progress equality + distinct routeをassert。 |
| `scripts/validate-handoff-acceptance-evidence.py` | source-pinned fail-closed validator | ✓ VERIFIED | 536 lines。exact section schema、balanced raw JSON、quoted probe fields、POSIX/network/root path checksを実装。 |
| `tests/test_handoff_acceptance_evidence.py` | validator positive/negative contract | ✓ VERIFIED | 73 tests。前回re-audit variantsを固定しgreen。 |
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
| Phase 1/2/3 focused behavior | `uv run pytest tests/test_handoff_core.py ... tests/test_handoff_acceptance_evidence.py -q` | 222 passed | ✓ PASS |
| symlink substitution-and-restore | in-memory temp repo adversarial probe | original baseline digest retained; replacement digest rejected | ✓ PASS |
| semantic/raw acceptance variants | in-memory real validator probes | section-invalid / raw-output-forbidden / absolute-path-leak | ✓ PASS |
| acceptance matrix | `uv run --no-sync python scripts/validate-handoff-acceptance-evidence.py ...` | 5/26/60+4, exit 0 | ✓ PASS |
| strict canonical validation | `openspec validate automate-openspec-gsd-handoff --strict` | valid, exit 0 | ✓ PASS |
| project OpenSpec gate | `task openspec:validate` | 1 passed / 0 failed | ✓ PASS |
| isolated normal gate | `task check:without-gsd` | nested Ruff/basedpyright/300 pytest passed | ✓ PASS |

Full workspace test commandは `check:without-gsd` 内の nested `task check` として1回だけ実行した。

### Probe Execution

| Probe | Command | Result | Status |
| --- | --- | --- | --- |
| real read-only OpenSpec/GSD smoke | `task openspec:gsd-handoff:smoke CHANGE_ID=automate-openspec-gsd-handoff GSD_HOME="$HOME/.codex"` | 静止状態でOpenSpec 1.3.1; GSD 1.5.0; route json; initialized gsd-phase; 13,995 entries; `write_detected=false`; exit 0 | PASS |

Actual host prompt、generic-agent spawn、real GSD mutation、route-specific postconditionsはこの probe の対象外で、実行済みとは判定していない。

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| VERIFY-01 | 03-01, 03-02 | canonical `tasks.md` `## 4. Test phase` at source commitへのproxy | ✓ SATISFIED | source pin、snapshot stability、exact acceptance matrix、host-unverified boundary、実 read-only smokeへ接続。 |

Phase 3 に割り当てられた orphaned requirement はない。後続 phase もないため deferred gap はない。

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| Phase 3 changed code/tests/docs | — | `TBD` / `FIXME` / `XXX` / `TODO` / `HACK` / placeholder | — | 該当なし。 |

Mutable operation scanでは production additions に prepare、manifest persistence、mark-started、GSD dispatch、retry/resume/rollback/finalize/cleanup/push/PR/merge callはない。`harden-openspec-gsd-handoff-lifecycle` pathの変更もない。

### Disconfirmation Pass

- **部分要件の再確認:** regular/FIFO/directoryに加えsymlink targetもstable descriptorへpinされ、direct substitution probeでoriginal bytesを保持。
- **誤解し得るtest:** fake-runner smokeだけではinstalled tool compatibilityを証明しない。独立したactual opt-in smokeを再実行し、exact versions/signalsと無変更を確認。
- **未被覆error pathの再確認:** semantic table headings、multiline raw JSON、network/root pathのdirect probesが各stable failure codeを返した。

### Human Verification Required

なし。actual host behavior自体は引き続きreasoned-unverifiedだが、Phase 3のmust-haveはその未検証境界を排他的・機械的に保持することであり、validatorで確認済み。

### Gaps Summary

前回の3 failed truthsはすべて閉じ、blocking gap、warning、behavior-unverified must-haveはない。final security re-auditも`secured / threats_open: 0`。Phase 3はdeterministic CI、実read-only compatibility、source-pinned acceptance evidence境界を達成した。OpenSpec tasks 4.1以降の完了マークとfinal acceptance/closeは本レポートでは実施していない。harden/lifecycleは引き続き対象外。

---

_Verified: 2026-07-15T17:07:42Z_
_Verifier: the agent (gsd-verifier; generic-agent workaround)_
