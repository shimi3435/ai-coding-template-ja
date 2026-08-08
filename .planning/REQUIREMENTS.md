# Requirements Registry: OpenSpec–GSD Handoff Lifecycle Hardening

**Defined:** 2026-07-16
**Core Value:** 一つの OpenSpec change を、仕様の正本を複製せず、fail-closed な依存順序で安全に実装・再開・検証できること。
**Authority:** This file is non-normative GSD traceability metadata. Requirement text,
scenarios, acceptance criteria, and final completion remain in the canonical OpenSpec
artifacts pinned at `9a7a313d06ae6df1c102f2515a3ad4bd5c0ca901`.
The old started handoff manifest and brief remain unchanged as historical / stale dispatch
evidence; they are not the current canonical source pin.

## v1 Requirements

The entries below are opaque execution handles. They intentionally do not reproduce or
reinterpret canonical requirement prose.

### Canonical Coverage

- [x] **HND-01**: Stable identity and migration coverage pointer to canonical `HARD-R1`
- [ ] **HND-02**: Source-to-execution mapping coverage pointer to canonical `HARD-R1`
- [ ] **HND-03**: Coverage pointer to canonical `HARD-R2`
- [ ] **HND-04**: Coverage pointer to canonical `HARD-R3`
- [ ] **HND-05**: Coverage pointer to canonical `HARD-R4`
- [ ] **HND-06**: Coverage pointer to canonical `HARD-R5`
- [ ] **HND-07**: Cross-phase evidence pointer to canonical `HARD-R6`

## v2 Requirements

None. Scope changes must be made in OpenSpec first and handed off again from a new
source-pinned commit.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Canonical specification prose in GSD artifacts | OpenSpec owns WHAT / WHY, requirements, scenarios, acceptance criteria, and final completion |
| PR #42 or another active change | One phase and branch contain only `harden-openspec-gsd-handoff-lifecycle` |
| Automatic route switch, rollback, or repair | The canonical change requires fail-closed inspection and explicit recovery |
| Push, PR creation, merge, or OpenSpec close | Requires a separate human-originated request |
| Mandatory real-tool smoke in normal CI | Optional OpenSpec / GSD / host evidence remains opt-in |

## Traceability

Updated during roadmap creation. Each GSD handle maps to exactly one primary phase;
`HND-07` may be cited as cross-cutting evidence but has one primary verification phase.

| Requirement | Canonical Handle | Phase | Status |
|-------------|------------------|-------|--------|
| HND-01 | HARD-R1 | Phase 1 | Complete |
| HND-02 | HARD-R1 | Phase 2 | Pending |
| HND-03 | HARD-R2 | Phase 3 | Pending |
| HND-04 | HARD-R3 | Phase 4 | Pending |
| HND-05 | HARD-R4 | Phase 5 | Pending |
| HND-06 | HARD-R5 | Phase 6 | Pending |
| HND-07 | HARD-R6 | Phase 6 | Pending |

**Coverage:**

- v1 execution handles: 7 total
- Mapped to primary phases: 7
- Unmapped: 0

---
*Requirements registry defined: 2026-07-16*
*Last updated: 2026-07-29 during approved Phase 3 authority publication*
