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

## Workflow（OpenSpec / GSD の適応型実行境界 / ADR-0008・0009）
- 「何を・なぜ作るか」と最終完了は OpenSpec で確定する（仕様・受け入れ基準・`spec-holes`）。
- 実装開始前に、経路、恒久成果、一時実行証跡、最初に行う CI parity、停止・再計画条件を
  `tasks.md` の実行予算として記録する。固定 token・行数・commit・phase 数だけを品質判定に使わない。
- 独立出荷可能な成果は先に OpenSpec changes へ分割する。一体の成果について、単一セッションかつ
  単一コンテキストで安全に実装・検証でき、依存 phases や有益な隔離並列単位がなければ小規模、
  それ以外は大規模の GSD 候補とし、経路と理由を `tasks.md` に記録する。
- 小規模 change は OpenSpec `tasks.md` が詳細タスク・順序・進捗を所有し、
  `openspec instructions apply --change <id>` または同じ Markdown artifacts から直接実行する。
- 大規模 change は GSD（導入時のみ）が詳細 plan・phase 実行・phase 進捗を所有する。OpenSpec
  `tasks.md` は handoff・全 phases 完了・原本検証・project checks・close の境界ゲートだけを持ち、
  GSD の詳細タスクを複製しない。GSD も仕様・受け入れ基準を新規定義しない。
- GSD への handoff は専用 branch の review 可能な commit から行い、change ID、canonical artifact
  paths、source commit、完了済み境界ゲート、未解決事項を渡す。GSD の利用不能時や途中の経路変更は
  自動 fallback せず、状態と再構成案を提示して承認を得る。
- OpenSpec で GSD 経路を承認し、canonical artifacts を source-pinned な review 可能 commit に
  固定した後は、任意の `execute-openspec-change` skill で handoff 開始を自動化できる。read-only preview
  は決定論的な `input_route` の label/state（`json` / `markdown-fallback`）を表示するが fallback 原因を
  推測しない。表示後の新たな明示承認だけが prepare と GSD dispatch を許可し、最終完了は引き続き
  OpenSpec が所有する。
- Phase 2 の通常 CI が確認するのは静的な SKILL / fixture instruction contract と既存 Phase 1 の動的
  state seam までである。実 host orchestration は未検証で、Phase 3 の opt-in / manual evidence が所有する。
- GSD phases 完了後も、OpenSpec 原本の全 requirements / scenarios / `spec-holes` と実装・検証を
  対応付け、`task openspec:validate` と `task check` を通してから最終境界ゲートを完了にする。
- plan / evidence / test / review は、distinct failure / seam / risk の検出、セッション復帰、レビュー
  判断のいずれかへ価値を持つ場合だけ追加する。通常 CI を削除予定 artifacts や到達不能な Git 履歴へ
  依存させない。
- review convergence は OpenSpec 直接経路では change、GSD 経路では phase を単位とする。順序は
  self-review 1回、initial full review、finding 修正、fresh final reviewer、`task check`、
  同じ cycle の executor / reviewers と別の独立 verifier。
  finding 修正は fix・focused validation・diff review の組を最大3 iterationsとし、blocker を成功扱い
  しない。green evidence は command 単位で入力同一性を確認できる場合だけ再利用し、不明なら再実行する。
- material 実装は原則1 executorが継続し、finding ごとに fresh agent を作らない。fresh final reviewer は
  initial reviewer と別にする。verifier は同じ cycle の executor / reviewers と別の独立 verifier とする。
  soft-stop 後の新 cycle では、旧 cycle の verifier が fix に関与せず、context contamination がなく、最新入力との
  evidence identity を再確認できる場合だけ再利用する。独立実装単位、agent failure、context contamination
  がある場合だけ agent を追加する。`STATE`、`ROADMAP`、checkbox、report path の機械的補正は main が処理する。
- 3 iterations exhaustion、仕様判断、material expansion、連続 agent failure、再現する infrastructure
  failure では soft stop し、人間判断なしに続行しない。継続時は scope と実行予算を再計画した新しい
  cycle とし、単純に追加3回を認めない。
- 検証は高リスクな実動作 / safe dry-run、公開 interface、security property、静的 prose contract の順に
  優先する。環境依存を持つ最初の vertical slice で、該当する CI parity を全実装完了前に確認する。
- 独立成果、GSD phase、外部依存、trust boundary、通常 CI、永続データ、公開 API の追加は実行予算を
  再計画する。受け入れと checks が green なら、blocker でない nit / hardening は別 change へ送る。
- テンプレート自身では一つの PR に一つの active change だけを置き、依存 changes は専用 branches で
  段階的に close / merge する。main の `openspec/changes/` には blocked proposal を残さない。
- change を実行する主体（手動・GSD 駆動問わず）は、各タスク完了時に対応する `tasks.md` の
  チェックを `- [x]` に更新する。engine（`/opsx:apply`）不在の Markdown fallback でも同じ。
- 一体の change / phase の成果物は原則として同じ executor が継続し、main が各 task の成果を検証して
  から進捗をマークする。独立・非重複・個別検証可能な実装単位だけ、実行予算へ記録して追加 executor
  へ委譲できる（詳細は workflow.md）。
- OpenSpec で仕様を確定する前に `spec-holes` で未定義の振る舞いを列挙して潰す。
- 列挙した穴は可能なら例示テスト / Hypothesis property に落とす。
- 可能なら `tdd` skill でテストから始める。
- 設計が曖昧なら `grill-me` / `grill-with-docs` で確認する。
- 複雑化しそうなら `caveman` で単純化する。
- エラー調査では `diagnosing-bugs` skill を使う。
- まとまった変更後は可能なら `verify-change` で実動作を確認する。
- コミット / PR 前は可能なら `self-review` で自分の diff を検査する。
- 詳細は [docs/agents/workflow.md](docs/agents/workflow.md)。

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
