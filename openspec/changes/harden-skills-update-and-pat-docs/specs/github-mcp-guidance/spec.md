# github-mcp-guidance（GitHub MCP 設定手順の secret 取り扱い）仕様差分

本 change による capability `github-mcp-guidance` への追加分。archive せず close 時に
ディレクトリごと削除するため、`openspec/specs/` へはマージされない。

## ADDED Requirements

### Requirement: PAT の平文保存を案内しない
`docs/agents/mcp.md` の GitHub MCP 手順は、PAT を設定ファイル（gitignore 済みの実体 `.codex/config.toml` 等を含む）へ平文で直書きする運用を標準手順として案内してはならない（MUST NOT）。PAT は環境変数として渡す手順のみを示し、Codex の stdio エントリでは `env_vars` による親環境からの名前指定 forward を用いる（動作を確認した codex-cli バージョンを明記する）。環境変数の供給は起動シェルでの export（例: `gh auth token` の利用）を案内し、PAT 自体は read-only の fine-grained PAT・短い有効期限を推奨として明記する。既存の「`task mcp:setup` の再生成で GitHub エントリが消える」注意書きは維持する。

#### Scenario: Codex 向け追記手順を読む
- **WHEN** 読者が Codex 向けの GitHub MCP stdio エントリ追記手順を参照する
- **THEN** `env_vars = ["GITHUB_PERSONAL_ACCESS_TOKEN"]` 形式の手順が示され、PAT 平文を書き込む例は存在しない

#### Scenario: 環境変数未設定のまま起動しうる
- **WHEN** 読者が手順どおり設定して MCP を使う前段を確認する
- **THEN** 起動シェルで環境変数を export してから起動する旨（例: `export GITHUB_PERSONAL_ACCESS_TOKEN=$(gh auth token)`）が明記されている

#### Scenario: 実体を再生成した
- **WHEN** `task mcp:setup` を再実行して実体設定を再生成する
- **THEN** GitHub エントリが消える（template に含めない）ため再追記が要る旨の注意書きが維持されている
