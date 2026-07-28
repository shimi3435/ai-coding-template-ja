---
phase: 03-lifecycle-drift-gate
verified: 2026-07-28T05:34:13Z
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
    - "Malformed nested Progress, SourceIdentityState, and changed source-ID evidence now returns canonical-observation-incomplete before comparison, sorting, or identity encoding."
    - "Malformed source/capability commit values and malformed PlanningInventory outer/container/member/field families now return dimension-specific unknown decisions."
  gaps_remaining:
    - "Canonical structured observations are not revalidated for UTF-8 scalar validity or producer-equivalent count/aggregate bounds."
    - "Manifest ancestry and phase graph-to-inventory membership are not proven repository-anchored and exactly mutually consistent."
    - "Mapping public APIs do not validate complete SourceIdentityState and ManifestMapping nested runtime values before use."
  regressions: []
gaps:
  - truth: "Every malformed or over-limit canonical structured observation becomes unknown without throwing or receiving a reusable identity."
    status: failed
    reason: "A lone-surrogate task description raises UnicodeEncodeError during decision identity encoding, and a self-consistent 4097-task Progress is classified drifted with a reusable identity instead of unknown."
    artifacts:
      - path: "src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py"
        issue: "_is_complete_observation and _is_complete_progress validate Python types and counter invariants but not UTF-8 scalar validity, task/artifact/changed-ID counts, or aggregate bytes."
      - path: "src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py"
        issue: "_decision_identity assumes every canonical nested string is encodable and encodes over-limit structured values."
      - path: "tests/test_handoff_lifecycle_drift.py"
        issue: "No expected/observed public-classifier regression covers lone surrogates or producer limit+1 structured observations."
      - path: "tests/test_handoff_lifecycle_gate.py"
        issue: "No public-gate regression proves malformed Unicode and 4097-task observations are wholly unknown and identity-free."
    missing:
      - "Validate all canonical nested strings as UTF-8 scalars before comparison, sorting, and identity encoding."
      - "Apply producer-equivalent artifact, task, changed-ID, and aggregate-byte limits to caller/boundary-constructed canonical observations."
      - "Add 4096/4097 and malformed-Unicode public classifier and public-gate fixed regressions on expected and observed sides."
  - truth: "Clean lifecycle admission uses only a repository-anchored manifest and a phase graph exactly consistent with the validated PlanningInventory."
    status: failed
    reason: "An intermediate .planning/openspec symlink can redirect handoff.json outside the repository and still admit clean; an undeclared extra phase present in both expected and observed graphs also admits FINALIZE clean."
    artifacts:
      - path: "src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py"
        issue: "_read_manifest_bytes protects only the final file descriptor, while _validate_phase_graph checks inventory phases are a subset of observed nodes rather than exact bidirectional membership/path equality."
      - path: "tests/test_handoff_lifecycle_gate.py"
        issue: "No public-gate regression covers intermediate manifest-parent symlinks or extra graph phases absent from inventory."
    missing:
      - "Open and revalidate every manifest path component relative to a no-follow repository directory descriptor."
      - "Require exact phase ID/path consistency between the validated PlanningInventory and the phase graph before admission."
      - "Add public-gate regressions for intermediate symlink/parent identity changes and inventory-only/graph-only phase mismatches."
  - truth: "Every mapping public API validates complete SourceIdentityState and ManifestMapping nested values before iteration, hashing, set construction, equality, or attribute access."
    status: failed
    reason: "build_manifest_mappings and validate_mapping_readiness raise AttributeError for SourceIdentityState(active=(None,)); readiness also raises TypeError for ManifestMapping.source_id=[]."
    artifacts:
      - path: "src/ai_coding_template_ja/openspec_gsd_handoff/execution_mapping.py"
        issue: "The public APIs validate only the SourceIdentityState outer class and ManifestMapping member class before dereferencing or hashing nested values."
      - path: "src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py"
        issue: "validate_source_identity_state exists and is substantive, but the mapping consumers do not call it."
      - path: "tests/test_handoff_execution_mapping.py"
        issue: "PlanningInventory malformed matrices are comprehensive, but SourceIdentityState and ManifestMapping nested malformed matrices are absent at builder/readiness seams."
    missing:
      - "Call validate_source_identity_state at the start of mapping construction and readiness."
      - "Validate the complete mappings tuple, every ManifestMapping scalar and nested tuple/member, ordering, uniqueness, and path invariants before set/equality operations."
      - "Add public builder/readiness fixed regressions for outer/container/member/field malformed families."
---

# Phase 3: Lifecycle Drift Gate Verification Report

**Phase Goal:** Every lifecycle operation planned after this phase can rely on the same fresh, fail-closed drift decision.
**Verified:** 2026-07-28T05:34:13Z
**Status:** gaps_found
**Re-verification:** Yes — after Plans 03-07 and 03-08 attempted to close the prior two gap families

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Complete canonical source inputs classify deterministically as clean/drifted/unknown; checkbox-only changes remain specification-clean with separate progress and stable sorted source IDs. | ✓ VERIFIED | Public classifier implementation at `lifecycle_drift.py:304-365`; fixed/property tests passed in the 289-test phase run. |
| 2 | Every malformed or incomplete canonical structured observation becomes unknown without throwing or receiving identity. | ✗ FAILED | Lone-surrogate `NormalizedTask.description` raised `UnicodeEncodeError`; 4097 tasks produced `drifted`, `manifest-progress-mismatch`, and a non-null identity. |
| 3 | Plan, execute, resume, verify, and finalize use one freshly invoked public lifecycle gate and the declared mapping horizons. | ✓ VERIFIED | One `OPERATION_CASES` table at `test_handoff_lifecycle_gate.py:1083-1090`; operation, fresh reuse, and stale tests passed. |
| 4 | Admission occurs only after repository-anchored manifest, canonical source, mapping, phase graph, and capability evidence are complete and mutually consistent. | ✗ FAILED | Intermediate manifest-parent symlink and an inventory-undeclared extra phase both returned `clean`, `admitted=True`. |
| 5 | Missing, malformed, over-limit, timed-out, truncated, or otherwise incomplete evidence yields unknown, never crashes, and never contributes green evidence. | ✗ FAILED | Unicode and mapping malformed values raised; over-limit canonical data received identity; two incomplete trust/consistency cases admitted clean. |
| 6 | Decision identity binds every valid admission-relevant observed input and rejects stale or cross-repository reuse. | ✓ VERIFIED | Repository real path is encoded at `lifecycle_gate.py:989-997`; same-root, cross-root, current-reuse, and stale-reuse behavioral tests passed. |
| 7 | Public decisions report changed artifacts/source items, progress candidates, remediation, and deterministic next actions. | ✓ VERIFIED | Projection at `lifecycle_gate.py:1122-1143`; exact remediation and progress tests passed. |
| 8 | TDD uses fixed drift examples and only one Hypothesis family at the checkbox-normalization seam. | ✓ VERIFIED | Exactly one `@given`, at `test_handoff_lifecycle_drift.py:809`; no Hypothesis family in gate or mapping tests. |
| 9 | Reviewers have deterministic source-pinned read-only evidence for clean, drifted, unknown, checkbox-only, stale, and repository-identity relations. | ✓ VERIFIED | Tracked and golden evidence are byte-identical at SHA-256 `1434c365fd609f5f810e7845b5946fb6bc5bf286eb2b5216c0905cec48862e9b`; evidence test passed. |
| 10 | One operation matrix is reused, protected inputs remain read-only, and optional real-tool smoke stays separate from normal CI. | ✓ VERIFIED | One matrix definition, tracked `mutation_operations=[]`, smoke isolation test, and `task check` all passed. |

**Score:** 7/10 truths verified (0 present-but-behavior-unverified)

Truths 2, 4, and 5 remain failed. Plans 03-07/03-08 close the previously known malformed nested-state families, but the broader fail-closed goal is still false under five additional public-seam counterexamples.

### ROADMAP Success Criteria

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Shared clean/drifted/unknown classification across in-scope lifecycle operations | ✓ VERIFIED | One gate and one five-operation mapping table; behavior tests passed. |
| 2 | Missing/unreadable/malformed/over-limit/incomplete observations stop instead of appearing clean | ✗ FAILED | Symlinked manifest ancestry and undeclared graph phase admit clean; Unicode/mapping values raise; 4097 tasks receive identity. |
| 3 | Approval-relevant evidence is bound to observed inputs and stale reuse cannot occur silently | ✓ VERIFIED | Valid complete same-root/cross-root/current/stale relation tests passed; no accepted override exists. |
| 4 | Fixed examples are primary; properties are limited to normalization | ✓ VERIFIED | One checkbox-normalization property family; all other relevant tests are fixed examples. |

### All PLAN Truths Coverage

| Plan | Result | Evidence / Gap |
|---|---|---|
| 03-01 | 4/5 | Valid bounded producer behavior and sole property scope pass; the broad malformed/over-limit truth fails for caller-constructed Unicode and 4097-task observations. |
| 03-02 | 4/6 | One gate, remediation, valid identity, and dependency reuse pass; complete-conjunction and all-incomplete-to-unknown truths fail. |
| 03-03 | 6/6 | Declared deterministic evidence, Git provenance, operation-matrix reuse, protected input invariance, and smoke isolation pass for documented rows. |
| 03-04 | 2/3 | Top-level and artifact-member fixed cases pass; the broader “malformed structured results never raise” truth fails for malformed Unicode. |
| 03-05 | 5/5 | Exact host, nested limits, raw graph shape, duplicate/cycle, and order-invariance fixed cases pass. |
| 03-06 | 6/6 | Public projection, repository identity relations, portable evidence, and the previously enumerated seven counterexamples pass. |
| 03-07 | 4/4 | Exact Progress/source-state/changed-ID malformed matrices pass at classifier and gate seams. |
| 03-08 | 3/4 | Commit and PlanningInventory matrices pass; the universal malformed-boundary claim fails at mapping SourceIdentityState/ManifestMapping seams and canonical Unicode. |

Raw PLAN-frontmatter coverage is 34/39 truths. The goal score above deduplicates overlapping PLAN and ROADMAP statements into 10 observable truths.

## Required Artifacts

All 24 PLAN artifact declarations pass automated existence/substance checks. Semantic status:

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `lifecycle_drift.py` | Complete bounded canonical observation/classifier | ✗ PARTIAL | Substantive and wired; structured completeness lacks UTF-8 and producer-equivalent bounds. |
| `lifecycle_gate.py` | Sole fresh fail-closed gate and identity | ✗ PARTIAL | Substantive and wired; manifest ancestry and exact graph/inventory consistency are not enforced. |
| `execution_mapping.py` | Safe mapping construction/readiness | ✗ PARTIAL | PlanningInventory validation is substantive; SourceIdentityState and ManifestMapping nested validation is incomplete. |
| `source_identity.py` | Authoritative SourceIdentityState validator | ✓ VERIFIED | `validate_source_identity_state` exists, is substantive, and is used by reconciliation/canonical classification; mapping consumers omit it. |
| `test_handoff_lifecycle_drift.py` | Fixed drift/malformed cases plus sole normalization property | ⚠ PARTIAL | Covered cases pass; Unicode and in-memory limit+1 families are absent. |
| `test_handoff_lifecycle_gate.py` | Five-operation, completeness, identity, evidence tests | ⚠ PARTIAL | 130 tests pass; latest five review counterexamples are absent. |
| `test_handoff_execution_mapping.py` | Inventory and mapping public-seam tests | ⚠ PARTIAL | PlanningInventory matrix passes; malformed source state/mapping member cases are absent. |
| Golden and tracked lifecycle evidence JSON | Deterministic portable reviewer evidence | ✓ VERIFIED | Exact byte/hash match; documents representative rows but does not prove the missing counterexamples. |
| `03-OPTIONAL-REAL-TOOL-SMOKE.md` | Separate opt-in smoke status | ✓ VERIFIED | Honest `not-run` status; isolation from normal CI is tested. |

## Key Link Verification

Automated PLAN checks report all 29 declared pattern links present. Semantic verification:

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `lifecycle_drift.py` | reader/progress/source identity | Bounded producer and reconciliation | ✓ WIRED | Repository-produced valid/invalid fixed cases flow correctly. |
| `lifecycle_gate.py` | `lifecycle_drift.py` | Fresh source classification and projection | ⚠ UNSAFE | Boundary-built canonical Unicode/limit+1 values bypass complete validation before identity. |
| `lifecycle_gate.py` | manifest file | `_read_manifest_bytes` | ✗ NOT SAFE | Final file no-follow is present, but parent path components are not repository-descriptor anchored. |
| `lifecycle_gate.py` | `execution_mapping.py` | Inventory validation and mapping readiness | ⚠ PARTIAL | PlanningInventory is validated; exact graph membership and mapping nested values are incomplete. |
| `execution_mapping.py` | `source_identity.py` | Complete source-state validation | ✗ NOT WIRED | `validate_source_identity_state` is not imported/called by builder or readiness. |
| Public tests | public classifier/gate/mapping APIs | Fixed parameter matrices | ⚠ PARTIAL | Existing rows pass; five independently reproduced public counterexamples are missing. |
| Evidence producer | public gate/golden/tracked record | Deterministic compact JSON | ✓ WIRED | Public values flow and portable bytes match exactly. |

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `lifecycle_gate.py` | manifest bytes | `.planning/openspec/<change>/handoff.json` | Yes, but may come through external parent symlink | ✗ TRUST DISCONNECTED |
| `lifecycle_drift.py` | artifacts/progress/source IDs | bounded reader or boundary-constructed dataclass | Valid data flows; malformed Unicode/limit+1 also flows | ✗ HOLLOW VALIDATION |
| `lifecycle_gate.py` | phase nodes and PlanningInventory | phase boundary | Real declarations flow; inventory is only a subset check against graph | ✗ PARTIAL CONSISTENCY |
| `execution_mapping.py` | source items and mappings | manifest/source identity plus validated inventory | Real values flow; malformed nested values reach dereference/hash | ✗ HOLLOW VALIDATION |
| `lifecycle_gate.py` | public remediation/progress/identity | complete observation | Yes for valid inputs | ✓ FLOWING |
| Evidence producer | decision views and relation booleans | repeated public-gate calls | Yes | ✓ FLOWING |

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Phase 3 focused suites | `uv run pytest tests/test_handoff_execution_mapping.py tests/test_handoff_lifecycle_drift.py tests/test_handoff_lifecycle_gate.py -q` | 289 passed in 36.97s | ✓ PASS |
| Full project gate | `task check` | Ruff/format/BasedPyright green; 758 passed in 84.98s | ✓ PASS |
| REVIEW CR-01 | read-only public-gate probe with intermediate `.planning/openspec` symlink | `clean True ()` | ✗ FAIL |
| REVIEW CR-02 | public-gate probe with lone-surrogate task description | `UnicodeEncodeError` | ✗ FAIL |
| REVIEW CR-03 | public-gate probe with 4097-task Progress | `drifted False ('manifest-progress-mismatch',) identity=True` | ✗ FAIL |
| REVIEW CR-04 | FINALIZE with same undeclared extra phase in both graphs | `clean True ()` | ✗ FAIL |
| REVIEW CR-05 | public mapping probes with malformed source state/mapping | `AttributeError`, `AttributeError`, `TypeError` | ✗ FAIL |

The green suites are not semantic evidence for the missing rows; their coverage report also leaves the decisive mapping validation branches uncovered.

## Probe Execution

No phase-declared or conventional `scripts/*/tests/probe-*.sh` probe exists. Step 7c was skipped. The optional real-tool smoke was not run because it remains separately opt-in and is not required to reproduce these deterministic blockers.

## Requirements Coverage

| Requirement | Source Plans | Canonical Description | Status | Evidence |
|---|---|---|---|---|
| HND-03 / HARD-R2 | 03-01 through 03-08 | One common pre-operation comparison; incomplete inspection becomes unknown and stops | ✗ BLOCKED | Canonical spec lines 119-137; five reproduced public-seam counterexamples violate complete, mutually consistent, fail-closed admission. |

Every Phase 3 PLAN declares HND-03. REQUIREMENTS.md maps only HND-03 to Phase 3, so no orphaned Phase 3 requirement exists. The registry checkbox and ROADMAP completion metadata are task-progress claims, not implementation evidence; the registry traceability row still says Pending.

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| Phase-modified files | — | No unreferenced `TBD`, `FIXME`, `XXX`, TODO/HACK/placeholder, or empty implementation marker | ℹ INFO | No debt-marker blocker. |
| `lifecycle_drift.py` | 210-290 | Type/invariant checks without UTF-8 or structured count/byte bounds | 🛑 BLOCKER | Malformed evidence can crash or mint identity. |
| `lifecycle_gate.py` | 268-294 | Final-file no-follow without anchored parent traversal | 🛑 BLOCKER | Repository-external manifest can be admitted clean. |
| `lifecycle_gate.py` | 436-462 | One-way inventory-to-graph subset validation | 🛑 BLOCKER | Undeclared phases can bypass readiness and admit FINALIZE. |
| `execution_mapping.py` | 650-728, 1050-1095 | Outer-only source/mapping validation before nested use | 🛑 BLOCKER | Public APIs terminate on malformed runtime values. |
| `execution_mapping.py` | 695-767 | Mapping projection duplicated in builder and `_expected_mappings` | ⚠ WARNING | Future semantic drift can split mapping authorities; not independently goal-blocking today. |

## Independent Validation of Latest 03-REVIEW.md

| Review finding | Independent result | Goal effect |
|---|---|---|
| CR-01 external manifest via intermediate symlink | Confirmed: `clean`, admitted | BLOCKER |
| CR-02 malformed Unicode reaches identity encoding | Confirmed: `UnicodeEncodeError` | BLOCKER |
| CR-03 over-limit canonical Progress gets identity | Confirmed: drifted, non-null identity | BLOCKER |
| CR-04 inventory-undeclared phase admits FINALIZE | Confirmed: `clean`, admitted | BLOCKER |
| CR-05 mapping nested values raise | Confirmed: two `AttributeError`, one `TypeError` | BLOCKER |
| WR-01 duplicated mapping projection | Confirmed structurally at `execution_mapping.py:695-767` | WARNING |

## Human Verification Required

None. The blockers are deterministic, programmatically reproducible public-seam failures. No visual, external-service, performance-feel, or subjective decision is needed for this verdict.

## Deferred Items

None. Phase 4 owns repository-wide ownership evidence, Phase 5 recovery/resume, and Phase 6 finalization preview/receipt. None explicitly owns Phase 3 manifest anchoring, canonical structured bounds, exact phase-inventory consistency, or mapping runtime validation. The three gaps remain Phase 3 blockers.

## Gaps Summary

Plans 03-07 and 03-08 successfully close the two previously documented nested validation families, and all existing tests pass. The phase goal nevertheless remains unachieved: the sole lifecycle gate can still accept repository-external or inventory-incomplete evidence as clean, crash on malformed canonical/mapping values, and issue reusable identity for over-limit canonical state. Because HARD-R2 requires incomplete inspection to become `unknown` and stop, HND-03 is blocked and Phase 4 must not rely on this boundary yet.

---

_Verified: 2026-07-28T05:34:13Z_
_Verifier: the agent (gsd-verifier)_
