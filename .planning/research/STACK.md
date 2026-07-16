# Technology Stack: OpenSpec–GSD Handoff Lifecycle Hardening

**Change:** `harden-openspec-gsd-handoff-lifecycle`
**Canonical source:** `7e4c3ac5d6fc7f75716794ff1b805d9c1d6381bd`
**Canonical artifacts:** `.planning/openspec/harden-openspec-gsd-handoff-lifecycle/handoff-brief.md` と `handoff.json` に列挙された paths
**Researched:** 2026-07-16
**Confidence:** HIGH（source commit から現 HEAD まで対象 stack / modules / tests に差分がなく、対象テスト 153 件を実行済み）

## Recommendation

六つの ordered phases は、既存の Python package とテスト基盤を拡張して実装する。新しい runtime dependency、database、service、schema library、graph library、transaction libraryは追加しない。

理由は、現在の bridge が Python 標準ライブラリだけで次の必要 seam を既に持つためである。

- immutable values と explicit result types
- bounded canonical reads、SHA-256 identity、strict JSON parsing
- fixed-argv Git / OpenSpec / GSD probes
- atomic staging + validate + `os.replace`
- injectable filesystem / subprocess boundaries
- deterministic fixtures、fault injection、property tests
- repository write detectionを伴う opt-in read-only smoke

各 phase は canonical OpenSpec の `HARD-R1`〜`HARD-R6` handles と source commitを参照し、仕様本文、requirements、scenarios、acceptance criteriaを GSD 側へコピーしない。

## Existing Version Baseline

| Technology | Version / constraint | Role in this change | Decision |
|---|---:|---|---|
| Python | `>=3.12`; CI `3.12 / 3.13 / 3.14` | 全 runtime と tests | 継続使用。3.12 syntax（type aliases / generic dataclasses）を基準にする |
| OpenSpec CLI | `1.3.1` exact | canonical discovery と strict validation | capability probeと opt-in gateだけで使用。通常 unit CI の依存にしない |
| GSD | `1.5.0` exact | phase orchestration / opt-in compatibility evidence | bridge coreから直接依存させず、既存 probe / fixture境界を維持 |
| pytest | `9.1.1`（`uv.lock`） | unit / fixture / integration tests | 全 phase の基本 test runner |
| Hypothesis | `6.155.7`（`uv.lock`） | 限定された pure-property tests | allocator、normalizer、manifest round-trip、ownership graph、preview builderだけに使用 |
| pytest-cov | `7.1.0`（`uv.lock`） | coverage可視化 | 現行どおり fail-underを新設しない |
| Ruff | `0.15.20`（`uv.lock`） | format / lint | `task check` の既存 gateを使用 |
| basedpyright | `1.39.9`（`uv.lock`） | type checking | immutable models、tagged results、operation protocolsを検査 |
| uv | lockfile駆動。調査環境 `0.11.26` | dependency / command execution | `uv sync --locked` と `uv run` を継続。ローカル観測版を新しい project pinにはしない |
| Task | Taskfile schema `3`; 調査環境 `3.51.1` | 共通 command surface | 既存 tasksを拡張する場合も通常 check と opt-in smokeを分離 |
| Git CLI | existing fixed argv seam | source pin、blob比較、repository state | subprocess adapterを再利用し、shell command compositionを導入しない |
| GitHub Actions | Ubuntu、Python matrix | normal CI | `task check` 相当は optional OpenSpec / GSD toolsなしで greenを維持 |

`pyproject.toml` の application dependencies は空であり、この hardeningでも空のまま維持する。dev dependenciesも現行セットで足りる。

## Repository Modules to Reuse

| Existing module | Existing responsibility | Hardening use |
|---|---|---|
| `models.py` | frozen dataclasses、`StrEnum`、`Success` / `Failure` | v2 values、stable IDs、drift / ownership / effect statesの共通 vocabulary |
| `reader.py` | contained / bounded / UTF-8 canonical reads、symlink拒否、SHA-256 | source identity、mapping source、drift inputs |
| `progress.py` | deterministic `tasks.md` normalization | checkbox-only classificationと progress separation |
| `discovery.py` | OpenSpec 1.3.1 JSON candidate validation / fresh Markdown fallback | canonical input acquisition。hardening側で別 discoveryを作らない |
| `preflight.py` | bounded fixed-argv subprocess、Git source verification、tool capability probes | lifecycle共通 drift inputs、Git / capability evidence |
| `manifest.py` | schema v1 strict parser、canonical serialization、atomic persistence、fault seam | v1 reader保持、v2 codec / migration persistenceの基礎 |
| `smoke.py` | ignored-inclusive repository snapshot、write detection、redacted evidence | opt-in end-to-end compatibility smokeの拡張 |
| `__init__.py` | `inspect` / `prepare` / `mark-started` orchestration | public operation composition。domain logicはここへ集中させない |
| `__main__.py` | structured CLI JSON / exit codes | hardening operationsを公開する場合の薄い adapter |

## Phase-by-Phase Stack

### Phase 1 — Stable identity and manifest migration

**Canonical handles:** `HARD-R1`, `HARD-R6`

| Concern | Use |
|---|---|
| Pure model / allocation | frozen dataclasses、`StrEnum`、`tuple`、`Mapping`; SHA-256 via `hashlib` |
| v1 / v2 codec | strict stdlib `json`; exact fields; deterministic serializer; bounded limit+1 reads |
| Persistence | existing `ManifestFileOperations` / `ManifestRepository` pattern: staging、parse-back validation、atomic `os.replace` |
| Suggested module boundary | keep v1 codec in `manifest.py`; add focused `identity.py` and `migration.py`, or split shared v2 codec if `manifest.py` would grow materially |
| Tests | pytest fixtures for v1 preservation / unknown schema / failed staging; Hypothesis for allocator and v2 round-trip only |

Do not use UUIDs, timestamps, database sequences, fuzzy matching, or third-party migration frameworks. Stable assignment is repository-local deterministic state, and the existing JSON + atomic-file pattern supplies the required mechanics.

### Phase 2 — Source-to-phase / plan / evidence mapping

**Canonical handles:** `HARD-R1`, `HARD-R6`

| Concern | Use |
|---|---|
| Mapping model | frozen records containing repository-relative POSIX paths and stable reference IDs |
| Validation | pure Python exact-set / cardinality checks; `PurePosixPath` lexical validation followed by repository-aware `Path` checks where filesystem evidence is needed |
| Policy references | versioned JSON record under the canonical project path identified by the source design; section hashes with `hashlib.sha256` |
| Suggested module boundary | `mapping.py` for pure completeness / uniqueness checks; `policy_references.py` for current-tree reference record validation |
| Tests | table-driven pytest fixtures and examples; no broad property test for mapping validator |

Reuse the existing “unknown field / duplicate / cross-root / malformed value = fail closed” style. A graph package is unnecessary because this phase validates small explicit records and exact references.

### Phase 3 — Lifecycle preflight and drift

**Canonical handles:** `HARD-R2`, `HARD-R6`

| Concern | Use |
|---|---|
| Source evidence | `reader.py` bytes / hashes and `preflight.py` Git blob checks |
| Derived evidence | manifest codec、mapping validator、phase-state adapter、existing GSD capability value |
| Operation matrix | immutable data table keyed by plan / execute / resume / verify / finalize; one pure comparator returns clean / drifted / unknown evidence |
| Checkbox handling | reuse `progress.py`; keep progress-only change separate from canonical specification identity |
| Suggested module boundary | `drift.py` plus a small lifecycle preflight composer; do not duplicate OpenSpec discovery |
| Tests | pytest examples for each drift source and unknown result; Hypothesis only for the normalizer invariants referenced by `HARD-R6` |

Continue using fixed argv and injected runners. Do not add GitPython or shell-based Git pipelines; the current subprocess seam already bounds timeout, output, cwd, stdout, and stderr.

### Phase 4 — Repository-wide multi-manifest ownership

**Canonical handles:** `HARD-R3`, `HARD-R6`

| Concern | Use |
|---|---|
| Inventory | bounded repository scan modeled after `smoke.snapshot_repository`; do not follow symlinks |
| Path identity | `Path.resolve`, `PurePosixPath`, `os.stat` / `lstat`, `stat`, and explicit UTF-8 handling |
| Alias normalization | one pure normalizer using stdlib `unicodedata` and explicit case policy; retain both declared and normalized identities for diagnostics |
| Graph | immutable dict/set adjacency representation; deterministic sorted projection |
| Suggested module boundary | `ownership.py` for graph construction / decisions; a shared safe-path helper only if reader, manifest, and ownership can genuinely share identical semantics |
| Tests | Hypothesis for graph order independence / alias collision / single-owner safety; `tmp_path` integration for symlink, traversal, Unicode / case aliases, conflicting manifests, and bounds |

Do not add NetworkX or a filesystem watcher. The ownership graph is bounded, local, and rebuilt for correctness before lifecycle operations; an in-memory adjacency model is sufficient.

### Phase 5 — Resume and partial-failure recovery

**Canonical handles:** `HARD-R4`, `HARD-R6`

| Concern | Use |
|---|---|
| Journal records | strict deterministic JSON codecs with frozen effect records and explicit status enums |
| Persistence | generalized form of the current staging / validate / atomic replace adapter |
| Planning | pure recovery-plan builder over checkpoint / receipt plus fresh drift and ownership evidence |
| Side-effect isolation | injected filesystem and Git operation protocols; no hidden retry |
| Suggested module boundary | `journal.py` for codecs / persistence and `recovery.py` for pure plan construction |
| Tests | isolated `tmp_path` repositories and fault-injected operations; assert old bytes, checkpoint state, and postconditions after every failure point |

Do not use a database transaction layer or automatic rollback library. The repository artifacts themselves are the inspectable journal; ambiguous effects remain explicit instead of being guessed or retried.

### Phase 6 — Finalize / cleanup preview and receipt

**Canonical handles:** `HARD-R5`, `HARD-R6`

| Concern | Use |
|---|---|
| Preview | pure deterministic builder over fresh drift, ownership, Git state, and requested operation |
| Approval binding | canonical serialized preview bytes + `hashlib.sha256`; approval input is matched exactly at apply time |
| Apply | ordered injected Git / filesystem effects; stop on first failed or unknown effect |
| Receipt | same strict journal codec / atomic persistence seam from Phase 5 |
| Suggested module boundary | `finalize.py` for preview / apply composition; reuse `journal.py`, `drift.py`, and `ownership.py` rather than creating parallel checks |
| Tests | Hypothesis for preview determinism / idempotence / hash binding; integration tests for no-op, stale approval, ordering, partial failure, and rerun |

No cleanup command should be embedded in `Taskfile.yml` as an unconditional normal-CI action. Finalize remains an approval-gated lifecycle operation with opt-in real-tool evidence.

## Cross-Phase Test and Tool Seams

### Normal CI

Use the existing `task check` sequence unchanged as the baseline:

```bash
uv run ruff format --check .
uv run ruff check .
uv run basedpyright
uv run pytest
```

The Python matrix remains 3.12 / 3.13 / 3.14. Tests must pass without Node, OpenSpec, GSD, network, or populated user config; `task check:without-gsd` is the existing proof seam for this property.

### Targeted tests during implementation

Keep tests close to responsibility, following the current naming:

```text
tests/test_handoff_identity.py
tests/test_handoff_migration.py
tests/test_handoff_mapping.py
tests/test_handoff_drift.py
tests/test_handoff_ownership.py
tests/test_handoff_recovery.py
tests/test_handoff_finalize.py
```

Extend `tests/fixtures/openspec_gsd_handoff/` with versioned `manifest-v1`, `manifest-v2`, mapping, ownership, checkpoint, preview, and receipt fixtures. Fixtures should use placeholders rather than personal absolute paths, matching the current fixture convention.

### Opt-in validation and smoke

| Tool seam | Command / version | CI status |
|---|---|---|
| Canonical OpenSpec validation | `openspec validate harden-openspec-gsd-handoff-lifecycle --strict` and `task openspec:validate`; OpenSpec `1.3.1` | separate opt-in / dedicated OpenSpec gate, not part of `task check` |
| Real compatibility smoke | extend `task openspec:gsd-handoff:smoke CHANGE_ID=... GSD_HOME=...`; GSD `1.5.0` | opt-in only |
| GSD verification | GSD verifier / Nyquist evidence referencing canonical handles | phase workflow evidence, not a Python runtime dependency |
| Final repository gate | `task check` plus drift / ownership / broken-reference checks implemented in Python | normal deterministic CI for pure / fixture checks |

The smoke must preserve current behavior: read-only probes where possible, before/after repository fingerprint, bounded/redacted output, and explicit `unverified` items for effects without a safe dry-run.

## Dependencies Not Recommended

| Candidate | Decision | Concrete reason |
|---|---|---|
| Pydantic / attrs | Do not add | frozen dataclasses and strict handwritten codecs already enforce exact schema and stable error codes |
| jsonschema | Do not add | schema has operation-specific invariants, path constraints, and migration state guards beyond structural JSON validation |
| GitPython / pygit2 | Do not add | existing fixed-argv Git adapter verifies exact commit blobs and is already fault-testable |
| NetworkX | Do not add | ownership graph is bounded and needs deterministic exact decisions, not graph algorithms |
| transactional filesystem package | Do not add | current staging + parse-back + `os.replace` seam already exposes every failure point needed by recovery tests |
| watchdog | Do not add | lifecycle checks are point-in-time gates; background monitoring would introduce race and platform complexity |
| database / SQLite | Do not add | tracked JSON records must remain reviewable repository artifacts and there is no concurrent service writer |
| pytest plugins beyond current set | Do not add initially | pytest core, `tmp_path`, monkeypatch, parametrization, Hypothesis, and injectable adapters cover the specified test shapes |

Reconsider a dependency only if an implementation phase demonstrates a specific missing capability that cannot be expressed safely through these existing seams.

## Verification Performed

- Confirmed exact change ID and source commit from the prepared handoff files.
- Confirmed source commit exists.
- Confirmed no changes between source commit and current HEAD for `pyproject.toml`, `uv.lock`, `Taskfile.yml`, CI, handoff package, scripts, and relevant tests.
- Read all current handoff package modules and relevant tests / fixtures.
- Ran:

```bash
uv run pytest \
  tests/test_handoff_cli.py \
  tests/test_handoff_core.py \
  tests/test_handoff_discovery.py \
  tests/test_handoff_manifest.py \
  tests/test_handoff_preflight.py \
  tests/test_handoff_smoke.py \
  tests/test_execute_openspec_change_skill.py \
  tests/test_taskfile.py -q
```

Result: **153 passed** on Python 3.12.9.

## Sources

Repository-primary evidence:

- `.planning/PROJECT.md`
- `.planning/openspec/harden-openspec-gsd-handoff-lifecycle/handoff-brief.md`
- `.planning/openspec/harden-openspec-gsd-handoff-lifecycle/handoff.json`
- canonical OpenSpec handles `HARD-R1`〜`HARD-R6` at source commit `7e4c3ac5d6fc7f75716794ff1b805d9c1d6381bd`
- `pyproject.toml`, `uv.lock`, `Taskfile.yml`, `.github/workflows/ci.yml`
- `src/ai_coding_template_ja/openspec_gsd_handoff/`
- `tests/test_handoff_*.py`, `tests/test_execute_openspec_change_skill.py`, `tests/test_taskfile.py`
- `tests/fixtures/openspec_gsd_handoff/`
