# openspec-conventions（OpenSpec 運用規約）仕様差分

本 change による capability `openspec-conventions` への追加分。archive せず close 時に
ディレクトリごと削除するため、`openspec/specs/` へはマージされない。

## ADDED Requirements

### Requirement: テンプレート自身の change 運用の明文化
openspec/project.md はテンプレート自身が change を切る際の運用を定めなければならない（SHALL）。
少なくとも次を含む: spec delta は `changes/<id>/specs/` に置く（validate green と specs/ の
出荷時空が両立）・close は archive ではなくマージ前の最終コミットでのディレクトリ削除
（main に change ディレクトリを載せない）・経緯は PR とブランチ履歴が保持。

#### Scenario: 新しい change の作成
- **WHEN** テンプレート自身の変更で新しい change を切る
- **THEN** project.md の運用規約に従い、delta を change 内に置いて validate green を保ち、マージ前の最終コミットで削除して close する

### Requirement: fallback 形式の engine 互換注記
docs/agents/workflow.md の fallback 形式説明は SHALL 1 行目制約を記載しなければならない（SHALL）。
engine parser は requirement 本文の 1 行目のみを SHALL / MUST 判定に使うため、折返しで
2 行目以降に落とすと validate ERROR になる旨を明記する。

#### Scenario: 手書きで delta を書く
- **WHEN** エージェントが fallback 形式（手書き）で spec delta を書く
- **THEN** workflow.md の注記に従い各 requirement の 1 行目に SHALL / MUST を置き、validate ERROR を踏まない
