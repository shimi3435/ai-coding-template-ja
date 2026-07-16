---
phase: 1
slug: stable-identity-and-migration
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-17
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for HND-01 / canonical HARD-R1.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.1.1 + Hypothesis 6.155.7 |
| **Config file** | `pyproject.toml` |
| **Quick run command** | `uv run pytest tests/test_handoff_identity.py tests/test_handoff_manifest_v2.py tests/test_handoff_migration.py -q` |
| **Full suite command** | `task check` |
| **Estimated runtime** | under 120 seconds |

## Sampling Rate

- **After every RED/GREEN commit:** Run the named test node for that slice.
- **After every plan commit:** Run all Phase 1 test modules plus `tests/test_handoff_manifest.py` and `tests/test_handoff_cli.py`.
- **After the phase wave:** Run `task check`.
- **Before phase verification:** The focused suite and existing v1 regression suite must be green.
- **Max feedback latency:** 120 seconds for the focused suite.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01 | TBD | TBD | HND-01 | T-01 path/input ambiguity | Stable identity rejects malformed, ambiguous, escaped, aliased, and over-limit inputs | unit + property | `uv run pytest tests/test_handoff_identity.py -q` | ❌ W0 | ⬜ pending |
| 01-02 | TBD | TBD | HND-01 | T-02 schema confusion | Exact v1/v2 dispatch rejects unknown fields, invalid counters/parents, unknown schemas, and downgrades | unit + property | `uv run pytest tests/test_handoff_manifest_v2.py -q` | ❌ W0 | ⬜ pending |
| 01-03 | TBD | TBD | HND-01 | T-03 stale approval / partial persistence | Preview remains read-only; apply binds exact hashes and preserves v1 or reports unknown on failure | filesystem integration | `uv run pytest tests/test_handoff_migration.py -q` | ❌ W0 | ⬜ pending |
| 01-04 | TBD | TBD | HND-01 | — | Existing schema-v1 and public MVP operations remain unchanged | regression | `uv run pytest tests/test_handoff_manifest.py tests/test_handoff_cli.py -q` | ✅ | ⬜ pending |

## Wave 0 Requirements

- [ ] `tests/test_handoff_identity.py` — source normalizer and allocator examples/properties
- [ ] `tests/test_handoff_manifest_v2.py` — exact v2 codec and round-trip examples/properties
- [ ] `tests/test_handoff_migration.py` — read-only preview and persistence fault integration
- [ ] `tests/fixtures/openspec_gsd_handoff/identity/` — independent positive/negative source fixtures
- [ ] `tests/fixtures/openspec_gsd_handoff/manifest/expected-migrated-v2.json` — independently reviewed v2 golden bytes

No framework installation is required.

## Manual-Only Verifications

The tracked historical `handoff.json` migration is intentionally not exercised in Phase 1.
Migrating that file requires a later fresh preview and explicit approval. All implementation
behavior in this phase is otherwise verified through fixtures and isolated temporary repositories.

## Validation Sign-Off

- [x] Every planned behavior has an automated seam or an explicit operator-boundary exclusion.
- [x] Sampling continuity has no three consecutive implementation slices without an automated check.
- [x] Wave 0 enumerates all missing test artifacts.
- [x] No watch-mode flags are used.
- [x] Feedback latency target is under 120 seconds.
- [x] `nyquist_compliant: true` is set in frontmatter.

**Approval:** approved 2026-07-17
