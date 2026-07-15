---
phase: 01-bridge-core-persistence-and-preflight
reviewed: 2026-07-15T07:57:35Z
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
  critical: 5
  warning: 0
  info: 0
  total: 5
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-07-15T07:57:35Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Source commit `5a1f78b81f546c900745328fad24f9adb073e768` の canonical OpenSpec artifacts、Phase 01 plans/summaries、operation boundaries と照合した。generic-agent workaround で typed `gsd-code-reviewer` dispatch を代替した。

Phase 1 の責務範囲内に、静的symlinkでrepository外へmanifestを書ける問題、非canonicalな既存manifestを`started`へ進められる問題、複数specのJSON/fallback parity違反、CLI argv errorの非構造化出力、subprocess出力上限の事後判定がある。lifecycle hardening、retry、resume、finalizeの欠落はfindingに含めていない。

## Critical Issues

### CR-01: Manifestの親symlinkからrepository外へ書き出せる

**Severity:** Critical
**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest.py:568-572`
**Issue:** `ManifestRepository.persist()` はtarget parentをsemantic containment検査せず、`mkdir`、`mkstemp`、`os.replace`へ渡す。たとえばrepository内の`.planning`がrepository外directoryへのsymlinkなら、成功結果を返しながら外部の`openspec/<change>/handoff.json`を生成する。`prepare_handoff()`のGit ignore probeはlexical pathしか検査しないため、このescapeを止めない。これはcanonical manifest path、fail-closed、path containment契約に違反する。
**Fix:** mutation前にrepository real rootを固定し、`.planning/openspec/<change-id>`までの各componentを`lstat`/`dir_fd`で検査してsymlinkを拒否する。可能なら`O_DIRECTORY | O_NOFOLLOW`で親directoryを段階的にopenし、そのverified directory handleに対してstaging作成とreplaceを行う。少なくとも静的なparent symlink escapeとcomponent-swapを回帰testに追加する。

### CR-02: Strict manifest parserがkindとcanonical pathの不一致を受理する

**Severity:** Critical
**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/manifest.py:177-199`
**Issue:** parserは全artifact pathがchange root配下の`.md`であることとkindの件数だけを確認し、kindごとのcanonical locationを確認しない。したがって`kind="proposal"`に`openspec/changes/<id>/specs/fake/spec.md`を割り当てたmanifestも`Success`になる。`mark_handoff_started()`はその既存manifestを読み、同じ不正なartifact集合のまま`started`へ遷移させるため、「canonical paths」「既存manifest不正時は自動修復・上書きせず停止」の契約を破る。artifact数64上限も既存manifest parse時には失われている。
**Fix:** parserでartifact数を1..64に制限し、proposal/design/tasksはそれぞれ`<change-root>/proposal.md`、`design.md`、`tasks.md`と完全一致、specは`<change-root>/specs/<single-capability-segment>/spec.md`だけを許可する。kind/path mismatchおよび65件の既存prepared manifestがparse/transitionとも失敗するtestを追加する。

### CR-03: 複数specのJSON経路だけcandidate順を保持しparityが崩れる

**Severity:** Critical
**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/discovery.py:127-160`
**Issue:** fixed-directory fallbackはcapability directoryを名前順にsortする一方、JSON candidateは`contextFiles.specs`の入力順をそのままclaim/artifact順に使う。複数specを逆順で返すvalidなOpenSpec JSONでは、同じMarkdown filesでもJSON routeとfallback routeの`Discovery.artifacts` tupleが異なる。仕様は順序依存を排除し、両routeがinput route以外で同じcanonical content/progressを生成することを要求している。現在のtest fixtureはspecが1件なのでこの違反を検出できない。
**Fix:** validated/resolved spec pathsをrepo-relative canonical pathでsortしてから`ArtifactClaim`を構築するか、全claimをcanonical kind/path順へ正規化する。2件以上のspecをJSONでreverse/shuffleしたcaseとfallbackの値が完全一致する回帰testを追加する。

### CR-04: argparseの失敗経路がmachine-readable JSONを返さない

**Severity:** Critical
**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/__main__.py:168-170`
**Issue:** `parse_args()`のmissing required option、unknown operation、invalid argvは`SystemExit(2)`となり、usageをstderrへ出してstdoutを空にする。Phase 1 contractはargv/request validationをentrypointが所有し、helpを除くsuccess/failureを1件のstructured JSONとして返すことを要求している。現在のCLI testはargparseを通過した後の`--approved`不足しか検証しておらず、実際のargv errorを覆っていない。
**Fix:** `ArgumentParser.error()`をoverrideしてtyped request errorをraiseするか、parser層をstructured failureへ変換し、既存の`_failure_payload`相当をstdoutへ一度だけ出してinput exit classを返す。missing option、unknown subcommand、invalid option valueのsubprocess testsを追加し、通常の`--help`だけは既存help出力を維持する。

### CR-05: subprocess出力上限がcapture完了後にしか適用されない

**Severity:** Critical
**File:** `src/ai_coding_template_ja/openspec_gsd_handoff/preflight.py:109-124`
**Issue:** `subprocess.run(capture_output=True)`はchildのstdout/stderrを無制限にmemoryへ収集し、終了後に初めて4 MiB上限を確認する。外部tool outputが巨大な場合、上限判定へ到達する前にbridge processがmemory exhaustionで落ち得るため、threat modelとplanが要求するbounded subprocess boundaryになっていない。timeoutは時間だけを制限し、出力量を制限しない。
**Fix:** `Popen`で両pipeをincrementalに読み、各streamを`COMMAND_OUTPUT_LIMIT + 1`までだけ保持し、超過時にchildをterminate/killしてwaitするbounded runnerへ変更する。stdout/stderrそれぞれの境界値と超過、および超過childのreapingを回帰testで確認する。

## Warnings

なし。

## Info

なし。

---

_Reviewed: 2026-07-15T07:57:35Z_
_Reviewer: the agent (gsd-code-reviewer via generic-agent workaround)_
_Depth: standard_
