---
phase: "03"
slug: deterministic-verification-and-acceptance-evidence
status: concerns
threats_open: 5
asvs_level: 1
block_on: high
created: 2026-07-15
---

# Phase 03 — Security

> Per-phase security contract: threat register, accepted risks, audit findings, and residual evidence limits.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| CLI / Task variables -> smoke | Repository, change ID, and GSD root select the local paths and fixed process arguments used by the opt-in task. | environment values, repository path, GSD path, change ID |
| OpenSpec / GSD output -> Phase 1 parsers | Exact versions, bounded stdout, canonical paths/progress, GSD initialization state, repository root, and agent signals are treated as untrusted evidence. | argv, exit status, bounded stdout/stderr, JSON |
| repository entries -> snapshot | Every non-root-`.git` entry, including ignored files, symlinks, directories, special types, and large regular files, is inventoried across a concurrent filesystem boundary. | names, types, modes, symlink targets, regular-file bytes |
| pinned Git blobs -> acceptance validator | One fixed SHA and three fixed blob paths define the requirement/scenario/spec-hole coordinate authority. | proposal/design/spec bytes and evidence metadata |
| evidence document -> final acceptance review | A structurally valid but contradictory or leaking tracked document could be mistaken for complete OpenSpec acceptance evidence. | evidence sections, coordinates, locators, reasons, host claims |
| GSD phase -> OpenSpec authority | Phase evidence must not claim final completion or lifecycle authority. | completion claims, hardening/lifecycle scope |

---

## Threat Register

| Threat ID | Severity | Category | Component | Disposition | Mitigation / Finding | Status |
|-----------|----------|----------|-----------|-------------|----------------------|--------|
| T-03-01 | high | Spoofing / Tampering | real tool capability | mitigate | Exact OpenSpec/GSD versions, JSON-only OpenSpec success, required GSD files, project-root/agent/initialization signals, and classified failures are enforced by `smoke.py:337-364` through the Phase 1 adapters in `preflight.py:219-329`. The real opt-in run returned OpenSpec 1.3.1, GSD 1.5.0, route `json`, and initialized `gsd-phase`. | closed |
| T-03-02 | high | Elevation of Privilege | command dispatch | mitigate | The smoke reaches only the three allowlisted read-only argv forms (`smoke.py:25-29,337-352`); the shared runner uses `shell=False`, bounded output, timeout, and direct argv (`preflight.py:108-203`). The smoke module has no import/call of prepare, manifest persistence, mark-started, or either mutable GSD entrypoint. Task variables cross the shell as quoted environment values (`Taskfile.yml:147-173`). | closed |
| T-03-03 | high | Tampering / Repudiation | repository mutation verdict | mitigate | **OPEN:** traversal is not actually no-follow across the check/use boundary. A path is classified with `lstat()`, then a regular file is reopened by pathname with `Path.open()` (`smoke.py:216-239`), and a directory is rescanned by pathname (`smoke.py:248-258`). Neither path uses `O_NOFOLLOW`, a stable directory/file descriptor, nor `fstat()` on the opened object. A deterministic audit probe swapped the regular path to an outside symlink for `open()`, restored the original inode before the final `lstat()`, and obtained `SnapshotSuccess` whose digest matched the outside bytes. The declared no-follow/stable-snapshot mitigation is therefore bypassable. | open |
| T-03-04 | medium | Information Disclosure | smoke JSON/human output | mitigate | Success output contains repository-relative artifact identities/hashes, redacted `${GSD_HOME}` command evidence, constant-size snapshot metadata, and explicit unverified rows (`smoke.py:396-454`). Focused tests reject repository/GSD roots and canonical bodies; the real run emitted one JSON object plus one summary line without either absolute root. | closed |
| T-03-05 | high | Denial of Service | output and fingerprint reads | mitigate | **OPEN:** command output is bounded, and inventory/path metadata checks exist, but the 120-second snapshot deadline is only polled before/after blocking filesystem operations (`smoke.py:178-231`). The same `lstat()`/pathname-open race from T-03-03 can replace a regular file with a FIFO/device before `Path.open()` or `read()`. Those calls can block indefinitely, so the in-process clock check cannot enforce the declared snapshot timeout. | open |
| T-03-06 | high | Spoofing | no-GSD normal-check claim | mitigate | `check:without-gsd` uses `env -i`, empty temporary HOME/CODEX_HOME/GSD_HOME/XDG roots, offline uv, curated PATH, and negative launcher assertions before the nested real `task check` (`Taskfile.yml:42-100`). Audit execution passed all four normal gates and 254 tests. | closed |
| T-03-07 | high | Tampering / Repudiation | acceptance mapping | mitigate | **OPEN:** SHA/path validation and fixed-argv bounded `git show` are present (`validate-handoff-acceptance-evidence.py:148-203,385-409`), but section parsing uses `lines.index()` and validates only the first matching section (`:268-288,411-438`). A second `## Requirements` table containing unknown/contradictory coordinates was appended in memory and the real validator still returned `ok` with 5/26/60 counts. Thus exact unique mapping is not fail-closed for duplicate sections. | open |
| T-03-08 | medium | Information Disclosure | acceptance evidence capture | mitigate | **OPEN:** the current tracked evidence is clean, but the validator rejects only triple-backtick fences and three user-home path shapes (`validate-handoff-acceptance-evidence.py:335-369`). An appended tilde-fenced raw JSON block containing `/srv/private/repo` was accepted by the real validator. The declared raw/fenced-output and absolute-local-path rejection is incomplete. | open |
| T-03-09 | high | Spoofing | host-level acceptance claims | mitigate | **OPEN:** the first Host-unverified table is strict (`validate-handoff-acceptance-evidence.py:322-332`), and the tracked artifact contains the four correct `no-safe-dry-run` rows. However, duplicate section handling is not fail-closed: an additional `## Host unverified` or contradictory host-claim section is ignored by `lines.index()` parsing. The document can therefore retain a green verdict while carrying a second host claim outside the counted four rows. | open |
| T-03-10 | high | Elevation of Privilege | final authority / scope | mitigate | The tracked evidence states that tasks 5.1/5.2 and final completion remain with the main/orchestrator and explicitly excludes lifecycle hardening, retry/resume/rollback/finalize/cleanup, push, PR, and merge (`03-ACCEPTANCE-EVIDENCE.md:136-138`). Operator guidance repeats OpenSpec final authority (`docs/optional/gsd.md:138-143`). No hardening implementation or mutable lifecycle operation appears in the Phase 3 code. | closed |
| T-03-SC | medium | Tampering | package installs | accept | Phase 3 adds no dependency/package install or dependency manifest/lock-file change. Existing repository-pinned tools and an operator-selected local OpenSpec/GSD installation remain outside this phase's supply-chain audit. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Open Threats

| Finding | Threats | Severity | Required mitigation |
|---------|---------|----------|---------------------|
| F-03-01: snapshot pathname TOCTOU | T-03-03, T-03-05 | high | Traverse from stable directory descriptors, open regular files with no-follow semantics, verify the opened descriptor with `fstat()`, and make blocking reads interruptible by the declared deadline. Add regressions for regular-to-symlink and regular-to-FIFO/device swaps. |
| F-03-02: duplicate evidence sections are ignored | T-03-07, T-03-09 | high | Require exactly one Requirements, Scenarios, Spec holes, and Host unverified section; reject every duplicate heading before extracting rows. Validate all evidence tables/host-claim sections rather than silently ignoring later ones. |
| F-03-03: raw/local-path leakage patterns are incomplete | T-03-08 | medium | Reject both backtick and tilde Markdown fences, raw probe-shaped blocks, and arbitrary local absolute paths while preserving the fixed relative canonical paths and explicit placeholders. Add negative tests for `~~~`, `/srv/...`, `/tmp/...`, and duplicate/raw evidence sections. |

Because `block_on: high`, F-03-01 and F-03-02 block a SECURED result.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-03-SC | T-03-SC | No package installation or dependency update occurs in Phase 3. Authentication of the operator-selected existing OpenSpec/GSD installation and the repository's pre-existing toolchain is outside this phase; exact version/file/signal checks are capability evidence, not a supply-chain signature. | Phase 03 PLAN 01/02 threat models | 2026-07-15 |

---

## Verification Evidence

| Control | Verification | Result |
|---------|--------------|--------|
| focused Phase 3 security suite | `uv run pytest tests/test_handoff_smoke.py tests/test_handoff_acceptance_evidence.py tests/test_taskfile.py -q` | 57 passed |
| source-pinned tracked evidence | `uv run --no-sync python scripts/validate-handoff-acceptance-evidence.py --repository . --evidence .planning/phases/03-deterministic-verification-and-acceptance-evidence/03-ACCEPTANCE-EVIDENCE.md` | `ok`; 5 requirements, 26 scenarios, 60 spec holes, 4 host-unverified rows |
| isolated normal gate | `task check:without-gsd` | exit 0; Ruff format/check, basedpyright, and 254 tests passed with Node/OpenSpec/GSD launchers absent |
| actual read-only opt-in | `task openspec:gsd-handoff:smoke CHANGE_ID=automate-openspec-gsd-handoff GSD_HOME=<active-config-root>` | exit 0; exact versions, route `json`, initialized `gsd-phase`, one JSON object/one summary line, `write_detected=false` |
| fixed argv / shell boundary | code inspection of `preflight.py:108-269`, `smoke.py:25-29,337-352`, and `validate-handoff-acceptance-evidence.py:172-203` | direct argv and `shell=False`; change/GSD Task variables quoted through environment; fixed source SHA and blob paths never come from evidence |
| package scope | dependency-file diff from Phase 3 plan commit `059042e` through audited HEAD plus added-line install-command search | no dependency file or package installation change |
| snapshot TOCTOU adversarial probe | temporary repo: rename original inode aside, insert outside symlink only for pathname `open()`, restore original inode before post-read `lstat()` | `SnapshotSuccess`; resulting digest equaled the outside-file-content snapshot, proving no-follow bypass |
| duplicate-section adversarial probe | append a second Requirements table with `R999` to valid tracked evidence and call the real validator | incorrectly returned `ok` |
| leakage adversarial probe | append `~~~json` raw output containing `/srv/private/repo` and call the real validator | incorrectly returned `ok` |

### SUMMARY Threat Flags Reconciliation

| Summary | Declared Flag | Mapping / Disposition |
|---------|---------------|-----------------------|
| `03-01-SUMMARY.md` | No `## Threat Flags` section | Snapshot and command surfaces were audited against T-03-01 through T-03-06 and T-03-SC; F-03-01 maps to declared T-03-03/T-03-05. |
| `03-02-SUMMARY.md` | No `## Threat Flags` section | Validator/evidence surfaces were audited against T-03-07 through T-03-10 and T-03-SC; F-03-02/F-03-03 map to declared threats. |

**Unregistered flags:** none.

---

## Residual and Unverified Evidence

- Actual host prompt, generic-agent spawn, real GSD mutation, and both route-specific postcondition families remain reasoned-unverified because no safe read-only/dry-run host seam exists. The smoke success does not close them.
- The local OpenSpec/GSD executable content is trusted operator input after exact version/file/signal checks; this audit did not establish cryptographic provenance for that installation.
- A before/after digest can prove equal observable repository state, but it cannot prove that a tool made no transient write and restored the same bytes/metadata between snapshots.
- The tracked acceptance document itself currently passes the fixed-source validator and contains no observed raw body or absolute-home-path leak; the open findings concern validator fail-closed guarantees under adversarial/accidental inputs.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-15 | 11 unique | 6 | 5 | Codex generic-agent workaround using complete `gsd-security-auditor` role preamble |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risk T-03-SC documented
- [ ] `threats_open: 0` — five declared mitigations remain open
- [ ] `status: verified` — blocked by high findings F-03-01 and F-03-02

**Approval:** concerns — remediation and re-audit required before Phase 03 can be marked SECURED.
