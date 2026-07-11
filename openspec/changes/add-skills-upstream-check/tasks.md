# Tasks: skills.lock の上流陳腐化検知タスクを追加する

- [x] 1. `scripts/skills-upstream-check.py` と単体テスト `tests/test_skills_upstream_check.py`
       を実装する（分類ロジックは純関数に分離しテストはネットワーク不使用。判定規則・
       exit code 規約は spec delta のとおり。既存 scripts の流儀（doctor.py の [OK]/[INFO]/
       [WARN] 表記・docstring 規約）に合わせる）。
- [x] 2. `Taskfile.yml` に `skills:upstream` タスクを追加する（desc に opt-in・ネットワーク
       使用・gh 必須・報告のみを明記）。
- [x] 3. `docs/agents/workflow.md` の Skills 節に `task skills:upstream` の 1 行導線を追記する。
- [x] 4. 実機確認: `task skills:upstream` を実行し、現 lock（github 7 件・local 3 件）への
       分類報告と exit 0 を確認した（WARN 3 件=caveman/grilling/tdd 上流更新・INFO 4 件・
       local 3 件スキップ・exit 0。事前の手動 gh api 確認と整合）。
- [x] 5. `task check` と `task openspec:validate` が green であることを確認する。
- [x] 6. self-review で spec-holes 穴リスト（H1〜H11）とフェーズ 2 対応表・実装を突き合わせた
       （未知 source_type の扱いの spec / 実装不整合を検出し spec delta 側を明確化して解消）。
- [ ] 7. close: マージ前の最終コミットで本 change ディレクトリを削除し、ふりかえり行を
       retrospectives.md に記録する。
