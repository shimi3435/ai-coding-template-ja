# Phase 03: Lifecycle Drift Gate — Plan Outline

## OUTLINE COMPLETE

**Phase:** Lifecycle Drift Gate
**Goal:** Every lifecycle operation planned after this phase can rely on the same fresh, fail-closed drift decision.
**Plans:** 3 plan(s) in 3 wave(s)

| Plan ID | Objective | Wave | Depends On | Requirements |
|---------|-----------|------|------------|--------------|
| 03-01 | TDD the bounded checkbox-aware canonical-source observation and deterministic `clean` / `drifted` / `unknown` classification, separating checkbox-only `tasks.md` progress from specification drift and limiting property tests to this approved normalization seam. | 1 | none | HND-03 / HARD-R2 |
| 03-02 | TDD one shared `plan` / `execute` / `resume` / `verify` / `finalize` lifecycle gate that composes 03-01 with the existing Phase 2 mapping-readiness seam and exact manifest, source-commit, phase-graph, and capability observations; bind the complete observation to a deterministic decision identity and reject incomplete or stale evidence without partial green. | 2 | 03-01 | HND-03 / HARD-R2 |
| 03-03 | Produce fixed read-only canonical evidence for clean, drifted, unknown, checkbox-only progress, and post-observation stale-decision rejection through the single shared gate; verify operation coverage without duplicating equivalent lifecycle tests and record optional real-tool smoke separately from normal CI. | 3 | 03-02 | HND-03 / HARD-R2 |

## Dependency Rationale

- `03-01` establishes the only new property-tested seam and the source observation vocabulary consumed downstream.
- `03-02` is sequential because it consumes that classifier and reuses Phase 2 D-04 mapping readiness as point-in-time evidence rather than reproducing it.
- `03-03` is a distinct reviewer/evidence seam over the completed gate. It remains read-only and does not publish, repair, retry, roll back, or switch lifecycle routes.

## Artifacts this phase produces

- A focused lifecycle drift module exposing bounded observation, shared operation classification, and deterministic decision identity.
- Fixed drift fixtures and public-seam tests, with Hypothesis confined to checkbox normalization.
- A source-pinned, read-only Phase 3 evidence record showing the canonical operation matrix and freshness rejection without mutating the tracked handoff.

## Planning Constraints for Final Plans

- Eligible logic plans `03-01` and `03-02` use TDD RED → GREEN gates; fixed examples are the primary evidence.
- Final plans include ASVS level 1 threat models with `high` as the blocking threshold. Trust boundaries include repository bytes → observer, Git/tool evidence → classifier, and prior decision evidence → operation admission.
- The Phase 2 mapping-readiness and refresh-approval tests are dependencies, not Phase 3 test templates to duplicate.
- No schema-push task, ownership scan, recovery journal, finalize apply, or mandatory real-tool smoke belongs to this phase.

## Multi-Source Coverage Audit

| SOURCE | ID | Feature / Requirement | Plan | Status | Notes |
|--------|----|-----------------------|------|--------|-------|
| GOAL | — | One fresh fail-closed drift decision is reusable by every later lifecycle operation. | 03-01, 03-02, 03-03 | COVERED | Classification, shared gate, then canonical evidence. |
| REQ | HND-03 / HARD-R2 | Lifecycle operation preflight covers canonical source, source commit, manifest, stable mapping, phase state, and capability evidence. | 03-01, 03-02, 03-03 | COVERED | Opaque GSD handle remains linked to canonical OpenSpec source. |
| RESEARCH | — | No Phase 3 research artifact. | — | EXCLUDED | Research was explicitly skipped; no research requirement is inferred. |
| CONTEXT | — | No Phase 3 context decisions. | — | EXCLUDED | Continuation without Phase 3 CONTEXT.md was explicitly approved. |
| CANONICAL | SCN-000004 | Canonical specification drift stops the operation and identifies affected evidence. | 03-01, 03-02 | COVERED | Fixed source-drift examples. |
| CANONICAL | SCN-000016 | Phase graph or capability evidence drift blocks affected operations. | 03-02 | COVERED | Shared matrix; no per-operation duplicate suites. |
| CANONICAL | SCN-000027 | Checkbox-only task progress is not specification drift. | 03-01, 03-03 | COVERED | Canonical current-tree checkbox transition is the read-only evidence case. |
| CANONICAL | SCN-000035 | Failed, partial, timed-out, malformed, or over-limit observation returns `unknown` and stops. | 03-01, 03-02, 03-03 | COVERED | No partial green result escapes. |
