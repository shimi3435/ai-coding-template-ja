---
phase: 03-lifecycle-drift-gate
reviewed: 2026-07-28T16:09:52Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - src/ai_coding_template_ja/openspec_gsd_handoff/execution_mapping.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py
  - tests/fixtures/openspec_gsd_handoff/lifecycle/expected-lifecycle-evidence.json
  - tests/test_handoff_execution_mapping.py
  - tests/test_handoff_identity.py
  - tests/test_handoff_lifecycle_drift.py
  - tests/test_handoff_lifecycle_gate.py
findings:
  critical: 3
  warning: 0
  info: 0
  total: 3
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-07-28T16:09:52Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

指定された lifecycle gate、canonical drift、execution mapping、source identity と対応するテスト・golden evidence を標準深度でレビューした。対象テスト 417 件は成功したが、追加の adversarial probe で 3 件の fail-closed 違反を再現した。

stale 判定が返す `decision_identity` は返却された decision を表しておらず、その ID の再送で次回 admission が通る。source inventory は読み取り中の repository root 差し替えを検出せず、現在の root ではなく切り離された旧 root の内容を Success として返す。また、2 つの public inventory reader は malformed container/member を structured failure に変換せず例外終了する。

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: [BLOCKER] stale decision が clean decision の identity を公開し、その再送を admission する

**File:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py:1306-1314`
**Issue:** `_decision_from_observation` が clean decision とその digest を作った後、prior identity mismatch の分岐は `state`、`admitted`、`issue_codes` だけを `replace` する。`decision_identity` は clean decision 用のまま残るため、返却された `DRIFTED` / `admitted=False` / `lifecycle-decision-stale` の各 field を認証していない。実際に任意の古い 64-hex identity を渡した 1 回目は stale で拒否されるが、その拒否結果に含まれる `decision_identity` を次の呼び出しへ渡すと、入力を変更していなくても `CLEAN` / `admitted=True` になる。versioned encoder は decision state、admission、issue codes も bind する設計なので、返却値と digest の不一致は stale-safe identity contract を破る。

再現結果:

```text
drifted False ('lifecycle-decision-stale',) identity_present=True
clean True ()
```

**Fix:**

```python
stale = replace(
    decision,
    state=LifecycleGateState.DRIFTED,
    admitted=False,
    issue_codes=_utf8_sorted(
        (*decision.issue_codes, "lifecycle-decision-stale")
    ),
    decision_identity=None,
)
return replace(
    stale,
    decision_identity=_decision_identity(observation.value, stale),
)
```

拒否結果の identity を再送しても clean identity と一致せず、再度 stale になる public-seam regression を追加する。別の明示的な再承認 token を返したい場合は、decision identity と兼用せず別 field/contract に分離する。

### CR-02: [BLOCKER] source 読み取り中の repository root 差し替えを検出せず detached root を採用する

**File:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py:680-713`
**Issue:** `read_source_inventory` は resolved repository を descriptor で開き、子 entry の inode は `_verify_anchored_entry` で再検証するが、repository path 自体が最後まで同じ inode を指しているかを検証しない。source file の `os.read` 中に repository directory を rename し、元の path を別 directory への symlink に置換すると、関数は detached になった旧 directory の trusted content を `Success` として返した。この時点で caller-visible repository path は attacker-controlled replacement を指している。planning inventory と manifest reader にある root identity の終端再検証が source reader だけ欠けており、canonical source の point-in-time observation が repository path と結び付かない。

再現結果:

```text
Success True Requirement: Trusted current_root_is_replacement=True
```

**Fix:** repository を開く前に `follow_symlinks=False` の `stat` を取り、open descriptor の `fstat` と device/inode/type を比較する。全 source の読み取り後、descriptor を閉じる前に repository path を再度 `stat(..., follow_symlinks=False)` し、同一 identity でない場合は `source-root-identity-changed` などの structured `Failure` を返す。root rename、symlink replacement、別 directory replacementを fault injection する regression を追加する。

### CR-03: [BLOCKER] public source inventory readers が malformed container/member で例外終了する

**File:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py:611-644,666-679`
**Issue:** `source_inventory_from_bytes` と `read_source_inventory` は outer value が許可された `Sequence` かを確認する前に truthiness と `len()` を使用する。前者はさらに各 member の shape を検証する前に `for source_path, content_bytes in source_files` で unpack する。このため `object()` は両 public API で `TypeError`、malformed member は unpack の `TypeError` / `ValueError` となり、`source-paths-invalid` や `source-bytes-invalid` の structured non-success を返さない。source identity module の他の public reconciliation seam が malformed runtime shape を fail closed する一方、この byte/file observation seam だけ同じ保証を持たない。

再現結果:

```text
read TypeError object of type 'object' has no len()
bytes TypeError object of type 'object' has no len()
```

**Fix:** `len` と iteration より前に outer container を、unpack より前に各 member が exact 2-tuple であることを検証する。`str` / `bytes` を sequence container として受理しない。

```python
if (
    isinstance(source_files, (str, bytes))
    or not isinstance(source_files, Sequence)
):
    return _failure("source-files-invalid", category=IssueCategory.INPUT)
if any(type(item) is not tuple or len(item) != 2 for item in source_files):
    return _failure("source-files-invalid", category=IssueCategory.INPUT)
```

`read_source_inventory` にも同等の outer sequence validation を加え、`None`、`object()`、文字列、malformed member、limit+1 を public API から固定する。

## Verification Performed

- `uv run pytest tests/test_handoff_execution_mapping.py tests/test_handoff_identity.py tests/test_handoff_lifecycle_drift.py tests/test_handoff_lifecycle_gate.py -q --no-cov` — 417 passed
- stale decision identity の二段再送 probe — 1 回目 `DRIFTED`、返却 identity の再送で 2 回目 `CLEAN/admitted=True`
- source read 中の repository rename + symlink replacement probe — detached root の内容で `Success`
- malformed outer source container probe — 2 public API とも `TypeError`

---

_Reviewed: 2026-07-28T16:09:52Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
