---
name: self-review
description: >
  Inspect your own diff and report defects without editing files. Use before a
  commit or PR, or when asked for self-review / セルフレビュー. The executor owns fixes.
---

# self-review（自己diffの指摘）

standalone / convergenceの両方で **report-only**。コード・テスト・文書・checkboxを変更しない。
修正、検証コマンドの実行、進捗更新は呼出元の実行担当が所有する。
レビュー順序・blocker判定・必須証跡は[共通workflow](../../../docs/agents/workflow.md#bounded-review-convergence)に従う。

## 検査

1. 利用者指定のbaseまたは対象branchのmerge-baseとの差分、staged / unstaged差分、非ignoredの未追跡fileを読む。
   利用者所有の対象外差分は分離し、影響を受ける呼出元・設定・文書も確認する。
2. 正確性、不要な複雑化、scope逸脱、AGENTS.md遵守を検査する。バグは位置・再現条件・影響を特定する。
3. spec-holesの各穴にテスト結果または理由付き未検証が対応するか、tasks.mdのcheckboxと実態が一致するかを照合する。
   穴の候補だけを検証成功と見なさない。
4. 大きいfile / binaryも固定size capで除外しない。path・size・typeを確認し、安全に全文を読めない場合や
   tool出力がtruncationした場合は未検証として、欠落の影響とrequired性を報告する。

## 出力

- 指摘: file・位置、問題、根拠、影響、推奨修正。明白な欠陥もその場では修正しない。
- 判断事項: 仕様・scopeに関わる選択と、判断が必要な理由。
- 未検証: 確認できなかった範囲と理由。required evidenceの扱いは共通workflowに従う。
- 指摘なしの場合も検査範囲を明記する。独立reviewの要否はroot policyと共通workflowが決める。
