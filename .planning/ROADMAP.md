# Roadmap: OpenSpec–GSD Handoff Automation MVP

## Overview

source commit `5a1f78b81f546c900745328fad24f9adb073e768` の canonical OpenSpec artifacts を
唯一の規範として参照し、bridge、skill、verification evidence の順に実装境界を進める。
各 phase は `.planning/REQUIREMENTS.md` の proxy reference を一件だけ所有し、仕様上の意味と最終完了は
canonical OpenSpec artifacts に委ねる。

## Canonical Reference

- **Change**: `automate-openspec-gsd-handoff`
- **Source commit**: `5a1f78b81f546c900745328fad24f9adb073e768`
- **Tasks**: `openspec/changes/automate-openspec-gsd-handoff/tasks.md`
- **Design**: `openspec/changes/automate-openspec-gsd-handoff/design.md`
- **Specification**: `openspec/changes/automate-openspec-gsd-handoff/specs/openspec-gsd-handoff-automation/spec.md`
- **Authority boundary**: requirement、scenario、受け入れ基準、invariant、詳細 task、最終完了は上記
  canonical artifacts が所有する。

## Phases

- [x] **Phase 1: Bridge Core, Persistence, and Preflight** - `BRIDGE-01` が指す bridge 実装境界を source-pinned な証拠とともに成立させる (completed 2026-07-14)
- [ ] **Phase 2: Approval-Gated Skill Orchestration** - `SKILL-01` が指す skill 実装境界を Phase 1 の seam 上で成立させる
- [ ] **Phase 3: Deterministic Verification and Acceptance Evidence** - `VERIFY-01` が指す検証境界から OpenSpec 最終判定用の証拠を整える

## Phase Details

### Phase 1: Bridge Core, Persistence, and Preflight

**Goal**: canonical `tasks.md` heading `## 2. Bridge MVP phase` と source commit を唯一の規範として、bridge core、persistence、preflight の実装・検証境界を成立させる
**Depends on**: Nothing (first phase)
**Requirements**: BRIDGE-01
**Success Criteria** (what must be TRUE):

  1. Phase 1 の plan、変更、検証証拠から `BRIDGE-01` の canonical path、heading、source commit へ追跡できる。
  2. Phase 1 の証拠は bridge core、persistence、preflight の境界に限定され、OpenSpec の規範本文を複製または再定義していない。
  3. Phase 1 の完了判定は canonical OpenSpec artifacts に照合でき、未承認の仕様変更を GSD artifact で補っていない。

**Plans**: 3/3 plans complete

Plans:

**Wave 1**

- [x] 01-01-PLAN.md — functional core、bounded reader、OpenSpec discovery を TDD で固定する

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — manifest persistence、preflight adapters、thin entrypoint を TDD で接続する

**Wave 3** *(gap closure after Phase 1 verification)*

- [x] 01-03-PLAN.md — `missingArtifacts` field-presence terminal gate を TDD で閉じる

### Phase 2: Approval-Gated Skill Orchestration

**Goal**: canonical `tasks.md` heading `## 3. Skill phase` と source commit を唯一の規範として、approval-gated skill orchestration の実装・検証境界を Phase 1 の seam 上で成立させる
**Depends on**: Phase 1
**Requirements**: SKILL-01
**Success Criteria** (what must be TRUE):

  1. Phase 2 の plan、変更、検証証拠から `SKILL-01` の canonical path、heading、source commit へ追跡できる。
  2. Phase 2 の証拠は approval-gated skill orchestration の境界に限定され、Phase 1 の契約や OpenSpec の規範本文を再定義していない。
  3. runtime 固有の判断と検証結果は証拠として区別され、canonical scope の変更が必要なら OpenSpec gate へ戻せる。

**Plans**: 0/2 plans executed

- [ ] 02-01-PLAN.md
- [ ] 02-02-PLAN.md

### Phase 3: Deterministic Verification and Acceptance Evidence

**Goal**: canonical `tasks.md` heading `## 4. Test phase` と source commit を唯一の規範として、deterministic CI、opt-in smoke、OpenSpec acceptance 用 evidence の検証境界を成立させる
**Depends on**: Phase 2
**Requirements**: VERIFY-01
**Success Criteria** (what must be TRUE):

  1. Phase 3 の plan、変更、検証証拠から `VERIFY-01` の canonical path、heading、source commit へ追跡できる。
  2. deterministic CI、opt-in smoke、理由付き未検証を含む evidence が canonical OpenSpec acceptance で照合可能な形に整理されている。
  3. Phase 3 完了は GSD の実装・検証境界の完了として記録され、OpenSpec change の最終完了を主張していない。

**Plans**: TBD

## Progress

**Execution Order:** Phase 1 → Phase 2 → Phase 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Bridge Core, Persistence, and Preflight | 3/3 | Complete    | 2026-07-14 |
| 2. Approval-Gated Skill Orchestration | 0/2 | Planned    |  |
| 3. Deterministic Verification and Acceptance Evidence | 0/TBD | Not started | - |

## Coverage

| Proxy Reference | Phase | Canonical Heading |
|-----------------|-------|-------------------|
| BRIDGE-01 | Phase 1 | `tasks.md` § `## 2. Bridge MVP phase` |
| SKILL-01 | Phase 2 | `tasks.md` § `## 3. Skill phase` |
| VERIFY-01 | Phase 3 | `tasks.md` § `## 4. Test phase` |

Coverage: 3/3 proxy references mapped exactly once. No orphaned or duplicate mappings.
