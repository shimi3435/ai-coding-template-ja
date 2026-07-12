# skills-vendoring-guidance（vendored skill の上流取り込み手順）仕様差分

本 change による capability `skills-vendoring-guidance` への追加分。archive せず close 時に
ディレクトリごと削除するため、`openspec/specs/` へはマージされない。

## ADDED Requirements

### Requirement: skill 上流取り込み手順の明文化
`docs/agents/workflow.md` の Skills 節は、`task skills:upstream` の WARN から取り込み完了までの手順を明文化しなければならない（MUST）。手順: WARN 確認 → 上流 diff レビュー → 取り込み判断（人起点）→ `.agents/skills/<name>/` の実体更新（上流実体をそのまま反映）→ `skills.lock.json` の `commit` / `sha256` 更新 → `task skills:doctor` green で完了判定。doctor が red の間は取り込み未完として lock / 実体を修正して再実行する。取り込みは lock・skill 実体の変更を伴うため軽微変更に当たらず、OpenSpec change を切る。複数 skill の同時取り込みは可（lock は skill ごとに更新する）。据え置きと判断した WARN は次回実行時も再表示される（据え置き記録は任意・人判断）。

#### Scenario: WARN を受けて手順を参照する
- **WHEN** `task skills:upstream` が WARN を報告し保守者が対応手順を探す
- **THEN** workflow.md の Skills 節に diff レビューから doctor green までの手順が存在する

#### Scenario: 取り込みの完了を判定する
- **WHEN** 実体と lock を更新した後に完了を確認する
- **THEN** `task skills:doctor` green が完了判定であることが読み取れ、red なら未完として修正・再実行する旨が示されている

#### Scenario: 取り込みの change 要否を判断する
- **WHEN** 取り込みを実施する前に change 要否を確認する
- **THEN** lock・実体の変更を伴うため軽微変更に当たらず change を切る旨が明記されている
