---
phase: 03-lifecycle-drift-gate
verified: 2026-07-23T01:45:49Z
status: gaps_found
score: 5/10 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "Required capability evidence must be complete before admission."
    status: failed
    reason: "host.inspected=False is type-valid, is omitted from capability drift comparison, and produces clean/admitted."
    artifacts:
      - path: "src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py"
        issue: "_validate_capabilities accepts False and _capability_changes omits host.inspected."
    missing:
      - "Require host.inspected is True for a complete observation."
      - "Bind host.inspected into capability drift comparison and add a public-gate regression test."
  - truth: "Malformed or duplicate phase graph evidence must become unknown without an exception or normalization-based bypass."
    status: failed
    reason: "Normalization runs before validation: a None node raises AttributeError and duplicate dependency edges are deduplicated into clean/admitted."
    artifacts:
      - path: "src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py"
        issue: "observe_lifecycle_operation calls _normalize_phase_nodes before _validate_phase_graph."
    missing:
      - "Validate raw node and dependency shapes, types, uniqueness, and bounds before canonical ordering."
      - "Add None-node and duplicate-edge public-gate regression tests."
  - truth: "Malformed nested artifact limits must fail closed as unknown."
    status: failed
    reason: "LifecycleGateLimits validates only the ArtifactLimits container type; max_files='bad' reaches integer comparison and raises TypeError."
    artifacts:
      - path: "src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py"
        issue: "_valid_limits does not validate nested ArtifactLimits field types and positive values."
    missing:
      - "Validate every nested ArtifactLimits integer field before any read."
      - "Return lifecycle-input-invalid and add malformed nested-limit tests."
  - truth: "Malformed canonical structured observations must classify as unknown without raising."
    status: failed
    reason: "classify_canonical_source_drift(Success(None), Success(None)) raises AttributeError before returning canonical-observation-incomplete."
    artifacts:
      - path: "src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py"
        issue: "_is_complete_observation dereferences observation and artifact fields before checking their types."
    missing:
      - "Type-check the observation and every artifact tuple member before attribute access."
      - "Add malformed Success payload and nested artifact regression tests."
  - truth: "The shared public decision must report changed artifacts/source items and checkbox progress separately, with remediation targets."
    status: failed
    reason: "CanonicalSourceDriftDecision contains drifted_artifact_paths and progress_update_candidate, but LifecycleGateDecision drops both fields."
    artifacts:
      - path: "src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py"
        issue: "LifecycleGateDecision and _decision_from_observation project source IDs and targets but not changed artifact paths or progress update candidate."
    missing:
      - "Expose and populate drifted_artifact_paths and progress_update_candidate on the public gate decision."
      - "Include both fields in identity/evidence and public-gate regression tests."
  - truth: "Decision identity must bind every admission-relevant observed input and reject stale reuse."
    status: failed
    reason: "repository_root is validated but omitted from _decision_identity; an identity from repository A is accepted as current in byte-identical repository B."
    artifacts:
      - path: "src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py"
        issue: "The identity encoder binds source commit/change but not SourceCommitObservation.repository_root."
    missing:
      - "Bind the validated repository identity into the versioned decision digest."
      - "Add a cross-repository replay rejection test."
  - truth: "Invalid cyclic phase graphs must be unknown and never admitted."
    status: failed
    reason: "A 03<->04 dependency cycle passes structural checks and produces clean/admitted."
    artifacts:
      - path: "src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py"
        issue: "_validate_phase_nodes checks self/unknown edges but never checks graph acyclicity."
    missing:
      - "Validate expected and observed phase graphs are DAGs within existing bounds."
      - "Add two-node and longer-cycle public-gate regression tests."
---

# Phase 3: Lifecycle Drift Gate Verification Report

**Phase Goal:** Every lifecycle operation planned after this phase can rely on the same fresh, fail-closed drift decision.
**Verified:** 2026-07-23T01:45:49Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Complete canonical source inputs classify deterministically as clean/drifted; exact checkbox-only changes remain specification-clean with separate progress, and stable changed source IDs are sorted. | ✓ VERIFIED | `lifecycle_drift.py:86-205,250-311`; focused checkbox property passed and full suite passed. |
| 2 | Every malformed or incomplete canonical structured observation becomes unknown without throwing. | ✗ FAILED | `Success(None)` raises `AttributeError: 'NoneType' object has no attribute 'artifacts'` at `lifecycle_drift.py:208-218`. |
| 3 | Plan, execute, resume, verify, and finalize use one freshly invoked public lifecycle gate and the declared mapping horizons. | ✓ VERIFIED | `test_operation_matrix_uses_one_complete_gate` passed for all five rows; `gate_lifecycle_operation` invokes `observe_lifecycle_operation` on every call. |
| 4 | Admission occurs only after canonical source, schema-2 manifest, source commit/Git, mapping readiness, phase graph, and capability evidence are complete and mutually consistent. | ✗ FAILED | `host.inspected=False` and a cyclic phase graph both produce `clean`, `admitted=True`, empty issues. |
| 5 | Missing, malformed, over-limit, timed-out, truncated, or otherwise incomplete evidence yields unknown and never crashes or contributes green evidence. | ✗ FAILED | None phase node raises `AttributeError`; malformed nested limit raises `TypeError`; duplicate dependency is normalized into clean. |
| 6 | Decision identity binds every admission-relevant observed input and rejects stale reuse after any bound input changes. | ✗ FAILED | Byte-identical fixtures under different repository roots have the same identity; repository A identity is admitted in repository B. |
| 7 | Blocking/public decisions report changed artifacts/source items, progress update candidates, and deterministic remediation targets required by HARD-R2. | ✗ FAILED | Remediation tuples and source IDs exist, but public `LifecycleGateDecision` has no `drifted_artifact_paths` or `progress_update_candidate`, contrary to canonical HARD-R2 scenarios. |
| 8 | TDD uses fixed drift examples and only one Hypothesis family at the checkbox-normalization seam. | ✓ VERIFIED | Exactly one `@given` at `tests/test_handoff_lifecycle_drift.py:443`; named property test passed. |
| 9 | Reviewers have deterministic, source-pinned, read-only evidence for clean, drifted, unknown, checkbox-only, and stale outcomes. | ✓ VERIFIED | Tracked evidence and independent golden exist, are wired to the test-side producer, and `task check` passed their byte comparison. This evidence does not cover the seven counterexamples above. |
| 10 | One operation matrix is reused, canonical inputs remain read-only, and optional real-tool smoke stays separate from normal CI. | ✓ VERIFIED | One `OPERATION_CASES` table; evidence records zero mutation; smoke file says `not-run/opt-in-not-requested`; isolation test passed in `task check`. |

**Score:** 5/10 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py` | Bounded canonical observation and three-state classifier | ⚠ PARTIAL | Exists, 311 lines, substantive, imported by gate/tests; malformed structured successes can crash instead of unknown. |
| `tests/test_handoff_lifecycle_drift.py` | Fixed source matrix and sole normalization property | ⚠ PARTIAL | Exists, 512 lines, runs in CI; lacks malformed structured-result regressions that expose CR-04. |
| `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py` | Fresh fail-closed composite gate and public decision | ⚠ PARTIAL | Exists, 1147 lines, substantive and exercised; multiple malformed/invalid inputs crash or are admitted, and public evidence fields are dropped. |
| `tests/test_handoff_lifecycle_gate.py` | Public five-operation and failure/freshness tests | ⚠ PARTIAL | Exists, 1605 lines and runs in CI; does not cover the reproduced fail-open/crash/replay/cycle cases. |
| `tests/fixtures/openspec_gsd_handoff/lifecycle/expected-lifecycle-evidence.json` | Independent literal golden | ✓ VERIFIED | Exists, substantive, consumed by the evidence test. |
| `.planning/phases/03-lifecycle-drift-gate/03-LIFECYCLE-EVIDENCE.json` | Deterministic five-family reviewer evidence | ✓ VERIFIED | Exists and byte-compared against the producer/golden; scope is representative, not adversarially complete. |
| `.planning/phases/03-lifecycle-drift-gate/03-OPTIONAL-REAL-TOOL-SMOKE.md` | Separate opt-in smoke status | ✓ VERIFIED | Exists and honestly records `not-run`; normal CI exclusion is tested. |

Artifact query result: all 8 declared PLAN artifact entries passed existence/substance pattern checks. Behavioral defects above prevent the two production artifacts and their test artifacts from satisfying the phase goal.

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `lifecycle_drift.py` | `reader.py`, `progress.py`, `source_identity.py` | bounded read, progress parse, inventory/reconciliation | ✓ WIRED | All 03-01 patterns found and real values flow into `CanonicalSourceObservation`. |
| `lifecycle_gate.py` | `lifecycle_drift.py` | current observation and source classification | ⚠ PARTIAL | State/source IDs flow, but drifted artifact paths and progress update candidate stop at the lower-level decision. |
| `lifecycle_gate.py` | `execution_mapping.py` | `validate_mapping_readiness` and operation horizon | ✓ WIRED | Public operation matrix confirms declared mapping horizons. |
| `lifecycle_gate.py` | `manifest_v2.py` | exact parse and manifest digest | ✓ WIRED | Parsed manifest and raw hash enter the observation/identity. |
| Gate tests | public gate | all five operations and evidence producer | ✓ WIRED | Existing tests invoke `gate_lifecycle_operation`; the issue is missing adversarial cases, not orphaning. |
| Evidence producer | Git/preflight, golden, tracked evidence | bounded fixed argv and byte comparison | ✓ WIRED | Source-pinned blobs and current tree flow into the evidence record. |

The automated PLAN query reported 15/15 declared key-link patterns present. Semantic projection from lower-level source evidence to the public decision remains incomplete.

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `lifecycle_drift.py` | artifacts/progress/source items | bounded canonical reads plus inventory reconciliation | Yes | ⚠ PARTIAL — valid data flows, malformed structured inputs can crash validation. |
| `lifecycle_gate.py` | capability observation | boundary probe vs manifest capabilities | Yes | ✗ HOLLOW — `host.inspected` reaches validation/identity but not completeness or drift enforcement. |
| `lifecycle_gate.py` | phase graph | boundary expected/current nodes | Yes | ✗ HOLLOW — normalization can erase invalid duplicates and no DAG check exists. |
| `lifecycle_gate.py` | source drift details | `CanonicalSourceDriftDecision` | Partial | ✗ HOLLOW — public decision drops artifact paths and progress candidate. |
| `lifecycle_gate.py` | decision identity | complete observation encoder | Partial | ✗ HOLLOW — validated repository root is omitted, allowing cross-repository reuse. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Declared operation, incomplete-dimension, stale, and checkbox-property examples | `uv run pytest -q <4 named tests>` | 18 passed in 2.51s | ✓ PASS |
| Adversarial fail-closed cases from the review | `uv run python -` public-seam fixture probe | Reproduced clean admission for uninspected capability, duplicate edge, cross-repository replay, and cycle; reproduced `AttributeError`/`TypeError` for malformed inputs | ✗ FAIL |
| Full project validation | `task check` | Ruff/format/BasedPyright passed; 567 tests passed in 47.64s | ✓ PASS, but suite does not cover the counterexamples |

### Probe Execution

No phase-declared or conventional `scripts/*/tests/probe-*.sh` probes were found. Step 7c: SKIPPED (no declared probe). The optional real-tool smoke was not run because its contract explicitly requires separate opt-in.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| HND-03 / HARD-R2 | 03-01, 03-02, 03-03 | Shared pre-operation drift contract for canonical source, source commit, manifest, stable mapping, phase state, and capability evidence | ✗ BLOCKED | Canonical `spec.md:119-137`; 7 reproduced blockers violate incomplete-observation stop, required capability enforcement, evidence reporting, and stale binding. |

All three PLAN files declare HND-03. REQUIREMENTS.md maps only HND-03 to Phase 3; no orphaned Phase 3 requirement IDs were found. The registry checkbox is marked complete, but its traceability row still says Pending; neither metadata value overrides failed code evidence.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| Phase-modified files | — | No unreferenced `TBD`, `FIXME`, or `XXX`; no TODO/HACK/placeholder stub markers | ℹ INFO | No debt-marker blocker. Semantic blockers are recorded in gaps instead. |

### Independent Validation of 03-REVIEW.md

| Review finding | Independent result | Goal effect |
|---|---|---|
| CR-01 uninspected host capability | Confirmed: `clean True ()` | BLOCKER — required capability evidence can be absent while admission succeeds. |
| CR-02 validation after phase normalization | Confirmed: `None` node raises `AttributeError`; duplicate edge becomes `clean True` | BLOCKER — malformed phase inspection neither reliably returns unknown nor fails closed. |
| CR-03 malformed nested ArtifactLimits | Confirmed: `TypeError: '>' not supported between instances of 'int' and 'str'` | BLOCKER — invalid bounded input crashes the public gate. |
| CR-04 malformed canonical structured result | Confirmed: `Success(None)` raises `AttributeError` | BLOCKER — incomplete source evidence can crash rather than return unknown. |
| CR-05 public decision evidence loss | Confirmed from public dataclass/projection and checkbox probe | BLOCKER — HARD-R2-required artifact/progress reporting is unavailable from the shared decision. |
| CR-06 repository-unbound decision identity | Confirmed: identities equal across roots and prior identity is admitted in the second root | BLOCKER — approval/stale evidence can cross repository context. |
| CR-07 cyclic phase graph | Confirmed: two-node cycle returns `clean True ()` | BLOCKER — invalid phase state can authorize downstream operation. |

### Human Verification Required

None. All must-have failures were established programmatically; visual, external-service, or subjective behavior is not needed to decide this phase.

### Gaps Summary

The phase has substantive artifacts, complete declared pattern wiring, a green 567-test suite, and useful deterministic evidence. The goal is nevertheless not achieved: the single shared gate is not fail-closed for several malformed or incomplete inputs, can admit an uninspected capability and cyclic graph, permits repository-crossing identity reuse, and drops two canonical HARD-R2 evidence outputs. These seven findings are Phase 3 responsibilities and do not match the explicit goals or success criteria of later Phases 4-6, so none are deferred.

---

_Verified: 2026-07-23T01:45:49Z_
_Verifier: the agent (gsd-verifier)_
