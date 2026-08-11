# OpenSpec 直接実行をコアワークフローにする

> Status: Accepted.
> Supersedes: ADR-0003 and ADR-0008.

OpenSpec の proposal、design、spec delta、受け入れ基準、`spec-holes` を仕様の正本とし、
`tasks.md` を実装順序、進捗、検証状態、セッション復帰の正本とする。コアの実行経路は
OpenSpec 直接実行だけとし、OpenSpec CLI の有無や外部 tool 固有の plan、state、evidence を
品質条件にしない。

OpenSpec change は、外部挙動、公開 interface、security / trust boundary、永続データ、
dependency / lockfile、build / CI、または複数の恒久成果を変更するときに要求する。一つでも
該当すれば実装前に proposal、必要な spec delta、`spec-holes`、詳細 `tasks.md` を確定する。
どれにも該当しない局所 bugfix、内部 refactor、軽微な文書修正は change を作らず直接実行できる。

独立して受け入れ、review、merge できる成果は別 changes に分割する。一つの受け入れ結果に必要な
一体の成果は、task 数、行数、セッション数を分割基準にせず、同じ `tasks.md` の依存付き section で
管理する。

各 task は成果、依存、対象、実装 checkbox、検証 checkbox を持つ。実行制約は最初の CI parity、
停止・再計画条件、一時 artifact cleanup の3項目だけを冒頭に置く。依存が全て完了した先頭の
未完了 task から実行し、実装と指定検証が成功した順に checkbox を更新する。環境制約や検証失敗は
検証完了に読み替えず、change close を禁止する。構造上 focused validation と代替静的検証が存在しない
場合だけ、N/A 理由を記録して検証 checkbox を完了できる。

agent は外部 orchestrator を一般的な候補として提案できる。ただし、利用者が特定の名前を選ぶ前の
read-only 探索、在席確認、plugin 検索、version probe、install、起動を禁止する。明示選択後に利用する
場合も、仕様を複製せず、各 task の進捗と検証状態を同じ `tasks.md` へ同期する。外部 tool の完了 state
だけでは change を完了にしない。

仕様判断または material expansion が必要になったら、完了済み checkbox を保持して利用者承認まで
停止する。承認後に OpenSpec の仕様、`spec-holes`、validation、tasks を更新し、未完了 task から
新しい実行 cycle を開始する。

## Considered Options

- **規模に応じて実行経路を切り替える**: 規模を事前測定しにくく、仕様、詳細計画、進捗、復帰 state
  の同期境界が増えるため却下する。
- **外部 orchestrator をコア依存にする**: tool の不在、version、固有 state が品質条件となり、
  Markdown artifacts だけでの再開を妨げるため却下する。
- **task 数やセッション数で change を分割する**: 独立出荷可能性と一致せず、一体の受け入れ結果を
  人為的に分断するため却下する。

## Consequences

- OpenSpec CLI がなくても Markdown artifacts と checkbox 規律から同じ順序で実装・検証・再開できる。
- 外部 orchestrator 固有 integration はコアから削除し、利用者明示選択後の tool-neutral な支援だけを
  許可する。
- 長い `tasks.md` が生じ得るが、独立出荷可能性で change を分割し、一体成果は section と依存で整理する。
