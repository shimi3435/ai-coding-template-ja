# Tasks: `task skills:update` の非 symlink 保護と GitHub MCP PAT 案内の是正

- [x] 1. tdd で `tests/test_setup_skills.py`（新規）を先に書き、`scripts/setup-skills.sh` に
       保護を実装する（spec delta のとおり: preflight で非 symlink 衝突を全件列挙→無変更で
       非ゼロ終了＋復旧手順表示・置換削除は symlink の unlink に限定・`rm -rf` 廃止。
       テストは tmp 配下にリポジトリ構造を複製して subprocess 実行・ネットワーク不使用）。
- [x] 2. `docs/agents/mcp.md` の Codex 向け GitHub MCP 手順を書き換える（PAT 直書き案内を
       撤去し `env_vars` forward 手順＋確認済みバージョン明記＋read-only fine-grained PAT・
       短期限の推奨 1 行。`task mcp:setup` 再生成の注意は維持）。
- [x] 3. 実機確認（verify-change）: 現リポジトリで `task skills:update` の冪等再実行、
       一時的な人工衝突（実ディレクトリ）での保護・無変更・復旧手順表示を確認する。
- [x] 4. `task check` と `task openspec:validate` が green であることを確認する。
- [x] 5. self-review で proposal の spec-holes 穴リストとフェーズ 2 対応表・実装を突き合わせる。
- [ ] 6. close: マージ前の最終コミットで本 change ディレクトリを削除し、ふりかえり行を
       `docs/template/retrospectives.md` に追記する。
