---
phase: 02-source-to-execution-mapping
plan: 05
subsystem: source-mapping
tags: [manifest-refresh, source-pinning, read-only-evidence, approval-binding, tdd]

requires:
  - phase: 02-source-to-execution-mapping
    provides: approval-bound refresh seam and prior tracked read-only preview from Plan 02-04
provides:
  - exact current-pin fixed-candidate golden for source authority 4d8b5b173927ed518d39dee18a29b0271628afbd
  - complete deterministic tracked read-only preview with protected-surface proof
  - reused point-in-time readiness evidence without production or public-surface changes
affects: [phase-2-review, phase-2-verification, lifecycle-drift, refresh-approval]

tech-stack:
  added: []
  patterns:
    - complete approval-bound evidence regeneration through preview_manifest_refresh only
    - independent literal golden comparison with strict candidate reparse
    - protected target and task byte invariance before and after preview generation

key-files:
  created:
    - .planning/phases/02-source-to-execution-mapping/02-05-SUMMARY.md
  modified:
    - tests/test_handoff_manifest_refresh.py
    - tests/fixtures/openspec_gsd_handoff/manifest/expected-refresh-preview.json
    - .planning/phases/02-source-to-execution-mapping/02-REFRESH-PREVIEW.json

key-decisions:
  - "Derived candidate and preview evidence is repinned to canonical source 4d8b5b1 without production, mapping, policy, or public-surface changes."
  - "The existing D-04 subsequent-readiness example remains the point-in-time observation evidence; no atomic-snapshot or duplicate property test was added."
  - "Tracked refresh apply remains unexecuted and requires later display plus a distinct exact-hash approval for preview 90b52efd98d6718796548151ea9c808dfd1e14484bcacd2f847b09ea71054bea."

patterns-established:
  - "Canonical repins rebuild candidate, golden, and tracked evidence as complete deterministic units rather than selectively patching hashes."
  - "Preview generation records apply_invoked=false, empty mutation operations, and empty staging observations."

requirements-completed: [HND-02]

duration: 8 min
completed: 2026-07-21
status: complete
---

# Phase 2 Plan 5: Current-Pin Corrective Evidence Summary

**Canonical source `4d8b5b1` now yields an exact 42-to-49 literal candidate and complete read-only tracked preview while the started-v2 target remains byte-identical**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-21T19:49:17Z
- **Completed:** 2026-07-21T19:56:50Z
- **Tasks:** 2
- **Files created/modified:** 4

## Accomplishments

- Repinned `SOURCE_COMMIT` and the complete independent golden to current canonical authority `4d8b5b173927ed518d39dee18a29b0271628afbd`.
- Preserved the locked reconciliation: 42 previous active, 49 candidate active, 7 created, 2 updated, 0 tombstoned, counters 7/44, and mapping coverage 49/49.
- Regenerated the complete tracked evidence through `_repository_root_evidence()`, whose repository-root lifecycle call is public `preview_manifest_refresh` with `MutationRecordingRefreshOperations`.
- Reused `tests/test_handoff_execution_mapping.py::test_verify_requires_every_selected_source_and_plan_evidence` as D-04 evidence: the first readiness call is ready; after external evidence removal, the next call returns non-ready with `mapping-path-missing`.
- Kept production, package exports, CLI, canonical OpenSpec artifacts, mapping/policy fixtures, tracked target, historical plans/summaries, and OpenSpec task 2.2 unchanged.

## Task Commits

Each task was committed atomically:

1. **Task 1: Repin the exact fixed candidate and reuse the point-in-time readiness example** — `28814c3` (`test`)
2. **Task 2: Regenerate the complete tracked read-only preview and run all boundary gates** — `78e1662` (`docs`)

No refactor commit was needed.

## RED / GREEN Evidence

### RED

Before edits, `uv run pytest tests/test_handoff_manifest_refresh.py -q` reported exactly **2 failed, 34 passed**. Failures were limited to:

- `test_repository_root_preview_matches_complete_read_only_evidence` — tracked evidence bytes were stale.
- `test_pinned_started_v2_builds_exact_complete_read_only_candidate` — the `REQ-000001` candidate fingerprint was stale.

No production failure or additional failing test was observed.

### GREEN

- Current source commit: `4d8b5b173927ed518d39dee18a29b0271628afbd`
- Design SHA-256: `3561792edfe750f5815fad72ff2e133888848b2733e770e2b6f66f87c413e783`
- Spec SHA-256: `7d076d2a946a8e8f3346f48ae80d4fbeb8ae0fb9ea6d20ccf19e01847edfd784`
- `REQ-000001` candidate fingerprint: `01f6b1f8dd9985a6f6fac5648358e3e7d01bd26da56a592d610cbb9ca51505bc`
- `SCN-000018` candidate fingerprint: `46843242f7ab1f230919ca8ff5915859cd6aee9e243714ec63d3aa9ae4a2c025`
- Candidate SHA-256: `6cc9bcf4caa3f9f839742f6d86660a8039c2370cf5cf7d054ba04199e3775fc5`
- Immutable preview SHA-256: `90b52efd98d6718796548151ea9c808dfd1e14484bcacd2f847b09ea71054bea`
- Complete evidence-file SHA-256: `661b63be39bacb882c53ade5e9919ae7fea661f852b7e47fb53188a29348138a`
- Strict candidate parse succeeded, golden candidate value/UTF-8 bytes matched the tracked preview, and a second producer run was byte-identical.

## Reconciliation and Mapping Evidence

| Observation | Exact result |
| --- | --- |
| Previous active source items | 42 |
| Candidate active source items | 49 |
| Created / updated / tombstoned | 7 / 2 / 0 |
| Next requirement / scenario counters | 7 / 44 |
| Active / mapped | 49 / 49 |
| OpenSpec progress | 4 / 12 complete |
| OpenSpec task 2.2 | `false` / unchecked |

## Protected Surface Evidence

- Tracked handoff remained SHA-256 `554690a1eee6e632eaf7c4fce3517cba69ff38eb8a06a1873b7a5e6822e59914`.
- OpenSpec `tasks.md` remained SHA-256 `cf4a9dc56afc15b98a008cff686989bd446215c95b3962ea3efd5a4f9eb30220` and task 2.2 remains unchecked.
- Design and spec remained at the canonical hashes recorded above.
- Evidence records `apply_invoked=false`, `mutation_operations=[]`, and empty staging observations before and after.
- No `.handoff.*.tmp` file exists beside the tracked target.
- Plan-base diff contains exactly the three corrective files; protected `git diff --exit-code` and `git diff --check` passed.
- No production module, package/CLI surface, public symbol, new property family, assignment fixture, policy registry, canonical artifact, old plan/summary, ROADMAP, STATE, REQUIREMENTS, REVIEW, or VERIFICATION file changed.

## Verification

- `uv run pytest tests/test_handoff_manifest_refresh.py::test_pinned_started_v2_builds_exact_complete_read_only_candidate tests/test_handoff_execution_mapping.py::test_verify_requires_every_selected_source_and_plan_evidence -q` — **2 passed**.
- `uv run pytest tests/test_handoff_manifest_refresh.py tests/test_handoff_execution_mapping.py tests/test_handoff_policy_reference.py -q` — **98 passed**.
- `uv run pytest tests/test_handoff_identity.py tests/test_handoff_manifest_v2.py tests/test_handoff_migration.py tests/test_handoff_manifest.py tests/test_handoff_cli.py -q` — **186 passed**.
- `uv run pytest tests/test_handoff_cli.py::test_module_help_exposes_exact_operations -q` — **1 passed**.
- `uv run python -m ai_coding_template_ja.openspec_gsd_handoff --help` — exactly `inspect`, `prepare`, and `mark-started` are exposed.
- `openspec validate harden-openspec-gsd-handoff-lifecycle --strict` — valid.
- `task openspec:validate` — **1 passed, 0 failed**.
- `task check` — Ruff format/check passed, BasedPyright reported **0 errors, 0 warnings, 0 notes**, and pytest reported **483 passed**.
- Strict evidence/candidate reparse, exact SHA/count assertions, repeat-producer byte equality, protected SHA checks, staging absence, `git diff --check`, and protected `git diff --exit-code` — passed.

## TDD Gate Compliance

- The plan deliberately reused the two pre-existing stale failures as RED; no synthetic failing test or separate RED commit was added.
- Task 1's `test(02-05)` commit makes the fixed-candidate and D-04 checks green by changing only test/golden evidence.
- No `feat(02-05)` commit exists because Plan 02-05 explicitly prohibits production implementation. Task 2 is a deterministic read-only evidence regeneration committed as documentation.
- This plan-specific evidence-only sequence is recorded for the orchestrator's TDD review; it does not claim a conventional production RED → GREEN feature cycle.

## Self-Review

- **Fixed items:** none; no defect was found in the three-file corrective diff.
- **Report-only items:** none within executor scope.
- Reviewed exact candidate/golden alignment, complete evidence regeneration, public-seam use, protected hashes, zero mutation/staging evidence, scope, new symbols/tests, stubs, secret exposure, AGENTS.md compliance, and OpenSpec task state.
- The wider `main...HEAD` branch diff contains prior phase artifacts and implementation; Plan 02-05's review boundary was fixed at pre-plan commit `bf5715912af3550e7445bffbc0263f4d5454d3af` and contains exactly the three allowed corrective files.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None. Empty mutation, staging, exclusions, ownership, and lifecycle collections are exact evidence/state values, not placeholders.

## User Setup Required

None - no dependency, credential, optional tool, or external service is required.

## Unverified and Unexecuted Boundaries

- **Actual tracked apply was not called and is not authorized by this execution.**
- **OpenSpec task 2.2 was not updated.** Its final boundary remains owned by the orchestrator/OpenSpec workflow.
- **Fresh code review and independent Phase 2 verification were not executor outputs and remain required.** This summary does not claim that Phase 2 verification has passed.
- The new complete preview is evidence, not approval. It must be displayed later and receive a distinct new explicit user approval naming exact preview hash `90b52efd98d6718796548151ea9c808dfd1e14484bcacd2f847b09ea71054bea` before any tracked apply can be considered.
- Real OpenSpec/GSD/host orchestration smoke remains unverified because it is opt-in/manual evidence outside this corrective plan.

## Next Phase Readiness

Corrective execution evidence is green and ready for fresh code review plus independent Phase 2 verification. Phase 3 must not start, and OpenSpec task 2.2 must not be checked, until those downstream gates complete.

## Self-Check: PASSED

- All four declared output files exist.
- Task commits `28814c3` and `78e1662` exist in repository history.
- Evidence, tracked target, and OpenSpec tasks hashes match the protected values.
- Summary frontmatter, unverified-boundary statements, exact approval hash, and diff checks passed.

---
*Phase: 02-source-to-execution-mapping*
*Completed: 2026-07-21*
