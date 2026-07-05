# GSD の導入（オプション・opt-in install）

GSD（GSD Core）は複数 change を横断するロードマップ / フェーズ管理システム。50+ の skills と
installer 機構を持つ大型資産のため、本テンプレートには **vendoring しない**（コミットしない・
`.agents/skills/skills.lock.json` の管理対象外）。導入は各自の環境への opt-in install で行い、
installer が取得したファイルはユーザ環境（`~/.claude/` 等）に置かれる。

## インストール（要 Node.js・コアは Node 不要のまま）

```bash
npx @opengsd/gsd-core@latest
```

- installer が対話で runtime（Claude Code / Codex ほか）と global / local を選択させる。
  `agents/` / `commands/` の手動コピーはしない（installer がクロス runtime 互換を担う）。
- 供給元: npm `@opengsd/gsd-core`（<https://github.com/open-gsd/gsd-core>）。
  v1.6.1 で確認（2026-07-02）。
- 更新は同コマンドの再実行（導入済み環境では `/gsd-update` も使える）。

## OpenSpec との責務境界（ADR-0003・GSD を入れても変わらない）

[docs/agents/workflow.md](../agents/workflow.md) の境界を再掲する。GSD 導入時も:

- **per-change のタスク分解・順序・進捗は OpenSpec `tasks.md` / `/opsx:apply`
  （CLI 等価は `openspec instructions apply --change`・導線は [workflow.md](../agents/workflow.md)）が所有する。**
  GSD は `openspec/changes/*/tasks.md` を二重化しない。
- GSD が担うのは**複数 change を横断する**ロードマップ / フェーズ順序 / マイルストーン /
  セッション跨ぎ復帰のみ。
- **受け入れ基準を GSD 側で新規定義しない**（OpenSpec の仕様・受け入れ基準を参照する）。
- GSD のロードマップからは change ディレクトリへ**リンク**するのみで内容を複製しない。

## 診断

GSD は環境レベル（`~/.claude/` 等）にインストールされ、リポジトリ内に信頼できる在席シグナルを
残さないため、`task doctor` は GSD を probe しない（docs のこの手順が導線のすべて）。
