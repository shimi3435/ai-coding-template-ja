---
phase: 02-source-to-execution-mapping
reviewed: 2026-07-22T04:08:05Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - docs/agents/adaptive-change-execution.references.json
  - src/ai_coding_template_ja/openspec_gsd_handoff/execution_mapping.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/policy_reference.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/preflight.py
  - tests/fixtures/openspec_gsd_handoff/manifest/expected-refresh-preview.json
  - tests/fixtures/openspec_gsd_handoff/mapping/hardening-phase-assignments.json
  - tests/fixtures/openspec_gsd_handoff/policy/duplicate-heading.md
  - tests/fixtures/openspec_gsd_handoff/policy/unclosed-fence.md
  - tests/fixtures/openspec_gsd_handoff/policy/valid-policy.md
  - tests/test_handoff_execution_mapping.py
  - tests/test_handoff_manifest_refresh.py
  - tests/test_handoff_policy_reference.py
findings:
  critical: 1
  warning: 0
  info: 0
  total: 1
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-07-22T04:08:05Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

original 12-file scope に `preflight.py` を加え、fix commits `4357fbc` / `779d2ea` / `7d7a169` / `5982d29` を fresh standard-depth で再レビューした。

旧 CR-01 は解消済みである。historical source pin は HEAD と異なってもよいまま、実在する commit object、exact repository root、全 canonical artifact の Git blob bytes を preview と apply の staging 前・replace 前に再観測する。missing Git、unknown commit、blob mismatch は mutation 前に fail-closed し、replace-boundary drift は validated staging を cleanup して target を維持する。

旧 CR-02 も解消済みである。bounded subprocess runner の既定 4 MiB は維持され、Git blob probe だけが refresh の artifact limit を渡す。4 MiB、4 MiB + 1、8 MiB は成功し、8 MiB + 1 は artifact read で拒否される。runner は limit+1、timeout、terminate/kill/reap を維持し、unbounded capture は行わない。

D-04 は各 path の bounded point-in-time observation であり、atomic filesystem snapshot / lease を要求しない。final observation 後の非協調外部 drift を保証しないことは canonical contract どおりなので、旧 atomic-readiness 指摘は finding ではない。

一方、approved apply の injectable filesystem boundary を truthiness で選択しているため、正規 subclass adapter が falsey の場合に無視され、既定 adapter が実 target を置換する BLOCKER を1件確認した。

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-03 [BLOCKER]: falsey な supplied filesystem adapter を無視して既定 adapter で target を置換する

**File:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py:975`

**Issue:** `apply_manifest_refresh()` は `filesystem = operations or ManifestRefreshFileOperations()` で persistence adapter を選ぶ。このため、`ManifestRefreshFileOperations` の正規 subclass が `__bool__()` で `False` を返すと、caller が明示した adapter は捨てられ、既定の実 filesystem adapter が使用される。これは型契約内の値であり、fault injection、mutation recording、host-owned persistence guard を迂回して未監視の実書込を起こす。

isolated repository で falsey subclass を渡し、その `create_staging_at()` が呼ばれたら例外にする再現を行った。結果は `Success [] True True` となり、supplied adapter の呼出は0件のまま、target bytes が candidate bytes へ置換された。したがって単なる invalid-input crash ではなく、approved apply の mutation boundary が実際に bypass されるデータ変更リスクである。

**Fix:** truthiness を使わず `None` だけを既定値として扱い、preview seam と同じく型を fail-closed に検査する。

```python
filesystem = (
    ManifestRefreshFileOperations() if operations is None else operations
)
if not isinstance(filesystem, ManifestRefreshFileOperations):
    return _refresh_failure(
        "refresh-operations-invalid",
        RefreshFailurePoint.STATE_GUARD,
        RefreshTargetState.UNKNOWN,
        RefreshStagingState.ABSENT,
    )
```

falsey subclass の recording/fault adapter を public apply seam に渡し、その adapter が実際に呼ばれること、既定 adapter へ fallback しないこと、guard failure 時に target が不変であることを回帰テストに追加する。

## Validation

- `uv run pytest tests/test_handoff_manifest_refresh.py tests/test_handoff_preflight.py tests/test_handoff_execution_mapping.py tests/test_handoff_policy_reference.py -q` — 138 passed
- falsey adapter isolated reproduction — `Success [] True True`（supplied adapter calls 0、target changed、candidate installed）
- tracked handoff SHA-256 — `554690a1eee6e632eaf7c4fce3517cba69ff38eb8a06a1873b7a5e6822e59914`（不変）
- tracked preview SHA-256 — `661b63be39bacb882c53ade5e9919ae7fea661f852b7e47fb53188a29348138a`（不変）
- OpenSpec tasks SHA-256 — `cf4a9dc56afc15b98a008cff686989bd446215c95b3962ea3efd5a4f9eb30220`（不変）
- `.handoff.*.tmp` — なし
- tracked apply は実行していない。再現は temporary isolated repository のみで実行した
- `task check` — 今回の fresh review では未実行。fix report の全体 green evidence は確認したが、本レビューでは focused 138 tests を再実行した

---

_Reviewed: 2026-07-22T04:08:05Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
