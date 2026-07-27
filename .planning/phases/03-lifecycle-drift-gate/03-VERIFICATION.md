---
phase: 03-lifecycle-drift-gate
verified: 2026-07-27T14:15:44Z
status: gaps_found
score: 7/10 must-haves verified
behavior_unverified: 0
overrides_applied: 0
next_action: "Gaps found. Plan the fixes, then re-run execute-phase before shipping."
next_command: "/gsd:plan-phase 03 --gaps"
re_verification:
  previous_status: gaps_found
  previous_score: 5/10
  gaps_closed:
    - "host.inspected=False is now incomplete and non-admitted."
    - "Malformed/duplicate phase nodes and dependencies are validated before normalization."
    - "Nested ArtifactLimits fields are validated as positive exact integers."
    - "Top-level and artifact-member canonical structured payloads now return unknown."
    - "Public LifecycleGateDecision now exposes artifact paths and progress candidates."
    - "Decision identity now binds the validated repository root."
    - "Expected and observed cyclic phase graphs are rejected as incomplete."
  gaps_remaining:
    - "Nested Progress, SourceIdentityState, and changed source IDs are not completely runtime-validated."
    - "Boundary source/capability commit and PlanningInventory nested values can raise during validation."
  regressions: []
gaps:
  - truth: "Every malformed or incomplete canonical structured observation becomes unknown without throwing or contributing clean evidence."
    status: failed
    reason: "Nested Progress and SourceIdentityState values are accepted by outer-instance checks, while mixed-type changed_source_item_ids raises during sorting. Malformed progress can be classified clean and later crash decision identity encoding."
    artifacts:
      - path: "src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py"
        issue: "_is_complete_observation validates only outer Progress/SourceIdentityState types and the changed-ID tuple container."
      - path: "src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py"
        issue: "_encode_progress and _encode_source_state assume nested values were validated."
      - path: "tests/test_handoff_lifecycle_drift.py"
        issue: "No public regression covers malformed Progress tasks/counters, SourceIdentityState members, or changed source ID members."
    missing:
      - "Validate Progress counters, task tuple/member types, task fields, and counter invariants before comparison."
      - "Expose or share a safe complete SourceIdentityState validator that validates member types before dereference."
      - "Validate every changed_source_item_ids member as an exact string before set/sort."
      - "Add expected/observed public classifier and public-gate regressions proving canonical-observation-incomplete with empty evidence and no identity."
  - truth: "Every boundary-returned source, phase, inventory, and capability observation is validated before regex, iteration, sorting, or attribute access."
    status: failed
    reason: "Malformed source/capability commit values reach _COMMIT.fullmatch and raise TypeError; PlanningInventory phases=(None,) reaches phase.phase_id and raises AttributeError."
    artifacts:
      - path: "src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py"
        issue: "_validate_source_commit, _validate_capabilities, and _validate_phase_graph dereference nested values before complete runtime validation."
      - path: "src/ai_coding_template_ja/openspec_gsd_handoff/execution_mapping.py"
        issue: "_validate_declarations calls _inventory_bytes and cross-change attribute access before collection member type checks."
      - path: "tests/test_handoff_lifecycle_gate.py"
        issue: "No public-gate regression covers malformed source/capability commit types or nested PlanningInventory collections/members."
    missing:
      - "Validate source/capability commit values as exact strings before regex use."
      - "Provide one safe authoritative PlanningInventory validator that checks outer scalars, exact tuple containers, member types, and nested fields before attribute access."
      - "Use the safe inventory validation from the lifecycle phase boundary and mapping readiness."
      - "Add public-gate regressions for non-tuple collections, None members, and malformed nested fields with lifecycle-*-observation-incomplete, admitted=false, and identity=null."
---

# Phase 3: Lifecycle Drift Gate Verification Report

**Phase Goal:** Every lifecycle operation planned after this phase can rely on the same fresh, fail-closed drift decision.
**Verified:** 2026-07-27T14:15:44Z
**Status:** gaps_found
**Re-verification:** Yes — after closure of the previous seven gaps

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Complete canonical source inputs classify deterministically as clean/drifted; checkbox-only changes remain specification-clean with separate progress, and source IDs are sorted. | ✓ VERIFIED | `lifecycle_drift.py:116-205,265-326`; existing fixed/property tests and focused backstop passed. |
| 2 | Every malformed or incomplete canonical structured observation becomes unknown without throwing. | ✗ FAILED | Malformed `Progress.tasks=(None,)` classified `clean`; malformed `SourceIdentityState(active=(None,))` classified `clean`; mixed-type changed IDs raised `TypeError`. |
| 3 | Plan, execute, resume, verify, and finalize use one freshly invoked public lifecycle gate and the declared mapping horizons. | ✓ VERIFIED | `gate_lifecycle_operation` invokes `observe_lifecycle_operation` on every call; one `OPERATION_CASES` table supplies all five rows. |
| 4 | Admission occurs only after canonical source, schema-2 manifest, source commit/Git, mapping readiness, phase graph, planning inventory, and capability evidence are complete and mutually consistent. | ✗ FAILED | Boundary `source_commit=123`, capability `source_commit=123`, and `PlanningInventory.phases=(None,)` escape validation as uncaught exceptions. |
| 5 | Missing, malformed, over-limit, timed-out, truncated, or otherwise incomplete evidence yields unknown, never crashes, and never contributes green evidence. | ✗ FAILED | The same seven independent nested counterexamples produce two clean misclassifications and five uncaught exceptions instead of unknown. |
| 6 | Decision identity binds every valid admission-relevant observed input and rejects stale or cross-repository reuse. | ✓ VERIFIED | Repository root is encoded at `lifecycle_gate.py:977-985`; same-root/cross-root/stale named test passed. |
| 7 | Public decisions report changed artifacts/source items, progress candidates, remediation, and deterministic next actions. | ✓ VERIFIED | Public fields project at `lifecycle_gate.py:1110-1131`; canonical drift and checkbox progress evidence contain exact values. |
| 8 | TDD uses fixed drift examples and only one Hypothesis family at the checkbox-normalization seam. | ✓ VERIFIED | Exactly one `@given`, at `tests/test_handoff_lifecycle_drift.py:510`; no Hypothesis use in gate tests. |
| 9 | Reviewers have deterministic, source-pinned, read-only evidence for clean, drifted, unknown, checkbox-only, stale, and repository-identity relations. | ✓ VERIFIED | Tracked/golden files are byte-identical at SHA-256 `1434c365…62e9b`; v2 relation booleans are true and forbidden raw identity/root keys are absent. |
| 10 | One operation matrix is reused, protected inputs remain read-only, and optional real-tool smoke stays separate from normal CI. | ✓ VERIFIED | One `OPERATION_CASES`; evidence has `mutation_operations=[]` and unchanged hashes; smoke remains `not-run/opt-in-not-requested`. |

**Score:** 7/10 deduplicated truths verified (0 present-but-behavior-unverified)

Truths 2, 4, and 5 are two root-cause blockers: incomplete nested canonical validation and incomplete boundary-result validation. They are grouped into two actionable gaps.

### ROADMAP Success Criteria

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Shared clean/drifted/unknown classification across in-scope operations | ✓ VERIFIED | Single public gate and five-operation matrix. |
| 2 | Missing/unreadable/malformed/over-limit/incomplete observations stop instead of appearing clean | ✗ FAILED | Malformed nested canonical progress/source state and malformed boundary values do not reliably stop as unknown. |
| 3 | Approval-relevant evidence is bound and stale reuse cannot occur silently | ✓ VERIFIED | Valid complete inputs are repository-bound; stale/cross-root tests pass. |
| 4 | Fixed examples are primary; properties are limited to normalization | ✓ VERIFIED | One checkbox-normalization Hypothesis family only. |

### All PLAN Truths Coverage

| Plan | Truth IDs | Result | Evidence / gap |
|---|---|---|---|
| 03-01 | 1, 2, 3, 5 | ✓ VERIFIED | Valid complete source classification, checkbox split, stable source IDs, and property scope are implemented and tested. |
| 03-01 | 4 | ✗ FAILED | “Malformed input is unknown, never clean” fails for malformed nested `Progress`/`SourceIdentityState`; mixed changed IDs raise. |
| 03-02 | 1, 4, 5, 6 | ✓ VERIFIED | One gate, valid complete-input identity/stale protection, reused source/mapping seams, and remediation projection are verified. |
| 03-02 | 2, 3 | ✗ FAILED | Complete-observation conjunction and all-incomplete-to-unknown claims fail for malformed boundary nested values. |
| 03-03 | 1–6 | ✓ VERIFIED | Fixed public-gate evidence, pinned Git bytes, checkbox transition, one operation matrix, read-only proof, and optional-smoke isolation all hold for documented rows. |
| 03-04 | 2, 3 | ✓ VERIFIED | Top-level invalid `Success` payloads and malformed artifact members/fields return unknown; valid behavior remains green. |
| 03-04 | 1 | ✗ FAILED | The broader “malformed canonical structured results never raise” truth remains false for progress/source-state/changed-ID members. |
| 03-05 | 1–5 | ✓ VERIFIED | Host exact-true, nested limits, raw phase nodes/edges, DAGs, and valid-order invariance are covered by passing public-gate tests. |
| 03-06 | 1–6 | ✓ VERIFIED | Public path/progress fields, unknown defaults, repository binding, portable v2 evidence, relation booleans, and all previous seven exact counterexamples are green. |

Raw PLAN-frontmatter coverage is 27/31 truths. After merging overlapping PLAN and ROADMAP statements, the goal score is 7/10.

## Required Artifacts

All 16 PLAN artifact declarations pass automated existence/substance pattern checks. Semantic status follows.

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py` | Bounded canonical observation and three-state classifier | ⚠ PARTIAL | Exists, substantive, wired; nested progress/source-state/ID values are not fully validated and can be clean or raise. |
| `tests/test_handoff_lifecycle_drift.py` | Fixed source matrix and sole normalization property | ⚠ PARTIAL | Exists and passes covered cases; omits the reproduced nested progress/source-state/changed-ID counterexamples. |
| `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py` | Fresh fail-closed composite gate and complete public decision | ⚠ PARTIAL | Exists, substantive, wired; boundary validators can raise on malformed nested source/capability/inventory values. |
| `tests/test_handoff_lifecycle_gate.py` | Public five-operation, fail-closed, projection, and freshness tests | ⚠ PARTIAL | Existing old-gap tests pass; no regression covers the latest two critical families. |
| `tests/fixtures/openspec_gsd_handoff/lifecycle/expected-lifecycle-evidence.json` | Independent portable literal golden | ✓ VERIFIED | Byte-identical to tracked evidence; required v2 fields/relations are present. |
| `.planning/phases/03-lifecycle-drift-gate/03-LIFECYCLE-EVIDENCE.json` | Deterministic five-family reviewer evidence | ✓ VERIFIED | Deterministic and source-pinned for its rows; it does not cover the newly reproduced malformed nested inputs. |
| `.planning/phases/03-lifecycle-drift-gate/03-OPTIONAL-REAL-TOOL-SMOKE.md` | Separate opt-in smoke status | ✓ VERIFIED | Honestly records not-run and remains outside normal CI. |

## Key Link Verification

Automated PLAN checks report 23/23 declared link patterns present. Semantic verification:

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `lifecycle_drift.py` | reader/progress/source identity | bounded observation and reconciliation | ⚠ PARTIAL | Valid reader-produced data flows; caller-constructed nested dataclass values are not completely revalidated. |
| `lifecycle_gate.py` | `lifecycle_drift.py` | fresh source classification and public projection | ⚠ PARTIAL | Valid decisions project correctly; malformed canonical progress can reach identity encoding and crash. |
| `lifecycle_gate.py` | `execution_mapping.py` | planning inventory and mapping readiness | ✗ NOT SAFE | `PlanningInventory` outer type is accepted before nested member validation; both gate and mapping validator can dereference `None`. |
| `lifecycle_gate.py` | manifest/source commit/capability boundary | typed observation validators | ✗ NOT SAFE | Commit values reach regex before exact-string validation. |
| Gate tests | public gate | operation matrix, fail-closed rows, identity relations | ⚠ PARTIAL | Covered cases pass; latest REVIEW counterexamples are absent. |
| Evidence producer | public gate/golden/tracked evidence | deterministic compact JSON | ✓ WIRED | Public values flow to v2 evidence; raw repository identity data is omitted. |

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `lifecycle_drift.py` | artifacts/progress/source items/changed IDs | bounded readers or structured caller values | Partially | ✗ HOLLOW VALIDATION — valid data flows, but malformed nested structured values can be treated as complete. |
| `lifecycle_gate.py` | source commit/capability commit | boundary results | Partially | ✗ HOLLOW VALIDATION — regex is called before scalar type validation. |
| `lifecycle_gate.py` | planning inventory | phase boundary → mapping readiness → identity | Partially | ✗ HOLLOW VALIDATION — nested collections/members are dereferenced before authoritative validation. |
| `lifecycle_gate.py` | public paths/progress/remediation | `CanonicalSourceDriftDecision` plus phase/capability diffs | Yes for valid complete values | ✓ FLOWING |
| Evidence producer | decisions and identity relations | repeated public-gate calls plus pinned Git blobs | Yes | ✓ FLOWING |

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Previous gap closures: malformed top-level payload, uninspected host, cycles, repository identity, tracked evidence | `uv run pytest -q <5 named tests>` | 11 passed in 2.85s | ✓ PASS |
| Latest REVIEW CR-01 public counterexamples | independent `uv run python -` fixture probe | progress classifier returned clean; public gate raised `AttributeError`; source state returned clean; mixed IDs raised `TypeError` | ✗ FAIL |
| Latest REVIEW CR-02 public counterexamples | same independent fixture probe | source commit `TypeError`; planning inventory member `AttributeError`; capability commit `TypeError` | ✗ FAIL |
| Full project gate | `task check` | Not rerun in this verification; orchestrator/reviewer supplied 616 passed | ℹ NOT RERUN |
| Prior-phase regression | supplied prior-phase regression command | Not rerun in this verification; orchestrator supplied 295 passed | ℹ NOT RERUN |

## Probe Execution

No phase-declared or conventional `scripts/*/tests/probe-*.sh` probe was found. Step 7c skipped. The optional real-tool smoke was not run because it requires separate explicit opt-in and is not deterministic Phase 3 evidence.

## Requirements Coverage

| Requirement | Source Plans | Canonical Description | Status | Evidence |
|---|---|---|---|---|
| HND-03 / HARD-R2 | 03-01 through 03-06 | Common pre-operation comparison; incomplete inspection becomes unknown and stops | ✗ BLOCKED | Canonical `spec.md:119-137`; malformed nested canonical and boundary evidence violates lines 135-137. |

Every Phase 3 PLAN declares HND-03. REQUIREMENTS.md maps only HND-03 to Phase 3; no orphaned Phase 3 requirement exists. The registry checkbox/traceability row says Complete, but metadata does not override failing public-seam behavior.

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| Phase-modified files | — | No unreferenced `TBD`, `FIXME`, `XXX`; no TODO/HACK/placeholder stub marker | ℹ INFO | No debt-marker blocker. |
| `lifecycle_drift.py` | 208-252 | Outer dataclass instance treated as sufficient nested validation | 🛑 BLOCKER | Malformed evidence can be clean or crash. |
| `lifecycle_gate.py` | 414-499 | Regex/iteration/attribute access before exact nested validation | 🛑 BLOCKER | Boundary failure can crash the sole admission seam. |
| `execution_mapping.py` | 288-348 | Inventory byte/cross-change traversal before member type validation | 🛑 BLOCKER | Malformed inventory cannot reliably become classified failure. |

## Independent Validation of Latest 03-REVIEW.md

| Review finding | Independent result | Goal effect |
|---|---|---|
| CR-01 canonical nested state is not validated | Confirmed: `Progress.tasks=(None,)` classified clean and gate raised `AttributeError`; malformed source state classified clean; mixed changed IDs raised `TypeError`. | BLOCKER |
| CR-02 boundary nested values are dereferenced before validation | Confirmed: malformed source/capability commit raised `TypeError`; `PlanningInventory.phases=(None,)` raised `AttributeError`. | BLOCKER |

The latest REVIEW's two critical findings are true. A green 616-test suite is misleading because those public-seam counterexamples are absent from the suite.

## Human Verification Required

None. The blockers are deterministic and programmatically reproduced. No visual, external-service, performance-feel, or subjective check is needed for this verdict.

## Deferred Items

None. Phases 4–6 cover ownership, recovery, and finalization. None explicitly owns completion of Phase 3 canonical/boundary validation. Both gaps remain Phase 3 blockers.

## Gaps Summary

The previous seven exact gaps are closed, but the phase goal is still not achieved. The shared gate is fail-closed only for the currently enumerated shapes; malformed nested canonical state and boundary-returned inventory/commit data can still produce clean evidence or terminate with uncaught exceptions. Because HARD-R2 explicitly requires failed or incomplete inspection to become `unknown` and stop, HND-03 remains blocked.

---

_Verified: 2026-07-27T14:15:44Z_
_Verifier: the agent (gsd-verifier)_
