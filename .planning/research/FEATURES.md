# Feature Landscape: OpenSpec–GSD handoff automation MVP

**Domain:** source-pinned OpenSpec change を GSD の計画経路へ安全に引き渡すローカル開発ツール
**Researched:** 2026-07-15
**Canonical source:** commit `5a1f78b81f546c900745328fad24f9adb073e768`
**Overall confidence:** HIGH — 下記は固定 commit の canonical OpenSpec artifacts、tracked fixtures、既存 repository policy の直接照合に基づく。外部の市場慣行から仕様を補っていない。

> この文書は実装順序を判断するための feature map であり、requirement / scenario / acceptance criteria の正本ではない。規範的な挙動は末尾の canonical sources を参照する。

## Current Baseline

- repository には policy、OpenSpec change、tool-contract fixtures、handoff manifest fixture が存在する。
- production bridge、`execute-openspec-change` skill、対応する unit / integration tests はまだ存在しない。`rg` と source commit の file list で確認した。
- Python project の runtime dependencies は空で、通常 gate は Ruff、basedpyright、pytest を `task check` から実行する。GSD と OpenSpec engine は opt-in の外部 CLI である。
- project skill の単一実体は `.agents/skills/<name>/`、Codex / Claude 導線は相対 symlink である。既存 `tests/test_skills_lock.py` は skill directory、lock entry、両 runtime symlink の一対一対応を検査する。

## Table Stakes

実装対象として欠けると MVP handoff が成立しない機能。各行は仕様本文を転記せず、canonical heading へ結び付ける。

| Feature | Why Expected | Complexity | Canonical reference / implementation evidence |
|---|---|---:|---|
| Canonical artifact discovery と共通 Markdown reader | JSON fast path と directory fallback のどちらでも、同じ原本 bytes を後段へ渡す入口になる | High | `spec.md` heading `Requirement: canonical OpenSpec artifactsを正確に発見して読む`; `design.md` Decisions 2, 9; OpenSpec fixtures |
| Deterministic task normalization / progress | manifest と operator 表示が一つの progress model を共有するための前提 | Medium | `spec.md` heading `Requirement: task progressを決定論的に算出する`; `design.md` Decision 3; positive / mismatch fixtures |
| Minimal manifest model、validation、atomic persistence | source-pinned handoff を cross-session で識別する唯一の永続索引 | High | `spec.md` heading `Requirement: minimal handoff manifestを原子的かつ追跡可能に保存する`; `design.md` Decision 4; `manifest/expected-prepared.json` |
| OpenSpec / GSD / host capability preflight | 書き込み前に、対応 version、probe shape、runtime dispatch 条件を一体として判定する | High | `spec.md` heading `Requirement: policyとcapabilityのpreflight後にGSD handoffを開始する`; `design.md` Decisions 6, 9, 10; `openspec/contract.json`, `gsd/contract.json` |
| Git policy / source commit / tracking preflight | canonical source と manifest commit を区別し、ignored planning state や不適切な branch 状態で進めない | High | `design.md` Decisions 4, 8; `docs/agents/workflow.md` section `大規模 change の手動 handoff`; `docs/optional/gsd.md` section `大規模 change の手動 handoff` |
| Approval-gated `execute-openspec-change` orchestration | read-only 検査、入力表示、明示承認、manifest 作成、GSD entrypoint 起動を規定順に接続する利用者入口 | High | `proposal.md` `What Changes`; `design.md` Decision 5; `tasks.md` heading `3. Skill phase` |
| Project skill の runtime 導線 | Codex と Claude Code が同じ `SKILL.md` を参照し、repository の既存配布規約に従う | Medium | `proposal.md` `Impact`; `docs/agents/workflow.md` section `Skills`; `.agents/skills/`, `.codex/skills/`, `.claude/skills/`, `tests/test_skills_lock.py` |
| Deterministic fixture CI | GSD がない通常環境で reader、progress、manifest、preflight を検証可能にする | High | `spec.md` heading `Requirement: オプション依存をコアCIから分離する`; `design.md` Decision 7; `tests/fixtures/openspec_gsd_handoff/` |
| Explicit opt-in real-tool smoke | 固定 fixture と実 OpenSpec / GSD installation の compatibility gap を、通常 CI と分離して観測する | Medium | `design.md` Decision 7; `tasks.md` 4.2; `docs/optional/gsd.md` |
| Fail-closed operator diagnostics | fallback、停止、final-boundary、部分失敗を区別し、次に取れる手動経路を表示する | High | `spec.md` の各 requirement heading 配下の error scenarios; `design.md` Decisions 9–10; negative fixtures |

## Differentiators Within This Repository

一般的な「CLI を順に呼ぶ wrapper」以上の価値を持つが、新しい requirement ではなく canonical design の実装上の特徴である。

| Feature | Value Proposition | Complexity | Canonical reference |
|---|---|---:|---|
| OpenSpec-owned content、GSD-owned planning の非複製 handoff | source commit と paths だけを GSD に渡し、仕様 drift の第二正本を作らない | Medium | `PROJECT.md` `Canonical Source`; `design.md` Decision 1; ADR-0008 |
| JSON / Markdown parity through one normalization pipeline | 外部 CLI schema が利用できない環境でも、別実装の progress model を増やさずに縮退できる | High | `design.md` Decisions 2–3; `spec.md` headings `canonical OpenSpec artifacts...`, `task progress...` |
| Source-pinned、timestamp-free、minimal manifest | 同じ入力の再生成を決定論的にし、lifecycle ownership を先取りしない | High | `design.md` Decision 4; `manifest/expected-prepared.json` |
| CLI probe と host dispatch schema の分離 | GSD installation の存在から host orchestration 能力を誤推測しない | High | `design.md` Decision 10; `gsd/contract.json` `runtime_preflight` |
| Optional GSD boundary | GSD 未導入でも通常 `task check` を成立させ、template の core dependency を増やさない | Medium | `spec.md` heading `Requirement: オプション依存をコアCIから分離する`; `pyproject.toml`; `docs/optional/gsd.md` |

## Anti-Features

本 MVP に混ぜない機能。roadmap / plan がこれらを必要とした場合は、実装を続けず canonical OpenSpec 側へ戻す。

| Anti-Feature | Why Avoid | What to Do Instead |
|---|---|---|
| `harden-openspec-gsd-handoff-lifecycle` の内容 | 独立 change / branch / PR の ownership を侵し、MVP の review boundary を壊す | 本 change では参照上の境界確認だけに留め、実装しない |
| Stable requirement IDs、requirement / phase mapping、multi-manifest ownership | MVP manifest の固定 shape を拡張し、後続 hardening を先取りする | canonical paths と source commit の索引だけを保持する |
| plan / execute / resume / verify / finalize の自動 lifecycle 制御 | 本 change の終端である「handoff 開始」を越える | handoff 後は既存 manual policy を利用する。自動化は後続 change で再仕様化する |
| retry、rollback、自動 route switch、failure recovery engine | 部分失敗時の状態 ownership を MVP が新たに定義することになる | 既知 state、完了済み操作、失敗点、手動再開案を報告して停止する |
| cleanup preview / auto cleanup / auto finalize | pre-merge close policy と後続 lifecycle ownership を先取りする | template の既存 manual close policy を維持する |
| push、PR、merge、自動 stash / commit / reset | repository に大きな外部・破壊的副作用を加え、承認境界を越える | operator に必要な Git 手順を提示するだけにする |
| GSD artifact への仕様本文・requirements・scenarios・acceptance criteria の複製 | OpenSpec と GSD の二重正本を作る | canonical paths と source commit を参照する |
| GSD を通常 CI / runtime dependency にする | opt-in boundary と GSD 不在時の通常 CI を壊す | fixture CI と明示 opt-in smoke を分離する |
| Unknown schema の permissive coercion、unsafe path の補完、既存 manifest の自動修復 | 誤った change や部分 state を正として進める危険がある | fallback または fail-closed を canonical contract に従って選ぶ |

## Feature Dependencies

```text
Canonical source / Git policy
  ├─→ OpenSpec capability probe ─→ artifact discovery ─→ common Markdown reader
  │                                                     └─→ task normalization / progress
  ├─→ GSD capability probe
  └─→ host dispatch-schema preflight

artifact paths + content hashes + progress + capabilities + source commit
  └─→ manifest validation / atomic prepared write
       └─→ approval-gated GSD entrypoint invocation
            └─→ atomic state update to started

fixture/unit/integration CI ── verifies every pure and filesystem boundary above
opt-in smoke ──────────────── verifies installed-tool compatibility without entering core CI
```

重要な ordering constraint は `policy/source checks → read-only probes → normalized input display → explicit approval → persistent write → GSD invoke` である。manifest serializer を先に作れても、orchestration からこの順序を入れ替えてはならない。

## MVP Implementation Slices

roadmap は canonical requirement を再記述せず、次の dependency boundaries を参照するのが妥当である。

1. **Pure normalization core** — path model、Markdown bytes、task parser、progress model、canonical sorting / hashing。fixture parity と invalid-input tests を同じ slice に置く。
2. **Persistence and preflight adapters** — atomic manifest I/O、Git tracking checks、OpenSpec / GSD subprocess probes、host capability input。pure core と外部 process / filesystem 境界を分ける。
3. **Skill orchestration and integration verification** — `execute-openspec-change`、両 runtime symlink / skill lock、承認前後の sequencing、opt-in smoke、docs integration。

この分割は実装責務の候補であり、OpenSpec `tasks.md` の境界ゲートや canonical acceptance criteria を置き換えない。bridge module の物理 package path は canonical artifacts で固定されていないため、roadmap / plan で既存 Python packaging と CLI testability に合わせて決められるが、外部挙動を追加してはならない。

## MVP Recommendation

Prioritize:

1. reader / progress の pure core と canonical fixtures を最初に green にする。
2. manifest persistence と全 preflight を、failure injection を含む filesystem / subprocess boundary tests と共に実装する。
3. 最後に skill orchestration と runtime symlink / lock integration を接続し、通常 CI と opt-in smoke を分離して検証する。

Defer all anti-features above. 特に lifecycle automation と hardening change は「便利そうな追加」として同時実装しない。

## Sources and Confidence

| Source | Role | Confidence |
|---|---|---|
| `openspec/changes/automate-openspec-gsd-handoff/{proposal.md,design.md,tasks.md}` at `5a1f78b` | Scope、decisions、boundary gates | HIGH — pinned canonical repository source |
| `openspec/changes/automate-openspec-gsd-handoff/specs/openspec-gsd-handoff-automation/spec.md` at `5a1f78b` | Normative feature headings and scenario ownership | HIGH — pinned canonical repository source |
| `tests/fixtures/openspec_gsd_handoff/` at `5a1f78b` | Exact OpenSpec / GSD / manifest contract examples and negative cases | HIGH — tracked executable-contract input |
| `.planning/PROJECT.md` at `3d4b2b3` | GSD project boundary and source pin | HIGH — handoff context derived from the canonical source |
| `docs/agents/workflow.md`, `docs/optional/gsd.md`, ADR-0008 | Existing repository policy and opt-in boundary | HIGH — tracked project policy |
| `pyproject.toml`, `Taskfile.yml`, `.agents/skills/`, `tests/test_skills_lock.py` | Existing implementation and validation seams | HIGH — current repository state directly inspected |

## Open Questions for Planning

- Production bridge の module / CLI の物理配置は canonical specification で指定されていない。これは feature contract の穴ではなく plan-level design choice だが、既存 `src/` packaging、basedpyright 対象、pytest fixture injection と整合させる必要がある。
- Host `spawn_agent` schema は Python bridge が自力で introspect できるものとして仕様化されていない。canonical contract は skill の runtime preflight ownership を明記しているため、plan は host verdict を bridge へ渡す境界を明確にし、CLI probe から推測しない必要がある。
- 実 tool smoke の invocation 名 / opt-in flag は canonical artifacts で固定されていない。通常 `task check` から隔離されることを保ちながら、既存 Taskfile の命名規約に合わせる plan-level choice である。
