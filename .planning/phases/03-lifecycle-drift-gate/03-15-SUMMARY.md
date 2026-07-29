---
phase: 03-lifecycle-drift-gate
plan: 15
subsystem: canonical-source-observation
tags: [python, filesystem-identity, nofollow, race-hardening, tdd]

requires:
  - phase: 03-lifecycle-drift-gate
    plan: 13
    provides: "Fail-closed public source inventory and reconciliation seams"
provides:
  - "Repository-root identity binding across the complete canonical source read"
  - "Stable source-root-identity-changed failures for detached-root replacement"
  - "Three-row public fault-injection regression for missing, symlink, and directory substitution"
affects: [03-16, phase-03-verification, HND-03, lifecycle-admission]

tech-stack:
  added: []
  patterns:
    - "Compare no-follow path metadata with a retained descriptor before and after bounded reads"

key-files:
  created: []
  modified:
    - src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py
    - tests/test_handoff_identity.py

key-decisions:
  - "A SourceInventory Success is released only after the resolved repository path and retained root descriptor match by device, inode, and file type both before traversal and after all source reads."
  - "No REFACTOR commit was added because the direct identity tuples intentionally mirror the established child-entry comparison and introduce no second representation."

patterns-established:
  - "Descriptor-valid child content is insufficient when the caller-visible root path no longer names the retained directory."

requirements-completed: [HND-03]

duration: 5min
completed: 2026-07-29
status: complete
---

# Phase 03 Plan 15: Repository-Root Source Inventory Binding Summary

**Canonical source inventory now remains bound to the caller-visible repository root across bounded reads, rejecting detached-root content after missing, symlink, or directory substitution.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-29T05:11:59Z
- **Completed:** 2026-07-29T05:17:13Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Added a fixed public-seam race regression that substitutes the repository root during the first real `os.read`.
- Bound the resolved root path to the retained directory descriptor with no-follow device, inode, and file-type comparisons before traversal.
- Revalidated that same path/descriptor identity after every bounded source read and before any `SourceInventory` success can escape.
- Preserved deterministic stable-root inventory plus existing child identity, symlink, size-limit, UTF-8, parse, alias, whole-operation, and lifecycle behavior.

## Task Commits

Task 1 followed the required TDD gates:

1. **RED: expose source root replacement during read** - `6086f01`
2. **GREEN: bind source inventory to repository root** - `dbb0d6f`

No REFACTOR commit was needed. The GREEN implementation uses the same explicit `(st_dev, st_ino, stat.S_IFMT(st_mode))` comparison as the established child-entry identity guard, so extracting another identity abstraction would not clarify behavior.

## RED / GREEN / REFACTOR Evidence

### RED

`test_source_inventory_rejects_repository_root_replacement_during_read` failed in all three fixed rows. The existing implementation retained internally consistent root and child descriptors after the rename and returned `Success(SourceInventory(... "Requirement: Trusted" ...))` even though the original caller-visible repository path was absent, a symlink, or a different directory.

### GREEN

All three rows return `Failure` with exact issue code `source-root-identity-changed`, expose no `value`, and contain no detached trusted heading. Stable repositories continue to return their deterministic inventory.

### REFACTOR

No REFACTOR commit was added. Review found no behavior-preserving cleanup that improved the direct root identity checks without either hiding their ordering or creating a second identity representation.

## Root Replacement Matrix

| Replacement at original resolved path | RED outcome | GREEN outcome | Inventory exposed |
|---|---|---|---|
| Missing after old root rename | Detached trusted `Success` | `Failure("source-root-identity-changed")` | No |
| Symlink to attacker repository | Detached trusted `Success` | `Failure("source-root-identity-changed")` | No |
| Different attacker-controlled directory | Detached trusted `Success` | `Failure("source-root-identity-changed")` | No |

The attacker content is never read through the replacement path; the post-read no-follow stat observes only link-side metadata and compares it with the retained descriptor.

## Descriptor Cleanup Proof

- The root descriptor is opened only after initial no-follow path validation.
- A pre-traversal path/descriptor mismatch closes the retained root descriptor before returning `source-root-identity-changed`.
- The normal traversal path performs its post-read root revalidation while the descriptor remains open, then reaches the existing close path for both success and failure results.
- A close failure still converts only an otherwise successful result to the existing `source-root-unreadable` outcome; prior structured failures remain whole-operation failures.
- Child descriptors retain `_read_anchored_source`'s reverse-order `finally` cleanup and pre/post identity verification.

## Files Created/Modified

- `src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py` - validates the resolved root path against the retained descriptor before traversal and after reads.
- `tests/test_handoff_identity.py` - exercises missing, symlink, and different-directory replacement through public `read_source_inventory`.

## Decisions Made

- Reused the established no-follow path-stat versus descriptor-fstat tuple instead of introducing a new identity type or authority.
- Revalidated the root even when child processing already returned a structured failure, ensuring a concurrent root substitution cannot contribute partial or stale source evidence.
- Left OpenSpec task 3.1 unchecked because independent Phase 03 verification still owns the phase boundary gate.

## Verification

- RED focused node - 3 intended failures, each exposing detached trusted `Success`.
- `uv run pytest tests/test_handoff_identity.py::test_source_inventory_rejects_repository_root_replacement_during_read -q` - 3 passed.
- `uv run pytest tests/test_handoff_identity.py -q` - 80 passed.
- `uv run pytest tests/test_handoff_lifecycle_drift.py tests/test_handoff_lifecycle_gate.py -q --no-cov` - 308 passed.
- `uv run ruff check src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py tests/test_handoff_identity.py` - passed.
- `uv run basedpyright src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py tests/test_handoff_identity.py` - 0 errors, 0 warnings, 0 notes.
- `task check` - formatting and lint passed, BasedPyright reported no findings, and all 840 tests passed.
- `git diff --check` - passed.
- Scope audit - only the declared source/test files changed; no dependency, schema, retry, repair, rollback, route-switch, canonical OpenSpec, or later-phase behavior was added.

## Threat Model Results

- **T-03-15-ROOT (high): mitigated.** Detached old-root content cannot become a successful canonical inventory after the caller-visible path disappears or is replaced by a symlink or different directory.
- **T-03-15-STALE (high): transferred as planned.** Plan 03-14 already bound stale rejection identities to their complete returned decision; this plan did not alter lifecycle gate identity.
- **T-03-15-SC (low): accepted as planned.** No package install or dependency change occurred.
- No unplanned network endpoint, authentication path, filesystem trust boundary, or schema surface was introduced.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None beyond the expected RED failure.

## Authentication Gates

None.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None. Existing empty collections and optional `None` sentinels in the modified module are internal bounded-processing state, not unfinished behavior or UI data.

## Next Phase Readiness

- Verification gap 2 / REVIEW CR-02 is closed at the public `read_source_inventory` seam.
- Plan 03-16 still owns malformed public source-reader containers and members.
- Phase 03 completion remains owned by independent verification after all gap-closure plans; this plan does not claim phase completion.

## Self-Check: PASSED

- Both declared source/test artifacts and this summary exist.
- TDD commits `6086f01` and `dbb0d6f` exist in RED-to-GREEN order.
- Focused, full identity, lifecycle, static, type, full-project, diff, scope, deletion, and stub checks passed.
- No generated or runtime file remains untracked.

---
*Phase: 03-lifecycle-drift-gate*
*Completed: 2026-07-29*
