---
phase: "03"
slug: deterministic-verification-and-acceptance-evidence
status: concerns
threats_open: 4
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
| T-03-01 | high | Spoofing / Tampering | real tool capability | mitigate | Exact OpenSpec/GSD versions, JSON-only OpenSpec success, required GSD files, project-root/agent/initialization signals, and classified failures are enforced by `smoke.py:430-457` through the Phase 1 adapters in `preflight.py:219-329`. The real opt-in run returned OpenSpec 1.3.1, GSD 1.5.0, route `json`, and initialized `gsd-phase`. | closed |
| T-03-02 | high | Elevation of Privilege | command dispatch | mitigate | The smoke reaches only the three allowlisted read-only argv forms (`smoke.py:25-29,430-445`); the shared runner uses `shell=False`, bounded output, timeout, and direct argv (`preflight.py:108-203`). The smoke module has no import/call of prepare, manifest persistence, mark-started, or either mutable GSD entrypoint. Task variables cross the shell as quoted environment values (`Taskfile.yml:147-173`). | closed |
| T-03-03 | high | Tampering / Repudiation | repository mutation verdict | mitigate | **OPEN after partial remediation:** regular files and directories now use stable directory descriptors, `O_NOFOLLOW`, `O_PATH`, `O_NONBLOCK`, and descriptor/path identity checks (`smoke.py:202-339`); the regular-file, directory, and FIFO regression cases are closed. The symlink branch still reads the target by pathname between two path `stat` calls (`smoke.py:340-363`) instead of pinning the symlink object with a descriptor. No regression covers target identity at that seam, so the declared stable no-follow snapshot behavior is not complete for every entry type. | open |
| T-03-04 | medium | Information Disclosure | smoke JSON/human output | mitigate | Success output contains repository-relative artifact identities/hashes, redacted `${GSD_HOME}` command evidence, constant-size snapshot metadata, and explicit unverified rows (`smoke.py:489-547`). Focused tests reject repository/GSD roots and canonical bodies; the real run emitted one JSON object plus one summary line without either absolute root. | closed |
| T-03-05 | high | Denial of Service | output and fingerprint reads | mitigate | Remediation opens a classified regular path first with nonblocking `O_PATH|O_NOFOLLOW`, rejects a non-regular descriptor, and only then opens the pinned `/proc/self/fd/<fd>` object with `O_NONBLOCK` (`smoke.py:239-304`). Directory opens are likewise no-follow/nonblocking (`:305-339`). The FIFO/device substitution regression completes without blocking and returns `repository-snapshot-unstable`; inventory/path/deadline/output bounds remain present. | closed |
| T-03-06 | high | Spoofing | no-GSD normal-check claim | mitigate | `check:without-gsd` uses `env -i`, empty temporary HOME/CODEX_HOME/GSD_HOME/XDG roots, offline uv, curated PATH, and negative launcher assertions before the nested real `task check` (`Taskfile.yml:42-100`). Audit execution passed all four normal gates and 254 tests. | closed |
| T-03-07 | high | Tampering / Repudiation | acceptance mapping | mitigate | **OPEN after partial remediation:** each exact required heading must now occur once before Git reads (`validate-handoff-acceptance-evidence.py:180-194,433-448`), closing literal duplicates. `_validate_section_structure` does not validate or reject other table-bearing mapping sections, while `_section_rows` continues to read only the exact four headings (`:293-313`). The earlier audit requirement to validate all evidence tables rather than silently ignore later mapping sections is therefore not fully implemented. | open |
| T-03-08 | medium | Information Disclosure | acceptance evidence capture | mitigate | **OPEN after partial remediation:** backtick/tilde fences, one-line JSON, common absolute paths, and unquoted multi-field probe output are rejected (`validate-handoff-acceptance-evidence.py:360-417`). The raw-output check parses JSON one line at a time and the probe-key expression does not include quoted keys; the path expressions also exclude double-leading-slash and root-only forms. The declared raw-probe and arbitrary-local-absolute-path coverage remains incomplete. | open |
| T-03-09 | high | Spoofing | host-level acceptance claims | mitigate | **OPEN after partial remediation:** the exact Host-unverified table remains strict and headings beginning with `Host` are rejected (`validate-handoff-acceptance-evidence.py:180-194,347-357`). Other table-bearing headings containing `host` later in the heading are outside that validation, so the earlier requirement to reject all additional host-claim sections remains incomplete. | open |
| T-03-10 | high | Elevation of Privilege | final authority / scope | mitigate | The tracked evidence states that tasks 5.1/5.2 and final completion remain with the main/orchestrator and explicitly excludes lifecycle hardening, retry/resume/rollback/finalize/cleanup, push, PR, and merge (`03-ACCEPTANCE-EVIDENCE.md:136-138`). Operator guidance repeats OpenSpec final authority (`docs/optional/gsd.md:138-143`). No hardening implementation or mutable lifecycle operation appears in the Phase 3 code. | closed |
| T-03-SC | medium | Tampering | package installs | accept | Phase 3 adds no dependency/package install or dependency manifest/lock-file change. Existing repository-pinned tools and an operator-selected local OpenSpec/GSD installation remain outside this phase's supply-chain audit. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Open Threats

| Finding | Threats | Severity | Required mitigation |
|---------|---------|----------|---------------------|
| F-03-01: symlink-target pathname TOCTOU remains | T-03-03 | high | Pin the symlink itself with a no-follow descriptor, read its target from that descriptor, and verify descriptor/path identity. Add a regression for symlink-target identity stability. Regular/directory/FIFO remediation is verified and should be retained. |
| F-03-02: semantic evidence/host sections remain ignored | T-03-07, T-03-09 | high | Validate or reject every table-bearing section outside the four allowed evidence sections, and reject host-claim headings regardless of where the word `host` appears. Add coverage for alternate mapping and host-evidence section names. |
| F-03-03: multiline raw/local-path variants remain | T-03-08 | medium | Detect pretty-printed JSON/probe blocks with quoted keys and cover POSIX network-root/bare-root forms (`//...`, `/`) while preserving fixed relative canonical paths, URLs, and explicit placeholders. |

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
| focused Phase 3 security suite | `uv run pytest tests/test_handoff_smoke.py tests/test_handoff_acceptance_evidence.py tests/test_taskfile.py -q` | 83 passed after remediation |
| source-pinned tracked evidence | `uv run --no-sync python scripts/validate-handoff-acceptance-evidence.py --repository . --evidence .planning/phases/03-deterministic-verification-and-acceptance-evidence/03-ACCEPTANCE-EVIDENCE.md` | `ok`; 5 requirements, 26 scenarios, 60 spec holes, 4 host-unverified rows |
| full project gate | `task check` | exit 0; Ruff format/check, basedpyright, and 280 tests passed |
| isolated normal gate | `task check:without-gsd` | exit 0; Ruff format/check, basedpyright, and 280 tests passed with Node/OpenSpec/GSD launchers absent |
| actual read-only opt-in | `task openspec:gsd-handoff:smoke CHANGE_ID=automate-openspec-gsd-handoff GSD_HOME=<active-config-root>` | exit 0; exact versions, route `json`, initialized `gsd-phase`, one JSON object/one summary line, `write_detected=false` |
| fixed argv / shell boundary | code inspection of `preflight.py:108-269`, `smoke.py:25-29,430-445`, and `validate-handoff-acceptance-evidence.py:197-228` | direct argv and `shell=False`; change/GSD Task variables quoted through environment; fixed source SHA and blob paths never come from evidence |
| package scope | dependency-file diff from Phase 3 plan commit `059042e` through audited HEAD plus added-line install-command search | no dependency file or package installation change |
| remediated regular/FIFO/directory regressions | focused tests cover regular-file, directory, FIFO, and descriptor-identity changes | all return `repository-snapshot-unstable`; FIFO coverage completes without blocking |
| remaining symlink seam inspection | `smoke.py:340-363` and focused regression inventory | target read remains pathname-based; no descriptor-pinned symlink target regression exists |
| exact duplicate-section regressions | duplicate each required section before/after the original and add four tested `Host...` heading variants | correctly return `evidence-section-invalid` before Git reads |
| remaining section-structure inspection | `validate-handoff-acceptance-evidence.py:180-194,293-313` and regression inventory | exact duplicates and `Host...` variants are tested; other table-bearing mapping/host headings are not validated |
| remediated leakage regressions | backtick/tilde fences, one-line raw JSON, unquoted probe key/value output, `/srv`, `/tmp`, `~/`, drive, and UNC paths | correctly rejected; allowed relative canonical paths/placeholders remain valid |
| remaining redaction inspection | `validate-handoff-acceptance-evidence.py:360-391` and regression inventory | multiline quoted-key JSON and double-leading-slash/root-only path forms are outside the implemented expressions |

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
- The tracked acceptance document itself currently passes the fixed-source validator and contains no observed raw body or absolute-home-path leak; the open findings concern validator fail-closed guarantees under malformed or accidental inputs.
- Remediation commits `90c61e2`/`48c52e0`, `b92b579`/`b05ba0a`, and `be594f0`/`b333c46` close the originally demonstrated regular-file/FIFO race, literal duplicate-section, and basic fence/path cases. This re-audit does not reopen those exact cases; it records remaining variants in the same declared threat boundaries.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-15 | 11 unique | 6 | 5 | Codex generic-agent workaround using complete `gsd-security-auditor` role preamble |
| 2026-07-16 | 11 unique | 7 | 4 | Codex generic-agent workaround re-audit after remediation commits through `0164621` |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risk T-03-SC documented
- [ ] `threats_open: 0` — four declared mitigations remain open
- [ ] `status: verified` — blocked by high findings F-03-01 and F-03-02

**Approval:** concerns — partial remediation verified, but remaining high variants require remediation and re-audit before Phase 03 can be marked SECURED.
