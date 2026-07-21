# Phase 2: Source-to-Execution Mapping Corrective Plan - Pattern Map

**Mapped:** 2026-07-22
**Authority:** `4d8b5b173927ed518d39dee18a29b0271628afbd`
**Files analyzed:** 6 corrective test/fixture/evidence artifacts
**Analogs found:** 6 / 6

## Corrective Scope

This is a corrective addition after completed Plans 02-01 through 02-04. The canonical
repin defines readiness as a point-in-time observation, not an atomic filesystem snapshot
or lease. The current production implementation may provide stronger per-observation
checks, but this corrective plan must not strengthen the public contract again or redesign
the readiness algorithm.

The current focused signal is already exact:

```text
uv run pytest tests/test_handoff_manifest_refresh.py -q
2 failed, 34 passed
```

The failures are limited to the stale tracked preview and stale expected source fingerprint.
No production failure was observed.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `tests/test_handoff_manifest_refresh.py` | integration test / evidence producer | bounded file-I/O + deterministic transform | same file, repository-root preview test | exact self-analog |
| `tests/fixtures/openspec_gsd_handoff/manifest/expected-refresh-preview.json` | independent golden fixture | deterministic transform snapshot | current fixture + `expected-migrated-v2.json` golden convention | exact role match |
| `.planning/phases/02-source-to-execution-mapping/02-REFRESH-PREVIEW.json` | tracked read-only evidence | bounded file-I/O + deterministic transform | `_repository_root_evidence()` in `test_handoff_manifest_refresh.py` | exact producer analog |
| `.planning/phases/02-source-to-execution-mapping/02-VALIDATION.md` | validation plan/evidence catalog | batch verification | existing Phase 2 validation strategy | exact self-analog |
| `.planning/phases/02-source-to-execution-mapping/02-REVIEW.md` | independent review report | batch analysis | `01-REVIEW.md` and current Phase 2 report shape | exact role match |
| `.planning/phases/02-source-to-execution-mapping/02-VERIFICATION.md` | independent verification report | batch verification | `01-VERIFICATION.md` | exact role match |

## Pattern Assignments

### `tests/test_handoff_manifest_refresh.py` (integration test/evidence producer)

**Analog:** the existing repository-root and fixed-candidate tests in the same file.

**Pinned input pattern** (`tests/test_handoff_manifest_refresh.py:46-72`):

```python
REPOSITORY_ROOT = Path(__file__).parents[1]
CHANGE_ID = "harden-openspec-gsd-handoff-lifecycle"
...
SOURCE_COMMIT = "fbe7f714f734d714480583ab90f41ec0d2077f50"
TRACKED_HANDOFF_SHA256 = (
    "554690a1eee6e632eaf7c4fce3517cba69ff38eb8a06a1873b7a5e6822e59914"
)
...
EXPECTED = json.loads(
    (... / "expected-refresh-preview.json").read_text(encoding="utf-8")
)
```

Change only `SOURCE_COMMIT` to the current authority. Keep the tracked handoff preimage
hash unchanged. Do not replace the canonical source pin with `HEAD` or infer it from Git.

**Read-only evidence producer** (`tests/test_handoff_manifest_refresh.py:283-344`):

```python
operations = MutationRecordingRefreshOperations()
result = _preview(REPOSITORY_ROOT, operations=operations)

assert isinstance(result, Success)
assert operations.mutations == []
preview = result.value
machine = serialize_manifest_refresh_preview(preview)
...
evidence = {
    "generation_mode": "read-only-preview-only",
    "apply_invoked": False,
    "mutation_operations": operations.mutations,
    "preview_sha256": preview.preview_sha256,
    ...
}
return _compact_json(evidence)
```

Reuse this helper unchanged to derive the new tracked evidence. It calls
`preview_manifest_refresh` only and records an empty mutation list. Do not add an apply
call, staging helper, approval flag, or target writer to the repository-root path.

**Byte-invariance and strict evidence assertions**
(`tests/test_handoff_manifest_refresh.py:347-406`):

```python
evidence_bytes = _repository_root_evidence()
tracked_evidence = (REPOSITORY_ROOT / REFRESH_EVIDENCE_PATH).read_bytes()

assert tracked_evidence == evidence_bytes
...
assert evidence["generation_mode"] == "read-only-preview-only"
assert evidence["apply_invoked"] is False
assert evidence["mutation_operations"] == []
...
assert target.read_bytes() == target_before
assert tasks.read_bytes() == tasks_before
assert not tuple(target.parent.glob(".handoff.*.tmp"))
```

Retain these as the publication safety gate. The corrective GREEN is not just updated
hashes; it must still prove target/tasks byte invariance and absence of staging files.

**Independent fixed-candidate assertions**
(`tests/test_handoff_manifest_refresh.py:409-457`):

```python
assert [
    change.source_id for change in preview.changes if change.kind == "updated"
] == EXPECTED["updated"]
for source_id, fingerprints in EXPECTED["updated_fingerprints"].items():
    change = next(item for item in preview.changes if item.source_id == source_id)
    assert [change.previous_fingerprint, change.candidate_fingerprint] == fingerprints
...
assert preview.candidate_sha256 == EXPECTED["candidate_sha256"]
assert json.loads(preview.candidate_bytes) == EXPECTED["candidate_manifest"]
assert preview.candidate_bytes.decode() == EXPECTED["candidate_bytes_utf8"]
assert target.read_bytes() == before
```

Keep the literal golden comparison. Do not weaken it to dynamically generated expected
values or delete the fingerprint assertion to make the repin green.

---

### `expected-refresh-preview.json` (independent golden fixture)

**Analog:** its current exact structure at lines 1-54 and the independent-golden convention
documented by `01-PATTERNS.md:355-367`.

**Fixture header pattern** (`expected-refresh-preview.json:1-27`):

```json
{
  "old_target_sha256": "554690a1eee6e632eaf7c4fce3517cba69ff38eb8a06a1873b7a5e6822e59914",
  "created": ["SCN-000037", "SCN-000038", "SCN-000039", "SCN-000040", "SCN-000041", "SCN-000042", "SCN-000043"],
  "updated": ["REQ-000001", "SCN-000018"],
  "updated_fingerprints": {
    "REQ-000001": ["<old>", "<current-pin>"],
    "SCN-000018": ["<old>", "<current-pin>"]
  },
  "candidate_sha256": "<current-pin-candidate>"
}
```

Update the complete approval-relevant snapshot consistently: design/spec artifact hashes,
source commit, changed fingerprints, candidate value, candidate bytes, and candidate hash.
Preserve the exact `42 -> 49`, seven-created, two-updated, zero-tombstone reconciliation
and the 49-entry mapping baseline. Do not modify the assignment fixture merely because the
source content fingerprint changed; stable IDs and their phase assignments did not change.

The golden remains independently reviewable. Production serialization may be used to
obtain a candidate for comparison, but the checked-in expected object/bytes must be reviewed
as literals and then proved equal by the existing test.

---

### `02-REFRESH-PREVIEW.json` (tracked read-only evidence)

**Analog:** `tests/test_handoff_manifest_refresh.py::_repository_root_evidence` and Plan
02-04's evidence task (`02-04-PLAN.md:117-128`).

**Generation contract** (`02-04-PLAN.md:119-124`):

```text
GREEN: the exact serialized preview is written to 02-REFRESH-PREVIEW.json
GREEN: tracked target and tasks are unchanged and no staging file exists
GREEN: no call to apply_manifest_refresh occurs for the tracked target
Stop unconditionally after preview evidence and focused/full verification
```

Generate a brand-new complete file after the test constant and golden are repinned. Never
patch selected hashes into the old one-line evidence: its embedded artifacts, source state,
candidate bytes, candidate hash, and preview hash are one approval-bound unit.

The current-tree read-only observation made during mapping produced the following useful
cross-checks. Regenerate and recheck them during execution rather than treating this table as
write input:

| Field | Observed current-pin value |
|---|---|
| source commit | `4d8b5b173927ed518d39dee18a29b0271628afbd` |
| design SHA-256 | `3561792edfe750f5815fad72ff2e133888848b2733e770e2b6f66f87c413e783` |
| spec SHA-256 | `7d076d2a946a8e8f3346f48ae80d4fbeb8ae0fb9ea6d20ccf19e01847edfd784` |
| `REQ-000001` new fingerprint | `01f6b1f8dd9985a6f6fac5648358e3e7d01bd26da56a592d610cbb9ca51505bc` |
| `SCN-000018` new fingerprint | `46843242f7ab1f230919ca8ff5915859cd6aee9e243714ec63d3aa9ae4a2c025` |
| candidate SHA-256 | `6cc9bcf4caa3f9f839742f6d86660a8039c2370cf5cf7d054ba04199e3775fc5` |
| preview SHA-256 | `90b52efd98d6718796548151ea9c808dfd1e14484bcacd2f847b09ea71054bea` |
| complete evidence SHA-256 | `661b63be39bacb882c53ade5e9919ae7fea661f852b7e47fb53188a29348138a` |

That observation had `apply_invoked=false`, `mutation_operations=[]`, empty staging before
and after, tracked target SHA unchanged at `554690...`, tasks SHA unchanged at `cf4a9d...`,
reconciliation `42/49/7/2/0`, counters `7/44`, and mapping coverage `49/49`.

---

### `02-VALIDATION.md` (corrective validation evidence)

**Analog:** current Phase 2 validation strategy at lines 10-33.

```markdown
| explicit planning inventory and mapping readiness | operation-horizon examples | change-specific 49-ID fixture |
| started-v2 refresh preview | fixed preview fixtures | preview-builder invariants only |
...
- The tracked handoff manifest remains byte-identical until its real preview receives a
  separate explicit approval.
```

Retain the public seams and property-test limits. Add the corrective evidence explicitly:

- readiness is a point-in-time observation, not an atomic snapshot or lease;
- failures detected at an owned observation remain non-ready;
- consumers rerun mapping readiness and Phase 3 drift/preflight immediately before use;
- the two stale-fixture failures go RED to GREEN without production changes;
- the refreshed tracked preview remains read-only and approval remains ungranted.

Do not convert the historical CR-01 atomic-snapshot expectation into a new test requirement.

---

### `02-REVIEW.md` (fresh independent review report)

**Analog:** `01-REVIEW.md:1-37` for frontmatter, reviewed file inventory, fresh canonical
comparison, and finding counts.

```markdown
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
...
指定ファイルを、AGENTS.md、OpenSpec change、Phase の PLAN / SUMMARY / VALIDATION と
fresh に照合した。
```

Replace/update Phase 2 review only by running a fresh review after corrective verification.
The review must cite authority `4d8b5b1...` and evaluate the current readiness implementation
against point-in-time semantics. The old report's demand for a whole-operation atomic
filesystem snapshot is no longer the canonical requirement and must not remain an open
blocker. Do not erase the fact that the previous report was produced under an earlier
contract; the corrective summary can preserve that history.

The fresh review must also confirm no production/API/CLI expansion, no tracked apply, no
assignment drift, and exact refreshed fixture/evidence consistency.

---

### `02-VERIFICATION.md` (fresh independent verification report)

**Analog:** `01-VERIFICATION.md:1-30`, `32-57`, `59-85`, and `117-136`.

```markdown
status: passed
score: 4/4 must-haves verified
...
## Goal Achievement
### Observable Truths
| ROADMAP success criterion | Status | Independent evidence |
...
### Required Artifacts
...
### Behavioral Spot-Checks
...
### Automated Validation
...
## Unverified Operator Boundary
```

Create the Phase 2 report through the independent verifier after the corrective plan and
fresh review are green. Verify goal-backward from the repinned ROADMAP/context, not from the
historical 02-01..04 source pins. Include named evidence for all four readiness horizons,
current policy anchors, exact reconciliation, the refreshed read-only preview, Phase 1
regressions, OpenSpec strict validation, and `task check`.

Keep the actual tracked refresh apply in **Unverified Operator Boundary**. A generated
preview is not approval. The report must say that a later, distinct user approval naming the
fresh exact preview hash is still required before any apply.

## Shared Patterns

### Point-in-time readiness, not atomic snapshot

**Sources:** canonical design at the authority commit; current
`execution_mapping.py:919-1017`.

The implementation observes bounded declared paths and returns one complete readiness result:

```python
for observation in observations:
    issue = _revalidate_declared_path_observation(observation)
    if issue is not None:
        issues.append(issue)
...
return Success(
    MappingReadiness(
        operation=operation,
        target_phase_id=target_phase_id,
        ready=not issues,
        issues=issues,
    )
)
```

Preserve this production surface. The corrected contract does not promise that earlier paths
remain unchanged after their final observation. Safety across time comes from consumer reruns
and mutation-seam state guards, not a new snapshot/lease abstraction.

### Fresh approval is a separate boundary

**Sources:** `test_handoff_manifest_refresh.py:704-742`, `02-04-PLAN.md:117-128`.

```python
rejected_inputs = (
    (preview, preview.preview_sha256, False, RefreshFailurePoint.APPROVAL),
    (preview, "0" * 64, True, RefreshFailurePoint.APPROVAL),
    ...
)
...
assert operations.mutations == []
assert target.read_bytes() == before
```

The corrective plan generates/displays evidence and stops. It must not reuse any old approval
or call `apply_manifest_refresh` for the tracked target.

### Complete derived evidence, never selective hash patching

**Sources:** `manifest_refresh.py:650-721`,
`test_handoff_manifest_refresh.py:283-344`.

Source commit, current artifact hashes, progress, source identities, mappings, candidate bytes,
candidate hash, protected subtrees, and preview hash form one deterministic unit. Rebuild and
strictly compare the complete unit when canonical inputs change.

### Validation order

1. Run the focused two-failure signal before edits.
2. Repin the test constant and complete independent golden.
3. Run the fixed candidate test.
4. Regenerate the complete tracked preview through the read-only helper only.
5. Run the repository-root byte-invariance test and the full Phase 2 focused suite.
6. Run Phase 1/v1 regressions, OpenSpec validation, and `task check`.
7. Obtain a fresh Phase 2 code review and independent verification.
8. Stop without tracked apply or OpenSpec task 2.2 mutation unless a later workflow explicitly
   owns that boundary.

## Protected / No-Change Surfaces

| File or surface | Reason |
|---|---|
| `src/ai_coding_template_ja/openspec_gsd_handoff/execution_mapping.py` | Current implementation is compatible with the clarified point-in-time contract; no production defect is established by the stale review. |
| `src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py` | Existing preview/apply seams already produce the required fresh derived evidence and approval guards. |
| `tests/fixtures/openspec_gsd_handoff/mapping/hardening-phase-assignments.json` | Stable IDs and 49 phase assignments did not change. |
| `docs/agents/adaptive-change-execution.references.json` | Current-tree policy anchors did not change. |
| `.planning/openspec/harden-openspec-gsd-handoff-lifecycle/handoff.json` | Historical started-v2 target must remain byte-identical until a separately approved apply. |
| Canonical OpenSpec artifacts and `tasks.md` | They are source authority/input; this corrective plan consumes but does not rewrite or check off them. |
| Plans/Summaries `02-01` through `02-04` | Historical execution evidence; research explicitly says not to rewrite them for the repin. |

## No Analog Found

None. This correction reuses existing Phase 2 preview/golden seams and Phase 1 review/
verification report shapes; it does not introduce a new runtime role or data flow.

## Metadata

**Analog search scope:** `.planning/phases/01-*`, `.planning/phases/02-*`,
`src/ai_coding_template_ja/openspec_gsd_handoff/`, `tests/test_handoff_manifest_refresh.py`,
`tests/fixtures/openspec_gsd_handoff/manifest/`
**Strong analogs retained:** 4 families
**Pattern extraction date:** 2026-07-22
