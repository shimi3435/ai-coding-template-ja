## ADDED Requirements

### Requirement: change実行は恒久成果と検証価値へ比例する
実行主体は、実装開始前に実行経路、恒久成果、一時実行証跡、早期検証、停止・再計画条件を実行予算として記録し、既存検証で捕捉できない failure / seam / risk または復帰・レビュー判断に価値を持つ証跡だけを追加しなければならない（SHALL）。

#### Scenario: 最小実行予算を確定する
- **WHEN** OpenSpec change の仕様と実行経路を確定する
- **THEN** 実行主体は恒久成果、一時実行証跡、最初に行う CI parity、停止・再計画条件を `tasks.md` に記録し、分類不能な項目を未解決のまま実装開始しない

#### Scenario: 独立した恒久成果を分割する
- **WHEN** 一つの計画に独立してレビュー・出荷できる恒久成果が複数ある
- **THEN** 実行主体は ADR-0008 に従って OpenSpec changes を先に分割し、GSD を選んだことを統合理由にしない

#### Scenario: 重複する証跡を増やさない
- **WHEN** 追加予定の plan、evidence、test、review が既存 gate と同等の failure / seam / risk だけを検証し、復帰または判断にも不要である
- **THEN** 実行主体は新規 artifact を作らず、既存 evidence を参照する

#### Scenario: 高リスク seam を先に検証する
- **WHEN** 実動作または safe dry-run seam と静的 prose contract の両方が検証候補である
- **THEN** 実行主体は実動作、公開 interface、security property、静的 contract の順で優先し、安全に実行不能な上位 seam は理由付き未検証として明示する

#### Scenario: 環境差を早期に検出する
- **WHEN** 最初の vertical slice が Git 履歴、rename、offline、tool availability、OS 固有機構のいずれかへ依存する
- **THEN** 実行主体は該当する CI parity を全実装完了前に実行し、実行不能なら理由と代替確認を記録する

#### Scenario: 実行予算を再計画する
- **WHEN** 独立成果、GSD phase、外部依存、trust boundary、通常 CI、永続データ、公開 API の追加により当初予算が materially 拡張する
- **THEN** 実行主体は続行前に同じ `tasks.md` の実行予算を更新し、必要なら change 分割または経路変更の承認を得る

#### Scenario: green後のscopeを閉じる
- **WHEN** 受け入れ基準と project checks が green で blocker がない
- **THEN** 実行主体は nit と独立 hardening を別 change または提案へ送り、現在 change の証跡と実装を拡張しない

#### Scenario: 固定数量を品質の代理にしない
- **WHEN** change の複雑さと安全性を評価する
- **THEN** 実行主体は token、行数、commit、phase の一律上限だけで停止または完了を判定せず、実行予算の境界と検証結果で判断する
