---
phase: 02-source-to-execution-mapping
reviewed: 2026-07-21T18:45:30Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - docs/agents/adaptive-change-execution.references.json
  - src/ai_coding_template_ja/openspec_gsd_handoff/policy_reference.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/execution_mapping.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py
  - tests/test_handoff_policy_reference.py
  - tests/test_handoff_execution_mapping.py
  - tests/test_handoff_manifest_refresh.py
  - tests/fixtures/openspec_gsd_handoff/manifest/expected-refresh-preview.json
  - tests/fixtures/openspec_gsd_handoff/mapping/hardening-phase-assignments.json
  - tests/fixtures/openspec_gsd_handoff/policy/duplicate-heading.md
  - tests/fixtures/openspec_gsd_handoff/policy/unclosed-fence.md
  - tests/fixtures/openspec_gsd_handoff/policy/valid-policy.md
findings:
  critical: 1
  warning: 0
  info: 0
  total: 1
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-07-21T18:45:30Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Phase 2 の3 source modules、3 test modules、fixture/registryを、canonical OpenSpec、Phase 2 context/research/validation、全plans/summaries、前回review/fix記録と照合した。前回までの5 findingsについて、各単一pathのsymlink/identity再検証、refresh read adapter接続、invalid registryのstructured failureは修正済みである。

ただし、follow-up CR-01 の修正は一つのpathを観測している間だけdescriptorを保持する。複数pathから成るreadiness operationでは、先に検査済みのpathが後続pathの観測中に消失しても再検証されず、返却時点で必要evidenceが存在しないのに`ready=True`となる。operation全体のfail-closed契約は未達である。

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: [BLOCKER] 後続pathの観測中に消失した先行evidenceをreadinessが見逃す

**File:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/execution_mapping.py:853-869`

**Issue:** `_readiness_issues()` は各pathを `_observe_declared_path()` で順番に観測し、その呼出しが戻るたびに当該pathのdescriptorを閉じる。後続pathのbounded read中に、既に観測済みの先行evidenceをunlink/rename/swapしても、その先行pathをoperation終了前に再検証しない。隔離再現では `.planning/evidence/REQ-000001.json` を先に正常観測し、最後の `.planning/evidence/plan-02.json` の読取中に前者をunlinkしたところ、返却時点で前者が存在しないにもかかわらず `Success(MappingReadiness(ready=True, issues=()))` となった。これはverify/finalize horizonの全required evidence実在と、検査中のidentity変化からpartial greenを返さない契約に反する。

**Fix:** readiness operation単位でrepository rootと全required phase/plan/evidence entryのdescriptor/identityを保持し、全pathのbounded observation完了後に全entryとrootをまとめて再検証してからdescriptorを閉じる。少なくとも、先行pathを後続path読取中にunlink/rename/swapする回帰testを追加し、`mapping-path-identity-changed`を含む`ready=False`を要求する。

```python
def test_readiness_rejects_earlier_evidence_removed_while_later_path_is_read(...):
    # Observe victim first; unlink it while a later evidence descriptor is read.
    result = validate_mapping_readiness(..., operation=MappingOperation.VERIFY)
    assert isinstance(result, Success)
    assert result.value.ready is False
    assert MappingIssue("mapping-path-identity-changed", victim_path) in result.value.issues
```

## Verification Evidence

- Phase 2 focused suite: `97 passed`。
- Phase 1 / v1 regression suite: `186 passed`。
- `task check`: Ruff format/check green、BasedPyright `0 errors`、pytest `482 passed`。
- Read-only repro: later evidence read中に先行evidenceをunlink後、`victim_exists=False`かつ`ready=True`、`issues=()`を確認。
- Actual tracked apply、実OpenSpec / GSD / host smokeは未実行。

## Protected Surface Evidence

- tracked handoff: `554690a1eee6e632eaf7c4fce3517cba69ff38eb8a06a1873b7a5e6822e59914`
- OpenSpec `tasks.md`: `cf4a9dc56afc15b98a008cff686989bd446215c95b3962ea3efd5a4f9eb30220`
- tracked refresh preview: `6775ff40a9e01aa634ff67098a0a1d020808ef11be80ece4e06f881dab5270cf`
- ROADMAP: `10cb18a19943da7a5c9b41f5a65f21a5bfd6f462451c32e9a3f76adf21801f4d`
- STATE: `81a99f6c42fa7a92c4d236f3a452b5526a7ef334dad1782fae9565d43fbbf89f`
- report更新前のworktreeはclean。source/tests/protected artifactsは変更していない。

---

_Reviewed: 2026-07-21T18:45:30Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
