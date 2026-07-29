---
phase: 03-lifecycle-drift-gate
plan: 18
subsystem: lifecycle-drift-gate
tags:
  - tdd
  - execution-mapping
  - path-role
  - fail-closed
  - hypothesis
status: complete
requires:
  - phase: 03-lifecycle-drift-gate
    plan: 17
    provides: approved 54-item started-v2 handoff authority
provides:
  - disjoint phase, plan, and evidence path-role namespaces
  - direct ManifestMapping role validation independent of inventory projection
  - identity-free lifecycle refusal before declared-path filesystem observation
affects:
  - Phase 3 independent reverification
  - Phase 4 repository-wide ownership
tech-stack:
  added: []
  patterns:
    - canonical validation before semantic role comparison
    - role-local alias namespaces with fail-closed cross-role intersections
    - property-based declaration-order invariance
key-files:
  created: []
  modified:
    - src/ai_coding_template_ja/openspec_gsd_handoff/execution_mapping.py
    - src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py
    - tests/test_handoff_execution_mapping.py
    - tests/test_handoff_lifecycle_gate.py
key-decisions:
  - Canonicalize every declared artifact path before comparing phase, plan, and evidence role namespaces.
  - Treat duplicate evidence declarations as a path-role conflict while retaining valid combined source/plan ownership on one independent artifact.
  - Preserve generic lifecycle phase-observation failures except for the stable mapping-path-role-conflict that must stop before declared-path I/O.
  - Keep Phase 3 incomplete and OpenSpec task 3.1 unchecked until independent reverification completes.
requirements-completed:
  - HND-03
duration: 15 min
completed: 2026-07-29
---

# Phase 03 Plan 18: Disjoint Mapping Artifact Path Roles Summary

Alias-aware phase, plan, and evidence role separation at both mapping trust
boundaries, with identity-free lifecycle refusal before any declared-path I/O.

## Performance

- **Duration:** 15 min
- **Started:** 2026-07-29T11:04:06Z
- **Completed:** 2026-07-29T11:19:10Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added the stable `mapping-path-role-conflict` failure for exact, case, and
  Unicode-casefold intersections across phase, plan, and evidence declarations.
- Completed canonical path validation before role comparison, preserving
  `mapping-path-invalid` for empty, absolute, backslash, dot-component, NUL, and
  non-NFC inputs.
- Revalidated direct caller-constructed `ManifestMapping` tuples independently and
  rejected cross-role reuse with `mapping-set-invalid`.
- Kept one independent evidence declaration with both owners and multiple distinct
  evidence paths for one owner valid and VERIFY-ready.
- Propagated path-role conflicts through the public lifecycle gate as identity-free
  `UNKNOWN` with empty remediation before declared-path observation.
- Preserved the approved Plan 03-17 authority at 54 active source items and 54
  canonical mappings without fixture, preview, golden, evidence, or source-pin churn.

## TDD Gate Compliance

| Gate | Commit | Evidence |
|------|--------|----------|
| RED | `b1875ed` | 17 intended role-reuse failures, 12 passes, 209 deselected; no import or syntax failures remained. |
| GREEN | `f454cf0` | Inventory and direct mapping role namespaces passed the complete 61-test mapping suite. |
| GREEN fix | `57834cf` | Lifecycle preserved the structured failure before I/O; all 177 lifecycle tests passed. |
| REFACTOR | None | No separate behavior-preserving refactor was justified. |

## Role Matrix

| Collision | PlanningInventory | Direct ManifestMapping | Variants |
|-----------|-------------------|------------------------|----------|
| phase = plan | `mapping-path-role-conflict` | `mapping-set-invalid` | exact, case, Unicode casefold |
| phase = evidence | `mapping-path-role-conflict` | `mapping-set-invalid` | exact, case, Unicode casefold |
| plan = evidence | `mapping-path-role-conflict` | `mapping-set-invalid` | exact, case, Unicode casefold |
| duplicate evidence declarations | `mapping-path-role-conflict` | not applicable | exact and alias-key reuse |

Non-NFC path spellings remain malformed and return `mapping-path-invalid` before
role comparison. The Unicode role examples therefore use distinct canonical NFC
literals with the same alias key.

## Property and Public-Boundary Evidence

- One bounded Hypothesis family permuted declaration order across valid inventories
  and each cross-role collision; acceptance and failure codes remained invariant.
- `validate_planning_inventory`, `build_manifest_mappings`, and
  `validate_mapping_readiness` returned the same stable role failure for the fixed
  collision matrix.
- The verifier's plan-as-own-evidence counterexample no longer reaches mapping
  projection or readiness.
- The valid combined-owner and multiple-distinct-evidence case remained ready after
  all declared artifacts were created.
- The lifecycle regression observed zero `_observe_declared_path` calls and returned
  no decision identity, manifest hash, or remediation projection.

## Verification

- Task 1 GREEN selection — 150 passed, 88 deselected
- `uv run pytest tests/test_handoff_execution_mapping.py tests/test_handoff_lifecycle_gate.py -q` — 238 passed
- `uv run pytest tests/test_handoff_lifecycle_drift.py tests/test_handoff_identity.py tests/test_handoff_manifest_refresh.py -q` — 304 passed
- targeted Ruff — passed
- targeted BasedPyright — 0 errors, 0 warnings, 0 notes
- `task openspec:validate` — 1 passed, 0 failed
- `task check` — Ruff format/check and BasedPyright passed; 913 tests passed
- `git diff --check` — passed
- Start-SHA file audit confirmed no Plan 03-17 source pin, assignment fixture,
  refresh preview, handoff, golden, tracked evidence, schema/version, dependency,
  CLI, or package export changes.

## Threat Dispositions

| Threat | Disposition | Evidence |
|--------|-------------|----------|
| T-03-18-ROLE | Mitigated | Alias-aware disjoint role sets, fixed three-pair matrix, and order-invariant property pass. |
| T-03-18-DIRECT | Mitigated | Direct immutable mappings independently reject all three cross-role intersections. |
| T-03-18-VERIFY | Mitigated | Plan-as-own-evidence fails while independent combined ownership remains VERIFY-ready. |
| T-03-18-I/O | Mitigated | Structural failure is identity-free and the lifecycle regression records zero declared-path calls. |
| T-03-18-SC | Accepted | No package install or dependency change occurred. |

## Deviations from Plan

None - plan executed exactly as written. The separate lifecycle fix was the plan's
specified conditional path after the RED gate exposed the existing error-code collapse.

## Known Stubs

None. Empty collections and optional values found by the scan are bounded local
accumulators, test assertions, or existing domain-state fields, not runtime placeholders.

## Commits

- `b1875ed` — `test(03-18): expose cross-role mapping evidence reuse`
- `f454cf0` — `feat(03-18): separate mapping artifact path roles`
- `57834cf` — `fix(03-18): surface mapping role conflicts before path I/O`

## Next Steps

- Run the independent Phase 3 verifier, code review, and security exit reports.
- Keep Phase 3 and OpenSpec task 3.1 incomplete until those canonical reports pass.
- Keep Phase 4 blocked until Critical 0 / Warning 0, verifier 10/10 with no overrides,
  complete HND-03 traceability, and zero open threats are recorded.

## Self-Check: PASSED

- All four key modified files exist.
- Commits `b1875ed`, `f454cf0`, and `57834cf` exist in Git history.
- TDD order, 54-item compatibility, zero-I/O refusal, valid evidence sharing, focused
  checks, full project checks, and no-repin scope were rechecked after GREEN.
