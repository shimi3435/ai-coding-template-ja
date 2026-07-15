---
phase: 01-bridge-core-persistence-and-preflight
fixed_at: 2026-07-15T08:28:29Z
review_path: .planning/phases/01-bridge-core-persistence-and-preflight/01-REVIEW.md
iteration: 2
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 1: Code Review Fix Report

**Fixed at:** 2026-07-15T08:28:29Z
**Source review:** `.planning/phases/01-bridge-core-persistence-and-preflight/01-REVIEW.md`
**Iteration:** 2

**Summary:**
- Findings in scope: 4
- Fixed: 4
- Skipped: 0

## Fixed Issues

### CR-06: manifest内change IDの不一致でstatic symlink guardを迂回できる

**Files modified:** `tests/test_handoff_manifest.py`, `src/ai_coding_template_ja/openspec_gsd_handoff/__init__.py`, `src/ai_coding_template_ja/openspec_gsd_handoff/manifest.py`
**RED commit:** 882027b
**GREEN commit:** ab49e90
**Applied fix:** requested change IDとparsed manifest IDをexact比較し、noncanonical manifest target tailをfail-closedにした。mismatch単体とstatic parent symlink併用の両方でmutation zeroを確認した。
**Tests:** `test_mark_started_rejects_mismatched_manifest_identity_before_mutation`、manifest focused test、Ruff、basedpyright。
**Verification note:** path/state guard logicのためfixed、human review推奨。

### CR-07: manifest parserがcanonical pathのlexical aliasを受理する

**Files modified:** `tests/test_handoff_manifest.py`, `src/ai_coding_template_ja/openspec_gsd_handoff/manifest.py`
**RED commit:** ccc9163
**GREEN commit:** 2a2058b
**Applied fix:** raw pathと`PurePosixPath.as_posix()`のexact一致を要求し、canonical `PurePosixPath`でduplicate/orderを検証する。`./`、重複separator、alias duplicateをparse/transitionの双方で拒否する。
**Tests:** `test_parser_and_transition_reject_lexical_path_aliases`、manifest focused test、Ruff、basedpyright。
**Verification note:** canonical parser/state-transition logicのためfixed、human review推奨。

### CR-08: 既存manifestを上限なしで読み込みJSON parseする

**Files modified:** `tests/test_handoff_manifest.py`, `src/ai_coding_template_ja/openspec_gsd_handoff/__init__.py`, `src/ai_coding_template_ja/openspec_gsd_handoff/manifest.py`
**RED commit:** a1dd5cc
**GREEN commit:** 98bcf16
**Applied fix:** canonical tasks 1 MiBと4096-task/64-artifact envelopeから8 MiBのmanifest memory上限を導き、`limit + 1` binary readerをrepository guardと`mark-started`で共有した。description合計もcanonical tasks fileの1 MiBに制限し、無制限`read_bytes()`を除去した。
**Tests:** exact 8 MiB boundary、boundary+1、1 MiB超description、repository/mark-startedのoversized既存manifest mutation-zero、manifest focused test、Ruff、basedpyright。
**Verification note:** resource/state guard logicのためfixed、human review推奨。

### CR-09: in-change symlinkでinspectだけ非canonical artifactを成功扱いする

**Files modified:** `tests/test_handoff_discovery.py`, `tests/test_handoff_cli.py`, `src/ai_coding_template_ja/openspec_gsd_handoff/reader.py`
**RED commit:** 22b098c
**GREEN commit:** 316900a
**Applied fix:** reader境界でkind別logical canonical pathを固定し、artifact fileまたはcanonical path内parentのstatic symlinkを拒否した。成功時のartifact pathはresolved targetでなくlogical canonical repo-relative pathを保持する。component-swap/race hardeningは追加していない。
**Tests:** singleton file symlink、spec parent symlinkのdiscovery/`inspect_handoff` fail-closed、core/discovery/CLI focused test、Ruff、basedpyright。
**Verification note:** path canonicality logicのためfixed、human review推奨。

## Skipped Issues

なし。

## Aggregate Verification

- Phase 1 focused tests: 96 passed
- `task check`: 177 passed、Ruff format/check、basedpyright成功
- module help: `inspect`, `prepare`, `mark-started`を表示しexit 0
- hardening、component-swap/race対策、retry、resume、finalize、lifecycle、new dependencyは追加していない

---

_Fixed: 2026-07-15T08:28:29Z_
_Fixer: the agent (gsd-code-fixer via generic-agent workaround; orchestrator-managed isolation)_
_Iteration: 2_
