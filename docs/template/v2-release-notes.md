# v2 release notes

## Breaking: repository parser の受理契約

[Issue #77](https://github.com/shimi3435/ai-coding-template-ja/issues/77)により、exact dependency version と
Taskfile の構文解析を既存の `semver` / `yaml` へ委譲した。依存 version の各 core 要素は
`9007199254740991` 以下、全体は256文字以下を要求する。prerelease / build metadata は引き続き許可する。

Taskfile の構文エラー・重複キー・未対応 YAML / task 形式は拒否する。必須入口は説明文・コメントではなく、
解析後の task key と command の完全一致で検査する。check の必須2コマンドは `cmds` の直接 string に置く。
変更前から使われている標準 Taskfile はそのまま通るが、下流で記述を変更した場合は
[repository contracts の受理仕様](repository-contracts.md)に合わせて修正する。

## Breaking: 自前Node installerの撤去

[Issue #52](https://github.com/shimi3435/ai-coding-template-ja/issues/52)により、
`scripts/bootstrap.sh --install-node` の導入機能を撤去した。旧optionは廃止・移行診断付きの
終了コード2となり、downloadや環境変更を行わない。Node.js 24 LTS / npm要件は維持する。

Node / npmが未導入・不適合の場合は、必要版と[公式導入先](https://nodejs.org/en/download)を
案内して終了コード1で停止する。手動導入またはPATH確認後、`./scripts/bootstrap.sh` を
引数なしで再実行する。既存の導入先やshell設定は保持し、旧 `NODE_INSTALL_ROOT` は無視する。
特定runtime managerは自動導入・起動しない。

`--help` / `-h` はruntime不要で使い方を表示する。詳細な引数・終了statusと移行手順は
[Node導入と旧installerからの移行](../guide.md#node導入と旧installerからの移行)を参照する。

## Breaking: GSD handoff integration の削除

v2 は GSD 固有 integration をコアから削除した。次の入口は存在せず、互換 shim なしの breaking change
となる。

- Python package / module: `ai_coding_template_ja.openspec_gsd_handoff`
- script: `scripts/openspec-gsd-handoff-smoke.py`
- Taskfile entry: `openspec:gsd-handoff:smoke`
- handoff manifest、専用 fixtures、専用 tests

旧入口を呼ぶと、module / file / task の通常の不存在 error になる。deprecated alias や説明専用 shim は
提供しない。

## 移行

OpenSpec 直接実行へ移行する。

1. proposal、design、spec delta、受け入れ基準、`spec-holes` を canonical artifacts とする。
2. `tasks.md` に実装・検証の詳細 task、依存、対象、checkbox を置く。
3. 依存が全て完了した先頭の未完了 task から実装・検証し、checkbox を更新する。
4. agent から実行する場合は `execute-openspec-change` を明示呼出する。skill は preflight 後、同じ
   `tasks.md` を直接実行する。
5. OpenSpec CLI がない環境では Markdown fallback を使う。CLI 固有 state は復帰や完了判定に不要。

現行規約は [workflow](../agents/workflow.md)、判断理由は
[ADR-0010](adr/0010-openspec-direct-execution.md) を参照する。

## 旧 integration のふりかえり履歴

- 2026-07-14 revise-openspec-gsd-execution-boundary（PR #40）: 逃した欠陥 1 件（self-review=0 / review=1 / CI=0 / merge後=0）— Claude Code review で README の GSD 説明が旧境界のまま残っていた不整合を検出
- 2026-07-16 automate-openspec-gsd-handoff（PR #41）: 逃した欠陥 6 件（self-review=1 / review=3 / CI=2 / merge後=0）— self-review=Linux capability guard 不足、review=prefix capability sort・Markdown link誤検知・Linux smoke前提の未記載、CI=source-pinned testのshallow clone非互換・rename後のsmoke import残存
- 2026-08-12 externalize-gsd-from-core（PR #53）: 逃した欠陥 27 件（self-review=2 / review=24 / CI=0 / merge後=1）— self-review=task対象pathの欠落・不正確な略記、review=直接実行・review収束・residual scan・証跡契約の不整合を収束、merge後=pre-merge close漏れによりactive changeがmainへ残存
