# Design

## Decisions

利用者は grilling で一元化、恒久 contract tests と今回の注入検証の分担、固定版 Task 導入、#69 先行を承認した。
Task 3.51.1 はローカル実機と同じ版を選ぶ。公式 go-task/setup-task v2 を SHA a00fbb05ce67b35648be3c78cbc9fd85354c757e へ固定し、version: "3.51.1" を指定する。
公式 action.yml と installer.ts の当該 SHA を確認した。exact version は release 一覧 API に依存せず直接 release asset を取得する。準備のネットワークは許容し、check の外に置く。
根拠: https://github.com/go-task/setup-task/tree/a00fbb05ce67b35648be3c78cbc9fd85354c757e および Context7 /go-task/task installation。

Taskfile を品質検証一覧の正とする。CI の個別検証 steps を一つの task check へ置換し、runtime preflight は依存導入前にも保持する。check の fail-fast を維持する。
恒久 tests は現在の job / task の構造を読み、共有入口と必須検証を固定する。汎用 workflow executor や YAML parser を新設しない。
受け入れ検証は使い捨て repository に追跡ファイルと今回差分を複製し、fresh と rename 後の task check を実行する。Skill lock の tree hash 不一致、automation assertion failure を別々に注入し、診断と非ゼロ終了を確認して各変更を復元する。
Node 24 / Python 3.14 / Task 3.51.1、locked dependency setup を使用する。check は認証変数を渡さず、無効 proxy と UV_OFFLINE で実行する。GitHub hosted runner 自体の実行は push 未依頼のため対象外とし、ローカル CI 相当経路を required evidence とする。

## Spec-holes

### Shared offline validation gate

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | check 呼び出し欠落 | 1: 両 job の呼び出しを恒久テスト |
| 2 | 境界値 | 非該当 | 序数境界なし | — |
| 3 | 重複・衝突 | 該当 | 複数の検証一覧 | 1: task check 一回に統一 |
| 4 | 順序 | 該当 | 改名前の検証 | 1: rename 後に呼ぶことを検査 |
| 5 | 型・形式不正 | 該当 | lock 破損 | 1: fresh / rename で破損注入 |
| 6 | エラー経路 | 該当 | test 失敗の握り潰し | 1: 無条件の gate と失敗注入 |
| 7 | 冪等性・再実行 | 該当 | 再実行の省略 | 1: 新しいキャッシュや条件分岐なし |
| 8 | 時刻・タイムゾーン | 非該当 | 日時入力なし | — |
| 9 | 文字列 | 非該当 | 新しい文字列変換なし。改名は既存仕様 | — |
| 10 | 数値 | 非該当 | 数値演算・乱数・データフレームなし | — |
| 11 | 巨大入力・リソース枯渇 | 該当 | 毎回の入れ子 full check の負担 | 1: 注入検証は今回だけ。通常 CI は恒久 contract tests |
| 12 | 状態遷移の未定義パス | 該当 | 無効と撤去の混同 | 1: 同梱中は無条件検証。prune は #51 |

### Pinned preparation separate from offline checks

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | version 未指定 | 1: exact version を検査 |
| 2 | 境界値 | 非該当 | 範囲入力なし | — |
| 3 | 重複・衝突 | 該当 | job 間の異なる Task 版 | 1: 同一固定値を検査 |
| 4 | 順序 | 該当 | 導入前の check | 1: 準備順序の恒久テスト |
| 5 | 型・形式不正 | 該当 | 可変 action ref / version range | 1: SHA / exact version を検査 |
| 6 | エラー経路 | 該当 | 導入失敗 | 1: 既定の Actions 失敗伝播を維持 |
| 7 | 冪等性・再実行 | 該当 | 既存 Task への暗黙依存 | 1: 両 job で明示導入 |
| 8 | 時刻・タイムゾーン | 非該当 | 日時指定なし | — |
| 9 | 文字列 | 非該当 | 新しい文字列入力なし | — |
| 10 | 数値 | 非該当 | 数値演算なし | — |
| 11 | 巨大入力・リソース枯渇 | 該当 | ダウンロードや runner 障害 | 2: 外部障害の注入は対象外。実 action の導入をローカル再現 |
| 12 | 状態遷移の未定義パス | 該当 | offline 段階の再導入 | 1: 準備と check を分離 |

## 検証対応

| 穴 | 検証形態 | 対応 |
| --- | --- | --- |
| 呼び出し欠落・重複・順序・失敗握り潰し | 恒久 contract tests | tests/test_runtime_foundation_contract.py |
| 必須検証欠落・同梱無効 | 恒久 contract tests と実動作 | tests/test_taskfile.py と fresh / rename check |
| lock 形式・integrity 破損、test 失敗 | 今回の例示検証 | fresh / rename 別々の破損注入と非ゼロ診断 |
| action / version 固定・準備順序・暗黙依存 | 恒久 contract tests と実動作 | 同一 exact pin と実 action 導入 |
| 再実行、省略、offline fallback | contract tests と実動作 | キャッシュによる check 省略なし、認証除去・無効 proxy |
| 巨大入力・prune・外部障害 | 対象外 | 通常 CI の入れ子実行、#51 実装、外部障害注入なし |

未解決判断: なし。
