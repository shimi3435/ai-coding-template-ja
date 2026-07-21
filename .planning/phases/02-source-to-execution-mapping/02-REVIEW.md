---
phase: 02-source-to-execution-mapping
reviewed: 2026-07-21T18:20:27Z
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

**Reviewed:** 2026-07-21T18:20:27Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

修正 commits `ff842dd`、`fa9d21f`、`0399dcd`、`62369b4` を fresh に再査読し、前回の4 findings はすべて閉じたことを確認した。49-ID mapping、policy normalizer、refresh preview/apply/failure evidence、tracked read-only evidence、MVP API非拡張、preview-builderだけのproperty scopeも維持されている。

ただし、mapping readiness の phase / plan / evidence path 観測には、読取中にentry identityが変化した場合の最終再検証がない。実際に evidence file を descriptor read 中にunlinkしても `ready=True` が返るため、operation-ready判定のfail-closed契約を満たさない。

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: [BLOCKER] Readiness が観測中に消失・差替えされた evidence path を ready と判定する

**File:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/execution_mapping.py:674-727`

**Issue:** `_observe_declared_path()` はentryを`stat(..., follow_symlinks=False)`した後にdescriptorを開くが、entryとdescriptorのidentityを比較せず、読取後にもdirectory/file entryが同じidentityでpathへ接続されたままか再検証しない。最終directoryはdescriptorすら開かず、`stat`だけで成功する。隔離再現では、verify対象のevidence descriptorを開いた後、`os.read()`中にそのpathをunlinkしても `validate_mapping_readiness()` は `Success(MappingReadiness(ready=True, issues=()))` を返し、返却時点でevidence pathは存在しなかった。これは、対象horizonの全path実在と、検査不能・identity変化時にpartial greenを返さないcanonical contractに反する。

**Fix:** inventory readerと同様に、repository rootから全componentを`O_NOFOLLOW`で開き、各entryの`(st_dev, st_ino, file type)`をdescriptorと照合する。fileはbounded read後、directory/file双方は判定直前にもentry/descriptor identityを再検証し、unlink・rename・regular-file swapを `mapping-path-identity-changed` のnon-ready issueにする。phase directoryも最終componentをdescriptorで固定してから検証する。次の回帰testを追加する。

```python
def test_readiness_rejects_evidence_removed_during_bounded_read(...):
    # evidence descriptorのread中にdeclared pathをunlinkする
    result = validate_mapping_readiness(..., operation=MappingOperation.VERIFY)
    assert isinstance(result, Success)
    assert result.value.ready is False
    assert MappingIssue("mapping-path-identity-changed", evidence_path) in result.value.issues
```

## Verification Evidence

- Phase 2 focused suite: `95 passed`。
- Phase 1 / v1 regression suite: `186 passed`。
- `task check`: Ruff format/check green、BasedPyright `0 errors`、pytest `480 passed`。
- CLI help: `inspect`、`prepare`、`mark-started` の3操作のみ。
- Property scope: Phase 2で追加されたHypothesis familyはrefresh preview builderの1件のみ。
- Read-only repro: evidence read中のunlink後も `ready=True`、返却時点 `victim_exists=False` を確認。
- Actual tracked apply: 未実行。実OpenSpec / GSD / host smokeもPhase 3/manual境界のため未検証。

## Protected Surface Evidence

- tracked handoff: `554690a1eee6e632eaf7c4fce3517cba69ff38eb8a06a1873b7a5e6822e59914`
- OpenSpec `tasks.md`: `cf4a9dc56afc15b98a008cff686989bd446215c95b3962ea3efd5a4f9eb30220`
- tracked refresh preview: `6775ff40a9e01aa634ff67098a0a1d020808ef11be80ece4e06f881dab5270cf`
- ROADMAP: `10cb18a19943da7a5c9b41f5a65f21a5bfd6f462451c32e9a3f76adf21801f4d`
- STATE: `81a99f6c42fa7a92c4d236f3a452b5526a7ef334dad1782fae9565d43fbbf89f`
- protected handoff / tasks / preview はdiffなし。source/testsは変更していない。

---

_Reviewed: 2026-07-21T18:20:27Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
