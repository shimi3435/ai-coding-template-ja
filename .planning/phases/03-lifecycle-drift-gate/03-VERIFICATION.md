---
phase: 03-lifecycle-drift-gate
verified: 2026-07-29T11:41:37Z
status: gaps_found
score: 5/10 must-haves verified
behavior_unverified: 0
overrides_applied: 0
next_action: "Gaps found. Fix the implementation and exit-evidence gaps, then re-run independent verification before Phase 4."
next_command: "/gsd:plan-phase 03 --gaps"
re_verification:
  previous_status: gaps_found
  previous_score: 7/10
  gaps_closed:
    - "Complete phase additions, removals, path changes, dependency changes, and combinations now reach deterministic DRIFTED classification and remediation."
    - "Phase, plan, and evidence path-role collisions now fail before readiness, filesystem observation, hashing, or identity generation."
  gaps_remaining:
    - "Malformed source-pinned phase paths receive identity-bearing DRIFTED decisions instead of identity-free UNKNOWN decisions."
    - "apply_manifest_refresh can overwrite a target update made after its final guard and still return Success."
    - "Malformed SourceIdentityLimits values escape both public source readers as AttributeError rather than structured Failure."
    - "Refresh approval evidence omits active-to-tombstone source changes."
    - "The canonical Phase 3 exit gate lacks a clean review, a security report with zero open threats, and Complete HND-03 traceability."
  regressions:
    - "The previously verified malformed/incomplete-evidence truth is disproved by malformed expected phase paths and malformed source limits."
gaps:
  - truth: "Malformed or incomplete phase/source observations become identity-free UNKNOWN before comparison or remediation."
    status: failed
    reason: "Backslash, NUL, and non-NFC expected phase paths all pass _canonical_phase_path and produce identity-bearing DRIFTED decisions; malformed SourceIdentityLimits raises AttributeError from both public readers."
    artifacts:
      - path: "src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py"
        issue: "_canonical_phase_path at lines 408-420 does not reject backslash, NUL, or non-NFC path components."
      - path: "src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py"
        issue: "_valid_limits at lines 405-409 dereferences the outer value before validating its exact runtime type."
      - path: "tests/test_handoff_lifecycle_gate.py"
        issue: "No public-gate regression covers malformed expected phase paths on both expected and observed graph sides."
      - path: "tests/test_handoff_identity.py"
        issue: "No public-reader regression covers malformed limits outer values and fields."
    missing:
      - "Validate every expected and observed phase path as a canonical UTF-8 NFC POSIX repository-relative phase path before graph comparison."
      - "Return identity-free UNKNOWN with no remediation for malformed phase graph input."
      - "Validate SourceIdentityLimits outer type and fields before dereference and return source-limits-invalid from both readers."
      - "Add fixed public regressions for backslash, NUL, NFD, wrong limits type, subclass, bool/float/zero/negative limit fields."
  - truth: "Approval-bound manifest refresh remains fail-closed through the persistence effect and preserves concurrent target updates."
    status: failed
    reason: "The final target hash/state guard at lines 1193-1210 is separated from replace_at at lines 1221-1226. A fixed adapter that changes the target at replace_at loses the concurrent bytes, installs the candidate, and receives Success."
    artifacts:
      - path: "src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py"
        issue: "No compare-and-swap or shared writer lock closes the final-guard-to-replace TOCTOU window."
      - path: "tests/test_handoff_manifest_refresh.py"
        issue: "Existing fixed race tests mutate source/policy before the final guard or raise during replace; none performs a successful replace after a concurrent target update."
    missing:
      - "Make final target validation and replacement one protected operation using a shared writer lock and/or expected target identity/hash checked at the replacement boundary."
      - "Add a fixed integration regression that mutates the target immediately after the final guard and requires structured non-success plus preservation of the concurrent bytes."
  - truth: "Refresh preview exposes every exact source-state difference used as approval evidence."
    status: partial
    reason: "_changes iterates candidate.active only. Moving an active item to candidate.tombstones returns an empty change tuple even though the before/after source state differs."
    artifacts:
      - path: "src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py"
        issue: "_changes at lines 449-482 emits created/updated active items but no tombstoned source changes."
      - path: "tests/test_handoff_manifest_refresh.py"
        issue: "No refresh change-list regression covers an active-to-tombstone transition."
    missing:
      - "Emit deterministic tombstoned/source-removed RefreshCandidateChange evidence."
      - "Test created, updated, and tombstoned changes for exactness, uniqueness, and UTF-8 byte ordering."
  - truth: "Canonical Phase 3 completion evidence is present and clean before Phase 4."
    status: failed
    reason: "The canonical HARD-R2 completion scenario requires review clean with Critical 0/Warning 0, verifier passed 10/10, HND-03 traceability Complete, and a security report with zero open threats. Current review is issues_found with Critical 2/Warning 2, no 03-SECURITY.md exists, and REQUIREMENTS.md traceability remains Pending."
    artifacts:
      - path: ".planning/phases/03-lifecycle-drift-gate/03-REVIEW.md"
        issue: "status=issues_found; Critical 2, Warning 2."
      - path: ".planning/phases/03-lifecycle-drift-gate/03-SECURITY.md"
        issue: "Missing."
      - path: ".planning/REQUIREMENTS.md"
        issue: "The HND-03 checkbox is checked, but the canonical traceability row still says Pending."
      - path: "openspec/changes/harden-openspec-gsd-handoff-lifecycle/specs/openspec-gsd-handoff-lifecycle-hardening/spec.md"
        issue: "Lines 210-223 explicitly keep Phase 3 incomplete when any exit evidence is missing, failed, or unrun."
    missing:
      - "Resolve the independently reproduced review findings and produce a clean review."
      - "Produce the required Phase 3 security report with zero open threats."
      - "Set HND-03 traceability to Complete only after implementation, review, security, and verifier evidence all pass."
deferred: []
---

# Phase 3: Lifecycle Drift Gate Verification Report

**Phase Goal:** Every lifecycle operation planned after this phase can rely on the same fresh, fail-closed drift decision.
**Verification Contract:** HND-03 / HARD-R2, including the canonical completion scenario at `spec.md:210-223`.
**Verified:** 2026-07-29T11:41:37Z
**Status:** gaps_found
**Re-verification:** Yes — after Plans 03-17 and 03-18

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Complete well-formed canonical source inputs are classified deterministically as clean, drifted, or unknown without partial green evidence. | ✓ VERIFIED | The canonical classifier remains substantive and wired; existing focused source/gate backstops and the deterministic tracked evidence cover clean, drifted, unknown, and checkbox-only rows. |
| 2 | Malformed or over-limit canonical and phase observations become unknown before comparison, sorting, identity encoding, or remediation. | ✗ FAILED | Backslash, NUL, and NFD expected phase paths each returned `DRIFTED`, remediation, and a non-null identity. Malformed source limits raised `AttributeError`. |
| 3 | Plan, execute, resume, verify, and finalize use the same freshly invoked public gate and declared mapping horizons. | ✓ VERIFIED | `gate_lifecycle_operation` remains the sole five-operation seam and the operation matrix is wired through it. |
| 4 | Approval/admission boundaries remain bound to complete current evidence through the protected effect. | ✗ FAILED | `apply_manifest_refresh` has a final-guard-to-`replace_at` race that overwrites a concurrent target update and returns `Success`. |
| 5 | Missing, malformed, over-limit, timed-out, truncated, or otherwise incomplete evidence yields identity-free unknown and no remediation projection. | ✗ FAILED | Malformed expected phase paths are treated as complete drift, and malformed source limits escape as exceptions rather than structured unknown/failure. |
| 6 | Decision identity binds every valid admission-relevant observed input and rejects stale reuse. | ✓ VERIFIED | The previously closed stale-decision regression remains wired; the new failure concerns invalid phase input receiving an identity, not valid-input identity sensitivity. |
| 7 | Complete valid graph/capability drift exposes deterministic changed items, remediation targets, and next actions. | ✓ VERIFIED | The Plan 03-17 graph/target focused test and direct code trace confirm valid add/remove/path/dependency differences reach `_phase_changes` and union-graph remediation. |
| 8 | Fixed public examples are primary, approved properties stay pure, and filesystem/I/O races have effective fixed integration evidence. | ✗ FAILED | Property scope is correct, but no fixed test detects the successful-replace target race; the direct verifier probe does. |
| 9 | Reviewers have deterministic source-pinned read-only evidence for required lifecycle relations. | ✓ VERIFIED | Tracked and golden lifecycle evidence are byte-identical at SHA-256 `a67f01a5e82e9708f16b505ecf632437c00126624edf2ab7c68619cab6c8e78a`; refresh evidence records `apply_invoked=false` and no mutations. |
| 10 | Canonical Phase 3 exit evidence is present and clean before Phase 4. | ✗ FAILED | Review is `issues_found` (2 Critical/2 Warning), security report is missing, verifier is not 10/10, and HND-03 traceability is `Pending`. |

**Score:** 5/10 truths verified (0 present-but-behavior-unverified)

The two gaps reported by the prior verification are closed. The phase goal is still not achieved because malformed phase evidence receives a reusable drift decision, an approval-bound write can lose a concurrent target update, refresh approval evidence omits tombstones, and the canonical exit evidence is explicitly incomplete.

### ROADMAP Success Criteria

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Shared clean/drifted/unknown classification across in-scope lifecycle operations | ✗ FAILED | The shared gate exists, but malformed expected phase paths are classified as identity-bearing `DRIFTED` rather than `UNKNOWN`. |
| 2 | Missing/unreadable/malformed/over-limit/incomplete observations stop instead of appearing clean | ✗ FAILED | Inputs do not appear clean, but the required structured fail-closed decision is absent for malformed phase paths and source limits. |
| 3 | Approval-relevant evidence is bound to observed inputs and stale reuse cannot occur silently | ✗ FAILED | Stale lifecycle replay is rejected, but the manifest refresh effect can overwrite a target change after its final guard. |
| 4 | Fixed drift/path-role examples and approved pure properties; filesystem/I/O races remain fixed integration evidence | ✗ FAILED | Graph/path-role examples and pure properties exist; the confirmed target race lacks a detecting fixed integration test. |

### All 18 PLAN Must-Have Groups

All 18 plans declare `HND-03`; their frontmatter contains 85 raw truth statements. The table below reports goal-level regression status rather than trusting plan completion claims.

| Plan | Raw Truths | Result | Evidence / Gap |
|---|---:|---|---|
| 03-01 | 5 | ✗ PARTIAL | Valid source classification remains, but malformed limits do not produce structured failure. |
| 03-02 | 6 | ✗ PARTIAL | One gate/fresh identity/remediation exists; malformed expected phase evidence violates complete fail-closed observation. |
| 03-03 | 6 | ✓ VERIFIED | Fixed tracked/golden read-only evidence remains byte-identical; optional smoke stays separate. |
| 03-04 | 3 | ✓ VERIFIED | Malformed canonical structured payload validation remains wired. |
| 03-05 | 5 | ✗ PARTIAL | Graph runtime/DAG/limit validation exists, but canonical phase path validation is incomplete. |
| 03-06 | 6 | ✓ VERIFIED | Public projection and repository-scoped identity relations remain present. |
| 03-07 | 4 | ✓ VERIFIED | Nested progress/source state/changed-ID validation remains wired. |
| 03-08 | 4 | ✓ VERIFIED | Commit and planning-inventory runtime validation remains shared. |
| 03-09 | 4 | ✓ VERIFIED | UTF-8 scalar and producer-equivalent canonical-observation bounds remain covered. |
| 03-10 | 4 | ✓ VERIFIED | Manifest ancestry and current observed graph/inventory authority remain enforced. |
| 03-11 | 5 | ✓ VERIFIED | Mapping aggregate validation and canonical projection remain shared. |
| 03-12 | 4 | ✓ VERIFIED | Inconsistent source-pinned reconciliation baselines remain wholly unknown. |
| 03-13 | 5 | ✓ VERIFIED | Reconciliation aggregates remain validated before semantic use. |
| 03-14 | 4 | ✓ VERIFIED | Stale rejection identities remain complete, stable, and replay-rejected. |
| 03-15 | 4 | ✓ VERIFIED | Repository-root replacement during read remains fail-closed. |
| 03-16 | 4 | ✗ PARTIAL | Source file/path containers are validated, but the separate limits outer value is not. |
| 03-17 | 6 | ✗ PARTIAL | Valid graph drift and approved publication are present; malformed source-pinned paths and the refresh write race violate the fail-closed contract. |
| 03-18 | 6 | ✓ VERIFIED | Exact/case/Unicode path-role collisions and direct mapping bypasses are rejected before I/O. |

## Required Artifacts

Automated frontmatter checks found **57/57 artifacts present and substantive**. Semantic verification found the following:

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `lifecycle_drift.py` | Bounded canonical source classification | ✓ VERIFIED | Substantive, wired, and produces real classification data. |
| `lifecycle_gate.py` | Sole fresh fail-closed lifecycle gate | ✗ PARTIAL | Valid graph drift works; malformed expected phase paths receive identity/remediation. |
| `execution_mapping.py` | Canonical mapping construction/readiness | ✓ VERIFIED | Plan 03-18 role disjointness is substantive, wired, and focused tests pass. |
| `source_identity.py` | Safe bounded source observation | ✗ PARTIAL | Aggregate/file validation is substantive; malformed limits outer values raise before structured failure. |
| `manifest_refresh.py` | Exact approval-bound refresh preview/apply | ✗ PARTIAL | Final guard is wired but not atomic with replacement; tombstones are absent from `changes`. |
| Lifecycle test files | Public behavior and race evidence | ✗ PARTIAL | Graph/path-role regressions pass; three review counterexamples have no detecting regression. |
| Golden/tracked lifecycle JSON | Deterministic portable evidence | ✓ VERIFIED | Exact bytes and hash match. |
| Refresh preview and published handoff | Exact 54-item approved authority | ✓ VERIFIED | Source commit `9a7a313…`, 54 active items, 54 mappings, started state. |
| `03-SECURITY.md` | Zero-open-threat Phase 3 exit evidence | ✗ MISSING | Required by canonical completion scenario; no file exists. |

## Key Link Verification

Automated PLAN checks found **54/54 declared key-link patterns**. Semantic wiring:

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `lifecycle_gate.py` | `lifecycle_drift.py` | Fresh source classification | ✓ WIRED | Complete canonical source decisions are consumed by the sole gate. |
| `lifecycle_gate.py` | `execution_mapping.py` | Fresh operation readiness | ✓ WIRED | Role-invalid mapping input returns early and focused tests pass. |
| `lifecycle_gate.py` | phase graph projection | `_validate_phase_graph` then `_phase_changes` | ✗ UNSAFE | Valid differences flow correctly; malformed expected path values also flow into identity/remediation. |
| `source_identity.py` | public readers | `_valid_limits` | ✗ UNSAFE | The helper dereferences malformed outer values before validation. |
| `manifest_refresh.py` | target persistence | final state guard then `replace_at` | ✗ UNSAFE | The gap between calls allows an undetected concurrent target update to be lost. |
| `manifest_refresh.py` | machine preview | `_changes` | ✗ PARTIAL | Created/updated flow; tombstoned differences do not. |
| Evidence producer | golden/tracked JSON | deterministic public-gate serialization | ✓ WIRED | Tracked/golden lifecycle evidence is byte-identical. |

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Complete Real Data | Status |
|---|---|---|---|---|
| `lifecycle_gate.py` | decision identity/remediation | Validated expected/current observations | No for malformed expected phase paths | ✗ UNSAFE FLOW |
| `manifest_refresh.py` | installed target bytes | approved candidate plus final disk observation | No concurrent-update preservation | ✗ LOST UPDATE |
| `manifest_refresh.py` | `changes` approval evidence | previous/candidate source identity states | No for tombstones | ✗ HOLLOW DIFFERENCE |
| `source_identity.py` | reader failure result | source files/paths plus limits | No structured value for malformed limits | ✗ EXCEPTION ESCAPE |
| Lifecycle evidence producer | portable decision relations | repeated public-gate calls | Yes for represented rows | ✓ FLOWING |

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Closed graph/path-role gaps | Three exact named pytest functions | 21 passed in 0.67s | ✓ PASS |
| Malformed expected phase paths | Public `gate_lifecycle_operation` probe for backslash, NUL, and NFD | 3/3 returned `drifted`, remediation, and non-null identity | ✗ FAIL |
| Refresh target race | Public `apply_manifest_refresh` with a target update injected at `replace_at` | `Success`; concurrent bytes lost; candidate installed | ✗ FAIL |
| Malformed source limits | Both public readers with `limits=object()` | Both raised `AttributeError` | ✗ FAIL |
| Active-to-tombstone preview change | `_changes(previous, candidate)` with one moved ID | Empty tuple | ✗ FAIL |
| Full project gate | Orchestrator-provided post-merge evidence | 913 tests, Ruff, BasedPyright, OpenSpec validation, schema drift, and UI safety green; not re-run by this verifier | ✓ SUPPLIED |

Passing 913 tests does not refute the four deterministic counterexamples; the relevant failing behaviors are not asserted by the current suite.

## Probe Execution

No phase-declared or conventional `scripts/*/tests/probe-*.sh` probe exists. Step 7c is skipped. The separately opt-in real-tool smoke remains `not-run` and is not treated as verification evidence.

## Requirements Coverage

| Requirement | Source Plans | Canonical Description | Status | Evidence |
|---|---|---|---|---|
| HND-03 / HARD-R2 | 03-01 through 03-18 | One common fresh pre-operation drift contract; malformed/incomplete evidence is identity-free unknown; approval evidence cannot be silently stale; Phase 3 exit evidence is complete | ✗ BLOCKED | Malformed phase input receives reusable drift identity/remediation, refresh has a lost-update race and incomplete tombstone evidence, and the canonical exit reports are not complete/clean. |

Every PLAN frontmatter declares only `HND-03`. `REQUIREMENTS.md` maps only `HND-03` to Phase 3, so there is no orphaned Phase 3 requirement. The checkbox says complete while the traceability table says `Pending`; the canonical completion scenario requires `Complete`, so the live requirement remains blocked.

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---:|---|---|---|
| Phase-modified source/test/evidence files | — | No unreferenced `TBD`, `FIXME`, `XXX`, TODO/HACK/placeholder, empty implementation, or console-only marker | ℹ INFO | No debt-marker blocker. |
| `lifecycle_gate.py` | 408-420 | Incomplete canonical path validation | 🛑 BLOCKER | Malformed source-pinned graph evidence gains reusable identity/remediation. |
| `manifest_refresh.py` | 1193-1226 | Check-then-replace TOCTOU | 🛑 BLOCKER | Concurrent target update can be overwritten while returning success. |
| `source_identity.py` | 405-409 | Validation-after-dereference | ⚠ WARNING | Public malformed input escapes as `AttributeError`. |
| `manifest_refresh.py` | 449-482 | Candidate-active-only difference projection | ⚠ WARNING | Approval view omits source removal/tombstone changes. |

## Independent Evaluation of `03-REVIEW.md`

| Review Finding | Independent Result | Verdict |
|---|---|---|
| CR-01 malformed expected phase path becomes identity-bearing DRIFTED | Reproduced through the public gate for backslash, NUL, and NFD paths; all three returned `phase-path-changed:03`, remediation, and an identity | CONFIRMED BLOCKER |
| CR-02 final guard to replace race loses a target update | Reproduced through public apply with a custom operations adapter; result was `Success`, concurrent bytes were lost, candidate bytes installed | CONFIRMED BLOCKER |
| WR-01 malformed source limits raise | Reproduced against both public source readers; both raised `AttributeError` | CONFIRMED WARNING; also contributes to fail-closed truth failure |
| WR-02 tombstones absent from refresh changes | Reproduced with one valid active-to-tombstone transition; `_changes` returned `()` | CONFIRMED WARNING; canonical clean-review exit remains blocked |

## Disconfirmation Pass

- **Partially met requirement:** valid graph drift and path-role invalidity are handled, but malformed expected graph paths are promoted to reusable drift decisions.
- **Misleading passing test:** the 21 focused graph/path-role tests pass, but no test supplies backslash, NUL, or NFD expected phase paths.
- **Uncovered error path:** existing refresh race tests either mutate a preview-bound source before the final guard or raise from replace; none changes the target after the final guard and then permits replacement to succeed.

## Human Verification Required

None. All goal-blocking findings are deterministic and were exercised at public or directly approval-visible seams. No visual, subjective, external-service, or performance judgment is required.

## Deferred Items

None. Phase 4 owns repository-wide ownership, Phase 5 recovery/resume, and Phase 6 finalization. No later phase explicitly owns malformed Phase 3 graph validation, the started-v2 refresh lost-update/tombstone gaps, or Phase 3 exit evidence.

## Gaps Summary

Plans 03-17 and 03-18 close the two previous verification gaps, but Phase 3 still fails HND-03 / HARD-R2. Two critical runtime defects and two confirmed warnings leave the code review non-clean; the security report and Complete traceability are also absent. Phase 4 must remain blocked until the implementation gaps are fixed and all canonical exit evidence passes, or a developer explicitly accepts a narrowly documented override.

---

_Verified: 2026-07-29T11:41:37Z_
_Verifier: the agent (gsd-verifier)_
