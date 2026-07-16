# Domain Pitfalls

**Domain:** OpenSpec–GSD handoff lifecycle hardening
**Researched:** 2026-07-16
**Research baseline source:** `7e4c3ac5d6fc7f75716794ff1b805d9c1d6381bd`
**Current planning source:** `2cbb127917feaa637ef5eac439478227ac5f717b`; Phase 1 phase research must reread the current canonical artifacts.
**Overall confidence:** HIGH for the research baseline — its source-pinned canonical artifacts,
implementation, fixed fixtures, and public-seam tests were cross-checked directly. No external
ecosystem claims are needed for this repository-specific analysis.

This document does not restate canonical requirements or scenarios. Each warning refers only to
the applicable `HARD-R1`–`HARD-R6` handle.

## Current Baseline Observations

- The current source commit exists. Phase 1 replanning must read its canonical hardening artifacts;
  the old started handoff remains historical / stale evidence.
- The implementation under `src/ai_coding_template_ja/openspec_gsd_handoff/` is deliberately v1:
  its parser rejects schema v2 and its persistent transition is limited to `prepared` → `started`.
  Hardening must extend this boundary without weakening the v1 reader or silently changing v1.
- Existing tests provide useful evidence for v1 bounded reads, strict parsing, atomic staging,
  path containment, read-only probes, and static generic-dispatch instructions. They do not prove
  the future v2 lifecycle, repository-wide ownership, recovery, or approval-bound finalize seams.
- At research time, the handoff manifest existed with `handoff_state: prepared`. It was later
  started and is now retained unchanged as historical / stale dispatch evidence; current Phase 1
  planning authority comes from the separately identified current source.
- The visible host path is a **generic-agent workaround**, not typed dispatch. Static TOML and skill
  contracts do not by themselves prove actual prompt injection, spawning, or route postconditions.

## Critical Pitfalls

### 1. Treating schema v2 as an in-place extension of v1

**Handles:** `HARD-R1`, `HARD-R4`

**What goes wrong:** New fields are added to the v1 root, the v1 parser is relaxed to accept unknown
fields, or migration writes the target before a complete v2 value has been bounded, parsed, and
validated.

**Why it happens:** Reusing the existing dataclass and serializer looks simpler than maintaining a
version-discriminated reader and an explicit migration operation.

**Consequences:** Existing v1 fixtures stop being authoritative, old readers misinterpret new
state, failed migration can destroy the only resume index, and downgrade may appear to succeed
while silently discarding lifecycle data.

**Warning signs:**

- `_ROOT_FIELDS` is expanded without a separate v2 root definition.
- `parse_manifest_bytes` accepts both versions through optional fields.
- Migration calls `write_bytes` on `handoff.json` directly.
- A replace failure returns a generic error without re-reading the target.
- Tests assert only the successful v2 round trip and not preservation of the original v1 bytes.

**Prevention:**

- Keep the v1 parser and golden fixture unchanged.
- Dispatch by explicit schema version, with exact fields for each version.
- Make migration preview read-only and bind approval to both original bytes and proposed v2 bytes.
- Use same-directory staging, bounded re-read, complete validation, then atomic replace.
- After replace failure, report `unknown` unless the original v1 bytes can still be proven intact.
- Never implement automatic downgrade or rollback.

**Phase owner:** Stable identity / migration phase.

### 2. Allocating identity from order, display text, or fuzzy similarity

**Handles:** `HARD-R1`

**What goes wrong:** IDs are regenerated from current source order, normalized headings are treated
as globally unique, deleted IDs are recycled, or ambiguous renames are joined by a similarity
threshold.

**Why it happens:** Deterministic numbering is mistaken for stable identity, and heuristic matching
seems to reduce manual conflict handling.

**Consequences:** Evidence is attached to the wrong source item, a deleted item can inherit a new
meaning, reorder-only changes create mass churn, and an apparently complete mapping becomes false.

**Warning signs:**

- IDs are assigned with `enumerate()` on every run.
- Counters are recomputed from only active items.
- Tombstones are removed during cleanup or compaction.
- Two candidates match and code selects the “best” one.
- Whitespace or source ordering changes cause new IDs.

**Prevention:**

- Persist monotonic category counters and never derive the next value from active rows alone.
- Preserve raw source identity and the canonical fingerprint inputs separately.
- Reuse an ID only on a unique exact identity match.
- Tombstone deletions and reject counter exhaustion or aggregate limits.
- Return an explicit conflict requiring manual mapping when identity is ambiguous.

**Phase owner:** Stable identity / migration phase.

### 3. Confusing “schema-valid mapping” with “operation-ready mapping”

**Handles:** `HARD-R1`, `HARD-R6`

**What goes wrong:** An empty or partial mapping passes because it conforms to the v2 JSON shape;
phase numbers or descriptions are accepted as identity; evidence paths merely exist but do not
prove the mapped public seam; or a phase includes another OpenSpec change.

**Why it happens:** Structural validation is easier than graph validation, and generic “tests pass”
evidence is easier to collect than source-item traceability.

**Consequences:** Work begins with uncovered canonical items, one item maps to multiple owners,
foreign-change evidence contaminates the lifecycle, and final verification reports coverage that
does not exist.

**Warning signs:**

- Migration output is immediately accepted by plan or execute operations.
- Mapping validation checks JSON types but not coverage, uniqueness, ownership, or file identity.
- Evidence is a command name or directory rather than a concrete node ID / fixture / result.
- The same catch-all evidence is assigned to most source items without a distinct seam.
- `phase_id` is inferred from ordering instead of validated against the phase graph.

**Prevention:**

- Separate schema validity from per-operation readiness.
- Validate source ID, change ownership, one-phase ownership, phase/plan existence, evidence
  existence, and policy-reference existence as one whole mapping result.
- Reject empty, partial, duplicate, cross-change, or broken-reference mappings before mutation.
- Record the smallest evidence that actually exercises the mapped public seam.

**Phase owner:** Mapping phase.

### 4. Performing lifecycle operations with partial or lossy drift checks

**Handles:** `HARD-R2`, `HARD-R4`

**What goes wrong:** Code checks only `HEAD`, only stored hashes, only the worktree, or only one
artifact; treats probe failure as “no drift”; strips more than checkbox tokens; or uses cached
preflight results after the repository has changed.

**Why it happens:** A single hash or Git comparison appears sufficient, and normalizing Markdown
aggressively reduces noisy diffs.

**Consequences:** A changed canonical specification is executed under an old plan, meaningful task
text changes are hidden, capability drift is ignored, and an unreadable state produces a false
green result.

**Warning signs:**

- A preflight result is boolean rather than `pass` / `drift` / `unknown`.
- Missing Git objects, timeouts, unreadable files, or malformed graphs map to success.
- The normalizer strips headings, descriptions, whitespace broadly, or Unicode distinctions.
- Plan, execute, resume, verify, and finalize each implement their own drift logic.
- Preflight is not run again immediately before the write boundary.

**Prevention:**

- Use one declarative lifecycle preflight matrix shared by every public operation.
- Compare the pinned source, current canonical bytes, manifest schema, mapping, phase graph,
  capability evidence, and ownership facts required by that operation.
- Treat incomplete inspection as `unknown` and stop.
- Keep checkbox-only normalization narrow and fixture-backed.
- Bind preview and approval to the complete preflight input digest; never reuse a stale result.

**Phase owner:** Drift phase, with mandatory reuse by recovery and finalize.

### 5. Scanning ownership locally instead of repository-wide

**Handles:** `HARD-R3`

**What goes wrong:** Deletion or movement is authorized by the current manifest alone; ignored or
unreadable manifests are skipped; referenced paths are treated as owned; or path comparison is
lexical and misses symlink, case, Unicode, and separator aliases.

**Why it happens:** The current change directory is convenient to scan, while repository-wide
normalization and bounded failure handling are more expensive.

**Consequences:** Another change loses a shared artifact, a lifecycle record becomes orphaned,
canonical or policy documents are claimed as owned, or a path escapes repository ownership.

**Warning signs:**

- The scanner accepts a manifest path argument instead of a repository root.
- Errors are accumulated as warnings while a partial graph is still returned as usable.
- `Path` string equality is the only alias defense.
- Ownership and references share one undifferentiated set.
- Cleanup proceeds when owner count is zero or greater than one.

**Prevention:**

- Discover all repository-policy-valid manifests from the repository root under explicit bounds.
- Resolve paths inside the repository, reject traversal and symlinks, and detect platform-relevant
  case / Unicode aliases before graph construction.
- Model owner and reader/reference edges separately.
- Make any unreadable, malformed, escaped, conflicting, or over-limit scan invalidate the whole
  ownership decision.
- Re-run the graph immediately before and after finalize effects.

**Phase owner:** Ownership phase.

### 6. Accepting approval that is not bound to the exact immutable preview

**Handles:** `HARD-R5`, `HARD-R4`

**What goes wrong:** A boolean approval, earlier conversation approval, CLI flag, timestamp TTL, or
approval of a human summary authorizes operations reconstructed later from changed repository
state.

**Why it happens:** The existing MVP approval flag is mistaken for the stronger lifecycle approval
contract, or the displayed preview and executable plan are built independently.

**Consequences:** New targets can be deleted without review, ownership changes are missed, a no-op
receipt falsely claims a gate passed, or a previously safe preview becomes destructive.

**Warning signs:**

- Apply accepts `approved=True` without a preview hash.
- Preview serialization is nondeterministic or omits exclusions and expected hashes.
- The repository real path, source pin, manifest bytes, ownership graph, or capability state is
  absent from the approval-bound digest.
- Apply regenerates or reorders effects instead of consuming the approved canonical plan.
- Changed inputs yield a warning but execution continues.

**Prevention:**

- Canonically serialize the complete ordered effect plan and all frozen inputs, then hash it.
- Require a fresh explicit approval of that hash.
- Re-run drift and ownership checks immediately before applying; any difference invalidates
  approval and requires a new preview.
- Put zero-effect finalization through the same binding and receipt path.

**Phase owner:** Finalize phase; the same binding pattern is also required for migration.

### 7. Writing journal or receipt state that is more certain than the filesystem

**Handles:** `HARD-R4`, `HARD-R5`

**What goes wrong:** A record is marked complete before the effect is observed, the record is
written only after the effect, a crash window is collapsed into failure, or corrupt evidence is
“repaired” by inference.

**Why it happens:** Happy-path transaction thinking is applied to non-transactional filesystem and
Git effects.

**Consequences:** Resume may double-apply an effect, skip an incomplete effect, delete the wrong
artifact, or publish a receipt that falsely proves completion.

**Warning signs:**

- There is no persisted pending checkpoint before the first side effect.
- One exception handler labels every remaining effect failed.
- `unknown` is never produced by fault injection.
- Resume trusts journal status without checking the current object.
- Cleanup removes a checkpoint or staging file needed to determine what happened.
- Effect status adds an unsupported value rather than preserving the schema distinction between
  record state and effect state.

**Prevention:**

- Persist and validate the operation/checkpoint identity before effects begin.
- Record effects in dependency order and observe the real postcondition before marking completion.
- On interruption or ambiguous replacement, preserve evidence and mark the smallest uncertain
  scope `unknown`.
- Build a new resume preview from journal plus current state; do not retry, roll back, route-switch,
  or repair automatically.

**Phase owner:** Recovery phase, reused by finalize.

### 8. Manufacturing false verification confidence

**Handles:** `HARD-R6` and the handle exercised by each test

**What goes wrong:** Static skill-token checks are reported as actual host execution; fake runners
are reported as real OpenSpec/GSD compatibility; a skipped optional smoke is counted as passed; or
several tests repeat one easy failure while a cross-component public seam remains untested.

**Why it happens:** Test count and broad labels are mistaken for independent evidence.

**Consequences:** Roadmap gates close while generic prompt injection, real mutation, route
postconditions, stale approval, ownership races, or partial-failure recovery remain unverified.

**Warning signs:**

- Evidence names say “integration” but all filesystem/tool boundaries are mocked.
- A generated fixture is compared only with the serializer that generated it.
- `task check` is the only recorded evidence for multiple lifecycle risks.
- Optional tool absence silently converts a smoke to pass.
- Private helper tests replace the documented public seam tests.
- The same failure/seam/risk is repeated across property, fixture, integration, and smoke layers
  without covering a new boundary.

**Prevention:**

- Use property tests only for allocator, normalizer, manifest round-trip, ownership graph, and
  preview builder.
- Use fixed examples for mapping and drift classification.
- Use isolated real filesystem/Git integration for ownership, recovery, and finalize.
- Keep actual OpenSpec/GSD and generic-agent execution opt-in; report unavailable or skipped checks
  as unverified with a reason.
- Map each evidence item to a concrete public seam and the exact failure it falsifies.
- Prefer one strong test at the nearest boundary over duplicate low-value evidence.

**Phase owner:** Verification work in every phase, consolidated at final verification gates.

## Moderate Pitfalls

### 9. Revalidating paths but leaving a mutation-time race

**Handles:** `HARD-R3`, `HARD-R5`

**What goes wrong:** A path is resolved safely during preview, then a parent or target is replaced
with a symlink before the effect.

**Prevention:** Re-check the repository-root relationship and alias identity at the write boundary;
where practical, use descriptor-relative operations and no-follow semantics. Stop on identity
change instead of following the replacement.

**Phase owner:** Ownership phase for the reusable path primitive; finalize phase for effect use.

### 10. Making lifecycle state depend on untracked local files

**Handles:** `HARD-R3`, `HARD-R4`

**What goes wrong:** A prepared manifest, checkpoint, receipt, or phase artifact is treated as
durable resume state before repository ownership and tracking are established.

**Prevention:** Distinguish “locally present” from “repository-owned and reviewable.” Do not delete
the only local record, and do not claim interruption-safe resume until the planned tracking step is
complete. The current untracked prepared manifest is a concrete warning sign, not a reason for
automatic repair or commit.

**Phase owner:** Ownership phase, with an initialization prerequisite before implementation phases.

### 11. Duplicating canonical authority into GSD or lifecycle records

**Handles:** `HARD-R1`, `HARD-R2`

**What goes wrong:** Requirement prose, scenarios, or acceptance criteria are copied into mappings,
phase docs, receipts, or a new policy registry and later drift independently.

**Prevention:** Store identifiers, canonical paths, section hashes, source pins, and evidence links
only. If implementation discovers a specification decision, stop and update the OpenSpec source
before replanning.

**Phase owner:** Mapping phase; drift phase detects later duplication-related divergence.

### 12. Making normal CI depend on optional tool installation

**Handles:** `HARD-R6`

**What goes wrong:** Normal tests invoke real OpenSpec/GSD commands, depend on a private home, or
change results based on tool presence, clock, locale, or network access.

**Prevention:** Keep deterministic fixtures and injected system boundaries in normal CI. Isolate
real-tool checks behind an explicit opt-in task and retain an explicit unverified list.

**Phase owner:** Verification gates.

### 13. Truncating large inputs and still returning a usable partial result

**Handles:** `HARD-R1`–`HARD-R6`

**What goes wrong:** Oversized manifests, mappings, ownership scans, journals, previews, or evidence
are clipped to fit bounds and the prefix is treated as complete.

**Prevention:** Use limit-plus-one reads and explicit collection limits. Any exceeded bound must
invalidate the whole result; never authorize an operation from a prefix graph or truncated preview.

**Phase owner:** The phase introducing each bounded value; shared bounded-I/O utilities should be
established during migration.

### 14. Allowing nondeterminism into serialized identities

**Handles:** `HARD-R1`, `HARD-R2`, `HARD-R5`

**What goes wrong:** Hashes vary with dictionary insertion order, filesystem enumeration, locale,
line endings, timestamps, or platform path rendering.

**Prevention:** Define canonical ordering and serialization once; use POSIX repository-relative
logical paths in records while separately validating real paths for safety; exclude timestamps from
identity; test shuffled input and repeated serialization.

**Phase owner:** Migration for serialization, ownership for graph ordering, finalize for preview.

### 15. Reusing operation IDs or receipts across different inputs

**Handles:** `HARD-R4`, `HARD-R5`

**What goes wrong:** Operation identity is based only on an action name, timestamp, or target path,
so a later run attaches to an older checkpoint or receipt.

**Prevention:** Bind operation identity to the change, operation kind, approved input/preview hash,
and repository/source state. Reject collisions rather than merging records.

**Phase owner:** Recovery phase.

### 16. Advancing from `prepared` based on circumstantial evidence

**Handles:** `HARD-R2`, `HARD-R4`, `HARD-R6`

**What goes wrong:** The presence of `.planning/PROJECT.md`, a completion marker, or partial host
output is treated as sufficient to mark the handoff started.

**Prevention:** Keep `prepared` until the existing structured acceptance and route-specific
read-only postcondition are both proven. Generic-agent workaround evidence must remain labelled as
such and must not be upgraded to typed-dispatch equivalence.

**Phase owner:** Pre-phase lifecycle prerequisite; drift/recovery must preserve the distinction.

### 17. Mixing another change or PR into a phase

**Handles:** `HARD-R1`, `HARD-R3`

**What goes wrong:** A phase, plan, mapping, ownership declaration, or evidence path includes PR #42
or another active change.

**Prevention:** Validate change identity across phase paths, mapping entries, owned artifacts, and
evidence. Report foreign items as a blocking scope conflict; do not move or repair them.

**Phase owner:** Mapping and ownership phases.

## Phase-Specific Warnings

| Phase topic | Highest-risk mistake | Required implementation discipline | Primary evidence |
|---|---|---|---|
| Stable identity / migration | Corrupting v1 or reusing identity | Version-discriminated exact schemas, immutable preview, staged validated replace, monotonic IDs, tombstones | v1 golden fixture, v2 round-trip property, migration fault examples |
| Mapping | Treating shape validity as coverage | Whole-graph validation for identity, one-change ownership, complete coverage, real evidence paths | Fixed positive/negative mapping fixtures |
| Drift | Partial inspection returns green | One public preflight matrix; `unknown` stops; narrow checkbox normalization | Normalizer property plus drift matrix examples |
| Ownership | Current manifest authorizes deletion | Bounded repository-wide graph, owner/reference separation, real-path alias rejection | Ownership property plus filesystem/Git integration |
| Recovery | Journal claims more certainty than reality | Write-ahead checkpoint, observed postconditions, preserved `unknown`, new preview for resume | Fault-injected filesystem integration |
| Finalize | Old approval executes a new plan | Canonical complete preview, approval hash, immediate drift/ownership recheck, ordered effects, receipt | Preview property plus stale/partial-failure integration |
| Final verification | Test labels exceed what was exercised | Public seams, source grounding, no duplicate evidence, optional smoke isolated and honestly reported | Concrete node IDs / fixture paths / execution results |

## Evidence-Economy Rules

Use these rules to avoid both coverage gaps and low-value duplication:

1. Assign one primary evidence layer to each failure:
   - pure property for invariant-heavy deterministic cores;
   - fixed example for classification and mapping;
   - isolated integration for filesystem/Git state transitions;
   - opt-in smoke only for real optional tools or host behavior.
2. Add a second layer only when it crosses a genuinely different boundary.
3. Do not count a test path as evidence without the executed node/result or an explicit unverified
   reason.
4. Keep generic-agent workaround, actual host prompt execution, real GSD mutation, and
   route-specific postconditions unverified unless they were exercised directly.
5. Keep OpenSpec final validation independent from GSD phase verification; neither substitutes for
   the other.

## Roadmap Implications

- Preserve the dependency order already selected: migration/identity → mapping → drift → ownership
  → recovery → finalize. Reordering makes later gates rely on identities or graphs that are not yet
  trustworthy.
- Treat source grounding, bounds, canonical serialization, and structured `unknown` as shared
  primitives established early and reused, not reimplemented independently per phase.
- Do not begin mutation-capable lifecycle work by broadening the existing v1 parser. The safest
  first deliverable is a read-only v1/v2 discriminator and migration preview with failure fixtures.
- Make the final verification phase an evidence audit, not a test-count exercise: replace planned
  evidence handles with concrete public-seam results and leave optional smoke unverified when it was
  not run.

## Sources

- `.planning/PROJECT.md`
- `.planning/openspec/harden-openspec-gsd-handoff-lifecycle/handoff-brief.md`
- `.planning/openspec/harden-openspec-gsd-handoff-lifecycle/handoff.json`
- `openspec/changes/harden-openspec-gsd-handoff-lifecycle/design.md` at research baseline
  source `7e4c3ac5d6fc7f75716794ff1b805d9c1d6381bd`
- current Phase 1 planning authority:
  `2cbb127917feaa637ef5eac439478227ac5f717b`
- `openspec/changes/harden-openspec-gsd-handoff-lifecycle/tasks.md`
- `src/ai_coding_template_ja/openspec_gsd_handoff/`
- `tests/test_handoff_*.py`
- `tests/test_execute_openspec_change_skill.py`
- `tests/fixtures/openspec_gsd_handoff/`
