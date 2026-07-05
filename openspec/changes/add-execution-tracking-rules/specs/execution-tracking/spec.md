# execution-tracking（実行中の情報損失防止）仕様差分

本 change による capability `execution-tracking` への追加分。archive せず close 時に
ディレクトリごと削除するため、`openspec/specs/` へはマージされない。

## ADDED Requirements

### Requirement: change 実行時の tasks.md 進捗マーク
change を実行する主体は、手動でも GSD 駆動でも、各タスク完了時に対応する `tasks.md` のチェックを更新しなければならない（SHALL）。engine（`/opsx:apply`）不在の Markdown fallback でも同じとし、進捗マークの能動規律を実行主体に課す。

#### Scenario: fallback でのタスク完了
- **WHEN** engine 不在で change のタスクを 1 つ完了した
- **THEN** 実行主体が対応する `tasks.md` のチェックボックスを `- [x]` に更新する

#### Scenario: GSD 駆動での実行
- **WHEN** GSD が change の実装を駆動した
- **THEN** 対応する OpenSpec の `tasks.md` の進捗が実装実態を反映して更新される

#### Scenario: backstop としての self-review 照合
- **WHEN** commit / PR 前に self-review を実行した
- **THEN** active change の `tasks.md` が実装実態を反映しているか照合され、乖離があれば指摘される

### Requirement: 別スコープ発見の記録
作業中に現在のスコープ外で正確性・セキュリティ・データ損失・将来をブロックする設計負債の問題に気づいた場合、直さず、失わないよう記録しなければならない（SHALL）。記録先はプロジェクトの課題管理（GitHub Issue / OpenSpec backlog / TODO 等）とし、GitHub を前提にしない。

#### Scenario: 別スコープのバグ発見
- **WHEN** あるスコープの作業中に別スコープのバグや設計負債に気づいた
- **THEN** その場で応答内に発見を明示し記録を提案する（現在のスコープ外を勝手に直さない）

#### Scenario: 外部システムへの記録
- **WHEN** 発見を GitHub Issue 等の外部システムに記録する
- **THEN** エージェントは自動発行せず、事前確認（人起点）を経てから write する

#### Scenario: nit の除外
- **WHEN** 発見がスタイル nit・主観的 refactor に留まる
- **THEN** 記録対象にしない
