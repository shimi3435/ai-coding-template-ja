## ADDED Requirements

### Requirement: rename は下流向け文脈名を更新する

`task rename -- <module> --apply` は、`CONTEXT.md` が存在する場合、その中のテンプレート既定プロジェクト名を新しい配布名へ置換しなければならない（SHALL）。

#### Scenario: CONTEXT.md が存在する

- **WHEN** 利用者が新しい module 名で rename を適用する
- **THEN** `CONTEXT.md` 内の `ai-coding-template-ja` は導出された配布名へ置換される

#### Scenario: CONTEXT.md が存在しない

- **WHEN** 利用者が新しい module 名で rename を適用する
- **THEN** rename は `CONTEXT.md` の欠落だけを理由に失敗しない
