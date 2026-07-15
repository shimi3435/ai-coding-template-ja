---
phase: 01-bridge-core-persistence-and-preflight
fixed_at: 2026-07-15T08:08:08Z
review_path: .planning/phases/01-bridge-core-persistence-and-preflight/01-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 1: Code Review Fix Report

**Fixed at:** 2026-07-15T08:08:08Z
**Source review:** `.planning/phases/01-bridge-core-persistence-and-preflight/01-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 5
- Fixed: 5
- Skipped: 0

## Fixed Issues

### CR-01: Manifestの親symlinkからrepository外へ書き出せる

**Files modified:** `tests/test_handoff_manifest.py`, `src/ai_coding_template_ja/openspec_gsd_handoff/manifest.py`
**RED commit:** e4ba67a
**GREEN commit:** f68494c
**Applied fix:** canonical manifest parentの既存componentをmutation前に`lstat`し、static symlink、非directory component、resolved containment違反を`manifest-target-unsafe`で拒否する。component-swap対策やdirectory-fd lifecycleは後続hardeningへ追加していない。
**Tests:** `test_repository_rejects_static_parent_symlink_escape_before_mutation`、manifest focused test、Ruff、basedpyright。
**Verification note:** path security logicのためorchestrator review対象。

### CR-02: Strict manifest parserがkindとcanonical pathの不一致を受理する

**Files modified:** `tests/test_handoff_manifest.py`, `src/ai_coding_template_ja/openspec_gsd_handoff/manifest.py`
**RED commit:** 48a7344
**GREEN commit:** 32f0dbb
**Applied fix:** artifact数を1..64へ制限し、proposal/design/tasksのexact canonical pathと`specs/<single-segment>/spec.md`をkind別に検証する。非canonical既存manifestはparseで停止するため`started`へ遷移しない。
**Tests:** kind/pathを入れ替えた既存prepared manifestのtransition拒否、65 artifact parse拒否、manifest test全件、Ruff、basedpyright。
**Verification note:** parser/state-transition logicのためorchestrator review対象。

### CR-03: 複数specのJSON経路だけcandidate順を保持しparityが崩れる

**Files modified:** `tests/test_handoff_discovery.py`, `src/ai_coding_template_ja/openspec_gsd_handoff/discovery.py`
**RED commit:** cb59be4
**GREEN commit:** 1d37c89
**Applied fix:** validated spec candidateをrepository-relative canonical pathでsortしてからclaimを生成し、JSON routeとfixed Markdown fallbackのartifact順を一致させる。
**Tests:** reverse順の2 spec JSON candidateとfallbackの完全値parity、discovery test全件、Ruff、basedpyright。
**Verification note:** ordering/parity logicのためorchestrator review対象。

### CR-04: argparseの失敗経路がmachine-readable JSONを返さない

**Files modified:** `tests/test_handoff_cli.py`, `src/ai_coding_template_ja/openspec_gsd_handoff/__main__.py`
**RED commit:** 28acb6f
**GREEN commit:** 0ea7a26
**Applied fix:** help以外のargv validation errorをtyped exceptionへ変換し、stdoutへ1件のstructured `request-invalid` payloadを返す。repository policyとhost enumにはparse-time choicesを設定し、input exit class 2へ固定した。通常helpは維持した。
**Tests:** missing option、unknown operation、invalid valueのsubprocess tests、CLI test全件、Ruff、basedpyright、module help。
**Verification note:** CLI error classification logicのためorchestrator review対象。

### CR-05: subprocess出力上限がcapture完了後にしか適用されない

**Files modified:** `tests/test_handoff_preflight.py`, `src/ai_coding_template_ja/openspec_gsd_handoff/preflight.py`
**RED commit:** 672807c
**GREEN commit:** 8825d56
**Applied fix:** `Popen(shell=False)`とselector-based incremental readへ置換し、stdout/stderrを各`limit + 1`までに制限した。超過またはtimeout時はchildをterminate/killして必ずwaitし、既存injectable runner result contractを維持した。
**Tests:** stdout/stderrのexact boundaryとover-limit、PIDによるchild reap確認、preflight test全件、Ruff、basedpyright。
**Verification note:** process lifecycle/resource-bound logicのためorchestrator review対象。

## Aggregate Verification

- Phase 1 focused tests: 83 passed
- `task check`: 164 passed、Ruff format/check、basedpyright成功
- module help: `inspect`, `prepare`, `mark-started`を表示しexit 0
- hardening、retry、resume、finalize、cleanup、new dependencyは追加していない

---

_Fixed: 2026-07-15T08:08:08Z_
_Fixer: the agent (gsd-code-fixer via generic-agent workaround; orchestrator-managed isolation)_
_Iteration: 1_
