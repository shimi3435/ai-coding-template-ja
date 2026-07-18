---
phase: 02-source-to-execution-mapping
plan: 01
subsystem: source-mapping
tags: [policy-reference, markdown, sha256, filesystem-safety, tdd]

requires:
  - phase: 01-stable-identity-and-migration
    provides: immutable Result values and descriptor-anchored bounded read patterns
provides:
  - exact adaptive-policy-section-v1 current-tree section observations
  - strict bounded ACE stable-reference registry decoding and validation
  - fixed adversarial filesystem and Markdown examples
affects: [02-02-execution-mapping, lifecycle-drift, ownership, finalize]

tech-stack:
  added: []
  patterns:
    - length-prefixed versioned section fingerprints
    - descriptor-anchored no-follow current-tree reads
    - strict duplicate-key JSON decoding

key-files:
  created:
    - src/ai_coding_template_ja/openspec_gsd_handoff/policy_reference.py
    - docs/agents/adaptive-change-execution.references.json
    - tests/test_handoff_policy_reference.py
    - tests/fixtures/openspec_gsd_handoff/policy/valid-policy.md
    - tests/fixtures/openspec_gsd_handoff/policy/duplicate-heading.md
    - tests/fixtures/openspec_gsd_handoff/policy/unclosed-fence.md
  modified: []

key-decisions:
  - "Policy validation uses only canonical current-tree anchors; historical provenance is non-normative metadata."
  - "Exact canonical anchors may be shared by distinct stable IDs as fixed by Gate C, while duplicate IDs and aliased paths fail closed."

patterns-established:
  - "Policy observation: read each canonical file once with limit+1 and return no partial tuple."
  - "Registry validation: decode exact records, observe every anchor, then resolve requested stable IDs."

requirements-completed: [HND-02]

duration: 12min
completed: 2026-07-19
status: complete
---

# Phase 2 Plan 1: Current-Tree Policy Reference Summary

**Exact bounded Markdown section fingerprints and a strict 17-ID ACE registry validated entirely from current-tree workflow bytes**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-18T17:00:52Z
- **Completed:** 2026-07-18T17:13:37Z
- **Tasks:** 2
- **Files created:** 6

## Accomplishments

- Implemented `adaptive-policy-section-v1` with LF/NFC normalization, exact ATX/fence boundaries, line-end-only whitespace removal, one terminal LF, and unsigned 8-byte big-endian framing.
- Added descriptor-anchored, no-follow, limit+1 reads that reject traversal, symlinks, non-regular files, aliases, malformed Markdown, and incomplete observations as one structured failure.
- Added the complete 17-ID ACE namespace and validated its current-tree anchors without Git history or `docs/template/`.
- Added strict JSON decoding with exact fields, duplicate-key/ID rejection, deterministic ordering, 4096-record and 8 MiB bounds, plus exact length/hash validation.

## TDD Commits

1. **Task 1 RED:** `62ccce8` — fixed section and filesystem failure examples (22 expected failures).
2. **Task 1 GREEN:** `dfc2d8f` — bounded exact policy section observer (22 passed).
3. **Task 2 RED:** `4417c9d` — strict registry and current-tree validation examples (12 expected failures, 22 passed).
4. **Task 2 GREEN:** `f2ae13a` — strict registry codec and complete validation (84 passed with identity regressions).

## Registry Schema

- Root fields: exact `version`, `references`.
- Version: `adaptive-policy-references-v1`.
- Record fields: exact `id`, `source_path`, `heading`, `body_length`, `sha256`, `historical_provenance`.
- Mechanical bounds: 4096 records and 8 MiB limit+1 registry/file reads.
- Historical provenance: `a2eb744`, retained as non-normative metadata and never used for validation.

## Fixed Current-Tree Fingerprints

| Heading | Body bytes | SHA-256 |
| --- | ---: | --- |
| `OpenSpec / GSD の責務境界（ADR-0008）` | 10194 | `0ac7721473db8872dcd057626745011bf26a35516b07e546cf650bebf94b2e4f` |
| `実行経路の判定` | 1188 | `503950a413fb7f4f93f05f3588827cb432930e8e47bc80f53863a59c2b361a09` |
| `大規模 change の手動 handoff` | 7342 | `579cef65bd742d231d7c6711a6aa8b347e603848051450037fc7a4a6a36dbe0b` |

## Verification

- `uv run pytest tests/test_handoff_policy_reference.py tests/test_handoff_identity.py -q` — 84 passed.
- `uv run pytest tests/test_handoff_manifest_v2.py tests/test_handoff_migration.py -q` — 104 passed.
- `task check` — ruff format/check green, basedpyright 0 errors, 419 tests passed.
- Public seam exercise — tracked registry parsed 17 records, observed 17 sections, and validated 17 IDs.
- `git diff --check` — passed for the working tree and all plan commits.
- TDD order — `test → feat → test → feat` confirmed from `45be49c…` through `f2ae13a`.

## Protected Surface Evidence

- Root package exports and `inspect` / `prepare` / `mark-started` CLI files are unchanged from plan base `45be49c7c3e163f5e5aec23421725c3a77e66ca2`.
- `openspec/changes/harden-openspec-gsd-handoff-lifecycle/tasks.md` is unchanged.
- `.planning/openspec/harden-openspec-gsd-handoff-lifecycle/handoff.json` is unchanged with SHA-256 `554690a1eee6e632eaf7c4fce3517cba69ff38eb8a06a1873b7a5e6822e59914`.
- No OpenSpec/GSD tool, Git history, dependency, property family, Phase 3 behavior, or lifecycle mutation was added.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Pre-commit formatting changes were incorporated and focused tests were rerun before each GREEN commit.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The strict ACE registry and current-tree validation seam are ready for Plan 02-02 mappings to consume stable IDs only.
- D-02 refresh, Phase 3 drift enforcement, MVP public operations, and orchestrator-owned tracking remain untouched.

## Self-Check: PASSED

- All six declared created files exist.
- All four TDD commits exist in order.
- All plan verification commands and `task check` passed.
- Protected files and manifest hash remain unchanged.

---
*Phase: 02-source-to-execution-mapping*
*Completed: 2026-07-19*
