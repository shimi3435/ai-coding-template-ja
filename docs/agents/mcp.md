# MCP 設定

作業方針の単一の正は [AGENTS.md](../../AGENTS.md)。本書は MCP の機構設定詳細（§10）。

## コア MCP: Context7（リモート HTTP・Node 不要）

ライブラリ / CLI / SDK の最新ドキュメント確認に Context7 MCP を使う。コア MCP はこれのみ。
実行形態はリモート HTTP（`https://mcp.context7.com/mcp`）を既定とし Node 非依存（ADR-0002）。

### 設定の配布と生成

| 種別 | ファイル | 扱い |
| --- | --- | --- |
| 配布（コミット） | `.mcp.json.template` / `.codex/config.toml.template` / `.env.example` | コミットする |
| 生成（gitignore） | `.mcp.json` / `.codex/config.toml` / `.env` | コミットしない |

- 値の単一ソース（source of record）は `.env` の `CONTEXT7_API_KEY`。
- 実体（`.mcp.json` / `.codex/config.toml`）は `task mcp:setup`（`scripts/setup-mcp.sh`）が
  template ＋ `.env` から**冪等に再生成する生成物**。古い値は残さない（毎回上書き）。
- header 名は literal `CONTEXT7_API_KEY`（Bearer ではない）。両 template で揃える。
- least-privilege: Claude `.mcp.json` は `tools` を `query-docs` / `resolve-library-id` に制限。
  Codex の `mcp_servers` にはツール allowlist フィールドが無いため、Codex 側は制限しない。

### 手順

```bash
cp .env.example .env          # CONTEXT7_API_KEY=... を設定
task mcp:setup                # .mcp.json / .codex/config.toml を生成
```

`task doctor` は Context7 設定の有無と `.env` との key drift を WARN で検査する。到達性
（実際に Context7 を叩く）は `task doctor -- --online` 時のみ行う（既定は叩かない）。

### プライバシー注記（ADR-0002）

リモート Context7 はクエリを第三者へ送信する。機微情報を含むクエリに注意する。プライバシー /
オフライン重視のプロジェクトはローカル MCP（要 Node / Docker）へ opt-in する。

## GitHub 連携

- コアでは GitHub の read 操作（issue / PR / Actions / repo 参照）を `gh` CLI（Bash 経由）で行う
  （ADR-0004）。`gh` は無料 PAT で動き Copilot 不要。認証は `gh auth login` / `GH_TOKEN` で各自。
- GitHub MCP はオプション層（Copilot 契約や構造化出力が要るプロジェクトのみ opt-in）。
  `task doctor -- --github`（または `DOCTOR_REQUIRE_GH=1`）で GitHub ワークフロー文脈の
  チェックを opt-in できる。

## オプション MCP

- **Serena MCP**: セマンティックなコード理解・symbol 単位編集・大規模リファクタリング。既存コードが
  育ってから opt-in。手順（uvx 実行・Claude / Codex 両 snippet）は
  [docs/optional/serena.md](../optional/serena.md)。

### GitHub MCP（オプション・3 形態から選択）

構造化された Issue / PR / Actions 参照が要るプロジェクトのみ opt-in する（コアは `gh` CLI）。
共通方針: **read-only を既定**とし、PAT は環境変数で渡す（ファイルへ直書き・コミットしない）。
コアの `.mcp.json.template` / `.codex/config.toml.template` には GitHub エントリを入れない
（実体追記は以下の snippet を各自で）。3 形態を推奨順に:

**(1) ローカル Go バイナリ `github-mcp-server`（推奨）** — Node / Docker 不要（ADR-0002 と
最整合）。PAT が read スコープなら Copilot 契約も不要。
[releases](https://github.com/github/github-mcp-server/releases)（v1.5.0 で
`github-mcp-server_Linux_x86_64.tar.gz` を確認・2026-07-02）からバイナリを取得し PATH へ置く。

```json
{
  "mcpServers": {
    "github": {
      "type": "stdio",
      "command": "github-mcp-server",
      "args": ["stdio", "--read-only", "--toolsets", "repos,issues,pull_requests,actions"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}" }
    }
  }
}
```

Codex は実体 `.codex/config.toml`（gitignore 済み）へ同等の stdio エントリを追記する。TOML へ
PAT は書かず、`env_vars` で親環境の変数名を指定して forward する（Codex は MCP server の
子プロセス環境を最小集合＋ `env_vars` 指定分に限定する。codex-cli 0.142.5 で確認・2026-07-12）:

```toml
[mcp_servers.github]
command = "github-mcp-server"
args = ["stdio", "--read-only", "--toolsets", "repos,issues,pull_requests,actions"]
env_vars = ["GITHUB_PERSONAL_ACCESS_TOKEN"]
```

環境変数は起動シェルで export してから起動する（例:
`export GITHUB_PERSONAL_ACCESS_TOKEN=$(gh auth token)`。または各自の secret manager から供給）。
PAT は read-only の fine-grained PAT・短い有効期限を推奨する。実体は非コミットだが
`task mcp:setup` の再生成で消える点に注意（GitHub エントリは template に入れない）。

**(2) Docker `ghcr.io/github/github-mcp-server`** — バイナリ配置を避けたい場合。

```bash
docker run -i --rm \
  -e GITHUB_PERSONAL_ACCESS_TOKEN \
  -e GITHUB_READ_ONLY=1 \
  -e GITHUB_TOOLSETS="repos,issues,pull_requests,actions" \
  ghcr.io/github/github-mcp-server
```

（MCP クライアント設定では上記を `command: docker` ＋ `args` に分解して登録する。）

**(3) リモート HTTP `https://api.githubcopilot.com/mcp/`** — インストール不要だが最後の選択肢。
read-only は URL で指定できる（例 `https://api.githubcopilot.com/mcp/readonly`）。認証は
`Authorization: Bearer <PAT>` header。**caveat: Copilot エンタイトルメント要の可能性（未検証）**
— 上流 docs は PAT 直指定の設定例を載せる一方、Copilot IDE 向けガイドは Copilot ライセンスを
要件に挙げており、ホスト / アカウントのポリシー次第で拒否され得る。使う前に手元で検証する:

```bash
gh api /user          # PAT 自体の有効性確認
curl -sS -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $GITHUB_PERSONAL_ACCESS_TOKEN" \
  https://api.githubcopilot.com/mcp/readonly   # 401 なら PAT では通らない
```

`task doctor` は GitHub MCP の接続 probe をしない（既定 offline-green を維持）。検証は上記の
手動コマンドで行う。

## skills.lock との関係

vendored skill の供給元 / commit / license / sha256 は
[`.agents/skills/skills.lock.json`](../../.agents/skills/skills.lock.json) に記録する
（第三者 skill の同梱＝再配布のため）。詳細は [docs/agents/workflow.md](workflow.md)。
