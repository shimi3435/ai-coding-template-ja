# ai-coding-template-ja

日本語で AI コーディングエージェント（Codex / Claude Code）を使う研究用 Python
プロジェクトのテンプレート（Ubuntu 対象）。

> 使い方の全体像・オプションの選び方・詰まったときの導線は、通し読みガイド
> [docs/guide.md](docs/guide.md) にまとめてある（本 README は最短手順の quickstart）。

## 構成

**機械コア（PR1）**

- Python 開発基盤: uv / pyproject.toml / uv.lock / .python-version (3.12)
- 品質: ruff（format + lint）/ basedpyright（basic）/ pytest / pytest-cov
- 軽量 pre-commit（ruff ＋ ファイル系 ＋ detect-private-key）
- タスクランナー: Taskfile（人間にも AI にも同じコマンド）
- スクリプト: bootstrap.sh（Ubuntu）/ doctor.py（環境診断）/ rename-package.py（改名）
- CI（GitHub Actions 4 ジョブ: check（uv sync / ruff / basedpyright / pytest）＋
  rename-smoke ＋ security（gitleaks）＋ audit（pip-audit / bandit・PR3b））

**エージェント統合（PR2・なおコア）**

- [AGENTS.md](AGENTS.md): 全エージェント共通の作業方針の単一の正。薄い [CLAUDE.md](CLAUDE.md)
  が `@AGENTS.md` を参照。詳細は [docs/agents/](docs/agents/)（workflow / safety / mcp）。
- OpenSpec 初期構成: `openspec/`（project.md ＋空 specs/changes・Node 不要の手書き運用）
- Skills（vendoring・MIT のみ）: `grill-me` / `grill-with-docs`（本体の `grilling` /
  `domain-modeling` に委譲）/ `tdd` / `diagnosing-bugs` / `caveman`。
  実体は `.agents/skills/`、`.claude/skills` と `.codex/skills` が symlink。
  供給元・commit・license・sha256 は `.agents/skills/skills.lock.json` に記録。
- Context7 リモート MCP のテンプレート（`.mcp.json.template` / `.codex/config.toml.template`）と
  `setup-mcp.sh`。GitHub の read 操作は `gh` CLI（GitHub MCP はオプション）。
- secret スキャン: CI security ジョブ（gitleaks）＋ `task security`。

**オプション層（PR3+・opt-in・既定では入らない）**

- extras（`uv.lock` に解決済み・導入は任意）:
  - `research` = numpy / scipy / matplotlib / pandas → `task setup:research`
  - `notebook` = jupyter / jupytext / nbstripout / nbqa → `task setup:notebook`
  - `experiment` = hydra-core / mlflow / dvc → `task setup:experiment`
  - 全部入り → `task setup:all`（`uv sync --all-extras`）
- notebook 管理（nbstripout の pre-commit overlay など）は
  [docs/optional/notebook.md](docs/optional/notebook.md)。
- セキュリティ監査ゲート（PR3b）: `security` dependency-group（pip-audit / bandit・
  無印 `uv sync` では入らない）。CI `audit` ジョブと `task security` が
  `uv run --group security` で同一範囲を監査（pip-audit = コア依存セット・
  bandit = `src`）。extras 込みの任意監査と `--ignore-vuln` 運用は
  [docs/optional/extras-audit.md](docs/optional/extras-audit.md)。
- GSD（横断ロードマップ管理・opt-in install）→ [docs/optional/gsd.md](docs/optional/gsd.md)
- Serena MCP（大規模リファクタ時のみ・uvx 実行）→ [docs/optional/serena.md](docs/optional/serena.md)
- GitHub MCP（ローカルバイナリ / Docker / リモート HTTP の 3 形態・read-only 既定）→
  [docs/agents/mcp.md](docs/agents/mcp.md)
- クロス AI レビュー（Codex plugin・人起点のみ）→
  [docs/optional/codex-review.md](docs/optional/codex-review.md)

オプションの在席は `task doctor` が INFO で報告するのみ（不在が正常・WARN/FAIL にしない）。

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
| `task setup:research` ほか | extras 導入（`setup:notebook` / `setup:experiment` / `setup:all`） |
| `task check` | 品質チェック一式 |
| `task fix` | ruff format ＋ ruff check --fix |
| `task test` / `task lint` / `task typecheck` | 個別実行 |
| `task doctor` | 環境診断（`-- --online` で到達性 / `-- --github` で gh 文脈 opt-in） |
| `task rename -- <module> [--apply]` | パッケージ改名 |
| `task skills:update` / `task skills:doctor` | skill symlink 再生成 / lock 整合検証 |
| `task mcp:setup` | `.mcp.json` / `.codex/config.toml` を `.env` から生成 |
| `task security` | gitleaks（在席時）＋ pip-audit / bandit ゲート（CI audit ジョブと同一範囲） |
| `task nb:strip` / `nb:sync` / `nb:check` | notebook 出力除去 / jupytext 同期 / nbqa lint（extra 在席時） |
| `task prune-template-docs [-- --apply]` | テンプレ メタ文書 docs/template/ の削除 |
| `task clean` | キャッシュ・カバレッジ生成物の削除 |

## ドキュメント構成

- [docs/guide.md](docs/guide.md) … **人間の下流ユーザ向け通し読みガイド**（全体像・
  立ち上げの「なぜ」・オプションの選び方・詰まったとき）。
- `docs/adr/` … **下流の研究 ADR 用**（出荷時は `0000-template.md` の道標 1 枚のみ）。
- `docs/template/` … **テンプレ自身のメタ文書**（設計判断 ADR 0001-0006・grill 記録）。
  下流では不要なら `task prune-template-docs -- --apply` で削除できる（ADR-0006）。
- `docs/agents/` … エージェント向けの workflow / safety / mcp 詳細。
- `docs/optional/` … オプション機能の手順（caveman hook・notebook 管理・extras 監査・
  GSD・Serena MCP・クロス AI レビュー）。

## 研究成果物の扱い

- `data/` … 入力データ。`.gitkeep` を除き gitignore 済み（中身は commit されない・各自の
  領分。大容量 / 非公開データを置ける。認証情報・token は置かず `.env` / secret manager を使う）。
- `results/` … 実験結果・生成物。同じく gitignore 済み。
- `configs/` … 実験設定。追跡対象（再現性のため commit 推奨）。
- `notebooks/` … 研究 notebook。追跡対象（出力除去は `task nb:strip` /
  [docs/optional/notebook.md](docs/optional/notebook.md)）。

gitignore 方針の正は `.gitignore` の `data/*` / `results/*` エントリ。

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
