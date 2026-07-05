# openspec-engine-access（OpenSpec engine の利用導線）仕様差分

本 change による capability `openspec-engine-access` への追加分。archive せず close 時に
ディレクトリごと削除するため、`openspec/specs/` へはマージされない。

## ADDED Requirements

### Requirement: OpenSpec engine の CLI 利用導線の文書化
テンプレートは OpenSpec の change を駆動する手段として `openspec` CLI の利用導線を文書化しなければならない（SHALL）。`/opsx:*` スラッシュコマンドに依存しない CLI 動詞（`openspec instructions apply --change`・`openspec status --change`・`openspec validate`）を示し、CLI とスラッシュコマンドを別形態として区別する。

#### Scenario: スラッシュコマンド未導入の利用者
- **WHEN** テンプレ利用者が `openspec` CLI のみを導入しスラッシュコマンド `/opsx:*` を持たない
- **THEN** docs から CLI で change を validate・apply・進捗確認する手順に到達できる

#### Scenario: init のハザード回避
- **WHEN** 利用者が engine 導入手順を docs で参照する
- **THEN** 既存リポジトリでの `openspec init` 実行が project.md→config.yaml 移行を招くため非推奨であると明記されている
