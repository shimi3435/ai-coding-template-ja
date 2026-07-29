# OpenSpec–GSD Handoff Lifecycle Hardening

## What This Is

OpenSpec change `harden-openspec-gsd-handoff-lifecycle` を、source-pinned な canonical
artifacts に従って実装するための GSD planning project。GSD は詳細 phase、plan、phase
進捗だけを所有し、仕様本文、requirements、scenarios、acceptance criteria、最終完了は
OpenSpec に残す。

## Core Value

一つの OpenSpec change を、仕様の正本を複製せず、fail-closed な依存順序で安全に実装・再開・検証できること。

## Requirements

### Validated

- ✓ MVP handoff bridge と schema v1 が `d96e451` で `origin/main` に統合済み
- ✓ canonical hardening artifacts、54-item execution mapping、lifecycle drift authority が
  current source commit `9a7a313d06ae6df1c102f2515a3ad4bd5c0ca901` に再固定済み
- ✓ 旧 source commit の handoff は started 状態の監査証跡として保持し、manual recovery が明示承認済み

### Active

- [ ] Canonical `HARD-R1`〜`HARD-R6`への参照だけを使用し、各項目を一つの依存 phaseへ対応付ける
- [ ] phaseを stable identity/migration → mapping → drift → ownership → recovery → finalize の順で実行する
- [ ] 各 phase の検証 evidence を canonical source itemへ追跡可能にする
- [ ] 全 phase 後に OpenSpec 原本の境界ゲートを独立して検証できる状態にする

### Out of Scope

- Canonical OpenSpec の仕様本文、requirements、scenarios、acceptance criteria の再定義 — OpenSpec が正本を所有する
- PR #42または他の active change — 一つの phase / branchへ混在させない
- push、PR作成、merge、OpenSpec close — 別途の人起点承認が必要
- 自動 route switch、rollback、repair — failure時は状態を保存して停止する
- optional OpenSpec / GSD smoke の通常CI必須化 — opt-in evidenceとして分離する

## Context

- Canonical artifacts:
  - `openspec/changes/harden-openspec-gsd-handoff-lifecycle/proposal.md`
  - `openspec/changes/harden-openspec-gsd-handoff-lifecycle/design.md`
  - `openspec/changes/harden-openspec-gsd-handoff-lifecycle/specs/openspec-gsd-handoff-lifecycle-hardening/spec.md`
  - `openspec/changes/harden-openspec-gsd-handoff-lifecycle/tasks.md`
- Handoff index:
  `.planning/openspec/harden-openspec-gsd-handoff-lifecycle/handoff.json`
- Handoff brief:
  `.planning/openspec/harden-openspec-gsd-handoff-lifecycle/handoff-brief.md`
- OpenSpec source commit:
  `9a7a313d06ae6df1c102f2515a3ad4bd5c0ca901`
- OpenSpec が WHAT / WHY と最終完了を所有し、GSD は詳細な実行分解だけを所有する。
- 旧 started manifest / brief は旧 dispatch の historical / stale evidence であり、再prepare、
  `mark-started`、上書き、削除の対象にしない。
- Manual recovery は Phase 1 の再計画から再開し、Phase 1 verification 完了まで Phase 2〜6 を
  blocked とする。Phase 7 は追加しない。

## Constraints

- **Ordering**: phase と plan は依存順に逐次実行する
- **Scope**: 一つの phase には本 change だけを含める
- **Testing**: TDD、plan check、verifier、Nyquist validation、source groundingを有効にする
- **Properties**: property tests は allocator、normalizer、manifest round-trip、checkbox normalization、
  phase graph/remediation projection (`A-P-GRAPH`)、canonical path-role invariants
  (`B-P-PATH-ROLE`)、ownership graph、preview builderに限定する
- **Evidence**: 同じ failure / seam / risk を重複検証する低価値な証跡を増やさない
- **Safety**: path escape、symlink、Unicode / case alias、巨大入力、partial failureをfail-closedにする
- **Automation**: 自動 route switch、rollback、repairを実装・実行しない
- **Tools**: optional tool smokeは通常CIから分離する

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| OpenSpec artifactsをsource commitに固定して参照する | GSD側で仕様を複製せずdriftを検出するため | Phase 1は`2cbb127…`、current Phase 3 authorityは`9a7a313…`へrepin |
| Mapping readinessをpoint-in-time execution decisionとして扱う | Atomic snapshot / leaseを主張せず、次のoperation boundaryでfreshnessを再確認するため | Phase 2 D-04を後続planning / verificationの前提にする |
| 6つの依存phaseを逐次実行する | stable identityからfinalizeまでの前提関係を保つため | — Pending |
| planning docsをGit追跡する | interruption後の再開とレビュー可能性を保つため | — Pending |
| generic-agent workaroundを明示する | visible hostにtyped dispatchがなく、同等性を主張できないため | — Pending |
| roadmap作成後の自動連鎖を止める | 今回のdispatch範囲をGSD初期化までに限定するため | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition**:
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone**:
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-29 during approved Phase 3 authority publication*
