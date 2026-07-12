# Tasks: vendored skill 3 件の上流取り込み

- [x] 1. 着手時に `task skills:upstream` を再実行し、caveman / grilling / tdd の WARN
       継続と上流 HEAD（moving HEAD 回避）を再確認する。
- [x] 2. caveman の実体を上流 `0d95a81d…` で byte-match 反映する
       （`.agents/skills/caveman/SKILL.md` + `README.md`）。
- [x] 3. grilling の実体を上流 `391a2701…` で byte-match 反映する
       （`.agents/skills/grilling/SKILL.md`）。
- [x] 4. tdd の実体を上流 `391a2701…` で byte-match 反映し、上流から削除された
       `refactoring.md` を `git rm .agents/skills/tdd/refactoring.md` する
       （`mocking.md` / `tests.md` は上流無変更で据え置き）。
- [x] 5. `skills.lock.json` の caveman / grilling / tdd 3 エントリの `commit` /
       `sha256` を取り込み先 commit・新 SKILL.md 実測値に更新する（lock は skill ごと）。
- [x] 6. `task skills:doctor` green（sha256 整合・孤児なし・symlink 解決）を確認する。
       red の間は取り込み未完として lock / 実体を修正して再実行する。
- [x] 7. `task check` と `task openspec:validate` が green であることを確認する。
- [x] 8. self-review で実体・lock・proposal（spec-holes 表）を突き合わせる。
- [ ] 9. close: マージ前の最終コミットで本 change ディレクトリを削除し、ふりかえり行を
       `docs/template/retrospectives.md` に追記する。
