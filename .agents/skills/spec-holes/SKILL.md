---
name: spec-holes
description: >
  Find undefined behavior in each requirement using twelve categories and propose
  example tests or Hypothesis properties. Use before finalizing an OpenSpec spec,
  or when asked for 仕様の穴 / エッジケース / spec-holes. Execution belongs to the executor.
---

# spec-holes（仕様の穴の発見）

proposal / spec deltaを確定する前に、要件ごとの未定義の振る舞いを列挙する。
成果は穴の一覧、仕様上の処理先、検証候補である。実装・検証実行・進捗更新は実行担当が所有する。
検証候補を検証済みと報告せず、実行結果と完了判定は[共通workflow](../../../docs/agents/workflow.md)へ渡す。

## 12分類

各要件に以下を順にすべて当て、該当 / 非該当を判断する。数値・乱数・研究データも入力として存在するなら対象に含める。

1. 空・ゼロ長・None: 欠落、空集合、空文字列、空データ。
2. 境界値: 最小・最大、0 / 1 / N-1 / N / N+1。
3. 重複・衝突: 同名、キー重複、一意性違反。
4. 順序: 未ソート、逆順、安定性、依存順。
5. 型・形式不正: 想定外の型、schema違反、parse不能。
6. エラー経路: 例外、部分失敗、再試行。
7. 冪等性・再実行: 二重実行、中断からの再開。
8. 時刻・タイムゾーン: TZ、夏時間、逆行、日付境界。
9. 文字列: Unicode、結合文字、絵文字、空白、encoding。
10. 数値: NaN、inf、負数、ゼロ除算、浮動小数点精度。
11. 巨大入力・リソース枯渇: サイズ、memory、disk、timeout。
12. 状態遷移の未定義パス: 不正状態、定義外の操作順。

## 穴の処理と出力

- 要件ID・分類番号・入力例・未定義の挙動・処理先を対応付ける。
- 処理先は「仕様へ正常 / エラー動作を明記」「scope外と明記」「利用者へ判断を求める」のいずれか。
  判断待ちは未解決として残し、仕様確定しない。既存情報から導出できる事項は調べて埋める。
- 全分類の判断を追跡可能にする。同じ理由で非該当となる項目は、要件ID・分類番号群・共通理由をまとめてよい。
  分類を評価せずに省略しない。
- 各穴に例示テストまたはHypothesis propertyの候補を添える。純粋な変換には往復・冪等性などのproperty、
  I/Oや外部依存には公開境界を通る例示を選ぶ。候補を作れない場合は理由を残す。
- 実行担当が仕様反映・テスト実装・検証結果をtasks.mdへ対応付ける。self-reviewは対応漏れを指摘する。
