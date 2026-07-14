# Project Research Summary

**Project:** OpenSpec–GSD Handoff Automation MVP
**Domain:** source-pinned OpenSpec change を GSD の計画入口へ渡すローカル bridge
**Researched:** 2026-07-15
**Confidence:** HIGH

## Executive Summary

本プロジェクトは、OpenSpec change `automate-openspec-gsd-handoff` の確定済み原本を、GSD が管理する
実装計画へ安全に引き渡すためのローカル自動化である。仕様、requirements、scenarios、受け入れ基準、
最終完了は source commit `5a1f78b81f546c900745328fad24f9adb073e768` の canonical OpenSpec
artifacts が引き続き所有する。この summary と後続 GSD artifacts は、原本の内容を転記せず、その commit、
paths、該当 heading だけを参照する。

推奨する実装は Python 3.12 標準 library を用いた小さな package とし、純粋な検証・正規化処理を
filesystem、Git、OpenSpec / GSD subprocess、host orchestration から分離する。production code は既存 package、
typing、unit-test seam に合う `src/ai_coding_template_ja/openspec_gsd_handoff/` に置き、skill は
`.agents/skills/execute-openspec-change/` を単一の正として既存の lock / symlink 配布規約へ接続する。

最大のリスクは、非対応 JSON の部分採用、symlink を含む path 越境、source commit と読取 bytes の drift、
atomic replace と追跡可能な handoff state の混同、GSD capability と host dispatch capability の混同である。
whole-route validation、共通 bounded reader、source-pinned Git preflight、明示 state machine、skill 層での host
preflight により抑える。対象外の lifecycle hardening や Git 外部作用は実装せず、必要になった時点で OpenSpec
へ戻る。

## Key Findings

### Recommended Stack

詳細は [STACK.md](STACK.md) を参照する。新しい runtime dependency は不要であり、既存 toolchain と固定
external-tool contracts を境界 adapter 経由で利用する。

**Core technologies:**

- Python `>=3.12` と標準 library — models、parser、path / hash、subprocess、atomic persistence を実装する。
- pytest / Hypothesis — fixture-based boundary tests と純粋処理の property tests を担う。
- Ruff / basedpyright / Task — 既存 repository gate と opt-in smoke の入口を担う。
- OpenSpec CLI exact `1.3.1` — fixture に固定された read-only metadata probe として扱う。
- GSD Core exact `1.5.0` — optional な capability probe と承認後 entrypoint として扱う。
- Git CLI、tracked JSON、SHA-256 — source pin、trackability、最小 manifest の既存環境内 primitive とする。

調査内で配置案に差があったが、production bridge は
`src/ai_coding_template_ja/openspec_gsd_handoff/` を採用する。これは既存 package 宣言、`py.typed`、
basedpyright の `src` include、pytest の import seam と一致し、業務規則を script に閉じ込めない。

### Expected Features

詳細は [FEATURES.md](FEATURES.md) と canonical specification の各 requirement heading を参照する。
ここでは roadmap の責務境界だけを示し、振る舞いは再定義しない。

**Must have (MVP responsibility groups):**

- canonical input の discovery、共通 reader、progress normalization
- source / capability / Git preflight と minimal manifest persistence
- approval-gated skill orchestration と既存 runtime 配布導線
- deterministic fixture CI、opt-in real-tool smoke、operator-facing diagnostics

**Should have (implementation qualities):**

- JSON / Markdown route が一つの normalization pipeline へ収束する構成
- source-pinned、timestamp-free、reviewable な state representation
- external CLI probe と host dispatch schema を分離した capability model
- GSD が存在しない通常 CI を保つ optional integration boundary

**Defer / exclude:**

- `harden-openspec-gsd-handoff-lifecycle`
- stable mapping、multi-manifest ownership、高度な drift / recovery
- plan / execute / resume / verify / finalize の自動制御
- cleanup、push、PR、merge、自動 stash / commit / reset

### Architecture Approach

詳細は [ARCHITECTURE.md](ARCHITECTURE.md) を参照する。全体は functional core / imperative shell とし、
OpenSpec route candidate は全体検証後に採用または破棄する。path は resolve 後に contain し、manifest は
明示 state transition と same-directory atomic replacement で管理する。利用者承認と visible host schema の
判定は skill が所有し、Python bridge は host capability を CLI 結果から推測しない。

**Major components:**

1. `src/ai_coding_template_ja/openspec_gsd_handoff/` — models、discovery、reader、progress、preflight、manifest、CLI composition
2. `.agents/skills/execute-openspec-change/` — policy / host preflight、入力表示、承認、bridge と GSD entrypoint の順序制御
3. `tests/` と既存 fixtures — pure / filesystem / subprocess seam、fault injection、optional smoke
4. skill lock と `.claude` / `.codex` relative symlinks — 一つの skill 本体を両 runtime へ公開

### Critical Pitfalls

詳細は [PITFALLS.md](PITFALLS.md) を参照する。

1. **JSON route の部分採用** — candidate 全体を検証し、fallback 時は値を破棄して新しく構築する。
2. **未解決 path の containment 判定** — repo、change、artifact を resolve し、共通 reader で検査する。
3. **source commit と read bytes の不一致** — manifest write 直前まで Git と canonical bytes の整合を保つ。
4. **atomic replace と state acceptance の混同** — schema、trackability、既存 state、entrypoint 受理を別 gate にする。
5. **GSD と host capability の混同** — bridge preflight と skill runtime preflight を分離する。
6. **skill 配布契約の更新漏れ** —本体確定後に lock hash と両 runtime symlink を同期する。

## Implications for Roadmap

三つの phase はすべて同じ OpenSpec change `automate-openspec-gsd-handoff` と source commit
`5a1f78b81f546c900745328fad24f9adb073e768` を参照する。phase は詳細実装の責務だけを所有し、canonical
requirements / scenarios / acceptance criteria を複製しない。

### Phase 1: Bridge Core, Persistence, and Preflight

**Rationale:** 後続 orchestration が依存する deterministic interface と fail-closed boundary を先に固定する。
**Delivers:** `src/ai_coding_template_ja/openspec_gsd_handoff/` の責務別 modules、fixture-driven tests、read-only / write interface。
**References:** canonical `tasks.md` の Bridge MVP phase と Test phase、および canonical specification の該当 headings。
**Avoids:** route mixing、path escape、source drift、partial persistence、capability signal の寛容な推測。

### Phase 2: Skill Orchestration

**Rationale:** bridge の安定した contract の上でのみ、承認と GSD entrypoint の副作用順序を組み立てる。
**Delivers:** `execute-openspec-change` skill、generic-agent workaround を含む host preflight、skill lock と runtime links、host-level tests。
**References:** canonical `tasks.md` の Skill phase と、canonical design の skill / host boundary decisions。
**Avoids:** 承認前 write、CLI からの host capability 推測、誤 entrypoint、handoff 後 lifecycle の先取り。

### Phase 3: CI, Smoke, and Acceptance Evidence

**Rationale:** feature surface を増やさず、canonical OpenSpec の最終判定に必要な証拠を統合する。
**Delivers:** negative / boundary / property coverage、opt-in real-tool smoke、通常 CI の optional-dependency 分離、spec-holes Phase 2 と canonical references の対応資料。
**References:** canonical `tasks.md` の Test phase と OpenSpec acceptance gate。
**Avoids:** 実 GSD の通常 CI 混入、pinned contract への current upstream behavior の逆輸入、GSD phase 完了を OpenSpec change 完了とみなすこと。

### Phase Ordering Rationale

- Phase 1 が pure values と I/O adapters の contract を作り、Phase 2 はその public seam だけを利用する。
- Phase 2 で skill bytes と orchestration が確定してから、Phase 3 で lock / links / smoke / acceptance evidence を最終統合する。
- sequential execution により、一つの change 内の source pin と副作用順序をレビュー可能に保つ。
- 全 phase から hardening、push / PR / merge、finalize、retry / resume / rollback を除外する。

### Research Flags

Phases likely needing focused validation during planning:

- **Phase 1:** source commit と working bytes の照合、atomicity / durability の境界、最小 CLI result shape は plan で明示する。
- **Phase 2:** visible host schema と generic-agent workaround は runtime-dependent なので、実 host seam を plan に固定する。
- **Phase 3:** installed tool smoke は exact local versions を前提にし、通常 CI と隔離できる実行条件を確認する。

追加の市場・library research は原則不要である。canonical source と tracked fixtures が高信頼の contract であり、
新しい library を導入する判断や仕様変更が必要になった場合は phase 内で補わず OpenSpec gate に戻る。

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | repository toolchain、固定 fixtures、local versions を直接確認済み。upstream current docs は補助情報に限定する。 |
| Features | HIGH | canonical OpenSpec headings、tasks、fixtures、現 repository state を照合済み。 |
| Architecture | HIGH | package / typing / test / skill distribution seam を repository から確認済み。 |
| Pitfalls | HIGH | canonical negative contracts、spec-holes、Git / filesystem / host trust boundaries に根拠がある。 |

**Overall confidence:** HIGH

### Gaps to Address

- bridge の公開 CLI command / result shape — Phase 1 plan で既存 packaging に合う最小 interface を選ぶ。
- `fsync` の範囲 — canonical atomicity を越える新保証を追加せず、Phase 1 plan で明示的に判断する。
- host verdict の bridge への受渡し — Phase 2 plan で skill-owned boundary として固定する。
- opt-in smoke の task 名 / flag — Phase 3 plan で既存 Taskfile convention に合わせる。

これらは implementation-level choices であり、canonical behavior の未解決事項ではない。選択が scope や
外部挙動を変える場合は実装を止め、OpenSpec の更新・再検証・再承認へ戻る。

## Sources

### Primary (HIGH confidence)

- `openspec/changes/automate-openspec-gsd-handoff/{proposal.md,design.md,tasks.md}` と
  `specs/openspec-gsd-handoff-automation/spec.md` at source commit
  `5a1f78b81f546c900745328fad24f9adb073e768` — scope、ownership、normative behavior、boundary gates
- `tests/fixtures/openspec_gsd_handoff/` — OpenSpec 1.3.1、GSD 1.5.0、manifest の executable contract inputs
- `.planning/PROJECT.md` — GSD handoff context、source pin、one-change boundary
- `pyproject.toml`、`Taskfile.yml`、`src/`、`tests/`、`.agents/skills/`、`scripts/setup-skills.sh` — repository integration seams
- `docs/agents/workflow.md`、`docs/optional/gsd.md`、ADR-0008 — execution ownership と optional dependency policy

### Secondary (MEDIUM confidence)

- OpenSpec official agent contract via Context7 — current JSON concepts の補助確認。pinned 1.3.1 contract の代用にはしない。
- GSD Core official documentation via Context7 — project / phase / agent 分離の補助確認。local 1.5.0 fixtures を優先する。
- Python standard-library documentation — resolved-path containment と same-filesystem atomic replace の実装根拠。

### Tertiary (LOW confidence)

- なし。外部 community practice から canonical behavior を補っていない。

---
*Research completed: 2026-07-15*
*Ready for roadmap: yes*
