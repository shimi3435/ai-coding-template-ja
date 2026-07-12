# dependency-update-policy（dependabot PR の処理基準）仕様差分

本 change による capability `dependency-update-policy` への追加分。archive せず close 時に
ディレクトリごと削除するため、`openspec/specs/` へはマージされない。

## ADDED Requirements

### Requirement: dependabot PR の処理基準
`docs/agents/safety.md` は dependabot が生成する依存更新 PR の処理基準を明記しなければならない（MUST）。基準: minor / patch は次回作業時にまとめて確認して merge、major は changelog（breaking changes）と CI 結果を確認の上で個別判断。CI が red の PR は merge しない。merge は人起点とし自動 merge を設定しない。major 判定は併記されるバージョンタグ表記により（SHA ピン更新でも同様）、pre-1.0（0.x）依存は minor でも breaking がありうるため個別判断側に倒す。

#### Scenario: minor / patch の PR を処理する
- **WHEN** dependabot の minor / patch 更新 PR を確認する
- **THEN** 次回作業時にまとめて確認して merge する基準が読み取れる

#### Scenario: major の PR を処理する
- **WHEN** dependabot の major 更新 PR を確認する
- **THEN** changelog と CI 結果を確認の上で個別判断する基準が読み取れる

#### Scenario: エージェントが dependabot PR に言及する
- **WHEN** エージェントが open 中の dependabot PR への対応を提案する
- **THEN** merge は人起点であり自動 merge を設定しない旨が基準から読み取れる
