# ai-coding-template-ja

研究者が AI コーディングを安全に始める開発基盤を提供する、日本語対応の研究用 Python プロジェクトテンプレート（Codex / Claude Code、Ubuntu 対象）。このリポジトリで用いる中核語を定義する。作業規則は[AGENTS.md](AGENTS.md)、実行手順は[workflow](docs/agents/workflow.md)を参照する。

## Language

**コア層**:
新規プロジェクト作成直後に `./scripts/check.sh` と `task doctor` が通り、エージェントが安全に作業を始められる最小実用セット。常に有効。
_Avoid_: 標準セット, 基本機能

**オプション層**:
コア層を変更せずに opt-in で足せる拡張。既定では無効。
_Avoid_: 追加機能, プラグイン

**単一の正（AGENTS.md）**:
全エージェント共通の**作業方針（意図・自然言語）**の実体を一元化したファイル。CLAUDE.md・docs/agents は AGENTS.md と矛盾しない補助に留まる。MCP 接続・承認モード・サンドボックス等の**ツール固有の機構設定は管轄外**（`.codex/config.toml` / `.mcp.json` が担い、AGENTS.md の意図を各ツールで実現する設定と位置づける）。
_Avoid_: ルートルール, マスター設定

**Skill 実体**:
配布するAgent Skillの正本。配置とhost別の参照方法は[workflow](docs/agents/workflow.md)に定める。
_Avoid_: スキル本体, オリジナル

**green（doctor / check が通る状態）**:
`task doctor` と `./scripts/check.sh` がともに exit 0 の状態を指す。`task doctor` では FAIL（機械コアの破損）がゼロであること（WARN・INFO は green を壊さない。到達性チェックは既定で行わず、作成直後・CI・オフラインでも green になる）。
_Avoid_: 成功, パス, OK

**恒久成果**:
change の close / merge 後も main に残り、下流利用者または将来の保守へ直接価値を持つコード、テスト、仕様、運用文書。
_Avoid_: product artifact, 最終ファイル

**一時実行証跡**:
計画、復帰、レビュー、判断のため change branch または作業環境だけで保持し、close 前に削除する記録。
_Avoid_: 恒久成果, 成果物

**実行予算**:
OpenSpec 直接実行（ADR-0010）で `tasks.md` に定める実行境界。構成は[workflow](docs/agents/workflow.md#tasksmd-の最小契約)を参照する。
_Avoid_: token budget, 見積もり

**検証価値**:
既存 gate と異なる failure、seam、risk を捕捉するか、復帰・レビュー判断に必要な根拠を与える性質。
_Avoid_: coverage 数, evidence 量

**実質的な拡張（material expansion）**:
承認済み scope 外となる独立成果、外部挙動、外部 write、security / trust boundary、公開 interface、永続データ形式 / migration、dependency / lockfile、build / CI / 配布経路の追加・変更。
_Avoid_: 単なる行数増加, nit

**convergence cycle**:
一つの OpenSpec change を単位として、実装後の review、blocker 修正、全体 check、独立 verification を有界に収束させる一連の実行。
_Avoid_: session, retry loop

**iteration**:
convergence cycle 内で、未解決 blocker finding 一式の修正、対象に近い focused validation、変更差分と直接依存の review がすべて完了した一組。finding 件数や review 回数そのものは数えない。
_Avoid_: finding count, full review

**reusable green evidence**:
実行 command と exit 0、source commit、検証入力の dirty diff digest または同等の不変証明、依存・設定・fixture・実行環境について、現在状態との入力同一性を command 単位で確認できる検証証跡。
_Avoid_: 最新らしいログ, 時刻だけの証明

**soft stop**:
blocker を成功扱いせず自律実行を止め、未解決事項と既存証跡を保持したまま、継続・再計画・別 change 化・中断の人間判断へ戻す状態。
_Avoid_: success, hard cap
