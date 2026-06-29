# GitHub MCP をオプション層へ降格し、`gh` CLI をコア前提にする

コア MCP は **Context7 のみ**とする。GitHub MCP（リモート `api.githubcopilot.com/mcp/.../readonly`）は、リモート MCP の可用性・MCP ホスト対応・OAuth/PAT 設定・組織/ユーザのポリシーに依存する外部要件が重く、ホスト/アカウントのポリシー次第で **Copilot エンタイトルメントを要する可能性**がある（要検証。公開 README には PAT 利用例もあり必須とは断定しない）。対象利用者（個人 / 小規模研究チーム）でこれらが揃わないと、コア既定がそこに依存した場合に作成直後の `task doctor` がコア環境で WARN / 赤になり「作成直後 green」（§23.1）と衝突しうる。

代替として GitHub の read 操作（issue / PR / Actions / repo 参照）はエージェントが Bash 経由の **`gh` CLI** で行う。`gh` は無料 PAT（`gh auth login` / `GH_TOKEN`）で動き Copilot 契約不要のため、ハードルがリモート MCP より低い。これに伴い `gh` を bootstrap で**導入対象**（未導入なら非破壊で導入手順を表示）にする。

ただし `gh` 未導入を doctor の**ハード FAIL にはしない**。`task doctor` green を作成直後に保証する（§23.1 / CONTEXT.md のコア定義）ため、doctor は `gh` を以下の段階で扱う:
- `gh` 未導入: **WARN ＋導入案内**（green を壊さない）。GitHub 連携は `gh` が無い間だけ使えないという位置づけ。
- リポジトリに GitHub remote があり GitHub ワークフローを使う文脈: `gh` コマンド不在は **FAIL**、`gh auth status` 未認証は **WARN（手動ログイン案内）**。

これにより「`gh` はコアでサポートされるが、ローカル前提は条件付き（GitHub を実際に使うときだけ必須）」となり、作成直後 green と矛盾しない。

## Considered Options

- **GitHub MCP をコア維持（改訂前 ADR-0002）**: 構造化出力は綺麗だが、Copilot 依存がコアに残り、未契約環境で fallback（ローカルバイナリ）が常用パス化して「リモート既定」が名目化する。却下。
- **GitHub 参照系をコアで保証しない（gh も非前提）**: 最小だが、エージェントが GitHub を読む手段がコアに無く、PR / issue 連携の体験が毎回 opt-in 必要。研究フローで頻出のため不採用。

## Consequences

- コア MCP は Context7 のみとなり、コア診断が Copilot / GitHub エンタイトルメント非依存で green になる。
- `gh` が bootstrap の導入対象に加わる。doctor では未導入を WARN（GitHub ワークフロー文脈でのみ FAIL）とし作成直後 green を保てる。`gh` 認証は利用者が手動で行う（secret 自動保存はしない）。
- GitHub MCP はオプション層（リモート / ローカルバイナリ / Docker）。Copilot 契約や構造化出力が要るプロジェクトのみ opt-in。
- ADR-0002 の「Node 非コア」根拠は維持される（Context7 リモートのみで Node 不要。`gh` は Go バイナリで Node 不要）。
- `gh` の read 用途は構造化が弱い。複雑な GitHub 解析が要るなら GitHub MCP / Serena を opt-in。
