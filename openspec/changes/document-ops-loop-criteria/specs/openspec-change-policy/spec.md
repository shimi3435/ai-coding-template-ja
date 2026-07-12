# openspec-change-policy（テンプレート自身の change 運用規約）仕様差分

本 change による capability `openspec-change-policy` への追加分。archive せず close 時に
ディレクトリごと削除するため、`openspec/specs/` へはマージされない。

## ADDED Requirements

### Requirement: 軽微変更の change 不要基準
`openspec/project.md` の「テンプレート自身の change 運用」節は、OpenSpec change を切らずに直接 PR してよい軽微変更の基準を明記しなければならない（MUST）。基準: spec（振る舞い・規約）に触れない軽微修正（typo・リンク切れ・表現修正等）は change 不要・直接 PR 可。判定はファイル種別（docs かコードか）ではなく振る舞い・規約に触れるかで行う。どちらか迷う場合、および軽微として開始した修正が途中で規約に触れると判明した場合は change を切る。

#### Scenario: typo 修正の PR を出す
- **WHEN** 保守者が typo・リンク切れ・表現のみの修正 PR を準備し基準を参照する
- **THEN** change 不要・直接 PR 可と判断できる基準が読み取れる

#### Scenario: 軽微かどうか迷う
- **WHEN** 修正が規約に触れるか判断に迷う
- **THEN** change を切る側に倒す指針が明記されている

#### Scenario: 途中で規約に触れると判明する
- **WHEN** 軽微として開始した修正が作業中に振る舞い・規約へ波及すると判明する
- **THEN** change を切り直す指針が読み取れる
