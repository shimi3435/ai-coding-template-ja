# Architecture Research: OpenSpec–GSD Handoff Lifecycle Hardening

**Project:** OpenSpec–GSD Handoff Lifecycle Hardening
**Researched:** 2026-07-16
**Source commit:** `7e4c3ac5d6fc7f75716794ff1b805d9c1d6381bd`
**Confidence:** HIGH for current boundaries and dependency order; MEDIUM for proposed file names

## Scope and Authority

This document recommends implementation structure and build order only. It does not restate
canonical behavior, requirements, scenarios, acceptance criteria, or completion rules.
Canonical authority remains at:

- `openspec/changes/harden-openspec-gsd-handoff-lifecycle/proposal.md`
- `openspec/changes/harden-openspec-gsd-handoff-lifecycle/design.md`
- `openspec/changes/harden-openspec-gsd-handoff-lifecycle/specs/openspec-gsd-handoff-lifecycle-hardening/spec.md`
- `openspec/changes/harden-openspec-gsd-handoff-lifecycle/tasks.md`
- `docs/agents/workflow.md`

Requirement traceability in GSD artifacts should use only opaque handles `HARD-R1` through
`HARD-R6` and the canonical paths above. OpenSpec owns WHAT/WHY and final completion. GSD owns
only detailed phase/plan progress.

The requested source directory was written as
`src/ai_coding_template/openspec_gsd_handoff/`; the repository and pinned commit use
`src/ai_coding_template_ja/openspec_gsd_handoff/`. The latter is the implementation boundary
used by this research. Its contents match the pinned commit.

## Current Architecture

The MVP already has useful boundaries that should be preserved:

| Current component | Current responsibility | Architectural judgment |
| --- | --- | --- |
| `models.py` | Immutable shared values, result/failure types, route and host enums | Keep as the small cross-cutting kernel; do not turn it into a catalog of all v2 domain records |
| `reader.py` | Bounded, contained, read-once canonical OpenSpec Markdown access | Keep specialized for canonical OpenSpec topology |
| `progress.py` | Strict `tasks.md` progress normalization | Reuse from drift; keep independent from lifecycle orchestration |
| `discovery.py` | OpenSpec JSON candidate validation and fresh Markdown fallback | Preserve; hardening should consume its complete result rather than reimplement discovery |
| `preflight.py` | Fixed-argv external probes and source/repository/host validation | Preserve as an adapter boundary; extend through new collectors, not lifecycle policy branches |
| `manifest.py` | v1 values, parser, serializer, state guard, atomic persistence | Split before adding v2; it is already 712 lines and combines four responsibilities |
| `__init__.py` | Public inspect/prepare/mark-started application operations | Retain as a compatibility export surface, but move new orchestration out of this file |
| `__main__.py` | Structured CLI parsing/rendering | Keep thin; it should dispatch and render, not decide lifecycle rules |
| `smoke.py` | Strictly read-only opt-in real-tool smoke | Keep separate from normal CI and from mutation operations |

The strongest existing pattern is: immutable input values → whole-operation validation →
structured success/failure → optional atomic mutation. Hardening should extend this pattern,
not replace it with a stateful service object or a general workflow engine.

The main pressure point is `manifest.py`. Appending v2 schema, migration, identity, ownership
records, journal codecs, and finalize persistence to this file would create the monolith the
change needs to avoid.

## Recommended Architecture

Use a functional core with narrow filesystem/process adapters and small application operations.
The public entrypoints remain stable, while lifecycle responsibilities are separated by domain.

```text
CLI / first-party skill / tests
              |
              v
    public operation functions
              |
     +--------+---------+
     | common drift gate|<-------------------------------+
     +--------+---------+                                |
              |                                          |
   +----------+-----------+-----------+---------+         |
   v                      v           v         v         |
migration              mapping    recovery  finalize     |
   |                      |           |         |         |
   +----------+-----------+-----------+---------+         |
              v                                          |
      versioned manifest + lifecycle records             |
              |                                          |
              v                                          |
       bounded atomic repositories                       |
                                                         |
source inventory --- planning inventory --- ownership graph
       |                  |                    |
       +------------------+--------------------+
```

The dependency direction is inward: adapters produce validated immutable observations; pure
domain functions decide; repositories perform only an already-authorized write. Domain modules
must not invoke the CLI, Git, OpenSpec, GSD, or arbitrary shell commands.

### Proposed Package Shape

Keep the flat package style to minimize import churn, but split files by responsibility:

```text
openspec_gsd_handoff/
  __init__.py                 # compatibility exports only
  __main__.py                 # structured CLI only
  models.py                   # shared Result/failure and small common enums
  reader.py                   # existing canonical OpenSpec reader
  progress.py                 # existing task normalizer
  discovery.py                # existing OpenSpec discovery
  preflight.py                # existing external capability adapters
  smoke.py                    # existing opt-in read-only smoke

  atomic_file.py              # bounded stage/validate/replace primitive
  manifest.py                 # version-dispatch facade and compatibility exports
  manifest_v1.py              # frozen v1 value + exact codec
  manifest_v2.py              # frozen v2 value + exact codec
  manifest_migration.py       # read-only preview and approved migration operation

  source_inventory.py         # source item extraction from already-read artifacts
  identity.py                 # stable identity reconciliation and allocation
  planning_inventory.py       # bounded GSD phase/plan/evidence observations
  policy_references.py        # current-tree stable reference record adapter
  mapping.py                  # pure mapping validation and coverage result
  drift.py                    # operation matrix and common drift evaluation

  repository_paths.py         # repository-contained path identity and alias detection
  manifest_registry.py        # bounded repository-wide manifest enumeration
  ownership.py                # pure ownership/reference graph

  lifecycle_records.py        # checkpoint/receipt/archive values and exact codecs
  recovery.py                 # pure resume-plan construction
  finalize.py                 # pure finalize preview construction
  effect_executor.py          # allowlisted effect execution with no policy decisions
```

These names are recommendations, not new canonical contracts. If a module grows beyond one
coherent responsibility, split its codec, repository, or executor rather than introducing a
generic “lifecycle manager.”

## Component Boundaries

| Component | Owns | Must not own | Communicates with |
| --- | --- | --- | --- |
| Manifest facade | Bounded schema-version dispatch and stable public imports | Version-specific field rules, migration policy, filesystem effects | `manifest_v1`, `manifest_v2`, repositories |
| v1 codec | Existing exact v1 value parsing/serialization | v2 defaults or lifecycle inference | Manifest facade |
| v2 codec | Exact v2 aggregate parsing/serialization | Source scanning, mapping decisions, recovery decisions | Manifest facade and domain value modules |
| Atomic file primitive | Bounded read, staging, validation callback, atomic replace, cleanup evidence | State transitions, rollback, repair, ownership decisions | Manifest and record repositories |
| Source inventory | Deterministic extraction of candidate source items from the single artifact byte buffers already read | Stable ID allocation or semantic matching | `reader`, `identity` |
| Identity | Pure reconciliation of current inventory with active/tombstoned identity state | Filesystem reads, fuzzy matching, phase mapping | `source_inventory`, migration |
| Planning inventory | Bounded observation of phase/plan/evidence metadata under the project planning tree | OpenSpec requirements, GSD progress mutation | `mapping`, `drift` |
| Policy references | Validation and lookup of stable current-tree policy reference IDs | Copying policy prose into manifests | `mapping`, `drift` |
| Mapping | Pure source-ID-to-planning/evidence validation result | Reading arbitrary files, updating GSD progress | Identity, planning inventory, policy registry |
| Drift | Declarative per-operation check matrix and deterministic aggregate result | Repair, route switch, rollback, direct mutation | All validated observations |
| Repository path resolver | Repository containment, real-path identity, lexical identity, alias/collision evidence | Ownership policy or delete authorization | Planning, registry, ownership, finalize |
| Manifest registry | Bounded discovery and versioned read of all in-policy manifests | Guessing ownership for unreadable/legacy data | Manifest facade, path resolver |
| Ownership | Pure graph of owners and readers plus an explicit known/unknown result | Repository scanning, cleanup execution | Registry observations, mapping |
| Lifecycle record repository | Exact record codec and atomic persistence | Resume/finalize policy | Atomic file primitive |
| Recovery | Pure comparison of records, current observations, and dependency order to produce a new resume preview | Retrying, applying effects, repairing records | Drift, ownership, records |
| Finalize preview | Pure ordered effect proposal bound to immutable inputs | Approval collection, effect execution, OpenSpec completion | Drift, ownership, recovery records |
| Effect executor | Execute only typed, previewed effects and return observed evidence | Reordering, adding targets, interpreting policy, rollback | Finalize application operation |
| CLI | Parse requests and render one structured result | Domain branching or filesystem logic | Public operation functions |

## Dependency Rules

1. `manifest_v1.py` and `manifest_v2.py` may import immutable domain value types, but identity,
   mapping, ownership, recovery, and finalize modules must not import a concrete repository.
2. Filesystem/process adapters return observations; they do not return partially validated
   domain objects.
3. The drift evaluator consumes typed check inputs. It does not call collectors itself. This
   keeps the check matrix deterministic and permits missing evidence to remain non-green.
4. Ownership scanning and ownership graph construction are separate. A partial repository scan
   never becomes a partial graph.
5. Recovery constructs a new preview only. It does not perform compensating actions.
6. Finalize preview construction and effect execution are separate calls. Approval is bound to
   the preview and revalidated by the application operation before the executor is invoked.
7. No lifecycle component writes canonical OpenSpec artifacts or declares the OpenSpec change
   complete.

## Versioned Manifest and Migration Design

`manifest.py` should become a compatibility facade:

- Perform the existing bounded read.
- Decode only enough JSON to obtain the schema version.
- Dispatch to an exact v1 or v2 codec.
- Reject unknown versions without selecting a “closest” reader.
- Re-export existing v1 names while callers are migrated to a version union.

Do not model v2 as optional fields on the v1 dataclass. That would make schema-validity depend on
combinations of `None` values and would weaken exact-field rejection.

The migration operation should be split into:

1. read-only input collection;
2. pure migration preview construction;
3. approval/input-hash verification;
4. atomic persistence through the shared primitive.

The migration module owns transformation from a complete v1 value plus validated source
observations to a complete v2 candidate. The identity module owns stable item reconciliation.
The atomic repository owns only byte persistence. This separation makes `HARD-R1` traceable
without coupling identity rules to filesystem fault handling.

Migration creates a schema-valid v2 value, not a claim that all later lifecycle operations are
ready. Readiness is established incrementally by mapping, drift, and ownership gates.

## Mapping Design

Mapping should be a pure validator over three complete inputs:

- stable source inventory;
- bounded planning inventory;
- stable policy reference registry.

Use typed IDs and repository-relative paths in the domain value. Resolve paths at adapter
boundaries and carry validated path identities separately from display strings. Mapping must not
parse arbitrary prose from phase or plan files to rediscover OpenSpec requirements.

Mapping results should distinguish:

- a complete validated mapping value;
- structured issues;
- inability to inspect an input.

Do not return “valid entries plus errors.” Downstream lifecycle operations should receive either
one complete mapping result or no mapping value.

## Drift Design

Drift is the shared lifecycle gate, not six independent implementations.

Represent it as:

```text
OperationKind
    -> ordered CheckRequirement entries
    -> CheckObservation(status, expected, actual, evidence)
    -> DriftReport(overall_status, ordered_results, input_digest)
```

The matrix determines which observations are required for each public operation. Collectors
remain outside the evaluator. This permits the drift phase to be built before ownership:
ownership-dependent checks have a typed slot and cannot become green until the ownership phase
provides a complete observation.

The existing source reader, progress normalizer, source-commit verification, and capability
adapters should be reused. A new collector may combine their outputs, but must not duplicate
their parsing or fallback behavior.

Every mutating operation performs:

1. observation collection;
2. common drift evaluation;
3. preview construction;
4. approval binding;
5. fresh observation collection and drift evaluation immediately before persistence/effects.

No result from an earlier process invocation is silently promoted to the fresh pre-effect check.

## Repository Path and Ownership Design

Path safety is a cross-cutting adapter and should be centralized before repository-wide
ownership is implemented. Keep the existing canonical OpenSpec reader specialized; use a new
resolver for planning and lifecycle artifacts.

A validated repository path identity should carry:

- repository-relative lexical path;
- resolved repository-contained identity;
- normalized alias key used only for collision detection;
- file type/readability evidence.

Consumers never authorize mutation from a raw string path. Symlink, traversal, Unicode/case
alias, unreadable entry, scan bound, or unstable observation produces a structured non-green
result.

Ownership requires two steps:

1. `manifest_registry.py` enumerates all in-policy manifests within fixed limits and parses each
   through the versioned manifest facade.
2. `ownership.py` builds a deterministic graph from the complete registry observation.

The graph uses separate owner and reader edges. Legacy or unreadable manifests remain visible as
insufficient evidence; they are not repaired or ignored to make a cleanup operation pass.

## Recovery Design

Lifecycle records are persistence documents, while recovery is a decision function. Keep them
separate.

`lifecycle_records.py` owns exact values/codecs and atomic repositories. `recovery.py` accepts:

- the relevant records;
- current drift observations;
- current ownership graph;
- current filesystem evidence.

It returns an ordered resume preview or a structured stop result. It never executes a retry,
rollback, route switch, or repair. This keeps `HARD-R4` independent from effect execution and
makes interruption tests deterministic.

Records should reference evidence by bounded structured values or hashes rather than embedding
canonical OpenSpec content.

## Finalize Design

Finalize is the only lifecycle area allowed to coordinate cleanup side effects, but it should
still be split:

- `finalize.py` builds a complete, ordered, immutable preview.
- The application operation verifies approval and reruns drift/ownership checks.
- `effect_executor.py` executes only the typed effects already present in that preview.
- The lifecycle record repository persists checkpoint/receipt evidence around effect execution.

The executor must not accept arbitrary shell commands or discover additional paths while
running. On any partial or indeterminate result, it stops and returns evidence for recovery. It
does not rollback or continue with later effects.

A finalize receipt is mechanical evidence only. It must not update OpenSpec final completion,
close another change, or alter GSD phase progress.

## Public Operation Surface

Keep the current public functions unchanged. Add new operations as explicit verbs rather than a
single `run_lifecycle(action=...)` dispatcher:

```text
preview_manifest_migration
apply_manifest_migration
validate_mapping
inspect_lifecycle_drift
inspect_ownership
build_resume_preview
build_finalize_preview
apply_finalize_preview
```

Exact public naming can be chosen during planning, but each operation should have one structured
success type and one structured failure family. `__init__.py` should only re-export these
functions. `__main__.py` should remain an argv/JSON adapter.

## Data Flows

### Migration and Identity

```text
bounded v1 manifest read
        +
already-read canonical artifact bytes
        |
        v
source inventory -> identity reconciliation -> v2 candidate
        |                                     |
        +---------- preview/input hash --------+
                                              |
                              explicit approval + fresh read
                                              |
                                              v
                               atomic stage/validate/replace
```

### Normal Lifecycle Preflight

```text
manifest + source + planning + capabilities + ownership observations
                              |
                              v
                   common drift evaluator
                              |
                    green / non-green report
                              |
                       preview builder
```

### Recovery and Finalize

```text
records + current observations
              |
              v
        resume preview
              |
      new approval boundary
              |
 fresh drift + ownership checks
              |
      typed effect executor
              |
       receipt evidence
```

## Implementation Build Order

The implementation must remain serial in this dependency order:

| Order | Phase boundary | Architecture delivered | Canonical handle |
| --- | --- | --- | --- |
| 1 | Stable identity and migration | Extract v1 codec/persistence boundaries, add v2 codec/facade, source inventory, identity allocator, migration preview/apply | `HARD-R1` |
| 2 | Mapping | Add planning inventory, policy reference adapter, pure complete mapping validation | `HARD-R1` |
| 3 | Drift | Add typed operation matrix, observation model, common evaluator, fresh-check orchestration | `HARD-R2` |
| 4 | Ownership | Add shared path resolver, bounded manifest registry, pure repository-wide ownership graph, plug ownership observations into drift | `HARD-R3` |
| 5 | Recovery | Add lifecycle record codecs/repositories and pure resume preview construction | `HARD-R4` |
| 6 | Finalize | Add finalize preview, approval-bound application operation, typed effect executor, receipt integration | `HARD-R5` |

`HARD-R6` is cross-cutting: every phase adds its closest deterministic tests before the next
phase begins. Final verification consolidates, but does not postpone, test coverage.

### Why This Order

- Identity must be stable before mapping can refer to source items.
- Mapping must be complete before drift can compare source and derived state.
- Drift defines the common gate before ownership plugs repository-wide evidence into it.
- Ownership must be known before recovery can decide whether a previously started effect is
  safe to resume.
- Recovery records and resume semantics must exist before finalize introduces multi-effect
  mutation.

## Testing Boundaries

Preserve the current split between pure tests, filesystem integration, structured CLI tests, and
opt-in smoke.

Recommended additions:

| Test file | Primary seam |
| --- | --- |
| `test_handoff_manifest_v2.py` | Version dispatch and exact v2 round-trip |
| `test_handoff_migration.py` | Preview/apply seam and atomic failure evidence |
| `test_handoff_identity.py` | Pure source identity behavior |
| `test_handoff_mapping.py` | Complete mapping validation |
| `test_handoff_drift.py` | Matrix evaluation and fresh observation binding |
| `test_handoff_ownership.py` | Pure graph plus filesystem/Git integration |
| `test_handoff_recovery.py` | Record input to resume preview |
| `test_handoff_finalize.py` | Preview/apply/partial-result receipt |
| `test_handoff_lifecycle_cli.py` | One structured result per new public operation |

Use the property-test allocation already assigned in the canonical design; do not expand property
testing to filesystem, Git, external tools, or journal effects merely for uniformity. Keep
`task check` independent of optional OpenSpec/GSD tools. Real-tool evidence remains an explicit
smoke path.

## Anti-Patterns to Avoid

### Extending `manifest.py` in place

Adding all v2 and lifecycle behavior to the existing 712-line file would mix schema versions,
domain decisions, and mutation recovery. Split it into facade, version codecs, migration, and
atomic persistence first.

### A generic lifecycle manager

An object with methods for mapping, drift, ownership, recovery, and finalize would hide dependency
direction and accumulate mutable state. Prefer immutable inputs and explicit operation functions.

### String-only path comparison

Repository-relative strings are suitable for serialization, not mutation authorization. Require
a validated path identity from the shared resolver.

### Partial-success domain values

Do not return a partially built source inventory, mapping, ownership graph, or preview. Return a
complete value or a structured failure/non-green result.

### Operation-specific drift logic

Duplicating source/capability/phase checks in plan, execute, resume, verify, and finalize will
inevitably diverge. Keep one declarative matrix and one evaluator.

### Recovery inside the executor

The effect executor must not decide to retry, repair, rollback, switch routes, or continue after
an indeterminate result. Recovery is a later read-only planning operation.

### Treating receipts as completion authority

Receipts prove mechanical observations. They do not replace canonical OpenSpec verification or
OpenSpec-owned final completion.

## Roadmap Implications

- Phase 1 should budget for controlled extraction of the existing manifest code before adding
  new behavior. This is required boundary work, not unrelated refactoring.
- Each later phase can be implemented against immutable fixtures from the prior phase, keeping
  the serial dependency chain reviewable.
- The ownership and finalize phases need filesystem integration depth; they should not be merged
  into one phase even though both operate on paths.
- Cross-phase application APIs should be added only when their required observations exist.
  Unsupported or not-yet-built checks remain explicitly non-green.
- No phase should include PR #42 or another OpenSpec change.

## Confidence Assessment

| Area | Confidence | Reason |
| --- | --- | --- |
| Existing component boundaries | HIGH | Read directly from the pinned source tree and tests |
| Manifest split recommendation | HIGH | Current file already combines schema, codec, state guard, and persistence |
| Serial build order | HIGH | Fixed by project constraints and canonical handles |
| Proposed module names | MEDIUM | Names are implementation recommendations and may be adjusted during planning |
| Finalize executor shape | MEDIUM | Boundary is clear, while exact effect vocabulary remains canonical OpenSpec territory |

## Sources

- Source commit `7e4c3ac5d6fc7f75716794ff1b805d9c1d6381bd`
- `.planning/PROJECT.md`
- `.planning/openspec/harden-openspec-gsd-handoff-lifecycle/handoff-brief.md`
- `.planning/openspec/harden-openspec-gsd-handoff-lifecycle/handoff.json`
- `src/ai_coding_template_ja/openspec_gsd_handoff/`
- `tests/test_handoff_*.py`
- `openspec/changes/harden-openspec-gsd-handoff-lifecycle/design.md`
- `docs/agents/workflow.md`
