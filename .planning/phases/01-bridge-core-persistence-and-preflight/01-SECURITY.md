---
phase: 01
slug: bridge-core-persistence-and-preflight
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-15
---

# Phase 01 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| OpenSpec identifier / JSON -> discovery core | A caller-controlled change ID and external OpenSpec response enter strict route, schema, state, path, and progress validation. | Identifier, JSON metadata, canonical path claims, task metadata |
| Repository filesystem -> bounded reader | Canonical Markdown paths and bytes may be missing, aliased, symlinked, malformed, duplicated, or oversized. | Paths and untrusted Markdown bytes |
| JSON route -> Markdown fallback | An unsupported candidate must be discarded in full; terminal candidate state must not be downgraded to fallback. | Candidate path/progress/state metadata |
| Bridge -> OpenSpec / GSD / Git processes | External tools return version, capability, repository, and source-object evidence through bounded fixed-argv probes. | argv, cwd, exit status, bounded stdout/stderr |
| Phase 2 caller -> bridge authorization | Repository policy and visible host schema are explicit typed inputs and must not be inferred from local tools. | Approval, trackability verdict, host capability verdict |
| Manifest value -> repository filesystem | Existing state, staging creation, validation, replacement, and cleanup can fail independently. | Minimal manifest JSON and state transition |

---

## Threat Register

Source references below use these exact repository-relative aliases:
`reader.py` = `src/ai_coding_template_ja/openspec_gsd_handoff/reader.py`;
`progress.py` = `src/ai_coding_template_ja/openspec_gsd_handoff/progress.py`;
`discovery.py` = `src/ai_coding_template_ja/openspec_gsd_handoff/discovery.py`;
`preflight.py` = `src/ai_coding_template_ja/openspec_gsd_handoff/preflight.py`;
`manifest.py` = `src/ai_coding_template_ja/openspec_gsd_handoff/manifest.py`;
`__init__.py` = `src/ai_coding_template_ja/openspec_gsd_handoff/__init__.py`.
Plan and summary aliases are relative to
`.planning/phases/01-bridge-core-persistence-and-preflight/`.

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-01-01 | Tampering / Information Disclosure | `reader.py` containment | mitigate | Canonical lexical shape, every path component's symlink status, resolved repository/change containment, regular Markdown type, duplicate paths, and the one read buffer used for decode/hash are checked in `reader.py:57-99,118-180`; unsafe/symlink and same-buffer behavior is exercised in `tests/test_handoff_core.py:153-202` and `tests/test_handoff_discovery.py:233-260`. | closed |
| T-01-02 | Denial of Service | `reader.py`, `progress.py` | mitigate | Change ID/file-count/per-file/aggregate limits and limit-plus-one reads are enforced in `reader.py:49-54,111-116,158-170`; task count fails as one whole result at `progress.py:18,33-65`. Exact boundary regressions are at `tests/test_handoff_core.py:80-86,205-283`. | closed |
| T-01-03 | Tampering / Repudiation | `discovery.py` route adoption | mitigate | Candidate shape/path/progress is validated before adoption, while fallback constructs independent fixed claims at `discovery.py:53-100,118-236,239-261`. Full contract routing, parity, and candidate-poisoning tests are at `tests/test_handoff_discovery.py:75-168`. | closed |
| T-01-04 | Elevation of Privilege | `discovery.py` inputs | mitigate | The discovery public API only parses, validates, reads through the bounded reader, or selects fallback at `discovery.py:239-261`; process execution is isolated to `preflight.py:108-209`. Audit grep found no `subprocess`, `Popen`, `system(`, or `shell=` occurrence in `discovery.py`, `reader.py`, or `progress.py`. | closed |
| T-01-05 | Elevation / Tampering | `preflight.py` subprocess boundary | mitigate | The runner uses tuple argv, explicit cwd/timeout, separated pipes, and `shell=False` at `preflight.py:108-209`; OpenSpec/GSD adapters construct the pinned argv at `preflight.py:219-269`. Boundary, reap, and exact-argv tests are at `tests/test_handoff_preflight.py:61-131,260-299`. | closed |
| T-01-06 | Tampering / Repudiation | Git source parity | mitigate | Commit existence and repository root are checked, then every `source_commit:path` blob is compared byte-for-byte with the already-read artifact at `preflight.py:352-400`. Source-drift fail-closed and valid separation tests are at `tests/test_handoff_preflight.py:323-413`. | closed |
| T-01-07 | Spoofing / Elevation | Host capability input | mitigate | Inspected typed/generic combinations are validated independently at `preflight.py:334-367`, then retained as explicit authorization evidence at `preflight.py:414-420`; absent/uninspected verdict regressions are at `tests/test_handoff_preflight.py:314-380`. | closed |
| T-01-08 | Tampering | `manifest.py` state guard | mitigate | The composition root completes discovery, GSD, source, policy, and host gates before persistence at `__init__.py:81-150,153-184`. The repository checks a safe target and exact old/new state, stages in the target directory, reparses closed bytes, and only then replaces at `manifest.py:537-710`; state, symlink, and fault tests are at `tests/test_handoff_manifest.py:268-286,327-346,389-438`. | closed |
| T-01-09 | Denial of Service | Subprocess and filesystem operations | mitigate | Commands have a 30-second deadline and 4 MiB per-stream parsing bound with termination/reaping at `preflight.py:32-33,108-203`; manifest input is limit-plus-one bounded at `manifest.py:480-522`. Output and manifest size boundaries are exercised at `tests/test_handoff_preflight.py:61-103` and `tests/test_handoff_manifest.py:218-265`. | closed |
| T-01-10 | Tampering / Elevation of Privilege | `discovery.py` terminal field handling | mitigate | Optional `missingArtifacts` preserves field presence while allowing an empty string-list shape at `discovery.py:175-206`; any present field yields the existing JSON-route stop at `discovery.py:209-229`. Ready/blocked empty-list tests are at `tests/test_handoff_discovery.py:171-187`. | closed |
| T-01-11 | Tampering | JSON-to-fallback route boundary | mitigate | Terminal classification occurs before the outer fallback decision at `discovery.py:209-260`. An injected fallback spy proves zero fallback calls for both terminal states at `tests/test_handoff_discovery.py:190-217`. | closed |
| T-01-12 | Tampering / Repudiation | `prepare_handoff` downstream boundary | mitigate | `prepare_handoff` returns an inspection failure before repository persistence at `__init__.py:153-184`; the public-seam regression proves only two OpenSpec probes, zero GSD/Git calls, zero writes/replaces, and no `.planning/` creation at `tests/test_handoff_cli.py:236-269`. | closed |
| T-01-SC | Tampering | Package installs | accept | No dependency/install task is part of Phase 1 (`01-01-PLAN.md:183`, `01-02-PLAN.md:206`, `01-03-PLAN.md:135`), and `git diff 5a1f78b...HEAD` contains no dependency manifest or lock-file change. The residual risk of the repository's pre-existing pinned toolchain is accepted below. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01-01 | T-01-SC | Phase 1 adds no package or install operation and changes no dependency manifest/lock file. Auditing the repository's existing pinned dependency supply chain is outside this phase; all three Phase 1 plans explicitly accept that unchanged baseline. | Phase 1 plan contract | 2026-07-15 |

---

## Summary Threat Flag Reconciliation

- `01-01-SUMMARY.md` and `01-02-SUMMARY.md` contain no `## Threat Flags` section. Their declared implementation surfaces map to T-01-01 through T-01-09 and T-01-SC; no separate flag was supplied to register.
- `01-03-SUMMARY.md:106-108` explicitly reports no new surface and maps the narrowed JSON-to-fallback boundary to T-01-10 through T-01-12.
- Unregistered flags: none.

---

## Verification Evidence

- `uv run pytest tests/test_handoff_core.py tests/test_handoff_discovery.py tests/test_handoff_manifest.py tests/test_handoff_preflight.py tests/test_handoff_cli.py -q` — 102 passed on 2026-07-15.
- `rg -n 'subprocess|Popen|system\(|shell=' discovery.py reader.py progress.py` (using their package paths) — no matches.
- `git diff --name-only 5a1f78b81f546c900745328fad24f9adb073e768..HEAD` filtered to dependency manifests/lock files — no matches.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-15 | 13 | 13 | 0 | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-15
