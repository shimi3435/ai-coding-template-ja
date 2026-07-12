# Tasks: 運用ループ規約 4 件の明文化

- [x] 1. `openspec/project.md` の「テンプレート自身の change 運用」節に軽微変更の
       change 不要基準を追記する（spec delta `openspec-change-policy` のとおり）。
- [x] 2. `docs/agents/workflow.md` の Skills 節に skill 上流取り込み手順を追記する
       （spec delta `skills-vendoring-guidance` のとおり）。
- [x] 3. `docs/agents/safety.md` に dependabot PR の処理基準を追記する
       （spec delta `dependency-update-policy` のとおり）。
- [x] 4. `docs/template/release.md` のリリース前提チェックに陳腐化点検 1 項目を追加する
       （spec delta `release-checklist` のとおり）。
- [x] 5. `task check` と `task openspec:validate` が green であることを確認する。
- [x] 6. self-review で spec delta と docs 実装・proposal の spec-holes 表を突き合わせる。
- [ ] 7. close: マージ前の最終コミットで本 change ディレクトリを削除し、ふりかえり行を
       `docs/template/retrospectives.md` に追記する。
