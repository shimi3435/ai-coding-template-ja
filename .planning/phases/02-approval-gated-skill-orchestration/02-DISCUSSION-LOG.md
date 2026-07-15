# Phase 2: Approval-Gated Skill Orchestration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-15
**Phase:** 02-approval-gated-skill-orchestration
**Mode:** `--auto` (single pass)
**Areas discussed:** responsibility split, approval preview, GSD acceptance boundary, skill distribution

---

## Responsibility split

| Option | Description | Selected |
|--------|-------------|----------|
| Thin skill over Phase 1 seam | Skill owns human/host/GSD orchestration; bridge owns validation and persistence. | ✓ |
| Duplicate bridge checks in skill | Re-express Python rules in SKILL.md. | |
| Add a second orchestration package | Introduce another production layer between skill and bridge. | |

**Selection:** `[auto]` Thin skill over Phase 1 seam (recommended default).
**Notes:** Keeps OpenSpec and Phase 1 contracts single-sourced and makes static skill guidance reviewable.

---

## Approval preview

| Option | Description | Selected |
|--------|-------------|----------|
| One complete read-only preview | Show every source-pinned input/capability before one explicit approval. | ✓ |
| Progressive mutable prompts | Prepare some state before all inputs are visible. | |
| Approval by invocation | Treat invoking the skill as approval. | |

**Selection:** `[auto]` One complete read-only preview (recommended default).
**Notes:** Refusal and inspection failure must leave manifest/GSD untouched.

---

## GSD acceptance boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Fail closed on explicit acceptance evidence | Move `prepared` to `started` only after the contracted GSD skill accepts the input. | ✓ |
| Mark started before dispatch | Use intent rather than accepted handoff as the transition. | |
| Retry until success | Add automatic recovery to the MVP. | |

**Selection:** `[auto]` Fail closed on explicit acceptance evidence (recommended default).
**Notes:** Ambiguous return/checkpoint remains `prepared`; no retry, rollback, or route switch.

---

## Skill distribution

| Option | Description | Selected |
|--------|-------------|----------|
| Existing first-party vendoring pattern | `.agents/skills` source, lock/hash, setup-generated Claude/Codex symlinks. | ✓ |
| Runtime-specific copies | Maintain separate Claude and Codex SKILL.md files. | |
| Global-only installation | Keep the skill outside the repository. | |

**Selection:** `[auto]` Existing first-party vendoring pattern (recommended default).
**Notes:** Reuses existing safety and CI gates without new setup behavior.

## the agent's Discretion

- Preview layout and minimal structured-result adapter.
- Ephemeral handoff-brief naming/cleanup within the canonical no-lifecycle-hardening boundary.
- Focused contract-test file split and exact GSD acceptance fixture representation.

## Deferred Ideas

- `harden-openspec-gsd-handoff-lifecycle` and all retry/resume/rollback/finalize/cleanup automation.
- Push, PR, merge, automatic stash/commit/reset, and OpenSpec close.

## Delegation Note

GSD 1.5.0 `discuss-phase` assigns CONTEXT.md and DISCUSSION-LOG.md creation to the orchestrator and provides no
`gsd-phase-context` agent. Heavy implementation, research, planning, execution, and verification remain delegated to their
fresh GSD roles; the context artifact itself follows the workflow-owned exception.
