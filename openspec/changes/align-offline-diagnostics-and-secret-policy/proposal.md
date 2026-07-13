# オフライン診断と secret 方針を安全な開発基盤の目的に揃える

## Why

このテンプレートの目的は、研究者が AI コーディングを安全に始める開発基盤を提供することにある。
現在は、既定の `task doctor` がネットワークへ接続し得ること、MCP 設定生成と doctor で重複した
環境変数の解釈が異なること、secret を保存しないという文書方針とローカル生成設定への保存が
矛盾することから、この目的と実装の契約が一致していない。

## What Changes

- GitHub CLI の資格情報確認をローカルな存在確認に限定し、token を出力しない。
- `.env` の `CONTEXT7_API_KEY` は生成と診断の双方で最後の定義を採用する。
- secret は追跡対象とログへ保存・出力せず、必要なローカル生成設定だけに保存できると明記する。
- MCP 生成設定を新規・再生成とも mode `0600` にする。
- README、ガイド、プロジェクト metadata、用語定義の目的文を新しい目的へ揃える。

## Non-goals

- GitHub token のオンライン有効性検証を doctor に追加しない。
- 汎用 dotenv パーサとの完全互換性は導入しない。
- Context7 key の特殊文字に対する JSON / TOML escaping 方式は変更しない。
- MCP クライアントや認証機構は変更しない。

## Public seams

- `scripts/doctor.py` の CLI 出力・終了コード・外部コマンド呼び出し。
- `scripts/setup-mcp.sh` の CLI と生成ファイルの内容・権限。
- README / guide / metadata / safety 文書が示す利用者向け契約。
