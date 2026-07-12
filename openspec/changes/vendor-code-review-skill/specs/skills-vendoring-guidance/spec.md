# skills-vendoring-guidance（sibling skill 参照の解決）仕様差分

本 change による capability `skills-vendoring-guidance` への追加分。archive せず close 時に
ディレクトリごと削除するため、`openspec/specs/` へはマージされない。

## ADDED Requirements

### Requirement: vendored skill が名前参照する sibling skill は全対応エージェントで解決可能でなければならない
vendored skill の SKILL.md が別の skill を literal 名で参照する場合（例: `tdd` が `code-review` を参照）、その参照先 skill は対応する全エージェント（Claude Code と Codex）で解決可能でなければならない（MUST）。単一エージェントのビルトイン skill に依存するだけでは不十分であり（MUST NOT）、参照先 skill は `.agents/skills/<name>/` に上流実体を byte-match で vendoring し、`skills.lock.json` に整合するエントリを持たせて、`.claude/skills` と `.codex/skills` の双方で symlink 解決させなければならない（MUST）。ビルトイン skill と名前衝突する場合でも、参照が意味的に指す上流 skill を vendoring する（衝突は許容される）。

#### Scenario: 参照先 sibling skill を両エージェントに供給する
- **WHEN** vendored skill（`tdd`）の SKILL.md が sibling skill（`code-review`）を literal 名で参照する
- **THEN** その sibling skill は `.agents/skills/code-review/` に vendoring され `skills.lock.json` にエントリを持ち、`.claude/skills/code-review` と `.codex/skills/code-review` の双方が解決する

#### Scenario: 参照元は改変せず参照先の供給で解く
- **WHEN** 参照元 SKILL.md が上流 byte-match 実体で sha256 ハードゲート下にある
- **THEN** 参照元を手改変せず、参照先 skill を byte-match で vendoring して参照を解決し、`task skills:doctor` が green（sha256 整合・孤児なし・symlink 解決）になる
