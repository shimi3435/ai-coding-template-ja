# Phase 1: Bridge Core, Persistence, and Preflight - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-15
**Phase:** 01-bridge-core-persistence-and-preflight
**Areas discussed:** production structure, host capability boundary, atomic persistence, result and error surface
**Mode:** Auto — all gray areas were auto-selected and the recommended option was chosen.

---

## Production structure

| Option | Description | Selected |
|--------|-------------|----------|
| Package with functional core and adapters | `src/ai_coding_template_ja/openspec_gsd_handoff/` で pure logic と OpenSpec / GSD / Git / filesystem adapter を分離し、薄い module entrypoint を置く | ✓ |
| Single bridge script | discovery、validation、persistence、CLI を一つの script に集約する | |
| Skill-owned implementation | Python package を設けず orchestration skill 内に bridge logic を置く | |

**User's choice:** Auto mode により推奨案「Package with functional core and adapters」を選択。
**Notes:** 既存 `src` package、typing、test seam に一致し、Phase 2 の skill から安定した structured boundary を利用できる。

---

## Host capability boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Skill inspects visible schema | skill が visible `spawn_agent` schema を検査し、validated capability を bridge / manifest へ明示的に渡す | ✓ |
| Infer capability from CLI probes | Python bridge が OpenSpec / GSD probe 結果から host dispatch capability を推測する | |
| Assume one host shape | typed または generic の一方を暗黙の既定として扱う | |

**User's choice:** Auto mode により推奨案「Skill inspects visible schema」を選択。
**Notes:** CLI capability と host capability を分離する canonical design に従う。worktree isolation または typed dispatch が必須の場面で generic schema を成功扱いしない。

---

## Atomic persistence

| Option | Description | Selected |
|--------|-------------|----------|
| Validated same-directory staging | timestamp-free に serialize し、同一 directory の staging を検証後 `os.replace` し、失敗時は cleanup と既知状態を報告する | ✓ |
| Direct target write | target manifest を直接 open / truncate して書く | |
| Recovery transaction | fsync、journal、retry、resume、rollback、auto-repair まで実装する | |

**User's choice:** Auto mode により推奨案「Validated same-directory staging」を選択。
**Notes:** MVP の atomicity を部分生成防止に限定する。追加の crash durability や lifecycle recovery は主張しない。

---

## Result and error surface

| Option | Description | Selected |
|--------|-------------|----------|
| Classified structured results | route と error を分類し、fallback 時は candidate を破棄し、skill が機械的に消費できる結果を返す | ✓ |
| Free-form text and exceptions | 主に人間向け stderr と例外文字列で結果を判定する | |
| Tolerant mixed-route result | JSON の有効部分を Markdown fallback の値と組み合わせて継続する | |

**User's choice:** Auto mode により推奨案「Classified structured results」を選択。
**Notes:** exact subcommand 名、出力 presentation、error taxonomy の具体名は planner discretion とする。route 値の混在禁止と structured consumption は固定する。

---

## the agent's Discretion

- package 内の具体的な module 名と public symbols。
- CLI subcommand 名、structured result の詳細 shape、利用者向け表示形式。
- error code / exception taxonomy の具体名と tests のファイル分割。
- canonical atomicity を越えない staging file 名と cleanup の具体実装。

## Deferred Ideas

- `harden-openspec-gsd-handoff-lifecycle`。
- push、PR、merge、自動 stash / commit / reset。
- OpenSpec finalize / close と handoff 後 lifecycle の自動制御。
- retry、resume、rollback、auto-repair、追加の crash durability。
