---
phase: 02-source-to-execution-mapping
reviewed: 2026-07-21T20:11:18Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - docs/agents/adaptive-change-execution.references.json
  - src/ai_coding_template_ja/openspec_gsd_handoff/execution_mapping.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/policy_reference.py
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

**Reviewed:** 2026-07-21T20:11:18Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

対象12ファイルを standard depth でレビューした。execution mapping と policy reference の現行実装、ならびに corrective plan 02-05 の固定済み preview/evidence hash と tracked apply 非実行の証跡には、新たな blocker/warning は確認できなかった。一方、manifest refresh の mutation seam は `source_commit` を Git object として観測せず、任意の40桁 lowercase hex を承認済み commit として適用できるため、1件の BLOCKER が残る。

旧レビューの CR-01（readiness 呼び出し全体を atomic snapshot/lease として扱う要求）は、現行 D-04 の「path-by-path の point-in-time observation」であり、最終観測後の不変性を保証しないという契約には適合しないため、今回は finding として再掲しない。consumer による action 直前の mapping readiness と Phase 3 drift/preflight の再実行、および mutation seam 固有の state guard が現行境界である。

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01 [BLOCKER]: refresh の source commit guard が Git state を観測していない

**File:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py:513-529,650-657,775-829,903-955`

**Issue:** `preview_manifest_refresh()` は caller が渡した `current_source_commit` を40桁 lowercase hex かだけ検査して candidate に保存する。apply 時の `_current_preview()` も approved preview の同じ文字列をそのまま再投入するため、source commit の存在、commit object であること、canonical artifact がその commit の blob と一致することを一度も再観測しない。approval hash は虚偽の文字列を固定するだけで、その文字列を repository state の guard にはしない。

一時 repository に `.git` が存在しない状態でも、`current_source_commit="e" * 40` の preview と apply がともに `Success` になり、candidate の `source_commit` にその値が保存されることを再現した。これは D-02/spec が求める apply-time の独立した source-commit state guard を満たさず、存在しない、または canonical source と対応しない commit を追跡 manifest に確定できる。後続の resume/drift 判定が誤った authority pin を信頼するため、正確性と安全な再開を破壊する。

**Fix:** historical pin を許容するため HEAD との単純一致は要求せず、既存 preflight と同じ Git object 検証を refresh 用の観測関数として切り出す。preview 作成時と apply の staging 前（および replace 直前の mutation guard）に、少なくとも次を point-in-time で再観測し、不一致時は mutation 前に fail closed とする。

```python
observed = observe_source_pin(
    repository_root=repository,
    source_commit=preview.current_source_commit,
    canonical_artifacts=preview.current_artifacts,
)
if isinstance(observed, Failure):
    return refresh_state_guard_failure("refresh-source-commit-changed")
```

`observe_source_pin()` は `git cat-file -e <commit>^{commit}` で commit object の存在を確認し、各 canonical artifact を `git cat-file -p <commit>:<path>` で読み、approved preview が保持する artifact bytes/hash と一致させる。この観測結果を machine preview/hash に束縛し、apply 時に再観測する。回帰テストとして、(1) `.git` 不在、(2) 存在しない40桁hex、(3) commit は存在するが canonical artifact blob が異なる、の各ケースが staging/mutation 前に拒否されることを追加する。

## Validation

- `uv run pytest tests/test_handoff_manifest_refresh.py tests/test_handoff_execution_mapping.py tests/test_handoff_policy_reference.py -q` — 98 passed
- `task check` — ruff format/check、basedpyright、pytest 483件すべて成功
- corrective 02-05 の candidate/preview/evidence/target/tasks/design/spec SHA-256 を記録値と照合済み
- corrective evidence の `apply_invoked: false`、空の mutation operations、staging before/after 空、target/tasks hash 不変を確認済み

---

_Reviewed: 2026-07-21T20:11:18Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
