---
phase: 01-stable-identity-and-migration
plan: 01
subsystem: openspec-gsd-handoff
tags: [markdown, stable-identity, sha256, bounded-io, tdd]

requires:
  - phase: source-pinned-openspec
    provides: canonical HARD-R1 at 2cbb127917feaa637ef5eac439478227ac5f717b
provides:
  - immutable requirement and scenario source observations
  - bounded canonical spec inventory with whole-operation failures
  - parent-ID-bound versioned framed SHA-256 fingerprints
affects: [01-02-stable-id-allocation, 01-04-migration-preview]

tech-stack:
  added: []
  patterns:
    - frozen public source-domain values
    - strict literal-LF and horizontal-whitespace normalization
    - bounded read-once filesystem adapter returning Success or Failure

key-files:
  created:
    - src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py
    - tests/test_handoff_identity.py
    - tests/fixtures/openspec_gsd_handoff/identity/canonical-spec.md
    - tests/fixtures/openspec_gsd_handoff/identity/duplicate-heading.md
    - tests/fixtures/openspec_gsd_handoff/identity/unclosed-fence.md
  modified: []

key-decisions:
  - "Only exact canonical OpenSpec spec artifact paths enter the source inventory."
  - "Display-heading normalization changes identity evidence without rewriting raw headings."
  - "Scenario fingerprints require an already resolved active requirement ID."

patterns-established:
  - "Complete inventory or structured failure: no partial source observations escape."
  - "Every fingerprint component, including the version tag, uses an 8-byte big-endian length frame."

requirements-addressed: [HND-01]
requirements-completed: []

duration: 7 min
completed: 2026-07-17
status: complete
---

# Phase 1 Plan 1: Canonical Source Identity Summary

**Strict canonical spec inventory with immutable source observations, fenced ATX block normalization, and parent-bound framed SHA-256 fingerprints**

## Performance

- **Duration:** 7 min
- **Started:** 2026-07-16T20:59:58Z
- **Completed:** 2026-07-16T21:06:42Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added a public read-only inventory seam for exact requirement and scenario ATX forms under canonical OpenSpec spec paths.
- Preserved decoded raw heading evidence while normalizing LF, NFC, horizontal whitespace, source blocks, paths, and parent locators.
- Added version-tagged, 8-byte length-framed SHA-256 fingerprints with fixed independent literals.
- Failed closed for ambiguous Markdown, invalid UTF-8, duplicate identity, missing parents, unsafe paths, symlinks, Unicode/case aliases, and bounded-input overflow.
- Kept the package root API, dependencies, historical handoff manifest/brief, and OpenSpec boundary tasks unchanged.

## TDD Evidence

### RED

- `d4fc17a` added the initial absent-seam examples and fixed fingerprint literals.
- `4187a6e` corrected the nested-heading evidence distinction while the seam remained red.
- `8534d76` added trust-boundary examples that failed on empty and indented ambiguous Markdown.
- `0e9fb69` added canonical spec path evidence that failed while arbitrary Markdown paths were still accepted.

### GREEN

- `afba1f8` implemented normalized source observations and exact framed fingerprints.
- `cdda1de` implemented whole-operation failure behavior for the source trust boundary.

### Correctness Follow-up

- `f1eaf02` moved the item limit into observation construction so oversized inventories stop before building additional source items.

## Task Commits

1. **Task 1: Normalize supported ATX source blocks and fingerprint exact framed bytes**
   - `d4fc17a` — test: initial RED examples
   - `4187a6e` — test: nested-heading evidence correction
   - `afba1f8` — feat: canonical source observations
2. **Task 2: Fail closed for ambiguous, escaped, aliased, and bounded source inputs**
   - `8534d76` — test: source boundary RED examples
   - `0e9fb69` — test: canonical spec artifact path RED example
   - `cdda1de` — feat: fail-closed source boundary
   - `f1eaf02` — fix: parse-time item bound

## Files Created

- `src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py` — frozen source values, strict scanner, contained bounded reader, and fingerprint seam.
- `tests/test_handoff_identity.py` — fixed public-seam positive, equivalence, ordering, and adversarial examples.
- `tests/fixtures/openspec_gsd_handoff/identity/canonical-spec.md` — nested requirement/scenario and closed fenced-heading evidence.
- `tests/fixtures/openspec_gsd_handoff/identity/duplicate-heading.md` — normalized identity collision evidence.
- `tests/fixtures/openspec_gsd_handoff/identity/unclosed-fence.md` — incomplete fenced block evidence.

## Decisions Made

- Canonical source input is limited to `openspec/changes/<change-id>/specs/<capability>/spec.md`; other Markdown is rejected before read.
- Path alias comparison uses NFC plus case folding to fail closed consistently across platform case behavior.
- Requirement blocks retain child scenario heading lines as specified; therefore a child display-heading edit can update the parent block fingerprint while both stable identities remain unchanged.
- `HND-01` remains pending in `.planning/REQUIREMENTS.md` because Plans 01-02 through 01-05 still own the allocator, schema codec, preview, and persistence portions of the same phase-level handle.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Enforced item limits during observation construction**
- **Found during:** Task 2 review
- **Issue:** The public result rejected overflow, but one file could construct all parsed observations before the global limit check.
- **Fix:** Passed the remaining inventory budget into source parsing and stopped before constructing the next observation.
- **Files modified:** `source_identity.py`
- **Verification:** focused boundary test and `task check`
- **Committed in:** `f1eaf02`

**Total deviations:** 1 auto-fixed (Rule 2).
**Impact on plan:** The change tightens the planned bounded-input contract without expanding the public API or later-phase scope.

## Issues Encountered

- A pre-commit hook temporarily saved and restored an unstaged source patch in its local cache while committing a test-only correction. It did not create or modify a Git stash ref, and the restored patch, historical manifest, brief, and OpenSpec tasks were verified unchanged afterward.

## Test Results

- `uv run pytest tests/test_handoff_identity.py tests/test_handoff_core.py -q` — 50 passed.
- `uv run pytest tests/test_handoff_identity.py tests/test_handoff_core.py tests/test_handoff_manifest.py tests/test_handoff_cli.py -q` — 82 passed.
- `task check` — ruff format/check, basedpyright, and 259 tests passed.
- `git diff --check` — passed.
- Historical `.planning/openspec/.../handoff.json`, `handoff-brief.md`, and canonical `tasks.md` diff — empty.
- `pyproject.toml` and package-root `__init__.py` diff from the plan base — empty.

## TDD Gate Compliance

- RED commits precede the corresponding GREEN commits.
- RED failures were caused by the absent public seam or specifically asserted missing fail-closed behavior.
- No property family was added for the normalizer; this plan uses only approved fixed examples.
- No refactor commit was needed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 01-02 can consume `SourceInventory`, resolve requirement parent locators first, and call `fingerprint_source_observation` with stable requirement IDs. Stable allocation, tombstones, and counters remain unimplemented by design.

## Self-Check: PASSED

- All five declared files exist.
- All seven task commits exist.
- Focused tests and `task check` pass.
- The historical manifest, brief, and OpenSpec tasks remain unchanged.

---
*Phase: 01-stable-identity-and-migration*
*Completed: 2026-07-17*
