# Technology Stack

**Project:** OpenSpec–GSD Handoff Automation MVP
**Researched:** 2026-07-15
**Scope:** 実装スタックの選定のみ。仕様・requirements・scenarios・受け入れ基準は
source commit `5a1f78b81f546c900745328fad24f9adb073e768` の canonical OpenSpec artifacts を参照する。

## Recommended Stack

### Core Runtime

| Technology | Version | Purpose | Why |
|---|---:|---|---|
| Python | `>=3.12`（repo pin: `3.12`） | bridge CLI と責務別 module | 既存 repo の実装・型検査・テスト対象に含まれ、標準ライブラリだけで path、JSON、hash、subprocess、atomic replace、Git/CLI probe を実装できる。新しい runtime 依存を増やさない。 |
| Python standard library | Python 同梱 | `pathlib`, `json`, `hashlib`, `subprocess`, `tempfile`, `os`, `dataclasses`, `enum`, `typing` | MVP の I/O と検証に十分。CLI framework、schema library、Git libraryを追加するほどの入力面やコマンド面はない。 |
| Project skill Markdown | repo convention | `execute-openspec-change` の人間/agent向け入口 | 既存の `.agents/skills/<name>/SKILL.md` を単一の正とし、`.claude/skills` / `.codex/skills` は相対 symlink にする配布方式へ合わせられる。 |

### External Tool Contracts

| Technology | Version | Purpose | Integration posture |
|---|---:|---|---|
| OpenSpec CLI | **exact `1.3.1`** | change artifact path と進捗 metadata の probe | Python へ組み込まず subprocess で呼ぶ。version probe と apply JSON probe を分離し、exact-version fixture contract に一致するときだけ JSON fast path を使う。canonical content は Markdown を読む。 |
| GSD Core | **exact `1.5.0`** | read-only capability probe と承認後の handoff entrypoint | オプション外部 tool として扱う。`VERSION`、required files、`gsd-tools.cjs init progress --raw` の複合 signal を検査し、GSDを通常CIの依存にしない。 |
| Git CLI | repo environment | branch/source commit/追跡可能性の read-only preflight | 既存運用と揃え、Git libraryを追加しない。bridge が stash、commit、reset、pushを代行する用途には使わない。 |

### Testing and Quality

| Technology | Version policy | Purpose | When to use |
|---|---|---|---|
| pytest | existing `dev` group / `uv.lock` | fixture、filesystem、subprocess seam、atomic write、failure-path tests | 通常CIの全 bridge tests。`tmp_path` と `monkeypatch` で実repo・実toolsへの副作用を避ける。 |
| Hypothesis | existing `dev` group / `uv.lock` | parser/normalizer/serializer の property tests | canonical ordering、progress invariant、Unicode、上限制約など純粋処理に使う。外部 tool orchestration は例示testを優先する。 |
| Ruff | existing `dev` group / `uv.lock` | format/lint | `task check` の既存 gate。 |
| basedpyright | existing `dev` group / `uv.lock` | Python type checking | bridge modules と tests を既存 `scripts` / `tests` include の範囲で検査する。 |
| Task | Taskfile schema `3` | deterministic fixture CI と opt-in smoke の入口 | 通常 `task check` は外部GSD不要のまま保ち、実OpenSpec/GSD互換性確認だけを明示opt-in taskへ分離する。 |

### Persistence

| Technology | Version | Purpose | Why |
|---|---:|---|---|
| JSON | manifest schema `1` | `.planning/openspec/<change-id>/handoff.json` | canonical fixtureがshapeを固定済みで、他言語toolからも読める。Python標準 `json` で決定論的にserializeできる。 |
| SHA-256 | standard | canonical Markdown content hash | Python標準 `hashlib` で利用でき、manifest fixtureの64桁hex contractと一致する。 |
| Filesystem atomic replace | Python 3.12 stdlib | validated staging fileからmanifestへの置換 | 同一directoryのtemporary fileを完全検証した後に `os.replace` する構成で、追加packageなしに部分生成を正扱いしない。 |

Database、service、container、network APIは不要である。状態はcanonical Markdown、Git source commit、
tracked JSON manifestだけで構成し、MVPに新しい永続層を導入しない。

## Recommended Repository Placement

既存repoの性格上、配布対象のbridgeは importable application packageへ混ぜず、`scripts/` 配下の薄い
CLIと、隣接する責務別Python modulesに置くのが適合する。testsは `tests/` に置き、固定入力は既設の
`tests/fixtures/openspec_gsd_handoff/` を再利用する。skill本体は `.agents/skills/execute-openspec-change/`
に置き、既存 `scripts/setup-skills.sh` のsymlink規約に乗せる。

この配置判断は実装上の推奨であり、canonical OpenSpec の成果・受け入れ条件を置き換えない。

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|---|---|---|---|
| CLI implementation | Python stdlib `argparse` または単一commandの手書き引数検証 | Typer / Click | command surfaceが小さく、依存追加・lock差分・下流bootstrap負担に見合わない。 |
| Schema validation | 明示的なtyped parser + dataclass/value objects | Pydantic / jsonschema | 対応schemaは固定かつ小さい。unknown schemaを汎用的に受理することが目的ではなく、fail-closed invariantをコードとfixtureで明示する方が監査しやすい。 |
| Git access | `git` subprocess | GitPython / libgit2 binding | repoにはすでにGit CLI前提があり、必要なのは少数のread-only queryだけ。外部effectsの面を狭められる。 |
| OpenSpec integration | exact `1.3.1` CLI adapter + Markdown fallback | latest OpenSpec APIへ追随 | current upstream docsは1.5.0を示す一方、MVP契約は1.3.1 fixturesで承認済み。無断追随は契約変更になる。 |
| GSD integration | exact `1.5.0` probe adapter | GSDをPython dependency化 / latestへ自動更新 | GSDはオプションであり、通常CIから隔離する方針。自動更新はprobe contractと再承認を迂回する。 |
| Manifest storage | tracked JSON file | SQLite / YAML / hidden cache | 一change一manifestのMVPには過剰で、Git reviewabilityとcross-session参照を弱める。 |
| Orchestration | skillがbridgeを呼び、GSD entrypointへhandoff | bridgeがGSD lifecycle全体を制御 | plan/execute/resume/verify/finalize制御はこのMVPの対象ではない。 |

## Installation and Execution

新しいproject dependencyは追加しない。既存の開発環境を同期して通常gateを使う。

```bash
uv sync
task check
```

OpenSpec 1.3.1 と GSD 1.5.0 は bridge packageへ依存追加せず、opt-in integration environmentで
capability probeする。versionが異なる環境を自動でupgrade/downgradeしない。

## Compatibility Boundaries

- OpenSpecのexact-version contractは local fixtureが正である。current official docsの
  `instructions apply --json` shapeは主要fieldを裏付けるが、Context7で取得できたversionは1.5.0であり、
  1.3.1の代替証拠にはしない。
- GSDのexact-version contractは local `VERSION=1.5.0`、required-file fixture、実
  `init progress --raw` probeが正である。current upstream docsは `gsd-new-project --auto @file` と
  `gsd-phase` の存在を補強するだけに使う。
- external tool outputは境界adapterでplain Python valueへ変換し、domain/core処理へraw subprocess outputを
  流さない。version/schema mismatchでは新しい形を推測しない。
- `.planning/` の追跡可否はGit preflightで確認する。ignore環境を新しいstorage技術で黙って迂回しない。

## Confidence Assessment

| Area | Confidence | Basis |
|---|---|---|
| Python 3.12+ / existing dev toolchain | HIGH | source commitの `pyproject.toml`、`.python-version`、`Taskfile.yml`、既存scripts/testsから直接確認。 |
| OpenSpec 1.3.1 adapter contract | HIGH | canonical design/specと `tests/fixtures/openspec_gsd_handoff/openspec/contract.json`、ローカル `openspec --version` を突合。 |
| GSD 1.5.0 adapter contract | HIGH | canonical design/spec、GSD fixture contract、ローカル `VERSION` と実read-only probeを突合。 |
| Current upstream OpenSpec/GSD documentation | MEDIUM | GSD research seamの `context7` confidence classifier結果。OpenSpec docsは1.5.0、GSD docsは`next`を指すためexact local contractの補助証拠に限定。 |
| No-new-dependency recommendation | HIGH | 必要primitiveがPython stdlibにあり、repoの最小依存方針と既存quality gatesを直接確認。 |

## Sources

- Canonical local source (HIGH):
  `openspec/changes/automate-openspec-gsd-handoff/{proposal.md,design.md,tasks.md}` and
  `specs/openspec-gsd-handoff-automation/spec.md` at
  `5a1f78b81f546c900745328fad24f9adb073e768`.
- Contract fixtures (HIGH):
  `tests/fixtures/openspec_gsd_handoff/{openspec/contract.json,gsd/contract.json,manifest/expected-prepared.json}`.
- Repository toolchain (HIGH): `pyproject.toml`, `.python-version`, `Taskfile.yml`,
  `scripts/setup-skills.sh`, and existing `scripts/` / `tests/` conventions.
- [OpenSpec agent contract](https://github.com/Fission-AI/OpenSpec/blob/main/docs/agent-contract.md)
  (MEDIUM for this decision because current docs are newer than the pinned 1.3.1 contract).
- [GSD Core commands](https://github.com/open-gsd/gsd-core/blob/next/docs/COMMANDS.md)
  and [gsd-new-project skill](https://github.com/open-gsd/gsd-core/blob/next/skills/gsd-new-project/SKILL.md)
  (MEDIUM for this decision because upstream `next` is not the local 1.5.0 pin).

## Open Questions

Stack selection has no unresolved blocker. Exact Python module filenames and phase boundaries should be chosen by the
roadmap/planner from this recommendation and the canonical OpenSpec references; they are implementation organization,
not new product requirements.
