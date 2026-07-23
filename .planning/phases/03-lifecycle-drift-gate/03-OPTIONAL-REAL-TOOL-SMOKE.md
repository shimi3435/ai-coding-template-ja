# Phase 03 Optional Real-Tool Smoke Status

- mode: `opt-in`
- status: `not-run`
- reason_code: `opt-in-not-requested`
- required tools: OpenSpec `1.3.1`, GSD `1.5.0`
- command contract: `task openspec:gsd-handoff:smoke CHANGE_ID=harden-openspec-gsd-handoff-lifecycle GSD_HOME=/path/to/gsd`
- normal CI: excluded from `task check`
- isolation proof: `tests/test_taskfile.py::test_handoff_smoke_is_explicit_and_isolated_from_normal_check`

This autonomous plan did not receive a separate user-originated opt-in request, so the
real OpenSpec/GSD/host smoke was not executed. This status is not lifecycle-gate evidence
and is intentionally separate from `03-LIFECYCLE-EVIDENCE.json`.
