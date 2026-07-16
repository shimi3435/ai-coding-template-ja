# Roadmap: OpenSpec–GSD Handoff Lifecycle Hardening

## Overview

This roadmap plans only OpenSpec change
`harden-openspec-gsd-handoff-lifecycle`, pinned to source commit
`2cbb127917feaa637ef5eac439478227ac5f717b`. OpenSpec owns WHAT / WHY,
canonical requirements, scenarios, acceptance criteria, and final completion. GSD
owns the sequential phase, plan, and phase-progress decomposition without copying
or redefining canonical specification prose.

`PROJECT_MODE=standard`

The six phases execute strictly in dependency order. Each phase uses TDD, plan
check, verifier, Nyquist validation, and source grounding as applicable. Evidence
is assigned to the closest useful seam without duplicating the same failure or risk.
Real OpenSpec, GSD, or host smoke remains optional, opt-in, and separate from normal
CI. Failure preserves inspectable state and stops; no automatic route switch,
rollback, repair, or downstream phase advance is allowed.

Manual recovery from the stale started handoff is approved. Phase 1 must be replanned
against the current source pin. Phases 2–6 remain blocked until Phase 1 is verified,
and no Phase 7 is added. The old handoff manifest and brief remain unchanged audit
evidence rather than the current planning authority.

The success criteria below are observable planning and verification outcomes. They
do not replace, restate, or weaken the canonical OpenSpec acceptance criteria.

## Phases

- [ ] **Phase 1: Stable Identity and Migration** - Establish the source-pinned identity and migration foundation required by later phases.
- [ ] **Phase 2: Source-to-Execution Mapping** - Make the change-specific execution mapping complete and reviewable.
- [ ] **Phase 3: Lifecycle Drift Gate** - Establish one fail-closed lifecycle drift decision boundary.
- [ ] **Phase 4: Repository-Wide Ownership** - Make repository-wide ownership evidence available to later mutation decisions.
- [ ] **Phase 5: Recovery and Resume** - Make interrupted and partial execution states inspectable and safely resumable.
- [ ] **Phase 6: Finalize Preview and Receipt** - Bind finalization to fresh evidence and reconcile cross-phase proof.

## Phase Details

### Phase 1: Stable Identity and Migration

**Goal:** Later phases can rely on a stable, source-pinned identity and a reviewable migration boundary for this change.
**Mode:** standard
**Depends on:** Nothing (first phase)
**Requirements:** HND-01 (opaque canonical handle: HARD-R1)
**Success Criteria** (observable planning and verification outcomes):

1. Reviewers can trace the phase result to the exact change ID, canonical artifact paths, and pinned source commit without duplicated specification text.
2. Existing and newly planned manifest states have explicit compatibility and migration evidence at the agreed public seams.
3. Migration evidence distinguishes preview, approval, persistence, and failure outcomes without treating partial or unknown state as usable.
4. Focused TDD evidence covers the phase's assigned seams, with properties limited to allocator and manifest round-trip behavior.

### Phase 2: Source-to-Execution Mapping

**Goal:** Reviewers can verify one complete source-to-phase, plan, and evidence mapping for this change.
**Mode:** standard
**Depends on:** Phase 1
**Requirements:** HND-02 (opaque canonical handle: HARD-R1)
**Success Criteria** (observable planning and verification outcomes):

1. Every in-scope source item has a deterministic execution reference, and incomplete or cross-change references are reported as structured non-success.
2. The mapping can be reviewed against the pinned canonical paths without copying canonical requirement, scenario, or acceptance text.
3. Fixed positive and negative examples provide the primary evidence, with no broad property suite added where it would duplicate the same seam.

### Phase 3: Lifecycle Drift Gate

**Goal:** Every lifecycle operation planned after this phase can rely on the same fresh, fail-closed drift decision.
**Mode:** standard
**Depends on:** Phase 2
**Requirements:** HND-03 (opaque canonical handle: HARD-R2)
**Success Criteria** (observable planning and verification outcomes):

1. Reviewers can observe a shared classification for clean, drifted, and unknown inputs across the in-scope lifecycle operations.
2. Missing, unreadable, malformed, over-limit, or otherwise incomplete observations stop progression instead of being reported as clean.
3. Approval-relevant evidence is bound to the observed inputs and cannot silently reuse a stale result.
4. TDD evidence uses fixed drift examples and limits property testing to the approved normalization seam.

### Phase 4: Repository-Wide Ownership

**Goal:** Recovery and finalization can use complete repository-wide ownership evidence rather than local or partial assumptions.
**Mode:** standard
**Depends on:** Phase 3
**Requirements:** HND-04 (opaque canonical handle: HARD-R3)
**Success Criteria** (observable planning and verification outcomes):

1. Reviewers can inspect a bounded repository-wide inventory whose incomplete observation is explicitly non-green.
2. Ownership and reference relationships are distinguishable in deterministic evidence for this change.
3. Path escape, symlink, Unicode or case alias, and oversized-input conditions fail closed at the relevant boundary.
4. Evidence combines focused ownership properties with isolated filesystem or Git checks without duplicating equivalent assertions.

### Phase 5: Recovery and Resume

**Goal:** Operators can inspect interruption or partial failure and obtain a read-only resume decision from fresh evidence.
**Mode:** standard
**Depends on:** Phase 4
**Requirements:** HND-05 (opaque canonical handle: HARD-R4)
**Success Criteria** (observable planning and verification outcomes):

1. Checkpoint and receipt evidence identifies effect-level known, partial, and unknown outcomes without inferring success from records alone.
2. A resume preview is derived from fresh drift and ownership observations and remains read-only until separately authorized.
3. Fault-injected verification demonstrates that partial persistence or effect failure preserves inspectable state.
4. Recovery evidence never performs or recommends automatic retry, route switch, rollback, or repair.

### Phase 6: Finalize Preview and Receipt

**Goal:** Operators can review an immutable finalization preview, authorize exact inputs, and inspect a receipt without conflating it with OpenSpec completion.
**Mode:** standard
**Depends on:** Phase 5
**Requirements:** HND-06 (opaque canonical handle: HARD-R5), HND-07 (opaque canonical handle: HARD-R6)
**Success Criteria** (observable planning and verification outcomes):

1. The finalization preview is deterministic, source-grounded, and bound to the exact evidence that approval covers.
2. Application rechecks drift and ownership immediately before ordered effects and stops on stale, partial, or unknown evidence.
3. Receipts distinguish no-op, completed, partial, and unknown outcomes while leaving final completion to the canonical OpenSpec gates.
4. Cross-phase evidence maps back to the pinned source handles once, reconciles plan check, verifier, and Nyquist results, and records optional smoke as separate verified or reasoned-unverified evidence.
5. Rerun and partial-failure verification does not introduce automatic cleanup, rollback, repair, or route switching.

## Requirement Coverage

| Requirement | Primary Phase | Canonical Handle |
|-------------|---------------|------------------|
| HND-01 | Phase 1 | HARD-R1 |
| HND-02 | Phase 2 | HARD-R1 |
| HND-03 | Phase 3 | HARD-R2 |
| HND-04 | Phase 4 | HARD-R3 |
| HND-05 | Phase 5 | HARD-R4 |
| HND-06 | Phase 6 | HARD-R5 |
| HND-07 | Phase 6 | HARD-R6 |

**Coverage:** 7/7 v1 execution handles mapped exactly once.

## Progress

**Execution Order:** Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Stable Identity and Migration | 0/TBD | Pending replanning | - |
| 2. Source-to-Execution Mapping | 0/TBD | Blocked on Phase 1 verification | - |
| 3. Lifecycle Drift Gate | 0/TBD | Blocked on Phase 1 verification | - |
| 4. Repository-Wide Ownership | 0/TBD | Blocked on Phase 1 verification | - |
| 5. Recovery and Resume | 0/TBD | Blocked on Phase 1 verification | - |
| 6. Finalize Preview and Receipt | 0/TBD | Blocked on Phase 1 verification | - |
