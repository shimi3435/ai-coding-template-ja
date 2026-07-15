# Requirements: OpenSpec–GSD Handoff Automation MVP

**Defined:** 2026-07-15
**Core Value:** OpenSpec の正本を複製・再定義せず、source commit に固定した対象範囲を安全に実装・検証できること。
**Canonical source commit:** `5a1f78b81f546c900745328fad24f9adb073e768`

この文書の v1 項目は GSD roadmap 用の参照 ID であり、requirement、scenario、受け入れ基準、
invariant、詳細 task を定義または複製しない。仕様上の意味と完了判定は canonical OpenSpec artifacts が所有する。

## v1 Proxy References

- [x] **BRIDGE-01**: canonical `openspec/changes/automate-openspec-gsd-handoff/tasks.md` の heading `## 2. Bridge MVP phase` at source commit `5a1f78b81f546c900745328fad24f9adb073e768` だけを指すポインターである。
- [x] **SKILL-01**: canonical `openspec/changes/automate-openspec-gsd-handoff/tasks.md` の heading `## 3. Skill phase` at source commit `5a1f78b81f546c900745328fad24f9adb073e768` だけを指すポインターである。
- [ ] **VERIFY-01**: canonical `openspec/changes/automate-openspec-gsd-handoff/tasks.md` の heading `## 4. Test phase` at source commit `5a1f78b81f546c900745328fad24f9adb073e768` だけを指すポインターである。最終 acceptance evidence と完了判定は OpenSpec が所有する。

## Out of Scope

| 対象 | 理由 |
|------|------|
| `harden-openspec-gsd-handoff-lifecycle` | 後続の独立 change が所有する。 |
| push / PR / merge | 本 GSD 実装経路の外部作用に含めない。 |
| OpenSpec change の finalize / close | OpenSpec 所有の最終境界であり、本 GSD roadmap の完了と同一視しない。 |
| retry / resume / rollback / lifecycle automation | 後続 hardening の対象であり、本 MVP に含めない。 |
| 仕様、requirement、scenario、受け入れ基準、invariant、詳細 task の複製 | canonical OpenSpec ownership と source pinning を維持するため禁止する。 |

## Traceability

各 proxy reference は source commit と canonical heading への参照を保ったまま、単一の GSD phase にだけ割り当てる。

| Proxy Reference | Phase | Status |
|-----------------|-------|--------|
| BRIDGE-01 | Phase 1 | Complete |
| SKILL-01 | Phase 2 | Complete |
| VERIFY-01 | Phase 3 | Pending |

**Coverage:**

- v1 proxy references: 3 total
- Mapped to phases: 3
- Unmapped: 0
- Duplicate mappings: 0

---
*Requirements defined: 2026-07-15*
*Last updated: 2026-07-15 after roadmap traceability mapping*
