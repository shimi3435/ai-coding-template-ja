# ai-coding-template-ja

研究者が AI コーディングを安全に始める開発基盤を提供する、日本語対応の研究用 Python
プロジェクトテンプレート（Codex / Claude Code、Ubuntu 対象）。作成直後に `task check` /
`task doctor` が green になる最小実用セットに、必要なものだけ opt-in で足していく。

必須ランタイムは Node.js 24 LTS、npm、Python 3.14 以上。リポジトリの既定は
`.node-version` の `24` と `.python-version` の `3.14` で宣言する。Node は利用者アプリケーション
ではなく、TypeScript 製 `repo-tools` を動かすテンプレート管理プレーンである。

> 使い方の全体像・オプションの選び方・詰まったときの導線は、通し読みガイド
> [docs/guide.md](docs/guide.md) にまとめてある（本 README は最短手順の quickstart）。

## このテンプレートから新規プロジェクトを作る

1. GitHub の **"Use this template"** で新規リポジトリを作成
2. `./scripts/bootstrap.sh`
   （Node.js 24 / npm / Python 3.14 以上を検証し、uv を確認付きで導入して `task setup`
   まで実行。Node.js 24 がない場合は手動導入するか、Linux x64 / arm64 で
   `./scripts/bootstrap.sh --install-node` を明示指定する。導入時は出力される
   `export PATH="<導入先>/bin:$PATH"` を次回 shell でも実行する。go-task / gh は導入手順を表示）
3. パッケージを新プロジェクト名へ改名する（入力は module 名）:

   ```bash
   task rename -- my_research_project           # まず dry-run で差分を確認
   task rename -- my_research_project --apply    # 実適用（src 名 + pyproject + uv sync）
   ```

   配布名（`my-research-project`）は module 名から自動導出されます。
4. `task check` と `task doctor` が green になることを確認

## 2 回目以降

```bash
task setup     # npm ci --ignore-scripts ＋ uv sync --inexact ＋ pre-commit install
task check     # Node contracts / TypeScript / Node test ＋既存 Python checks
task doctor    # 環境診断（read-only・FAIL ゼロで green）
```

## 主なタスク

| タスク | 内容 |
| --- | --- |
| `task setup` | `npm ci --ignore-scripts` ＋ Python inexact sync（導入済み extras を保持）＋ pre-commit hooks |
| `task setup:node` | lock 済み Node dependency を `npm ci --ignore-scripts` で導入 |
| `task setup:research` ほか | extras を加算導入（`setup:notebook` / `setup:experiment` / `setup:all`） |
| `task check` | 品質チェック一式 |
| `task check:isolated` | OpenSpec CLI / ネットワークなしの隔離環境で `task check` を検証 |
| `task fix` | ruff format ＋ ruff check --fix |
| `task test` / `task lint` / `task typecheck` | 個別実行 |
| `task doctor` | 環境診断（`-- --online` で到達性 / `-- --github` で gh 文脈 opt-in） |
| `task rename -- <module> [--apply]` | パッケージ改名 |
| `task skills:links` / `task skills:verify` | skill symlink 再生成 / offline 整合検証 |
| `task skills:check` / `task skills:update` | remote 更新確認 / preview（`-- --apply` で適用） |
| `task skills:lock-local` | first-party skill lock preview（`-- --apply` で適用） |
| `task mcp:setup` | `.mcp.json` / `.codex/config.toml` を `.env` から生成 |
| `task audit:node` | `npm audit --audit-level=high` を明示的にオンライン実行 |
| `task security` | gitleaks（在席時）＋ pip-audit / bandit ゲート（CI audit ジョブと同一範囲） |
| `task nb:strip` / `nb:sync` / `nb:check` | notebook 出力除去 / jupytext 同期 / nbqa lint（extra 在席時） |
| `task prune-template-docs [-- --apply]` | テンプレ メタ文書 docs/template/ の削除 |
| `task clean` | キャッシュ・カバレッジ生成物の削除 |

## 構成

### コア（常に有効）

初回の無印 `task setup` で入る最小実用セット。作成直後に green になる。再実行時は
inexact sync により、導入済み extras を削除しない。

- **必須ランタイム**: Node.js 24 LTS / npm / Python 3.14 以上。`.node-version` は `24`、
  `.python-version` は `3.14`。Node.js は TypeScript ESM の `repo-tools` を直接実行する管理プレーン。
- **Python 開発基盤**: uv / pyproject.toml / uv.lock。
- **品質チェック**: ruff（format + lint）/ basedpyright（basic）/ pytest / pytest-cov を
  `task check` に集約。軽量 pre-commit（ruff ＋ ファイル系 ＋ detect-private-key）。
- **管理 CLI とタスクランナー**: TypeScript ESM の `repo-tools` を Node.js 24 で直接実行し、
  Taskfile を人間と AI の共通公開入口にする。bootstrap.sh（Ubuntu）/ doctor.py（環境診断）/
  rename-package.py（改名）を同梱。
- **CI**（GitHub Actions）: check（`npm ci --ignore-scripts` / Node contracts / TypeScript / Node test /
  既存 Python checks）＋ rename-smoke ＋ security（gitleaks）＋ audit（pip-audit / bandit）。
- **エージェント運用**: [AGENTS.md](AGENTS.md)（全エージェント共通の作業方針の単一の正）と
  薄い [CLAUDE.md](CLAUDE.md)。OpenSpec 直接実行（`openspec/`・CLI 不在時も Markdown fallback
  で運用可能）。`execute-openspec-change` skill は change の preflight 後、`tasks.md` の依存順に
  実装・検証・進捗更新する。
  vendored skills（実体 `.agents/skills/`・`.claude` / `.codex` が symlink・review 済み供給元と
  license は [`.agents/skills/skills.sources.json`](.agents/skills/skills.sources.json)、resolved state は
  [`.agents/skills/skills.lock.json`](.agents/skills/skills.lock.json) が正）。
  Context7 リモート MCP のテンプレート（`task mcp:setup` で生成）。
- **secret スキャン**: CI security ジョブ（gitleaks）＋ `task security`。

### オプション（opt-in・既定では入らない）

コアを変えずに必要なものだけ足す。選び方は [docs/guide.md §6](docs/guide.md)。

- **extras**（`uv.lock` に解決済み）: `research`（numpy / scipy / matplotlib / pandas）/
  `notebook`（jupyter / jupytext / nbstripout / nbqa）/ `experiment`（hydra-core / mlflow /
  dvc）→ `task setup:research` ほか（全部入りは `task setup:all`）。
- **セキュリティ監査ゲート**: `security` dependency-group（pip-audit / bandit）。CI audit
  ジョブと `task security` が同一範囲を監査 → [docs/optional/extras-audit.md](docs/optional/extras-audit.md)。
- **notebook 管理**（nbstripout の pre-commit overlay 等）→ [docs/optional/notebook.md](docs/optional/notebook.md)。
- **Serena MCP**（大規模リファクタ時のみ）→ [docs/optional/serena.md](docs/optional/serena.md)。
- **GitHub MCP**（ローカル / Docker / リモート HTTP・read-only 既定）→ [docs/agents/mcp.md](docs/agents/mcp.md)。
- **クロス AI レビュー**（Codex plugin・人起点のみ）→ [docs/optional/codex-review.md](docs/optional/codex-review.md)。

オプションの在席は `task doctor` が INFO で報告するのみ（不在が正常・WARN/FAIL にしない）。

個別の `task setup:<extra>` は既存 extras を保持して加算導入する。その代わり inexact sync は
手動導入した余剰パッケージも保持する。コア環境だけへ戻す場合は exact な `uv sync` を実行する。

## ドキュメント構成

- [docs/guide.md](docs/guide.md) … **人間の下流ユーザ向け通し読みガイド**（全体像・
  立ち上げの「なぜ」・オプションの選び方・詰まったとき）。
- `docs/adr/` … **下流の研究 ADR 用**（出荷時は `0000-template.md` の道標 1 枚のみ）。
- `docs/template/` … **テンプレ固有メタ文書**（設計判断・リリース・ふりかえり）。
  下流では不要なら `task prune-template-docs -- --apply` で一括削除できる
  （ADR-0006）。
- `docs/agents/` … エージェント向けの workflow / safety / mcp 詳細。
- `docs/optional/` … オプション機能の手順（caveman hook・notebook 管理・extras 監査・
  Serena MCP・クロス AI レビュー・テンプレ更新の取り込み）。

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
vendoring した第三者 skill は**各 skill の `LICENSE` に従う**（いずれも MIT。供給元・license は
`.agents/skills/skills.sources.json`、resolved commit は `.agents/skills/skills.lock.json` に記録）。

## 注意

- `.env` はコミットしない（`.env.example` をコピーし、`chmod 600 .env` して使う）。MCP 実体（`.mcp.json` /
  `.codex/config.toml`）も生成物のため gitignore 済み（`task mcp:setup` で再生成）。
- API key / token / private key を追跡対象ファイルやログへ保存・出力しない。必要な secret は
  `.env` と gitignore 済みのローカル生成設定にのみ保存し、mode `0600` で保護する
- GitHub の認証（`gh auth login` / `GH_TOKEN`）は各自で設定する
- WSL 利用時は **WSL 上の Ubuntu** で `bootstrap.sh` を実行する
