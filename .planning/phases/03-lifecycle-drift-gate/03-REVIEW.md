---
phase: 03-lifecycle-drift-gate
reviewed: 2026-07-28T05:23:31Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - src/ai_coding_template_ja/openspec_gsd_handoff/execution_mapping.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py
  - src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py
  - tests/fixtures/openspec_gsd_handoff/lifecycle/expected-lifecycle-evidence.json
  - tests/test_handoff_execution_mapping.py
  - tests/test_handoff_lifecycle_drift.py
  - tests/test_handoff_lifecycle_gate.py
findings:
  critical: 5
  warning: 1
  info: 0
  total: 6
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-07-28T05:23:31Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Phase 03 の lifecycle drift classifier、planning inventory、mapping readiness、公開 lifecycle gate、source identity validator、テストと portable evidence を HND-03 / HARD-R2 の fail-closed 契約に照らして標準深度でレビューした。

既存の対象スイートは 289 件すべて成功した。しかし追加の public-seam 反例では、リポジトリ外 manifest の受理、inventory に存在しない phase の clean admission、不正 Unicode による gate 例外終了、over-limit canonical observation への再利用可能 identity 発行、mapping API の malformed nested value による例外終了を再現した。いずれも「完全で相互整合した bounded evidence だけを admit し、不完全な観測は unknown として停止する」という Phase 03 の中核条件に反するため、出荷前修正が必要である。

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: 中間 symlink を通じてリポジトリ外の manifest が clean admission される

**Classification:** BLOCKER
**File:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py:268-294`
**Issue:** `_read_manifest_bytes` は最終ファイルだけを `O_NOFOLLOW` で開き、`.planning/openspec/<change-id>` の各親要素をリポジトリ descriptor から anchor していない。そのため `.planning/openspec` をリポジトリ外ディレクトリへの symlink に置き換えても、外部の `handoff.json` を読み、残りの canonical source / mapping paths がリポジトリ内で整合すれば `clean`, `admitted=True` になる。これは manifest trust boundary の path traversal であり、「exact tracked schema-2 manifest」を repository root に束縛できていない。

再現結果:

```text
clean True ()
```

**Fix:** manifest path を文字列結合した `Path` で開かず、repository root を `O_DIRECTORY | O_NOFOLLOW` で開いてから `.planning`、`openspec`、`change_id`、`handoff.json` を `dir_fd` 相対で一段ずつ開く。各段で `lstat`/`fstat` identity と期待 file type を検証し、読後にも全 chain を再検証する。中間 symlink、rename、親 identity 変更の public-gate regression を追加し、すべて unknown / non-admitted / identity `None` とする。

### CR-02: malformed canonical string が identity encoding まで到達して public gate を例外終了させる

**Classification:** BLOCKER
**File:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py:210-290`
**Issue:** `_is_complete_observation` / `_is_complete_progress` は nested string の型だけを確認し、UTF-8 scalar として encode 可能かを検証しない。boundary が `NormalizedTask.description="\ud800"` を含む complete-looking observation を返すと completeness を通過し、`lifecycle_gate.py:806-818` の decision identity encoding で `UnicodeEncodeError` が未処理のまま外へ出る。HND-03 が要求する `canonical-observation-incomplete` の unknown decision を返せず、外部観測値で gate を停止できる。

再現結果:

```text
UnicodeEncodeError: 'utf-8' codec can't encode character '\ud800'
```

**Fix:** canonical observation の唯一の completeness validator で、artifact path/digests、task id/description、changed source ID を含む全 nested string を UTF-8 encode してから比較・sort・identity generation を許可する。encode failure は `False` に集約し、public classifier/gate で `canonical-observation-incomplete`、空 evidence、identity `None` を返す regression を追加する。

### CR-03: over-limit canonical Progress が unknown ではなく complete drift と再利用可能 identity になる

**Classification:** BLOCKER
**File:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py:210-290`
**Issue:** observation producer は `MAX_TASKS=4096` と artifact byte/count limits を持つが、外部 boundary 値を再検証する completeness seam には task count、artifact count、changed-ID count、aggregate byte bound がない。4097 tasks の internally consistent `Progress` を source-commit observation に入れると、公開 gate は malformed/over-limit unknown ではなく `DRIFTED` と評価し、`decision_identity` まで発行する。Plan 03-01/03-07 の bounded observation と「malformed canonical evidence は identity を持たない」という契約、および DoS threat mitigation を満たさない。

再現結果:

```text
drifted False ('manifest-progress-mismatch',) decision_identity_present=True
```

**Fix:** public classifier が受け取る in-memory observation にも producer と同じ上限を適用する。少なくとも artifacts、progress.tasks、changed IDs の件数と全 nested UTF-8 bytes の aggregate 上限を、iteration/sort/encoding 前に確認する。4096/4097 境界を classifier の expected/observed 両側と `gate_lifecycle_operation` で固定し、limit+1 は wholly unknown かつ identity `None` とする。

### CR-04: PlanningInventory に存在しない phase が両 graph にあれば finalize が clean admission される

**Classification:** BLOCKER
**File:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py:436-462`
**Issue:** `_validate_phase_graph` は inventory の各 phase が `observed_nodes` に存在することだけを確認し、逆方向の完全性を確認しない。したがって expected/observed の両方に同じ未宣言 phase を追加すると `_phase_changes` も差分を検出せず、mapping readiness は inventory の phase だけを検証するため、`FINALIZE` まで `clean`, `admitted=True` になる。完全な phase graph と explicit planning inventory の相互整合が部分集合検査に縮退しており、未宣言 phase の plan/evidence readiness を完全に迂回できる。

再現結果:

```text
clean True ()
```

**Fix:** current/observed graph と PlanningInventory の phase ID/path 集合を双方向に照合する。phase addition を complete drift として扱う場合は、observed graph と current inventory の双方に追加 phase を要求し、source-pinned expected graph との差として分類する。expected/observed の両方だけに extra phase があるケース、および inventory のみ/graph のみの各不一致を public gate regression に追加する。

### CR-05: mapping public APIs が SourceIdentityState / ManifestMapping の nested 値を検証前に使用して例外終了する

**Classification:** BLOCKER
**File:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/execution_mapping.py:650-728,1050-1095`
**Issue:** `build_manifest_mappings` と `validate_mapping_readiness` は `SourceIdentityState` の outer instance だけを確認した後、直ちに `item.id` を参照する。また readiness は `ManifestMapping` member の outer typeだけを確認し、nested fields を set/equality に使う。`active=(None,)` は両 public API で `AttributeError`、`ManifestMapping.source_id=[]` は readiness で `TypeError` になる。Phase 03 で安全な `validate_source_identity_state` が追加されたにもかかわらず mapping consumers が再利用しておらず、同じ runtime boundary に安全な authority と unsafe な部分 authority が併存している。

再現結果:

```text
build AttributeError 'NoneType' object has no attribute 'id'
readiness AttributeError 'NoneType' object has no attribute 'id'
readiness TypeError unhashable type: 'list'
```

**Fix:** 両 API の最初で `validate_source_identity_state` を呼び、成功値以外を structured mapping failure に変換する。`mappings` も exact tuple/member type の後、全 scalar、nested tuple、member string、ordering/uniqueness/canonical path invariants を検証してから set construction と `_expected_mappings` 比較を行う。outer/container/member/field の malformed matrix を builder/readiness の公開 seam に追加する。

## Warnings

### WR-01: mapping projection が二重実装され、builder と readiness の authority が分岐し得る

**Classification:** WARNING
**File:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/execution_mapping.py:695-767`
**Issue:** `build_manifest_mappings` の `ManifestMapping` 構築式と `_expected_mappings` は、phase lookup、plan/evidence selection、sorting をほぼ同一コードで別実装している。readiness は後者との exact equality を authority にするため、片側だけの将来修正で builder 自身の出力を `mapping-set-conflict` として拒否したり、evidence ownership semantics が二つに分岐したりする。Phase 03 が目標とする単一 validation/admission authority に対する保守上の不整合要因である。
**Fix:** validated `PlanningInventory` から canonical mapping tuple を作る private pure function を一つにし、builder と readiness の双方から呼ぶ。source coverage と policy validation は projection の前段に残し、projection semantics を複製しない。

## Verification Performed

- `uv run pytest tests/test_handoff_execution_mapping.py tests/test_handoff_lifecycle_drift.py tests/test_handoff_lifecycle_gate.py -q` — 289 passed
- public-seam probe: intermediate `.planning/openspec` symlink — `clean True`
- public-seam probe: inventory 未宣言 extra phase in both graphs — `clean True`
- public-seam probe: malformed canonical Unicode — `UnicodeEncodeError`
- public-seam probe: 4097-task canonical Progress — `drifted`, reusable identity present
- public mapping probes: malformed source state / mapping member — `AttributeError` / `TypeError`

---

_Reviewed: 2026-07-28T05:23:31Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
