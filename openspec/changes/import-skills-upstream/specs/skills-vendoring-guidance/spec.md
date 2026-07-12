# skills-vendoring-guidance（vendored skill の上流取り込み手順）仕様差分

本 change による capability `skills-vendoring-guidance` への追加分。archive せず close 時に
ディレクトリごと削除するため、`openspec/specs/` へはマージされない。

## ADDED Requirements

### Requirement: vendored skill 実体は lock 記録の上流 commit と byte-match する
取り込み後の vendored skill 実体（`.agents/skills/<name>/`）は、`skills.lock.json` の該当エントリが記録する上流 `commit` の実体をそのまま byte-match で反映しなければならず（MUST）、手による改変を加えてはならない（MUST NOT）。SKILL.md の sha256 は lock の `sha256` と一致しなければならず、整合は `task skills:doctor`（`tests/test_skills_lock.py`）がハードゲートとして検証する。複数 skill を同時に取り込む場合も lock は skill ごとに独立して更新する。

#### Scenario: 上流実体を byte-match で反映する
- **WHEN** 保守者が WARN の出た skill を取り込み先 commit の実体で更新する
- **THEN** vendored 実体は上流実体と byte 一致し、手による改変が加えられていない

#### Scenario: SKILL.md の sha256 を lock と整合させる
- **WHEN** 実体更新後に lock の `commit` / `sha256` を更新して完了を確認する
- **THEN** `task skills:doctor` が green（SKILL.md の実測 sha256 が lock と一致・孤児なし・symlink 解決）になり、red の間は取り込み未完として lock / 実体を修正して再実行する
