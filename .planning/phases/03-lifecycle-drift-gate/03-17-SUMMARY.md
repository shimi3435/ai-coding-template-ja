---
phase: 03-lifecycle-drift-gate
plan: 17
subsystem: lifecycle-drift-gate
tags:
  - tdd
  - phase-graph
  - manifest-refresh
  - approval-bound
  - evidence
status: complete
requires:
  - phase: 03-lifecycle-drift-gate
    plan: 14
    provides: bounded lifecycle input validation
  - phase: 03-lifecycle-drift-gate
    plan: 16
    provides: source-pinned graph baseline validation
provides:
  - complete deterministic phase-graph drift and target-relation decisions
  - exact approved 54-item started-v2 handoff authority
  - synchronized refresh and lifecycle evidence for source pin 9a7a313
affects:
  - 03-18 independent reverification
  - Phase 4 repository-wide ownership
tech-stack:
  added: []
  patterns:
    - independently validate expected and observed graphs
    - project remediation over the union of old and new edges
    - bind publication to exact preview and assignment inventory hashes
key-files:
  created:
    - .planning/phases/03-lifecycle-drift-gate/03-REFRESH-PREVIEW.json
  modified:
    - src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py
    - src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py
    - tests/test_handoff_lifecycle_gate.py
    - tests/test_handoff_manifest_refresh.py
    - tests/fixtures/openspec_gsd_handoff/mapping/hardening-phase-assignments.json
    - tests/fixtures/openspec_gsd_handoff/manifest/expected-refresh-preview.json
    - tests/fixtures/openspec_gsd_handoff/lifecycle/expected-lifecycle-evidence.json
    - .planning/openspec/harden-openspec-gsd-handoff-lifecycle/handoff.json
    - .planning/phases/03-lifecycle-drift-gate/03-LIFECYCLE-EVIDENCE.json
    - .planning/PROJECT.md
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md
    - .planning/STATE.md
key-decisions:
  - Expected and observed phase graphs remain independently validated, while only the observed graph must equal the current PlanningInventory phase map.
  - Graph remediation traverses old and new dependency edges and limits replanning to phases present in the observed graph.
  - Plan A publication is authorized only by preview SHA-256 069990c0 and its bound assignment inventory SHA-256 46b18454.
  - Phase 3 remains incomplete until Plan 03-18 and independent reverification finish; OpenSpec task 3.1 remains unchecked.
requirements-completed:
  - HND-03
duration: 14 min
completed: 2026-07-29
---

# Phase 03 Plan 17: Complete Graph Drift and Approved Plan A Refresh Summary

Deterministic phase-graph remediation with compatible identities, followed by a
freshly approved 49→54 source/mapping repin and byte-stable public lifecycle evidence.

## Performance

- **Duration:** 14 min
- **Started:** 2026-07-29T10:35:09Z
- **Completed:** 2026-07-29T10:49:12Z
- **Tasks:** 3
- **Files modified:** 15

## Accomplishments

- Restored complete graph-add/remove/path/dependency drift decisions without weakening
  malformed-input rejection or changing public lifecycle wire fields.
- Preserved valid clean identity compatibility and made drift projection deterministic
  across input order, old/new dependency edges, and observed-phase intersection.
- Captured immutable preview
  `069990c0a043268d2aab7683f17a41c1885c634d53a9ed85860f021a80ec8a92`,
  binding assignment inventory
  `46b18454f18a30f6cac738be43b474a76de533e4f81830c2c33fd3cd723cbb14`.
- Applied the approved candidate exactly once: source pin
  `9a7a313d06ae6df1c102f2515a3ad4bd5c0ca901`, candidate
  `d2425591c60355594e65253cf2bcc56424160ab677ccd93605f8606f6a940b48`,
  54 active items, 54 mappings, 48 scenarios, and no staging residue.
- Regenerated lifecycle evidence twice through the public producer. Both runs and the
  independent/tracked records are byte-identical at SHA-256
  `a67f01a5e82e9708f16b505ecf632437c00126624edf2ab7c68619cab6c8e78a`.
- Synchronized PROJECT, ROADMAP, REQUIREMENTS, and STATE to the new authority while
  retaining an incomplete 18-plan Phase 3 and a Phase-4 block.

## TDD Gate Compliance

| Gate | Commit | Evidence |
|------|--------|----------|
| RED | `976aed5` | Public fixed/property tests exposed incomplete graph drift behavior. |
| GREEN | `774570e` | Graph validation, target classification, remediation, and identity behavior passed. |
| REFACTOR | None | No behavior-preserving duplication justified a separate refactor. |

## Outcome Matrix

| Family | Result |
|--------|--------|
| Graph add/remove/path/dependency/simultaneous | Deterministic `DRIFTED` decisions with reusable identities |
| Old/new edge remediation | Changed phases revalidate; only observed downstream phases replan |
| Expected-only/observed-only/both/neither target | Classified before mapping readiness with stable actions |
| Malformed graph or target | Identity-free fail-closed `UNKNOWN` |
| Clean compatibility | Existing `lifecycle-gate-decision-v1` identity bytes preserved |
| Stale replay | Freshly rejected with a recomputed rejection identity |
| Pure graph properties | Ordering, edge-union, intersection, and same-input determinism covered |

## Verification

- `uv run pytest tests/test_handoff_manifest_refresh.py -q` — 48 passed
- graph-focused lifecycle selection — 63 passed
- `uv run pytest tests/test_handoff_lifecycle_gate.py -q` — 176 passed
- `uv run ruff check ...` — passed
- `uv run basedpyright ...` — 0 errors, 0 warnings
- `git diff --check` — passed
- Public no-op refresh recomputation reproduced the approved assignment inventory hash.
- Handoff parse confirmed started-v2, exact pin, 54/54 coverage, and 48 scenarios.
- OpenSpec task 3.1 remains unchecked.
- Final `task check` was intentionally not run; Plan 03-17 explicitly defers it until
  Plan 03-18 updates and independently reverifies the 54-item/path-role authority.

## Threat Dispositions

| Threat | Disposition | Evidence |
|--------|-------------|----------|
| T-03-17-GRAPH | Mitigated | Both raw graphs validate independently before comparison or projection. |
| T-03-17-TARGET | Mitigated | Target membership is classified before readiness and incomplete inputs remain identity-free. |
| T-03-17-PROJECTION | Mitigated | Old/new edge union, observed intersection, UTF-8 ordering, fixed tests, and properties pass. |
| T-03-17-REFRESH | Mitigated | Exact immutable approval, fresh recomputation, one guarded apply, and zero residue. |
| T-03-17-EVIDENCE | Mitigated | Public producer, independent literal, byte equality, and no raw root/identity in evidence. |
| T-03-17-SC | Accepted | No dependency or package change occurred. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Admit the published 54-item canonical generation**

- **Found during:** Task 3 derived-authority verification
- **Issue:** Refresh validation admitted only historical 42/49-item snapshots, so the
  newly approved 54-item target could not produce a valid no-op preview and masked the
  intended incomplete-mapping failure.
- **Fix:** Added 54 to the existing bounded canonical-generation allowlist and verified
  both no-op and incomplete-mapping behavior through the focused 48-test suite.
- **Files modified:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py`
- **Commit:** `2670367`

## Known Stubs

None. Empty collections found by the scan are asserted evidence or local accumulators,
not UI/runtime placeholders.

## Commits

- `976aed5` — `test(03-17): expose incomplete phase graph drift contract`
- `774570e` — `feat(03-17): restore complete phase graph drift decisions`
- `41b853f` — `docs(03-17): capture immutable refresh preview`
- `2670367` — `feat(03-17): publish approved Plan A refresh`

## Next Steps

- Execute Plan 03-18 independent reverification and the deferred project-wide check.
- Keep Phase 4 blocked and OpenSpec task 3.1 unchecked until all canonical exit reports pass.

## Self-Check: PASSED

- All key created/modified artifacts exist.
- Commits `976aed5`, `774570e`, `41b853f`, and `2670367` exist in Git history.
- Published handoff, assignment hash, evidence equality, metadata pin, and incomplete
  phase boundary were rechecked after the Task 3 commit.
