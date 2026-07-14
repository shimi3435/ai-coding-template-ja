# OpenSpec–GSD Handoff Automation MVP

## What This Is

OpenSpec change `automate-openspec-gsd-handoff` を、確定済みの canonical artifacts を参照しながら
GSD 経路で実装・検証するプロジェクトである。対象は handoff 自動化の MVP に限り、OpenSpec が仕様と
受け入れ基準と最終完了を所有し、GSD は詳細 plan と phase 進捗だけを所有する。

## Core Value

OpenSpec の正本を複製・再定義せず、source commit に固定した対象範囲を安全に実装・検証できること。

## Canonical Source

- **Change ID**: `automate-openspec-gsd-handoff`
- **Source commit**: `5a1f78b81f546c900745328fad24f9adb073e768`
- **Proposal**: `openspec/changes/automate-openspec-gsd-handoff/proposal.md`
- **Design**: `openspec/changes/automate-openspec-gsd-handoff/design.md`
- **Specification**: `openspec/changes/automate-openspec-gsd-handoff/specs/openspec-gsd-handoff-automation/spec.md`
- **Tasks**: `openspec/changes/automate-openspec-gsd-handoff/tasks.md`
- **Ownership**: OpenSpec artifacts が仕様、requirements、scenarios、受け入れ基準、境界 gate、最終完了の唯一の正本である。GSD artifacts はこれらを転記または再定義せず、上記 paths と source commit を参照する。

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] source commit `5a1f78b81f546c900745328fad24f9adb073e768` の canonical OpenSpec artifacts を参照し、`automate-openspec-gsd-handoff` の対象範囲を実装・検証する。

### Out of Scope

- `harden-openspec-gsd-handoff-lifecycle` — 後続の独立 change / branch / PR が所有するため、本 phase に混在させない。
- stable requirement ID、requirement / phase mapping、multi-manifest ownership、高度な drift gate・failure recovery — 後続 hardening の対象である。
- plan / execute / resume / verify / finalize の lifecycle 自動制御および cleanup preview — 本 MVP は GSD handoff 開始までを対象とする。
- OpenSpec change の finalize / close、push、PR、merge、自動 stash / commit / reset — GSD の実装 phase の責務ではない。
- GSD artifacts 内での仕様本文、requirements、scenarios、受け入れ基準の複製または再定義 — canonical OpenSpec ownership に反する。

## Context

- 先行 change `revise-openspec-gsd-execution-boundary` が OpenSpec / GSD の責務境界、手動 handoff、最終完了、close policy を確定済みである。
- OpenSpec JSON 1.3.1 と GSD 1.5.0 の capability contract、fixtures、fallback / fail-closed 条件は source commit の canonical artifacts に固定されている。
- implementation gate 1.1–1.3、strict validation、`spec-holes` Phase 1 再確認を完了し、2026-07-15 に利用者が実装開始を承認した。
- 本作業は `origin/main` から分岐した専用 branch の隔離 worktree で行い、別 change を含めない。
- 未解決契約はない。実装中に仕様変更が必要になった場合は GSD 内で補完せず、OpenSpec に戻して判断する。

## Constraints

- **Specification ownership**: OpenSpec を唯一の正本とし、GSD は詳細 plan / phase 進捗だけを管理する — 二重管理と仕様 drift を防ぐため。
- **Scope isolation**: one phase / one change とし、`automate-openspec-gsd-handoff` 以外を phase に含めない — 独立した出荷・レビュー境界を保つため。
- **Execution order**: plan と実装は sequential に進める — 同一 change 内の依存順と検証結果を明確にするため。
- **Planning persistence**: `.planning/` は Git 追跡対象とする — cross-session handoff と review 可能な進捗を維持するため。
- **Source pinning**: 実装判断は source commit と canonical paths に固定する — 作業中の非正規な drift を取り込まないため。
- **Generic-agent workaround**: host が `agent_type` を提供しない場合、対応 agent `.toml` の system instructions を role-preamble として generic agent に注入し、結果を `generic-agent workaround` と明示する — typed dispatch が利用できない現 runtime で GSD role context を保持するため。
- **Spec change stop**: requirement、scenario、受け入れ基準、scope の変更が必要になった時点で GSD 作業を停止し、OpenSpec artifacts の更新・再検証・再承認へ戻る — GSD が仕様を新規定義しないため。
- **Final authority**: phase 完了は最終完了を意味しない — OpenSpec 原本との対応付けと project checks を経た境界 gate が完了を決めるため。

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| OpenSpec が仕様・受け入れ基準・最終完了を所有し、GSD は詳細 plan / phase 進捗だけを所有する | 正本を一つに保ち、requirements と acceptance criteria の drift を防ぐ | — Pending |
| source commit `5a1f78b81f546c900745328fad24f9adb073e768` と canonical paths を全 GSD artifacts から参照する | handoff 入力と実装判断を再現可能にする | — Pending |
| 一つの GSD phase に一つの OpenSpec change だけを割り当てる | scope と review 境界を明確にし、後続 hardening を混在させない | — Pending |
| 実行は sequential、`.planning/` は tracked とする | 依存順を保ち、cross-session の計画・進捗をレビュー可能にする | — Pending |
| typed dispatch 不可時は `.toml` role-preamble による generic-agent workaround を明示する | runtime 制約下でも role context と監査可能性を可能な範囲で維持する | — Pending |
| 仕様変更が必要なら GSD を停止して OpenSpec に戻る | GSD artifacts による仕様の暗黙変更を防ぐ | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `$gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active only after canonical OpenSpec update and approval
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `$gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state
5. Reconcile against the canonical OpenSpec artifacts before any final-completion claim

---
*Last updated: 2026-07-15 after initialization*
