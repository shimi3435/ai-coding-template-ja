# Global Project Instructions

このファイルは全エージェント共通の**作業方針（意図・自然言語）の単一の正**。
Codex / Claude Code の両方がこれを正とする。MCP 接続・承認モード・サンドボックス等の
**ツール固有の機構設定はここに書かない**（`.mcp.json` / `.codex/config.toml` が担う）。

## Communication
- 返答は日本語で行う。
- 不確実な点は断定しない。
- 実行していない検証は未検証と明記する。

## General Engineering Rules
- 変更は必要最小限に留める。
- 無関係なリファクタリングを行わない。
- 現在のスコープ外で正確性・セキュリティ・データ損失・将来をブロックする設計負債の問題に
  気づいたら、直さず記録して失わない。記録先はプロジェクトの課題管理（GitHub Issue /
  OpenSpec backlog / TODO 等）。外部システムへの write（`gh issue create` 等）は自動発行せず、
  発見をその場で応答内に明示し文面を提案するに留める（発行は人起点・事前確認）。スタイル
  nit・主観的 refactor は対象外。
- 単一ファイルの肥大化を避ける。命名は具体的にする。
- 既存の設計意図を尊重する。

## Agents
- Codex / Claude Code の両方がこのファイルを正とする。
- Claude Code 固有の補足のみ CLAUDE.md にある。
- 用語集・ADR の参照先は [docs/agents/domain.md](docs/agents/domain.md)、Issue と仕様の参照先は
  [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md) に定める。

## Workflow（OpenSpec 直接実行 / ADR-0010・0009）
- 外部挙動、公開 interface、security / trust boundary、永続データ、dependency / lockfile、build / CI、
  または複数の恒久成果を変更する場合、OpenSpec changeを作る。独立して受け入れ・review・mergeできる成果は別changesとする。
- コア経路はOpenSpec 直接実行だけとする。proposal / design / spec delta / spec-holesが仕様の正本、
  `tasks.md` が詳細タスク、依存順、進捗、検証状態、セッション復帰の正本である。OpenSpec CLIは任意とする。
- 全変更で self-reviewと適用可能なfocused validationを行う。未実行・検証失敗を完了扱いせず、change closeを禁止する。
- 仕様判断またはmaterial expansionが必要なら、完了済みcheckboxを保持して利用者承認まで停止する。
- 外部 orchestratorは一般的な候補として提案できる。ただし利用者が特定の名前を選ぶ前の
  read-only 探索、在席確認、plugin 検索、version probe、install、起動は禁止する。
- 追加 executorには別の利用者承認を必要とする。実装の分担と統合方法はtasks.mdへ記録する。
- plan / evidence / test / reviewは、異なる失敗・境界・riskの検出、セッション復帰、レビュー判断へ価値がある場合だけ追加する。
  通常CIを削除予定artifactsや配布後に到達不能なGit履歴へ依存させない。
- 仕様確定前にspec-holesで未定義の振る舞いを確認する。用いるSkillは作業に応じて
  [workflowのSkill一覧](docs/agents/workflow.md#skillsvendoringコア候補のうち再配布可のもの)から選ぶ。
- task形式・実行順序・review・証跡・停止・完了の共通手順は[workflow](docs/agents/workflow.md)、
  preflight・既存差分保護・再開は[executor Skill](.agents/skills/execute-openspec-change/SKILL.md)、
  artifact配置とテンプレート固有close規約は[OpenSpec規約](openspec/project.md)を正とする。

### 独立レビュー必須条件

次のいずれかを変更する場合だけ、独立review / verifierを必須とする。本列挙を発火条件の単一の正とし、
他文書へ列挙を複製しない。適用時の順序・上限・再試行・停止は
[共通review手順](docs/agents/workflow.md#bounded-review-convergence)に従う。

- security / trust boundary
- 外部 write
- 永続データ
- 公開 interface
- dependency / lockfile
- build / CI
- 削除 / migration

## Tools
- 実装前に Context7 でライブラリ / CLI の最新仕様を確認する。
- GitHub の read 操作はコアでは `gh` CLI を使う。GitHub MCP はオプションで、
  有効時も read を基本とし write は事前確認する。
- Serena はオプション。大規模リファクタリング時のみ使う。
- MCP の設定詳細は [docs/agents/mcp.md](docs/agents/mcp.md)。

## Validation
- 変更後は対象に近いテストを実行する。
- 最終完了判定には `./scripts/check.sh` の成功を要求する。`task check` 単独の成功で代替しない。
- 実行できなかったコマンドは理由を明記する。

## Safety
- 破壊的変更・大量削除・依存の大規模更新は事前確認する。
- API key / token / private key を追跡対象ファイルやログへ保存・出力しない。必要な secret は
  `.env` と gitignore 済みのローカル生成設定にのみ保存し、mode `0600` で保護する。
- `.env` はコミットしない。MCP の write 操作は慎重に扱う。
- 詳細は [docs/agents/safety.md](docs/agents/safety.md)。
