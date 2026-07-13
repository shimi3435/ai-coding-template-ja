## ADDED Requirements

### Requirement: GitHub 資格情報をオフラインで診断する
`task doctor` は GitHub CLI の資格情報の存在を MUST ネットワーク接続なしで確認し、資格情報の内容を出力してはならない。

#### Scenario: 資格情報が存在する
- **WHEN** `gh auth token` が成功する
- **THEN** doctor は資格情報が存在すると報告し、token の有効性を検証済みとは表現しない

#### Scenario: 資格情報が存在しない
- **WHEN** `gh` は存在するが `gh auth token` が失敗する
- **THEN** doctor は未認証の WARN を報告して green を維持する

### Requirement: Context7 key の重複定義を一貫して解釈する
MCP 設定生成と doctor は `.env` に同じ key が複数ある場合 MUST 最後の定義を採用する。

#### Scenario: Context7 key が重複する
- **WHEN** `.env` に `CONTEXT7_API_KEY` が複数定義される
- **THEN** setup-mcp と doctor はともに最後の値を使用し、生成直後に drift を報告しない

### Requirement: ローカル secret を最小権限で保存する
プロジェクトは secret を MUST 追跡対象ファイルまたはログへ保存・出力せず、必要な非追跡ローカル設定へ保存する場合は生成時から mode `0600` で保護しなければならない。

#### Scenario: MCP 設定を新規生成する
- **WHEN** `task mcp:setup` が設定ファイルを新規生成する
- **THEN** `.mcp.json` と `.codex/config.toml` は mode `0600` になる

#### Scenario: 緩い権限の MCP 設定を再生成する
- **WHEN** 既存生成物の mode が `0600` より緩い
- **THEN** 再生成後の mode は `0600` になる

### Requirement: テンプレートの主目的を明記する
利用者向け文書とプロジェクト metadata は MUST 主目的を「研究者が AI コーディングを安全に始める開発基盤」として一貫して説明する。

#### Scenario: 利用者がプロジェクトの目的を確認する
- **WHEN** README、利用ガイド、metadata、用語定義を読む
- **THEN** いずれも安全な開始基盤が主目的であると判断できる
