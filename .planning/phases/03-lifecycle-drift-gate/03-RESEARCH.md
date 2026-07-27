# Phase 03: Lifecycle Drift Gate Verification Gap Closure - Research

**Researched:** 2026-07-27
**Domain:** Python の fail-closed lifecycle admission、bounded structured validation、DAG 検証、repository-scoped identity、portable reviewer evidence
**Confidence:** HIGH

## User Constraints

- Phase requirement は `HND-03 / HARD-R2` に限定する。7 件の独立検証 blocker を閉じ、既に正しい lifecycle behavior を弱めない。 [VERIFIED: task input; `.planning/phases/03-lifecycle-drift-gate/03-VERIFICATION.md:8-71`]
- canonical OpenSpec が WHAT / WHY、requirements、scenarios、acceptance criteria、最終完了を所有する。GSD research / plan は仕様文を複製・再定義しない。 [VERIFIED: task input; `AGENTS.md` Workflow; `openspec/changes/harden-openspec-gsd-handoff-lifecycle/specs/openspec-gsd-handoff-lifecycle-hardening/spec.md:119-137`]
- Phase 03 の `CONTEXT.md` は存在せず、利用者は context なしでの gap-closure research 継続を明示承認済み。 [VERIFIED: task input; `init.phase-op 03` result `has_context=false`]
- security enforcement は有効、ASVS Level 1、高 severity は block。TDD と Nyquist validation は有効。 [VERIFIED: task input; `.planning/config.json` `workflow.security_*`, `workflow.tdd_mode`, `workflow.nyquist_validation`]
- 変更対象はこの `03-RESEARCH.md` だけとし、plans、実装、tests、STATE、ROADMAP、review、verification を変更・commit しない。 [VERIFIED: task input]
- real OpenSpec / GSD / host smoke は opt-in のまま通常 CI と deterministic lifecycle evidence から分離する。 [VERIFIED: `.planning/ROADMAP.md` Overview; `.planning/phases/03-lifecycle-drift-gate/03-03-PLAN.md:1-275`]

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|---|---|---|
| HND-03 / HARD-R2 | plan / execute / resume / verify / finalize 前に canonical source、source commit、manifest、stable mapping、phase state、capability evidence を同じ契約で照合し、不完全観測を unknown として停止する。 | 7-gap implementation map、validation-before-normalization、bounded DAG validation、complete public projection、repository-bound replay protection、portable evidence schema、Nyquist test map を提示する。 [VERIFIED: `openspec/changes/harden-openspec-gsd-handoff-lifecycle/specs/openspec-gsd-handoff-lifecycle-hardening/spec.md:119-137`] |

</phase_requirements>

## Project Constraints (from AGENTS.md)

| Directive | Planning / Execution Consequence |
|---|---|
| 返答は日本語。不確実な点を断定せず、未実行検証を明記する。 | Summary と検証報告を日本語で作り、RED/GREEN/REFACTOR の実行結果を実測値として残す。 [VERIFIED: `AGENTS.md` Communication] |
| 変更は必要最小限。無関係な refactor をせず、既存設計意図を尊重し、単一ファイル肥大化と曖昧な命名を避ける。 | 既存の `_is_complete_observation`、`_valid_limits`、`_validate_phase_nodes`、`_decision_from_observation`、`_decision_identity`、test-side producer を局所修正し、新しい admission seam を作らない。 [VERIFIED: `AGENTS.md` General Engineering Rules] |
| スコープ外の重大な正確性・security・data-loss・将来 blocker は勝手に直さず記録し、外部 issue write は人の確認なしに行わない。 | 7 blocker 以外の仕様拡張を実装 task に混ぜない。追加発見は summary の follow-up として提案だけ残す。 [VERIFIED: `AGENTS.md` General Engineering Rules] |
| OpenSpec が仕様と最終完了を所有し、GSD は詳細 plan / phase 進捗のみを所有する。GSD は仕様・受入条件を再定義しない。 | HARD-R2 の既存 scenario と issue code を保持し、gap closure を新 requirement として書き換えない。 [VERIFIED: `AGENTS.md` Workflow; `docs/agents/workflow.md`] |
| 実装主体は対応 task 完了時に canonical `tasks.md` の境界 checkbox を更新するが、GSD 詳細 task を OpenSpec に複製しない。 | gap plans の完了後も OpenSpec 側は境界 gate だけを main 実行主体が更新する。 [VERIFIED: `AGENTS.md` Workflow] |
| 成果物の新規作成・大幅変更は原則新規 context の subagent に委譲し、main が検証する。 | executor は計画どおり isolation された plan 実行を使い、main は public-seam regressions と `task check` を再確認する。 [VERIFIED: `AGENTS.md` Workflow] |
| 仕様穴は `spec-holes` で列挙し、可能なら example / Hypothesis に落とす。TDD を使う。 | 既存 HARD-R2 H01-H12 対応を維持し、今回の 7 反例は fixed examples とする。Hypothesis は既存 checkbox normalizer の 1 family だけに保つ。 [VERIFIED: `AGENTS.md` Workflow; `.agents/skills/spec-holes/SKILL.md`; `.agents/skills/tdd/SKILL.md`; OpenSpec `design.md:359-374,465-503`] |
| library / CLI の実装前仕様は Context7 で確認する。 | 今回は新 library / CLI API を導入せず、Python stdlib と既存 public seams のみを使う。追加 dependency が提案された場合だけ別途 Context7 と package legitimacy gate が必要。 [VERIFIED: `AGENTS.md` Tools; current plans 03-04/05/06 package-supply-chain disposition] |
| 変更後は対象に近い tests を実行し、少なくとも `task check` の実行可否を確認する。 | 各 TDD slice で focused command、wave merge で両 lifecycle files、phase gate で `task check` を実行する。 [VERIFIED: `AGENTS.md` Validation; `.agents/skills/verify-change/SKILL.md`] |
| destructive change、大量削除、大規模 dependency update は事前確認。secret を repository / logs に保存しない。 | dependency 変更、canonical artifact 書換え、tracked handoff mutation、raw repository path の portable evidence 出力を行わない。 [VERIFIED: `AGENTS.md` Safety; `docs/agents/safety.md`] |

## Summary

7 blocker は、(1) 未信頼 structured input を属性参照・正規化・比較より前に完全検証できていない、(2) lower-level の完全な drift evidence を唯一の public gate decision へ投影し切れていない、(3) admission identity と portable reviewer evidence の identity scope を混同している、の三群に整理できる。既存 architecture、issue code、operation matrix、normalizer、mapping readiness、identity framing、golden producer は維持でき、追加 dependency や新しい public admission API は不要である。 [VERIFIED: `lifecycle_drift.py:45-73,208-263`; `lifecycle_gate.py:73-219,326-455,468-623,742-1147`; `03-VERIFICATION.md:163-181`]

実装順は既存 gap plans と整合する。03-04 で malformed canonical `Success` を public classifier 上の unknown に変換し、03-05 で nested limits、host inspection、raw phase shape / uniqueness、DAG を observation 完成前に拒否し、03-06 で public decision projection と repository-scoped identity、portable evidence v2 を同時に完成させる。この順序なら 03-06 の evidence regeneration は前段の fail-closed behavior を含む最終 backstop になる。 [VERIFIED: `03-04-PLAN.md`; `03-05-PLAN.md`; `03-06-PLAN.md`]

最重要の contract tension は repository identity と golden portability である。`SourceCommitObservation.repository_root` を digest に bind すると安全な cross-repository replay rejection が可能になる一方、raw digest は pytest の temporary root に依存する。したがって production decision は resolved real path を versioned digest に含めるが、tracked / golden JSON は raw path・current identity・prior identity を持たず、same-root stability、cross-root separation、foreign-root replay rejection の固定 relation booleans だけを持つべきである。 [VERIFIED: `lifecycle_gate.py:87-95,372-384,742-768,900-939,1128-1147`; `tests/test_handoff_lifecycle_gate.py:563-583,959-1055`; `03-VERIFICATION.md:54-62`; `03-06-PLAN.md:165-180`]

**Primary recommendation:** 既存 public seams を保持したまま「raw validate → canonical normalize → compare/project → identity bind → prior identity check」の順序を強制し、7 反例を public seam の fixed regression と portable relation evidence で閉じる。 [VERIFIED: canonical HARD-R2; `03-04-PLAN.md`; `03-05-PLAN.md`; `03-06-PLAN.md`]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| malformed canonical observation rejection | API / Backend domain core (`lifecycle_drift.py`) | Test seam | Pure public classifier が structured `Result` を unknown decision に変換し、filesystem mutation を持たない。 [VERIFIED: `lifecycle_drift.py:208-263`] |
| lifecycle input / capability / phase completeness | API / Backend admission core (`lifecycle_gate.py`) | External observation boundary | Public gate が admission を所有し、Git/tool/filesystem 値は `LifecycleObservationBoundary` 経由の未信頼 input として扱う。 [VERIFIED: `lifecycle_gate.py:160-190,468-623,1101-1147`] |
| bounded repository / manifest reads | Database / Storage (repository + Git) | API / Backend | 読取は size・identity・real-root を検査し、complete observation の材料だけを返す。 [VERIFIED: `lifecycle_gate.py:252-292,468-510`; `tests/test_handoff_lifecycle_gate.py:629-671`] |
| phase graph validity and canonical order | API / Backend domain core | Test seam | Raw shape / uniqueness / bounds / DAG は validity、tuple order normalization は identity determinism という別責務である。 [VERIFIED: `lifecycle_gate.py:202-203,326-369`; `03-VERIFICATION.md:18-26,63-71`] |
| public remediation / progress projection | API / Backend public decision | Canonical source classifier | Lower decision の paths / source IDs / progress を再分類せず immutable public decision へ投影する。 [VERIFIED: `lifecycle_drift.py:65-73,273-310`; `lifecycle_gate.py:994-1098`] |
| reusable decision identity | API / Backend security boundary | Database / Storage repository identity | Complete current observation と validated real repository path を versioned SHA-256 に bind し、prior value は constant-time comparison する。 [VERIFIED: `lifecycle_gate.py:742-768,900-991,1128-1147`] |
| portable reviewer evidence | Test / Evidence tier | API / Backend public decision | Production serializer を増やさず、test-side producer が public decision と固定 relation を deterministic JSON / literal golden にする。 [VERIFIED: `tests/test_handoff_lifecycle_gate.py:563-610,959-1055`; `03-03-PLAN.md`] |

## Phase 03 Seven-Gap Implementation Map

| Gap | Existing Symbols / Patterns to Reuse | Minimum Implementation Seam | Required Public Test | Expected Failure Signal Before Fix |
|---|---|---|---|---|
| G1 uninspected host admitted | `CapabilityObservation`, `_validate_capabilities`, `_capability_changes`, `_capabilities`, `FakeBoundary` | Require `host.inspected is True` for observed completeness; also add `host.inspected` to explicit capability comparison. Keep incomplete current evidence `UNKNOWN`, not ordinary drift. | `gate_lifecycle_operation` with current `inspected=False`; separate complete mismatch case for manifest/current inspection signal. Assert exact issue/target. | Current counterexample returns `clean`, `admitted=True`, `issue_codes=()`. [VERIFIED: `lifecycle_gate.py:410-455,652-693`; `03-VERIFICATION.md:9-17,167`] |
| G2 malformed / duplicate phase evidence normalized first | `PhaseNodeObservation`, `PhaseGraphObservation`, `_validate_phase_nodes`, `_validate_phase_graph`, `_normalize_phase_nodes`, `_phase_nodes`, `FakeBoundary` | Validate raw tuple, node type, field exact types, dependency tuple/member types, uniqueness and bounds before any normalization. Normalize only after both expected and observed pass. | Parametrize expected/observed side with `None`, wrong field types, non-tuple dependencies, duplicate node ID, duplicate dependency; assert unknown/no identity/no remediation. Retain valid reorder identity test. | `None` raises `AttributeError`; duplicate edge is deduplicated and admitted. [VERIFIED: `lifecycle_gate.py:326-369,387-407,559-570`; `03-VERIFICATION.md:18-26,168-170`] |
| G3 malformed nested `ArtifactLimits` crashes | `LifecycleGateLimits`, `ArtifactLimits`, `_valid_limits`, early `lifecycle-input-invalid`, boundary call counters | Validate outer and nested limit fields with `type(value) is int and value > 0` before root resolution, manifest read, or boundary call. | Four nested fields × wrong string / bool / zero / negative; assert exact issue and all boundary counters remain zero. | `max_files="bad"` reaches integer comparison and raises `TypeError`. [VERIFIED: `lifecycle_gate.py:73-84,206-219,483-488`; `reader.py:26-36,115`; `03-VERIFICATION.md:27-35,169-170`] |
| G4 malformed canonical structured success crashes | frozen canonical observation / decision dataclasses, `_is_complete_observation`, `_unknown`, `classify_canonical_source_drift`, `_assert_unknown` | Accept untrusted `object`; check top-level observation type, exact artifact tuple, artifact member type, then nested field types before cardinality / sort / digest access. Do not add broad catch or second sanitizer. | Expected and observed `Success(None)` / unrelated object; artifact tuple containing invalid member; artifact dataclass with invalid nested field. Assert stable unknown with empty evidence. | `Success(None)` and invalid member raise `AttributeError`. [VERIFIED: `lifecycle_drift.py:45-73,208-263`; `03-VERIFICATION.md:36-44,170-171`] |
| G5 public decision drops artifact paths / progress | `CanonicalSourceDriftDecision`, `LifecycleGateDecision`, `_decision_from_observation`, `_unknown_decision`, `_decision_view`, `_progress_view` | Add frozen public fields; copy lower values without recomputation; unknown uses `()` / `None`; bind public fields in decision-domain encoding and serialize portable values. | Extend canonical remediation, checkbox-only, and incomplete public-gate cases; update independent golden / tracked evidence exact comparison. | Fields are absent from public dataclass / JSON, so caller cannot observe them. [VERIFIED: `lifecycle_drift.py:65-73,273-310`; `lifecycle_gate.py:142-158,994-1098`; `03-VERIFICATION.md:45-53,171`] |
| G6 repository-unbound identity / cross-root replay | validated `SourceCommitObservation.repository_root`, `_IdentityEncoder`, `_decision_identity`, `hmac.compare_digest`, `_fixture`, evidence producer | Add exact `source_commit.repository_root` tag to existing v1 encoder. Remove raw repository-dependent identities from portable view; emit only shape/presence and three relation booleans under evidence schema v2. | Same-root repeat stable; byte-identical distinct roots differ; A prior identity in B returns stale/drifted/non-admitted; two producer roots yield byte-identical portable output. | Cross-root identities equal and foreign identity is admitted. Existing fixed digest golden becomes root-dependent after fix. [VERIFIED: `lifecycle_gate.py:87-95,372-384,742-768,900-939,1128-1147`; `03-VERIFICATION.md:54-62,172`; `03-06-PLAN.md:165-180`] |
| G7 cyclic phase graph admitted | G2 graph types / validator plus existing bounded limits; valid chain `_phase_nodes`; order-invariance test | After raw type/uniqueness/edge bounds, use one bounded iterative DAG check for both expected and observed graphs; cycle is incomplete observation. | Expected/observed × two-node / longer cycle; assert `lifecycle-phase-observation-incomplete`, unknown, no identity/remediation. Valid chain and reordered graph remain green. | Two-node cycle returns `clean`, `admitted=True`. [VERIFIED: `lifecycle_gate.py:326-358,696-710`; `tests/test_handoff_lifecycle_gate.py:320-326,1370-1398`; `03-VERIFICATION.md:63-71,172-173`] |

## Standard Stack

### Core

| Library / Runtime | Verified Version | Purpose | Why Standard Here |
|---|---|---|---|
| Python | 3.12.9 runtime; project requires `>=3.12` | frozen dataclasses, enums, exact runtime type checks, iterative graph validation | Current project runtime and typing syntax already use Python 3.12+; no runtime dependency change is needed. [VERIFIED: environment probe; `pyproject.toml:8`; `lifecycle_gate.py`] |
| Python stdlib `dataclasses`, `hashlib`, `hmac`, collections | Python 3.12.9 stdlib | immutable values, length-prefixed SHA-256 identity, constant-time prior comparison, bounded iterative DAG worklist | Existing implementation already uses these primitives and the gap plans preserve the encoder version and admission seam. [VERIFIED: `lifecycle_gate.py:5-13,742-768,900-1147`; `03-05-PLAN.md`; `03-06-PLAN.md`] |
| Existing lifecycle modules | repository current tree | canonical drift observation, manifest v2 parse, mapping readiness, progress and source identity | These modules already own the domain decisions; gap closure should compose them rather than duplicate classification. [VERIFIED: `lifecycle_gate.py:15-48`; `03-02-PLAN.md`] |

### Supporting

| Library / Tool | Verified Version | Purpose | When to Use |
|---|---|---|---|
| pytest | 9.1.1; lock upload 2026-06-19 | fixed public-seam regression tables and isolated temporary repositories | Every RED/GREEN slice and evidence byte comparison. [VERIFIED: environment probe; `uv.lock:3876-3888`; current 72-test lifecycle run] |
| Hypothesis | 6.155.7; lock upload 2026-06-21 | checkbox normalizer property only | Retain the sole existing `@given`; add no graph, identity, or malformed-input property family. [VERIFIED: environment probe; `uv.lock:1788-1796`; `tests/test_handoff_lifecycle_drift.py:443-503`; OpenSpec `design.md:302-306`] |
| Ruff / BasedPyright | Ruff 0.15.20; BasedPyright 1.39.9 | lint, format, static typing | Run on each touched source/test pair and in `task check`. [VERIFIED: `uv.lock:434-442,4264-4285`; `Taskfile.yml:35-40`] |
| uv / Task / Git | uv 0.11.26; Task 3.51.1; Git 2.34.1 | locked environment, project gate, source-pinned test evidence | Use existing commands; fixed argv Git access stays test-side and bounded. [VERIFIED: environment probe; `tests/test_handoff_lifecycle_gate.py:629-671`] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|---|---|---|
| Existing exact validators and stdlib worklist | Add a third-party schema or graph library | Rejected for this gap closure: expands supply-chain and API surface without replacing the existing public contract or bounds. [VERIFIED: current plans 03-04/05/06 explicitly install no package; `AGENTS.md` minimal-change rule] |
| Existing versioned length-prefix encoder | JSON / object `repr` digest | Rejected: ordering, type boundaries, and path-dependent representation would weaken the established identity contract. [VERIFIED: `lifecycle_gate.py:742-768`; `03-02-PLAN.md` identity contract] |
| Relation-based portable evidence | Pin a raw repository-bound digest | Rejected: correct repository binding makes the digest intentionally differ across temporary roots. [VERIFIED: gap G6; `03-06-PLAN.md:165-180`] |

**Installation:** No installation. This phase reuses the locked environment and adds no external package. [VERIFIED: 03-04/05/06 threat models; `pyproject.toml`; `uv.lock`]

## Package Legitimacy Audit

Not applicable. The recommended implementation adds no package and changes no dependency metadata; therefore the package legitimacy gate is not triggered. [VERIFIED: `03-04-PLAN.md`, `03-05-PLAN.md`, `03-06-PLAN.md`; current diff scope]

## Architecture Patterns

### System Architecture Diagram

```text
plan / execute / resume / verify / finalize caller
                         |
                         v
              gate_lifecycle_operation
                         |
              fresh observation every call
                         v
        validate operation + ALL nested limits
             | invalid
             +----------------------------> UNKNOWN / no identity
             |
             v
     bounded manifest read + exact v2 parse
             |
             v
  LifecycleObservationBoundary (Git / phase / capability)
             |
             v
 raw structured validation before dereference/normalization
   source shape | phase shape+unique+DAG | host inspected=true
             | incomplete
             +----------------------------> UNKNOWN / no partial evidence
             |
             v
 canonical normalization + source/mapping/phase/capability comparison
             |
             +-- complete mismatch -------> DRIFTED + remediation
             |
             v
 public decision projection (paths + IDs + progress + targets)
             |
             v
 versioned identity includes validated repository real path
             |
             +-- foreign/stale prior -----> DRIFTED + lifecycle-decision-stale
             |
             v
 CLEAN / admitted

Public decisions --> test-side portable producer --> relation booleans + literal golden
                                              (no raw repository path/identity)
```

The diagram reflects the canonical requirement that inability to complete any observation stops the operation as unknown, while complete mismatches are drifted and report remediation. [VERIFIED: OpenSpec `spec.md:119-137`; `lifecycle_gate.py:468-623,994-1147`]

### Recommended Project Structure

```text
src/ai_coding_template_ja/openspec_gsd_handoff/
├── lifecycle_drift.py          # canonical source observation and pure three-state classifier
└── lifecycle_gate.py           # sole five-operation admission gate and identity

tests/
├── test_handoff_lifecycle_drift.py
│                                # G4 public classifier regressions; sole checkbox property stays here
├── test_handoff_lifecycle_gate.py
│                                # G1-G3, G5-G7 public gate regressions and portable producer
└── fixtures/openspec_gsd_handoff/lifecycle/
    └── expected-lifecycle-evidence.json
                                 # independent literal portable v2 golden

.planning/phases/03-lifecycle-drift-gate/
└── 03-LIFECYCLE-EVIDENCE.json   # regenerated portable v2 tracked evidence
```

This is the existing responsibility split; no new production module or serializer is required. [VERIFIED: current source/tests; `03-04-PLAN.md`; `03-05-PLAN.md`; `03-06-PLAN.md`]

### Component Responsibilities

| Component | Owns | Must Not Own |
|---|---|---|
| `classify_canonical_source_drift` | Complete canonical observation comparison and stable unknown decision | Gate operation mapping, phase/capability admission, broad exception recovery. [VERIFIED: `lifecycle_drift.py:250-311`; `03-04-PLAN.md`] |
| `observe_lifecycle_operation` | Fresh, bounded, all-domain observation and pre-normalization completeness | Cached observation reuse, caller-provided readiness, partial green projection. [VERIFIED: `lifecycle_gate.py:468-623`; `03-02-PLAN.md`] |
| `gate_lifecycle_operation` | Sole admission decision and prior identity freshness check | Mutation, retry, rollback, route switch, new approval store. [VERIFIED: `lifecycle_gate.py:1101-1147`; OpenSpec HARD-R2] |
| `_decision_from_observation` | Deterministic complete public projection and remediation | Re-reading/reclassifying canonical bytes or inventing progress. [VERIFIED: `lifecycle_gate.py:994-1073`; gap G5] |
| `_decision_identity` | Versioned complete input / decision binding including repository identity | Portable reviewer serialization or timestamps / mtime / randomness. [VERIFIED: `lifecycle_gate.py:742-991`; `03-02-PLAN.md`] |
| test-side evidence producer | Public-decision serialization, deterministic relation proofs, protected-input invariance | Production admission authority, private encoder reproduction, repository mutation, real-tool smoke. [VERIFIED: `tests/test_handoff_lifecycle_gate.py:563-1055`; `03-03-PLAN.md`; `03-06-PLAN.md`] |

### Pattern 1: Validate Before Normalize or Dereference

**What:** Every externally supplied or boundary-returned value is treated as `object` until exact container/member/field checks succeed. Canonical sorting and set-like normalization happen only afterward. [VERIFIED: gap G2/G4; `03-REVIEW.md:35-128`]

**When to use:** Canonical structured `Success` payloads, nested `ArtifactLimits`, phase nodes/dependencies, capability observations. [VERIFIED: `03-VERIFICATION.md:8-71`]

### Pattern 2: Validity and Canonicalization Are Separate Gates

**What:** Duplicate edges and cycles are invalid evidence, not semantically equivalent order variants. Valid tuple order is normalized for comparison and identity only after validity is proven. [VERIFIED: `lifecycle_gate.py:202-203,326-369`; `03-VERIFICATION.md:18-26,63-71`]

**When to use:** Expected and observed phase graphs on every lifecycle operation. [VERIFIED: OpenSpec `spec.md:119-137`]

### Pattern 3: Lower Decision Projection Without Recomputation

**What:** `CanonicalSourceDriftDecision` remains the source of artifact paths, source IDs, and progress candidate. The public gate copies those values and adds cross-domain remediation; it does not parse tasks or source blocks again. [VERIFIED: `lifecycle_drift.py:65-73,273-310`; `lifecycle_gate.py:994-1073`]

**When to use:** G5 public fields and evidence serialization. [VERIFIED: `03-06-PLAN.md:121-149`]

### Pattern 4: Security Identity Separate from Portable Evidence

**What:** Runtime admission identity binds the resolved repository real path. Reviewer evidence proves identity relations while omitting raw path/digest values. [VERIFIED: G6; `03-06-PLAN.md:152-183`]

**When to use:** Same-root reuse, cross-root rejection, tracked evidence and independent golden regeneration. [VERIFIED: `tests/test_handoff_lifecycle_gate.py:959-1055`]

### Anti-Patterns to Avoid

- **Normalize before validating:** `_utf8_sorted` converts to `set` and can erase duplicates, so raw invalidity must be decided first. [VERIFIED: `lifecycle_gate.py:202-203,361-369`; G2]
- **Broad exception as validation:** catching `AttributeError` / `TypeError` after access hides which completeness contract failed and cannot prove zero boundary calls. Validate inputs explicitly. [VERIFIED: `03-04-PLAN.md`; `03-05-PLAN.md`]
- **Treat `bool` as positive integer:** Python booleans pass `isinstance(value, int)`; existing outer-limit contract uses exact `type(value) is int`. [VERIFIED: `lifecycle_gate.py:206-217`; G3 plan]
- **Treat cyclic graphs as drift:** a cycle is invalid / incomplete evidence even when expected and observed bytes match. It must be unknown before comparison. [VERIFIED: OpenSpec `spec.md:135-137`; G7]
- **Pin raw root-bound identities in golden JSON:** correct security binding makes them environment-dependent. Preserve only relation booleans. [VERIFIED: `03-06-PLAN.md:165-180`]
- **Add a second operation matrix or admission function:** the existing five-row `OPERATION_CASES` and `gate_lifecycle_operation` are the singular coverage and authority seams. [VERIFIED: `tests/test_handoff_lifecycle_gate.py:525-560`; `03-02-PLAN.md`; `03-03-PLAN.md`]
- **Move optional smoke into normal CI:** external-tool evidence remains separately opt-in and cannot substitute for deterministic regressions. [VERIFIED: `.planning/ROADMAP.md`; `03-03-PLAN.md`]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Canonical source classification | A second parser/classifier inside the gate | `classify_canonical_source_drift` and its immutable decision | Prevents divergence from checkbox-only and source-ID contracts. [VERIFIED: `lifecycle_drift.py:250-311`; `03-02-PLAN.md`] |
| Mapping readiness | A new ready boolean or copied mapping validator | `validate_mapping_readiness` with the existing operation horizon | Phase 2 owns point-in-time readiness and resume deliberately reuses execute. [VERIFIED: `lifecycle_gate.py:15-20,222-229,594-604`; `03-02-PLAN.md`] |
| Malformed-input recovery | Broad exception wrapper or coercive sanitizer | Ordered exact type/shape/bounds checks returning existing issue codes | Fail-closed behavior must identify incomplete observation without partial evidence. [VERIFIED: G2-G4] |
| Graph library / recursive walk | New dependency or unbounded recursive DFS | One bounded iterative DAG helper over already validated nodes/edges | Existing limits provide a finite workset and no package change is needed. [VERIFIED: `LifecycleGateLimits`; `03-05-PLAN.md`] |
| Decision digest | New JSON/repr encoder, timestamp, TTL, salt, cache | Existing `_IdentityEncoder`, SHA-256, `hmac.compare_digest` | Preserves versioned typed framing and current stale semantics. [VERIFIED: `lifecycle_gate.py:742-768,1128-1147`] |
| Reviewer evidence authority | Production serializer or copied private encoder | Existing test-side `_decision_view`, compact JSON producer, literal golden | Evidence observes the public seam and cannot become a second admission authority. [VERIFIED: `03-03-PLAN.md`; `tests/test_handoff_lifecycle_gate.py:563-610`] |
| Repository portability | Fake stable path or stripped runtime binding | Root-bound runtime identity plus root-free relation evidence | Preserves both security scope and byte-deterministic review artifacts. [VERIFIED: G6] |

**Key insight:** The existing system already contains the required authorities; the gaps are validation order, missing projection, and evidence representation. New abstractions would increase the number of authorities and make the fail-closed contract harder to verify. [VERIFIED: `03-VERIFICATION.md:114-135,179-181`; `AGENTS.md` minimal-change rule]

## Common Pitfalls

### Pitfall 1: A Type-Valid Boolean Is Mistaken for Completed Inspection

**What goes wrong:** `host.inspected=False` passes a bool check and can appear clean.
**Why it happens:** Completeness and field type were conflated.
**How to avoid:** Require exact `True` for current observation; retain explicit comparison as defense-in-depth.
**Warning signs:** Public decision is clean with no capability issue after setting only `inspected=False`. [VERIFIED: `03-REVIEW.md:35-54`]

### Pitfall 2: Set-Like Canonicalization Erases Invalid Duplicates

**What goes wrong:** Duplicate dependency edges become one edge before validation.
**Why it happens:** `_utf8_sorted` performs `set(values)`.
**How to avoid:** Check uniqueness on raw tuples before calling normalization.
**Warning signs:** Duplicate edge input preserves the baseline decision identity. [VERIFIED: `lifecycle_gate.py:202-203,361-369`; `03-REVIEW.md:55-73`]

### Pitfall 3: Bounds Exist but Nested Bounds Are Untrusted

**What goes wrong:** malformed `ArtifactLimits` reaches reader arithmetic and raises.
**Why it happens:** Only the container dataclass was checked.
**How to avoid:** Validate every nested numeric field as a positive exact integer at the public input gate.
**Warning signs:** Any boundary call counter increments for invalid limits. [VERIFIED: `03-REVIEW.md:74-88`; `03-05-PLAN.md:116-130`]

### Pitfall 4: Dataclass Construction Is Treated as Runtime Validation

**What goes wrong:** `Success(None)` or a dataclass containing invalid runtime members raises during completeness checking.
**Why it happens:** Python type annotations do not validate runtime values.
**How to avoid:** Validate top-level and nested members before attribute access.
**Warning signs:** Tests expect `AttributeError` instead of a stable unknown decision. [VERIFIED: `lifecycle_drift.py:208-237`; `03-REVIEW.md:89-108`]

### Pitfall 5: Lower-Level Evidence Is Lost at the Public Boundary

**What goes wrong:** callers know source drift occurred but cannot identify the artifact or checkbox progress candidate.
**Why it happens:** public dataclass projection covered source IDs and remediation only.
**How to avoid:** Add immutable fields, project directly, bind them in identity, and assert them in portable evidence.
**Warning signs:** test/evidence code must inspect `CanonicalSourceDriftDecision` privately. [VERIFIED: `03-REVIEW.md:109-128`; G5]

### Pitfall 6: Repository Binding Breaks Golden Determinism

**What goes wrong:** adding real path to identity changes every temporary-root digest, breaking fixed literals.
**Why it happens:** runtime security identity and reviewer transport format were treated as the same artifact.
**How to avoid:** assert digest shape and relations at runtime; serialize only fixed relation booleans.
**Warning signs:** golden JSON contains `/tmp/...`, `decision_identity`, or `prior_decision_identity`. [VERIFIED: `03-06-PLAN.md:165-180`]

### Pitfall 7: Finite Downstream Traversal Is Mistaken for DAG Validation

**What goes wrong:** `_downstream_phases` terminates because it tracks a set, but that does not make a cyclic declaration valid.
**Why it happens:** reachability and graph validity are different properties.
**How to avoid:** reject cycles before comparison and remediation traversal.
**Warning signs:** expected and observed identical cycles yield clean. [VERIFIED: `lifecycle_gate.py:696-710`; `03-REVIEW.md:148-162`]

### Pitfall 8: Updating Evidence Before All Behavioral Fixes Land

**What goes wrong:** tracked/golden evidence is regenerated around incomplete public behavior, producing churn or a misleading green artifact.
**Why it happens:** evidence schema change runs in parallel with prerequisite validation changes.
**How to avoid:** execute 03-04 and 03-05 first; make 03-06 depend on both and run all seven regressions before repinning.
**Warning signs:** evidence v2 commit precedes focused G1-G4/G7 green results. [VERIFIED: `03-06-PLAN.md` dependencies]

## Code Examples

Verified patterns and implementation sketches grounded in the existing contracts:

### Validate Canonical Observation Before Attribute Access

```python
# Source contract: lifecycle_drift.py:208-263; 03-04-PLAN.md
def _is_complete_observation(observation: object) -> bool:
    if not isinstance(observation, CanonicalSourceObservation):
        return False
    if type(observation.artifacts) is not tuple:
        return False
    if any(
        not isinstance(item, CanonicalArtifactObservation)
        for item in observation.artifacts
    ):
        return False
    # Validate nested runtime field types next.
    # Only then run cardinality, ordering, uniqueness, and digest checks.
```

This preserves existing `Failure` issue propagation while converting malformed `Success` payloads to `canonical-observation-incomplete`. [VERIFIED: `lifecycle_drift.py:250-263`; `03-04-PLAN.md`]

### Validate All Numeric Bounds at the Outer Gate

```python
# Source contract: lifecycle_gate.py:206-219; 03-05-PLAN.md
def _positive_exact_int(value: object) -> bool:
    return type(value) is int and value > 0

artifact_values = (
    limits.artifact_limits.max_files,
    limits.artifact_limits.bytes_per_file,
    limits.artifact_limits.bytes_total,
    limits.artifact_limits.change_id_bytes,
)
if not all(_positive_exact_int(value) for value in artifact_values):
    return False
```

Exact type checking intentionally rejects `True` and `False`. [VERIFIED: existing outer-limit implementation `lifecycle_gate.py:206-217`; G3 test contract]

### Validate Raw Phase Graph, Then Normalize

```python
# Source contract: lifecycle_gate.py:559-570; 03-05-PLAN.md
if not _validate_phase_graph(
    phase_graph,
    change_id=change_id,
    limits=limits,
):
    return _failure("lifecycle-phase-observation-incomplete")

phase_graph = replace(
    phase_graph,
    expected_nodes=_normalize_phase_nodes(phase_graph.expected_nodes),
    observed_nodes=_normalize_phase_nodes(phase_graph.observed_nodes),
)
```

The validator must include exact raw member checks, duplicate rejection, bounds, and acyclicity before this normalization. [VERIFIED: G2/G7; `03-05-PLAN.md`]

### Bounded Iterative DAG Check

```python
# Source contract: 03-05-PLAN.md; nodes/edges already validated and bounded.
remaining = {node.phase_id: len(node.depends_on) for node in nodes}
dependents = {phase_id: [] for phase_id in remaining}
for node in nodes:
    for dependency in node.depends_on:
        dependents[dependency].append(node.phase_id)

ready = [phase_id for phase_id, count in remaining.items() if count == 0]
visited = 0
while ready:
    phase_id = ready.pop()
    visited += 1
    for dependent in dependents[phase_id]:
        remaining[dependent] -= 1
        if remaining[dependent] == 0:
            ready.append(dependent)
return visited == len(nodes)
```

This sketch uses only the already bounded validated graph and avoids recursion depth as another failure mode. [VERIFIED: `LifecycleGateLimits.max_phase_nodes/max_phase_edges`; `03-05-PLAN.md` bounded deterministic cycle-detection requirement]

### Bind Runtime Identity, Keep Evidence Portable

```python
# Production identity: existing typed encoder plus validated repository real path.
encoder.add("source_commit.repository_root", commit.repository_root)

# Test-side portable evidence: no path or digest value is serialized.
repository_identity_relations = {
    "same_root_identity_stable": first_same_root == second_same_root,
    "cross_root_identities_distinct": first_root != second_root,
    "foreign_root_prior_identity_rejected": (
        foreign.state is LifecycleGateState.DRIFTED
        and not foreign.admitted
        and "lifecycle-decision-stale" in foreign.issue_codes
    ),
}
```

The runtime digest stays repository-scoped; the review artifact stays byte-portable across temporary roots. [VERIFIED: `lifecycle_gate.py:900-939,1128-1147`; `03-06-PLAN.md:165-180`]

## State of the Art

| Existing Defect / Old Approach | Required Current Approach | Change Point | Impact |
|---|---|---|---|
| Normalize phase tuples before validating raw evidence | Validate shape/type/uniqueness/bounds/DAG first; normalize only valid set-like ordering | Gap closure 03-05 | Duplicate and cyclic evidence cannot become clean. [VERIFIED: G2/G7] |
| Validate only `ArtifactLimits` container | Validate every nested field as positive exact integer | Gap closure 03-05 | Invalid bounds stop before reads/calls. [VERIFIED: G3] |
| Canonical completeness dereferences annotated values | Runtime-check untrusted top-level and nested members first | Gap closure 03-04 | malformed structured successes return stable unknown. [VERIFIED: G4] |
| Public gate omits artifact paths and progress candidate | Complete immutable projection plus unknown empty/null defaults | Gap closure 03-06 | HARD-R2 evidence is available at the sole public seam. [VERIFIED: G5] |
| Identity binds content but not repository context | Bind validated real path; compare prior digest as before | Gap closure 03-06 | Cross-repository replay is rejected. [VERIFIED: G6] |
| Portable v1 evidence pins raw identities | Portable v2 omits raw identities and records relation booleans | Gap closure 03-06 | Golden remains deterministic across temp roots. [VERIFIED: `03-06-PLAN.md`] |

**Deprecated / outdated within this phase:**

- Fixed literal assertion for the complete decision digest becomes invalid once repository root is correctly bound; replace it with lowercase-64-hex shape and same-root/cross-root relation assertions. [VERIFIED: `tests/test_handoff_lifecycle_gate.py:1343-1364`; G6]
- Evidence schema `lifecycle-evidence-v1` / producer `repository-root-lifecycle-evidence-v1` cannot safely expose root-bound raw identities; replace with the planned portable v2 schema/producer. [VERIFIED: `tests/test_handoff_lifecycle_gate.py:1007-1023`; `03-06-PLAN.md`]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| — | None. Recommendations are grounded in canonical OpenSpec artifacts, current implementation/tests, independent review/verification, and the approved gap plans. | All | — |

External web search did not identify an authoritative source for this repository-specific contract, so no recommendation relies on those LOW-confidence results. [VERIFIED: research-plan seam result and source review]

## Open Questions (RESOLVED)

1. **No planning blocker remains for the seven verified gaps.**
   - What we know: each gap has a stable existing public seam, issue code, fixed counterexample, and assigned plan. [VERIFIED: `03-VERIFICATION.md`; `03-04/05/06-PLAN.md`]
   - What's unclear: behaviors outside the seven reproduced gaps, such as broadening internal validation of unrelated nested domain types, were not requested by verification. [VERIFIED: task scope; `03-VERIFICATION.md:8-71`]
   - Scoped resolution: Plans 03-04, 03-05, and 03-06 close only G1-G7 through the existing public seams and complete-observation invariants; unrelated nested-domain validation remains genuine out-of-scope uncertainty and any newly discovered blocker must be recorded separately rather than treated as resolved or used to expand HARD-R2 semantics in GSD. [VERIFIED: `03-VERIFICATION.md:8-71`; `03-04-PLAN.md`; `03-05-PLAN.md`; `03-06-PLAN.md`]
   - Resolving source / contract: canonical HND-03 / HARD-R2 owns the required lifecycle behavior, `03-VERIFICATION.md` defines the seven reproduced blockers, and the `AGENTS.md` minimal-scope and OpenSpec-ownership rules prohibit GSD from inventing broader semantics. [VERIFIED: `openspec/changes/harden-openspec-gsd-handoff-lifecycle/specs/openspec-gsd-handoff-lifecycle-hardening/spec.md:119-137`; `03-VERIFICATION.md:8-71`; `AGENTS.md` General Engineering Rules and Workflow]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---:|---|---|
| Python | source/tests | ✓ | 3.12.9 | none needed; project requires `>=3.12` [VERIFIED: environment probe; `pyproject.toml:8`] |
| uv | locked execution | ✓ | 0.11.26 | none needed [VERIFIED: environment probe] |
| pytest | public regression suite | ✓ | 9.1.1 | none needed [VERIFIED: environment probe; `uv.lock`] |
| Hypothesis | existing checkbox property backstop | ✓ | 6.155.7 | fixed examples remain primary; no new property family [VERIFIED: environment probe; `uv.lock`] |
| Task | full project gate | ✓ | 3.51.1 | direct Ruff/BasedPyright/pytest commands if Task invocation itself fails, but final report must mark `task check` unverified [VERIFIED: environment probe; `Taskfile.yml:35-40`] |
| Git | source-pinned reviewer evidence | ✓ | 2.34.1 | no synthetic fallback; evidence row fails if bounded fixed-argv Git proof cannot complete [VERIFIED: environment probe; `03-03-PLAN.md`] |

**Missing dependencies with no fallback:** none. [VERIFIED: environment audit]

**Missing dependencies with fallback:** none. [VERIFIED: environment audit]

## Validation Architecture

### Test Framework

| Property | Value |
|---|---|
| Framework | pytest 9.1.1; Hypothesis 6.155.7 only for the existing checkbox-normalization family [VERIFIED: environment probe; `uv.lock`] |
| Config file | `pyproject.toml` `[tool.pytest.ini_options]` [VERIFIED: `pyproject.toml:81`] |
| Quick drift run | `uv run pytest tests/test_handoff_lifecycle_drift.py -q` [VERIFIED: current test layout] |
| Quick gate run | `uv run pytest tests/test_handoff_lifecycle_gate.py -q` [VERIFIED: current test layout] |
| Full phase run | `uv run pytest tests/test_handoff_lifecycle_drift.py tests/test_handoff_lifecycle_gate.py -q` [VERIFIED: executed 2026-07-27, 72 passed in 5.24s before gap fixes] |
| Full project run | `task check` [VERIFIED: `Taskfile.yml:35-40`; verifier previously reported 567 passed before gap fixes] |

### Seven Gaps → Automated Test Map

| Gap | Behavior / RED Test | Test Type and Public Seam | Focused Command | Required GREEN Signal |
|---|---|---|---|---|
| G1 | uninspected host is incomplete; valid inspection mismatch is explicit drift | example matrix through `gate_lifecycle_operation` | `uv run pytest tests/test_handoff_lifecycle_gate.py -q -k "uninspected_host or host_inspected_drift"` | false current inspection: `UNKNOWN`, exact incomplete issue, not admitted, identity `None`; complete mismatch names exact capability field. [VERIFIED: `03-05-PLAN.md`] |
| G2 | malformed/duplicate raw phase graph never raises or normalizes clean | example table through `gate_lifecycle_operation` | `uv run pytest tests/test_handoff_lifecycle_gate.py -q -k "malformed_phase_graph or duplicate_phase_edge"` | all rows `UNKNOWN`, `lifecycle-phase-observation-incomplete`, empty reusable evidence. [VERIFIED: `03-05-PLAN.md`] |
| G3 | each nested limit rejects string/bool/zero/negative before boundary calls | bounded example table through `gate_lifecycle_operation` | `uv run pytest tests/test_handoff_lifecycle_gate.py -q -k "malformed_nested_limits"` | exact `lifecycle-input-invalid`; source/phase/capability counters all zero. [VERIFIED: `03-05-PLAN.md`] |
| G4 | malformed top-level and nested canonical structured values return unknown | example table through `classify_canonical_source_drift` | `uv run pytest tests/test_handoff_lifecycle_drift.py -q -k "malformed_structured_payload or malformed_nested_artifact"` | exact `canonical-observation-incomplete`, empty paths/IDs, progress `None`, no exception. [VERIFIED: `03-04-PLAN.md`] |
| G5 | public decision exposes exact artifact paths and checkbox progress; unknown exposes empty/null | fixed examples through `gate_lifecycle_operation` and public `_decision_view` | `uv run pytest tests/test_handoff_lifecycle_gate.py -q -k "canonical_source_has_exact_remediation or checkbox_progress_public_decision or incomplete_dimension"` | exact path literal, immutable `Progress`, unknown empty/null, golden fields present. [VERIFIED: `03-06-PLAN.md`] |
| G6 | same-root stable, cross-root distinct, foreign prior rejected; portable bytes root-independent | isolated filesystem examples through public gate plus test-side producer | `uv run pytest tests/test_handoff_lifecycle_gate.py -q -k "repository_root_identity or repository_root_lifecycle_evidence"` | lowercase 64-hex runtime identity; three relation booleans true; no raw path/current/prior digest in JSON; two temp-root producer bytes equal. [VERIFIED: `03-06-PLAN.md`] |
| G7 | expected/observed two-node and longer cycles are incomplete | fixed phase graph table through `gate_lifecycle_operation` | `uv run pytest tests/test_handoff_lifecycle_gate.py -q -k "cyclic_phase_graph"` | exact incomplete issue, unknown, not admitted, identity `None`; valid order-invariance remains green. [VERIFIED: `03-05-PLAN.md`] |

### Held-Out / Backstop Coverage

| Backstop | Purpose | Command / Assertion | Failure Signal |
|---|---|---|---|
| Existing complete drift suite | Preserve clean, artifact drift, stable source IDs, checkbox-only behavior, sole property family | `uv run pytest tests/test_handoff_lifecycle_drift.py -q` | any valid behavior changes or `@given` count exceeds one. [VERIFIED: current test file; 22 tests included in 72-test run] |
| Existing operation / remediation / freshness suite | Preserve one five-operation matrix, exact mapping horizons, remediation tuples, fresh observation, stale handling | `uv run pytest tests/test_handoff_lifecycle_gate.py -q` | matrix duplication, wrong horizon, admitted issue-bearing decision, stale identity accepted. [VERIFIED: `tests/test_handoff_lifecycle_gate.py:525-560,1095-1605`] |
| Order-invariant valid graph | Ensure validation hardening does not make semantic tuple order identity-relevant | `uv run pytest tests/test_handoff_lifecycle_gate.py::test_identity_ignores_semantically_irrelevant_phase_tuple_order -q` | two valid reorderings yield different identity or non-clean. [VERIFIED: test lines 1370-1398] |
| Independent portable golden | Detect omitted public fields and evidence-schema drift | tracked bytes equal two producer runs; parsed data equals literal golden | raw path/digest leak, missing new fields, relation false, byte nondeterminism. [VERIFIED: `tests/test_handoff_lifecycle_gate.py:1026-1055`; `03-06-PLAN.md`] |
| Protected input invariance | Prevent evidence generation from mutating canonical artifacts / handoff | existing before/after hashes, no staging path, `mutation_operations=[]` | any protected hash changes or `.handoff.*.tmp` appears. [VERIFIED: `tests/test_handoff_lifecycle_gate.py:923-1023`] |
| Optional smoke isolation | Ensure normal CI does not claim unrun external proof | `uv run pytest tests/test_taskfile.py::test_handoff_smoke_is_explicit_and_isolated_from_normal_check -q` | smoke task becomes part of normal `check`. [VERIFIED: `03-03-PLAN.md`] |
| Project-wide static / dynamic gate | Catch type, formatting and unrelated regressions | `task check` | any Ruff, BasedPyright, or pytest failure. [VERIFIED: `Taskfile.yml:35-40`] |

### Sampling Rate

- **Per TDD slice:** run the single gap-focused `-k` command and record a genuine RED before production change, then GREEN after the minimal change. [VERIFIED: `.agents/skills/tdd/SKILL.md`; plans 03-04/05/06]
- **Per plan completion:** run the entire touched test file plus targeted Ruff and BasedPyright commands from that plan. [VERIFIED: plans 03-04/05/06 verification sections]
- **Per wave merge:** after 03-04 and 03-05, run both lifecycle test files; after 03-06, also run tracked/golden evidence and smoke-isolation tests. [VERIFIED: dependency graph in plans]
- **Phase gate:** `task check`, `git diff --check`, and protected-surface diff review must all pass before re-verification. Optional real-tool smoke remains unrun unless separately authorized. [VERIFIED: `AGENTS.md`; `03-06-PLAN.md`; `.planning/ROADMAP.md`]

### Wave 0 Gaps

- [ ] Add G4 fixed cases in `tests/test_handoff_lifecycle_drift.py`; no fixture/config/framework creation is needed. [VERIFIED: current file and 03-04 plan]
- [ ] Add G1/G2/G3/G7 fixed cases in `tests/test_handoff_lifecycle_gate.py`, reusing `_fixture`, `_phase_nodes`, `FakeBoundary`, and call counters. [VERIFIED: current test helpers and 03-05 plan]
- [ ] Add G5/G6 public projection/repository relation cases and update the existing test-side portable producer plus independent literal golden. [VERIFIED: current evidence helpers and 03-06 plan]
- [ ] Repin `.planning/phases/03-lifecycle-drift-gate/03-LIFECYCLE-EVIDENCE.json` only after all behavioral cases are green. [VERIFIED: 03-06 dependency order]
- Framework install: none. [VERIFIED: environment availability and no dependency changes]

## Security Domain

Security enforcement applies because it is enabled in `.planning/config.json`; unresolved high-severity items block completion. [VERIFIED: `.planning/config.json`; task input]

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---:|---|
| V2 Authentication | no | No user authentication surface is changed. [VERIFIED: phase source/public APIs] |
| V3 Session Management | no | No session/token lifecycle is introduced. [VERIFIED: phase source/public APIs] |
| V4 Access Control | yes | `gate_lifecycle_operation` is the sole authorization/admission decision; any unknown/drifted evidence is non-admitted. [VERIFIED: `lifecycle_gate.py:1101-1147`; HARD-R2] |
| V5 Input Validation | yes | Exact raw container/member/field checks, positive bounds, canonical path rules, duplicate rejection, and bounded DAG validation before normalization. [VERIFIED: G1-G4/G7] |
| V6 Cryptography | yes | Existing stdlib SHA-256 typed length-prefix identity and `hmac.compare_digest`; do not invent cryptography. [VERIFIED: `lifecycle_gate.py:742-768,900-991,1128-1147`] |

### Known Threat Patterns for the Lifecycle Gate

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| unperformed host probe represented as false | Spoofing / Elevation of Privilege | exact-true completeness and public non-admission regression. [VERIFIED: G1] |
| duplicate/cyclic phase graph normalized or compared as clean | Tampering / Elevation of Privilege | raw uniqueness + bounded DAG validation before normalization. [VERIFIED: G2/G7] |
| malformed nested bounds trigger exception / bypass bounded read | Denial of Service | exact positive integer validation before root/read/boundary operations. [VERIFIED: G3] |
| malformed structured success crashes classifier | Tampering / Denial of Service | validate top-level and nested runtime types before dereference; stable unknown with no partial evidence. [VERIFIED: G4] |
| public decision omits remediation/progress | Repudiation / Tampering | immutable complete projection and identity/evidence binding. [VERIFIED: G5] |
| decision replayed between byte-identical repository clones | Spoofing / Elevation of Privilege | bind validated repository real path and reject foreign prior identity in constant time. [VERIFIED: G6] |
| portable evidence leaks local path or unstable digest | Information Disclosure / Repudiation | omit raw path/current/prior identity; serialize fixed relation booleans and compare against independent golden. [VERIFIED: `03-06-PLAN.md`] |

## Sources

### Primary (HIGH confidence)

- `openspec/changes/harden-openspec-gsd-handoff-lifecycle/specs/openspec-gsd-handoff-lifecycle-hardening/spec.md:119-137` — canonical HARD-R2 contract.
- `openspec/changes/harden-openspec-gsd-handoff-lifecycle/design.md:278-305,359-374,465-503` — common preflight, spec-holes, evidence strategy.
- `.planning/phases/03-lifecycle-drift-gate/03-VERIFICATION.md:8-71,81-181` — independently reproduced seven blockers and exact failure signals.
- `.planning/phases/03-lifecycle-drift-gate/03-REVIEW.md:35-162` — code-level causes and proposed minimal fixes.
- `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_drift.py` — canonical observation/classifier implementation.
- `src/ai_coding_template_ja/openspec_gsd_handoff/lifecycle_gate.py` — public gate, bounds, phase/capability validation, projection, identity.
- `tests/test_handoff_lifecycle_drift.py` and `tests/test_handoff_lifecycle_gate.py` — existing public seams, fixtures, operation matrix, evidence producer, regression backstops.
- `.planning/phases/03-lifecycle-drift-gate/03-04-PLAN.md`, `03-05-PLAN.md`, `03-06-PLAN.md` — approved gap allocation and TDD commands.
- `AGENTS.md`, `.agents/skills/tdd/SKILL.md`, `.agents/skills/spec-holes/SKILL.md`, `.agents/skills/verify-change/SKILL.md` — project execution and validation constraints.

### Secondary (MEDIUM confidence)

- None needed. The repository contains the canonical spec, implementation, tests, independent review, and independent verifier reproduction. [VERIFIED: source inventory above]

### Tertiary (LOW confidence)

- Research-plan web search returned only generic, non-repository-specific material; it was rejected as authority and supports no recommendation in this document. [VERIFIED: research-plan/cache seam]

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — runtime/tool versions were probed and locked dependency records inspected. [VERIFIED: environment probe; `uv.lock`]
- Architecture: HIGH — recommendations preserve current public seams and canonical OpenSpec ownership. [VERIFIED: source/spec/test cross-check]
- Seven gap mappings: HIGH — each was independently reproduced by review and verifier and cross-checked against current code. [VERIFIED: `03-REVIEW.md`; `03-VERIFICATION.md`]
- Validation architecture: HIGH — current focused suite was executed on 2026-07-27 and passed 72 tests in 5.24s, demonstrating the baseline and the need for new counterexamples; planned RED signals come directly from independent reproduction. [VERIFIED: local test execution; `03-VERIFICATION.md:137-143`]
- Portable evidence recommendation: HIGH — derived from the direct conflict between validated repository identity and the existing temporary-root-dependent producer, and already encoded in 03-06 plan. [VERIFIED: current code/tests; `03-06-PLAN.md`]

**Research date:** 2026-07-27
**Valid until:** 2026-08-03, or until any of `lifecycle_drift.py`, `lifecycle_gate.py`, the two lifecycle test files, HARD-R2 canonical artifacts, or plans 03-04/05/06 change, whichever comes first. [VERIFIED: active gap-closure scope]
