---
phase: 03-lifecycle-drift-gate
reviewed: 2026-07-23T01:36:30Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py
  - tests/fixtures/openspec_gsd_handoff/lifecycle/expected-lifecycle-evidence.json
  - tests/test_handoff_lifecycle_drift.py
  - tests/test_handoff_lifecycle_gate.py
findings:
  critical: 7
  warning: 0
  info: 0
  total: 7
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-07-23T01:36:30Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

ライフサイクル drift 判定、公開 gate、固定 evidence、関連テストを標準深度でレビューした。既存の対象テスト 72 件、Ruff、BasedPyright は成功したが、fail-closed 契約を破る admission bypass、malformed observation による例外、公開 decision からの必須証拠消失、decision identity の repository 間再利用を確認した。

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01 [BLOCKER]: 未検査の host capability が clean として admission される

**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py:410-455,652-693`
**Issue:** `_validate_capabilities` は `host.inspected` が bool であることしか確認せず、`_capability_changes` はこのフィールド自体を比較対象に含めていない。そのため、manifest 側が `inspected=True` でも current observation を `inspected=False` にすると、判定は `clean` かつ `admitted=True` になる。必要 capability probe が未完了でも書込み操作を許可する fail-open である。実際に `FakeBoundary.capabilities.host.inspected=False` だけを変更した反例で `clean True ()` を再現した。
**Fix:** `inspected is True` を complete observation の必須条件にし、defense-in-depth として capability drift 比較にも追加する。

```python
if capabilities.host.inspected is not True:
    return False

fields = (
    # ...
    ("host.inspected", expected.host.inspected, observed.host.inspected),
    # ...
)
```

### CR-02 [BLOCKER]: phase graph を検証前に正規化し、malformed 値を crash または clean にする

**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py:326-369,559-570`
**Issue:** `observe_lifecycle_operation` は `_validate_phase_graph` より先に `_normalize_phase_nodes` を呼ぶ。要素が `None` の malformed tuple は `AttributeError` を送出して gate 全体を落とす。また `_utf8_sorted` が依存辺を deduplicate するため、`depends_on=("03", "03")` という uniqueness 違反は検証前に消え、正常な expected graph と一致して `clean/admitted=True` になる。どちらも「malformed observation は unknown」の契約違反である。
**Fix:** raw observation に対して、tuple、要素型、文字列型、依存 tuple、重複、bounds を属性参照前に検証する。検証成功後だけ canonical ordering を適用し、重複を正規化で隠さない。`None` 要素と重複依存辺の回帰テストを追加する。

```python
if not _validate_phase_nodes(phase_graph.expected_nodes, limits=limits):
    return _failure("lifecycle-phase-observation-incomplete")
if not _validate_phase_nodes(phase_graph.observed_nodes, limits=limits):
    return _failure("lifecycle-phase-observation-incomplete")
phase_graph = replace(
    phase_graph,
    expected_nodes=_normalize_phase_nodes(phase_graph.expected_nodes),
    observed_nodes=_normalize_phase_nodes(phase_graph.observed_nodes),
)
```

### CR-03 [BLOCKER]: nested ArtifactLimits の未検証値で public gate が例外終了する

**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py:206-219`
**Issue:** `_valid_limits` は `artifact_limits` の型だけを確認し、その `max_files`、`bytes_per_file`、`bytes_total`、`change_id_bytes` の型・正値を検証しない。例えば `ArtifactLimits(max_files="bad")` は gate の事前検証を通過し、`read_canonical_artifacts` 内の整数比較で `TypeError` を送出する。外部設定または caller 入力が不正な場合に `unknown` を返さず処理を crash させる。
**Fix:** nested limit の全フィールドも `type(value) is int and value > 0` で検証し、不正値は `lifecycle-input-invalid` として fail-closed に返す。

```python
artifact_values = (
    limits.artifact_limits.max_files,
    limits.artifact_limits.bytes_per_file,
    limits.artifact_limits.bytes_total,
    limits.artifact_limits.change_id_bytes,
)
return all(type(value) is int and value > 0 for value in (*gate_values, *artifact_values))
```

### CR-04 [BLOCKER]: incomplete canonical observation の検査自体が例外を送出する

**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py:208-237,250-263`
**Issue:** `_is_complete_observation` は `observation` と各 artifact の型を確認する前に `observation.artifacts` および `artifact.kind` を参照する。`Success(None)` や `CanonicalSourceObservation(artifacts=(None,), ...)` のような malformed structured result で `AttributeError` になり、仕様上 `unknown` に変換すべき incomplete observation が classifier と lifecycle gate を crash させる。
**Fix:** 最初に observation の exact type を確認し、tuple 内の各要素が `CanonicalArtifactObservation` であることを確認してから属性を読む。`Success` の payload が異型、artifact 要素が異型、nested state が不正な各ケースを `canonical-observation-incomplete` のテストに加える。

```python
if not isinstance(observation, CanonicalSourceObservation):
    return False
if type(observation.artifacts) is not tuple or any(
    not isinstance(item, CanonicalArtifactObservation)
    for item in observation.artifacts
):
    return False
```

### CR-05 [BLOCKER]: public gate decision が drift artifact と progress update 候補を破棄する

**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py:142-158,994-1069`
**Issue:** lower-level `CanonicalSourceDriftDecision` が持つ `drifted_artifact_paths` と `progress_update_candidate` は `LifecycleGateDecision` に投影されない。proposal/design/tasks の本文 drift は source ID が変化しない場合があるため、公開 gate の caller は「どの artifact が変わったか」を取得できない。また checkbox-only 変更を `clean` と admission しながら、仕様が要求する progress snapshot 更新候補を返せない。唯一の admission seam が必須 remediation evidence を失っている。
**Fix:** `LifecycleGateDecision` に両フィールドを追加し、clean/drifted decision へ source decision の値をそのまま渡す。unknown では `()` / `None` にする。decision identity と evidence fixture にも両フィールドを含め、non-spec artifact drift と checkbox-only gate の公開結果を直接検証する。

```python
drifted_artifact_paths: tuple[str, ...]
progress_update_candidate: Progress | None

# _decision_from_observation
drifted_artifact_paths=_utf8_sorted(source.drifted_artifact_paths),
progress_update_candidate=source.progress_update_candidate,
```

### CR-06 [BLOCKER]: decision identity が repository identity を bind せず別 repository で再利用できる

**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py:900-939`
**Issue:** `SourceCommitObservation.repository_root` は観測時に検証されるが、`_decision_identity` は `change_id` と `source_commit` だけを encode し repository root を欠落させる。同じ fixture を別々の real path に置くと同一 digest になり、repository A の `prior_decision_identity` を repository B に渡しても `admitted=True` となることを再現した。identity が完全な Git/source observation を表さず、repository-scoped な stale/approval 文脈を交差利用できる。
**Fix:** 検証済み real path を versioned encoder に含め、異なる repository root では digest が変わる回帰テストを追加する。

```python
encoder.add("source_commit.repository_root", commit.repository_root)
encoder.add("source_commit.change_id", commit.change_id)
encoder.add("source_commit.commit", commit.source_commit)
```

### CR-07 [BLOCKER]: cyclic phase dependency graph が clean として execution を許可される

**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py:326-358`
**Issue:** phase node 検証は self-edge と unknown dependency だけを拒否し、複数 node の cycle を検出しない。例えば `03 depends_on 04` と `04 depends_on 03` を expected/current の両方に設定すると gate は `clean/admitted=True` になる。依存順序を解決できない graph でも execute/resume/verify が admission され、downstream remediation の意味も壊れる。
**Fix:** node/edge bounds の確認後、Kahn 法または DFS で expected/current の両 graph が DAG であることを検証し、cycle は incomplete phase observation として `unknown` にする。2-node cycle と長い cycle の回帰テストを追加する。

```python
if not _is_acyclic(typed_nodes):
    return False
```

---

_Reviewed: 2026-07-23T01:36:30Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
