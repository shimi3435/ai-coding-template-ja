# Policy と Skill の責務整理

## Why

Issue #73 の合意に基づき、常時読む方針と実行時に読む手順の重複を減らす。外部 Skill は上流の用途と依存を確認して維持し、必要な一群を整合する最新版へ更新する。

## What Changes

- mattpocock/skills の既存7 Skillを同じ確認済みcommitへ更新し、codebase-designを追加する。setup-matt-pocock-skillsは標準配布に含めず、repository設定文書で前提を満たす。improve-codebase-architecture は最新版から呼ばれないため追加しない。
- Matt の domain-modeling 形式で作成された repository 固有用語集 CONTEXT.md を、内容を保持して GLOSSARY.md へ移行する。live references と改名・prune・検証を整合させ、historical records は変更しない。
- 最新版grillingの質問テンプレートを扱えるよう、既存R06の文書placeholder文法を承認済みの文字集合へ拡張する。上流本文と明示shellの解釈を保持し、同じ入力の既知参照の検査を継続する。
- root policy に独立レビュー必須条件を残し、共通の実行手順は workflow、開始・復帰の固有手順は executor Skill に集約する。live policy の OSWF-5 を意味の分かる名称へ置き換える。
- self-review を report-only に統一し、spec-holes は12分類の確認を維持しながら非該当の記録を集約する。実装・検証の管理は実行担当と tasks.md が所有する。
- code-review を必須工程へ追加しない。対象差分・仕様・独立性が一致する結果は独立レビューとして利用できる。

## Scope

初回cycleのTask 1–4は実装・検証済みだが、外部レビューで現行mainとの統合不整合とsetup配布の必要性・ownership問題が判明した。2026-11-04のgrilling合意と修正依頼に基づき、同じchangeの新cycleでTask 5–7を実行する。最新mainを作業branchへmergeし、PR #92の保守テスト分離を保持する。setupの配布を撤回し、設定文書の復旧導線をproject側へ置く。当時はPR作成・mainへのmerge・外部Issueの更新やcloseを対象外とした。

取得機構の変更、新しい parser / orchestration / 評価基盤、caveman 更新・撤去、全外部 Skill の一括更新、過去記録の改変は対象外。

## Acceptance

- 上流本文・legal・source・lock・両hostのlinkが整合する。
- 用語集の本文を失わず、改名とpruneが新しい名前で動作する。
- 各責務の正本が明確で、リスク発火条件と未検証の非完了扱いを維持する。
- focused validation、self-review、独立 review、最新入力の ./scripts/check.sh、別 verifier を完了する。

- 修正cycleでは、統合後のfocused validation、bundled / prunedのR06・GLOSSARY検査、設定あり / 欠落の導線確認、両gateと独立review / 別verifierを成功させる。


## PR #95 再レビュー修正cycle（2026-11-05）

利用者がgrilling Q1–Q5で確定した方針に基づき、同じchangeを復元してTask 8–12を実行する。起点は4c3603c37b641b7b687c173dcc6e775283dc6237。過去の完了・検証記録を保持するが、新cycleの成功へ読み替えない。

- R06の旧単一token規則を維持し、新しい説明placeholderの拡張だけASCII空白必須へ限定する。3文脈とbundled/prunedの公開inspectを検証する。
- Skill toolが未提供のhostでは、repositoryの同名SKILL.mdを読み、呼出元の操作範囲内で適用する共通手順をworkflowに置く。AGENTS.mdは入口とし、remote本文・source/lock・legal・host linksは変更しない。
- Codex CLIとClaude Codeで3連携経路の修正前後を比較する。setup案内は3設定状態を両hostで確認し、誤誘導が再現した場合だけproject側の復旧手順を強化する。
- self-review、focused validation、独立review、両gate、別verifierを完了し、change再close・commit・通常push・既存PR本文更新・最新HEADのhosted CI確認まで進める。mainへのmergeとIssueへの個別writeは対象外とする。

必須のhost実動作が環境制約で実行できない場合は未検証として停止し、closeしない。通常CIに実agent評価器や新routerを追加しない。
