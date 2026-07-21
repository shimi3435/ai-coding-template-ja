---
phase: 02-source-to-execution-mapping
reviewed: 2026-07-21T20:37:39Z
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

**Reviewed:** 2026-07-21T20:37:39Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

original 12-file scope と fix commits `4357fbc` / `779d2ea` を fresh standard-depth で再レビューした。旧 CR-01 の中核は解消済みである。historical pin は HEAD と異なってもよいまま、preview と apply の staging 前・replace 直前で、実在する commit object、exact repository root、全 canonical artifact blob bytes を再観測する。`.git` 不在、unknown commit、blob mismatch は mutation 前に停止し、replace-boundary drift は validated staging を cleanup して target を維持する。

一方、source-pin 観測が再利用する subprocess runner の stdout 上限と refresh artifact 上限が一致せず、仕様上有効な 4–8 MiB artifact を誤拒否する新しい BLOCKER を1件確認した。fixed argv、`shell=False`、canonical path、no-follow filesystem read、symlink rejection、partial-failure classification に新たな injection/path/symlink 弱点は確認できなかった。

D-04 は現在も path ごとの bounded point-in-time observation であり、atomic lease / repository snapshot ではない。final observation 後の外部 drift を保証しないことは明示契約どおりなので、旧 atomic-readiness 指摘は finding ではない。

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-02 [BLOCKER]: 4 MiB 超の有効 artifact を source-pin guard が誤拒否する

**File:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py:52,76-79,278-303,617-632`

**Issue:** refresh は `RefreshLimits.artifact_bytes` の既定値として manifest 契約と同じ 8 MiB を許可し、working-tree artifact をその上限で bounded read する。しかし `_source_pin_matches()` は各 Git blob を共通 `subprocess_runner()` で取得し、この runner は stdout を 4,194,304 bytes で打ち切る。したがって canonical blob が 4 MiB + 1 byte 以上 8 MiB 以下の場合、filesystem 側の artifact read/hash は成功するのに `git cat-file -p` だけが output-limit failure となり、正しい historical source pin を `refresh-source-pin-invalid` と誤判定する。

isolated Git repository で同一 commit/blob bytes を観測したところ、4,194,304 bytes は `True`、4,194,305 bytes は `False` になった。これは巨大出力を安全に fail-closed している点では security bypass ではないが、HARD-R1 の 8 MiB bounded-input contract 内の正当な refresh を実行不能にする incorrect behavior である。

**Fix:** Git blob 観測を artifact 契約と同じ caller-supplied limit で streaming compare する専用 fixed-argv helper に分離する。stdout 全体を無制限に保持せず、expected bytes と逐次比較し、`artifact_bytes + 1` で停止する。あるいは bounded runner に per-call output limit を追加し、blob 呼び出しだけ `limits.artifact_bytes` を渡す。commit/root probe の小さい出力は現行上限のままにする。4 MiB、4 MiB + 1、8 MiB、8 MiB + 1 の回帰テストを public preview seam に追加し、前3件は正しい blobなら成功、最後だけ `refresh-artifact-limit-exceeded` で mutation 前に停止することを確認する。

## Validation

- `uv run pytest tests/test_handoff_manifest_refresh.py tests/test_handoff_execution_mapping.py tests/test_handoff_policy_reference.py -q` — 103 passed
- `task check` — Ruff format/check、BasedPyright 0 errors/warnings/notes、pytest 488 passed
- isolated boundary reproduction — `{4194304: True, 4194305: False}`
- tracked handoff SHA-256 — `554690a1eee6e632eaf7c4fce3517cba69ff38eb8a06a1873b7a5e6822e59914`（不変）
- tracked preview SHA-256 — `661b63be39bacb882c53ade5e9919ae7fea661f852b7e47fb53188a29348138a`（不変）
- preview evidence — `apply_invoked=false`、`mutation_operations=[]`、staging before/after empty、target/tasks hash unchanged
- tracked apply は実行していない。`.handoff.*.tmp` も存在しない

---

_Reviewed: 2026-07-21T20:37:39Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
