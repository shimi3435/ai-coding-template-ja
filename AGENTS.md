# Global Project Instructions

このファイルは全エージェント共通の**作業方針（意図・自然言語）の単一の正**（CONTEXT.md）。
Codex / Claude Code の両方がこれを正とする。MCP 接続・承認モード・サンドボックス等の
**ツール固有の機構設定はここに書かない**（`.mcp.json` / `.codex/config.toml` が担う）。

## Communication
- 返答は日本語で行う。
- 不確実な点は断定しない。
- 実行していない検証は未検証と明記する。

## General Engineering Rules
- 変更は必要最小限に留める。
- 無関係なリファクタリングを行わない。
- 現在のスコープ外で正確性・セキュリティ・データ損失・将来をブロックする設計負債の問題に
  気づいたら、直さず記録して失わない。記録先はプロジェクトの課題管理（GitHub Issue /
  OpenSpec backlog / TODO 等）。外部システムへの write（`gh issue create` 等）は自動発行せず、
  発見をその場で応答内に明示し文面を提案するに留める（発行は人起点・事前確認）。スタイル
  nit・主観的 refactor は対象外。
- 単一ファイルの肥大化を避ける。命名は具体的にする。
- 既存の設計意図を尊重する。

## Agents
- Codex / Claude Code の両方がこのファイルを正とする。
- Claude Code 固有の補足のみ CLAUDE.md にある。

## Workflow（OpenSpec 直接実行 / ADR-0010・0009）
- 外部挙動、公開 interface、security / trust boundary、永続データ、dependency / lockfile、build / CI、
  または複数の恒久成果を変更する場合、OpenSpec change を作り、仕様と最終完了を確定する。
- 独立して受け入れ、review、merge できる成果は別 changes に分割する。一体の成果は task 数、行数、
  セッション数で分割せず、同じ `tasks.md` の依存付き section とする。
- コア経路は OpenSpec 直接実行だけとする。proposal / design / spec delta / `spec-holes` が仕様の正本、
  `tasks.md` が詳細タスク、依存順、進捗、検証状態、セッション復帰の正本である。
- 各 task は成果、依存、対象、実装 checkbox、検証 checkbox を持つ。実行制約は最初の CI parity、
  停止・再計画条件、一時 artifact cleanup の3項目だけを `tasks.md` 冒頭に置く。
- 依存が全て完了した先頭の未完了 task から実行する。実装と指定検証の成功後、対応 checkbox を順に
  `- [x]` へ更新する。環境制約や検証失敗による未実行を完了扱いせず、change close を禁止する。
- OpenSpec CLI は任意の discovery / validation engine とする。不在時も同じ Markdown artifacts と
  checkbox 規律で実装・検証・再開する。
- agent は外部 orchestrator を一般的な候補として提案できる。ただし、利用者が特定の名前を選ぶ前の
  read-only 探索、在席確認、plugin 検索、version probe、install、起動は禁止する。明示選択後に使う
  場合も仕様を複製せず、各 task の進捗と検証状態を `tasks.md` へ同期する。
- plan / evidence / test / review は distinct failure / seam / risk の検出、セッション復帰、レビュー判断の
  いずれかへ価値を持つ場合だけ追加する。通常 CI を削除予定 artifacts や到達不能な Git 履歴へ依存させない。
- 全変更で self-review と適用可能な focused validation を行う。独立 review / verifier は下記
  OSWF-5 の列挙条件に該当する場合だけ起動する。
- 仕様判断または material expansion が必要なら、完了済み checkbox を保持して利用者承認まで停止する。
  承認後に仕様、`spec-holes`、validation、tasks を更新し、新しい cycle を開始する。
- 検証は高リスクな実動作 / safe dry-run、公開 interface、security property、静的 prose contract の順に
  優先する。最初の環境依存 vertical slice で該当 CI parity を全実装完了前に確認する。
- テンプレート自身では一つの PR に一つの active change だけを置く。依存 changes は先行 change の
  close / merge 後を base とし、main の `openspec/changes/` に blocked proposal を残さない。
- 一体の change は原則として同じ executor が継続する。独立・非重複・個別検証可能な実装単位だけ、
  `tasks.md` へ統合方法を記録し、別の利用者承認後に追加 executor へ委譲できる。
- OpenSpec で仕様を確定する前に `spec-holes` で未定義の振る舞いを列挙して潰す。
- 列挙した穴は可能なら例示テスト / Hypothesis property に落とす。
- 可能なら `tdd` skill でテストから始める。
- 設計が曖昧なら `grill-me` / `grill-with-docs` で確認する。
- 複雑化しそうなら `caveman` で単純化する。
- エラー調査では `diagnosing-bugs` skill を使う。
- まとまった変更後は可能なら `verify-change` で実動作を確認する。
- 詳細は [docs/agents/workflow.md](docs/agents/workflow.md)。

### OSWF-5 review 発火条件

次のいずれかを変更する場合だけ、独立 review / verifier を必須とする。本列挙を発火条件の単一の正とし、
design、tasks、workflow、skills は OSWF-5 を参照して列挙を複製しない。

- security / trust boundary
- 外部 write
- 永続データ
- 公開 interface
- dependency / lockfile
- build / CI
- 削除 / migration

該当時は self-review、initial independent review、finding 修正、最新入力の `task check`、initial reviewer と
別の独立 verifier の順に実行する。finding 修正は fix、focused validation、diff review を一組として
最大3 iterations。verifier blocker は soft stop し、利用者承認後の新 cycle で fix、独立 review、
project checks、前 cycle と別の verifier を実行する。同一役割・task の agent が連続2回失敗した場合、
または固定した環境・command・入力で infrastructure failure が2回再現した場合も停止する。

検証証跡は command、結果、source commit、fresh実行 / green evidence再利用の別、未検証理由の要約だけを
`tasks.md` へ記録する。生 log、一時 report、tool 固有 state を品質判定や完了判定に使わない。

## Tools
- 実装前に Context7 でライブラリ / CLI の最新仕様を確認する。
- GitHub の read 操作はコアでは `gh` CLI を使う。GitHub MCP はオプションで、
  有効時も read を基本とし write は事前確認する。
- Serena はオプション。大規模リファクタリング時のみ使う。
- MCP の設定詳細は [docs/agents/mcp.md](docs/agents/mcp.md)。

## Validation
- 変更後は対象に近いテストを実行する。
- 少なくとも `task check` の実行可否を確認する。
- 実行できなかったコマンドは理由を明記する。

## Safety
- 破壊的変更・大量削除・依存の大規模更新は事前確認する。
- API key / token / private key を追跡対象ファイルやログへ保存・出力しない。必要な secret は
  `.env` と gitignore 済みのローカル生成設定にのみ保存し、mode `0600` で保護する。
- `.env` はコミットしない。MCP の write 操作は慎重に扱う。
- 詳細は [docs/agents/safety.md](docs/agents/safety.md)。
