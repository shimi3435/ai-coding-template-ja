# エージェント実行を恒久成果と検証価値へ比例させる

> Status: Accepted.

AI エージェントは安全な計画・復帰・検証のために一時記録を必要とする一方、生成可能な plan、
evidence、review を無制限に増やすと、恒久成果より実行コストが大きくなり、高リスクな実動作 seam の
検証が後回しになる。各 change は実装開始前に**実行予算**を置き、恒久成果、一時実行証跡、早期
CI parity、停止・再計画条件を明示する。OpenSpec / GSD の経路選択は ADR-0008 の規模・依存条件に
従い、GSD を選んだこと自体を追加文書や phase を無制限に作る理由にしない。

証跡は、既存のテスト・検証では捕捉できない failure / seam / risk を検証する、またはセッション
復帰・レビュー判断に必要な場合だけ作る。通常 CI は main に残る恒久成果だけへ依存し、削除予定の change artifacts、
一時 GSD state、到達不能な Git 履歴へ依存しない。検証は高リスクな実動作 / safe dry-run seam、公開
interface、security property、静的 prose contract の順に優先し、上位 seam が未検証のまま下位証跡を
増やす場合は理由を記録する。

## Bounded review convergence

ADR-0009 の比例性と evidence economy を review / fix 運用へ適用する。OpenSpec 直接経路では change、
GSD 経路では phase を一つの convergence cycle とし、self-review、initial full review、blocker 修正、
fresh final full review、全体 check、同じ cycle の executor / reviewers と別の独立 verifier の順に収束させる。全スコープ review は initial と
final の最大2回とし、finding 修正後は差分と直接依存だけを review する。

blocker 修正は、未解決 finding 一式の fix、focused validation、diff review を1 iteration として合計
最大3 iterationsまでとする。3回で収束しない場合、または material expansion、仕様判断、連続 agent
failure、再現する infrastructure failure がある場合は blocker を成功扱いせず soft stop する。人間が
継続を選んだ場合も単純に3回を追加せず、scope と実行予算を再計画した新しい cycle として開始する。

green evidence は command 単位で入力同一性を確認し、同じ failure / seam / risk に対する全体 check を
重複しない。入力範囲や source、tests、依存、lockfile、build / CI 設定、fixture、実行環境の同一性が
不明なら再実行する。material 実装と finding 修正は原則として同じ executor が継続し、initial reviewer、
別の fresh final reviewer、同じ cycle の executor / reviewers と別の独立 verifier を割り当てる。soft-stop 後の
新 cycle では、旧 cycle の verifier が fix に関与せず、context contamination がなく、最新入力との evidence identity を
再確認できる場合だけ再利用する。独立実装単位、agent failure、context contamination のいずれもない追加 agent は作らない。

## Considered Options

- **固定 token・行数・phase 数を全 change に課す**: 比較しやすいが、安全性や依存関係による必要量を
  無視して作業を途中で切るため却下する。
- **生成できる証跡をすべて残す**: 追跡可能性は増えるが、重複と保守対象を増やし、検証価値との比例を
  失うため却下する。
- **効率は実行者の裁量だけに任せる**: 小規模変更でも過剰計画を防ぐ共通停止条件がなく、セッション
  ごとに判断が揺れるため却下する。

## Consequences

- phase、plan、review、evidence の追加が実行予算を materially 拡張する場合は、続行前に再計画する。
- 受け入れ基準と project checks が green で blocker がなければ、nit と独立 hardening は別 change へ
  送り、現在 change を拡張しない。
- 数量の収集や自動課金・token accounting は本判断の対象外とし、まず artifact と gate の境界を
  人間がレビュー可能な形で固定する。
