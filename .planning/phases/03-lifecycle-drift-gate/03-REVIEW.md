---
phase: 03-lifecycle-drift-gate
reviewed: 2026-07-27T14:05:32Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py
  - tests/test_handoff_lifecycle_drift.py
  - tests/test_handoff_lifecycle_gate.py
  - tests/fixtures/openspec_gsd_handoff/lifecycle/expected-lifecycle-evidence.json
findings:
  critical: 2
  warning: 0
  info: 0
  total: 2
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-07-27T14:05:32Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Gap closure 後の canonical drift classifier、公開 lifecycle gate、回帰テスト、portable evidence を標準深度でレビューした。旧7 findings のうち CR-01、CR-02、CR-03、CR-05、CR-06、CR-07 は対象反例で閉鎖している。旧 CR-04 は top-level payload と artifact member/field については閉鎖したが、同じ complete-observation seam の nested `Progress`、`SourceIdentityState`、changed source ID は未検証のため部分閉鎖である。

既存 lifecycle tests 121件、Ruff、BasedPyright、`task check`（616 tests）は成功した。しかし、追加の public-seam 反例では malformed canonical progress が `clean` と判定された後に identity encoding で `AttributeError`、混在型 changed source IDs が classifier 内で `TypeError`、malformed source/capability commit と planning inventory member が public gate 内で例外終了した。HARD-R2 の「検査を完了できない場合は unknown として停止する」契約を満たさないため、出荷前修正が必要である。

### 旧7 findings の閉鎖状況

| 旧 finding | 状態 | 確認結果 |
|---|---|---|
| CR-01 uninspected host | Closed | `host.inspected is True` を必須化し、drift 比較にも含めている。 |
| CR-02 phase graph validation order | Closed | raw shape/重複検証後だけ normalization を行う。 |
| CR-03 nested ArtifactLimits | Closed | 全 nested field を positive exact integer として事前検証する。 |
| CR-04 malformed canonical observation | Partial | top-level/artifact は閉鎖。progress/source state/changed IDs は未検証。 |
| CR-05 public evidence projection | Closed | artifact paths と progress candidate を公開 decision・identity・evidence に投影する。 |
| CR-06 repository identity | Closed | resolved repository root を identity に bind し、cross-root replay を拒否する。 |
| CR-07 cyclic phase graph | Closed | expected/observed の両方を bounded DAG 検証する。 |

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01 [BLOCKER]: canonical observation の nested state が未検証のまま clean と判定される

**File:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py:208-252`

**Issue:** `_is_complete_observation` は `Progress` と `SourceIdentityState` の outer instance、および `changed_source_item_ids` の tuple container しか確認しない。`Progress.tasks=(None,)` の observation は complete と扱われ、`classify_canonical_source_drift` が `clean` を返す。その値を `gate_lifecycle_operation` に渡すと、`lifecycle_gate.py:815-823` の `_encode_progress` が `task.id` を参照して `AttributeError` になり、unknown decision を返さず gate 全体が落ちる。また `changed_source_item_ids=(1, "REQ-000001")` は `sorted(set(...))` で `TypeError` になる。型注釈付き frozen dataclass を runtime validation とみなしており、旧 CR-04 の根本条件が残っている。

再現結果:

```text
malformed-progress-classifier: clean None
malformed-progress-gate: AttributeError 'NoneType' object has no attribute 'id'
malformed-source-state-classifier: clean None
malformed-changed-ids: TypeError '<' not supported between instances of 'str' and 'int'
```

**Fix:** canonical observation の completeness validator で、比較・sort・identity encoding より前に次を検証する。

```python
def _is_complete_progress(value: object) -> bool:
    return (
        isinstance(value, Progress)
        and type(value.total) is int
        and type(value.complete) is int
        and type(value.remaining) is int
        and type(value.tasks) is tuple
        and all(
            isinstance(task, NormalizedTask)
            and type(task.id) is str
            and type(task.description) is str
            and type(task.done) is bool
            for task in value.tasks
        )
        and value.total == len(value.tasks)
        and value.complete + value.remaining == value.total
    )

if not _is_complete_progress(observation.progress):
    return False
if not validate_source_identity_state(observation.source_items):
    return False
if any(type(source_id) is not str for source_id in observation.changed_source_item_ids):
    return False
```

`SourceIdentityState` は既存 `source_identity.py` の全 counter/member/path/fingerprint/parent invariants を安全な reusable validator として公開または共有し、部分的に複製しないこと。malformed progress task、source-state member、changed-ID member を expected/observed の両側から public classifier/gate に渡し、`canonical-observation-incomplete`、empty evidence、identity `None` を回帰テストで固定する。

### CR-02 [BLOCKER]: boundary observation validator が nested malformed value を検証前に dereference して例外終了する

**File:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py:414-499`

**Issue:** boundary call 自体は `try/except` 内だが、返却値の validator は `try` の外で実行される。`_validate_source_commit` と `_validate_capabilities` は `source_commit` の型確認前に `_COMMIT.fullmatch` を呼ぶため、整数で `TypeError` になる。`_validate_phase_graph` は `PlanningInventory` の outer type だけを確認し、nested collection/member を検証せず `planning_inventory.phases` の各 `phase.phase_id` / `phase.phase_path` を参照するため、`phases=(None,)` で `AttributeError` になる。いずれも外部 inspection の incomplete result を unknown に変換できず、唯一の admission seam を crash させる。

再現結果:

```text
source-commit-type: TypeError expected string or bytes-like object, got 'int'
phase-inventory-member: AttributeError 'NoneType' object has no attribute 'phase_id'
capability-commit-type: TypeError expected string or bytes-like object, got 'int'
```

**Fix:** regex、iteration、属性参照より先に exact scalar/container/member types を検証し、planning inventory は mapping module の一つの安全な authoritative validator を通す。

```python
def _valid_commit(value: object) -> bool:
    return type(value) is str and _COMMIT.fullmatch(value) is not None

# _validate_source_commit / _validate_capabilities
if not _valid_commit(value.source_commit):
    return False

# _validate_phase_graph
inventory_result = validate_planning_inventory(value.planning_inventory)
if isinstance(inventory_result, Failure):
    return False
```

`validate_planning_inventory` 側も member type を `declaration.change_id` 等の属性参照より前に確認し、例外ではなく classified failure を返すこと。source/capability commit の異型、各 inventory collection の非-tuple、`None` member、nested field 異型を public gate に注入し、対応する `lifecycle-*-observation-incomplete`、`admitted=False`、identity `None` を回帰テストで確認する。

## Verification Performed

- `uv run pytest tests/test_handoff_lifecycle_drift.py tests/test_handoff_lifecycle_gate.py -q` — 121 passed
- `uv run ruff check ...` — passed
- `uv run basedpyright ...` — 0 errors, 0 warnings, 0 notes
- `task check` — Ruff format/check、BasedPyright、616 tests passed
- `git diff --check` — passed
- tracked/golden evidence SHA-256 — both `1434c365fd609f5f810e7845b5946fb6bc5bf286eb2b5216c0905cec48862e9b`
- malformed public-seam probes — 上記2 findings の clean misclassification / uncaught exceptions を再現

---

_Reviewed: 2026-07-27T14:05:32Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
