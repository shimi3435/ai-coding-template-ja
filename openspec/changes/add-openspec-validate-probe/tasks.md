# Tasks

- [x] 1. `scripts/doctor.py`: `check_openspec` の未導入案内から `openspec init` を除去し（Markdown fallback 可＋ workflow.md 参照のみ）、validate probe（CLI 在席かつ changes 非空のときのみ `openspec validate --changes --no-interactive`・invalid は WARN・exit 0 維持）を追加する
- [x] 2. `tests/test_smoke.py`: doctor 出力に `openspec init` が含まれない回帰テストと、validate probe の挙動テスト（changes 空で skip / invalid で WARN・FAIL ゼロ / valid で OK）を追加する
- [x] 3. `Taskfile.yml`: `openspec:validate` task を新設する（engine 不在は導入案内＋非ゼロ終了・invalid で FAIL・changes 空は exit 0）
- [x] 4. `docs/agents/workflow.md`: `openspec validate` 導線に PR 前チェックとして `task openspec:validate` を 1 行追記する
- [x] 5. `task check` と verify-change（doctor 実行で WARN / exit code を実機確認）を実施する
- [x] 6. Codex adversarial-review 反映: `proposal.md` / `tasks.md` を欠く change の preflight（doctor は WARN・gate は非ゼロ FAIL）と回帰テストを追加する
