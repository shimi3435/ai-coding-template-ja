# Phase 1: Stable Identity and Migration - Context

**Gathered:** 2026-07-16
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure-only smart discuss)

<domain>
## Phase Boundary

OpenSpec change `harden-openspec-gsd-handoff-lifecycle` の pinned canonical artifacts を参照し、
後続 phases が利用できる stable source identity と manifest v1→v2 migration の基盤だけを実装・検証する。
source-to-phase mapping、drift、ownership、recovery、finalize は後続 phases の範囲とする。

</domain>

<decisions>
## Implementation Decisions

### the agent's Discretion
- 可逆な内部モジュール分割、型配置、fixture 構成は既存 package と test conventions に従って決めてよい。
- 外部動作、schema 契約、migration failure semantics、stable identity semantics は canonical OpenSpec
  `HARD-R1` を変更・再定義せず、その public seams から実装する。
- Phase 1 では allocator と manifest round-trip だけを property test 候補とし、それ以外は固定例または
  filesystem integration test を使う。

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/ai_coding_template_ja/openspec_gsd_handoff/manifest.py` に v1 exact parser、
  canonical serializer、8 MiB bounded read、staging validation、atomic replace の seam がある。
- `tests/test_handoff_manifest.py` に deterministic fixture、unknown field、size boundary、
  symlink escape、fault-injected persistence の既存テストパターンがある。
- `tests/fixtures/openspec_gsd_handoff/manifest/expected-prepared.json` が v1 snapshot fixture である。

### Established Patterns
- immutable `@dataclass(frozen=True)` values と `Success` / `Failure` structured result を使う。
- persistence failure は failure point、known target state、staging state、cleanup outcome を分離する。
- public behavior は package seam と structured CLI から観測し、private helper を直接テストしない。

### Integration Points
- v1 reader/serializer/persistence を後方互換のまま保ち、v2 dispatch と migration preview/apply を同 packageへ接続する。
- tests は既存 `tests/test_handoff_manifest.py` または責務別の隣接 test module/fixtures に追加する。
- optional OpenSpec / GSD tools は Phase 1 の通常テストから起動しない。

</code_context>

<specifics>
## Specific Ideas

No additional requirements — canonical OpenSpec artifacts and source commit
`7e4c3ac5d6fc7f75716794ff1b805d9c1d6381bd` are authoritative.

</specifics>

<deferred>
## Deferred Ideas

- Phase 2: source-to-phase / plan / evidence mapping
- Phase 3: lifecycle drift gate
- Phase 4: repository-wide ownership
- Phase 5: recovery and resume
- Phase 6: finalize preview and receipt

</deferred>
