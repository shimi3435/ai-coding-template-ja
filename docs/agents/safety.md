# セキュリティ方針

作業方針の単一の正は [AGENTS.md](../../AGENTS.md)。本書はその補助詳細（§22）。

## 原則

- `.env` はコミットしない。
- API key / token / private key を追跡対象ファイルやログへ保存・出力しない。必要な secret は
  `.env` と gitignore 済みのローカル生成設定にのみ保存し、mode `0600` で保護する。
- bootstrap で secret を生成・保存しない。AI サービスへ自動ログインしない。
- GitHub MCP の権限は read を既定とし toolset を最小化する。
- MCP server の write 操作はデフォルトで慎重に扱う。
- 外部 Skill を無制限に自動導入しない（review 済み導入元を `skills.sources.json`、resolved state を
  `skills.lock.json` で固定・記録する）。取得物を実行せず、明示 `--apply` だけで更新する。
- `curl | sh` で外部スクリプトを実行する場合は確認 / 選択式にする。
- sudo / 管理者権限が必要な操作は明示する。
- コア MCP（Context7 リモート HTTP）はクエリを第三者へ送信する。機微情報を含むクエリに注意し、
  プライバシー / オフライン重視のプロジェクトはローカル MCP へ opt-in する（ADR-0002）。
- クロス AI レビュー（openai-codex-cc 等）はコードを外部へ送信するため、CI / hook で自動送信せず、
  可用性ゲート付きの人起点手順に限定する。

## 依存更新（dependabot）の処理基準

- minor / patch 更新は次回作業時にまとめて確認して merge する。major 更新は
  changelog（breaking changes）と CI 結果を確認の上で個別判断する。
- CI が red の PR は merge しない。merge は人起点とし、自動 merge を設定しない。
- major 判定は PR に併記されるバージョンタグ表記による（SHA ピン更新でも同様）。
  pre-1.0（0.x）依存は minor でも breaking がありうるため個別判断側に倒す。

## 承認 / サンドボックス対応表（Codex `config.toml`）

`.codex/config.toml.template` の既定は AGENTS.md Safety と整合する保守側に揃える
（書き込み・ネットワークは確認寄り）。`setup-mcp.sh` が template から実体を生成する。

| 設定 | 既定値 | 意味 / AGENTS.md Safety との対応 |
| --- | --- | --- |
| `approval_policy` | `on-request` | エージェントが必要時に承認を求める。破壊的変更・大量削除は事前確認の方針と整合。 |
| `sandbox_mode` | `workspace-write` | 書き込みは作業ツリー内に限定。ツリー外への書き込みは承認が要る。 |
| ネットワークアクセス | 既定で無効 | `workspace-write` ではネットワークは既定オフ。外部送信は明示 opt-in（MCP 注記と整合）。 |

より緩い設定（`approval_policy = "never"` / `sandbox_mode = "danger-full-access"`）は
AGENTS.md Safety と矛盾するため既定にしない。必要な場合のみ各自の責任で変更する。

Claude Code 側は MCP の初回承認を手動で行い、`.mcp.json` の `tools` allowlist で利用可能な
ツールを最小化する（`query-docs` / `resolve-library-id` のみ）。詳細は
[docs/agents/mcp.md](mcp.md)。
