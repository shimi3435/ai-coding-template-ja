# change-retrospective（change close 時の軽量ふりかえり）仕様差分

本 change による capability `change-retrospective` への追加分。archive せず close 時に
ディレクトリごと削除するため、`openspec/specs/` へはマージされない。

## ADDED Requirements

### Requirement: change close 時のふりかえり記録
テンプレート自身の change を close する主体は、close コミット（マージ前の最終コミット）までに `docs/template/retrospectives.md` の末尾へ当該 change のふりかえりを 1 行（改行しない）追記しなければならない（SHALL）。形式は `- YYYY-MM-DD <change-id>（PR #N）: 逃した欠陥 <計> 件（self-review=a / review=b / CI=c / merge後=d）— 一言（任意）` とし、日付は close 時のローカル日付（厳密性は要求しない）、`<計>` は 4 経路の合計とする。本規約はテンプレート自身の change 運用にのみ適用され、下流リポジトリは任意採用とする（採用時は自リポジトリの記録先を定める）。マージに至らず破棄された change（close せず廃棄）は記録対象外とする。

#### Scenario: change の close
- **WHEN** change の実装が完了し、マージ前の最終コミットで change ディレクトリを削除する
- **THEN** 同じコミットまでに retrospectives.md へ当該 change の 1 行エントリを追記する

#### Scenario: 記録を忘れたままマージした
- **WHEN** ふりかえり行を追記せずに PR がマージされたことに後から気づいた
- **THEN** 気づいた時点で遡及追記する（記録の不在のまま放置しない）

#### Scenario: 記録先ファイルが存在しない
- **WHEN** retrospectives.md が存在しない（誤削除等）状態で change を close する
- **THEN** ヘッダ（形式の owner である workflow.md への参照）付きでファイルを再作成してから追記する

### Requirement: 逃した欠陥の定義とカウント規則
「逃した欠陥」は、当該成果物を作った実装 task の完了マーク（`- [x]`）後に発見され、修正を要した正しさ・仕様不一致の欠陥（docs の事実誤りを含む）でなければならない（SHALL）。実装中の自己修正・style nit・主観的リファクタ提案・回答のみで済む質問は数えない。同一欠陥は最初に発見された経路でのみ数える（重複カウントしない）。発見経路は `self-review`（自己 diff 検査）/ `review`（自分以外のマージ前レビュー。クロス AI・人間を問わない）/ `CI`（自動チェックの赤）/ `merge後`（マージ後に発見された欠陥全般。revert を含む）の 4 分類固定とする。欠陥が 0 件でも記録を省略してはならない（SHALL NOT）。境界の判断（欠陥か nit か等）は記録者に委ね、迷った場合は一言欄に補足する。

#### Scenario: 欠陥ゼロの change
- **WHEN** 実装 task 完了後にどのゲートでも欠陥が発見されなかった
- **THEN** `逃した欠陥 0 件（self-review=0 / review=0 / CI=0 / merge後=0）` として記録する（不在と忘れを区別するため）

#### Scenario: 同一欠陥を複数経路が指摘した
- **WHEN** self-review で見つけた欠陥を修正する前にクロス AI レビューも同じ欠陥を指摘した
- **THEN** 最初に発見された経路（self-review）でのみ 1 件と数える

#### Scenario: nit か欠陥か迷う指摘
- **WHEN** レビュー指摘が正しさに関わるか style nit かの判定が割れる
- **THEN** 記録者が判断してどちらかに倒し、必要なら一言欄に補足する（厳密な判定機構は持たない）

### Requirement: マージ後発見分の遡及更新
マージ後に既存 change 起因の欠陥が発見された場合、発見時点で該当 change の行の `merge後` カウントを更新し、一言欄に発見場所（修正 PR / commit / issue 等）を追記しなければならない（SHALL）。行は change ごとに 1 行を維持し、新しい行を追加してはならない（SHALL NOT）。原因 change を特定できない欠陥は無理に帰属させず、記録対象外とする。マージ前（行の記入後〜マージまで）の発見も同様に該当経路のカウントへ行を更新する。

#### Scenario: マージ後に欠陥が見つかった
- **WHEN** マージ済み change の成果物に欠陥が見つかり修正 PR を出した
- **THEN** 該当 change の行の `merge後` を増やし、一言欄に修正 PR 番号を追記する（新行は足さない）

#### Scenario: 行の記入後・マージ前に CI が落ちた
- **WHEN** ふりかえり行を書いた close コミットの後、マージ前に CI が欠陥を検出した
- **THEN** `CI` のカウントへ該当行を更新してからマージする

#### Scenario: 原因 change が特定できない
- **WHEN** 発見された欠陥がどの change 起因か合理的に特定できない
- **THEN** どの行も更新せず記録対象外とする（誤った帰属でデータを汚さない）
