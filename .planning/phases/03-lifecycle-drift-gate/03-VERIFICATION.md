---
phase: 03-lifecycle-drift-gate
verified: 2026-07-29T05:57:24Z
status: gaps_found
score: 7/10 must-haves verified
behavior_unverified: 0
overrides_applied: 0
next_action: "Gaps found. Plan the fixes, then re-run execute-phase before shipping."
next_command: "/gsd:plan-phase 03 --gaps"
re_verification:
  previous_status: gaps_found
  previous_score: 7/10
  gaps_closed:
    - "A stale lifecycle rejection now returns an identity computed from the complete DRIFTED decision, and replay remains rejected."
    - "Canonical source inventory now revalidates the caller-visible repository root against the retained descriptor after the bounded read."
    - "Both public source inventory readers now validate outer containers and members before truthiness, len, unpacking, path conversion, or filesystem work."
  gaps_remaining:
    - "Complete phase additions, removals, and path changes are rejected as lifecycle-phase-observation-incomplete before drift classification and remediation projection."
    - "A plan path can also be declared as its own source/plan evidence path, allowing VERIFY readiness without an independent evidence artifact."
  regressions: []
gaps:
  - truth: "Complete phase-graph changes are classified as drift and expose deterministic revalidation and replanning actions."
    status: failed
    reason: "_validate_phase_graph requires both source-pinned expected_nodes and current observed_nodes to equal the single current PlanningInventory map. A valid current phase addition therefore returns UNKNOWN before _phase_changes can emit phase-added/removed/path-changed evidence."
    artifacts:
      - path: "src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py"
        issue: "Lines 529-556 compare both graph snapshots to one inventory; the phase-added/removed/path-changed branches at lines 777-800 are unreachable for ordinary one-sided graph drift."
      - path: "tests/test_handoff_lifecycle_gate.py"
        issue: "The exact graph/inventory equality test protects the short-circuit but no public regression requires a complete phase addition/removal/path change to return DRIFTED with remediation."
    missing:
      - "Validate expected and observed phase snapshots against their corresponding source-pinned/current inventory authority, or otherwise preserve valid set differences for drift classification."
      - "Add fixed public-gate tests for phase add, remove, path change, and dependency change with exact issue, revalidation, replanning, and next-action tuples."
  - truth: "VERIFY admission requires complete, role-correct source and plan evidence rather than allowing a plan artifact to satisfy its own evidence requirement."
    status: failed
    reason: "PlanningInventory validation rejects duplicates only within plan paths or evidence paths. It accepts one EvidenceDeclaration whose path equals a PlanDeclaration path and whose owners include both source_id and plan_path; validate_mapping_readiness then reports ready=true with no independent evidence artifact."
    artifacts:
      - path: "src/ai_coding_template_ja/openspec_gsd_handoff/execution_mapping.py"
        issue: "Lines 491-533 do not reject canonical path collisions across phase, plan, and evidence roles; _readiness_issues checks declared ownership coverage and file existence only."
      - path: "tests/test_handoff_execution_mapping.py"
        issue: "No builder/readiness regression covers a plan path reused as its own source/plan evidence path."
    missing:
      - "Reject evidence.path collisions with phase.phase_path and plan.path at PlanningInventory validation before mapping projection/readiness."
      - "Add fixed public builder and VERIFY-readiness regressions for cross-role canonical path collisions while preserving one independent evidence artifact shared by source and plan owners."
---

# Phase 3: Lifecycle Drift Gate Verification Report

**Phase Goal:** Every lifecycle operation planned after this phase can rely on the same fresh, fail-closed drift decision.
**Verification Contract:** Canonical source drift and HND-03 / HARD-R2 admission must remain fail-closed, identity-bound, and independently verifiable across plan, execute, resume, verify, and finalize.
**Verified:** 2026-07-29T05:57:24Z
**Status:** gaps_found
**Re-verification:** Yes — after Plans 03-14, 03-15, and 03-16

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Complete canonical source inputs are classified deterministically as clean, drifted, or unknown without partial green evidence. | ✓ VERIFIED | Fixed classifier tests pass; source-pinned reconciliation consistency remains enforced. |
| 2 | Malformed or over-limit canonical observations become unknown before comparison, sorting, or identity encoding. | ✓ VERIFIED | Public classifier/gate malformed nested-value and limit regressions pass. |
| 3 | Plan, execute, resume, verify, and finalize use the same freshly invoked public gate and declared mapping horizons. | ✓ VERIFIED | The sole five-operation matrix calls `gate_lifecycle_operation`; re-observation tests pass. |
| 4 | Admission occurs only after source, manifest, mapping, graph, commit, and capability evidence are complete and mutually consistent. | ✗ FAILED | VERIFY mapping readiness accepts a plan file as its own source/plan evidence, so role-correct enforcement evidence is not required. |
| 5 | Missing, malformed, over-limit, timed-out, truncated, or otherwise incomplete evidence yields unknown and never contributes green evidence. | ✗ FAILED | A role-colliding plan/evidence inventory produces `Success(MappingReadiness(... ready=True, issues=()))`. |
| 6 | Decision identity binds every valid admission-relevant observed input and rejects stale reuse. | ✓ VERIFIED | Plan 03-14 completes the stale decision before encoding it; the exact public two-step replay regression passes. |
| 7 | Blocking decisions expose deterministic artifact/source changes, progress candidates, remediation targets, and next actions. | ✗ FAILED | A complete current phase addition returns only `UNKNOWN/lifecycle-phase-observation-incomplete` with empty replanning and action tuples. |
| 8 | Fixed examples are primary evidence and Hypothesis is limited to the approved checkbox-normalization seam for Phase 3 drift behavior. | ✓ VERIFIED | Phase 3 gate behavior remains fixed-example based; the approved checkbox normalization property family is unchanged. |
| 9 | Reviewers have deterministic source-pinned read-only evidence for clean, drifted, unknown, checkbox-only, stale, and repository-identity relations. | ✓ VERIFIED | Golden and tracked evidence are byte-identical at SHA-256 `1434c365fd609f5f810e7845b5946fb6bc5bf286eb2b5216c0905cec48862e9b`. |
| 10 | One operation matrix is reused, protected inputs remain read-only, and optional real-tool smoke stays separate from normal CI. | ✓ VERIFIED | One matrix remains, tracked evidence records no mutation operations, and the optional smoke is still explicitly `not-run`. |

**Score:** 7/10 truths verified (0 present-but-behavior-unverified)

Plans 03-14 through 03-16 close all three previous implementation gaps. The phase goal remains false because valid phase-state drift is misclassified before remediation and VERIFY readiness can be satisfied without a distinct evidence artifact.

### ROADMAP Success Criteria

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Shared clean/drifted/unknown classification across in-scope lifecycle operations | ✗ FAILED | The shared gate exists, but a complete phase addition is classified `UNKNOWN` instead of `DRIFTED`. |
| 2 | Missing/unreadable/malformed/over-limit/incomplete observations stop instead of appearing clean | ✗ FAILED | Cross-role plan/evidence reuse is admitted as mapping-ready despite lacking an independent evidence artifact. |
| 3 | Approval-relevant evidence is bound to observed inputs and stale reuse cannot occur silently | ✗ FAILED | Stale identity reuse is fixed, but the admitted input identity can bind a role-colliding inventory that does not prove distinct evidence. |
| 4 | Fixed examples are primary; properties are limited to normalization | ✓ VERIFIED | Phase 3 property scope remains unchanged and fixed gate examples are primary. |

### All 16 PLAN Must-Have Groups

| Plan | Raw Truth Coverage | Result | Evidence / Gap |
|---|---:|---|---|
| 03-01 | 5/5 | ✓ VERIFIED | Canonical classification, checkbox separation, stable IDs, invalid input closure, and property scope pass after 03-16. |
| 03-02 | 3/6 | ✗ FAILED | One gate, stale-safe identity, and dependency reuse pass; complete admission, incomplete-evidence fail-closure, and deterministic phase remediation fail for the reproduced cases. |
| 03-03 | 6/6 | ✓ VERIFIED | Fixed evidence, bounded Git provenance, one matrix, read-only inputs, and smoke separation remain present. |
| 03-04 | 3/3 | ✓ VERIFIED | Malformed classifier `Result` values and artifact members return unknown without partial evidence. |
| 03-05 | 5/5 | ✓ VERIFIED | Host, nested-limit, raw graph shape, DAG, and order validation remain covered. |
| 03-06 | 6/6 | ✓ VERIFIED | Public fields, repository-scoped identity, and portable relation evidence remain covered. |
| 03-07 | 4/4 | ✓ VERIFIED | Nested progress/source-state/changed-ID validation remains wired. |
| 03-08 | 4/4 | ✓ VERIFIED | Commit and PlanningInventory runtime validation remains shared and fail-closed for its declared malformed families. |
| 03-09 | 4/4 | ✓ VERIFIED | UTF-8 scalar and producer-equivalent bounds remain covered at exact and limit+1 values. |
| 03-10 | 4/4 | ✓ VERIFIED | The literal single-inventory equality contract is implemented, but that contract is the root cause preventing canonical phase add/remove/path drift from reaching classification. |
| 03-11 | 5/5 | ✓ VERIFIED | Mapping state/members and the canonical projection remain validated through one helper. |
| 03-12 | 4/4 | ✓ VERIFIED | Inconsistent source-pinned reconciliation baselines remain wholly unknown. |
| 03-13 | 5/5 | ✓ VERIFIED | Reconciliation aggregates validate before semantic use. |
| 03-14 | 4/4 | ✓ VERIFIED | Stale decisions are encoded after final fields are set; replay remains DRIFTED and stable. |
| 03-15 | 4/4 | ✓ VERIFIED | Missing, symlink, and directory root replacement during read all return `source-root-identity-changed`. |
| 03-16 | 4/4 | ✓ VERIFIED | Both public readers validate outer/member families and preserve empty/limit/valid behavior. |

Raw PLAN-frontmatter coverage is **70/73 truths**. The headline score deduplicates overlapping PLAN and ROADMAP statements into 10 goal-level truths.

## Required Artifacts

All 42 PLAN artifact declarations pass automated existence/substance checks. Semantic status:

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `lifecycle_drift.py` | Bounded canonical observation and three-state source classification | ✓ VERIFIED | Substantive, wired, and covered by fixed public tests. |
| `lifecycle_gate.py` | Sole fresh fail-closed lifecycle admission gate | ✗ PARTIAL | Fresh gate and identity are substantive; phase add/remove/path drift is rejected before `_phase_changes`. |
| `source_identity.py` | Safe canonical source observation and reconciliation | ✓ VERIFIED | Previous root-binding and malformed reader gaps are closed by public-seam tests. |
| `execution_mapping.py` | Safe mapping construction/readiness | ✗ PARTIAL | Substantive and wired, but phase/plan/evidence canonical path roles are not cross-disjoint. |
| `tests/test_handoff_lifecycle_gate.py` | Operation, freshness, identity, drift, and evidence tests | ✗ PARTIAL | Stale replay is covered; phase add/remove/path remediation is not. |
| `tests/test_handoff_identity.py` | Public reader and reconciliation behavior | ✓ VERIFIED | Plans 03-15/03-16 add and pass the missing root-race and aggregate validation matrices. |
| `tests/test_handoff_execution_mapping.py` | Mapping validation/readiness regressions | ✗ PARTIAL | No cross-role plan-as-evidence regression exists. |
| Golden and tracked lifecycle evidence JSON | Deterministic portable reviewer evidence | ✓ VERIFIED | Exact bytes and hash match; no raw repository-dependent decision identity is serialized. |
| `03-OPTIONAL-REAL-TOOL-SMOKE.md` | Separate opt-in smoke status | ✓ VERIFIED | Honest `not-run` status; no verified runtime claim is inferred. |

## Key Link Verification

Automated PLAN checks report all 47 declared links present. Semantic verification:

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `lifecycle_gate.py` | `lifecycle_drift.py` | Fresh source classification | ✓ WIRED | Complete canonical source decision is consumed without duplicated normalization. |
| `lifecycle_gate.py` | decision identity | Complete stale decision encoding | ✓ WIRED | State, admission, issues, and projections are finalized before digesting. |
| `source_identity.py` | caller-visible repository root | Retained descriptor pre/post identity | ✓ WIRED | All three root replacement regressions pass. |
| `source_identity.py` | public input aggregates | Validation before use | ✓ WIRED | Outer and member validation precedes truthiness, length, unpacking, and filesystem work. |
| `lifecycle_gate.py` | phase change projection | `_validate_phase_graph` then `_phase_changes` | ✗ NOT_WIRED | Single-inventory equality stops valid one-sided phase drift before projection. |
| `lifecycle_gate.py` | `execution_mapping.py` | Fresh mapping readiness | ✗ UNSAFE | Call is wired, but the dependency accepts plan/evidence role collision as ready. |
| Evidence producer | public gate and JSON evidence | Deterministic serialization | ✓ WIRED | Public decisions flow into byte-identical golden/tracked evidence. |

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `lifecycle_gate.py` | `decision_identity` | Complete normalized observation plus final decision | Yes | ✓ FLOWING |
| `lifecycle_gate.py` | phase issues/remediation | Expected/current graph difference | No for add/remove/path | ✗ DISCONNECTED BY VALIDATION |
| `source_identity.py` | canonical source bytes | Descriptor-anchored reads plus final root check | Yes | ✓ FLOWING |
| `execution_mapping.py` | VERIFY readiness | Declared plan/evidence roles and observed paths | Hollow for role collision | ✗ HOLLOW ROLE EVIDENCE |
| `lifecycle_drift.py` | source drift/progress/source IDs | Bounded canonical observations | Yes | ✓ FLOWING |
| Evidence producer | decision rows and relations | Repeated public-gate calls | Yes | ✓ FLOWING |

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Plans 03-14/15/16 gap regressions | Four exact pytest functions, `--no-cov` | 33 passed in 0.62s | ✓ PASS |
| Phase 3 focused suite | `uv run pytest -q --no-cov tests/test_handoff_execution_mapping.py tests/test_handoff_identity.py tests/test_handoff_lifecycle_drift.py tests/test_handoff_lifecycle_gate.py` | 450 passed in 10.79s | ✓ PASS |
| Full project gate | `task check` | Ruff format/check green, BasedPyright 0 findings, 869 passed in 90.48s | ✓ PASS |
| Complete current phase addition | Public `gate_lifecycle_operation` probe using the fixed fixture | `unknown False ('lifecycle-phase-observation-incomplete',) () ()` | ✗ FAIL |
| Plan path reused as source/plan evidence | Public build plus `validate_mapping_readiness(... VERIFY ...)` probe | `Success(... ready=True, issues=())` | ✗ FAIL |
| Tracked/golden evidence identity | `sha256sum` on both JSON files | Both `1434c365...62e9b` | ✓ PASS |

Passing 869 tests does not refute the blockers: neither reproduced counterexample has a regression in the suite.

## Probe Execution

No phase-declared or conventional `scripts/*/tests/probe-*.sh` probe exists. Step 7c is skipped. The optional real-tool smoke remains separately opt-in and was not run.

## Requirements Coverage

| Requirement | Source Plans | Canonical Description | Status | Evidence |
|---|---|---|---|---|
| HND-03 / HARD-R2 | 03-01 through 03-16 | One common pre-operation comparison; phase/capability drift is classified with remediation; incomplete inspection becomes unknown and stops | ✗ BLOCKED | Canonical spec lines 119-137 require phase additions/removals/dependency changes to prohibit the operation and identify required recovery actions. The public gate instead loses complete phase additions as unknown, and mapping readiness accepts a plan/evidence role collision. |

All 16 Phase 3 PLAN files declare only HND-03. `REQUIREMENTS.md` maps HND-03 to Phase 3 and maps no additional requirement to Phase 3, so there is no orphaned Phase 3 requirement. The registry checkbox marks HND-03 complete while the traceability table still says pending; neither metadata value overrides live behavior.

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---:|---|---|---|
| Phase-modified source/test/evidence files | — | No unreferenced `TBD`, `FIXME`, `XXX`, TODO/HACK/placeholder, empty implementation, or console-only marker | ℹ INFO | No debt-marker blocker. |
| `lifecycle_gate.py` | 551-556 | Both graph snapshots forced equal to one current inventory | 🛑 BLOCKER | Valid phase membership/path drift cannot reach deterministic drift/remediation projection. |
| `execution_mapping.py` | 491-533 | No cross-role phase/plan/evidence path collision check | 🛑 BLOCKER | One plan file can satisfy plan, source evidence, and plan evidence roles. |

## Independent Evaluation of `03-REVIEW.md`

| Review Finding | Independent Result | Verdict |
|---|---|---|
| CR-01: complete phase addition becomes unknown without remediation | Confirmed through a separate public-gate fixture probe and direct control-flow trace from `_validate_phase_graph` to unreachable `_phase_changes` branches | BLOCKER |
| CR-02: a plan path can satisfy its own source/plan evidence and VERIFY becomes ready | Confirmed through public mapping construction and readiness with one combined owner declaration | BLOCKER |

## Disconfirmation Pass

- **Partially met requirement:** all five operations share one fresh gate, but complete phase membership/path drift cannot reach that gate's deterministic remediation projection.
- **Misleading passing test:** `test_phase_graph_and_inventory_membership_paths_must_match_exactly` protects equality to one inventory; it passes while making canonical phase add/remove/path drift unreachable.
- **Uncovered error paths:** no fixed public test exercises valid one-sided phase add/remove/path drift or phase/plan/evidence cross-role path collision.

## Human Verification Required

None. Both blockers and all three previous gap closures are deterministically testable at public seams. No visual, external-service, subjective UX, or performance judgment is required.

## Deferred Items

None. Phase 4 owns repository-wide multi-manifest ownership, Phase 5 recovery/resume, and Phase 6 finalization. None explicitly owns Phase 3 graph-drift classification or current mapping-readiness role collisions.

## Gaps Summary

Plans 03-14, 03-15, and 03-16 close the previous stale-identity, detached-root, and malformed-reader gaps, and `task check` is green. Phase 3 still does not achieve HND-03 / HARD-R2. A complete phase addition is reduced to unknown before exact remediation can be produced, and VERIFY mapping readiness can be green without a distinct evidence artifact. These two concerns are structured in frontmatter for gap planning; Phase 4 must not proceed until they are closed or explicitly overridden by a developer.

---

_Verified: 2026-07-29T05:57:24Z_
_Verifier: the agent (gsd-verifier)_
