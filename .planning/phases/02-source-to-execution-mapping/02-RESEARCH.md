# Phase 2 Research: Source-to-Execution Mapping

**Researched:** 2026-07-19
**Planning authority:** `fbe7f714f734d714480583ab90f41ec0d2077f50`
**Status:** Planning-ready
**Scope:** Phase 2 only; Phase 3 drift enforcement is out of scope

## Research boundary

This document turns the approved Phase 2 contracts into implementation seams and a
sequential plan decomposition. The canonical WHAT / WHY and acceptance scenarios
remain in the source-pinned OpenSpec artifacts; this file does not restate them.
The existing started schema-v2 manifest is historical runtime state, not the current
planning authority, and must remain byte-identical until a refresh preview has been
shown and separately approved.

Current immutable baseline:

- planning authority: `fbe7f714f734d714480583ab90f41ec0d2077f50`
- target manifest:
  `.planning/openspec/harden-openspec-gsd-handoff-lifecycle/handoff.json`
- current manifest SHA-256:
  `554690a1eee6e632eaf7c4fce3517cba69ff38eb8a06a1873b7a5e6822e59914`
- current manifest source pin: `2cbb127917feaa637ef5eac439478227ac5f717b`
- current source state: 42 active items, zero tombstones, empty mappings

The generic-agent workaround remains a degraded dispatch path, not evidence of
typed-dispatch equivalence. Phase 2 does not change host discovery, dispatch, or the
MVP `inspect` / `prepare` / `mark-started` surface.

## Approved decisions

### D-01 — Full active assignment plus operation horizon

**RESOLVED.** Every active source ID receives one explicit phase assignment before
mapping publication. Readiness is then evaluated against the operation-specific
horizon. A future phase may have an empty plan/evidence inventory while outside the
active horizon, but that absence can never satisfy an operation-ready result.

Planning consequences:

- The assignment input is an explicit bounded inventory, not a heuristic derived
  from headings, paths, requirement prose, or phase names.
- Mapping validation checks source coverage, uniqueness, phase ID/path consistency,
  change ownership, canonical paths, and the requested operation horizon separately.
- The validator returns structured non-success for unknown, duplicate, conflicting,
  cross-change, tombstoned, missing, aliased, escaped, or over-limit inputs. It does
  not return a partially green graph.
- `plan`, `execute`, `verify`, and `finalize` use one operation enum and one readiness
  result type, while the required plan/evidence inventory is selected explicitly by
  the caller.
- Mapping fixtures, not OpenSpec prose copied into GSD files, own the concrete
  source-ID-to-phase declarations for this change.

### D-02 — Separate started-v2 refresh lifecycle

**RESOLVED.** Publishing reconciled source items, mappings, artifacts, progress, and
the new source pin into a started schema-v2 manifest uses a dedicated refresh seam.
It is not migration and cannot invoke an MVP state transition.

Planning consequences:

- Preview is read-only, complete, deterministic, bounded, and carries an immutable
  preview hash over all approval-relevant inputs and the candidate bytes.
- Apply accepts only the exact preview, the exact approved preview hash, and a
  literal fresh approval obtained after displaying that preview.
- Apply re-observes target bytes, canonical inputs, source commit, and assignment
  inventory immediately before bounded staging and atomic replacement.
- `handoff_state=started`, capabilities, ownership, and lifecycle subtrees are
  preserved exactly. Failure proves the prior target hash or reports unknown; it
  does not retry, roll back, repair, or route through `mark-started`.
- A no-op preview is still complete and approval-bound. No-op apply must not rewrite
  the target.

### D-03 — `adaptive-policy-section-v1`

**RESOLVED.** Current-tree policy references use the versioned
`adaptive-policy-section-v1` section normalizer. The stable reference registry owns
IDs and anchors; mappings store IDs only.

Planning consequences:

- The registry is strict, bounded data with unique stable IDs and canonical
  repository-relative paths.
- Section observation uses strict UTF-8, LF normalization, NFC, exactly one matching
  ATX heading outside fences, the next same-or-higher-level heading boundary,
  line-end horizontal-whitespace removal, and exactly one terminal LF.
- The fingerprint is a length-prefixed SHA-256 over the version tag, canonical path,
  normalized heading, and normalized body.
- Duplicate headings, unclosed fences, symlink/path escape, Unicode/case aliases,
  malformed records, missing anchors, and limit+1 inputs are structured non-success.
- Normal CI validates current-tree anchors. It does not require unreachable Git
  history or the pruned historical policy spec.

## Source reconciliation expected by the refresh preview

Reconciliation must be performed by the Phase 1 public source-identity seam against
the current source pin, not by editing IDs manually.

| Observation | Expected result |
| --- | --- |
| Existing active set | 42 active items |
| Current canonical set | 49 active items |
| New allocation | `SCN-000037` through `SCN-000043` |
| Existing identity reuse | all previously matched IDs remain stable |
| Fingerprint updates | `REQ-000001` and `SCN-000018` |
| Tombstones | 0 |
| Next counters | requirement remains `7`; scenario becomes `44` |

Any different cardinality, unexpected tombstone, collision, or non-unique match is
a planning/apply blocker. The refresh preview must expose the exact reconciliation
and candidate mapping before any target mutation.

## Existing reusable seams

Phase 1 already supplies the compatibility and persistence foundations:

- `source_identity.py`
  - `read_source_inventory`
  - `reconcile_source_items`
  - versioned source fingerprinting and anchored bounded reads
- `manifest_v2.py`
  - `ManifestMapping`, `HandoffManifestV2`
  - strict schema-v2 parse/serialize and exact-field rejection
- `versioned_manifest.py`
  - bounded schema dispatch for v1/v2
- `manifest_migration.py`
  - immutable preview/hash patterns, anchored state guards, bounded staging,
    post-failure target observation, and atomic replacement mechanics

Reuse behavior and small mechanical helpers where safe, but keep refresh types and
failure codes separate from migration. Do not broaden MVP public operations.

## Recommended Phase 2 public seams

Names may be adjusted during planning for repository conventions, but responsibilities
must remain separated.

### Policy registry and validator

Candidate module: `openspec_gsd_handoff/policy_reference.py`

- `PolicyReference`, `PolicyReferenceRegistry`
- `PolicySectionObservation`
- `read_policy_reference_registry(...)`
- `observe_policy_sections(...)`
- `validate_policy_references(...)`

Candidate tracked record:
`docs/agents/adaptive-change-execution.references.json`

The record contains mechanical IDs/anchors/fingerprints only; it must not copy policy
requirements or scenarios.

### Explicit mapping inventory and readiness

Candidate module: `openspec_gsd_handoff/execution_mapping.py`

- `MappingOperation`: `plan`, `execute`, `verify`, `finalize`
- `PhaseAssignment` and bounded plan/evidence declarations
- `MappingReadiness` / structured mapping issue types
- `build_manifest_mappings(...)`
- `validate_mapping_readiness(...)`

The builder requires caller-supplied assignments and policy IDs. It may canonicalize
and validate declarations, but must never infer phase membership or evidence from
source text.

### Started-v2 refresh preview and apply

Candidate module: `openspec_gsd_handoff/manifest_refresh.py`

- `ManifestRefreshPreview`
- `preview_manifest_refresh(...)`
- `apply_manifest_refresh(...)`
- refresh-specific failure point, target state, staging state, and cleanup evidence

The preview builder is the only new Phase 2 property-test seam. Apply remains example
and isolated filesystem integration evidence.

## Recommended sequential plan decomposition

### Plan 02-01 — Policy registry and anchor validation

1. Add RED fixtures/examples for valid current-tree references and all fail-closed
   anchor/path/bounds cases.
2. Implement the versioned section observer and strict registry codec/validator.
3. Add the stable reference record without copying policy prose.
4. Run focused tests and Phase 1 source-normalizer regressions.

### Plan 02-02 — Explicit planning inventory and mapping readiness

1. Add RED fixed examples for complete assignment, duplicate/conflict, tombstone,
   cross-change, alias/escape, missing path, and every operation horizon.
2. Implement bounded explicit mapping construction and readiness validation.
3. Add the change-specific assignment fixture covering all 49 expected active IDs.
4. Verify future empty paths are schema-valid but never satisfy the active horizon.

### Plan 02-03 — Reconciliation and read-only refresh preview

1. Add RED reconciliation/preview examples using the current manifest fixture and
   source-pinned canonical artifacts.
2. Reuse Phase 1 identity reconciliation and construct the exact started-v2
   candidate while preserving protected subtrees.
3. Implement deterministic complete machine view, candidate hash, preview hash,
   no-op result, and 8 MiB limit+1 rejection.
4. Add only preview-builder invariants as properties: determinism, input-order
   normalization where declared, and approval hash binding.

### Plan 02-04 — Approval-bound atomic refresh and evidence

1. Add RED examples/integration tests for missing or stale approval, target/source/
   assignment drift, staging failures, replace failure, unknown target observation,
   no-op apply, and successful atomic publication.
2. Implement exact-preview apply with fresh state guards and no automatic recovery.
3. Produce a real read-only preview for the tracked manifest and stop for a new
   explicit user approval.
4. Only after that approval, apply if the regenerated preview hash is exact, then
   record focused verification evidence and the Phase 2 boundary result.

The four plans are strictly sequential. In particular, Plan 02-04 cannot combine
preview presentation and approval, and Phase 3 cannot start until Phase 2 verification
and the OpenSpec boundary task are complete.

## File and test candidates

Production candidates:

- `src/ai_coding_template_ja/openspec_gsd_handoff/policy_reference.py`
- `src/ai_coding_template_ja/openspec_gsd_handoff/execution_mapping.py`
- `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py`
- minimal exports from the package only when a seam is intentionally public

Test candidates:

- `tests/test_handoff_policy_reference.py`
- `tests/test_handoff_execution_mapping.py`
- `tests/test_handoff_manifest_refresh.py`
- focused fixtures below `tests/fixtures/openspec_gsd_handoff/policy/`, `mapping/`,
  and `manifest/`

Do not add Phase 2 property suites for policy normalization, mapping validation,
filesystem behavior, or apply. Fixed examples and isolated integration tests are
the closer evidence for those seams. The only permitted Phase 2 property suite is
the refresh preview builder.

## Validation architecture

### Per-plan RED/GREEN loop

- Commit or otherwise preserve the failing focused test before implementation.
- Run only the closest new test module during GREEN/refactor iterations.
- Include negative results for every structured fail-closed branch owned by that
  plan; do not repeat the same failure at multiple seams without a distinct risk.
- Keep optional OpenSpec/GSD/host tools out of normal test execution.

### Phase 1 regression floor

After each plan that touches shared manifest, identity, path, or persistence helpers,
run:

- `tests/test_handoff_identity.py`
- `tests/test_handoff_manifest_v2.py`
- `tests/test_handoff_migration.py`
- adjacent MVP manifest/CLI tests when exports or dispatch are affected

The Phase 1 allocator, normalizer, manifest round-trip, migration failure evidence,
and v1 preservation contracts must remain green.

### Phase completion

Phase 2 verification should include:

1. source reconciliation: 42 to 49 active, seven new scenario IDs, two expected
   fingerprint updates, zero tombstones;
2. complete explicit phase assignments for every active ID;
3. positive and negative readiness examples for all four operation horizons;
4. policy registry/section validation without Git-history dependency;
5. read-only refresh/no-op/bounded/stale/partial-failure examples;
6. manifest SHA `554690a1eee6e632eaf7c4fce3517cba69ff38eb8a06a1873b7a5e6822e59914`
   unchanged through preview and until separate approval;
7. focused Phase 1 regressions, then repository `task check`;
8. independent verifier and plan/Nyquist evidence without treating optional real
   host orchestration as normal-CI proof.

## Out of scope and stop conditions

Phase 2 does not implement lifecycle drift classification, repository-wide ownership,
recovery journals, finalize effects/receipts, automatic route switching, rollback,
repair, or heuristic mapping. Those stay in their later dependency-ordered phases.

Stop before mutation when any of the following occurs:

- reconciliation differs from the expected 49/zero-tombstone state;
- assignment coverage is incomplete or ambiguous;
- a policy anchor cannot be validated from the current tree;
- preview cannot be emitted completely within bounds;
- the tracked manifest differs from the recorded baseline before preview;
- approval is absent, predates the displayed preview, or names a different hash;
- an apply state guard cannot prove the exact reviewed inputs.

## Research resolution

The former three planning blockers are resolved by D-01, D-02, and D-03. Phase 2 is
ready for four sequential TDD plans. This resolution authorizes planning and test-first
implementation only; it does not authorize started-v2 refresh apply. That mutation
still requires the complete read-only preview followed by a separate explicit approval.
