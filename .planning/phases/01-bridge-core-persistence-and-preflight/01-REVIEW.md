---
phase: 01-bridge-core-persistence-and-preflight
reviewed: 2026-07-15T08:15:19Z
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
  critical: 4
  warning: 0
  info: 0
  total: 4
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-07-15T08:15:19Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

CR-01〜CR-05の修正と、その周辺のstate/path/resource境界をcanonical OpenSpec artifacts、Phase 01 plans/summaries、`01-REVIEW-FIX.md`に照合した。generic-agent workaround iteration 2としてfresh rereviewを行った。

CR-01の通常のstatic parent symlink case、CR-02のkind別canonical locationと64件上限、CR-03のmulti-spec順序、CR-04のargv error、CR-05のsubprocess output上限はそれぞれ修正されている。一方、修正後もchange identity不一致によるCR-01 bypass、lexical aliasによるCR-02 bypassが残る。また、既存manifestのunbounded readと、in-change symlinkでread-only inspectionだけ成功するcanonicality gapがPhase 1境界に残る。directory component-swap/race、retry/resume/finalize/lifecycle hardeningはfindingに含めていない。

## Critical Issues

### CR-06: manifest内change IDの不一致でstatic symlink guardを迂回できる

**Severity:** Critical
**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest.py:538-543`
**Issue:** `_target_parent_is_safe()`はtarget末尾が`manifest.change_id`と一致しない場合に安全確認を成功扱いする。`mark_handoff_started()`は`.planning/openspec/<requested-id>/handoff.json`をparseした後、manifest内`change_id`が`requested-id`と一致するか確認せず、その値をguardへ渡す。このため、requested pathに別change IDのvalid prepared manifestがあると別changeを`started`へ進められる。さらに`.planning`がrepository外へのstatic symlinkで、その外部targetにこのmismatched manifestがある場合、CR-01のguardがline 543で迂回され、外部fileを置換できる。
**Fix:** noncanonical target tailは成功ではなくfail-closedにし、`mark_handoff_started()`でparse直後に`parsed.value.change_id == change_id`とtargetのexact canonical pathを検証する。mismatched ID単体と、mismatched ID + static parent symlinkの両方をmutation-before-zeroの回帰testに追加する。

### CR-07: manifest parserがcanonical pathのlexical aliasを受理する

**Severity:** Critical
**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest.py:183-207`
**Issue:** `PurePosixPath`で正規化した値だけをcanonical location判定に使う一方、保存する値と重複判定にはraw stringを使う。実際に`./openspec/changes/fixture-change/proposal.md`はcanonical proposalとしてparse成功する。また`specs/a/spec.md`と`specs/a//spec.md`は同じcanonical pathへ正規化されるが、raw stringが異なるためduplicate checkを通過できる。これはCR-02が修正対象にしたexact canonical path、duplicate artifact、既存manifest fail-closed契約をまだ破る。
**Fix:** `path == PurePosixPath(path).as_posix()`を必須にし、canonical `PurePosixPath`を重複判定・sort判定にも使用する。`./`、重複separator、同一specのalias 2件をparse/transitionとも拒否するtestを追加する。

### CR-08: 既存manifestを上限なしで読み込みJSON parseする

**Severity:** Critical
**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest.py:527-532`
**Issue:** `_existing()`は追跡済みとは限らない既存targetを`read_bytes()`で無制限にmemoryへ読み、`parse_manifest_bytes()`もbyte長やtask description長を確認せず`json.loads()`する。`mark_handoff_started()`にも同じunbounded readがある。artifact count/task countの事後schema検査では、巨大な単一stringや巨大JSONを読み終える前のmemory exhaustionを防げない。これはcanonical designのR3「manifest過大は上限超過で停止」とPlan T-01-09のbounded filesystem operationに違反する。
**Fix:** source-pinned canonical inputから導ける明示的manifest byte上限を固定し、`limit + 1`のbinary readで超過をJSON parse前に分類して停止する。repository state guardと`mark-started`を同じbounded readerへ収束し、exact boundary / boundary+1 /巨大descriptionの回帰testを追加する。

### CR-09: in-change symlinkでinspectだけ非canonical artifactを成功扱いする

**Severity:** Critical
**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/reader.py:83-123`
**Issue:** readerはresolved pathがchange root内のMarkdownであることだけを確認し、claim kindに対応するcanonical locationは確認しない。たとえばcanonical `proposal.md`をchange内の`other.md`へのsymlinkにすると、JSON側のsingleton比較も両辺をresolveするため通過し、readerはartifact pathを`other.md`として返す。`inspect_handoff()`はその非canonical manifestを検証せずSuccessにするが、承認後の`prepare_handoff()`だけがmanifest serializerで拒否する。したがってread-only preflightが「全gate成功」と誤報し、canonical artifact path契約と表示後承認の順序を破る。
**Fix:** discovery/reader境界でkindごとのlogical canonical pathとresolved target policyを一度だけ固定する。MVPでartifact symlinkを許可しないなら明示的にrejectし、許可するならlogical canonical repo-relative pathを保持したままsource-commit blob同一性を検証できる設計にする。少なくともsingletonとspec directoryのin-change symlinkで`inspect_handoff()`がfail-closedするtestを追加する。

## Warnings

なし。

## Info

なし。

---

_Reviewed: 2026-07-15T08:15:19Z_
_Reviewer: the agent (gsd-code-reviewer via generic-agent workaround, iteration 2)_
_Depth: standard_
