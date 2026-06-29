# ai-coding-template-ja

日本語で AI コーディングエージェント（Codex / Claude Code）を使う研究用 Python
プロジェクトのテンプレート（Ubuntu 対象）。

> このリポジトリは段階的に構築中です。本 PR では**機械コア**（uv / ruff /
> basedpyright / pytest / pre-commit / Taskfile / 改名・診断スクリプト / 最小 CI）を
> 提供します。AGENTS.md・OpenSpec・Skills・MCP 等のエージェント統合層は後続 PR で
> 追加されます。

## 構成（機械コア）

- Python 開発基盤: uv / pyproject.toml / uv.lock / .python-version (3.12)
- 品質: ruff（format + lint）/ basedpyright（basic）/ pytest / pytest-cov
- 軽量 pre-commit（ruff ＋ ファイル系 ＋ detect-private-key）
- タスクランナー: Taskfile（人間にも AI にも同じコマンド）
- スクリプト: bootstrap.sh（Ubuntu）/ doctor.py（環境診断）/ rename-package.py（改名）
- 最小 CI（GitHub Actions: uv sync / ruff / basedpyright / pytest）

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
| `task doctor` | 環境診断 |
| `task rename -- <module> [--apply]` | パッケージ改名 |
| `task clean` | キャッシュ・カバレッジ生成物の削除 |

## 注意

- `.env` はコミットしない（`.env.example` をコピーして使う）
- API key / token / private key を出力・保存・コミットしない
- GitHub の認証（`gh auth login` / `GH_TOKEN`）は各自で設定する
- WSL 利用時は **WSL 上の Ubuntu** で `bootstrap.sh` を実行する
