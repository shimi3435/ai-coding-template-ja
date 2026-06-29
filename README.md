# ai-coding-template-ja

日本語で AI コーディングエージェント（Codex / Claude Code）を使う研究用 Python
プロジェクトのテンプレート（Ubuntu 対象）。

## 構成

**機械コア（PR1）**

- Python 開発基盤: uv / pyproject.toml / uv.lock / .python-version (3.12)
- 品質: ruff（format + lint）/ basedpyright（basic）/ pytest / pytest-cov
- 軽量 pre-commit（ruff ＋ ファイル系 ＋ detect-private-key）
- タスクランナー: Taskfile（人間にも AI にも同じコマンド）
- スクリプト: bootstrap.sh（Ubuntu）/ doctor.py（環境診断）/ rename-package.py（改名）
- CI（GitHub Actions: uv sync / ruff / basedpyright / pytest ＋ rename-smoke ＋ security）

**エージェント統合（PR2・なおコア）**

- [AGENTS.md](AGENTS.md): 全エージェント共通の作業方針の単一の正。薄い [CLAUDE.md](CLAUDE.md)
  が `@AGENTS.md` を参照。詳細は [docs/agents/](docs/agents/)（workflow / safety / mcp）。
- OpenSpec 初期構成: `openspec/`（project.md ＋空 specs/changes・Node 不要の手書き運用）
- Skills（vendoring・MIT のみ）: `grill-me` / `grill-with-docs` / `tdd` / `diagnosing-bugs` /
  `caveman`。実体は `.agents/skills/`、`.claude/skills` と `.codex/skills` が symlink。
  供給元・commit・license・sha256 は `.agents/skills/skills.lock.json` に記録。
- Context7 リモート MCP のテンプレート（`.mcp.json.template` / `.codex/config.toml.template`）と
  `setup-mcp.sh`。GitHub の read 操作は `gh` CLI（GitHub MCP はオプション）。
- secret スキャン: CI security ジョブ（gitleaks）＋ `task security`。

## このテンプレートから新規プロジェクトを作る

1. GitHub の **"Use this template"** で新規リポジトリを作成
2. `./scripts/bootstrap.sh`
   （uv を確認付きで導入し `task setup` まで実行。go-task / gh は導入手順を表示）
3. パッケージを新プロジェクト名へ改名する（入力は module 名）:

   ```bash
   task rename -- my_research_project           # まず dry-run で差分を確認
   task rename -- my_research_project --apply    # 実適用（src 名 + pyproject + uv sync）
   ```

   配布名（`my-research-project`）は module 名から自動導出されます。
4. `task check` と `task doctor` が green になることを確認

## 2 回目以降

```bash
task setup     # uv sync（dev のみ）＋ pre-commit install
task check     # ruff format --check / ruff check / basedpyright / pytest
task doctor    # 環境診断（read-only・FAIL ゼロで green）
```

## 主なタスク

| タスク | 内容 |
| --- | --- |
| `task setup` | uv sync（dev group のみ）＋ pre-commit hooks |
| `task check` | 品質チェック一式 |
| `task fix` | ruff format ＋ ruff check --fix |
| `task test` / `task lint` / `task typecheck` | 個別実行 |
| `task doctor` | 環境診断（`-- --online` で到達性 / `-- --github` で gh 文脈 opt-in） |
| `task rename -- <module> [--apply]` | パッケージ改名 |
| `task skills:update` / `task skills:doctor` | skill symlink 再生成 / lock 整合検証 |
| `task mcp:setup` | `.mcp.json` / `.codex/config.toml` を `.env` から生成 |
| `task security` | secret / 依存スキャン（gitleaks ほか・在席時） |
| `task prune-template-docs [-- --apply]` | テンプレ メタ文書 docs/template/ の削除 |
| `task clean` | キャッシュ・カバレッジ生成物の削除 |

## ドキュメント構成

- `docs/adr/` … **下流の研究 ADR 用**（出荷時は `0000-template.md` の道標 1 枚のみ）。
- `docs/template/` … **テンプレ自身のメタ文書**（設計判断 ADR 0001-0006・grill 記録）。
  下流では不要なら `task prune-template-docs -- --apply` で削除できる（ADR-0006）。
- `docs/agents/` … エージェント向けの workflow / safety / mcp 詳細。
- `docs/optional/` … オプション機能の手順（caveman hook など）。

## ライセンス

ルート [LICENSE](LICENSE) は MIT（テンプレ著者のオリジナル成果物）。`.agents/skills/` に
vendoring した第三者 skill は**各 skill の `LICENSE` に従う**（いずれも MIT。供給元・commit・
license は `.agents/skills/skills.lock.json` に記録）。

## 注意

- `.env` はコミットしない（`.env.example` をコピーして使う）。MCP 実体（`.mcp.json` /
  `.codex/config.toml`）も生成物のため gitignore 済み（`task mcp:setup` で再生成）。
- API key / token / private key を出力・保存・コミットしない
- GitHub の認証（`gh auth login` / `GH_TOKEN`）は各自で設定する
- WSL 利用時は **WSL 上の Ubuntu** で `bootstrap.sh` を実行する
