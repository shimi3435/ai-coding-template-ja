---
phase: 02-source-to-execution-mapping
verified: 2026-07-22T04:36:14Z
status: passed
score: 7/7 must-haves verified
behavior_unverified: 0
overrides_applied: 0
requirements:
  - id: HND-02
    canonical_handle: HARD-R1
    status: satisfied
source_authority: 4d8b5b173927ed518d39dee18a29b0271628afbd
external_gate:
  status: completed
  operation: tracked started-v2 refresh publication
  preview_sha256: 90b52efd98d6718796548151ea9c808dfd1e14484bcacd2f847b09ea71054bea
  candidate_sha256: 6cc9bcf4caa3f9f839742f6d86660a8039c2370cf5cf7d054ba04199e3775fc5
  publication_commit: 2cc802c
  reason: exact preview received distinct operator approval before atomic apply
  openspec_task: "2.2 completed after publication verification"
---

# Phase 2: Source-to-Execution Mapping Verification Report

**Phase Goal:** Reviewers can verify one complete source-to-phase, plan, and evidence mapping for this change.
**Verified:** 2026-07-22T04:36:14Z
**Status:** passed
**Re-verification:** No — initial independent verification
**Canonical authority:** `4d8b5b173927ed518d39dee18a29b0271628afbd`

## Goal Achievement

### Observable Truths

| # | Truth | Status | Independent evidence |
| --- | --- | --- | --- |
| 1 | Every current in-scope source item has one deterministic explicit phase assignment. | ✓ VERIFIED | The public source inventory plus tracked assignment fixture produces 49 sorted mappings for 49 active IDs, 49 unique IDs, zero tombstone references, and explicit distribution across phases 01–06. `test_fixed_inventory_builds_exact_sorted_49_mapping_baseline` passed. |
| 2 | Mapping construction and plan/execute/verify/finalize readiness fail closed for incomplete, duplicate, conflicting, cross-change, tombstoned, unsafe, or missing inputs. | ✓ VERIFIED | `build_manifest_mappings()` requires exact active-ID coverage and validated policy IDs. `validate_mapping_readiness()` compares the complete expected mapping and implements the four operation horizons. Focused examples for all horizons, path identity changes, missing declarations, aliases, symlinks, limits, and unknown operations passed. |
| 3 | Policy references resolve to exact current-tree anchors without requiring historical Git blobs or copied policy prose. | ✓ VERIFIED | The 17-ID registry contains only IDs, paths, headings, lengths, hashes, and non-normative provenance. `read_policy_reference_registry()` → `observe_policy_sections()` → `validate_policy_references()` verifies `docs/agents/workflow.md` via `adaptive-policy-section-v1`; the no-Git/no-template-doc example passed. |
| 4 | D-04 remains a point-in-time readiness decision, not an atomic snapshot or lease, and a consumer must obtain fresh readiness. | ✓ VERIFIED | The implementation holds descriptors and revalidates identity during one observation, but makes no post-return lease promise. The named test first obtains ready, removes required evidence externally, reruns readiness, and obtains non-ready with `mapping-path-missing`. |
| 5 | Started-v2 refresh has a separate, exact-preview approval seam with source-pin, bounds, adapter, state-guard, and partial-failure enforcement. | ✓ VERIFIED | `preview_manifest_refresh()` checks the 40-hex Git commit, repository root, pinned artifact blobs, 8 MiB artifact boundary, complete mapping, and protected subtrees. `apply_manifest_refresh()` requires literal approval plus exact preview hash, uses a supplied falsey adapter, rejects invalid adapters before mutation, and reports preserved-v2 only after bounded proof. Named CR-01/CR-02/CR-03 and approval tests passed. |
| 6 | The tracked current-pin preview is complete and its separately approved candidate is published without rewriting the historical preview evidence. | ✓ VERIFIED | Evidence SHA `661b63…`, candidate SHA `6cc9bc…`, preview SHA `90b52e…`; reconciliation is 42→49 with 7 created, 2 updated, 0 tombstones, counters 7/44, and 49/49 mappings. The evidence remains read-only (`apply_invoked=false`), while commit `2cc802c` records the exact candidate as the tracked target with empty staging. |
| 7 | Fixed examples are the primary evidence, the only new Phase-2 property family is the preview builder, and normal project checks do not require OpenSpec/GSD runtime tools. | ✓ VERIFIED | Mapping/policy/apply use fixed and isolated examples; the bounded property family is limited to preview determinism/order/hash binding. Normal `task check` is Ruff/BasedPyright/pytest and passed with 495 tests. Real OpenSpec/GSD/host orchestration remains explicitly opt-in/manual Phase-3 evidence, not a normal-CI dependency. |

**Score:** 7/7 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/ai_coding_template_ja/openspec_gsd_handoff/policy_reference.py` | strict current-tree policy registry and observer | ✓ VERIFIED | 794 lines; immutable records, bounded no-follow reads, exact section normalizer, strict codec, and public validation are substantive and test-wired. |
| `docs/agents/adaptive-change-execution.references.json` | stable mechanical policy anchors | ✓ VERIFIED | 17 unique ACE IDs anchored to current `docs/agents/workflow.md`; no canonical requirement/scenario prose copied. |
| `src/ai_coding_template_ja/openspec_gsd_handoff/execution_mapping.py` | explicit mapping construction and four readiness horizons | ✓ VERIFIED | 1,017 lines; complete coverage checks, deterministic `ManifestMapping` construction, bounded observations, and point-in-time revalidation are wired into refresh. |
| `tests/fixtures/openspec_gsd_handoff/mapping/hardening-phase-assignments.json` | exact 49-ID baseline | ✓ VERIFIED | Tracked SHA `73443c…`; 6 phases, 49 assignments, 49 unique IDs, no inferred prose. |
| `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py` | read-only preview and exact approved apply | ✓ VERIFIED | 1,272 lines; source-pin guard, complete candidate, protected subtree checks, bounded preview, approval/state guards, durable staging, and failure evidence are substantive and wired. |
| `tests/fixtures/openspec_gsd_handoff/manifest/expected-refresh-preview.json` | independent exact current-pin golden | ✓ VERIFIED | Tracked SHA `30052b…`; literal candidate object/bytes/hash is compared at the public preview seam. |
| `.planning/phases/02-source-to-execution-mapping/02-REFRESH-PREVIEW.json` | complete tracked read-only evidence | ✓ VERIFIED | Tracked SHA `661b63…`; strict JSON contains complete candidate/mapping/reconciliation/protected evidence and zero mutation/staging evidence. |
| `.planning/openspec/harden-openspec-gsd-handoff-lifecycle/handoff.json` | exact approved published candidate | ✓ VERIFIED | Tracked SHA `6cc9bc…`; schema 2 remains `started` with 49 active source items and 49 mappings. |
| Phase-2 focused tests | behavioral proof at public seams | ✓ VERIFIED | Policy, mapping, refresh, and preflight focused run after publication and task 2.2 update: 141 passed. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| Policy registry | `docs/agents/workflow.md` | canonical path + normalized heading/body + length-prefixed SHA-256 | ✓ WIRED | Public registry/observation/validation chain recomputes and matches current-tree anchors. The generic key-link grep missed this because the version tag lives in code, not the registry or policy text. |
| Mapping inventory | schema-v2 mappings | `read_planning_inventory` → `build_manifest_mappings` → `ManifestMapping` | ✓ WIRED | Exact active-ID equality and validated policy references are prerequisites to returning mappings. |
| Mapping readiness | declared phase/plan/evidence paths | `validate_mapping_readiness` with operation horizon | ✓ WIRED | All four operation examples and negative path/state examples passed. |
| Refresh preview | source identity + mapping + manifest v2 | `read_source_inventory` / `reconcile_source_items` / `build_manifest_mappings` / `serialize_manifest_v2` | ✓ WIRED | Produces the exact current-pin 49-item candidate only after plan readiness succeeds. |
| Refresh apply | immutable preview | `apply_manifest_refresh` consumes preview + exact approved hash | ✓ WIRED | Approval rejection, stale guards, falsey/invalid adapters, no-op, atomic replace, and failure-state tests passed on isolated repositories. |
| Tracked preview | published tracked handoff | old target SHA + candidate/preview hashes, then distinct exact approval | ✓ WIRED | Historical evidence preserves unchanged preimage observations; the tracked target now byte-matches its candidate and retains empty staging. |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Produces real data | Status |
| --- | --- | --- | --- | --- |
| Mapping baseline | 49 stable source IDs and phase assignments | canonical spec inventory at `4d8b5b1…` + tracked assignment fixture + current policy observations | Yes; exact set equality is checked before mapping return | ✓ FLOWING |
| Current policy evidence | normalized section bytes, lengths, hashes | current `docs/agents/workflow.md` read through anchored descriptors | Yes; hashes are recomputed from current bytes, not static success flags | ✓ FLOWING |
| Refresh candidate | artifacts, progress, source state, mappings, protected subtrees | tracked started-v2 preimage + canonical artifacts at pinned commit + current task progress | Yes; candidate bytes strictly parse as schema 2 with 49 mappings | ✓ FLOWING |
| Tracked preview evidence | machine preview, safety observations, and published candidate | public repository-root `preview_manifest_refresh`, exact approval, then `apply_manifest_refresh` | Yes; immutable evidence candidate bytes are byte-compared to the published tracked file | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| 49/49 mapping, D-04 fresh observation, current preview, CR-01/02/03, exact approval and bounded subprocess output | one pytest command naming the 10 public-seam tests | 17 parametrized cases passed in 5.96s | ✓ PASS |
| Phase-2 policy/mapping/refresh/preflight behavior | `uv run pytest tests/test_handoff_manifest_refresh.py tests/test_handoff_preflight.py tests/test_handoff_execution_mapping.py tests/test_handoff_policy_reference.py -q` | 141 passed | ✓ PASS |
| Phase-1/v1 compatibility | focused identity/v2/migration/manifest/CLI command | 186 passed | ✓ PASS |
| Public CLI remains unchanged | `uv run python -m ai_coding_template_ja.openspec_gsd_handoff --help` | exactly `inspect`, `prepare`, `mark-started` | ✓ PASS |

### Probe Execution

No Phase-2 probe script is declared by any PLAN/SUMMARY, and no conventional `scripts/**/tests/probe-*.sh` exists. Probe execution is not applicable.

### Automated Validation

| Check | Result | Status |
| --- | --- | --- |
| `openspec validate harden-openspec-gsd-handoff-lifecycle --strict` | change is valid | ✓ PASS |
| `task openspec:validate` | 1 passed, 0 failed | ✓ PASS |
| `task check` | Ruff format/check pass; BasedPyright 0 errors/warnings/notes; pytest 495 passed | ✓ PASS |
| `git diff --check` | no whitespace errors | ✓ PASS |
| Publication boundary | tracked handoff equals candidate SHA `6cc9bc…`; canonical artifacts and mapping/policy fixtures unchanged during apply; no staging residue | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| HND-02 / HARD-R1 | 02-01 through 02-05 | opaque source-to-execution mapping handle | ✓ SATISFIED | 49/49 explicit mapping, complete readiness horizons, current policy anchors, exact current-pin preview, approval/failure seam, and green validation above. |

No additional requirement is mapped to Phase 2 in `.planning/REQUIREMENTS.md`; there are no orphaned Phase-2 requirements.

### Anti-Patterns Found

No `TBD`, `FIXME`, `XXX`, `TODO`, `HACK`, placeholder implementation, empty handler, or console-only implementation was found in the Phase-2 production/test/evidence files. Empty mapping/evidence fields for future phases and empty mutation/staging/ownership/lifecycle lists are contract-defined state/evidence, not stubs.

### Disconfirmation Pass

- **Completed boundary:** OpenSpec task 2.2 is checked only after the approved candidate became the tracked schema-v2 target with 49 active items and 49 mappings.
- **Test scope that must not be overstated:** isolated tests prove apply behavior and failure seams; the tracked publication itself is evidenced by the exact approved preview/candidate hashes, post-apply parse, empty staging observation, and commit `2cc802c`.
- **Uncovered external interval:** after a point-in-time readiness call returns, a non-cooperative external process can still mutate files. D-04 explicitly declines an atomic lease; consumers must rerun readiness plus Phase-3 drift/preflight immediately before use, and mutation seams retain independent guards.

These observations do not contradict the Phase-2 goal or success criteria.

## Completed Operator Boundary

In a later operator interaction, the user explicitly approved tracked apply for preview SHA-256 `90b52efd98d6718796548151ea9c808dfd1e14484bcacd2f847b09ea71054bea`. The workflow rechecked the exact old target, tasks, candidate, source commit, and staging guards before invoking `apply_manifest_refresh`.

Apply installed candidate SHA-256 `6cc9bcf4caa3f9f839742f6d86660a8039c2370cf5cf7d054ba04199e3775fc5`. The strict post-apply parse reports schema 2, `started`, 49 active items, and 49 mappings; no `.handoff.*.tmp` remains. Commit `2cc802c` contains only this approved tracked publication. The immutable preview evidence continues to describe the earlier read-only observation and is not rewritten into an apply receipt.

After publication-focused regression verification, OpenSpec task 2.2 was checked and Phase 3 became eligible to start. This addendum records the external gate result; it does not replace the independent 7/7 verifier verdict above.

## Gaps Summary

No implementation or verification gaps block the Phase-2 goal. All seven merged must-haves are behaviorally verified; no override was used and no human verification item remains for this phase verdict.

---

_Verified: 2026-07-22T04:36:14Z_
_Verifier: the agent (gsd-verifier)_
