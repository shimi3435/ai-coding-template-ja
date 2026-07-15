---
name: execute-openspec-change
description: Preview and explicitly approve a source-pinned OpenSpec change before preparing its handoff manifest and dispatching the selected GSD 1.5.0 entrypoint.
---

# Execute OpenSpec Change

Use this first-party skill only to orchestrate the handoff start. OpenSpec remains
the specification and final-completion authority. The Phase 1 public operations
`inspect_handoff`, `prepare_handoff`, and `mark_handoff_started` own discovery,
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
