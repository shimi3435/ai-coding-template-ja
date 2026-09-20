# spec-holes

文書種別: 仕様リファレンス。各要件に12分類を適用済み。未解決判断なし。

## Automation retirement

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | 専用資産なしで旧glob/必須存在検査が失敗する | 1: 空の専用資産を要求しない |
| 2 | 境界値 | 非該当 | 数量を扱う機能を追加しない | — |
| 3 | 重複・衝突 | 該当 | 共通updaterと削除対象の依存が重なる | 1: 逆importを確認し共通部分を保持する |
| 4 | 順序 | 該当 | workflowだけ消してCLIを残す | 1: 専用資産と外側参照を一体撤去する |
| 5 | 型・形式不正 | 該当 | 旧CLIへの任意引数 | 1: 既存unknown-command同様usage/exit 2で無副作用拒否する |
| 6 | エラー経路 | 該当 | 途中まで削除した状態 | 1: 未完了tasksを保持し検証前の完了宣言を禁止する |
| 7 | 冪等性・再実行 | 該当 | 再開時に既存差分と削除が衝突する | 1: 別worktreeとownership確認を維持する |
| 8 | 時刻・タイムゾーン | 非該当 | scheduleの新仕様は導入せず撤去する | — |
| 9 | 文字列 | 非該当 | 新しい文字列パーサを追加しない | — |
| 10 | 数値 | 非該当 | 数値・NaN・乱数・DataFrameを処理しない | — |
| 11 | 巨大入力・リソース枯渇 | 非該当 | 新しい入力処理を導入しない | — |
| 12 | 状態遷移の未定義パス | 該当 | 撤去後のcandidate/smoke起動 | 1: 旧公開経路を拒否しGitHubへ接続しない |

## Preserve manual updates and offline checks

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | automationなしで通常checkを実行する | 1: top-level testsとskills:verifyを維持する |
| 2 | 境界値 | 該当 | 件数/byte境界やruntime境界を弱める | 1: 既存上限とNode 24/Python >=3.14契約を維持する |
| 3 | 重複・衝突 | 該当 | CI/check/renameの経路差異 | 1: 既存の共通task checkへ委譲する |
| 4 | 順序 | 該当 | dependency準備前に検証を完了扱いする | 1: locked導入と最初のCI parityを先行する |
| 5 | 型・形式不正 | 該当 | 壊れたlockやsourceを受理する | 1: schema/パーサは変更しない |
| 6 | エラー経路 | 該当 | legal/history/利用者編集エラー | 1: 残存updaterの拒否とrollbackを保持する |
| 7 | 冪等性・再実行 | 該当 | 失敗した更新を再実行する | 1: 失敗コピーをPRへ持ち込まず元コピーを保持する |
| 8 | 時刻・タイムゾーン | 非該当 | 既存のref解決を変更しない | — |
| 9 | 文字列 | 非該当 | 既存のpath/文字列検証を変更しない | — |
| 10 | 数値 | 非該当 | 既存の数値上限・SemVer解析を変更しない。新しい乱数/DataFrame処理なし | — |
| 11 | 巨大入力・リソース枯渇 | 該当 | 取得前資源上限を削除する | 1: automationから共通updaterへの依存だけを切る |
| 12 | 状態遷移の未定義パス | 該当 | 旧transaction/local lockを誤cleanupする | 2: 移行は#76。既存stateとlockを保持する |

## Safe retirement guidance

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | workflow/resource未導入または既に撤去済み | 1: 不在確認後は省略し再作成しない |
| 2 | 境界値 | 非該当 | 一括削除の件数閾値を導入しない | — |
| 3 | 重複・衝突 | 該当 | 同名branch・共有secret・複数PR | 1: 名称から所有を推測せず個別に保全/棚卸しする |
| 4 | 順序 | 該当 | run稼働中に撤去・resource削除する | 1: workflow無効化→run停止確認→棚卸し→撤去→手動更新 |
| 5 | 型・形式不正 | 該当 | 古いjournal/receiptや不明状態 | 1: 自動解析/修復せず人が確認する |
| 6 | エラー経路 | 該当 | 取消失敗・権限不足・部分停止 | 1: 停止を確認できるまで移行を止める |
| 7 | 冪等性・再実行 | 該当 | 移行手順の再実行 | 1: fresh状態から再確認し不在resourceは省略する |
| 8 | 時刻・タイムゾーン | 該当 | 無効化前にqueuedになったschedule | 1: variableだけで停止とせずqueued/in-progress runを確認する |
| 9 | 文字列 | 該当 | 名前が似た利用者branchや文書内の履歴参照 | 1: 対象identityを確認しhistorical本文は保持する |
| 10 | 数値 | 非該当 | 数値演算・NaN・乱数・DataFrameは扱わない | — |
| 11 | 巨大入力・リソース枯渇 | 該当 | 多数のresourceを一括削除する危険 | 1: 自動削除せず人が個別に確認する |
| 12 | 状態遷移の未定義パス | 該当 | open/closed/merged/未完了のremote state | 1: 旧recoveryを再実行せず人が通常PRへ引き継ぐ |

## フェーズ2: 検証対応

| 要件・該当分類 | 検証形態 | 検証先 | 備考 |
| --- | --- | --- | --- |
| Automation retirement: 1, 3, 4, 5, 6, 7, 12 | 例示test・静的検査 | repository-contracts.test.ts、旧CLI拒否test、git diff/import参照監査、tasks checkbox、元PoC digest | 新しい恒久validatorは追加しない |
| Preserve manual updates and offline checks: 1, 2, 3, 4, 5, 6, 7, 11, 12 | 既存例示test・実動作 | skill-updater-*.test.ts、test_taskfile.py、CI parity tests、skills:verify、check:isolated、rename後check | 共通updater/source/lock不変もdiffで確認 |
| Safe retirement guidance: 1, 3, 4, 5, 6, 7, 8, 9, 11, 12 | 静的review | docs/guide.md、README、safety、historical導線 | 手順と仕様の対応を独立review。実GitHub停止/cleanupは対象外・未検証。テストで外部writeしない |

## Correction cycle 2の再監査

要件の追加はなく、Safe retirement guidanceの既存12分類を再確認した。1は説明節欠落を検査失敗とする。3・9は現行説明と撤去手順・履歴の衝突を節の限定で避け、空白・改行・backtick・大小文字差を正規化する。4・6・7はRED→修正→GREENと新cycleの検証で扱う。5・8・11・12の移行手順は変更しない。2・10は引き続き非該当。未解決判断なし。

| 穴 | 検証形態 | 検証先 | 限界 |
| --- | --- | --- | --- |
| 説明節欠落・旧機能の既知表現の残存 | 例示test | test_current_ci_guide_does_not_advertise_retired_skill_automation | 自然言語一般の意味判定は保証しない |
| 表記揺れと撤去手順・履歴の誤検出 | 一時mutation probe・静的review | 現行CI節に旧表現を挿入した負例、既存§7を保持した正例 | 専用parserや恒久fixtureを追加しない |
| close後のfinding記録漏れ | 静的review | retrospectives.mdの該当行 | review=1、計1件、merge後=0 |
