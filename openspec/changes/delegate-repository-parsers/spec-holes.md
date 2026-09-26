# spec-holes 監査

未解決判断: なし。利用者との対話で採択した受理契約を基準とする。
テスト seam は公開 CLI の `check-contracts`。文書は通常の日本語で記載する。

## R1: Canonical exact dependency versions

| # | 分類 | 判断 | 穴の内容と解決 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | 空 version / null は拒否。dependency field 欠損は現行どおり許可 | 1: spec に記載 |
| 2 | 境界値 | 該当 | core は 0..MAX_SAFE_INTEGER、全体256文字まで。255 / 256 / 257 を確認 | 1: spec に記載 |
| 3 | 重複・衝突 | 該当 | JSON の同名 key は JSON.parse の現行 last-key semantics を維持 | 2: JSON parser 変更は対象外 |
| 4 | 順序 | 該当 | dependencies / devDependencies の順序に依存せず同じ文法 | 1: spec に記載 |
| 5 | 型・形式不正 | 該当 | 非string、range、prefix、core / prerelease の先頭ゼロを拒否 | 1: spec に記載 |
| 6 | エラー経路 | 該当 | 不正な依存を診断、非ゼロ終了、無書込 | 1: spec に記載 |
| 7 | 冪等性・再実行 | 該当 | 同じ入力は同じ判定。入力補正なし | 1: spec に記載 |
| 8 | 時刻・タイムゾーン | 非該当 | 版文字列判定は時計・TZ を参照しない | — |
| 9 | 文字列 | 該当 | ASCII grammar、空白 / Unicode 拒否、build の先頭ゼロ許可 | 1: spec に記載 |
| 10 | 数値 | 該当 | core 上限を厳密検査。numeric prerelease は package に委譲し core 上限を適用しない | 1: spec に記載 |
| 11 | 巨大入力・リソース枯渇 | 該当 | version の256文字超を拒否。JSON file 全体の上限追加なし | 1 / 2: version 上限以外は対象外 |
| 12 | 状態遷移の未定義パス | 非該当 | read-only な単発検査で永続状態遷移なし | — |

## R2: Restricted YAML syntax delegated to yaml

| # | 分類 | 判断 | 穴の内容と解決 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | 空 document / null root を拒否 | 1: spec に記載 |
| 2 | 境界値 | 該当 | document は1個。0個 / 2個は拒否 | 1: spec に記載 |
| 3 | 重複・衝突 | 該当 | document 全体で duplicate key 拒否。quote 違いの同値 key も拒否 | 1: spec に記載 |
| 4 | 順序 | 該当 | mapping 順序 / indentation によらず同じ判定 | 1: spec に記載 |
| 5 | 型・形式不正 | 該当 | root mapping、文字列 key、YAML 1.2、標準 core tag のみ。error / warning 拒否 | 1: spec に記載 |
| 6 | エラー経路 | 該当 | Taskfile の診断を出して非ゼロ終了。部分解析結果を使用しない | 1: spec に記載 |
| 7 | 冪等性・再実行 | 該当 | read-only、同じ入力は同じ結果 | 1: spec に記載 |
| 8 | 時刻・タイムゾーン | 非該当 | 日付解釈に依存する schema / custom tag を導入しない | — |
| 9 | 文字列 | 該当 | quote / flow / block / BOM / CRLF を許可。scalar 内の shell 記号はそのまま | 1: spec に記載 |
| 10 | 数値 | 該当 | root / tasks / command が数値なら構造不正。検査外 value の数値意味は検証しない | 1 / 2: schema 全体は対象外 |
| 11 | 巨大入力・リソース枯渇 | 該当 | anchor / alias を展開前に拒否。独自 file size / nesting 制限は追加しない | 1 / 2: 汎用 resource 制限は対象外 |
| 12 | 状態遷移の未定義パス | 非該当 | parser が外部 write / 状態遷移を行わない | — |

## R3: Taskfile project policy uses parsed commands

| # | 分類 | 判断 | 穴の内容と解決 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | tasks / check 欠損、必須 command 不在は拒否。任意 task の cmds 欠損 / 空配列は許可 | 1: spec に記載 |
| 2 | 境界値 | 該当 | 各必須 command は1項目あればよい。空文字 / 空白のみの項目は拒否 | 1: spec に記載 |
| 3 | 重複・衝突 | 該当 | cmd と task の同時指定は拒否。同じ command の反復は許可 | 1: spec に記載 |
| 4 | 順序 | 該当 | 存在検査は task / command の順序に依存しない。実行順序の保証はしない | 1 / 2: task graph は対象外 |
| 5 | 型・形式不正 | 該当 | 省略形 / 非string / 未対応 cmds を拒否。補助設定の全 schema は検証しない | 1 / 2: spec と design に記載 |
| 6 | エラー経路 | 該当 | 必須入口の不足 / 禁止 runner / 不正構造を Taskfile 診断で拒否 | 1: spec に記載 |
| 7 | 冪等性・再実行 | 該当 | 実行せず静的に検査する。繰返しで入力を変更しない | 1: spec に記載 |
| 8 | 時刻・タイムゾーン | 非該当 | 判定は時刻 / TZ を参照しない | — |
| 9 | 文字列 | 該当 | 必須入口は trim 後の完全一致。description / YAML comment / echo / 埋込は不可 | 1: spec に記載 |
| 10 | 数値 | 該当 | 数値 command / task 名は拒否。補助 option の数値意味は Task に委譲 | 1 / 2: 全 schema は対象外 |
| 11 | 巨大入力・リソース枯渇 | 非該当 | input 上限は R2 と同じ。task 呼出を辿らず再帰実行しない | — |
| 12 | 状態遷移の未定義パス | 非該当 | shell / task 実行はしない。動的設定、includes、deps、到達可能性は対象外 | 2: design に明記 |

## 検証対応

| 穴 | 検証形態 | テスト | 備考 |
| --- | --- | --- | --- |
| R1 空・形式・ASCII・prefix・build | CLI 例示 | repository-contracts.test.ts の exact semver vectors | dependencies / devDependencies 両方 |
| R1 数値 / 長さ / numeric prerelease | CLI 境界例 | repository-contracts.test.ts の exact semver vectors | 直前 / 上限 / 超過 |
| R1 JSON 重複 | 既存 CLI test | follows JSON last-key semantics | JSON parse は変更しない |
| R2 空・複数・構文・型・重複・tag・directive | CLI 負例 | repository-taskfile.test.ts の YAML invalid inputs | 関係ない nested field の重複も対象 |
| R2 quote / flow / indentation / BOM / CRLF / shell 記号 | CLI 正例 | repository-taskfile.test.ts の equivalent YAML | library AST と policy の境界 |
| R2 anchor / alias / merge | CLI 負例 | repository-taskfile.test.ts の unsupported YAML constructs | scalar 中の同じ記号は正例 |
| R3 欠損・空・型・3形式・衝突 | CLI 例示 | repository-taskfile.test.ts の task command forms | 補助 option schema は対象外 |
| R3 必須入口の誤通過 | CLI 負例 | repository-taskfile.test.ts の required routes | prose / comment / echo / 埋込 / task / cmd object |
| R3 禁止 runner / 順序 | CLI 例示 | repository-taskfile.test.ts の forbidden runners / reordered tasks | 文字列と cmd 本文を走査 |
| R1 / R2 / R3 エラー・再実行・無書込 | CLI 例示 | repository-taskfile.test.ts の repeated read-only validation | status / diagnostic / bytes を比較 |
| 全体 | 実動作 / project gate | task check と実 repository check-contracts | Node 24 / Python 3.14 |
| 既存 startup 契約 | 既存 CLI 回帰 test | runtime-preflight.test.ts の runs before Node dependencies are installed | package import 遮断下で既存入口を検証 |
| 対象外事項 | 未検証 | 任意サイズ・深度の resource 保証、Task schema 全体、shell 実行意味、runtime #50 | 明示的スコープ外 |
