# spec-holes: 12分類と検証対応

各要件の未解決判断はない。非該当以外は仕様/設計に明記した境界を適用する。

## VA-1

| # | 分類 | 判断・解消 | 検証対応 |
| --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当: 欠落lockはlocked操作の失敗。自動生成して成功扱いしない。 | validation §1〜2（lock/監査） |
| 2 | 境界値 | 該当: 対象版21.14.9と必要な推移依存だけに限定する。 | validation §1〜2（lock/監査） |
| 3 | 重複・衝突 | 該当: package名/version/sourceを照合し無関係なpin変更を拒否する。 | validation §1〜2（lock/監査） |
| 4 | 順序 | 該当: resolverの意味に従いlock行の並び替えを機能差と混同しない。 | validation §1〜2（lock/監査） |
| 5 | 型・形式不正 | 該当: lock parserとlocked sync/exportが不正形式を拒否する。 | validation §1〜2（lock/監査） |
| 6 | エラー経路 | 該当: 解決・取得失敗は停止しignoreや広範upgradeで回避しない。 | validation §1〜2（lock/監査） |
| 7 | 冪等性・再実行 | 該当: 再locked sync後もlock bytes不変を確認する。 | validation §1〜2（lock/監査） |
| 8 | 時刻・タイムゾーン | 非該当: 時刻でversion選択しない。 | — |
| 9 | 文字列 | 該当: package名とhashはresolverの形式に従う。 | validation §1〜2（lock/監査） |
| 10 | 数値 | 非該当: 研究数値・乱数を扱わずversionは識別子として比較する。 | — |
| 11 | 巨大入力・リソース枯渇 | 該当: 解決/同期失敗は未完了。新たな資源上限保証は対象外。 | validation §1〜2（lock/監査） |
| 12 | 状態遷移の未定義パス | 該当: 既存生成環境の自動修復は対象外。新規locked環境を検証する。 | validation §1〜2（lock/監査） |

## VA-2

| # | 分類 | 判断・解消 | 検証対応 |
| --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当: 監査対象0件や欠落結果は成功証跡としない。 | validation §3〜6（実動作/各gate） |
| 2 | 境界値 | 該当: 5件の解消と既存gateの全必須job成功を確認する。 | validation §3〜6（実動作/各gate） |
| 3 | 重複・衝突 | 該当: 使い捨てpathでprobeの副作用先を隔離する。 | validation §3〜6（実動作/各gate） |
| 4 | 順序 | 該当: self-review→review→gate→verifier→CI→closeの順を維持する。 | validation §3〜6（実動作/各gate） |
| 5 | 型・形式不正 | 該当: 監査診断や失敗exitを成功へ読み替えない。 | validation §3〜6（実動作/各gate） |
| 6 | エラー経路 | 該当: network/infrastructure failureはworkflowの停止規律に従う。 | validation §3〜6（実動作/各gate） |
| 7 | 冪等性・再実行 | 該当: 同じlocked環境でhook/生成環境を再実行可能にする。 | validation §3〜6（実動作/各gate） |
| 8 | 時刻・タイムゾーン | 非該当: elapsed計測や時刻を合否条件にしない。 | — |
| 9 | 文字列 | 該当: 空白・shell展開文字入りpathをliteralとして扱う。 | validation §3〜6（実動作/各gate） |
| 10 | 数値 | 非該当: NaN/inf/数値解析を扱わない。 | — |
| 11 | 巨大入力・リソース枯渇 | 該当: 検証timeout/resource failureは未検証としてclose禁止。 | validation §3〜6（実動作/各gate） |
| 12 | 状態遷移の未定義パス | 該当: 生成後のpipによるlauncher上書き、既存環境migrationは対象外。 | validation §3〜6（実動作/各gate） |
