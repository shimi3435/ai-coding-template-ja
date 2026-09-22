# 設計

## 実装境界

引数解析とhelpはruntime検査より前に置く。helpのための外部コマンドを追加せず、
正常なhelpだけならPATHにruntimeがなくても終了できる。引数を順に解析し、
最初の不正引数でexit 2とする。helpを記憶しても全引数が正常になるまで成功を返さない。
重複helpは1回表示する。空文字・位置引数・未定義option（`--`を含む）は従来通り未知引数とする。
複数の不正引数は最初のものを診断するが、helpとの混在では常に不正引数が優先される。

Node導入関数、専用一時変数、trap、INSTALL_NODE分岐を削除する。
残るNode / npmの各検査失敗は共通の復旧案内を呼ぶ。元の原因と検出値を保持する。
Python検査とversion受理文法、検査順序は変更しない。
uvの明示確認付き導入と通常setupはruntime合格後に従来通り実行する。

## 移行

公式導入先は https://nodejs.org/en/download 。Node.js 24 LTSとnpmを選び、
PATHを確認後、`./scripts/bootstrap.sh` を引数なしで再実行する。
案内で特定runtime managerを推奨せず、bootstrapが導入・起動することもない。
既存のuser-local Nodeとshell設定を削除・書換えしない。`NODE_INSTALL_ROOT` は参照しない。
旧option診断・移行説明・回帰tests・明示された歴史記録は撤去後も必要な参照として残す。

Context7の /nodejs/nodejs.org と公式downloadページで導入先を確認した。
版数は24 major要件であり、公式ページの将来の既定版に追従して変更しない。

## 検証境界

承認済みのbootstrap公開CLI（argv / stdout / stderr / exit status）をfixture PATHから実行する。
外部コマンドの呼出記録と一時HOME内のbytes / mode / symlinkを比較し、停止経路で
download、runtime実行、uv / task、既存環境変更が発生しないことを確認する。
正常bootstrapは既存fixtureでtask setupへの到達を確認する。
doctor / CLIは既存のfocused testsで回帰検証し、変更を加えない。

version出力の無制限サイズ・timeout、端末制御文字のsanitization、実WSL機での再検証は
この撤去changeの対象外とする。通常runtime検査は既存実行境界を保つ。
help・引数拒否はruntime自体を実行しないため、壊れたruntimeでも停止できる。
通常CIはこのchangeの文書やclose前の履歴を入力にしない。

## Open Questions

なし。残る機械的な境界値判断はspec-holes.mdに明記した。
