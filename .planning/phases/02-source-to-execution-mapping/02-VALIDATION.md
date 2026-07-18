---
phase: 02-source-to-execution-mapping
date: 2026-07-19
status: draft
nyquist_validation: true
---

# Phase 2 Validation Strategy

## Public seams

| Seam | Primary evidence | Backstop evidence |
| --- | --- | --- |
| current-tree policy registry and section observer | fixed valid/invalid examples | isolated filesystem alias, escape, symlink, and limit tests |
| explicit planning inventory and mapping readiness | operation-horizon examples | change-specific 49-ID fixture |
| started-v2 refresh preview | fixed preview fixtures | preview-builder invariants only |
| exact approved refresh apply | fault-injected filesystem integration | Phase 1 persistence regressions |

## Sampling rules

- Each canonical Phase 2 scenario maps to one closest example, fixture, property, or
  integration test; do not duplicate the same seam and risk.
- Properties are limited to preview-builder determinism and approval binding.
- Optional OpenSpec, GSD, and host smoke remains outside normal CI.
- The tracked handoff manifest remains byte-identical until its real preview receives a
  separate explicit approval.

## Phase gate

Run focused unit/example/property/filesystem integration tests, Phase 1 identity/manifest/
migration regressions, `task check`, fresh code review, and independent phase verification.
The implementation stops after producing the real read-only refresh preview; actual apply
is a separate approval boundary.
