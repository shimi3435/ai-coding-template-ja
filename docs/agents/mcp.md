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
  育ってから opt-in。
- **GitHub MCP**: リモート HTTP read-only（Copilot 要の可能性）/ ローカルバイナリ / Docker から選択。

## skills.lock との関係

vendored skill の供給元 / commit / license / sha256 は
[`.agents/skills/skills.lock.json`](../../.agents/skills/skills.lock.json) に記録する
（第三者 skill の同梱＝再配布のため）。詳細は [docs/agents/workflow.md](workflow.md)。
