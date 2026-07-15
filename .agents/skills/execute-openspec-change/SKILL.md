---
name: execute-openspec-change
description: Preview and explicitly approve a source-pinned OpenSpec change before preparing its handoff manifest and dispatching the selected GSD 1.5.0 entrypoint.
---

# Execute OpenSpec Change

Use this first-party skill only to orchestrate the handoff start. OpenSpec remains
the specification and final-completion authority. The three Phase 1 public operations own discovery,
preflight, persistence, and state transitions; do not reimplement those rules here.
Consume their structured values and classified codes, never display prose or exit 0
alone.

Follow the stages below in order. Nothing before approval may mutate the repository,
create a handoff brief, dispatch GSD, or change manifest state.

## Stage: capture-input

Resolve the repository and capture the invocation inputs. Freeze one immutable tuple
named `preview_tuple` containing:

- `repository_real_path`
- `change_id`
- `source_commit`
- `gsd_home`
- `repository_policy`
- `host_evidence`
- `completed_gates`
- `unresolved_items`
- `canonical_paths`

Do not silently default, normalize, or replace a frozen value after this point.

## Stage: inspect-host

Inspect the visible runtime `spawn_agent` schema as read-only evidence. Record the
resolved `host_spawn_schema`, available dispatch fields, and whether a generic route
would be a `generic_degradation`. Host evidence must come from the visible runtime;
do not infer it from a local executable or GSD probe.

## Stage: inspect-bridge

Call the Phase 1 public `inspect_handoff` operation exactly once with the frozen
repository, change, source, GSD home, repository-policy, and host values. This call is
read-only. Require a structured success value; exit 0 or human-readable output is not
success evidence.

On structured failure, report the classified category, code, and known state as
`classified-gaps`, add `manual-handoff-guidance` using the canonical OpenSpec paths,
and stop.

## Stage: resolve-dispatch

Resolve dispatch using the inspected host schema and the bridge-selected GSD
entrypoint. Record `host_dispatch` and any `generic_degradation`. Unknown or
inconsistent evidence stops before preview approval.

For a generic host, finish this whole preflight before preview, approval, or prepare:

1. Require the installed local GSD version to be exactly 1.5.0. Resolve the selected
   entrypoint SKILL and read it completely.
2. Resolve the SKILL's concrete workflow under the frozen arguments and configuration.
   Follow its routing and referenced workflow files, then enumerate every reachable
   `Task(...)` or `Agent(...)` spawn name and every isolation argument. Do not rely on
   an available-agent summary or an unselected branch.
3. Resolve `ACTIVE_CONFIG_ROOT` in this explicit priority order: `CODEX_HOME`,
   `--config-dir`, `project-local-.codex`, then `default-global-config`.
4. Map each reachable spawn name to
   `${ACTIVE_CONFIG_ROOT}/agents/<spawn-name>.toml`, read the complete TOML, and retain
   the complete developer instructions as the role preamble. This is
   `complete-role-preamble-for-each-spawn`; a prefix, summary, or `.md` substitute is
   insufficient.
5. Verify `every-isolation-requirement` against the visible generic spawn schema before
   authorizing the workaround.

For the frozen uninitialized route, resolve these exact local files:

- `${ACTIVE_CONFIG_ROOT}/skills/gsd-new-project/SKILL.md`
- `${ACTIVE_CONFIG_ROOT}/gsd-core/workflows/new-project.md`

With `$gsd-new-project --auto @${HANDOFF_BRIEF}`, the resolved reachable spawn names
are `gsd-project-researcher`, `gsd-research-synthesizer`, and `gsd-roadmapper`.
Map and completely read the active TOML for each name.

For the frozen initialized route, resolve these exact local files:

- `${ACTIVE_CONFIG_ROOT}/skills/gsd-phase/SKILL.md`
- `${ACTIVE_CONFIG_ROOT}/gsd-core/workflows/add-phase.md`

With `$gsd-phase ${INLINE_PARITY_PAYLOAD}`, the resolved add-phase branch has no
reachable spawn. Still inspect the complete workflow for isolation or dynamically
referenced branches; do not infer absence from the current summary.

Fail closed on any of: `unknown-reachability`, `unknown-toml-mapping`,
`incomplete-role-preamble`, `unknown-isolation`, `typed-only-requirement`,
`worktree-isolated-requirement`, or `incompatible-isolation`. Stop before approval or
prepare and report the missing evidence. Otherwise inject each complete role preamble
into its corresponding generic spawn and label every dispatch, result, and report
`generic-agent workaround`. This route is **not equivalent to typed dispatch**.

## Stage: preview

Display one complete approval preview containing these labelled fields:

- `change_id`
- `canonical_paths`, including every bridge artifact in its sorted order
- `input_route`, shown only as its exact `json` or `markdown-fallback` label/state
- `source_commit`
- `manifest_path`, derived as
  `.planning/openspec/<change_id>/handoff.json`
- `openspec_capability`
- `gsd_capability`
- `gsd_project_initialized`
- `gsd_entrypoint`
- `repository_policy`
- `host_spawn_schema`
- `host_dispatch`
- `generic_degradation`

The Phase 1 seam exposes no reason for selection of `markdown-fallback`; do not invent
one. Ensure displayed canonical paths and all other displayed inputs are the exact
values held in `preview_tuple`.

## Stage: approve

After the whole preview is visible, request a **fresh explicit answer** from the user.
Only an unambiguous affirmative answer to this preview authorizes later preparation.
The following are forbidden substitutes:

- `prior-approval`
- `default-answer`
- `automatic-mode`
- `cli-flag`
- `tool-presence`

Treat `inspect-failure`, `refusal`, and `no-answer` as terminal outcomes with **zero mutable stages**.
In each case stop before `prepare`, `brief-create`, `gsd-dispatch`,
or `mark-started`; report `classified-gaps` where present and
`manual-handoff-guidance`. Never reinterpret silence as approval.

## Stage: prepare

After fresh approval only, replay `preview_tuple` unchanged to the Phase 1 public
`prepare_handoff` operation with `approved=True`. Require one **structured prepared success**
with all of the following values before continuing:

- `ok` is exactly `true`
- `operation` is exactly `prepare`
- `known_state` is exactly `prepared`

Do not branch on exit 0 or prose. Any classified or persistence failure stops with
the returned known state. No GSD entrypoint is reachable until this entire gate
passes.

Construct exactly one immutable object named `PARITY_PAYLOAD` from the frozen and
prepared values. It contains these fields once, without copied specification text:

1. `change_id`
2. `canonical_paths` with every sorted canonical artifact path
3. `source_commit`
4. `completed_boundary_gates`
5. `unresolved_items`
6. `one_phase_one_change`, constraining this phase to this change only
7. `specification_nonduplication`, stating that GSD must reference the canonical
   OpenSpec paths and source commit without copying or redefining specifications or
   acceptance criteria

## Stage: dispatch

Select only the route already reported by the structured prepared value:

- When GSD is uninitialized, render the complete `PARITY_PAYLOAD` deterministically
  into one source-pinned idea document, then invoke
  `$gsd-new-project --auto @<brief>`. The brief contains no independently authored
  requirement or acceptance text.
- When GSD is initialized, pass the complete `PARITY_PAYLOAD` inline to one
  change-specific `$gsd-phase`. Do not summarize, rename, omit, or add payload fields.
  Immediately before dispatch, capture one read-only snapshot containing
  `maximum-integer-phase`, `phase-directories`, and `roadmap`.

If the project, roadmap, and state signals show partial initialization, stop before
either entrypoint. Do not repair initialization, choose another route, or dispatch a
partial payload.

## Stage: accept

GSD is accepted only when both independent terms are true: a **structured completed-success**
from the resolved host workflow and the complete **route-specific read-only postcondition**
below. Exit 0 and a prose completion marker is supplemental only. Never accept a
result by searching human-readable text.

Treat each of these rows as not accepted: `marker-only`, `checkpoint`, `empty`,
`malformed`, `partial`, `ambiguous`, `dispatch-failure`, and
`postcondition-mismatch`. For every such row retain `prepared`, do not call the
started transition, and perform neither automatic retry nor route switch.

### Uninitialized route postcondition

After structured completion, rerun this read-only probe:

```text
node ${GSD_HOME}/gsd-core/bin/gsd-tools.cjs init progress --raw
```

Require structured probe evidence with `project_exists=true`, `roadmap_exists=true`,
`state_exists=true`, `project_root` equal to the frozen repository real path,
`agents_installed=true`, and `missing_agents=[]`. Also require all four files:

- `.planning/PROJECT.md`
- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`

Read those files without mutation. Their collective evidence must preserve
`exact-change-id`, `exact-source-commit`,
`all-canonical-paths-or-exact-brief-reference`, `completed-boundary-gates`,
`unresolved-items`, `one-phase-one-change`, and `specification-nonduplication`.
Missing, conflicting, or merely probable evidence fails the postcondition.

### Initialized route postcondition

After structured completion, take the same read-only phase and roadmap snapshot.
Compare it to the pre-dispatch `maximum-integer-phase`, `phase-directories`, and
`roadmap` values. Require all of these facts:

- `exactly-one-new-max-plus-one-phase`
- `matching-new-phase-directory`
- `no-other-phase-or-directory-change`
- `new-roadmap-section-equals-inline-parity-payload`

The new roadmap section must contain the exact inline `PARITY_PAYLOAD`; selected
keywords or a prose summary are insufficient.

## Stage: mark-started

Only after conservative acceptance call the Phase 1 public
`mark_handoff_started` operation with `gsd_accepted=True`. Require its structured
success and `known_state=started`. If the acceptance predicate is false, this stage
is unreachable and the manifest remains prepared.

## Stage: report

After any prepared manifest success, always report `manifest-path` and `source-commit`
and state `operator-makes-distinct-later-tracking-commit`. The operator creates that
tracking commit after reviewing the manifest; this skill must never execute a Git commit.

If dispatch is not accepted, also report `completed-operations`, `failure-point`,
`prepared-state`, and `manual-continuation-evidence` sufficient to reconstruct the
same frozen manual handoff. Do not perform or promise `retry`, `rollback`,
`route-switch`, `finalize`, `cleanup`, `push`, `pull-request`, or `merge`.

## Evidence limits

Normal CI verifies static SKILL/fixture instruction consistency and existing Phase 1
dynamic state seams only. It does not execute actual host prompts, spawn generic
agents, mutate a real GSD project, or observe either route postcondition. Those
opt-in/manual observations remain unverified until Phase 3.
