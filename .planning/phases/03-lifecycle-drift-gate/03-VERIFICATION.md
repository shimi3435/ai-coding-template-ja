---
phase: 03-lifecycle-drift-gate
verified: 2026-07-28T16:19:37Z
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
    - "A source-pinned canonical baseline with non-empty reconciliation changes now returns source-reconciliation-incomplete and no reusable identity."
    - "reconcile_source_items now validates malformed inventory, parent-locator, and explicit-match aggregates before semantic use."
  gaps_remaining:
    - "A stale rejection still exposes the clean decision identity, and replaying that returned identity admits the unchanged operation."
    - "read_source_inventory still accepts detached source content after the caller-visible repository root is replaced during the read."
    - "The two public source inventory readers still raise TypeError for malformed outer containers instead of returning structured non-success."
  regressions: []
gaps:
  - truth: "A rejected stale lifecycle decision cannot expose a reusable identity that later admits the same observation."
    status: failed
    reason: "gate_lifecycle_operation changes the clean decision state, admission flag, and issue codes with replace(), but retains the clean decision_identity. Replaying that identity on unchanged current evidence returns CLEAN and admitted=true."
    artifacts:
      - path: "src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py"
        issue: "Lines 1309-1314 retain the precomputed clean identity after changing the returned decision to stale/drifted."
      - path: "tests/test_handoff_lifecycle_gate.py"
        issue: "The stale test stops after asserting that the identity differs from the old identity; it does not bind the identity to the returned stale fields or replay it a second time."
    missing:
      - "Return no reusable identity for the stale rejection, or recompute it from the complete stale decision."
      - "Add a public two-step regression proving the identity returned by a stale rejection cannot be replayed into admission."
  - truth: "Canonical source evidence remains bound to the caller-visible repository root for the complete duration of observation."
    status: failed
    reason: "read_source_inventory opens a directory descriptor but never revalidates the repository path against that descriptor. During os.read, renaming the repository and replacing the original path with a symlink still returns Success containing detached old-root content."
    artifacts:
      - path: "src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py"
        issue: "Lines 680-713 validate only the opened descriptor type; there is no pre/post no-follow repository-path identity comparison."
      - path: "tests/test_handoff_identity.py"
        issue: "Nested-entry races are tested, but repository-root rename plus symlink/directory replacement during the read is not covered."
    missing:
      - "Bind repository path identity to the opened root descriptor before reading and revalidate it before accepting Success."
      - "Return a stable structured failure for root rename, symlink replacement, and different-directory replacement races."
      - "Add fixed public read_source_inventory fault-injection regressions."
  - truth: "Malformed public source-observation inputs return structured non-success without exceptions or partial state."
    status: failed
    reason: "source_inventory_from_bytes(object()) and read_source_inventory(path, object()) both call truthiness/len before validating the outer container and raise TypeError."
    artifacts:
      - path: "src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py"
        issue: "Lines 620-628 and 676-679 use truthiness, len, and tuple unpacking before proving an accepted outer sequence and exact members."
      - path: "tests/test_handoff_identity.py"
        issue: "Plan 03-13 covers reconcile_source_items aggregates, not malformed outer/member inputs to source_inventory_from_bytes or read_source_inventory."
    missing:
      - "Validate non-string sequence containers before truthiness, len, or iteration."
      - "Validate exact two-item source byte members before tuple unpacking."
      - "Add fixed public reader regressions for None, object, strings/bytes, malformed members, and limit+1."
---

# Phase 3: Lifecycle Drift Gate Verification Report

**Phase Goal:** Every lifecycle operation planned after this phase can rely on the same fresh, fail-closed drift decision.
**Verification Contract:** Plan, execute, resume, verify, and finalize share one gate, and no reusable decision identity exists unless current canonical evidence is complete and clean.
**Verified:** 2026-07-28T16:19:37Z
**Status:** gaps_found
**Re-verification:** Yes — after Plans 03-12 and 03-13 closed the two previously recorded gaps

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Complete canonical source inputs are classified correctly and deterministically as clean, drifted, or unknown without partial green evidence. | ✓ VERIFIED | The classifier's clean/drifted/unknown behavior, including the repaired source-pinned reconciliation baseline, is covered by fixed public-seam tests. Freshness of the source read itself is assessed separately below. |
| 2 | Malformed or over-limit `CanonicalSourceObservation` values become unknown before comparison, sorting, or identity encoding. | ✓ VERIFIED | Plan 03-09 regressions remain present; malformed nested UTF-8/count/aggregate values are rejected by the classifier and gate. |
| 3 | Plan, execute, resume, verify, and finalize use the same freshly invoked public lifecycle gate and declared mapping horizons. | ✓ VERIFIED | One five-operation matrix calls `gate_lifecycle_operation`; the full suite and targeted operation tests pass. |
| 4 | Admission occurs only after canonical source, manifest, mapping, phase graph, source commit, and capability evidence are complete and mutually consistent. | ✗ FAILED | Repository-root replacement can detach source evidence from the current path, and a stale rejection's identity is accepted on its next replay. |
| 5 | Missing, malformed, over-limit, timed-out, truncated, or otherwise incomplete evidence yields unknown, never crashes, and never contributes green evidence. | ✗ FAILED | Both public source inventory readers raise `TypeError` for `object()`; root replacement returns green `Success` rather than structured non-success. |
| 6 | Decision identity binds every valid admission-relevant observed input and rejects stale reuse. | ✗ FAILED | First replay returns `DRIFTED/lifecycle-decision-stale` with an identity; replaying that returned identity immediately returns `CLEAN/admitted=True`. |
| 7 | Public decisions expose deterministic artifact/source changes, progress candidates, remediation targets, and next actions. | ✓ VERIFIED | Projection fields remain substantive and tested for canonical, phase, capability, and progress outcomes. |
| 8 | Fixed examples are primary evidence and Hypothesis is limited to the approved checkbox-normalization seam for Phase 3 drift behavior. | ✓ VERIFIED | `tests/test_handoff_lifecycle_drift.py` contains one `@given` family for checkbox normalization; Phase 3 gate behavior uses fixed examples. |
| 9 | Reviewers have deterministic source-pinned read-only evidence for clean, drifted, unknown, checkbox-only, stale, and repository-identity relations. | ✓ VERIFIED | Golden and tracked JSON remain byte-identical at SHA-256 `1434c365fd609f5f810e7845b5946fb6bc5bf286eb2b5216c0905cec48862e9b`. This evidence does not cover second replay of the stale rejection identity. |
| 10 | One operation matrix is reused, protected inputs remain read-only, and optional real-tool smoke stays separate from normal CI. | ✓ VERIFIED | The operation matrix is singular, tracked evidence records no mutation operations, and no real-tool probe is in `task check`. |

**Score:** 7/10 truths verified (0 present-but-behavior-unverified)

The two prior gaps are closed. The phase goal remains false because the shared gate can emit a reusable identity for a rejected decision, canonical source reads are not anchored to the current repository path for the whole observation, and malformed public reader inputs can escape as exceptions.

### ROADMAP Success Criteria

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Shared clean/drifted/unknown classification across in-scope lifecycle operations | ✓ VERIFIED | One shared gate and one five-operation matrix expose all three states; freshness and stale reuse fail separate criteria below. |
| 2 | Missing/unreadable/malformed/over-limit/incomplete observations stop instead of appearing clean | ✗ FAILED | Malformed public reader containers raise; root replacement yields `Success` from detached content. |
| 3 | Approval-relevant evidence is bound to observed inputs and stale reuse cannot occur silently | ✗ FAILED | The stale return value exposes the clean digest, and source observation is not bound to the final caller-visible root identity. |
| 4 | Fixed examples are primary; properties are limited to normalization | ✓ VERIFIED | Phase 3 drift/gate evidence uses fixed examples except the approved checkbox-normalization property. |

### All 13 PLAN Must-Have Groups

| Plan | Raw Truth Coverage | Result | Evidence / Gap |
|---|---:|---|---|
| 03-01 | 4/5 | ✗ FAILED | Classification, checkbox separation, stable IDs, and property scope pass; malformed public canonical source reader inputs can still raise. |
| 03-02 | 3/6 | ✗ FAILED | One five-operation gate, dependency reuse, and remediation projection pass; whole-operation freshness, incomplete-input fail-closure, and stale-safe reusable identity are false for the reproduced cases. |
| 03-03 | 6/6 | ✓ VERIFIED | Tracked fixed outcome evidence, bounded Git provenance, one matrix, read-only protected inputs, and smoke separation remain present. The stale evidence is incomplete as a regression for second replay. |
| 03-04 | 3/3 | ✓ VERIFIED | Malformed classifier `Result` and artifact members return unknown without partial evidence. |
| 03-05 | 5/5 | ✓ VERIFIED | Host, nested-limit, graph-shape, cycle, and order validation remain covered. |
| 03-06 | 6/6 | ✓ VERIFIED | Public fields, repository-scoped clean identity, portable evidence, and its declared counterexamples remain covered. The newly found stale-return digest flaw is charged to the broader 03-02 stale-reuse contract. |
| 03-07 | 4/4 | ✓ VERIFIED | Nested progress/source-state/changed-ID validation remains wired. |
| 03-08 | 4/4 | ✓ VERIFIED | Commit and planning-inventory runtime validation remains shared and fail-closed. |
| 03-09 | 4/4 | ✓ VERIFIED | UTF-8 scalar and producer-equivalent bounds remain covered at exact and limit+1 values. |
| 03-10 | 4/4 | ✓ VERIFIED | Manifest ancestry and exact graph/inventory equality remain covered; this does not validate the separate source-reader root descriptor. |
| 03-11 | 5/5 | ✓ VERIFIED | Mapping state/members and canonical projection remain validated through one helper. |
| 03-12 | 4/4 | ✓ VERIFIED | The old inconsistent source-pinned baseline gap is closed by direct classifier and public-gate tests. |
| 03-13 | 5/5 | ✓ VERIFIED | The old `reconcile_source_items` aggregate gap is closed by 27 fixed malformed-shape rows. |

Raw PLAN-frontmatter coverage is **57/61 truths**. The headline score deduplicates overlapping PLAN and ROADMAP statements into 10 goal-level observable truths.

## Required Artifacts

All 36 PLAN artifact declarations pass automated existence/substance checks. Semantic status:

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py` | Bounded canonical observation and three-state classification | ✓ VERIFIED | Expected-side reconciliation guard is present before comparison; old gap tests pass. |
| `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py` | Sole fresh fail-closed lifecycle admission gate | ✗ PARTIAL | Substantive and wired, but stale rejection mutates decision fields without recomputing or clearing its identity. |
| `src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py` | Safe canonical source observation and reconciliation | ✗ PARTIAL | Reconciliation validation is fixed; public inventory reader container validation and root identity revalidation remain incomplete. |
| `src/ai_coding_template_ja/openspec_gsd_handoff/execution_mapping.py` | Safe mapping construction/readiness | ✓ VERIFIED | Source state, inventory, mappings, and one canonical projection are validated and wired. |
| `tests/test_handoff_lifecycle_drift.py` | Fixed classifier and bounds examples | ✓ VERIFIED | Prior baseline inconsistency is now covered and passes. |
| `tests/test_handoff_lifecycle_gate.py` | Five-operation, freshness, identity, evidence tests | ✗ PARTIAL | Existing stale test proves first rejection only and accepts a digest not bound to the returned decision. |
| `tests/test_handoff_identity.py` | Public source inventory and reconciliation behavior | ✗ PARTIAL | Reconciliation aggregate matrices pass; public reader outer/member and root-replacement cases are absent. |
| Golden and tracked lifecycle evidence JSON | Deterministic portable reviewer evidence | ⚠ PARTIAL | Byte-identical and substantive, but the stale row does not prove rejection-identity replay safety. |
| `03-OPTIONAL-REAL-TOOL-SMOKE.md` | Separate opt-in smoke status | ✓ VERIFIED | Honest `not-run` status; no runtime claim is inferred. |

## Key Link Verification

Automated PLAN pattern checks report all 41 declared links present. Semantic verification:

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `lifecycle_gate.py` | `lifecycle_drift.py` | Fresh source classification | ✓ WIRED | Expected-side reconciliation inconsistency now becomes unknown. |
| `lifecycle_drift.py` | `source_identity.py` | Public inventory/read/reconcile seams | ✗ UNSAFE | Reader outer values can raise and repository-root replacement can produce detached `Success`. |
| `lifecycle_gate.py` | decision identity | Versioned decision encoding and prior-identity comparison | ✗ UNSAFE | Identity is computed for clean, then retained after the returned decision is changed to stale/drifted. |
| `lifecycle_gate.py` | manifest file | Repository-anchored no-follow traversal | ✓ WIRED | Manifest root/ancestry protections remain present and tested. |
| `lifecycle_gate.py` | `execution_mapping.py` | Exact inventory and readiness validation | ✓ WIRED | Phase maps are matched bidirectionally and readiness is checked. |
| `execution_mapping.py` | `source_identity.py` | Shared source-state validator | ✓ WIRED | Both public mapping APIs validate before member iteration. |
| Public tests | gate/source readers | Fixed public-seam behavior | ✗ PARTIAL | Old gaps are covered; all three current blocker probes are uncommitted/uncovered. |
| Evidence producer | public gate and JSON evidence | Deterministic serializer | ⚠ PARTIAL | Real decisions flow, but second replay and root-replacement relations are absent. |

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `lifecycle_gate.py` | `decision_identity` | Complete observation plus initial clean/drift decision | Yes | ✗ HOLLOW AFTER REPLACE — returned stale fields are not re-encoded |
| `source_identity.py` | canonical source bytes | Descriptor-anchored source reads | Yes | ✗ DETACHED ROOT — entry descriptors remain valid after caller-visible root replacement |
| `source_identity.py` | source file declarations | Public caller containers | Yes for valid values | ✗ VALIDATION GAP — malformed outer/member values reach `len`/unpack |
| `lifecycle_drift.py` | source-pinned baseline | source observation and reconciliation | Yes | ✓ FLOWING — non-empty expected changed IDs now fail closed |
| `source_identity.py` | reconciliation state | validated inventory/state/explicit matches | Yes | ✓ FLOWING — Plan 03-13 validation precedes allocation |
| `execution_mapping.py` | canonical mappings/readiness | validated source state and planning inventory | Yes | ✓ FLOWING |
| Evidence producer | decision rows and relations | repeated public-gate calls | Yes | ⚠ INCOMPLETE — decisive replay/root-race relations are omitted |

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Close the two previous gap families | Five exact Plan 03-12/03-13 pytest node IDs with `--no-cov` | 29 passed in 0.72s | ✓ PASS |
| Full project gate | `task check` | Ruff format/check green, BasedPyright 0 findings, 836 passed in 90.66s | ✓ PASS |
| Stale rejection identity second replay | `uv run python -c '<two-step public gate probe>'` | First: `drifted False ('lifecycle-decision-stale',) identity=True`; second: `clean True ()` | ✗ FAIL |
| Repository root replacement during source read | `uv run python -c '<temporary root rename+symlink public reader probe>'` | `Success`, current root is replacement, returned heading is detached `Requirement: Trusted` | ✗ FAIL |
| Malformed public reader outer values | `uv run python -c '<object() reader probe>'` | Both readers raise `TypeError: object of type 'object' has no len()` | ✗ FAIL |
| Tracked/golden evidence identity | `sha256sum <golden> <tracked>` | Both hashes equal `1434c365...62e9b` | ✓ PASS |

Passing 836 tests does not refute the blockers: the suite does not run the second stale replay, caller-visible root replacement, or malformed outer container paths.

## Probe Execution

No phase-declared or conventional `scripts/*/tests/probe-*.sh` probe exists. Step 7c is skipped. The optional real-tool smoke remains separately opt-in and was not run.

## Requirements Coverage

| Requirement | Source Plans | Canonical Description | Status | Evidence |
|---|---|---|---|---|
| HND-03 / HARD-R2 | 03-01 through 03-13 | One common pre-operation comparison; incomplete inspection becomes unknown and stops | ✗ BLOCKED | Canonical spec lines 119-137 require one contract for all five operations and incomplete inspection to become unknown. The public gate exposes a replayable stale identity; source reading can accept detached content or raise on malformed outer values. |

All 13 Phase 3 PLAN files declare only HND-03. `REQUIREMENTS.md` maps HND-03 to Phase 3 and maps no additional requirement to Phase 3, so there is no orphaned Phase 3 requirement. The registry checkbox marks HND-03 complete while its traceability row says pending; neither is implementation evidence, and live behavior leaves HND-03 blocked.

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---:|---|---|---|
| Phase-modified source/test files | — | No unreferenced `TBD`, `FIXME`, `XXX`, TODO/HACK/placeholder, empty implementation, or console-only marker | ℹ INFO | No debt-marker blocker. |
| `lifecycle_gate.py` | 1309-1314 | Mutated decision retains old digest | 🛑 BLOCKER | Rejected stale output publishes the clean identity and authorizes its next replay. |
| `source_identity.py` | 680-713 | Root descriptor never revalidated against path | 🛑 BLOCKER | Detached source content can be accepted after repository path replacement. |
| `source_identity.py` | 620-628, 676-679 | `len`/unpack before container/member validation | 🛑 BLOCKER | Malformed public inputs escape as Python exceptions. |

## Independent Evaluation of `03-REVIEW.md`

| Review Finding | Independent Result | Verdict |
|---|---|---|
| CR-01: stale decision exposes clean identity and admits its replay | Confirmed through two consecutive public gate calls with unchanged evidence | BLOCKER |
| CR-02: repository-root replacement during source read accepts detached content | Confirmed by renaming the temporary root during `os.read` and replacing it with a symlink | BLOCKER |
| CR-03: public inventory readers dereference malformed containers before validation | Confirmed with `object()` at both public APIs; both raise `TypeError` | BLOCKER |

## Disconfirmation Pass

- **Partially met requirement:** all five operations share one gate, but shared wiring does not make the freshness/identity result trustworthy.
- **Misleading passing test:** `test_identity_stale_reuse_is_rejected_after_bound_input_changes` asserts only that the stale identity differs from the prior identity. It passes even though that identity is the current clean digest and succeeds on the next replay.
- **Uncovered error paths:** repository-root identity replacement and public reader outer/member runtime-shape failures have no named regression.

## Human Verification Required

None. All blockers are deterministic and programmatically reproducible. No visual, external-service, subjective UX, or performance judgment is required.

## Deferred Items

None. Phase 4 owns repository-wide artifact ownership, Phase 5 recovery/resume, and Phase 6 finalization. None explicitly owns stale Phase 3 decision identity, Phase 3 canonical source root anchoring, or malformed Phase 3 source reader inputs.

## Gaps Summary

Plans 03-12 and 03-13 close both previously recorded gaps, and `task check` is green. Phase 3 still does not achieve its goal. The sole gate publishes a reusable identity for a rejected stale decision, canonical source observation can succeed against a detached old repository root, and malformed public source reader inputs raise instead of returning structured non-success. HND-03 / HARD-R2 remains blocked and Phase 4 must not proceed until these gaps are resolved or explicitly overridden by a developer.

---

_Verified: 2026-07-28T16:19:37Z_
_Verifier: the agent (gsd-verifier)_
