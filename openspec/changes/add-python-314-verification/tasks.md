# Tasks

- [x] 1. `.github/workflows/ci.yml` の `check` job の matrix を `["3.12", "3.13", "3.14"]` へ更新する（job name の表示は matrix 変数由来のため変更不要）
- [x] 2. `.github/workflows/extras-smoke.yml` の matrix を `["3.12", "3.13", "3.14"]` へ更新する
- [x] 3. pyproject.toml の `requires-python` 直上コメントを「CI 検証済みは 3.12 / 3.13 / 3.14・3.15+ は範囲上許容するが未検証（リリース後判断）」へ更新する
- [x] 4. `docs/template/release.md` の extras-smoke 説明から版列挙を除き owner 参照へ変える（self-review 検出・proposal 4）
- [x] 5. `task check`・`task openspec:validate` を green にする（3.14 のフル実行はローカル実測済み・CI 本実行はマージ後の matrix に委ねる）
