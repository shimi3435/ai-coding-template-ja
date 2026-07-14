# Architecture Patterns

**Project:** OpenSpec–GSD Handoff Automation MVP
**Domain:** local spec-to-planning handoff bridge
**Researched:** 2026-07-15
**Overall confidence:** HIGH（canonical OpenSpec、固定 fixtures、repo 実測を主資料とする）

## Recommended Architecture

既存 Python package の下に小さな bridge package を置き、純粋な検証・正規化処理を I/O から分離する。
`execute-openspec-change` skill は人との承認と host schema の検査を所有し、Python bridge は filesystem、
Git、OpenSpec / GSD subprocess の決定論的な検査と manifest 書込だけを所有する。GSD の plan / execute /
resume / verify / finalize はこの境界の外に保つ。

```text
利用者
  │ change ID
  ▼
execute-openspec-change skill
  ├─ policy / branch / host spawn schema を read-only 検査
  ├─ bridge の read-only 結果を表示して明示承認を得る
  └─ 承認後だけ prepare → GSD entrypoint → started 更新を調整
       │
       ▼
Python bridge composition root
  ├─ OpenSpec adapter ─ JSON discovery ─┐
  │                                    ├─ canonical ArtifactSet
  ├─ directory fallback adapter ───────┘          │
  ├─ safe Markdown reader / hasher ◀──────────────┤
  ├─ tasks progress normalizer ◀──────────────────┤
  ├─ GSD + Git preflight adapters                 │
  └─ manifest validator / atomic repository ◀─────┘
       │
       ├─ .planning/openspec/<change-id>/handoff.json
       └─ approved GSD entrypoint（skill が起動）
```

### Component Boundaries

| Component | Suggested location | Responsibility | Must not do |
|---|---|---|---|
| Skill orchestrator | `.agents/skills/execute-openspec-change/SKILL.md` | policy・visible host schema・入力表示・承認・bridge / GSD 呼出順を管理 | OpenSpec requirement の複製、無承認 write、handoff 後 lifecycle 制御 |
| CLI composition root | `src/ai_coding_template_ja/openspec_gsd_handoff/cli.py` | 引数、adapter 組立、終了コード、構造化された利用者向け結果 | discovery / validation の業務規則を持つこと |
| Shared models/errors | `.../models.py` | immutable な artifact、task、progress、capability、manifest DTO と分類済み error | subprocess、filesystem write |
| OpenSpec discovery | `.../discovery.py` | exact version/apply probe の判定、JSON 全体受理または固定 directory fallback の選択 | JSON と fallback の部分混合、Markdown 本文を JSON から得ること |
| Safe reader | `.../reader.py` | real-path containment、種別/cardinality、UTF-8、byte limits、重複、SHA-256、決定論的順序 | progress 解釈、path 推測・補完 |
| Progress normalizer | `.../progress.py` | `tasks.md` の厳密な checkbox parse と CLI metadata parity | Markdown 番号を ID と解釈、壊れた行の黙認 |
| Tool/Git preflight | `.../preflight.py` | GSD 1.5.0 複合 signal、source commit、branch/worktree、tracking/ignore を read-only 検査 | host の `spawn_agent` schema を CLI probe から推測、Git 状態を自動修復 |
| Manifest repository | `.../manifest.py` | schema 1 の build/strict validate/canonical serialize、同一 directory staging、atomic replace、state guard | requirement/phase mapping、ownership、finalize/cleanup state |
| Runtime skill links | `.claude/skills/execute-openspec-change`, `.codex/skills/execute-openspec-change` | `.agents/skills` の単一正を両 runtime へ公開 | skill 本文の複製 |

ファイル名は roadmap / implementation plan で多少統合してよい。ただし最低限、(1) discovery、
(2) reader/progress の純粋処理、(3) preflight、(4) manifest write、(5) skill orchestration の境界は保つ。
bridge は新たな framework を導入せず、既存 Python 3.12+ と標準 library を使うのが repo に最も整合する。

## Data Flow

1. skill が change ID と現在の branch / worktree / host schema を read-only で検査する。
2. bridge が `openspec --version` と apply JSON を別々に probe する。全契約が一致した場合だけ JSON の
   path metadata を採用し、非対応なら JSON を捨てて固定 directory discovery を最初から行う。
3. 両 discovery 経路を同じ `ArtifactSet` へ収束させる。reader は path を symlink 解決後に repo と
   対象 change の双方へ containment-check し、Markdown bytes、上限、重複を検査して hash を作る。
4. progress normalizer が `tasks.md` bytes を唯一の正として task DTO を作り、JSON 経路時だけ CLI
   metadata と完全比較する。不一致は fallback/stop の canonical 規則へ戻し、部分 progress は返さない。
5. preflight が GSD VERSION・required files・`init progress --raw`、Git source/tracking 条件を検査する。
   host schema は skill が別に検査し、generic schema なら TOML role-preamble workaround を明示する。
6. skill が canonical paths、source commit、route、manifest path、capabilities を表示する。ここまでは
   persistent write を行わない。
7. 明示承認後、manifest repository が `prepared` JSON を destination と同じ directory に staging し、
   再 parse / schema 検査後に置換する。既存の解析不能・不整合 state は自動上書きしない。
8. skill が未初期化なら `gsd-new-project --auto @brief`、初期化済みなら change 専用 `gsd-phase` を起動する。
   entrypoint が受理した場合だけ bridge が manifest を `started` に原子的更新する。
9. 以後の lifecycle と OpenSpec 最終完了は先行 policy の手動境界へ戻す。

## Patterns to Follow

### Functional core, imperative shell

JSON shape validation、path list normalization、task parse、progress parity、manifest serialization は、
subprocess や global repository に触れない関数にする。CLI edge が command output と filesystem bytes を
渡すため、固定 fixtures だけで通常 CI を成立させられる。subprocess 結果は stdout だけでなく exit code
と stderr を値として渡し、失敗を exception text の解析に依存させない。

### Whole-route validation before adoption

OpenSpec JSON は field 単位で fallback と混ぜない。JSON candidate 全体を parse・shape・path・progress
parity まで検証し、成功時だけ確定する。失敗時は candidate を破棄し、固定 directory adapter から新しい
`ArtifactSet` を構築する。`blocked` / `missingArtifacts` / `all_done` は schema mismatch ではなく
明示された terminal decision として先に分類する。

### Resolve, then contain

change ID の lexical validation 後、repo root、change root、各 artifact を `Path.resolve()` し、解決後の
path が repo と change root の内側にあることを検査する。`is_relative_to()` 自体は文字列ベースなので、
未解決 path に単独適用しない。regular Markdown file、resolved-path 重複、file count / bytes を reader の
一つの境界で検査する。

### Explicit state machine

manifest state は `prepared` と `started` のみを enum として表現し、許可 transition をコード上で一箇所に
固定する。invalid/partial/unsupported existing manifest は state ではなく停止 error とする。これにより
後続 hardening の resume/retry/rollback/finalize state が MVP へ紛れ込むのを防ぐ。

### Same-directory atomic replacement

staging file は最終 manifest と同じ directory に作り、完全な JSON を flush（必要なら durability 方針に
応じて `fsync`）し、再読込・strict validate 後に `os.replace` する。cross-filesystem rename を避け、失敗時は
最終 file を正とみなさない。staging の残存は部分生成として報告し、自動修復しない。

### Capability adapters, not environment globals

OpenSpec/GSD/Git の command location、expected version、required files は adapter input として扱い、unit
tests では fixtures に置換する。GSD の CLI capability と host tool schema は別の trust boundary であり、
Python bridge が host dispatch capability を推測しない。

## Repository Integration

- production code は空に近い既存 package `src/ai_coding_template_ja/` 配下へ追加し、`scripts/` に業務ロジックを
  置かない。既存 `pyproject.toml` の lint/type/test 対象へ自然に入る。
- tests は `tests/test_openspec_gsd_handoff_*.py` の責務別 unit/integration と、既存
  `tests/fixtures/openspec_gsd_handoff/` の contract fixtures を組み合わせる。filesystem/Git は `tmp_path`、
  pure parser/serializer は Hypothesis の候補とする。
- skill 実体は既存 vendoring 方針どおり `.agents/skills` を正とし、setup script で両 runtime symlink を作る。
  local skill の lock entry / hash も既存 `tests/test_skills_lock.py` の gate に合わせる。
- 実 tool smoke は通常 pytest collection から明示 opt-in 条件で隔離し、Taskfile に専用 task/flag を置く。
  `task check` は GSD 未導入でも fixture tests を通す。
- docs の責務説明は `docs/optional/gsd.md` に留め、OpenSpec の仕様本文を skill/GSD docs へ転記しない。

## Anti-Patterns to Avoid

| Anti-pattern | Consequence | Instead |
|---|---|---|
| 一つの巨大 CLI script | path/progress/state 規則と subprocess 副作用が絡み、negative fixture を局所検証できない | pure core と I/O adapters を分割する |
| JSON と fallback の field-level merge | 非対応 schema の一部を canonical と誤認し、経路 parity が崩れる | candidate 全体を採用または破棄する |
| path prefix 文字列比較 | sibling prefix、`..`、symlink escape を見逃す | resolve 後の containment と重複検査 |
| CLI bridge 内で利用者承認を模倣 | host UI/schema を検査できず、無承認 write の危険がある | approval と host preflight は skill に置く |
| manifest writer が Git commit/push を行う | source commit と manifest commit の境界を壊し、scope 外の外部作用を生む | tracking 手順を提示し、Git mutation は行わない |
| GSD plan や acceptance criteria を生成する | OpenSpec との二重正本・drift | canonical paths と source commit だけを渡す |
| generic exception/retry wrapper | fail-closed の原因と既知 state を隠し、scope 外 recovery を導入する | 分類済み error と一回の明示実行 |
| hardening state/mapping の先取り | MVP schema と責務が肥大化する | `harden-openspec-gsd-handoff-lifecycle` に残す |

## Phase Boundary Implications

1. **Bridge core:** models、discovery、safe reader、progress、manifest、preflight を fixtures から実装し、
   pure core と atomic filesystem integration を先に green にする。
2. **Skill orchestration:** bridge の安定した read-only/write interface を使って、host preflight、承認、
   runtime symlink、GSD entrypoint handoff を追加する。
3. **CI / smoke / acceptance evidence:** negative/boundary/property tests、opt-in real-tool smoke、spec-holes 対応を
   統合する。これは新機能追加 phase ではなく、canonical scenarios との証拠対応 phase とする。

各 phase は同じ `automate-openspec-gsd-handoff` change と source commit を参照するが、OpenSpec requirement や
scenario 本文を roadmap / plans に再掲しない。`harden-openspec-gsd-handoff-lifecycle`、push/PR/merge、
finalize、retry/resume/rollback は全 phase から除外する。

## Sources and Confidence

| Source | Confidence | Use |
|---|---|---|
| `openspec/changes/automate-openspec-gsd-handoff/{proposal,design,tasks}.md` と `specs/**/spec.md` @ `5a1f78b...` | HIGH | scope、ownership、data/state contracts、非対象の正本 |
| `tests/fixtures/openspec_gsd_handoff/` | HIGH | exact OpenSpec 1.3.1 / GSD 1.5.0 signals、manifest shape、negative routes |
| `pyproject.toml`, `Taskfile.yml`, `scripts/`, `tests/`, `.agents/skills/` | HIGH | package、test、skill distribution への repo-grounded integration |
| [OpenSpec agent contract](https://github.com/fission-ai/openspec/blob/main/docs/agent-contract.md) via Context7 | MEDIUM | current JSON shape の補助確認。available docs は pinned 1.3.1 ではないため fixture を優先 |
| [GSD Core documentation](https://github.com/open-gsd/gsd-core) via Context7 | MEDIUM | project/phase/agent 分離の補助確認。current branch と pinned 1.5.0 の差異があり fixture を優先 |
| [Python pathlib](https://docs.python.org/3/library/pathlib.html) / [os.replace](https://docs.python.org/3/library/os.html#os.replace) via Context7 | MEDIUM | resolve/contain と same-filesystem atomic replace の実装根拠 |

## Open Questions for Planning

- CLI の具体 subcommand 名と machine-readable output shape は canonical spec が固定していない。roadmap では
  module/API boundary だけを固定し、実装 plan で最小 interface を決める。
- `os.replace` は同一 filesystem で atomic だが、電源断までの durability に必要な file/directory `fsync`
  範囲は canonical spec に明記がない。通常の atomicity と durable transaction を混同せず、実装 plan で
  既存 repository policy に合わせて判断する。
- skill から Python bridge を起動する公開 entry（module invocation / console script）は repo に前例がない。
  新依存を増やさず、packaging と下流 template 利用の双方で動く最小導線を plan 時に確認する。
