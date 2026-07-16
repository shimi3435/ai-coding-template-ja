# Project Research Summary

**Project:** OpenSpec–GSD Handoff Lifecycle Hardening
**Domain:** source-pinned workflow lifecycle enforcement
**Change:** `harden-openspec-gsd-handoff-lifecycle`
**Canonical source:** `7e4c3ac5d6fc7f75716794ff1b805d9c1d6381bd`
**Canonical artifacts:** `.planning/openspec/harden-openspec-gsd-handoff-lifecycle/handoff-brief.md` に列挙された paths
**Researched:** 2026-07-16
**Confidence:** HIGH

## Executive Summary

この project は、既存の OpenSpec–GSD bridge を source-pinned な lifecycle enforcement
へ段階的に強化する repository-local な Python subsystem である。OpenSpec が WHAT /
WHY と最終完了を所有し、GSD は詳細 phase、plan、phase progress だけを所有する。roadmap
と implementation evidence は canonical paths、source commit、opaque handles
`HARD-R1`〜`HARD-R6`を参照し、canonical specification の本文を複製しない。

推奨アプローチは、新しい runtime dependency や workflow engine を導入せず、既存の
immutable values、strict JSON codecs、bounded reads、fixed-argv probes、atomic
stage/validate/replace、injectable filesystem/process seams を拡張することである。構造は
functional core と narrow adapters に分け、stable identity/migration → mapping → drift
→ ownership → recovery → finalize の6 phaseを逐次実行する。後続 phase は前段の完全な
validated valueだけを消費し、partial observationを usable stateへ昇格させない。

最大のリスクは、v1互換性を弱める migration、部分的な mapping/drift/ownership を green
と扱うこと、古い approval や不確実な filesystem stateから mutationを続行すること、
そして test label を実際以上の evidence として扱うことである。対策は exact
version dispatch、structured `unknown`、repository-wide bounded inspection、immutable
preview binding、effect-level records、TDD優先の seam-specific evidenceである。optional
OpenSpec/GSD/host smokeは opt-in かつ逐次実行とし、未実行時は明示的に unverified とする。

## Key Findings

### Recommended Stack

[STACK.md](STACK.md) の結論は、現在の Python package と locked development toolchain で
全6 phaseを実装できるというものだった。application dependency は追加せず、標準ライブラリ
と既存 seam を優先する。

**Core technologies:**

- Python `>=3.12` — frozen dataclasses、`StrEnum`、typed results、stdlib JSON/hash/path
  primitivesで deterministic domain coreを構成する
- pytest `9.1.1` と Hypothesis `6.155.7` — examples、fault injection、限定された pure
  propertiesを担当する
- Ruff `0.15.20` と basedpyright `1.39.9` — 既存 `task check` の format、lint、type
  gatesを維持する
- Git CLI の fixed-argv adapter — source pinと repository stateを bounded subprocess
  seamから観測する
- OpenSpec CLI `1.3.1` と GSD `1.5.0` — capability evidenceと real-tool smokeだけに使用し、
  normal CI の必須 dependencyにしない

**Reuse priorities:**

- `reader.py`、`progress.py`、`discovery.py`、`preflight.py` の既存 read/observe seamsを再利用する
- `manifest.py` の v1 compatibilityを保ちつつ、version codecs、migration、atomic persistenceを
  責務分割する
- `smoke.py` の read-only observation、repository fingerprint、bounded/redacted evidenceを
  opt-in validationへ継承する

### Capability Landscape

[FEATURES.md](FEATURES.md) は、この milestone を独立した feature 群ではなく、前提関係を持つ
一つの safety chainとして整理している。各 capabilityの canonical meaningは source-pinned
OpenSpecに残し、この summaryでは roadmap上の実装境界だけを示す。

**Table stakes:**

- stable identityとversioned migrationの基盤
- source itemからphase/plan/evidenceへの完全な mapping
- lifecycle operationsで共有する drift gate
- repository-wide ownership/reference observation
- interruptionとpartial failureを扱う recovery recordsとresume planning
- approval-bound finalize preview、effect execution、receipt evidence

**Cross-cutting differentiators:**

- canonical specificationを複製しない source-pinned traceability
- green / conflict / drift / unknownを route間で共有する fail-closed vocabulary
- destructive compensationを行わない inspectable recovery
- current manifestだけに依存しない repository-wide mutation eligibility
- exact immutable inputsへ結び付いた approval

**Intentional anti-features:**

- heuristic identity/mapping、automatic route switch、rollback、repair
- unknown/shared stateに対する自動 deletionまたは ownership transfer
- automatic finalize、OpenSpec close、push、PR作成、merge
- optional toolsを normal CI の必須条件にすること
- approved pure cores以外の effectful orchestrationを広範に property-testすること

### Architecture Approach

[ARCHITECTURE.md](ARCHITECTURE.md) は、immutable observationsをpure domain functionsへ渡し、
already-authorized effectsだけをnarrow repositories/executorsが実行する functional-core
architectureを推奨している。CLI、Git、OpenSpec、GSD、filesystemはadapter境界に留め、
domain modulesはpartial valuesや隠れた mutationを返さない。

**Major components:**

1. **Versioned manifest and atomic persistence** — v1 compatibility、v2 exact codec、
   migration preview/apply、bounded stage/validate/replace
2. **Source identity and mapping** — stable source inventory、planning inventory、policy
   reference IDs、complete mapping validation
3. **Common drift gate** — operation matrix、typed observations、ordered report、input digest
4. **Repository path and ownership** — contained path identity、bounded manifest registry、
   owner/reference graph
5. **Lifecycle records and recovery** — checkpoint/receipt codecs、fresh observationからの
   resume preview
6. **Finalize application** — pure immutable preview、fresh revalidation、typed effect executor、
   partial/no-op receipt

`manifest.py` をさらに肥大化させることや、全責務を一つの mutable lifecycle managerへ集約する
ことは避ける。exact module namesは planning時に調整可能だが、codec、policy、observation、
executionの依存方向は維持する。

### Critical Pitfalls

[PITFALLS.md](PITFALLS.md) から、roadmapへ直接影響する主要リスクを統合すると次のとおりである。

1. **v2をv1のoptional-field拡張として扱う** — schema versionごとの exact codecと
   read-only migration previewを分離し、元bytesと候補bytesへapprovalをbindingする
2. **identityまたはmappingを推測する** — order、display text、similarityへ依存せず、
   exact identity、monotonic allocation、tombstone、whole-mapping validationを使う
3. **部分的なinspectionをgreenにする** — 共通drift matrixを使い、missing、timeout、
   unreadable、malformed、over-limitを`unknown`として停止する
4. **current manifestだけでmutationを許可する** — repository rootからbounded inventoryを
   作り、path escape、symlink、case/Unicode alias、owner/referenceを区別する
5. **approvalやrecordが実状態より強い確実性を主張する** — immutable preview hash、
   immediate recheck、write-ahead checkpoint、observed postcondition、partial/unknown receiptを使う
6. **verificationを水増しする** — 各failureへ最も近い一つのprimary evidenceを割り当て、
   optional tool/host behaviorは opt-in、未実行時はunverifiedと記録する

## Implications for Roadmap

roadmapは次の6 phaseをこの順序で持つ。すべて
`harden-openspec-gsd-handoff-lifecycle`だけを対象とし、他changeやPRを混在させない。
各phaseはcanonical paths、source commit、該当するopaque `HARD-R*` handlesを参照する。

### Phase 1: Stable Identity and Migration

**Traceability:** `HARD-R1`, `HARD-R6`
**Rationale:** 後続mappingが参照するsource identityとmanifest representationを先に安定させる。
**Delivers:** v1 compatibility boundary、v1/v2 dispatch、stable identity core、read-only
migration preview、approval-bound atomic persistence、focused evidence。
**Architecture focus:** version codecs、source inventory、identity、migration、shared atomic-file
primitive。
**Avoids:** in-place v1 extension、ID reuse、fuzzy matching、truncated partial values、automatic
downgrade/rollback。
**Execution:** TDDを優先し、allocatorとmanifest round-tripだけをproperty-testする。

### Phase 2: Source-to-Execution Mapping

**Traceability:** `HARD-R1`, `HARD-R6`
**Rationale:** driftがsourceとderived planning stateを比較する前に、stable IDsから
phase/plan/evidenceへのcomplete baselineが必要である。
**Delivers:** bounded planning inventory、stable policy-reference records、single-changeの
complete mapping resultとstructured diagnostics。
**Architecture focus:** pure mapping validatorとobservation adaptersの分離。
**Avoids:** shape-only validation、phase orderからのidentity推測、broken/cross-change evidence、
canonical proseの複製。
**Execution:** fixed positive/negative fixturesを主 evidenceとし、broad property testsは行わない。

### Phase 3: Lifecycle Drift Gate

**Traceability:** `HARD-R2`, `HARD-R6`
**Rationale:** ownership、recovery、finalizeが同じfreshness semanticsを再利用できるよう、
mutation-capable phasesより前にcommon gateを確立する。
**Delivers:** typed operation matrix、complete observations、clean/drift/unknown report、
checkbox-only normalizer、approval input digest。
**Architecture focus:** collectorsとpure evaluatorを分離し、全public lifecycle operationsが
同じmatrixを消費する。
**Avoids:** operation別drift logic、cached preflightの再利用、lossy normalization、probe
failureのfalse green。
**Execution:** normalizerだけをproperty-testし、drift classificationはfixed examplesを使う。

### Phase 4: Repository-Wide Ownership

**Traceability:** `HARD-R3`, `HARD-R6`
**Rationale:** recoveryまたはfinalizeがeffect候補を安全に判断する前に、repository全体の
owner/reference stateとpath identityが必要である。
**Delivers:** contained path identity、bounded manifest registry、deterministic ownership graph、
drift gateへ渡すcomplete observation。
**Architecture focus:** filesystem discovery、path validation、pure graph constructionを分離する。
**Avoids:** local-only scans、partial graph、raw string path authorization、symlink/traversal/
Unicode/case alias、shared referenceのownership誤認。
**Execution:** ownership coreのproperty testsとisolated filesystem/Git integrationを組み合わせる。

### Phase 5: Recovery and Resume Planning

**Traceability:** `HARD-R4`, `HARD-R6`
**Rationale:** finalizeのmulti-effect mutationより先に、interruptionとambiguous stateを
記録・観測・再計画する共通 vocabularyが必要である。
**Delivers:** exact checkpoint/receipt codecs、atomic record repositories、effect-level state、
fresh drift/ownership evidenceからのread-only resume preview。
**Architecture focus:** persistence documents、pure recovery decisions、effect adaptersを分離する。
**Avoids:** hidden retry、automatic rollback/repair/route switch、record-only inference、
operation ID collision、uncertain effectsの強制分類。
**Execution:** fault-injected filesystem integrationをprimary evidenceとし、partial failureの
各境界でold bytes、record state、observed postconditionを確認する。

### Phase 6: Finalize Preview and Receipt

**Traceability:** `HARD-R5`, `HARD-R6`
**Rationale:** identity、mapping、drift、ownership、recoveryの全前提が揃った後だけ、
approval-gated effectsを導入できる。
**Delivers:** deterministic finalize preview、exact approval binding、immediate drift/ownership
recheck、typed ordered effects、partial/no-op receipt evidence。
**Architecture focus:** pure preview builder、application-level approval/revalidation、
policy-free effect executor、shared lifecycle records。
**Avoids:** boolean/stale approval、apply時のtarget再発見、continue-on-unknown、automatic cleanup、
receiptによるOpenSpec completion代替。
**Execution:** preview builderだけをproperty-testし、stale approval、ordering、no-op、partial
failure、rerunはisolated integrationで検証する。real toolsはopt-inのみとする。

### Phase Ordering Rationale

- stable identityがなければmapping referencesがdurableにならない
- complete mappingがなければdriftはsource changeとmissing derived stateを区別できない
- common drift gateがなければownership以降のoperation semanticsが分岐する
- repository-wide ownershipがなければrecovery/finalizeのmutation eligibilityを判断できない
- recovery recordsがなければfinalizeだけが独自のpartial-failure modelを持つ
- finalizeは全前提を再観測し、fresh approvalでbindingできる最後のphaseである

phase-level implementationは逐次実行する。phase内のpure-core workとfocused fixturesは、
同じphaseの責務内で安全に分割できる場合だけ並行準備できるが、downstream phaseを先行させない。

### Research Flags

**Planning時に追加のrepository-grounded investigationが有益なphase:**

- **Phase 1:** 既存 `manifest.py` の互換exportとatomic persistenceをどこまで抽出するかを、
  current callers/testsに対して確定する必要がある
- **Phase 4:** platform-relevant case/Unicode alias、symlink race、scan boundsのadapter policyを
  implementation environmentに合わせて具体化する必要がある
- **Phase 5:** checkpoint writeとeffect observationのcrash windowsを列挙し、fault injection
  pointsへ対応付ける必要がある
- **Phase 6:** exact effect vocabularyとreceipt fieldsはcanonical sourceを再確認し、
  preview/apply boundaryへsource-groundedに落とす必要がある

**既存patternsが十分に明確で、外部ecosystem researchを省略できるphase:**

- **Phase 2:** complete-record validation、bounded paths、fixed examplesの既存patternを再利用できる
- **Phase 3:** reader、progress normalizer、preflight adaptersとdeclarative matrixの組合せで
  architectureが明確である

全phaseで必要なのは外部library探索よりsource-pinned repository inspectionである。optional
OpenSpec/GSD/host toolsは明示 opt-in、逐次実行、bounded/redacted evidenceとし、generic-agent
workaroundをtyped dispatchと同等には扱わない。

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | pinned source tree、lockfile、existing seams、153件の関連test結果に基づく |
| Features | HIGH | exact change ID/source pinとrepository-primary evidenceからordered capability chainを確認 |
| Architecture | HIGH | current package/testsからcomponent boundariesとdependency orderを確認。exact file namesはMEDIUM |
| Pitfalls | HIGH | canonical handles、current v1 implementation、fixtures/public seamsをcross-check済み |

**Overall confidence:** HIGH

### Gaps to Address

- **Prepared state evidence:** current prepared handoffはlocal evidenceであり、structured
  acceptanceとroute-specific postconditionが確認されるまでtyped-dispatch equivalenceや
  started stateを推定しない
- **Module naming:** responsibility boundariesは明確だが、exact file splitはPhase 1 planningで
  import compatibilityとfile sizeを見て決める
- **Platform path policy:** alias detectionとwrite-boundary race mitigationのexact behaviorは
  Phase 4でsupported environmentsに対して検証する
- **Effect vocabulary:** finalize executorが受けるtyped effectsのexact setはPhase 6 planningで
  canonical sourceにgroundingする
- **Optional evidence:** actual OpenSpec/GSD tools、generic host execution、real mutation smokeを
  実行しない場合は、passへ昇格せずreason付きunverifiedとして残す

## Evidence Strategy

各phaseは最小で最も強い evidenceを failure seamへ割り当てる。

| Evidence layer | Primary use | Normal CI |
| --- | --- | --- |
| Pure properties | allocator、normalizer、manifest round-trip、ownership graph、preview builder | Yes |
| Fixed fixtures/examples | migration、mapping、drift、policy references、bounds | Yes |
| Isolated filesystem/Git integration | ownership、recovery、finalize effects | Yes |
| Real OpenSpec/GSD/host smoke | optional system-boundary compatibility | No; explicit opt-in |
| Independent final gates | source grounding、OpenSpec validation、project checks、evidence reconciliation | Separate from phase completion |

同じfailure/seam/riskを複数layerで重複検証するのは、新しいboundaryを跨ぐ場合だけにする。
test pathだけでなく、concrete node/resultまたはreason付きunverified itemをphase evidenceへ残す。
OpenSpec final validationとGSD phase verificationは独立させ、どちらも他方の代替にしない。

## Sources

### Primary (HIGH confidence)

- `.planning/PROJECT.md` — project scope、constraints、ownership boundaries
- `.planning/openspec/harden-openspec-gsd-handoff-lifecycle/handoff-brief.md` — exact change ID、
  canonical paths、source commit、boundary gates
- source commit `7e4c3ac5d6fc7f75716794ff1b805d9c1d6381bd` — canonical reference point
- [STACK.md](STACK.md) — stack、versions、reuse seams、verification performed
- [FEATURES.md](FEATURES.md) — capability chain、evidence model、anti-features
- [ARCHITECTURE.md](ARCHITECTURE.md) — component boundaries、data flow、build order
- [PITFALLS.md](PITFALLS.md) — failure modes、prevention、phase warnings

### Secondary

なし。repository-primary evidenceだけで本researchのroadmap implicationsを導出した。

### Tertiary

なし。外部ecosystem assumptionsは採用していない。

---
*Research completed: 2026-07-16*
*Ready for roadmap: yes*
