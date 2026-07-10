# Tasks

- [x] 1. `.github/workflows/ci.yml` の `check` job と `.github/workflows/extras-smoke.yml` の `extras-smoke` job に `python-version: ["3.12", "3.13"]` の matrix を追加する（`rename-smoke` / `audit` は 3.12 単独のまま・理由は proposal 1）
- [x] 2. `.pre-commit-config.yaml`: `pre-commit-hooks` repo 直上に tag pin が意図的である旨のコメントを追加する（根拠は proposal 2）
- [x] 3. pyproject.toml: coverage 設定に fail-under を置かないことが意図的である旨のコメントを追加する（根拠は proposal 3）
- [x] 4. `docs/optional/codex-review.md` の使い方節に「`/codex:review` は focus 非対応・focus / 観点付きレビューは `/codex:adversarial-review`」を追記する（点検結果は proposal 4）
- [x] 5. `docs/optional/template-update.md` を新規作成する（下流向け cherry-pick 手順 1 枚・含有項目は proposal 5）
- [x] 6. `docs/template/release.md` を新規作成する（保守側リリース手順 1 枚・含有項目は proposal 6）
- [x] 7. `TEMPLATE_VERSION` を `0.1.0` → `1.0.0` へ更新する（pyproject.toml の version は触らない）
- [x] 8. README「ドキュメント構成」を更新する（docs/template 行の ADR 範囲と release.md・docs/optional 行にテンプレ更新手順を追加）
- [x] 9. `task check`・`task openspec:validate`・verify-change（doctor の v1.0.0 INFO 表示・新規 / 追記 docs のリンク先実在・yml は check-yaml。3.13 実行確認は CI に委ねる旨を明記）を実施する
