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

## Skill update PR automation

production workflow は top-level `permissions: {}` を維持し、write permission を次の4 jobだけへ与える。

<!-- skill-update-write-permissions:start -->
- publish-draft: actions=none, contents=write, pull-requests=write, issues=none
- recover: actions=read, contents=write, pull-requests=write, issues=none
- cleanup-merged: actions=none, contents=write, pull-requests=read, issues=none
- publish-finalize: actions=none, contents=read, pull-requests=write, issues=write
<!-- skill-update-write-permissions:end -->

- `publish-draft`: `contents: write`、`pull-requests: write`。explicit lease branch create / append、immutable root PR作成、
  journal comment append、draft mutationだけを行う。
- `recover`: `actions: read`、`contents: write`、`pull-requests: write`、`issues: none`。exact origin artifactと
  fresh live identityが一致する場合だけcross-run transitional recoveryを行う。
- `cleanup-merged`: `contents: write`、`pull-requests: read`。candidate publish完了後、成功可否に依存せずfresh historyを読み、
  merged strict branchだけをexact leaseで削除する。
- `publish-finalize`: `contents: read`、`pull-requests: write`、`issues: write`。journal検証、ready / draft、
  immutable root tracking issue作成、comment appendだけを行う。

`detect` は `contents: read`、`pull-requests: read`、`issues: read`、`validate` は
`contents: read` だけを持つ。workflow は default `github.token` だけを使い、repository secret、PAT、
credential fallback、bare force push、rebase、auto-mergeを追加しない。PR / Issue本文は作成時のimmutable rootであり、
作成後のbody update、comment update / delete、closed issue reopenは禁止する。
immutable rootはcanonicalなfull initial snapshotとdigestを保持する。commentless root回復はnumeric author一致、
GitHub body edit証拠`lastEditedAt === null`、fresh live stateのexact一致を必須とし、initial commentの推測再送を禁止する。

real GitHub write smoke はproduction workflow外の別trust boundary。production automationを無効にしたfresh repositoryと
existing operator `gh auth` sessionだけを使う。新しいPAT / GitHub App、repository保管credential、approval artifactを作らない。
ambient `GH_TOKEN` / `GITHUB_TOKEN` / enterprise token設定時は開始前に拒否する。read-only previewはrepository / run / source / creator、
managed resource 0件、immutable root、journal v2 comment template、explicit lease、prepared recovery、terminal cleanupを束縛する。
同じprocessのTTY / stdinへ人がfresh approvalとしてexact digestを入力した後だけwriteを許可する。EOF、空入力、不一致、process終了、
operation失敗でapprovalは失効する。PR ready後のmergeは人がcheckpoint digest確認後に行い、automationへmerge permissionを与えない。
fresh repositoryのmerged branch自動削除は事前に無効化し、cleanup seam前のbranch不在をfail closedとする。
失敗後はresidual identity / journal digest / exact branch SHAを束縛したterminal-only recovery previewと別のfresh approvalまで
cleanupを含むwriteを再開しない。

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
