# Phase 3: Deterministic Verification and Acceptance Evidence - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-07-15
**Phase:** 03-deterministic-verification-and-acceptance-evidence
**Mode:** `--auto` (single pass)
**Areas discussed:** normal-CI completeness, opt-in read-only smoke, unsafe host evidence, acceptance traceability

## Normal-CI completeness

| Option | Description | Selected |
|--------|-------------|----------|
| Audit and fill only real gaps | Reuse Phase 1/2 evidence and add only missing integration/property cases. | ✓ |
| Duplicate the whole fixture matrix | Recreate existing tests in a new file. | |

**Selection:** `[auto]` Audit and fill only real gaps.

## Opt-in real-tool smoke

| Option | Description | Selected |
|--------|-------------|----------|
| Strict read-only dedicated task | Probe exact tools/signals and never invoke mutable entrypoints. | ✓ |
| Put real tools in task check | Make GSD/OpenSpec mandatory in normal CI. | |

**Selection:** `[auto]` Strict read-only dedicated task.

## Unsafe host evidence

| Option | Description | Selected |
|--------|-------------|----------|
| Reasoned unverified evidence | Do not invoke no-dry-run GSD mutations; record the exact unverified observations. | ✓ |
| Mutate current planning project | Run real new-project/phase dispatch in the implementation worktree. | |

**Selection:** `[auto]` Reasoned unverified evidence.

## Acceptance traceability

| Option | Description | Selected |
|--------|-------------|----------|
| Complete requirement/scenario matrix | Map every canonical item to code/test/smoke/unverified reason. | ✓ |
| Treat GSD phase completion as final | Skip canonical OpenSpec reconciliation. | |

**Selection:** `[auto]` Complete requirement/scenario matrix.

## the agent's Discretion

- Exact task/script/test names and minimal structured smoke output.
- Location of temporary acceptance evidence, provided product evidence remains in code/tests and final authority remains OpenSpec.

## Deferred Ideas

- Full destructive host E2E sandbox and all lifecycle hardening.

## Delegation Note

GSD `discuss-phase` owns CONTEXT/DISCUSSION-LOG creation in the orchestrator and exposes no phase-context agent.
Research, planning, execution, verification, and security remain fresh-role delegated.
