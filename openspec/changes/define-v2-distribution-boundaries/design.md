# 設計

## 入力と固定点

監査対象はmain `00d3a9713a8eecbe3e0a1af594293f97121e0c5c`。
Issue #67・#51・#65・#66の最新本文とコメントを読む。古い順序のコメントより最新本文を優先する。
作業は専用worktreeで行い、元の作業branchと利用者差分を保持する。

## 保存先と責務

- `docs/template/adr/0011-v2-distribution-boundaries.md`: 判断と理由。既存ADRは過去の記録として変更しない。
- `docs/template/v2-boundary-audit.md`: ファイル・機能・全public task・CIの分類と移行引き渡しを一つに集約する。
- `docs/template/release.md`: 監査への参照だけを追加する。release準備の固定契約修復は後続へ渡す。

分類は必須・任意・保守者専用の責務単位とする。複合ファイルは責務を分け、directory全体へ単一分類を押し付けない。
#57共有基盤を保持し、#64専用subtreeと混在するroute / contract / docsを明示する。
pruneのCLI名、構成状態の保存形式、部分失敗時の実装方式は#51のauthoringで決定する。
本監査は不完全な欠落を正常な不在と扱わないという受け入れ境界を確定し、新しいprofile engineは作らない。
Genshijinの具体的なvendor先・host対応version・最小bundle拡張の要否は#65が所有する。

## 検証とreview

最初にCI相当のNode 24 / Python 3.14を選び、変更前のtask checkを確認する。
既知障害は使い捨てのmainコピーでpruneと欠落probeを実施し、観測事実と未実装の期待結果を区別する。
全public task・CI job・必須監査項目のcoverageと相対リンクを一時検査し、新しい恒久テストや台帳を増やさない。
self-reviewではuntrackedを含む全差分、分類と合意、穴と検証対応を照合する。
本changeはAccepted ADRによって削除/migration契約を確定するため、AGENTS.md OSWF-5対象である。
実装コードを変更しないことを非該当の理由にはしない。root policyに例外を追加しない。
前cycleのStandards / Specの2軸reviewはinitial independent review相当であり、別verifierの実績ではない。
利用者承認によるcycle 2でself-review、新しいinitial independent review、必要な修正とfocused validation/diff review、
最新入力のtask check、initial reviewerとは別のindependent verifierを順に実施する。詳細手順と停止条件はworkflowを参照する。
CI検証漏れとrelease準備は承認された実Issueへ接続する。起票失敗または片方だけの成功時は、
成功したIssue番号を保存し、未完了handoffを残す。両方の実追跡先が確定するまで#67完了とは扱わない。
close前に仕様・tasksと検証証跡をcommitへ保存し、retrospectiveと必要な検証を完了する。
利用者が承認したpre-merge closeではこのchangeの5文書だけを削除し、active change 0 / greenと最終CIを確認する。
恒久監査はPRのclose前記録へ案内し、通常CIから削除済みartifactsやGit履歴を要求しない。PR mergeとIssue #67 closeは行わない。
