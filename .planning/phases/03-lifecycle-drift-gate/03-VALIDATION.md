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
| **Quick run command** | `uv run pytest tests/test_handoff_lifecycle_drift.py tests/test_handoff_lifecycle_gate.py -q` |
| **Full suite command** | `task check` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run the task-specific focused command from the map below.
- **After every plan wave:** Run `uv run pytest tests/test_handoff_lifecycle_drift.py tests/test_handoff_lifecycle_gate.py -q`.
- **After Plan 03-06 completion:** Run `task check` as the plan-level project gate after both tasks are complete.
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

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Held-Out / Backstop Coverage

| Backstop | Purpose | Command / Assertion | Failure Signal |
|----------|---------|---------------------|----------------|
| Complete drift suite | Preserve clean, artifact drift, stable source IDs, checkbox-only behavior, and the sole property family | `uv run pytest tests/test_handoff_lifecycle_drift.py -q` | Existing valid behavior changes or a second property family appears |
| Complete lifecycle suite | Preserve the five-operation matrix, mapping horizons, remediation, freshness, and stale handling | `uv run pytest tests/test_handoff_lifecycle_gate.py -q` | Wrong horizon, issue-bearing admission, or stale identity acceptance |
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
- Existing pytest/Hypothesis infrastructure is sufficient; no dependency, fixture framework, or config installation is required.

---

## Manual-Only Verifications

All phase gap-closure behaviors have automated verification. Real OpenSpec/GSD/host smoke remains optional and must not be treated as normal-CI evidence unless separately authorized.

---

## Validation Sign-Off

- [x] All tasks have automated verification commands.
- [x] Sampling continuity has no three consecutive tasks without automated verification.
- [x] Wave 0 identifies every missing regression example and evidence repin.
- [x] No watch-mode flags are used.
- [x] Expected task-level focused feedback latency is below 30 seconds; plan-level and final `task check` use the separate full-suite budget.
- [x] `nyquist_compliant: true` is set in frontmatter.

**Approval:** planning strategy approved 2026-07-27; execution evidence pending.
