# Tasks: `code-review` skill の下流 vendoring

- [x] 1. 上流 `code-review/SKILL.md`（mattpocock/skills `391a2701`）を
       `.agents/skills/code-review/SKILL.md` へ byte-match で取得し、実測 sha256 が
       `6a65cc61114f96db07ec41e3920e67c9c5bf70dd6e0901eb9460ebcb2bdc209f` と一致することを確認する。
- [x] 2. `.agents/skills/code-review/LICENSE`（MIT・`grill-me/LICENSE` と byte 一致）を追加する。
- [x] 3. `skills.lock.json` に `code-review` エントリを追加する
       （source=mattpocock/skills・source_type=github・commit=`391a2701…`（40 桁）・
       license=MIT・license_file・redistribution=allowed・sha256=実測値）。
- [x] 4. `task skills:update` で `.claude/skills/code-review` /
       `.codex/skills/code-review` symlink を冪等生成する。
- [x] 5. `task skills:doctor`（＝`uv run pytest tests/test_skills_lock.py -q`）green を確認する。
       red の間は取り込み未完として lock / 実体を修正して再実行する。
- [x] 6. `task check` と `task openspec:validate` が green であることを確認する。
- [x] 7. self-review で実体・lock・proposal（spec-holes 表）を突き合わせる。
- [ ] 8. close: マージ前の最終コミットで本 change ディレクトリを削除し、ふりかえり行を
       `docs/template/retrospectives.md` に追記する。
