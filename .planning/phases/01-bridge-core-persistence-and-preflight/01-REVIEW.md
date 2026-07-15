---
phase: 01-bridge-core-persistence-and-preflight
reviewed: 2026-07-15T08:34:57Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - src/ai_coding_template_ja/openspec_gsd_handoff/__init__.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/__main__.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/discovery.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/manifest.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/models.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/preflight.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/progress.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/reader.py
  - tests/test_handoff_cli.py
  - tests/test_handoff_core.py
  - tests/test_handoff_discovery.py
  - tests/test_handoff_manifest.py
  - tests/test_handoff_preflight.py
findings:
  critical: 1
  warning: 0
  info: 0
  total: 1
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-07-15T08:34:57Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

canonical OpenSpec artifacts、Phase 01 plans/summaries、iteration 1–2のreview/fix evidenceと13 filesを照合し、generic-agent workaround iteration 3として再監査した。CR-01〜CR-09は、報告された修正だけでなく現在の制御フロー上でも解消されている。static parent symlink、kind/path canonicality、multi-spec順序、structured argv failure、bounded subprocess capture、manifest identity、lexical alias、bounded manifest read、canonical artifact symlinkの各guardを確認した。

一方、OpenSpec候補の`missingArtifacts`を「fieldの存在」ではなくtruthyな非空listとして扱うため、準備不足停止gateをMarkdown fallbackで隠せるcaseが残る。focused suiteは96件すべて成功したが、この存在条件は未検証であり、test passを正しさの根拠にはしていない。component-swap/race、directory-fsync/recovery、retry/resume/finalize/lifecycle hardeningは明示された対象外でありfindingに含めていない。

## Critical Issues

### CR-10: 空の`missingArtifacts` fieldで準備不足停止gateを迂回できる

**Severity:** Critical

**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/discovery.py:194-197, 223-225`

**Issue:** canonical contractはapply JSONが`missingArtifacts`を「含む」場合に永続化せず停止する。しかし`_candidate_shape()`は`_string_list()`で空listをinvalid shapeへ落とし、`_candidate_discovery()`も`if state == "blocked" or missing:`というtruthiness判定を使う。そのため、他fieldがvalidな`state=ready, missingArtifacts=[]`は候補をdiscardしてMarkdown fallbackを開始し、canonical filesが揃っていればhandoff可能な`Success`になる。実際にpositive fixtureへ`missingArtifacts: []`を追加した診断で`Success markdown-fallback`を再現した。`state=blocked, missingArtifacts=[]`も同じfallback経路へ落ち得る。これは「blockedまたはmissingArtifactsの存在をfallbackで隠さない」というpreflight safety contractに違反する。

**Fix:** `missingArtifacts`が存在するかを値のtruthinessと分離して保持する。fieldがある場合は空listを含むstring listとしてshape validationしたうえで、`"missingArtifacts" in candidate`をterminal stop条件にする。少なくとも`ready + []`と`blocked + []`が`openspec-unprepared`となり、fallback readerやmanifest mutationへ進まない回帰testを追加する。

## Prior Finding Resolution

- CR-01〜CR-05: 解消済み。static path containment、kind別canonical path、multi-spec parity、argv JSON、incremental output boundを現在の実装とtestsで確認した。
- CR-06〜CR-09: 解消済み。requested/embedded change identity一致、lexical canonical path、8 MiB bounded existing-manifest read、artifact/parent symlink拒否を現在の実装とtestsで確認した。
- Fix regression: 上記修正部分に、新たなwrite bypass、unbounded manifest parse、canonical artifact aliasは確認しなかった。

## Warnings

なし。

## Info

なし。

## Verification

- `uv run pytest tests/test_handoff_core.py tests/test_handoff_discovery.py tests/test_handoff_manifest.py tests/test_handoff_preflight.py tests/test_handoff_cli.py -q` — 96 passed。
- diagnostic reproduction — positive apply fixtureへ`missingArtifacts: []`を追加すると`Success markdown-fallback`。
- source、tests、`01-REVIEW-FIX.md`は変更していない。`01-REVIEW.md`のみ更新し、commitは行っていない。

---

_Reviewed: 2026-07-15T08:34:57Z_

_Reviewer: the agent (gsd-code-reviewer via generic-agent workaround, iteration 3)_

_Depth: standard_
