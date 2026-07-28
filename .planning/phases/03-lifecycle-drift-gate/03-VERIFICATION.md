---
phase: 03-lifecycle-drift-gate
verified: 2026-07-28T14:20:27Z
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
    - "Canonical structured observations now reject malformed UTF-8 scalars and producer-limit+1 values before comparison or identity generation."
    - "Manifest reads now use a repository-anchored no-follow descriptor chain, and phase graphs must exactly match PlanningInventory."
    - "Mapping public APIs now validate complete SourceIdentityState and ManifestMapping values and share one canonical projection helper."
  gaps_remaining:
    - "A source-pinned canonical observation with non-empty reconciliation changes is still accepted as a clean baseline."
    - "The public source reconciliation seam still dereferences malformed inventory, parent-locator, and explicit-match values before validation."
  regressions: []
gaps:
  - truth: "Lifecycle admission requires a source-pinned canonical baseline that is internally consistent with the manifest source identity."
    status: failed
    reason: "classify_canonical_source_drift ignores expected.changed_source_item_ids. A source-pinned baseline that reports REQ-000001 changed while the working-tree observation reports no changes is classified clean, admitted, and assigned a reusable identity."
    artifacts:
      - path: "src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py"
        issue: "The classifier copies changed_source_item_ids only from observed at line 393 and never rejects a non-empty expected reconciliation delta."
      - path: "src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py"
        issue: "The sole gate trusts that clean classifier result and returns admitted=true with a decision identity."
      - path: "tests/test_handoff_lifecycle_drift.py"
        issue: "No direct classifier regression covers non-empty expected changes with empty observed changes."
      - path: "tests/test_handoff_lifecycle_gate.py"
        issue: "No FakeBoundary public-gate regression covers an inconsistent source-pinned reconciliation baseline."
    missing:
      - "Require expected/source-pinned changed_source_item_ids to be empty before comparison."
      - "Return a stable unknown issue with empty evidence and no identity when the source-pinned baseline is inconsistent."
      - "Add direct classifier and public lifecycle-gate fixed regressions for this asymmetric baseline case."
  - truth: "Malformed source reconciliation inputs return structured non-success without exceptions or partial state."
    status: failed
    reason: "reconcile_source_items raises AttributeError for inventory=object(), TypeError for explicit_matches=None, and AttributeError for a string scenario parent_locator instead of returning a Failure."
    artifacts:
      - path: "src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py"
        issue: "_validate_inventory reads inventory.items before validating the outer class, scenario parent fields before validating SourceParentLocator, and _validate_explicit_matches calls len before validating the container."
      - path: "tests/test_handoff_identity.py"
        issue: "Existing reconciliation tests cover semantic invalidity but not malformed outer/container/nested runtime families at the public seam."
    missing:
      - "Validate exact SourceInventory and items tuple before dereference."
      - "Validate SourceParentLocator and its exact string fields before attribute access."
      - "Validate the explicit_matches container before len or iteration."
      - "Add fixed public reconcile_source_items regressions for outer, container, member, nested-parent, and explicit-match malformed families."
---

# Phase 3: Lifecycle Drift Gate Verification Report

**Phase Goal:** Every lifecycle operation planned after this phase can rely on the same fresh, fail-closed drift decision.
**Verified:** 2026-07-28T14:20:27Z
**Status:** gaps_found
**Re-verification:** Yes — after Plans 03-09 through 03-11 closed the previous three gap families

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Complete canonical source inputs are classified correctly and deterministically as clean, drifted, or unknown without partial green evidence. | ✗ FAILED | A structurally valid but internally inconsistent source-pinned observation with `changed_source_item_ids=("REQ-000001",)` is classified `clean`; the public gate returns `admitted=True` and a non-null identity. |
| 2 | Malformed or over-limit `CanonicalSourceObservation` values become unknown before comparison, sorting, or identity encoding. | ✓ VERIFIED | Plan 03-09 validates nested UTF-8 scalars, 64-artifact, 4096-task, 4096-ID, and 4 MiB boundaries. The named classifier/gate regression passed in the 33-test targeted run. |
| 3 | Plan, execute, resume, verify, and finalize use the same freshly invoked public lifecycle gate and declared mapping horizons. | ✓ VERIFIED | `OPERATION_CASES` has one five-operation table; `test_operation_matrix_uses_one_complete_gate` passed. |
| 4 | Admission occurs only after canonical source, manifest, mapping, phase graph, source commit, and capability evidence are complete and mutually consistent. | ✗ FAILED | The gate accepts a source-pinned baseline whose own reconciliation evidence says it differs from the manifest source identity. |
| 5 | Missing, malformed, over-limit, timed-out, truncated, or otherwise incomplete evidence yields unknown, never crashes, and never contributes green evidence. | ✗ FAILED | `reconcile_source_items` raises three independently reproduced exceptions for malformed structured inputs, while the inconsistent baseline contributes a green lifecycle admission. |
| 6 | Decision identity binds every valid admission-relevant observed input and rejects stale or cross-repository reuse. | ✓ VERIFIED | Repository root and all observation domains are encoded; current reuse, stale reuse, and cross-root relation tests pass. |
| 7 | Public decisions expose deterministic artifact/source changes, progress candidates, remediation targets, and next actions. | ✓ VERIFIED | Projection and identity encoding are substantive; canonical drift, checkbox progress, and remediation tests pass. |
| 8 | Fixed examples are primary evidence and Hypothesis is limited to checkbox normalization. | ✓ VERIFIED | Exactly one `@given`, at `tests/test_handoff_lifecycle_drift.py:1016`; gate, mapping, and identity suites use fixed examples. |
| 9 | Reviewers have deterministic source-pinned read-only evidence for clean, drifted, unknown, checkbox-only, stale, and repository-identity relations. | ✓ VERIFIED | Golden and tracked evidence are byte-identical at SHA-256 `1434c365fd609f5f810e7845b5946fb6bc5bf286eb2b5216c0905cec48862e9b`; its named test passed. |
| 10 | One operation matrix is reused, protected inputs remain read-only, and optional real-tool smoke stays separate from normal CI. | ✓ VERIFIED | One matrix definition, tracked `mutation_operations=[]`, smoke-isolation contract, and full `task check` passed. |

**Score:** 7/10 truths verified (0 present-but-behavior-unverified)

The three previously reported implementation families are closed. The goal remains false because the common gate can still admit an internally inconsistent source-pinned baseline and one of its public source-observation dependencies still throws on malformed structured input.

### ROADMAP Success Criteria

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Shared clean/drifted/unknown classification across in-scope lifecycle operations | ⚠ PARTIAL | All five operations share one gate, but the shared classifier reports an inconsistent source-pinned baseline as clean. |
| 2 | Missing/unreadable/malformed/over-limit/incomplete observations stop instead of appearing clean | ✗ FAILED | One inconsistent source observation admits clean; malformed reconciliation aggregates raise rather than return unknown/non-success. |
| 3 | Approval-relevant evidence is bound to observed inputs and stale reuse cannot occur silently | ✓ VERIFIED | For valid complete observations, identities bind repository root and all admission domains; stale and foreign-root replay tests pass. |
| 4 | Fixed examples are primary; properties are limited to normalization | ✓ VERIFIED | Exactly one checkbox-normalization property family; all other Phase 3 behavior evidence is fixed-example based. |

### All 11 PLAN Must-Have Groups

| Plan | Raw Truth Coverage | Result | Evidence / Gap |
|---|---:|---|---|
| 03-01 | 3/5 | ✗ PARTIAL | Bounded producer behavior, checkbox separation, stable IDs, and property scope exist. Correct complete classification and universal malformed-input fail-closure are false for the two reproduced source-reconciliation cases. |
| 03-02 | 4/6 | ✗ PARTIAL | One five-operation gate, remediation, valid identity, and dependency reuse pass. Complete mutual consistency and all-incomplete-to-unknown fail for the inconsistent source-pinned baseline and malformed reconcile inputs. |
| 03-03 | 6/6 | ✓ VERIFIED | Source-pinned read-only evidence, bounded fixed-argv Git provenance, one operation matrix, protected input invariance, and smoke isolation are present and tested. |
| 03-04 | 3/3 | ✓ VERIFIED | Malformed top-level and artifact-member canonical classifier values return `canonical-observation-incomplete`; valid behavior remains green. |
| 03-05 | 5/5 | ✓ VERIFIED | Exact host inspection, nested limits, raw phase validation, duplicate/cycle rejection, and order invariance are implemented and tested. |
| 03-06 | 6/6 | ✓ VERIFIED | Public projection, repository identity, portable evidence, and the seven then-known counterexamples are green. |
| 03-07 | 4/4 | ✓ VERIFIED | Progress, SourceIdentityState, and changed-ID malformed matrices validate before canonical comparison and identity encoding. |
| 03-08 | 4/4 | ✓ VERIFIED | Commit and PlanningInventory runtime validation is shared and returns dimension-specific unknown decisions. |
| 03-09 | 4/4 | ✓ VERIFIED | UTF-8 scalar and producer-equivalent count/aggregate bounds pass exact-limit and limit+1 public-seam tests. |
| 03-10 | 4/4 | ✓ VERIFIED | Manifest descriptor ancestry and exact graph/inventory map equality pass public-gate regressions. |
| 03-11 | 5/5 | ✓ VERIFIED | Mapping APIs validate source/mapping aggregates and share `_project_canonical_manifest_mappings`; focused tests pass. |

Raw PLAN-frontmatter coverage is **48/52 truths**. The headline score deduplicates overlapping PLAN and ROADMAP statements into 10 goal-level observable truths.

## Required Artifacts

All 31 PLAN artifact declarations pass automated existence/substance checks. Semantic status:

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py` | Complete bounded canonical observation and correct three-state classifier | ✗ PARTIAL | UTF-8/bounds are substantive, but line 393 ignores expected/source-pinned reconciliation changes. |
| `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py` | Sole fresh fail-closed lifecycle admission gate | ✗ PARTIAL | Substantive and wired, but it trusts the incorrect clean classifier result and mints a reusable identity. |
| `src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py` | Safe source-state and reconciliation authority | ✗ PARTIAL | SourceIdentityState validation is complete; SourceInventory, parent-locator, and explicit-match validation still dereference before shape checks. |
| `src/ai_coding_template_ja/openspec_gsd_handoff/execution_mapping.py` | Safe mapping construction/readiness with one projection | ✓ VERIFIED | Complete source-state/mapping validation and one projection helper are present, wired, and covered by named tests. |
| `tests/test_handoff_lifecycle_drift.py` | Fixed classifier and malformed/bounds examples | ⚠ PARTIAL | Existing rows pass; no asymmetric inconsistent expected-baseline regression exists. |
| `tests/test_handoff_lifecycle_gate.py` | Five-operation, completeness, identity, evidence tests | ⚠ PARTIAL | 159-test file is substantive; no gate regression covers source-pinned reconciliation changes. |
| `tests/test_handoff_identity.py` | Public reconciliation behavior | ⚠ PARTIAL | Semantic invalidity is covered, but malformed outer/container/nested families from CR-02 are absent. |
| `tests/test_handoff_execution_mapping.py` | Mapping runtime validation and readiness | ✓ VERIFIED | SourceIdentityState, PlanningInventory, ManifestMapping, projection, and readiness regressions are substantive. |
| Golden and tracked lifecycle evidence JSON | Deterministic portable reviewer evidence | ✓ VERIFIED | Exact byte/hash match; representative evidence is valid but does not cover the new blockers. |
| `03-OPTIONAL-REAL-TOOL-SMOKE.md` | Separate opt-in smoke status | ✓ VERIFIED | Honest `not-run` status and normal-CI separation; no runtime claim is inferred. |

## Key Link Verification

Automated PLAN pattern checks report all 37 declared links present. Semantic verification:

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `lifecycle_gate.py` | `lifecycle_drift.py` | Fresh source classification | ✗ UNSAFE | The link is live, but the classifier ignores expected/source-pinned reconciliation changes and can return clean. |
| `lifecycle_drift.py` | `source_identity.py` | `read_source_inventory` plus `reconcile_source_items` | ⚠ PARTIAL | Valid filesystem data flows; malformed public reconciliation values can terminate with uncaught exceptions. |
| `lifecycle_gate.py` | manifest file | Repository-anchored `_read_manifest_bytes` | ✓ WIRED | Every component uses descriptor-relative no-follow traversal and post-read identity revalidation. |
| `lifecycle_gate.py` | `execution_mapping.py` | Exact inventory validation and mapping readiness | ✓ WIRED | Expected/observed graph maps equal validated inventory, then readiness is checked. |
| `execution_mapping.py` | `source_identity.py` | `validate_source_identity_state` | ✓ WIRED | Both builder and readiness call the shared validator before member iteration. |
| Public tests | classifier/gate/mapping APIs | Fixed parameter matrices | ⚠ PARTIAL | Old gap rows pass; the two REVIEW counterexamples have no committed regressions. |
| Evidence producer | public gate and tracked/golden JSON | Deterministic serializer | ✓ WIRED | Public decision values flow into byte-identical portable evidence. |

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `lifecycle_gate.py` | source-pinned canonical observation | `LifecycleObservationBoundary.observe_source_commit` | Yes, but its reconciliation delta is not required to be empty | ✗ INCOMPLETE CONSISTENCY |
| `lifecycle_drift.py` | current canonical artifacts/progress/source IDs | bounded readers plus `reconcile_source_items` | Yes for valid filesystem observations | ⚠ FLOWING, DEPENDENCY UNSAFE |
| `source_identity.py` | source reconciliation state | `SourceInventory`, prior state, explicit matches | Real values flow; malformed aggregates can raise before validation | ✗ HOLLOW VALIDATION |
| `lifecycle_gate.py` | manifest bytes | repository-anchored descriptor chain | Yes | ✓ FLOWING |
| `lifecycle_gate.py` | phase graph and PlanningInventory | phase boundary | Exact mutually consistent maps required | ✓ FLOWING |
| `execution_mapping.py` | canonical mappings/readiness | validated source state and inventory | Yes | ✓ FLOWING |
| Evidence producer | decision rows and relation booleans | repeated public-gate calls | Yes | ✓ FLOWING |

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Representative Plan 09–11 closures, operation matrix, stale identity, and tracked evidence | Eight exact pytest node IDs with `--no-cov` | 33 passed in 3.18s | ✓ PASS |
| Full project gate | `task check` | Ruff format/check green, BasedPyright 0 findings, 807 passed in 94.93s | ✓ PASS |
| REVIEW CR-01 public lifecycle gate | Temporary fixture; set only source-pinned `changed_source_item_ids=("REQ-000001",)` | `clean True () () identity=True` | ✗ FAIL |
| REVIEW CR-02 public reconciliation outer inventory | `reconcile_source_items(object(), valid_state)` | `AttributeError: 'object' object has no attribute 'items'` | ✗ FAIL |
| REVIEW CR-02 malformed explicit matches | `reconcile_source_items(empty_inventory, valid_state, explicit_matches=None)` | `TypeError: object of type 'NoneType' has no len()` | ✗ FAIL |
| REVIEW CR-02 malformed scenario parent | Public reconciliation with `parent_locator="bad"` | `AttributeError: 'str' object has no attribute 'source_path'` | ✗ FAIL |

The full suite is not evidence against these failures: its coverage report leaves the decisive branches at `lifecycle_drift.py:398` and `source_identity.py:968,995,1088` unexecuted.

## Probe Execution

No phase-declared or conventional `scripts/*/tests/probe-*.sh` probe exists. Step 7c is skipped. The optional real-tool smoke remains separately opt-in and was not run.

## Requirements Coverage

| Requirement | Source Plans | Canonical Description | Status | Evidence |
|---|---|---|---|---|
| HND-03 / HARD-R2 | 03-01 through 03-11 | One common pre-operation comparison; incomplete inspection becomes unknown and stops | ✗ BLOCKED | Canonical spec lines 119–137 require one contract for all operations and partial/failed inspection to become unknown. The public gate admits an inconsistent source-pinned observation, and public source reconciliation can raise instead of returning structured non-success. |

Every one of the 11 Phase 3 PLAN files declares only HND-03. `REQUIREMENTS.md` maps HND-03 to Phase 3 and maps no additional requirement to Phase 3, so there is no orphaned Phase 3 requirement. The checkbox at registry line 20 conflicts with the traceability row at line 50 (`Pending`); neither is implementation evidence, and the live behavior leaves HND-03 blocked.

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---:|---|---|---|
| Phase-modified source/test files | — | No unreferenced `TBD`, `FIXME`, `XXX`, TODO/HACK/placeholder, empty implementation, or console-only handler marker | ℹ INFO | No debt-marker blocker. |
| `lifecycle_drift.py` | 393 | Observed-only reconciliation evidence | 🛑 BLOCKER | An inconsistent source-pinned baseline is treated as clean and receives reusable identity. |
| `source_identity.py` | 967 | Outer value dereferenced before validation | 🛑 BLOCKER | Malformed public inventory raises `AttributeError`. |
| `source_identity.py` | 993–1000 | Parent fields dereferenced before `SourceParentLocator` validation | 🛑 BLOCKER | Malformed nested parent raises `AttributeError`. |
| `source_identity.py` | 1084–1087 | `len` before explicit-match container validation | 🛑 BLOCKER | `None` raises `TypeError` instead of structured failure. |

## Independent Evaluation of `03-REVIEW.md`

| Review Finding | Independent Result | Verdict |
|---|---|---|
| CR-01: source-pinned reconciliation evidence is ignored and clean-admitted | Confirmed through the real public gate: `clean`, `admitted=True`, no issues, empty projected changes, non-null identity | BLOCKER |
| CR-02: source reconciliation validators dereference malformed values before validation | Confirmed at the public `reconcile_source_items` seam: `AttributeError`, `TypeError`, and `AttributeError` for the three reported families | BLOCKER |

The findings are not refuted by the 807 passing tests. They identify uncovered inputs, and the direct public-seam results contradict the fail-closed goal.

## Human Verification Required

None. Both blockers are deterministic and programmatically reproducible. No visual, external-service, subjective UX, or performance judgment is needed.

## Deferred Items

None. Phase 4 covers repository-wide ownership, Phase 5 recovery/resume, and Phase 6 finalize preview/receipt. No later phase explicitly owns source-pinned reconciliation consistency or malformed source reconciliation input validation, so both remain Phase 3 gaps.

## Gaps Summary

Plans 03-09 through 03-11 successfully close all three gaps from the previous verification, and the full project gate is green. Phase 3 still does not achieve its goal. The sole lifecycle gate accepts an internally inconsistent source-pinned baseline as clean and reusable, and the public reconciliation dependency can terminate on malformed structured inputs instead of returning a fail-closed decision. HND-03 / HARD-R2 therefore remains blocked.

---

_Verified: 2026-07-28T14:20:27Z_
_Verifier: the agent (gsd-verifier)_
