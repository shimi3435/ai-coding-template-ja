---
phase: 03-lifecycle-drift-gate
verified: 2026-08-08T11:43:23Z
status: gaps_found
score: 3/10 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 10/10
  gaps_closed: []
  gaps_remaining:
    - "Refresh apply の canonical target 再確認不足"
    - "Refresh production API の change/Phase 02/test fixture 固定"
    - "NFD source path から自己再現不能な NFC identity を生成"
    - "Canonical drift classifier の getter 例外漏出"
    - "Migration public input の collection/operations 検証不足"
  regressions:
    - "03-REVIEW.md が clean から issues_found（Critical 4 / Warning 1）へ更新された"
gaps:
  - truth: "Approval-relevant evidence remains bound to the canonical target through the protected refresh effect."
    status: failed
    reason: "apply_manifest_refresh は replace 後も置換前 parent descriptor を再読するため、canonical parent rebind 後に detached candidate を検証して Success を返す。"
    artifacts:
      - path: "src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py"
        issue: "1327-1350 が fresh canonical anchor ではなく target_anchor.descriptor を再利用する。"
      - path: "tests/test_handoff_manifest_refresh.py"
        issue: "migration にある post-replace parent-rebind 回帰に相当する refresh 回帰がない。"
    missing:
      - "replace 後に repository anchor から canonical parent を no-follow で開き直す。"
      - "fresh parent identity と candidate bytes を検証してから Success を返す。"
      - "refresh parent-rebind / fresh-reread-failure の public regression tests を追加する。"
  - truth: "Every later lifecycle operation can consume a generic fresh drift/refresh decision rather than one change-specific fixture."
    status: failed
    reason: "preview/apply refresh が固定 source counts、created/updated IDs、Phase 02、tests/fixtures の assignment path に依存し、正しい別 change/phase や installed wheel で成立しない。"
    artifacts:
      - path: "src/ai_coding_template_ja/openspec_gsd_handoff/manifest_refresh.py"
        issue: "66-71, 699-724, 886-916 に change-specific constants、target_phase_id='02'、test fixture path が埋め込まれている。"
    missing:
      - "previous/candidate から差分を導出し、fixed source-count/ID allowlist を除去する。"
      - "target phase と assignment/policy source を caller input と preview identity に束縛する。"
      - "別 change、Phase 02 のない valid inventory、installed wheel の public regressions を追加する。"
  - truth: "Canonical source identity is stable and reusable for every accepted canonical path."
    status: failed
    reason: "NFD filesystem path を受理して NFC path を永続化するため、最初の read は Success でも保存 path は存在せず、次回 read が source-path-unreadable になる。"
    artifacts:
      - path: "src/ai_coding_template_ja/openspec_gsd_handoff/source_identity.py"
        issue: "412-431 は NFC 化した値を返すが raw segment と NFC の byte-for-byte 一致を要求しない。"
      - path: "tests/test_handoff_identity.py"
        issue: "NFD 単独 path を source-path-noncanonical とする回帰がない。"
    missing:
      - "raw path segment が NFC と一致しない場合は source-path-noncanonical で拒否する。"
      - "NFD 単独 path の public reader regression を追加する。"
  - truth: "Malformed or adversarial structured canonical observations become identity-free UNKNOWN and never raise."
    status: failed
    reason: "CanonicalArtifactObservation subclass の path getter が RuntimeError を送出すると public classifier が canonical-observation-incomplete を返さず例外を漏出する。"
    artifacts:
      - path: "src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py"
        issue: "242-310, 358-371 の completeness validation/comparison に ordinary Exception boundary がない。"
      - path: "tests/test_handoff_lifecycle_drift.py"
        issue: "source_items.active getter は覆うが outer/artifact/progress/task getter を覆わない。"
      - path: "src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py"
        issue: "boundary call 後の structured value validation/projection が同種の例外を totalize しない。"
    missing:
      - "classifier validation/comparison と gate projection を ordinary Exception 境界に含める。"
      - "BaseException は伝播させたまま、左右両 side の outer/artifact/progress/task/graph/capability getter regressions を追加する。"
  - truth: "Migration public seams return structured failure for malformed collection and operations inputs."
    status: partial
    reason: "current_artifacts/source_paths/explicit_matches の tuple 化と operations 使用が runtime validation より先で、None/object から TypeError/AttributeError が漏れる。最新 review は Warning と分類している。"
    artifacts:
      - path: "src/ai_coding_template_ja/openspec_gsd_handoff/manifest_migration.py"
        issue: "1584-1640, 2114-2152 に collection/operations runtime validation がない。"
    missing:
      - "non-string Sequence、member、limits、operations adapter を filesystem work 前に検証する。"
      - "ordinary iteration/getter errors を既存または明示的な structured invalid result に正規化する。"
---

# Phase 3: Lifecycle Drift Gate Verification Report

**Phase Goal:** Every lifecycle operation planned after this phase can rely on the same fresh, fail-closed drift decision.
**Verified:** 2026-08-08T11:43:23Z
**Status:** gaps_found
**Re-verification:** Yes — 旧 passed レポートを、HEAD `3861162` の最新 execute:post review と actual code に対して再評価

## Verdict

Phase 3 goal は現行コードでは未達である。既存 970-test suite（execute:post 提供結果）と今回の focused passing checks は既存ケースを通すが、未検証の public seam で Critical 4 件を再現できる。特に refresh apply は canonical target が候補値でない状態でも `Success` を返し、canonical drift classifier は malformed structured input を `UNKNOWN` にせず例外を漏出する。これは fail-closed decision boundary の中心契約を直接破る。

旧レポートの「REVIEW clean」「review findings 0」という根拠は失効した。最新 `03-REVIEW.md` は `status: issues_found`, Critical 4, Warning 1 であり、Plan 03-23 の clean-review must-have を満たさない。SUMMARY の 29/29 完了や 970 tests pass は goal achievement の代替証拠として扱っていない。

## Goal Achievement

### Observable Truths

| # | Truth | Status | Actual evidence |
|---:|---|---|---|
| 1 | Complete canonical inputs classify deterministically as clean/drifted/unknown without partial green. | ✗ FAILED | Artifact getter `RuntimeError` が public classifier から漏出した。 |
| 2 | Malformed/noncanonical/over-limit observations become unknown before comparison, sorting, identity, or remediation. | ✗ FAILED | NFD path が一度 Success し、存在しない NFC identity を永続化する。getter input は例外になる。 |
| 3 | Plan/execute/resume/verify/finalize use the same freshly invoked public gate and declared horizons. | ✓ VERIFIED | `test_operation_matrix_uses_one_complete_gate` と stale replay regressionsを fresh runし、8 passed。 |
| 4 | Approval/effect boundaries bind complete current evidence through the protected effect. | ✗ FAILED | Parent rebind reproduction は `Success canonical_is_candidate=False detached_is_candidate=True`。 |
| 5 | Missing/malformed/incomplete evidence yields identity-free unknown and no remediation. | ✗ FAILED | Classifier getter case raises。migration malformed collection/operations も raw exception を漏らす。 |
| 6 | Decision/source identity binds every accepted admission input and remains reusable. | ✗ FAILED | NFD accepted path の persisted NFC identity は filesystem 上に存在せず、次回 `source-path-unreadable`。 |
| 7 | Complete graph/capability drift exposes deterministic changed items, remediation, and next actions. | ✓ VERIFIED | canonical-source と phase/capability remediation の named testsを fresh runし、2 passed。 |
| 8 | Phase 3 TDD evidence keeps fixed I/O/race examples and approved bounded properties. | ✓ VERIFIED | Phase 3 の checkbox、A-P-GRAPH、B-P-PATH-ROLE properties と固定 race tests は存在する。新規 critical cases の欠落は別 truth を失敗させる。 |
| 9 | Reviewer evidence is reliable for every classification and approval decision. | ✗ FAILED | Generic refresh は Phase 02/test fixture 固定、refresh Success は canonical target と食い違い得る。 |
| 10 | Canonical Phase 3 exit evidence is clean before Phase 4. | ✗ FAILED | 最新 review は Critical 4 / Warning 1。SECURITY は旧 clean-review prerequisite に依存し、HND-03 Complete と旧 verification passed は現状と矛盾する。 |

**Score:** 3/10 truths verified; 0 present-but-behavior-unverified.

### Roadmap Success Criteria

| Roadmap contract | Status | Evidence |
|---|---|---|
| Shared clean/drifted/unknown classification across in-scope operations | ✗ FAILED | Structured artifact getter で classifier が crash する。 |
| Missing/unreadable/malformed/over-limit/incomplete observations stop progression | ✗ FAILED | NFD path の自己再現不能 identity と getter exception leakage。 |
| Approval evidence is input-bound and stale result cannot silently authorize effects | ✗ FAILED | Refresh は detached candidate を検証して canonical target 未更新のまま Success。 |
| Fixed public examples and approved property boundaries | ✓ VERIFIED | Phase 3 property familiesと固定 I/O/race tests の配置は維持される。 |

## Plan Must-Have Regression Map

旧 29/29 pass を quick regression check した結果、22 plan groups は基本成立を保つが、以下 7 groups は新規反例または exit gate の失効により未達となる。

| Plan | Status | Failed concern |
|---|---|---|
| 03-01 | ✗ FAILED | complete/unknown classifier contract が getter exception で total でない。 |
| 03-02 | ✗ FAILED | whole-operation incomplete evidence が必ず unknown になるという契約に反例。 |
| 03-04 | ✗ FAILED | 「malformed canonical structured results never raise」を直接否定。 |
| 03-17 | ✗ FAILED | 公開 refresh を 42/49/54 items、固定 IDs、Phase 02 に限定した実装が generic lifecycle goal と両立しない。 |
| 03-22 | ✗ FAILED | protected refresh effect 後の canonical target proof が欠ける。 |
| 03-23 | ✗ FAILED | clean review、zero-gap preflight、passed 10/10 verifier の全 exit conditions が現行状態で不成立。 |
| 03-29 | ✗ FAILED | source-state getter の局所 totality は通るが、同じ public classifier の artifact/progress structured members は total でない。 |

03-03, 03-05–03-16, 03-18–03-21, 03-24–03-28 の 22 groups は existence、基本 wiring、代表 named tests の quick regression check で新規 regression を認めなかった。ただし、これらの pass は上記 Blocker を相殺しない。

## Required Artifacts

Plan query は 89/89 artifacts を「exists/substantive」と報告した。しかし semantic contract を確認すると Plan 03-23 の exit artifacts は current truth を提供していない。

| Artifact | Expected role | Status | Details |
|---|---|---|---|
| `lifecycle_drift.py` | Total fail-closed classifier | ✗ DEFECTIVE | Getter exception を漏出。 |
| `lifecycle_gate.py` | Sole five-operation admission seam | ⚠ PARTIAL | 基本 five-operation/stale tests は pass。malformed returned structured member を totalize できない。 |
| `source_identity.py` | Stable canonical source identity | ✗ DEFECTIVE | NFD を NFC identity に暗黙変換。 |
| `manifest_refresh.py` | Generic preview/apply and protected persistence | ✗ DEFECTIVE | Detached-parent Success と change/Phase/test-fixture hardcode。 |
| `manifest_migration.py` | Structured migration preview/apply | ⚠ PARTIAL | Core migration flows pass。malformed collection/operations が raw exception。 |
| `execution_mapping.py` | Mapping readiness | ✓ VERIFIED | Focused current regressionで新規 gapなし。 |
| Six Phase 3 public test modules | Behavioral evidence | ⚠ INCOMPLETE | 646 passed は既存 evidence。Critical 4 counterexamplesを覆わない。 |
| `03-REVIEW.md` | Fresh clean review | ✗ FAILED | `issues_found`, 4/1/0/5。 |
| `03-SECURITY.md` | Current zero-open security evidence | ✗ STALE | `audited_head: 372f1d6`、fresh review clean を prerequisite とするが現行 review は issues_found。 |
| `.planning/REQUIREMENTS.md` | Correct HND-03 traceability | ✗ STALE | HND-03 Complete は actual blockers と矛盾。 |

## Key Link and Data-Flow Verification

Static plan query は 74/74 links を pattern match したが、Plan 03-23 の 2 links は body prose/stale report による false positive である。Semantic result は 72/74 wired、2/74 broken。

| From | To | Flow/guard | Status | Details |
|---|---|---|---|---|
| Public gate | canonical classifier | malformed structured result → UNKNOWN | ✗ BROKEN | Artifact getter exception が classifier/gate を crash させ得る。 |
| Refresh preview | refresh apply | exact approved preview → canonical target | ✗ BROKEN | Detached parent を再読し canonical path を再観測しない。 |
| Refresh preview/apply | mapping readiness | caller-declared target phase/source | ✗ BROKEN | Phase 02 と test fixture path が production 固定。 |
| Source reader | persisted source identity | accepted path → reusable canonical path | ✗ BROKEN | NFD input から存在しない NFC path を保存。 |
| Plan 03-23 summary | current REVIEW | fresh clean review | ✗ NOT_WIRED | Current review is issues_found。regex pattern query は body proseを拾う。 |
| SECURITY | current VERIFICATION | zero-open review prerequisite | ✗ NOT_WIRED | Security audit が前の clean review を前提にしている。 |
| Gate | graph/capability remediation | complete drift → deterministic targets/actions | ✓ WIRED | Named remediation tests 2 passed。 |

## Behavioral Spot-Checks

| Behavior | Command / seam | Result | Status |
|---|---|---|---|
| Five-operation gate and stale replay | 3 named pytest nodes | 8 passed in 1.58s | ✓ PASS |
| Canonical/phase/capability remediation | 2 named pytest nodes | 2 passed in 1.44s | ✓ PASS |
| Artifact getter totality | Direct public `classify_canonical_source_drift` reproduction | `RAISED RuntimeError: boom` | ✗ FAIL |
| NFD identity round trip | Direct public `read_source_inventory` reproduction | first Success; persisted path absent; second `Failure source-path-unreadable` | ✗ FAIL |
| Refresh parent rebind | Isolated public preview/apply with injected cooperating operations adapter | `Success canonical_is_candidate=False detached_is_candidate=True` | ✗ FAIL |
| Generic target phase | Isolated public preview with valid inventory remapped 02→07 | `Failure refresh-mapping-phase-unknown` | ✗ FAIL |
| Full project suite | execute:post evidence supplied to verifier; not rerun here | 970 passed | ℹ DOES NOT COVER COUNTEREXAMPLES |
| Prior-phase regression suite | execute:post evidence supplied to verifier; not rerun here | 437 passed | ℹ NO PHASE-3 GOAL PROOF |

## Probe Execution

Step 7c: SKIPPED。Phase plans/summaries に probe script 宣言はなく、`scripts/*/tests/probe-*.sh` も存在しない。

## Requirements Coverage

| Requirement | Canonical handle | Registry state | Verification status | Evidence |
|---|---|---|---|---|
| HND-03 | HARD-R2 | Complete | ✗ BLOCKED | Critical 4 件が fail-closed shared decision、stable identity、protected persistence、generic reuse を否定。 |

Phase 3 に割り当てられた orphaned requirement はない。HND-03 の registry checkbox/traceability row は、gap closure と fresh clean review/security/reverification の後にのみ Complete と再判定すべきである。

## Anti-Patterns and Review Gates

| File | Line | Pattern | Severity | Impact |
|---|---:|---|---|---|
| `manifest_refresh.py` | 66-71 | Production hardcode to one change/test fixture | 🛑 BLOCKER | reusable lifecycle operation にならない。 |
| `manifest_refresh.py` | 699-724 | Fixed source counts/IDs and Phase 02 | 🛑 BLOCKER | valid other inventoryを拒否。 |
| `manifest_refresh.py` | 1327-1350 | Detached descriptor reread | 🛑 BLOCKER | Success と canonical filesystem state が不一致。 |
| `source_identity.py` | 419-431 | Silent Unicode normalization | 🛑 BLOCKER | persisted identity が自己再現不能。 |
| `lifecycle_drift.py` | 242-371 | Missing ordinary-exception boundary | 🛑 BLOCKER | fail-closed public classifier が crash。 |
| `manifest_migration.py` | 1613-1640, 2123 | Validation after coercion/use | ⚠ WARNING | malformed public inputs が raw exception。 |

Modified Phase 3 production/test filesに unreferenced `TBD` / `FIXME` / `XXX` / `TODO` / `HACK` / placeholder marker はなかった。execute:post TDD review の commit-pattern violations 3 件は `MVP_MODE=false` のため advisory であり、この判定の blocker には数えていない。

## Security and Exit Evidence

`03-SECURITY.md` の frontmatter は `verified`, ASVS 1, open 0 だが、audited HEAD は `372f1d6` で、本文は `03-REVIEW.md status clean; 0/0/0/0` を fresh prerequisite と明記する。現行 HEAD `3861162` の review は `issues_found; 4/1/0/5` であるため、security artifact は current exit evidence として fail-closed に受理できない。新 findings のうち canonical-target mismatch、identity normalization、exception totality は既存 high threat closure claimsにも関係するため、修正後の再監査が必要である。

## Human Verification

なし。4 Critical は code inspection と read-only/isolated automated reproductionsで判定可能であり、visual/external-service/real-time human check を必要としない。

## Deferred Items

なし。Phase 4–6 の goals/success criteria は repository ownership、recovery/resume、finalization receiptを扱うが、上記 gaps を Phase 3 外へ明示的に引き受けていない。いずれも現行 Phase 3 の classifier/source identity/refresh apply contract 内の欠陥である。

## Gaps Summary

4 Critical blockers と 1 Warning が残る。共通根因は、既存 tests が正常系と既知の malformed family を広く覆う一方、(1) replace 後 canonical namespace の再束縛、(2) production API の change-independent inputs、(3) Unicode canonical path の冪等性、(4) well-typed adversarial getter の totality を検証していないことである。Phase 4 へ進む前に gap plans で修正・回帰テストを追加し、clean code review、security audit、HND-03 traceability、goal verification をこの順序で再生成する必要がある。

---

_Verified: 2026-08-08T11:43:23Z_
_Verifier: independent gsd-verifier_
