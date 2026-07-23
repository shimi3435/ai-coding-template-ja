---
phase: 03-lifecycle-drift-gate
plan: 02
subsystem: openspec-gsd-handoff
tags: [lifecycle-gate, drift, sha256, fail-closed, tdd]

requires:
  - phase: 03-lifecycle-drift-gate
    plan: 01
    provides: immutable canonical-source drift decisions with stable source IDs
  - phase: 02-source-to-execution-mapping
    provides: point-in-time mapping readiness and exact schema-2 manifest values
provides:
  - one fresh admission gate shared by plan, execute, resume, verify, and finalize
  - deterministic remediation targets for source, mapping, phase, and capability drift
  - content-bound decision identities with stale-evidence rejection
affects: [03-03-lifecycle-integration, recovery-gates, finalize-gates]

tech-stack:
  added: []
  patterns: [fresh composite observation, typed length-prefix identity, constant-time stale comparison]

key-files:
  created:
    - src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py
    - tests/test_handoff_lifecycle_gate.py
  modified: []

key-decisions:
  - "Resume deliberately reuses the execute mapping horizon while retaining a distinct lifecycle operation identity."
  - "Complete decisions use lifecycle-gate-decision-v1 typed length-prefixed encoding and lowercase SHA-256; unknown decisions expose no reusable identity."
  - "Set-like phase node and dependency tuple order is normalized before validation and identity generation, while duplicates remain invalid."

patterns-established:
  - "The public gate always gathers source commit, phase graph, and capabilities once, then invokes current source observation and mapping readiness itself."
  - "Only complete observations receive an identity; stale prior identities are compared with hmac.compare_digest after fresh recomputation."

requirements-completed: [HND-03]

duration: 20min
completed: 2026-07-23
status: complete
---

# Phase 03 Plan 02: Shared Lifecycle Drift Gate Summary

**A single fresh fail-closed gate now protects all five lifecycle operations with exact remediation outputs and replay-resistant decision identities.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-07-23T00:49:58Z
- **Completed:** 2026-07-23T01:10:18Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `observe_lifecycle_operation` to gather canonical source, schema-2 manifest, source commit, Phase 2 mapping readiness, phase graph, and capabilities as one complete observation.
- Added `gate_lifecycle_operation` as the sole admission seam for plan, execute, resume, verify, and finalize; incomplete evidence becomes unknown and complete mismatch becomes drifted.
- Added exact sorted remediation fields for canonical and phase/capability drift, including bounded downstream phase closure.
- Added a versioned typed length-prefix SHA-256 identity over every admission-relevant domain and constant-time stale prior-identity rejection.
- Covered bounded manifest, phase, capability, Git/tool, source dependency, and mapping failure families without duplicating 03-01 or Phase 2 classifier matrices.

## Task Commits

Each task was committed atomically through its TDD gates:

1. **Task 1 RED: five-operation gate and fail-closed matrices** - `3ebfd30` (`test`)
2. **Task 1 GREEN: fresh composite lifecycle admission** - `115bce8` (`feat`)
3. **Task 2 RED: deterministic identity and stale evidence examples** - `cdea32e` (`test`)
4. **Task 2 GREEN: content-bound identity and replay rejection** - `63c5e8d` (`feat`)

No separate refactor commit was warranted; the review pass found encoder and sorting behavior already consolidated behind private helpers.

## TDD Evidence

### RED

- Task 1 focused collection failed with `ModuleNotFoundError` because `lifecycle_gate.py` did not exist.
- Task 2 identity examples failed because complete decisions had `decision_identity=None`, and reversed set-like phase tuples were rejected as unknown.

### GREEN

- Focused lifecycle gate suite: 46 passed.
- Fixed complete identity: `4e7605ce41fdc12e5a7b9d7278408b55e84e2ee84352eb5832209a18ec5309c9`.
- Repeated complete input preserves that identity; operation, target phase, canonical progress, exact manifest bytes/state, source commit, mapping result, phase graph, and capability changes alter it.
- Exact current identity reuse remains admitted only after a fresh observation; stale identity returns `lifecycle-decision-stale`, malformed identity is unknown, and incomplete evidence exposes no identity.

### REFACTOR/REVIEW

- Normalized only semantically set-like phase nodes/dependencies and retained duplicate rejection.
- Consolidated explicit component encoding through `_IdentityEncoder` and domain-specific private encoders; no timestamp, mtime, random input, object repr, cache, lease, or TTL exists.
- Self-review found and fixed distinct null/empty type encoding and the missing capability aggregate bound before commit.
- No further behavior-preserving refactor was justified.

## Operation-to-Mapping Matrix

| Lifecycle operation | Phase 2 horizon |
|---|---|
| `plan` | `plan` |
| `execute` | `execute` |
| `resume` | `execute` |
| `verify` | `verify` |
| `finalize` | `finalize` |

## Public Symbols

- `LifecycleOperation`, `LifecycleGateState`, `LifecycleGateLimits`
- `SourceCommitObservation`, `PhaseNodeObservation`, `PhaseGraphObservation`, `CapabilityObservation`
- `LifecycleGateObservation`, `LifecycleGateDecision`, `LifecycleObservationBoundary`
- `observe_lifecycle_operation`, `gate_lifecycle_operation`

No package-root exports or CLI commands were added.

## Files Created/Modified

- `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py` - bounded fresh composite observation, whole-operation classification, remediation derivation, identity encoding, and stale comparison.
- `tests/test_handoff_lifecycle_gate.py` - one five-row operation matrix plus orthogonal drift, incomplete evidence, identity sensitivity, freshness, and stale-reuse examples.

## Decisions Made

- Resume maps to Phase 2 execute readiness because Phase 2 intentionally has no separate resume horizon; its lifecycle operation value remains independently identity-bound.
- The identity encoder uses explicit field tags, type markers, and eight-byte big-endian component lengths under `lifecycle-gate-decision-v1`.
- Absolute temporary repository paths are validated against the live operation but excluded from the digest so identical repository content has a portable deterministic identity.
- Phase graph input ordering is semantically irrelevant and normalized; duplicate nodes/dependencies, invalid paths, unknown dependencies, and over-limit graphs still fail closed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Distinguished null and empty identity components**
- **Found during:** Task 2 self-review
- **Issue:** The first encoder draft represented `None` and an empty string with the same zero-length value bytes.
- **Fix:** Added explicit type markers for null, bytes, booleans, integers, and strings before length-prefix hashing.
- **Files modified:** `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py`, `tests/test_handoff_lifecycle_gate.py`
- **Verification:** Fixed literal identity, sensitivity matrix, stale-reuse suite, basedpyright, and `task check` passed.
- **Committed in:** `63c5e8d`

**2. [Rule 2 - Missing Critical] Applied aggregate bounds to capability observations**
- **Found during:** Task 2 threat review
- **Issue:** Typed capability values were validated for shape but not bounded by the composite observation aggregate limit.
- **Fix:** Validated nested capability types and UTF-8 aggregate bytes; added an over-limit capability case that yields unknown with no identity.
- **Files modified:** `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py`, `tests/test_handoff_lifecycle_gate.py`
- **Verification:** Focused incomplete-evidence matrix and all project checks passed.
- **Committed in:** `63c5e8d`

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical bound)
**Impact on plan:** Both fixes strengthen the specified identity and denial-of-service threat mitigations without adding new product surface.

## Issues Encountered

- The 03-01 source fingerprint intentionally includes a requirement's nested scenario body. The fixed `SCN-000004` public-gate fixture therefore pins the parent fingerprint in source-commit evidence before changing only the scenario, preserving the plan's exact stable-ID decision without changing 03-01 behavior.

## Verification

- `uv run pytest tests/test_handoff_lifecycle_gate.py -q` - 46 passed.
- `uv run pytest tests/test_handoff_lifecycle_drift.py tests/test_handoff_execution_mapping.py -q` - 50 passed.
- `uv run ruff check ...` - passed.
- `uv run ruff format --check ...` - passed.
- `uv run basedpyright ...` - 0 errors, 0 warnings.
- `task check` - format, lint, type checking, and all 565 tests passed.
- Representative public gate invocation returned `clean True plan 4e7605ce…09c9`.
- `git diff --check` - passed.

## Threat Results

- T-03-05: boundary results require exact typed, repository/change/commit-bound values; failures, exceptions, malformed values, timeout/truncation codes, and incomplete values become unknown.
- T-03-06: admission is the conjunction of all six evidence domains and no issue-bearing or unknown decision is admitted.
- T-03-07: current complete evidence is re-hashed on every gate call and compared to prior lowercase SHA-256 text with `hmac.compare_digest`.
- T-03-08: manifest bytes, artifact reads, phase node/edge/aggregate values, mapping paths, and capability aggregate values are bounded; limit+1 evidence is unknown.
- T-03-09: frozen decisions expose operation, target, state, sorted issue/remediation tuples, and an identity only for complete observations.
- No unresolved high-severity threats remain.

## Protected Surface Evidence

- Plan commits changed only `lifecycle_gate.py` and `test_handoff_lifecycle_gate.py`.
- Phase 2 source/tests, 03-01 source/tests, canonical OpenSpec artifacts, tracked handoff, package-root exports, and CLI files were not modified.
- The new suite contains one five-operation parameter table and no Hypothesis decorator, normalization matrix, refresh approval, publication, repair, retry, rollback, route switch, schema push, or real-tool smoke case.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None.

## Self-Check: PASSED

- Both implementation files exist.
- All four TDD task commits exist in repository history.
- No tracked files were deleted and no generated files remain untracked.

## Next Phase Readiness

- Plan 03-03 can integrate the shared gate into lifecycle entrypoints without reimplementing source or mapping classification.
- No blockers or unresolved high-severity threats remain for 03-02.

---
*Phase: 03-lifecycle-drift-gate*
*Completed: 2026-07-23*
