# Serena MCP の導入（オプション・uvx 実行）

Serena はセマンティックなコード理解・symbol 単位編集を提供する MCP server
（<https://github.com/oraios/serena>）。**既存コードが育ってから / 大規模リファクタリング時のみ**
opt-in する（短い修正主体の初期段階では過剰・§10.2）。

実行は **uvx**（uv 同梱のツールランナー）を使う。Serena 自体には追加の Node / Docker を
必要としない。これは v2 のテンプレート管理ランタイムである Node.js 24 の必須境界とは別の
実行要件である。上流 docs には Docker 版・ローカル clone 版もあるが、本テンプレートでは
uvx 形を既定とし代替はそちらに委ねる。

コアの `.mcp.json.template` / `.codex/config.toml.template` には Serena エントリを**入れない**
（JSON はコメント不可でコメントアウト保持ができず、実エントリを足すと Serena がコア前提化する）。
以下の snippet を各自で追記する。

## Claude Code（.mcp.json）

`.mcp.json` は `task mcp:setup` が template から**毎回再生成する生成物**のため、直接追記すると
次回の再生成で消える。**自分のプロジェクトの `.mcp.json.template` に追記**してから
`task mcp:setup` で再生成するのが恒久策（Serena エントリに secret は含まれないためコミット可）:

```json
{
  "mcpServers": {
    "context7": { "...": "既存エントリはそのまま" },
    "serena": {
      "type": "stdio",
      "command": "uvx",
      "args": [
        "--from", "git+https://github.com/oraios/serena",
        "serena", "start-mcp-server",
        "--context", "claude-code",
        "--project-from-cwd"
      ]
    }
  }
}
```

## Codex（.codex/config.toml）

同様に `.codex/config.toml.template` へ追記して `task mcp:setup` で再生成する:

```toml
[mcp_servers.serena]
startup_timeout_sec = 15
command = "uvx"
args = [
  "--from", "git+https://github.com/oraios/serena",
  "serena", "start-mcp-server",
  "--context", "codex",
  "--project-from-cwd",
]
```

## 注意

- `git+https://github.com/oraios/serena` は最新 main を都度取得する（上流 docs の推奨形）。
  起動が遅い / 再現性を固定したい場合は `git+https://github.com/oraios/serena@<tag>` で
  リリースタグに pin する。
- `--project-from-cwd` はカレントディレクトリをプロジェクトとして自動認識する。単一
  プロジェクト固定なら `--project /path/to/repo` でもよい。
- `scripts/setup-mcp.sh` は Context7 の API key 置換専用で、Serena エントリの生成・マージは
  行わない（template に書いたものがそのまま実体へ写る）。
- 導入後は `task doctor` が生成済み `.mcp.json` の Serena エントリ在席を INFO で報告する
  （在席 probe のみ・接続テストはしない）。
