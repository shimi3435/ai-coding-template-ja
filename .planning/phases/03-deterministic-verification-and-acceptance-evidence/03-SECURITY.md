---
phase: "03"
slug: deterministic-verification-and-acceptance-evidence
status: secured
threats_open: 0
asvs_level: 1
block_on: high
created: 2026-07-15
updated: 2026-07-16
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
| T-03-01 | high | Spoofing / Tampering | real tool capability | mitigate | Exact OpenSpec/GSD versions, JSON-only OpenSpec success, required GSD files, project-root/agent/initialization signals, and classified failures are enforced by `smoke.py:446-473` through the Phase 1 adapters in `preflight.py:219-329`. The final real opt-in run returned OpenSpec 1.3.1, GSD 1.5.0, route `json`, and initialized `gsd-phase`. | closed |
| T-03-02 | high | Elevation of Privilege | command dispatch | mitigate | The smoke reaches only the three allowlisted read-only argv forms (`smoke.py:25-29,446-461`); the shared runner uses `shell=False`, bounded output, timeout, and direct argv (`preflight.py:108-203`). The smoke module has no import/call of prepare, manifest persistence, mark-started, or either mutable GSD entrypoint. Task variables cross the shell as quoted environment values (`Taskfile.yml:147-173`). | closed |
| T-03-03 | high | Tampering / Repudiation | repository mutation verdict | mitigate | Stable directory descriptors and no-follow descriptor/path identity checks cover regular files, directories, and symlinks (`smoke.py:202-379`). Symlink targets are read only through an `O_PATH|O_NOFOLLOW` descriptor using `readlink("", dir_fd=...)`, followed by descriptor/path identity verification (`:340-379`). Remediation-2 target-pinning and descriptor-drift regressions pass (`tests/test_handoff_smoke.py:487-557`). | closed |
| T-03-04 | medium | Information Disclosure | smoke JSON/human output | mitigate | Success output contains repository-relative artifact identities/hashes, redacted `${GSD_HOME}` command evidence, constant-size snapshot metadata, and explicit unverified rows (`smoke.py:505-563`). Focused tests reject repository/GSD roots and canonical bodies; the final real run emitted one JSON object plus one summary line without either absolute root. | closed |
| T-03-05 | high | Denial of Service | output and fingerprint reads | mitigate | Remediation opens a classified regular path first with nonblocking `O_PATH|O_NOFOLLOW`, rejects a non-regular descriptor, and only then opens the pinned `/proc/self/fd/<fd>` object with `O_NONBLOCK` (`smoke.py:239-304`). Directory opens are likewise no-follow/nonblocking (`:305-339`). The FIFO/device substitution regression completes without blocking and returns `repository-snapshot-unstable`; inventory/path/deadline/output bounds remain present. | closed |
| T-03-06 | high | Spoofing | no-GSD normal-check claim | mitigate | `check:without-gsd` uses `env -i`, empty temporary HOME/CODEX_HOME/GSD_HOME/XDG roots, offline uv, curated PATH, and negative launcher assertions before the nested real `task check` (`Taskfile.yml:42-100`). Final audit execution passed all four normal gates and 300 tests. | closed |
| T-03-07 | high | Tampering / Repudiation | acceptance mapping | mitigate | The validator requires the exact six documented level-2 sections in exact order and rejects every missing, duplicate, reordered, or additional section before Git reads (`validate-handoff-acceptance-evidence.py:49-56,187-200,436-451`). Duplicate and unexpected mapping-section regressions cover both placement orders and representative names (`tests/test_handoff_acceptance_evidence.py:325-419`). | closed |
| T-03-08 | medium | Information Disclosure | acceptance evidence capture | mitigate | The validator rejects both fence forms, balanced single/multiline JSON, quoted or unquoted probe fields, POSIX absolute/network/bare-root, home, drive, and UNC paths while retaining URLs, canonical relative paths, and placeholders (`validate-handoff-acceptance-evidence.py:366-433`; `tests/test_handoff_acceptance_evidence.py:428-494`). | closed |
| T-03-09 | high | Spoofing | host-level acceptance claims | mitigate | The exact Host-unverified table still requires four ordered reasoned-unverified rows (`validate-handoff-acceptance-evidence.py:353-363`), while the exact six-section schema and case-insensitive word-boundary host-heading check reject every alternate host section regardless of word position (`:187-200`; `tests/test_handoff_acceptance_evidence.py:361-387`). | closed |
| T-03-10 | high | Elevation of Privilege | final authority / scope | mitigate | The tracked evidence states that tasks 5.1/5.2 and final completion remain with the main/orchestrator and explicitly excludes lifecycle hardening, retry/resume/rollback/finalize/cleanup, push, PR, and merge (`03-ACCEPTANCE-EVIDENCE.md:136-138`). Operator guidance repeats OpenSpec final authority (`docs/optional/gsd.md:138-143`). No hardening implementation or mutable lifecycle operation appears in the Phase 3 code. | closed |
| T-03-SC | medium | Tampering | package installs | accept | Phase 3 adds no dependency/package install or dependency manifest/lock-file change. Existing repository-pinned tools and an operator-selected local OpenSpec/GSD installation remain outside this phase's supply-chain audit. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Open Threats

None. Remediation-2 closes F-03-01, F-03-02, and F-03-03 within their declared Phase 3 boundaries.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-03-SC | T-03-SC | No package installation or dependency update occurs in Phase 3. Authentication of the operator-selected existing OpenSpec/GSD installation and the repository's pre-existing toolchain is outside this phase; exact version/file/signal checks are capability evidence, not a supply-chain signature. | Phase 03 PLAN 01/02 threat models | 2026-07-15 |

---

## Verification Evidence

| Control | Verification | Result |
|---------|--------------|--------|
| focused Phase 3 security suite | `uv run pytest tests/test_handoff_smoke.py tests/test_handoff_acceptance_evidence.py tests/test_taskfile.py -q` | 103 passed after remediation-2 |
| source-pinned tracked evidence | `uv run --no-sync python scripts/validate-handoff-acceptance-evidence.py --repository . --evidence .planning/phases/03-deterministic-verification-and-acceptance-evidence/03-ACCEPTANCE-EVIDENCE.md` | `ok`; 5 requirements, 26 scenarios, 60 spec holes, 4 host-unverified rows |
| full project gate | `task check` | exit 0; Ruff format/check, basedpyright, and 300 tests passed |
| isolated normal gate | `task check:without-gsd` | exit 0; Ruff format/check, basedpyright, and 300 tests passed with Node/OpenSpec/GSD launchers absent |
| actual read-only opt-in | `task openspec:gsd-handoff:smoke CHANGE_ID=automate-openspec-gsd-handoff GSD_HOME=<active-config-root>` | exit 0; exact versions, route `json`, initialized `gsd-phase`, one JSON object/one summary line, `write_detected=false` |
| fixed argv / shell boundary | code inspection of `preflight.py:108-269`, `smoke.py:25-29,446-461`, and `validate-handoff-acceptance-evidence.py:203-234` | direct argv and `shell=False`; change/GSD Task variables quoted through environment; fixed source SHA and blob paths never come from evidence |
| package scope | dependency-file diff from Phase 3 plan commit `059042e` through audited HEAD plus added-line install-command search | no dependency file or package installation change |
| remediated regular/FIFO/directory regressions | focused tests cover regular-file, directory, FIFO, and descriptor-identity changes | all return `repository-snapshot-unstable`; FIFO coverage completes without blocking |
| descriptor-pinned symlink regressions | target pinning and descriptor identity coverage at `tests/test_handoff_smoke.py:487-557` | stable target retains the baseline digest; identity drift fails closed |
| exact section-schema regressions | all six sections duplicated before/after, alternate mapping sections, reordered/unknown sections, and host-heading variants | correctly return `evidence-section-invalid` before Git reads; tracked evidence passes the exact schema |
| expanded leakage regressions | both fence forms, one-line/multiline raw JSON, quoted/unquoted probe fields, POSIX absolute/network/root, home, drive, and UNC paths | correctly rejected; URLs, relative canonical paths, placeholders, and ordinary slash prose remain valid |

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
- The tracked acceptance document passes the fixed-source validator and contains no observed raw body or absolute-home-path leak. Remediation-2 also closes the malformed-input variants recorded by the intermediate audit.
- Remediation commits `90c61e2`/`48c52e0`, `b92b579`/`b05ba0a`, and `be594f0`/`b333c46` close the originally recorded regular-file/FIFO, literal duplicate-section, and basic fence/path cases.
- Remediation-2 commits `a58e21b`/`6567a2d`, `dc1961d`/`ebd9480`, and `601a33e`/`e5c6181` close the remaining symlink-target, exact section-schema, multiline raw-output, and POSIX-root variants. The host-level observations listed above remain unverified by design and are not represented as security failures.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-15 | 11 unique | 6 | 5 | Codex generic-agent workaround using complete `gsd-security-auditor` role preamble |
| 2026-07-16 | 11 unique | 7 | 4 | Codex generic-agent workaround re-audit after remediation commits through `0164621` |
| 2026-07-16 | 11 unique | 11 | 0 | Codex generic-agent workaround final re-audit at `bde6b74` |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risk T-03-SC documented
- [x] `threats_open: 0` confirmed
- [x] `status: secured` set in frontmatter

**Approval:** secured 2026-07-16.
