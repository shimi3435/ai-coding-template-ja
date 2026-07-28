---
phase: 03
slug: lifecycle-drift-gate
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-27
---

# Phase 03 — Validation Strategy

> Gap-closure validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.1.1; Hypothesis 6.155.7 only for the existing checkbox-normalization property family |
| **Config file** | `pyproject.toml` (`[tool.pytest.ini_options]`) |
| **Quick run command** | `uv run pytest tests/test_handoff_lifecycle_drift.py tests/test_handoff_lifecycle_gate.py tests/test_handoff_execution_mapping.py -q` |
| **Full suite command** | `uv run pytest tests/test_handoff_lifecycle_drift.py tests/test_handoff_lifecycle_gate.py tests/test_handoff_execution_mapping.py -q && task check` |
| **Estimated runtime** | Focused commands ≤30 seconds; three-suite sample ~45 seconds; final `task check` uses the project-wide budget |

---

## Sampling Rate

- **After every task commit:** Run the task-specific focused command from the map below.
- **After Waves 4-5:** Run `uv run pytest tests/test_handoff_lifecycle_drift.py tests/test_handoff_lifecycle_gate.py -q`.
- **After Wave 6 / Plan 03-07:** Run `uv run pytest tests/test_handoff_lifecycle_drift.py tests/test_handoff_lifecycle_gate.py tests/test_handoff_execution_mapping.py -q`; the execution-mapping suite is included as the downstream compatibility backstop.
- **After Wave 7 / Plan 03-08:** Run `uv run pytest tests/test_handoff_lifecycle_drift.py tests/test_handoff_lifecycle_gate.py tests/test_handoff_execution_mapping.py -q`, then run `task check` as the final project gate after both 03-08 tasks are complete.
- **After Wave 8 / Plans 03-09 and 03-11:** Run `uv run pytest tests/test_handoff_lifecycle_drift.py tests/test_handoff_lifecycle_gate.py tests/test_handoff_execution_mapping.py -q`; this samples all canonical-observation, mapping-validation, and canonical-projection regression families before Wave 9.
- **After Wave 9 / Plan 03-10 Task 1:** Run its focused manifest-ancestry command before starting Task 2.
- **After Wave 9 / Plan 03-10 Task 2:** Run its focused graph/inventory command and then `task check`; this is the final integrated project gate after all Wave 8 and Wave 9 work.
- **Before `$gsd-verify-work`:** `task check`, `git diff --check`, and protected-surface review must be green.
- **Max task-level feedback latency:** 30 seconds; plan-level and final `task check` sampling may use the recorded ~45-second full-suite budget.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-04-01 | 04 | 4 | HND-03 / G4 | T-03-04-01 | Malformed top-level structured observations return unknown before dereference | fixed public-seam examples | `uv run pytest tests/test_handoff_lifecycle_drift.py -q -k "malformed_structured_payload"` | ✅ | ⬜ pending |
| 03-04-02 | 04 | 4 | HND-03 / G4 | T-03-04-02 | Malformed nested artifacts expose no partial evidence | fixed public-seam examples + backstop | `uv run pytest tests/test_handoff_lifecycle_drift.py -q` | ✅ | ⬜ pending |
| 03-05-01 | 05 | 4 | HND-03 / G1, G3 | T-03-05-01 | Uninspected host and invalid nested limits fail closed before boundary calls | bounded example matrix | `uv run pytest tests/test_handoff_lifecycle_gate.py -q -k "uninspected_host or malformed_nested_limits or host_inspected_drift"` | ✅ | ⬜ pending |
| 03-05-02 | 05 | 4 | HND-03 / G2, G7 | T-03-05-02 | Raw malformed, duplicate, or cyclic phase graphs cannot normalize into clean | bounded graph examples | `uv run pytest tests/test_handoff_lifecycle_gate.py -q -k "malformed_phase_graph or duplicate_phase_edge or cyclic_phase_graph or irrelevant_phase_tuple_order"` | ✅ | ⬜ pending |
| 03-06-01 | 06 | 5 | HND-03 / G5 | T-03-06-01 | Public decisions carry exact remediation and progress evidence; unknown carries none | fixed public-gate examples | `uv run pytest tests/test_handoff_lifecycle_gate.py -q -k "canonical_source_has_exact_remediation or checkbox_progress_public_decision or incomplete_dimension"` | ✅ | ⬜ pending |
| 03-06-02 | 06 | 5 | HND-03 / G6 | T-03-06-02 | Runtime identity is repository-bound while portable evidence proves relations without raw path/digest leakage | isolated filesystem + literal golden | `uv run pytest tests/test_handoff_lifecycle_gate.py -q -k "repository_root_identity or repository_root_lifecycle_evidence"` | ✅ | ⬜ pending |
| 03-07-01 | 07 | 6 | HND-03 / GAP-1.1, GAP-1.3 | T-03-07-01, T-03-07-03 | Malformed Progress and changed-ID values are rejected on both classifier sides before comparison or sorting | fixed public-classifier examples | `uv run pytest tests/test_handoff_lifecycle_drift.py::test_malformed_progress_observation_is_unknown_before_comparison tests/test_handoff_lifecycle_drift.py::test_malformed_changed_source_ids_observation_is_unknown_before_sorting -q` | ✅ | ⬜ pending |
| 03-07-02 | 07 | 6 | HND-03 / GAP-1.2, GAP-1.4 | T-03-07-02, T-03-07-04 | One SourceIdentityState authority rejects every nested family, and the boundary-injected public gate rejects Progress, changed IDs, and source state with empty evidence and no identity | fixed classifier + `FakeBoundary` public-gate matrix | `uv run pytest tests/test_handoff_lifecycle_drift.py::test_malformed_source_state_observation_is_unknown_before_dereference tests/test_handoff_lifecycle_gate.py::test_malformed_canonical_nested_state_public_gate_is_wholly_unknown -q` | ✅ | ⬜ pending |
| 03-08-01 | 08 | 7 | HND-03 / GAP-2.2, GAP-2.3 | T-03-08-01, T-03-08-02 | One safe PlanningInventory validator rejects malformed outer/container/member/field families before all consumers traverse them | fixed public-validator and readiness examples | `uv run pytest tests/test_handoff_execution_mapping.py -q -k "planning_inventory_runtime_validation or readiness_rejects_malformed_inventory"` | ✅ | ⬜ pending |
| 03-08-02 | 08 | 7 | HND-03 / GAP-2.1, GAP-2.4 | T-03-08-03, T-03-08-04 | Malformed boundary commits and inventories return dimension-specific unknown, non-admitted, empty decisions with no identity | fixed `FakeBoundary` public-gate examples | `uv run pytest tests/test_handoff_lifecycle_gate.py -q -k "malformed_boundary_commit or malformed_boundary_inventory"` | ✅ | ⬜ pending |
| 03-09-01 | 09 | 8 | HND-03 / HARD-R2 | T-03-09-01, T-03-09-03 | Lone-surrogate canonical strings on classifier and gate expected/observed sides become canonical-observation-incomplete before comparison or identity | fixed public-classifier + `FakeBoundary` public-gate matrix | `uv run pytest tests/test_handoff_lifecycle_drift.py::test_canonical_observation_rejects_non_utf8_scalar_before_comparison tests/test_handoff_lifecycle_gate.py::test_malformed_unicode_and_over_limit_canonical_observation_is_wholly_unknown -q` | ✅ | ⬜ pending |
| 03-09-02 | 09 | 8 | HND-03 / HARD-R2 | T-03-09-02, T-03-09-03 | Exact producer count/byte limits pass while limit+1 observations are unknown, empty, and identity-free | fixed 4096/4097 and limit/limit+1 public examples | `uv run pytest tests/test_handoff_lifecycle_drift.py::test_canonical_observation_accepts_4096_tasks_and_rejects_4097 tests/test_handoff_lifecycle_drift.py::test_canonical_observation_rejects_count_and_aggregate_limit_plus_one tests/test_handoff_lifecycle_gate.py::test_malformed_unicode_and_over_limit_canonical_observation_is_wholly_unknown -q` | ✅ | ⬜ pending |
| 03-11-01 | 11 | 8 | HND-03 / HARD-R2 | T-03-11-01 | Builder/readiness reject every malformed SourceIdentityState family before member iteration | fixed public builder/readiness matrix | `uv run pytest tests/test_handoff_execution_mapping.py::test_builder_and_readiness_reject_malformed_source_identity_state -q` | ✅ | ⬜ pending |
| 03-11-02 | 11 | 8 | HND-03 / HARD-R2 | T-03-11-02, T-03-11-03, T-03-11-04 | Complete mapping values are validated before semantics and builder/readiness share one canonical projection authority | fixed malformed matrices + literal equivalence + narrow source assertion | `uv run pytest tests/test_handoff_execution_mapping.py::test_readiness_rejects_manifest_mapping_outer_container_and_member_families tests/test_handoff_execution_mapping.py::test_readiness_rejects_manifest_mapping_field_tuple_order_uniqueness_and_path_families tests/test_handoff_execution_mapping.py::test_builder_and_readiness_share_canonical_mapping_projection -q` | ✅ | ⬜ pending |
| 03-10-01 | 10 | 9 | HND-03 / HARD-R2 | T-03-10-01, T-03-10-02 | Repository-relative no-follow descriptor traversal rejects intermediate symlinks and parent identity changes | fixed public-gate symlink/TOCTOU examples | `uv run pytest tests/test_handoff_lifecycle_gate.py::test_manifest_intermediate_symlink_is_unknown_and_never_admitted tests/test_handoff_lifecycle_gate.py::test_manifest_parent_identity_change_is_unknown_and_never_admitted -q` | ✅ | ⬜ pending |
| 03-10-02 | 10 | 9 | HND-03 / HARD-R2 | T-03-10-03 | Expected/observed phase maps equal validated inventory exactly, then final project gate proves integrated Wave 8/9 state | fixed public-gate mismatch matrix + project gate | `uv run pytest tests/test_handoff_lifecycle_gate.py::test_phase_graph_and_inventory_membership_paths_must_match_exactly tests/test_handoff_lifecycle_gate.py::test_identity_ignores_semantically_irrelevant_phase_tuple_order -q && task check` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Held-Out / Backstop Coverage

| Backstop | Purpose | Command / Assertion | Failure Signal |
|----------|---------|---------------------|----------------|
| Complete drift suite | Preserve clean, artifact drift, stable source IDs, checkbox-only behavior, and the sole property family | `uv run pytest tests/test_handoff_lifecycle_drift.py -q` | Existing valid behavior changes or a second property family appears |
| Complete lifecycle suite | Preserve the five-operation matrix, mapping horizons, remediation, freshness, and stale handling | `uv run pytest tests/test_handoff_lifecycle_gate.py -q` | Wrong horizon, issue-bearing admission, or stale identity acceptance |
| Complete execution-mapping suite | Preserve inventory parsing, 49-item mapping baseline, operation readiness, and bounded path behavior while validation is centralized | `uv run pytest tests/test_handoff_execution_mapping.py -q` | Mapping baseline changes, malformed inventory escapes, or a readiness horizon regresses |
| Canonical mapping projection authority | Prevent WR-01 from reintroducing separate builder/readiness projections | `uv run pytest tests/test_handoff_execution_mapping.py::test_builder_and_readiness_share_canonical_mapping_projection -q` | Literal output differs, readiness rejects builder output, either public consumer bypasses the helper, or another construction projection appears |
| Valid graph order invariance | Ensure hardening does not make semantic tuple order identity-relevant | `uv run pytest tests/test_handoff_lifecycle_gate.py::test_identity_ignores_semantically_irrelevant_phase_tuple_order -q` | Valid reorderings produce different identity or non-clean state |
| Independent portable golden | Detect omitted public fields and portable evidence schema drift | Two producer runs are byte-identical and equal the literal golden | Raw path/digest leak, missing field, false relation, or nondeterministic bytes |
| Protected input invariance | Ensure evidence generation remains read-only | Existing before/after hashes and `mutation_operations=[]` | Protected hash changes or staging residue appears |
| Optional smoke isolation | Keep unrequested external proof outside normal CI | `uv run pytest tests/test_taskfile.py::test_handoff_smoke_is_explicit_and_isolated_from_normal_check -q` | Smoke enters the normal `check` path |
| Project gate | Catch static, type, and unrelated regressions | `task check` | Any Ruff, BasedPyright, or pytest failure |

---

## Wave 0 Requirements

- [ ] Add G4 fixed cases to `tests/test_handoff_lifecycle_drift.py`.
- [ ] Add G1/G2/G3/G7 fixed cases to `tests/test_handoff_lifecycle_gate.py`.
- [ ] Add G5/G6 projection and repository-relation cases; update the portable producer and literal golden.
- [ ] Repin `03-LIFECYCLE-EVIDENCE.json` only after all behavioral cases are green.
- [ ] Add the named 03-07 classifier regressions for malformed Progress, changed IDs, and SourceIdentityState on both expected/observed sides.
- [ ] Add the named 03-07 `FakeBoundary` gate matrix for malformed Progress, changed IDs, and SourceIdentityState with the full unknown/empty/no-identity decision shape.
- [ ] Add 03-08 fixed PlanningInventory validator/readiness regressions to `tests/test_handoff_execution_mapping.py`.
- [ ] Add 03-08 boundary commit/inventory public-gate regressions to `tests/test_handoff_lifecycle_gate.py`.
- [ ] Add 03-09 malformed-Unicode, 4096/4097, count, and aggregate-byte fixed regressions to classifier and public-gate seams.
- [ ] Add 03-11 malformed SourceIdentityState and ManifestMapping public-API matrices plus the fixed canonical-projection equivalence/source assertion.
- [ ] Add 03-10 manifest intermediate-symlink/identity-change and exact graph/inventory mismatch public-gate regressions.
- Existing pytest/Hypothesis infrastructure is sufficient; no dependency, fixture framework, or config installation is required.

---

## Manual-Only Verifications

All phase gap-closure behaviors have automated verification. Real OpenSpec/GSD/host smoke remains optional and must not be treated as normal-CI evidence unless separately authorized.

---

## Failure Policy

- A RED test must fail for the intended counterexample before its GREEN production change; an unexpectedly green RED test or a different exception stops that task for diagnosis.
- Any focused task command failure blocks the next task commit in that plan. Record the exact failing node and do not weaken, delete, or reclassify the assertion.
- Any Wave 8 three-suite failure blocks Wave 9. Plans 03-09 and 03-11 must both be green before 03-10 starts.
- Any final `task check` failure in 03-10 Task 2 blocks phase sign-off and `$gsd-verify-work`, even when the focused Wave 9 nodes pass. Fix the integrated regression and rerun the focused command followed by `task check`.
- Flaky or environment-blocked results are not green evidence; record them in the relevant SUMMARY and leave validation pending.

---

## Validation Sign-Off

- [x] All tasks have automated verification commands.
- [x] Sampling continuity has no three consecutive tasks without automated verification.
- [x] Wave 0 identifies every missing regression example and evidence repin.
- [x] Plans 03-09/03-10/03-11 contribute all six tasks to the verification map.
- [x] Wave 8 sampling covers both parallel plans, and Wave 9 ends with a project-wide `task check`.
- [x] New regression node families cover canonical Unicode/bounds, mapping runtime validation/projection authority, manifest ancestry, and graph/inventory equality.
- [x] Failure policy blocks later waves and final sign-off on focused, integrated, flaky, or environment-blocked failures.
- [x] No watch-mode flags are used.
- [x] Expected task-level focused feedback latency is below 30 seconds; plan-level and final `task check` use the separate full-suite budget.
- [x] `nyquist_compliant: true` is set in frontmatter.

**Approval:** validation strategy revised and re-signed 2026-07-28 for Plans 03-07/03-08 and Waves 6/7; execution evidence pending.

**Approval:** validation strategy extended and re-signed 2026-07-28 for Plans 03-09/03-10/03-11, all six tasks, and Waves 8/9; final sign-off requires the 03-10 Task 2 integrated `task check`.
