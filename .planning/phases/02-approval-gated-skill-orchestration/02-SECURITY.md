---
phase: "02"
slug: approval-gated-skill-orchestration
status: verified
threats_open: 0
asvs_level: 1
block_on: high
created: 2026-07-15
---

# Phase 02 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| user / visible host → approval gate | Runtime-visible host evidence and a fresh user answer must be bound to one immutable preview before repository mutation. | repository real path, change ID, source commit, capability and policy evidence, approval |
| Phase 1 bridge → mutable handoff state | Read-only inspection and structured prepared success are the only bridge evidence allowed before GSD dispatch. | canonical paths and hashes, input route, manifest state, classified result |
| orchestration skill → GSD routes | Both initialization routes must receive the same source-pinned payload, and `started` requires independent host and filesystem evidence. | parity payload, dispatch result, read-only postcondition |
| generic host → reachable GSD agents | Generic dispatch may inject roles only after resolving the selected workflow, every reachable active TOML, and isolation requirements. | workflow routing, spawn names, complete role preambles, isolation constraints |
| canonical `.agents` skill → Claude / Codex runtime paths | The delivered skill bytes and both runtime entry paths must resolve to one authenticated local implementation. | SHA-256 provenance, relative symlink target and resolved identity |
| executable behavior → operator guidance | Guidance must not broaden authority, misstate retained state, or present the generic workaround as typed dispatch. | approval order, failure state, source pin, final authority |
| Phase 2 scope → package supply chain | The phase must not add or execute a dependency/package installation while package-install risk is accepted out of scope. | dependency manifests, package-manager commands, local symlink distribution |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-02-01 | Spoofing / Repudiation | approval | mitigate | Frozen inspection/preview tuple, complete labelled preview, and fresh explicit approval before mutation (`.agents/skills/execute-openspec-change/SKILL.md:14-15`, `:17-50`, `:105-157`). Phase 1 independently rejects `approved != True` (`src/ai_coding_template_ja/openspec_gsd_handoff/__init__.py:153-179`). | closed |
| T-02-02 | Tampering | route payload | mitigate | One immutable `PARITY_PAYLOAD` is rendered completely to both routes (`.agents/skills/execute-openspec-change/SKILL.md:159-187`); fixture equality is executable (`tests/test_execute_openspec_change_skill.py:160-194`). | closed |
| T-02-03 | Elevation of Privilege | generic dispatch | mitigate | Selected workflow, reachable spawn names, complete active TOMLs, and isolation are required before approval; seven unknown/incompatible cases fail closed (`.agents/skills/execute-openspec-change/SKILL.md:56-103`; `tests/test_execute_openspec_change_skill.py:308-385`). | closed |
| T-02-04 | Spoofing / Tampering | acceptance | mitigate | Acceptance is the conjunction of structured completed-success and the complete route-specific read-only postcondition; prose, checkpoint, ambiguity, and mismatch retain `prepared` (`.agents/skills/execute-openspec-change/SKILL.md:189-243`; `tests/fixtures/openspec_gsd_handoff/skill/contract.json:168-250`). | closed |
| T-02-05 | Repudiation | manifest tracking | mitigate | Every prepared success reports manifest path/source commit and tells the operator to make a distinct later tracking commit; the skill never commits (`.agents/skills/execute-openspec-change/SKILL.md:245-254`; `tests/test_execute_openspec_change_skill.py:388-418`). Residual operator-dependence is logged as R-02-05. | closed |
| T-02-06 | Tampering | `skills.lock.json` digest | mitigate | Local first-party provenance pins SHA-256 `f456311...ff51` (`.agents/skills/skills.lock.json:115-122`), and the lock suite recomputes and asserts the digest (`tests/test_skills_lock.py:100-146`). | closed |
| T-02-07 | Spoofing / Tampering | Claude/Codex skill paths | mitigate | Both paths are asserted to be relative symlinks with literal target `../../.agents/skills/execute-openspec-change` and the same resolved canonical identity (`tests/test_skills_lock.py:140-146`). | closed |
| T-02-08 | Repudiation | operator guidance | mitigate | Entry documents preserve preview/approval, prepared retention, source/tracking separation, OpenSpec final authority, and the Phase 2 evidence limit (`AGENTS.md:41-46`; `docs/agents/workflow.md:61-125`; `docs/optional/gsd.md:51-92`). | closed |
| T-02-09 | Elevation of Privilege | misleading generic-agent guidance | mitigate | Guidance explicitly denies typed equivalence and fails closed on unknown, typed-only, worktree-isolated, or incompatible isolation evidence (`docs/agents/workflow.md:101-106`; `docs/optional/gsd.md:80-84`). | closed |
| T-02-SC | Tampering | package installs | accept | No package/dependency installation is part of Phase 2; local symlink distribution is the only delivery mechanism (`.planning/phases/02-approval-gated-skill-orchestration/02-01-SUMMARY.md:16-18`, `:138-140`; `.planning/phases/02-approval-gated-skill-orchestration/02-02-SUMMARY.md:16-18`, `:117-119`). Repository-diff evidence is recorded below. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-02-05 | T-02-05 | The control deliberately stops at reporting: automatic Git commit would expand mutation authority and blur the canonical source commit from the later manifest-tracking commit. The residual risk is that an operator may omit that later commit. Phase 2 accepts this residual only with explicit path/source reporting and an instruction to create a distinct later commit; actual operator compliance is not claimed. | Phase 2 PLAN 01 and security-audit directive | 2026-07-15 |
| R-02-SC | T-02-SC | Package installation is intentionally absent from this phase. The phase adds a local first-party skill, integrity metadata, and relative symlinks only. Any future opt-in package installation remains outside this acceptance and requires a new audit at the phase that introduces it. | Phase 2 PLAN 01/02 threat models | 2026-07-15 |

*Accepted risks do not resurface in future audit runs unless their scope or assumptions change.*

---

## Verification Evidence

| Control | Verification | Result |
|---------|--------------|--------|
| approval and Phase 1 state seam | `tests/test_execute_openspec_change_skill.py:34-157`; dynamic rejection/transition tests at `tests/test_handoff_cli.py:180-188`, `:219-233`, `:272-301` | closed; inspect is read-only, prepare requires approval, and started requires caller-confirmed acceptance |
| exact route payload parity | fixture payload and both route renderings at `tests/fixtures/openspec_gsd_handoff/skill/contract.json:96-166`; equality assertions at `tests/test_execute_openspec_change_skill.py:160-194` | closed |
| generic fail-closed preflight | required evidence and failure matrix at `tests/fixtures/openspec_gsd_handoff/skill/contract.json:252-299`; ordering and content assertions at `tests/test_execute_openspec_change_skill.py:308-385` | closed at the static instruction-contract boundary |
| conservative acceptance and no-retry stop | `.agents/skills/execute-openspec-change/SKILL.md:191-243` requires both terms, retains `prepared`, forbids retry/route switch, and gates mark-started; `tests/fixtures/openspec_gsd_handoff/skill/contract.json:191-210` sets `call_mark_started=false`, `retry=false`, `route_switch=false`; `tests/test_execute_openspec_change_skill.py:197-298` asserts the matrix | closed; no actual host/postcondition execution claimed |
| manifest report / no automatic commit | `.agents/skills/execute-openspec-change/SKILL.md:245-254`; `tests/fixtures/openspec_gsd_handoff/skill/contract.json:301-323`; `tests/test_execute_openspec_change_skill.py:388-418` | closed with residual risk R-02-05 |
| digest integrity | `sha256sum .agents/skills/execute-openspec-change/SKILL.md` and the matching lock value both returned `f456311687c476ec807d5e28eb8e2c89a179a449e99ff69f34f482c62ef4ff51` | closed |
| runtime link identity | both `readlink` calls returned `../../.agents/skills/execute-openspec-change`; both `readlink -f` calls resolved to the same canonical `.agents` directory | closed |
| no new package | `git diff --quiet e0f2757..HEAD -- pyproject.toml uv.lock requirements.txt requirements-dev.txt poetry.lock setup.py setup.cfg package.json package-lock.json pnpm-lock.yaml yarn.lock` returned 0; added-line search found no package-manager install command | accepted as R-02-SC; assumption verified for the audited Phase 2 range |
| focused audit suite | `PYTHONDONTWRITEBYTECODE=1 COVERAGE_FILE=/tmp/phase2-security.coverage uv run pytest tests/test_execute_openspec_change_skill.py tests/test_handoff_cli.py tests/test_handoff_preflight.py tests/test_skills_lock.py tests/test_setup_skills.py -q -p no:cacheprovider` | 78 passed |

### Evidence Boundary

This audit verifies the implemented SKILL instruction contract, fixture consistency, distribution integrity, operator guidance, and the existing Phase 1 dynamic public state seam. It did **not** execute an actual host prompt, spawn a generic GSD agent, mutate a real GSD project, or observe either route-specific postcondition. Those observations remain unverified and belong to Phase 3 (`.agents/skills/execute-openspec-change/SKILL.md:256-261`; `.planning/phases/02-approval-gated-skill-orchestration/02-01-SUMMARY.md:123-132`; `.planning/phases/02-approval-gated-skill-orchestration/02-02-SUMMARY.md:105-107`). Static instruction evidence is not represented here as actual host execution.

### SUMMARY Threat Flags Reconciliation

| Summary | Declared Flag | Mapping / Disposition |
|---------|---------------|-----------------------|
| `.planning/phases/02-approval-gated-skill-orchestration/02-01-SUMMARY.md` | No `Threat Flags` section and no executor flag declaration | No flag to map; all Plan 01 declared threats T-02-01 through T-02-05 and T-02-SC were audited independently. |
| `.planning/phases/02-approval-gated-skill-orchestration/02-02-SUMMARY.md:113-115` | `None` | No unregistered attack-surface flag. Plan 02 threats T-02-06 through T-02-09 and T-02-SC were audited independently. |

**Unregistered flags:** none.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-15 | 10 unique | 10 | 0 | Codex generic-agent workaround using complete `gsd-security-auditor` role preamble |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-15
