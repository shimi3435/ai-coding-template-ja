# コア MCP はリモート HTTP read-only を既定とし Node を非コア依存にする

> Status: 一部 superseded（ADR-0004 による）。**GitHub MCP をコアとする部分は無効**。
> 本 ADR で生きている責務は「**コア MCP（Context7）はリモート HTTP・コアは Node 非依存**」のみ。
> GitHub MCP の扱いは ADR-0004 を参照（オプション降格・コアの GitHub read は gh CLI で代替）。

（以下は当初記述。GitHub MCP に関する箇所は ADR-0004 で置換済）

GitHub MCP と Context7 MCP は、ローカル / Docker / npx ではなく**リモート HTTP サーバ**をコア既定とする。GitHub MCP は `https://api.githubcopilot.com/mcp/x/all/readonly`（read-only パス・fine-grained PAT を `.env` で供給）、Context7 MCP は `https://mcp.context7.com/mcp`（`CONTEXT7_API_KEY`）。Skills を vendoring 化したことと合わせ、コア機能は Node.js を必要としなくなるため、Node は bootstrap のハード依存から外し、doctor では未導入を WARN 表示に留める。

## Considered Options

- **ローカルバイナリ / Docker / npx 版を既定**: オフライン・プライバシーに強いが、bootstrap の失敗点（バイナリ取得・Docker・Node）が増える。これらはオプション層に置く。

## Consequences

- リモート版はネットワークと API キーが必要で、クエリが第三者に渡る。プライバシー / オフライン重視のプロジェクトはローカル版（要 Node / Docker）へ opt-in する。
- GitHub MCP リモート版は Copilot エンタイトルメントを要する可能性があり、未契約環境ではローカルバイナリ版を fallback として `docs/agents/mcp.md` に併記する（要実機確認）。
- MCP 設定は template のみコミットし、`.mcp.json` / `.codex/config.toml` / `.env` は gitignore する。write 操作はコアで有効化しない。
