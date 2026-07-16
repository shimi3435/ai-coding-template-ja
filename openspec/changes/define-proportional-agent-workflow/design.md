# Design: proportional agent workflow

## Decision

ADR-0008 の小規模 / GSD 経路判定は変更しない。その前後に一つの軽量な実行予算を置き、生成量では
なく、恒久成果と新しい失敗を捕捉する検証価値へ作業を比例させる。固定 token 数や一律の phase 上限は
設けず、次の追加を material expansion として停止・再計画する。

- 独立して出荷できる恒久成果または OpenSpec change の追加
- GSD phase または外部依存 / trust boundary の追加
- 通常 CI、永続データ、公開 API の追加・変更

実行予算は `tasks.md` に短く記録する。専用 schema や自動 token accounting は導入しない。

## Verification priority

1. 高リスクな実動作または safe dry-run seam
2. 公開 interface / integration behavior
3. security・property・境界条件
4. 静的 fixture / prose contract

上位を安全に実行できない場合は理由付き未検証を残せるが、その代替として下位証跡を無制限に
増やさない。通常 CI は main に残る恒久成果だけに依存する。

## Spec holes Phase 1

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | 実行予算の項目が空のまま開始できるか | 1: 最小項目が揃うまで実装開始しない |
| 2 | 境界値 | 該当 | 何件から過剰か固定値がない | 1: 件数でなく material expansion 条件を固定する |
| 3 | 重複・衝突 | 該当 | failure / seam / risk と判断用途が同等の evidence が重複する | 1: 既存 evidence を参照し新規作成しない |
| 4 | 順序 | 該当 | 静的証跡が実動作検証より先行する | 1: verification priority を固定する |
| 5 | 型・形式不正 | 該当 | 恒久 / 一時分類や停止条件が曖昧 | 1: 分類不能なら未解決事項として開始を止める |
| 6 | エラー経路 | 該当 | CI parity / tool が利用不能 | 1: 理由付き未検証と代替確認を記録し成功扱いしない |
| 7 | 冪等性・再実行 | 該当 | 再計画ごとに予算文書が重複する | 1: 同じ `tasks.md` の予算を更新する |
| 8 | 時刻・タイムゾーン | 非該当 | 時刻で挙動を変えない | — |
| 9 | 文字列 | 該当 | 用語揺れで分類が崩れる | 1: `CONTEXT.md` の4用語へ正規化する |
| 10 | 数値 | 非該当 | token / 行数の固定数値を契約にしない | 2: 自動 accounting は対象外 |
| 11 | 巨大入力・リソース枯渇 | 該当 | 実行中に計画・証跡が膨張する | 1: material expansion で停止・再計画する |
| 12 | 状態遷移の未定義パス | 該当 | green 後に nit / hardening が流入する | 1: blocker 以外は別 change へ送る |

## Spec holes Phase 2 mapping

本 change は prose policy のため、token presence test は意味の成立を保証せず、既存 failure を新たに
検出しない。専用テストは追加せず、OpenSpec strict validation、文書間の目視対応、`task check`、
`self-review` で検証する。各 hole は同 spec の scenario または明示したスコープ外へ対応する。
