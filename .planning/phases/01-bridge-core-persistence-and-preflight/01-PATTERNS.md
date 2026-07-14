# Phase 1: Bridge Core, Persistence, and Preflight - Pattern Map

**Mapped:** 2026-07-15
**Scope:** Phase 1 で推奨された production package と、その境界に近い tests
**Strong analog families:** 5

## File Classification

| Proposed File | Role | Data Flow | Closest Analog | Quality |
|---|---|---|---|---|
| `src/ai_coding_template_ja/openspec_gsd_handoff/__init__.py` | public package surface | transform | `src/ai_coding_template_ja/__init__.py` | role-match |
| `src/ai_coding_template_ja/openspec_gsd_handoff/__main__.py` | composition root | request-response | `scripts/openspec-validate-gate.py` | role/data-flow match |
| `src/ai_coding_template_ja/openspec_gsd_handoff/models.py` | immutable model / classified result | transform | no analog | none |
| `src/ai_coding_template_ja/openspec_gsd_handoff/discovery.py` | boundary adapter | subprocess + file-I/O | `scripts/doctor.py` + `scripts/openspec-validate-gate.py` | partial |
| `src/ai_coding_template_ja/openspec_gsd_handoff/reader.py` | safe file adapter | bounded file-I/O | no analog | none |
| `src/ai_coding_template_ja/openspec_gsd_handoff/progress.py` | validator / normalizer | transform | `scripts/doctor.py` | caution-only |
| `src/ai_coding_template_ja/openspec_gsd_handoff/preflight.py` | Git/GSD/OpenSpec adapter | subprocess request-response | `scripts/doctor.py` | role/data-flow match |
| `src/ai_coding_template_ja/openspec_gsd_handoff/manifest.py` | storage adapter | deterministic file-I/O | `scripts/setup-skills.sh` | preflight-only partial |
| `tests/test_handoff_core.py` | unit/property test | transform | `tests/test_skills_lock.py` | test-structure match |
| `tests/test_handoff_discovery.py` | fixture integration test | subprocess + file-I/O | `tests/test_smoke.py` OpenSpec tests | role/data-flow match |
| `tests/test_handoff_preflight.py` | adapter unit test | subprocess request-response | `tests/test_smoke.py` OpenSpec tests | role/data-flow match |
| `tests/test_handoff_manifest.py` | fault-injected storage test | file-I/O | no atomic-write test analog | partial |
| `tests/test_handoff_cli.py` | entrypoint integration test | request-response | `tests/test_smoke.py` gate tests | role/data-flow match |

`pyproject.toml` は既に `src` package、Python 3.12、pytest/Hypothesis、Ruff、basedpyright を包含する
（lines 8, 38-51, 61-71, 81-91）。Phase 1 のための dependency や tool 設定追加は不要。

## Pattern Assignments

### Package surface and module entrypoint

`__init__.py` は既存 package と同様、意図を説明する docstring と deliberate な public exports だけに留める。

**Analog:** `src/ai_coding_template_ja/__init__.py:1-5`

```python
"""ai-coding-template-ja: 日本語 AI コーディング向け研究用 Python テンプレート。

このパッケージはテンプレートの既定モジュールであり、`task rename` で
新規プロジェクト名へ一括改名される。改名前でも import 可能な実体として動く。
"""
```

`__main__.py` は argv / adapter wiring / structured JSON output / exit code 変換だけを所有する。
既存 gate の `main() -> int` と `sys.exit(main())` を踏襲し、業務規則は import した core に置く。

**Analog:** `scripts/openspec-validate-gate.py:35-60,63-64`

```python
def main() -> int:
    # preflight を先に行い、失敗時は外部 CLI を起動しない
    ...
    proc = subprocess.run(
        ["openspec", "validate", "--changes", "--no-interactive"],
        cwd=REPO_ROOT,
    )
    return proc.returncode


if __name__ == "__main__":
    sys.exit(main())
```

### Injected subprocess boundary

`preflight.py` と discovery の probe は shell string を作らず argv、cwd、timeout、stdout/stderr、return code を
値として扱う。既存 helper は最小 analog だが、bridge 側は runner を注入可能にし、bytes と stderr を混ぜない。

**Analog:** `scripts/doctor.py:68-80`

```python
def _run(cmd: list[str], timeout: int = 60) -> tuple[int, str]:
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=REPO_ROOT,
            timeout=timeout,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return 1, str(exc)
    return proc.returncode, (proc.stdout + proc.stderr).strip()
```

適用時の差分: bridge は fixed argv + explicit cwd を維持しつつ、`CompletedProcess` 相当の typed value を返し、
OpenSpec JSON candidate、GSD init probe、Git blob/ignore probe の parser を I/O から分離する。

### Directory discovery and fail-closed preflight

固定 root 直下の directory 列挙と archive/dot 除外は既存 convention を利用できる。

**Analog:** `scripts/doctor.py:412-431`

```python
if not changes_dir.is_dir():
    return []
return [
    entry
    for entry in changes_dir.iterdir()
    if entry.is_dir() and entry.name != "archive" and not entry.name.startswith(".")
]
```

mutation 前に全検査を終え、一件でも問題があれば mutation phase に入らない構造は manifest repository の
state guard に使える。

**Analog:** `scripts/setup-skills.sh:29-55`

```bash
conflicts=()
# ...全対象を検査して conflicts を収集...
if [ "${#conflicts[@]}" -gt 0 ]; then
  # ...全件を報告...
  exit 1
fi

# preflight 成功後だけ変更を開始
for link_root in "${LINK_ROOTS[@]}"; do
  mkdir -p "$link_root"
done
```

これは inspect-before-mutate のみの analog であり、same-directory staging、再検証、`os.replace`、cleanup の
analog ではない。

### Progress normalization: existing parser is a negative analog

既存 doctor parser は一般的な OpenSpec gate 用で、indent と大文字 `X` を許す。

**Do not copy:** `scripts/doctor.py:435-442,463-475`

```python
_TASKS_CHECKBOX_RE = re.compile(r"^ *- \[[ xX]\] ")
...
if _TASKS_CHECKBOX_RE.match(line):
    well_formed += 1
```

Phase 1 の `progress.py` は fixture contract に従い、行頭の exact `- [ ] ` / `- [x] ` だけを受理する。
Markdown 内の番号は parse せず description に残し、ID は出現順で 1 から付番する。JSON route の progress と
fallback progress は同じ canonical value へ正規化して parity を検査するが、candidate の部分値は混ぜない。

### Deterministic manifest shape

**Executable shape:** `tests/fixtures/openspec_gsd_handoff/manifest/expected-prepared.json:1-56`

```json
{
  "schema_version": 1,
  "change_id": "fixture-change",
  "handoff_state": "prepared",
  "artifacts": [
    {"kind": "design", "path": "...", "sha256": "..."}
  ],
  "source_commit": "1111111111111111111111111111111111111111",
  "progress": {"total": 3, "complete": 1, "remaining": 2, "tasks": []},
  "capabilities": {"openspec": {}, "gsd": {}, "host": {}}
}
```

`manifest.py` の serializer はこの field/artifact order を決定論的に生成し、timestamp を追加しない。
storage repository は target directory 内へ staging → bytes を再 parse/validate → close → `os.replace` とする。
この repository には atomic JSON persistence の既存 analog はない。

### Tests: temporary repository, injected seams, fixture table

temporary repository の作成は小さな helper に集約する。

**Analog:** `tests/test_smoke.py:162-168`

```python
def _make_change_dir(tmp_path: Path, name: str) -> Path:
    change = tmp_path / "openspec" / "changes" / name
    change.mkdir(parents=True)
    (change / "proposal.md").write_text("# Change\n", encoding="utf-8")
    (change / "tasks.md").write_text("- [ ] 1. task\n", encoding="utf-8")
    return change
```

external action を list collector / fake runner へ置き換え、preflight failure で呼ばれないことを assert する。

**Analog:** `tests/test_smoke.py:354-367,389-406`

```python
calls: list[list[str]] = []
monkeypatch.setattr(gate.subprocess, "run", lambda cmd, **_kw: calls.append(cmd))
...
assert calls == [], "preflight FAIL 時は CLI を実行しないこと"

for cli_rc in (0, 1):
    monkeypatch.setattr(
        gate.subprocess, "run", lambda _cmd, _rc=cli_rc, **_kw: _Proc(_rc)
    )
    assert gate.main() == cli_rc
```

contract cases は JSON 一覧を読み、pytest parameter に展開する。repository 内の schema test は plain helper +
`pytest.mark.parametrize` を使う。

**Analog:** `tests/test_skills_lock.py:33-37,68-81,118-138`

```python
def _load_lock() -> list[dict[str, object]]:
    data = json.loads(LOCK_PATH.read_text(encoding="utf-8"))
    skills = data.get("skills", [])
    assert isinstance(skills, list)
    return skills


@pytest.mark.parametrize("symlink_root", SYMLINK_ROOTS)
def test_symlinks_resolve_to_skill_md(symlink_root: str) -> None:
    ...
```

OpenSpec cases は `tests/fixtures/openspec_gsd_handoff/openspec/contract.json:21-102`、GSD cases は
`gsd/contract.json:33-100` を table source とし、case 名・route/entrypoint verdict を assertion ID に使う。

## Shared Patterns

- **Repository root:** tests は `REPO_ROOT = Path(__file__).resolve().parent.parent`
  (`tests/test_smoke.py:26`, `tests/test_skills_lock.py:24`) を既存 convention とする。
- **Fail-closed ordering:** validate first、外部 command / filesystem mutation second。failure 時は calls/state 不変も検証する。
- **Path handling:** `pathlib.Path` を使うが、新 reader の containment は既存に analog がないため、resolved path の
  string prefix 比較をせず change root と repository root の両方に対する semantic containment を実装する。
- **Fixture locality:** raw tool output は `tests/fixtures/openspec_gsd_handoff/` に固定し、test 内に schema を再記述しない。
- **Error surface:** user-facing print ではなく stable category/code と known state を core result に置く。表示は entrypoint の責務。

## No Analog Found

| File / Concern | Reason | Planner Guidance |
|---|---|---|
| `models.py` immutable/classified result | production package に domain model がまだない | frozen dataclass / enum の最小 surface。route と capability を別 value にする |
| `reader.py` bounded read-once | 既存 code は `read_text` / `read_bytes` の通常 read | limit + 1 bytes を一度だけ読み、同じ bytes を decode/hash へ渡す |
| discovery candidate adopt-or-discard | 既存 OpenSpec probe は single route | JSON candidate 全体の成功時だけ採用し、fallback は fresh builder で再構成 |
| atomic manifest persistence | atomic JSON repository / fault injection test がない | same-dir staging、再検証、`os.replace`、best-effort cleanup を専用 unit に隔離 |
| Git source/working-byte parity | Git blob と working tree bytes の比較実装がない | fixed argv adapter と fake runner integration test を新設 |

## Metadata

**Analog search scope:** `src/ai_coding_template_ja`, selected `scripts/`, selected `tests/`, handoff fixtures, `pyproject.toml`

**Files deliberately not scanned:** unrelated skills、application domains、全 repository scripts。Phase 1 に近い 5 analog families で停止した。

**Copy prohibition:** `scripts/doctor.py` の checkbox regex は bridge contract と非互換。`harden-openspec-gsd-handoff-lifecycle`
が所有する recovery / mapping / lifecycle は pattern source に含めない。
