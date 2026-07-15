---
phase: 01-bridge-core-persistence-and-preflight
verified: 2026-07-15T08:41:34Z
status: gaps_found
score: 7/10 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "対応済み OpenSpec JSON の terminal 準備不足 signal は Markdown fallback で隠されず、manifest state を進めない。"
    status: failed
    reason: "`missingArtifacts` field が空 list のとき field presence が失われ、valid terminal candidate が Markdown fallback success へ変換される。`prepare_handoff` まで通すと `prepared` manifest が実際に生成される。"
    artifacts:
      - path: src/ai_coding_template_ja/openspec_gsd_handoff/discovery.py
        issue: "`_string_list()` が空 list を拒否し、`_candidate_discovery()` が field presence ではなく値の truthiness で terminal stop を判定する。"
      - path: tests/test_handoff_discovery.py
        issue: "`ready + missingArtifacts: []` と `blocked + missingArtifacts: []` の terminal/no-fallback 回帰 test がない。"
    missing:
      - "空 list も string list shape として検証できるようにし、`missingArtifacts` の存在を値とは別に保持する。"
      - "`missingArtifacts` key が存在する場合は空 list を含め `openspec-unprepared` / JSON route で停止し、fallback reader と persistence に進まない。"
      - "`tests/test_handoff_discovery.py` に ready/blocked 両方の空 list caseを追加し、Failure、JSON route、fallback不使用、manifest mutation zeroを検証する。"
---

# Phase 1: Bridge Core, Persistence, and Preflight Verification Report

**Phase Goal:** canonical `tasks.md` heading `## 2. Bridge MVP phase` と source commit を唯一の規範として、bridge core、persistence、preflight の実装・検証境界を成立させる
**Verified:** 2026-07-15T08:41:34Z
**Status:** gaps_found
**Re-verification:** No — initial verification
**Dispatch:** generic-agent workaround（typed `gsd-verifier` dispatch が利用できないため、agent TOML の role instructions を使用）

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Phase 1 から BRIDGE-01 の canonical path、heading、source commit を追跡できる | VERIFIED | `ROADMAP.md`、`REQUIREMENTS.md`、両 PLAN と `tests/test_handoff_core.py:1-4,37` が commit `5a1f78b...` と `tasks.md` §2 を参照する。 |
| 2 | 証拠は bridge core、persistence、preflight に限定され、規範本文を再定義しない | VERIFIED | production は `openspec_gsd_handoff` package の機械境界だけ。skill orchestration、finalize、retry/resume、hardening は存在しない。 |
| 3 | Phase 完了判定を canonical OpenSpec artifacts に照合でき、GSD artifact が未承認仕様を補わない | FAILED | canonical spec の「`missingArtifacts` を含むなら停止」に実装が反する。GSD artifact の補完ではないが、canonical 照合上 Phase 完了を主張できない。 |
| 4 | JSON candidate は全体を検証して採用または破棄し、terminal signal を含む route semantics を保つ | FAILED | `discovery.py:103-110,194-197,223-225`。`missingArtifacts: []` を invalid shape として捨て、`Success markdown-fallback` を再現した。 |
| 5 | canonical Markdown bytes は bounded read once され、同じ bytes を decode/hash に使う | VERIFIED | `reader.py:102-185`。file/aggregate/count/path/symlink tests が `task check` 内で通過。 |
| 6 | result は input route、known state、issue code を機械向け data として保持する | VERIFIED | `models.py:19-140`、`__main__.py:139-176`。structured argv failure spot check も JSON 1行、exit 2。 |
| 7 | source-pinned inputs と explicit host verdict から deterministic prepared manifest を構築できる | VERIFIED | `manifest.py:339-468` と fixture round-trip test。timestamp-free deterministic bytes、source/Git/host 分離を確認。 |
| 8 | Git/OpenSpec/GSD preflight 不足時は manifest target と handoff state が進まない | FAILED | empty `missingArtifacts` は OpenSpec 準備不足なのに、診断で `Success True`、state `prepared`、route `markdown-fallback` を再現。 |
| 9 | Manifest は same-directory validated staging bytes からだけ atomic replace し、失敗の known state/cleanup を分類する | VERIFIED | `manifest.py:537-712`。transition/fault/oversize/alias/static-symlink の named tests が通過。 |
| 10 | Module entrypoint は argv validation、adapter wiring、structured JSON、exit status 変換だけを所有する | VERIFIED | `__main__.py:43-210`。help は exact 3 operations、invalid request は machine-readable failure。 |

**Score:** 7/10 truths verified

### Required Artifacts

`gsd-tools query verify.artifacts` は両 PLAN の 12/12 artifacts について existence/substance check を通した。手動の wiring/behavior 確認結果は次のとおり。

| Artifact group | Status | Details |
|---|---|---|
| `models.py`, `progress.py`, `reader.py` | VERIFIED | immutable values、strict task normalization、bounded same-byte read が実装・test済み。 |
| `discovery.py` | FAILED (behavior gap) | substantive かつ reader/progress へ wired。ただし empty `missingArtifacts` terminal case が canonical contract に違反。 |
| `manifest.py`, `preflight.py` | VERIFIED | deterministic schema、bounded existing read、atomic repository、fixed argv/tool/Git/host gates が wired。 |
| `__main__.py` と public `__init__.py` | VERIFIED | `inspect` / `prepare` / `mark-started` の composition root と exact public exports。 |
| Phase 1 test files | PARTIAL | 177 tests は通るが、`tests/test_handoff_discovery.py` に CR-10 の回帰 case がない。 |

### Key Link Verification

| From | To | Status | Details |
|---|---|---|---|
| `discovery.py` | `reader.py` | WIRED | `read_canonical_artifacts()` を route-local claims に使用。 |
| `discovery.py` | `progress.py` | WIRED | canonical `tasks.md` parse 後に JSON metadata parity を検査。 |
| `preflight.py` | `models.py` | WIRED | tool/Git/host evidence を typed classified values へ変換。 |
| `__main__.py` / public operations | `preflight.py`, `manifest.py` | WIRED | read-only inspection後の prepared persistence と caller-confirmed started transitionを接続。 |
| `tests/test_handoff_discovery.py` | OpenSpec contract fixtures | PARTIAL | fixture tableは接続済みだが、field-present empty-list variantを含まない。 |

### Data-Flow Trace

UI/rendering artifact はないため Level 4 dynamic-render trace は非該当。代わりに `prepare_handoff` のデータフローを追跡し、OpenSpec probe → discovery fallback → preflight → manifest persistence が CR-10 入力でも流れてしまうことを実行確認した。

### Behavioral Spot-Checks

| Behavior | Command / Evidence | Result | Status |
|---|---|---|---|
| Full project gate | `task check` | Ruff format/check、basedpyright、177 pytest passed | PASS（ただし CR-10 未検出） |
| CR-10 discovery repro | positive fixtureに `missingArtifacts: []` を追加して `discover_openspec_artifacts` | `Success markdown-fallback` | FAIL |
| CR-10 persistence repro | 同入力で `prepare_handoff(... approved=True)` | `Success True`、`prepared markdown-fallback` | FAIL |
| CR-01〜CR-09 quick regression | focused named tests 25件 | all passed | PASS |
| CLI help | `uv run python -m ... --help` | `{inspect,prepare,mark-started}`、exit 0 | PASS |
| Structured error | options不足の `inspect` | JSON 1行、`request-invalid`、exit 2 | PASS |

### Probe Execution

SKIPPED — Phase 1 PLAN/SUMMARY に probe script の宣言はなく、`scripts/**/tests/probe-*.sh` も存在しない。real-tool smoke は Phase 3 の明示 opt-in 境界であり、Phase 1 gap を deferred 扱いする根拠にはしていない。

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|---|---|---|---|
| BRIDGE-01 | 01-01, 01-02 | BLOCKED | artifact/wiring の大半は成立するが、canonical spec の「CLIが準備不足を報告する」scenario が empty `missingArtifacts` で失敗する。Phase 2/3 はこの Phase 1 bridge defect を明示的に所有しない。 |

Orphaned requirements はない。Phase 1 に mapping された proxy reference は BRIDGE-01 のみで、両 PLAN が claim している。

### Anti-Patterns and Adversarial Disconfirmation

- modified production/test filesに未参照の `TBD` / `FIXME` / `XXX` debt markerは見つからなかった。
- 部分達成 requirement: BRIDGE-01 の通常 discovery/persistence は成立するが、field-present empty-list terminal caseだけ欠ける。
- misleading green test: pinned blocked fixtureと全177 testsは通るが、`missingArtifacts` の値が非空である場合しか field-presence semantics を証明しない。
- uncovered error path: `ready + []` と `blocked + []` が terminal stopではなくfallback/writeへ進む。
- CR-10 は Phase 2 skillや Phase 3 smoke、対象外 hardening の明示 goal/success criteriaに含まれないため deferred にしない。

### Human Verification Required

なし。今回の gap と残りの Phase 1 must-have は repository-local deterministic tests/diagnostics で判定できる。

### Gaps Summary

単一の root cause が3つの must-haveを壊している。`missingArtifacts` の field presence と list truthinessを分離し、空 listを含む terminal casesを回帰 testで固定する必要がある。修正対象は `discovery.py` と `test_handoff_discovery.py`。修正後は prepare経由の mutation-zeroも確認して再検証する。

---

_Verified: 2026-07-15T08:41:34Z_
_Verifier: the agent (gsd-verifier via generic-agent workaround)_
