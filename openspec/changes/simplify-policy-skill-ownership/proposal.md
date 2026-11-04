# Policy と Skill の責務整理

## Why

Issue #73 の合意に基づき、常時読む方針と実行時に読む手順の重複を減らす。外部 Skill は上流の用途と依存を確認して維持し、必要な一群を整合する最新版へ更新する。

## What Changes

- mattpocock/skills の既存7 Skillを同じ最新確認commitへ更新し、最新版の呼出依存である setup-matt-pocock-skills と codebase-design を追加する。improve-codebase-architecture は最新版から呼ばれないため追加しない。
- Matt の domain-modeling 形式で作成された repository 固有用語集 CONTEXT.md を、内容を保持して GLOSSARY.md へ移行する。live references と改名・prune・検証を整合させ、historical records は変更しない。
- 最新版grillingの質問テンプレートを扱えるよう、既存R06の文書placeholder文法を承認済みの文字集合へ拡張する。上流本文と明示shellの解釈を保持し、同じ入力の既知参照の検査を継続する。
- root policy に独立レビュー必須条件を残し、共通の実行手順は workflow、開始・復帰の固有手順は executor Skill に集約する。live policy の OSWF-5 を意味の分かる名称へ置き換える。
- self-review を report-only に統一し、spec-holes は12分類の確認を維持しながら非該当の記録を集約する。実装・検証の管理は実行担当と tasks.md が所有する。
- code-review を必須工程へ追加しない。対象差分・仕様・独立性が一致する結果は独立レビューとして利用できる。

## Scope

Task 1の用語集移行と上流Skill更新は完了した。2026-10-30の「責務整理へ進みたい」という依頼に基づき、合意済みのTask 2–4を実装・検証する。外部Issueの更新・close、commit、PR作成、mergeは今回の依頼に含めない。

取得機構の変更、新しい parser / orchestration / 評価基盤、caveman 更新・撤去、全外部 Skill の一括更新、過去記録の改変は対象外。

## Acceptance

- 上流本文・legal・source・lock・両hostのlinkが整合する。
- 用語集の本文を失わず、改名とpruneが新しい名前で動作する。
- 各責務の正本が明確で、リスク発火条件と未検証の非完了扱いを維持する。
- focused validation、self-review、独立 review、最新入力の ./scripts/check.sh、別 verifier を完了する。
