# spec-holes: 全12分類と検証対応

各要件の未解決判断はない。判断はdesignに接続し、検証番号はvalidation.mdを参照する。

## FL-1

| # | 分類 | 判断 | 決定・理由 | 検証形態・対応 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | 欠落lockはlocked失敗とし暗黙生成で回避しない | 一時probe・差分照合・既存gate: 1〜2 |
| 2 | 境界値 | 該当 | 4.2.4だけに固定しPython>=3.14とconsumer制約を確認 | 一時probe・差分照合・既存gate: 1〜2 |
| 3 | 重複・衝突 | 該当 | 全package recordを比較し無関係な変更を拒否 | 一時probe・差分照合・既存gate: 2 |
| 4 | 順序 | 該当 | lockの行順だけで判定せずTOMLを比較 | 一時probe・差分照合・既存gate: 2 |
| 5 | 型・形式不正 | 該当 | parser/locked操作の失敗を伝播 | 一時probe・差分照合・既存gate: 2 |
| 6 | エラー経路 | 該当 | 取得や解決失敗を未完了にする | 一時probe・差分照合・既存gate: 2 |
| 7 | 冪等性・再実行 | 該当 | locked sync/export後のlock bytesを保持 | 一時probe・差分照合・既存gate: 2 |
| 8 | 時刻・タイムゾーン | 非該当 | 日付で動的にversion選択しない | 非該当 |
| 9 | 文字列 | 該当 | package名・source/hashをresolver形式で検証 | 一時probe・差分照合・既存gate: 2 |
| 10 | 数値 | 非該当 | 研究数値/乱数は扱わずversionは識別子 | 非該当 |
| 11 | 巨大入力・リソース枯渇 | 該当 | resource failureで範囲縮小せず未完了 | 一時probe・差分照合・既存gate: 2 |
| 12 | 状態遷移の未定義パス | 該当 | SoftReadWriteLockの旧永続形式移行は範囲外とdesignに明記 | 一時probe・差分照合・既存gate: 5（実consumerの照合） |

## FL-2

| # | 分類 | 判断 | 決定・理由 | 検証形態・対応 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | 監査0対象や欠落証跡は成功にしない | 一時probe・差分照合・既存gate: 1〜2,6〜7 |
| 2 | 境界値 | 該当 | lock競合timeoutと解放後取得を確認 | 一時probe・差分照合・既存gate: 3 |
| 3 | 重複・衝突 | 該当 | 共通cacheの並列生成とprocess間排他を確認 | 一時probe・差分照合・既存gate: 3,5 |
| 4 | 順序 | 該当 | nested holdとreview/gate/verifier順序を維持 | 一時probe・差分照合・既存gate: 3,6 |
| 5 | 型・形式不正 | 該当 | symlinkと消滅cwdを拒否し正常時の回復を確認 | 一時probe・差分照合・既存gate: 3〜4 |
| 6 | エラー経路 | 該当 | 必須失敗は未完了、上流全OS攻撃再現は範囲外と明記 | 一時probe・差分照合・既存gate: 3〜7 |
| 7 | 冪等性・再実行 | 該当 | cold/warm cacheと失敗後の再取得を確認 | 一時probe・差分照合・既存gate: 3,5 |
| 8 | 時刻・タイムゾーン | 該当 | timeoutは有限値と外側process timeoutで検証し壁時計閾値をCI化しない | 一時probe・差分照合・既存gate: 3 |
| 9 | 文字列 | 該当 | 空白pathをliteralの引数配列で扱う | 一時probe・差分照合・既存gate: 5 |
| 10 | 数値 | 該当 | timeoutは非負有限値を使用、全NaN/inf契約再検証は範囲外 | 一時probe・差分照合・既存gate: 3 |
| 11 | 巨大入力・リソース枯渇 | 該当 | 検証timeout/resource failureを成功へ読み替えない | 一時probe・差分照合・既存gate: 3〜7 |
| 12 | 状態遷移の未定義パス | 該当 | consumerの失敗/再開を確認し、別UID/Windows/全extrasは未検証と明記 | 一時probe・差分照合・既存gate: 3〜7 |
