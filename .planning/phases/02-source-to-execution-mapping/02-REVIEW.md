---
phase: 02-source-to-execution-mapping
reviewed: 2026-07-21T19:07:07Z
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

**Reviewed:** 2026-07-21T19:07:07Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Phase 2 の3 source modules、3 test modules、fixture/registryを、canonical OpenSpec、Phase 2 context、全plans/summaries、`02-REVIEW-FIX.md`、最新 commits `fa6f238` / `5487156` と照合した。通常・既存例外経路、public CLI/API非変更、descriptor close、focused/full regressionはgreenである。

ただし、`fa6f238` が追加したoperation末尾の全path再検証は逐次実行であり、再検証済みの先行pathを後続pathの最終再検証中にunlinkすると、その先行pathを再度照合しない。返却時にrequired evidenceが存在しないまま`ready=True`となるため、前回CR-01のwhole-operation identity保証は未解決である。

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: [BLOCKER] 最終再検証中の先行path消失を見逃してreadinessがfalse greenになる

**File:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/execution_mapping.py:919-932`

**Issue:** `_readiness_issues()` は保持済みobservationsを順番に再検証する。先行evidenceの最終再検証が成功した後、後続evidenceの `_revalidate_declared_path_observation()` 内で先行evidenceをunlinkしても、先行evidenceは再検証されない。隔離再現では `.planning/evidence/REQ-000001.json` の最終照合後、`.planning/evidence/plan-02.json` の最終照合時に前者をunlinkした結果、`victim_exists=False`、`issues=[]`、`ready=True`となった。descriptorは正常に閉じられ、`fd_delta=0`だったため、例外やleakではなく最終snapshot判定そのものの欠陥である。これはcanonical design/specの「必要path不在が一件でもあればpartial greenを返さない」契約に反する。

**Fix:** 複数pathのreadinessをどの時点・どのmechanismで一つのatomic snapshotとして成立させるかをcanonical contractで先に定義し、その境界を機械的に保証できるまでwhole-operation `ready=True`を許可しないこと。単なる再検証ループ追加では同じ競合窓が移動するだけなので、実装方式はこのreviewでは推測しない。回帰は「先行pathの最終照合後、後続pathの最終照合中に先行pathをunlink」をpublic seamから再現し、false greenを拒否する必要がある。

## Verification Evidence

- Phase 2 focused suite: `98 passed`。
- `task check`: Ruff format/check green、BasedPyright `0 errors, 0 warnings, 0 notes`、pytest `483 passed`。
- Read-only isolated repro: `removed=True`、`later_stats=3`、`victim_exists=False`、`ready=True`、`issues=[]`、`fd_delta=0`。
- Phase 2 base以降でroot exports / `__main__.py` / CLI surfaceにdiffなし。actual tracked refresh apply、実OpenSpec / GSD / host smokeは未実行。

## Protected Surface Evidence

- tracked handoff: `554690a1eee6e632eaf7c4fce3517cba69ff38eb8a06a1873b7a5e6822e59914`
- OpenSpec `tasks.md`: `cf4a9dc56afc15b98a008cff686989bd446215c95b3962ea3efd5a4f9eb30220`
- tracked refresh preview: `6775ff40a9e01aa634ff67098a0a1d020808ef11be80ece4e06f881dab5270cf`
- ROADMAP: `10cb18a19943da7a5c9b41f5a65f21a5bfd6f462451c32e9a3f76adf21801f4d`
- STATE: `81a99f6c42fa7a92c4d236f3a452b5526a7ef334dad1782fae9565d43fbbf89f`
- report更新前のworktreeはclean。source/tests/protected artifactsは変更していない。

---

_Reviewed: 2026-07-21T19:07:07Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
