# Tasks

- [x] 1. scripts/doctor.py に `malformed_tasks_changes(change_dirs)` ヘルパーを追加する（整形式 checkbox 1 行以上・もどき行ゼロ・UTF-8 可読を検査し、change 名＋行番号付きメッセージを返す）
- [x] 2. scripts/openspec-validate-gate.py の preflight にヘルパー検査を追加する（検出時は CLI 未実行で非ゼロ終了・docstring 更新）
- [x] 3. scripts/doctor.py の `_check_openspec_validate` に WARN 側を追加する（exit 0 維持・broken 検出と同形）
- [x] 4. tests/test_smoke.py にテストを追加する（checkbox ゼロ / もどき行 / リンク誤検知防止 / CRLF / 非 UTF-8 / gate preflight FAIL / doctor WARN 維持）
- [x] 5. .github/workflows/ci.yml に `openspec-validate` ジョブを追加する（uv sync --locked → npm install -g @fission-ai/openspec@1.3.1 → gate 実行・runner 同梱 Node 使用）
- [x] 6. docs の整合更新（workflow.md quickstart step 5 の checkbox 形式追記・workflow.md fallback 節 / release.md の「opt-in ゲート」表現を CI 配線後の実態へ）
- [x] 7. `task check`・`task openspec:validate` を green にする（CI ジョブの本実行はこの PR 自身の CI が検証する）
