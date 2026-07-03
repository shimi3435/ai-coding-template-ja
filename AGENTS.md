# Global Project Instructions

このファイルは全エージェント共通の**作業方針（意図・自然言語）の単一の正**（CONTEXT.md）。
Codex / Claude Code の両方がこれを正とする。MCP 接続・承認モード・サンドボックス等の
**ツール固有の機構設定はここに書かない**（`.mcp.json` / `.codex/config.toml` が担う）。

## Communication
- 返答は日本語で行う。
- 不確実な点は断定しない。
- 実行していない検証は未検証と明記する。

## General Engineering Rules
- 変更は必要最小限に留める。
- 無関係なリファクタリングを行わない。
- 単一ファイルの肥大化を避ける。命名は具体的にする。
- 既存の設計意図を尊重する。

## Agents
- Codex / Claude Code の両方がこのファイルを正とする。
- Claude Code 固有の補足のみ CLAUDE.md にある。

## Workflow（OpenSpec / GSD の境界 / ADR-0003）
- 「何を・なぜ作るか」は OpenSpec で確定する（仕様・受け入れ基準）。
- 単一 change 内のタスク分解・順序・進捗は OpenSpec `tasks.md` / `/opsx:apply` が担う。
- GSD（導入時のみ）は複数 change を横断するロードマップ・フェーズ順序・復帰のみを担い、
  `openspec/changes/*/tasks.md` を二重化しない。受け入れ基準も新規定義しない。
- GSD 未導入時も per-change タスクは OpenSpec `tasks.md` で完結する。
- 可能なら `tdd` skill でテストから始める。
- 設計が曖昧なら `grill-me` / `grill-with-docs` で確認する。
- 複雑化しそうなら `caveman` で単純化する。
- エラー調査では `diagnosing-bugs` skill を使う。
- まとまった変更後は可能なら `verify-change` で実動作を確認する。
- コミット / PR 前は可能なら `self-review` で自分の diff を検査する。
- 詳細は [docs/agents/workflow.md](docs/agents/workflow.md)。

## Tools
- 実装前に Context7 でライブラリ / CLI の最新仕様を確認する。
- GitHub の read 操作はコアでは `gh` CLI を使う。GitHub MCP はオプションで、
  有効時も read を基本とし write は事前確認する。
- Serena はオプション。大規模リファクタリング時のみ使う。
- MCP の設定詳細は [docs/agents/mcp.md](docs/agents/mcp.md)。

## Validation
- 変更後は対象に近いテストを実行する。
- 少なくとも `task check` の実行可否を確認する。
- 実行できなかったコマンドは理由を明記する。

## Safety
- 破壊的変更・大量削除・依存の大規模更新は事前確認する。
- secret / token / private key を出力・保存・コミットしない。
- `.env` はコミットしない。MCP の write 操作は慎重に扱う。
- 詳細は [docs/agents/safety.md](docs/agents/safety.md)。
