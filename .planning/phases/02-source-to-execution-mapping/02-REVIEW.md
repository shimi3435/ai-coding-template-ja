---
phase: 02-source-to-execution-mapping
reviewed: 2026-07-21T17:53:47Z
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
  critical: 2
  warning: 2
  info: 0
  total: 4
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-07-21T17:53:47Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Canonical source `fbe7f714f734d714480583ab90f41ec0d2077f50`、Phase 2 plans、49-ID fixture、policy registry、refresh preview/apply、および対象 tests/fixtures を照合した。49-ID mapping、tracked preview hashes、protected subtrees、no-op、approval-bound isolated apply、CLI非拡張は期待どおり確認できた。一方、canonical path / symlink の fail-closed 契約を破る読取経路が2件、structured Result seam と read-only mutation evidence の堅牢性問題が2件ある。

## Narrative Findings (AI reviewer)

### Critical Issues

#### CR-01: [BLOCKER] Planning inventory が symlink・`..`・絶対パスを canonical input として受理する

**File:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/execution_mapping.py:439-445`
**Issue:** `inventory_path` を lexical validationせず `(root / inventory_path).resolve(strict=True)` した後に `target.is_symlink()` を確認しているため、symlink情報は既に失われる。隔離再現では、内部 symlink、`nested/../inventory.json`、repository内の絶対パスがすべて `Success` になった。これは canonical repository-relative path、symlink/alias拒否、whole-operation fail-closed 契約に反する。また `read_bytes()` は descriptor-anchored/limit+1 read ではないため、検査と読取の間のpath置換も固定できない。

**Fix:** `inventory_path` を resolve 前に POSIX relative/NFC/`.`/`..`/absolute/backslash/NUL 規則で検証し、repository descriptorから各componentを `O_NOFOLLOW` で開く。各descriptorとdirectory entryのidentityを読取後にも再検証し、`_MAX_BYTES + 1` のbounded readを行う。symlinkまたは非canonical pathは `mapping-inventory-path-invalid` の `Failure` にする。

#### CR-02: [BLOCKER] Refresh preview の canonical reads に symlink-swap TOCTOU が残る

**File:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py:241-255`
**Issue:** `_read_bounded()` は各componentの `is_symlink()`、`resolve()`、`is_file()`、`open()`を別々のpathname operationとして行う。最後のcheck後から`open()`までにfileまたはdirectory componentをsymlinkへ差し替えると、`open()`がrepository外をfollowできる。preview生成とapply時のfresh guardがこのhelperを使うため、canonical artifact/source/target観測をno-follow identityへ固定できず、specのpath/symlink escape fail-closed契約を満たさない。

**Fix:** pathnameの事前checkを廃し、Phase 1の `read_repository_bytes_at()` と同じ repository-root descriptor、componentごとの `O_NOFOLLOW`、entry/descriptor identity再検証、limit+1 readを使う。preview開始時と再観測時の双方で同じanchored readerを共有する。

### Warnings

#### WR-01: [WARNING] Invalid registry が structured non-success ではなく `AttributeError` を送出する

**File:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/policy_reference.py:737-740`
**Issue:** `validate_policy_references()` は `registry` の型確認前に `_validate_registry()` を呼び、`None` 等では `registry.version` の `AttributeError` が外へ漏れる。隔離再現で `validate_policy_references(None, (), ())` がraiseした。`build_manifest_mappings()` と refresh preview もこのseamを経由するため、malformed programmatic inputでResult契約を維持できない。

**Fix:** public seam入口で `type(registry) is PolicyReferenceRegistry` を検査し、`policy-registry-invalid` の `Failure` を返す。`_validate_registry()` 自体も属性参照前に型を検証し、caller間で例外漏れを再発させない。

#### WR-02: [WARNING] Tracked preview の mutation-count evidence は adapter が未接続で反証能力がない

**File:** `/home/shimi3435/workspace/python/ai-coding-template-ja/src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py:512-516`
**Issue:** `preview_manifest_refresh(..., operations=operations)` は直後に `del operations` する。`tests/test_handoff_manifest_refresh.py:276-281` は recording adapter の mutation list が空であることをtracked evidenceへ保存するが、production codeがadapterを一度も使わないため常に空になる。将来preview内へ直接filesystem mutationが混入しても、このassertionは検出しない。

**Fix:** previewの全filesystem accessをread-only operations boundary経由にしてmutating methodsをrecord/forbidし、渡されたadapterを実際に使用する。代替として未接続parameterとmutation-count claimを削除し、hash/staging/diff invarianceだけを検証済み evidence として扱う。

---

_Reviewed: 2026-07-21T17:53:47Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
