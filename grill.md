# ai-coding-template-ja 作成依頼ドキュメント（改訂版）

> 改訂方針: コア層 / オプション層の 2 層構造に再編。AGENTS.md を主体とし CLAUDE.md は薄く。OpenSpec をコア・GSD をオプションとして責務を分離。対象 OS は Ubuntu (Linux) のみ。パッケージ改名・`.gitignore`・basedpyright モード等の懸念を推奨方針として反映。

---

## 0. 改訂版の設計決定サマリ

このドキュメントは初版を以下の決定に基づいて再構成したものである。grill-with-docs には、これらの決定を前提としたうえで残りの設計をレビューしてもらう。

```text
[2層構造]
- コア層: 新規プロジェクトで常に有効化する最小実用セット
- オプション層: 研究内容に応じて opt-in する拡張セット

[エージェント]
- AGENTS.md を単一の正とする（実体を集約）
- CLAUDE.md は薄く保ち、AGENTS.md を参照（@AGENTS.md import）するだけにする
- Codex / Claude Code は両方コア対応（AGENTS.md 主体で両者が動く）

[仕様・タスク管理]
- OpenSpec をコアにする（何を・なぜ作るか＝仕様/受け入れ基準）
- GSD をオプションにする（どの順で作るか＝タスク分解/進捗）
- 両者の責務境界を AGENTS.md / docs/agents/workflow.md に明記し重複を禁じる

[AI ツール]
- Skills: コア（grill-me / grill-with-docs / tdd / diagnose / caveman）
- MCP: Context7 / GitHub をコア、Serena はオプション

[ドキュメント]
- docs/agents は推奨 3 本（workflow.md / safety.md / mcp.md）に圧縮
- 増えてから分割する

[OS]
- Ubuntu (Linux) のみを対象にする
- bootstrap.ps1・Windows/macOS 個別手順は作らない

[その他の推奨反映]
- パッケージ改名スクリプトをコアに含める
- data/ results/ 等を初期から .gitignore する
- basedpyright は basic モードを既定にする
- LICENSE を含める
```

> 【grill-with-docs 反映済】本ドキュメントは grill セッション（Q1-Q9）で更新済。
> 追加で結晶化した決定は §26、設計判断の記録は `docs/adr/0001-0003`、
> 用語定義は `CONTEXT.md` を参照。主な改訂: §7（OpenSpec/GSD 境界）/ §9.2（skill vendoring）/
> §10（MCP リモート既定）/ §14・§20（Node 非コア）/ §17（rename 確定）/ §19（openspec 最小）/
> §23（受け入れ 3 段階）。

---

## 1. このドキュメントの目的

このドキュメントは、`ai-coding-template-ja` という GitHub テンプレートリポジトリを作成する前に、AI コーディングエージェントへ設計レビュー・要求整理・実装方針の検討を依頼するための入力資料である。

`grill-with-docs` では、このドキュメントを前提資料として読み、以下の観点から厳しめにレビューしてほしい。

- 要求が曖昧な箇所
- 実現困難または過剰設計になっている箇所
- セキュリティ上危険な箇所
- Codex と Claude Code の責務分担が曖昧な箇所
- OpenSpec / GSD / Skills / MCP の役割が重複している箇所
- まっさらな Ubuntu PC からの bootstrap 手順で破綻しやすい箇所
- 将来の研究プロジェクトへコピーしたときに負債化しそうな箇所（特にパッケージ改名）

最終的には、研究プロジェクトを開始するたびにこのテンプレートから新規リポジトリを作成し、最小限の手順で AI コーディング環境・Python 開発環境・品質チェック・仕様駆動開発フローを開始できる状態を目指す。

---

## 2. 作成したいリポジトリの概要

リポジトリ名は以下を想定する。

```text
ai-coding-template-ja
```

日本語で AI コーディングを行うための研究用 Python プロジェクトテンプレートである。主な用途は以下。

- 数値計算 / 機械学習 / シミュレーション / 可視化
- 論文実装 / 実験管理
- 研究用 Web アプリケーションの雛形
- Jupyter Notebook から Python パッケージ化する作業
- Codex / Claude Code を併用した開発

基本方針は、単なる Python テンプレートではなく、**AI コーディングエージェントが迷わず動けるためのテンプレート**にすること。そして全部入りではなく、**コア層を最小に保ち、研究内容に応じてオプション層を安全に足せる**構成にすることである。

---

## 3. 想定する利用者

主な利用者は、日本語で研究開発を行う個人または小規模チームである。

- Python を主に使う
- uv による Python バージョン・依存管理を使いたい（pyenv は任意）
- Codex と Claude Code を併用したい
- OpenSpec によって仕様を管理したい
- 必要に応じて GSD で実装タスクを管理したい
- Skills でエージェントの作業パターンを安定化したい
- MCP で最新ドキュメント確認・GitHub 操作を補助したい
- 再現性・安全性・検証ログを重視する
- 実験コードとプロダクション寄りコードが混在しがちなので整理しやすい構成にしたい
- 開発・実行環境は Ubuntu (ネイティブまたは WSL2 上の Ubuntu) を想定する

---

## 4. 非目的

このテンプレートは以下を主目的にしない。

- 大規模企業向けの厳格な monorepo 管理
- 複数言語を前提とした polyglot テンプレート
- 最初から Docker / Kubernetes を必須にする構成
- CI/CD による本番デプロイ自動化
- 特定クラウドサービスへの強い依存
- Windows / macOS 個別対応（Ubuntu のみ対象とする）
- AI エージェントに無制限の権限を与えること
- API key / token を自動生成・自動保存すること
- 外部 Skills を常に最新版へ自動更新すること
- 研究ごとの差異を吸収しきる巨大テンプレートにすること

重要なのは、**過剰な全部入りではなく、安全に拡張できる最小実用コア**にすることである。

---

## 5. 2 層構造（このテンプレートの中心方針）

このテンプレートの最大の特徴は、機能を **コア層** と **オプション層** に明確に分けることである。

### 5.1 コア層（常に有効・第 1 PR で完成させる）

新規プロジェクト作成直後に `task check` と `task doctor` が通り、AI エージェントが安全に作業を始められる最小セット。

```text
[Python 開発基盤]
- uv / pyproject.toml / uv.lock / .python-version (3.12)
- ruff (format + lint)
- basedpyright (basic モード)
- pytest / pytest-cov
- pre-commit（軽量フックのみ）
- Taskfile

[AI エージェント基盤]
- AGENTS.md（主体・単一の正）
- CLAUDE.md（薄く・AGENTS.md を参照）
- .codex/config.toml.template（Codex 用）
- docs/agents/{workflow,safety,mcp}.md（3 本）

[仕様管理]
- OpenSpec 初期構成（project.md ＋空 specs/changes）

[Skills（コア）]
- grill-me / grill-with-docs / tdd / diagnose / caveman

[MCP（コア）]
- Context7 MCP（最新ドキュメント確認）
- GitHub MCP（read 中心・write は最小）
- 設定は .mcp.json.template で配布

[導入・診断]
- scripts/bootstrap.sh（Ubuntu のみ）
- scripts/doctor.py（task doctor）
- scripts/rename-package.py（テンプレート改名）

[品質・運用]
- .gitignore（data/ results/ 等を初期から無視）
- .env.example
- LICENSE
- README.md（日本語）
- tests/test_smoke.py
- 最小 CI（GitHub Actions: uv sync / ruff / basedpyright / pytest）
```

### 5.2 オプション層（研究内容に応じて opt-in）

コアを汚さずに足せる拡張。導入手順は `docs/agents/*.md` または `docs/optional/*.md` に記載し、既定では無効。

```text
[タスク管理]
- GSD（実装タスク分解・進捗管理）

[MCP]
- Serena MCP（セマンティックなコード理解・大規模リファクタリング）

[研究用ライブラリ（research extra）]
- numpy / scipy / matplotlib / pandas
- jupyter / jupytext / nbstripout / nbqa（notebook 管理）
- hydra-core / mlflow / dvc（実験管理）

[追加の開発ライブラリ（候補）]
- hypothesis / pydantic / pydantic-settings / rich / typer

[追加のセキュリティ・品質チェック]
- pip-audit / bandit（task security に分離、CI は任意）

[その他]
- pyenv 併用
- GitHub MCP の Docker 実行構成
```

レビュー観点: この**コア / オプションの線引きが妥当か**を特に見てほしい。コアに残しすぎ・オプションに送りすぎている項目がないか。

---

## 6. ルール階層

```text
AGENTS.md（主体・単一の正）
  ├─ CLAUDE.md は @AGENTS.md を参照する薄い層
  └─ docs/agents/{workflow,safety,mcp}.md に詳細を分割
        ↓ 恒常的な作業方針・安全規則・ツール利用方針

OpenSpec（コア）
        ↓ 何を・なぜ作るか＝機能仕様・変更仕様・受け入れ基準・設計判断

GSD（オプション）
        ↓ どの順で作るか＝実装タスク分解・進捗管理・中断復帰

Skills
        ↓ 特定作業の手順化・チェックリスト化・レビュー強化
```

### 6.1 AGENTS.md（主体）

`AGENTS.md` を全エージェント（Codex / Claude Code）共通の**単一の正**とする。作業方針の実体はここに集約する。CLAUDE.md・docs/agents は AGENTS.md と矛盾しない補助とする。詳細は §15。

### 6.2 CLAUDE.md（薄く）

`CLAUDE.md` は重複を避け、原則として以下だけを持つ。

```text
- 先頭で AGENTS.md を読み込む旨（@AGENTS.md）
- Claude Code 固有の補足（Subagents / grill-with-docs の使い方など数行）
```

AGENTS.md に書いた内容を CLAUDE.md に再掲しない。

### 6.3 docs/agents/（推奨 3 本）

```text
docs/agents/
├── workflow.md   # OpenSpec / GSD の責務境界と作業フロー、Skills 利用タイミング
├── safety.md     # 危険操作・secret・MCP write の扱い
└── mcp.md        # Context7 / GitHub（コア）/ Serena（オプション）の利用方針
```

初版の 9 分割（codex / claude-code / openspec / gsd / research / skills 等）は廃し、内容を上記 3 本に統合する。Codex / Claude-code 固有の差分は AGENTS.md / CLAUDE.md 本文に直接書く。必要が生じたら分割する。

---

## 7. OpenSpec と GSD の責務分離（重複防止）

初版の最大の懸念だった OpenSpec / GSD の重複を、責務境界を明文化することで解消する。`docs/agents/workflow.md` に以下を必ず記載する。

> 【改訂 / ADR-0003】初版の境界（OpenSpec=何を/なぜ、GSD=順序/進捗）は誤り。
> OpenSpec の change は `tasks.md`（実装チェックリスト）を標準内包し `/opsx:apply`
> がタスク分解・進捗マークまで担う。よって per-change のタスク所有は OpenSpec 側。
> GSD は横断ロードマップに限定して再定義する。

```text
OpenSpec（コア）= 「何を・なぜ」＋「単一 change 内のタスク」
- 機能仕様 / 変更仕様の記述
- 受け入れ基準（Acceptance Criteria）の定義
- 互換性・設計判断の記録
- 実装前の合意形成
- 単一 change 内の実装タスク分解・順序・進捗（tasks.md / /opsx:apply）
- 成果物: openspec/specs/*, openspec/changes/*（proposal/design/tasks/specs）

GSD（オプション）= 「複数 change を横断する上位管理」
- 複数 change にまたがるロードマップ / フェーズ順序
- マイルストーン管理
- セッション跨ぎの中断復帰
- 非責務: per-change のタスク分解（OpenSpec tasks.md が所有）
- 成果物: GSD の横断ロードマップ（tasks.md を二重化しない）

境界ルール（AGENTS.md にも明記）:
- 「何を作るか」の議論は必ず OpenSpec 側で確定させる
- per-change のタスク分解・進捗は OpenSpec tasks.md / /opsx:apply が担う
- GSD は openspec/changes/*/tasks.md を二重化せず、横断の順序付けのみ行う
- 受け入れ基準を GSD 側で新規に定義しない（OpenSpec を参照する）
- GSD 未導入時も per-change タスクは OpenSpec tasks.md で完結する。
  横断ロードマップが要るときのみ PR チェックリスト等で簡易代替する
```

レビュー観点【解決済 / Q5・ADR-0003】: per-change を OpenSpec が所有することで重複は消え、
GSD 未導入時もタスク管理は手薄にならない（OpenSpec tasks.md が担うため）。

---

## 8. 想定する AI コーディング構成

### 8.1 利用エージェント

Codex と Claude Code の併用を想定し、**両方をコア対応**とする。AGENTS.md を主体にすることで、どちらか一方だけでも最低限作業できる。

```text
Codex（コア対応）:
- 実装 / テスト追加 / 小さな修正 / リファクタリング
- AGENTS.md に基づく一貫した作業
- 設定: .codex/config.toml.template

Claude Code（コア対応）:
- 広めの設計検討 / 複数ファイルにまたがる変更
- MCP / Skills / Subagents を活用した複雑な作業
- grill-me / grill-with-docs による設計レビュー
- 設定: CLAUDE.md（薄く）/ .mcp.json.template
```

両者の役割は重なるため、テンプレート上はどちらでも最低限作業できることを保証する。

---

## 9. 導入したい Skills

### 9.1 コア Skills

```text
grill-me          # 設計・実装方針・PR 前のセルフレビュー
grill-with-docs   # ドキュメント込みの設計レビュー（本テンプレ自体にも使う）
tdd               # failing test 先行で実装暴走を防ぐ
diagnose          # bootstrap / uv sync / pre-commit / MCP 起動失敗の切り分け
caveman           # 過度な複雑化・不要な抽象化・テンプレ肥大化を止める
```

各 Skill の用途は初版 §7 と同じ。caveman と AGENTS.md の「最小変更」ルールが役割的に近いため、**caveman は「設計判断時に明示的に呼ぶ Skill」**、AGENTS.md は「常時適用される原則」と整理して重複を避ける（workflow.md に記載）。

### 9.2 Skills 管理方針

```text
- 配布方式は vendoring（同梱）を既定とする【Q2・ADR-0001】
  → 再現性最優先・オフライン動作・Use this template 直後から利用可
- 外部 Skills は自動で latest 更新しない
- skill 実体は .agents/skills/ を単一の正とする【Q1・ADR-0001】
  → Claude Code / Codex は同一 SKILL.md を参照（両者とも skill 機構あり）
  → .claude/skills は .agents/skills への symlink
  → .codex/skills の symlink 要否は Codex の repo スコープ解決を実機確認（PR2）
- 導入元と version/commit、再配布ライセンス可否を docs/agents/mcp.md
  または専用 lock に記録する（第三者 skill の同梱＝再配布のため）
- task skills:update で明示更新、task skills:doctor で存在確認
```

レビュー観点【解決済 / Q1・Q2・ADR-0001】: vendoring に確定。ディレクトリ重複は
.agents/skills を正・.claude/skills を symlink で解消。初版の「Codex に skill 機構なし」
という想定は誤りで、両エージェントが同一 SKILL.md を消費する。

---

## 10. 導入したい MCP

### 10.1 コア MCP

```text
Context7 MCP  # ライブラリ / CLI / SDK の最新ドキュメント確認
GitHub MCP    # Issue / PR / Actions / repo 情報の参照（read 中心）
```

- Context7 は **MCP のみ**を採用（Skill 版とは重複させない）。
  実行形態は **リモート HTTP**（`https://mcp.context7.com/mcp` ＋ `CONTEXT7_API_KEY`）を既定とし Node 非依存【Q7・ADR-0002】。
- GitHub MCP は **read-only を既定**とし、write 権限・toolset は最小に絞る。
- GitHub MCP の実行形態は **リモート HTTP read-only を既定**にする【Q4・ADR-0002】。
  `https://api.githubcopilot.com/mcp/x/all/readonly`（fine-grained read PAT を .env で供給）。
  → ローカルプロセス・Docker・npx いずれも不要。
  → Copilot エンタイトルメントを要する可能性があり、未契約環境はローカルバイナリ版
     （`github-mcp-server stdio --read-only --toolsets=...`）を fallback として docs に併記。
  → Docker 版・ローカル npx 版はオプション層へ置く。

### 10.2 オプション MCP

```text
Serena MCP  # セマンティックなコード理解・symbol 単位編集・大規模リファクタリング
            # 既存コードが育ってから / Notebook→src 移行時に opt-in
```

短い修正主体の初期段階では過剰なため、Serena はオプション層とする。

### 10.3 MCP 設定の配布

```text
配布（コミット可）: .mcp.json.template / .codex/config.toml.template / .env.example
生成（gitignore）: .mcp.json / .codex/config.toml / .env
```

`.mcp.json` をコミットするかは要検討（チーム共有したい設定なら可、個人 token / local path が混ざるなら template のみ）。

---

## 11. Python 開発環境

### 11.1 基本方針

```text
uv / pyproject.toml / uv.lock / .python-version
```

uv を中心にする。pyenv 併用はオプション層で説明する。

### 11.2 Python バージョン

```text
.python-version → 3.12
```

研究ライブラリ互換性のため 3.11 へ下げる余地は残すが、既定は 3.12。

### 11.3 依存（コア）

```text
[dev]
ruff
basedpyright
pytest
pytest-cov
pre-commit
```

basedpyright は **basic モードを既定**にする（研究コード/numpy/notebook で strict は警告過多になるため）。strict はプロジェクト側で opt-in。

### 11.4 依存（オプション extra）

```text
[research]  # 研究用。初期状態を重くしないため extra に分離
numpy / scipy / matplotlib / pandas
jupyter / jupytext / nbstripout / nbqa
hydra-core / mlflow / dvc

[dev-extra]  # 候補
hypothesis / pydantic / pydantic-settings / rich / typer
```

---

## 12. 品質チェック

`task check`（コア）:

```text
ruff format --check .
ruff check .
basedpyright
pytest
```

`task fix`:

```text
ruff format .
ruff check . --fix
```

pre-commit（コア・軽量フックのみ）:

```text
ruff format
ruff check
end-of-file-fixer
trailing-whitespace
check-yaml / check-toml / check-json
detect-private-key
```

`task security`（オプション・CI 任意）:

```text
pip-audit
bandit
gitleaks
```

`gitleaks` を pre-commit に常駐させるかは要検討（導入コストと誤検知）。最低限 `detect-private-key` はコア pre-commit に入れる。

---

## 13. タスクランナー（Taskfile）

人間にも AI にも同じコマンドを使わせる。Ubuntu 前提なので go-task のインストールは bootstrap が担う。

```text
[コア]
task setup       # 依存導入・hooks 設定
task check       # 品質チェック一式
task fix         # 自動修正
task test        # pytest
task lint        # ruff
task typecheck   # basedpyright
task hooks       # pre-commit install
task doctor      # 環境診断
task clean       # キャッシュ削除
task rename      # パッケージ改名（scripts/rename-package.py）

[オプション]
task security    # pip-audit / bandit
task skills:update / task skills:doctor
task mcp:setup
```

---

## 14. Bootstrap 方針（Ubuntu のみ）

対象を Ubuntu に限定したため、bootstrap は単純化する。`task` 未導入問題に対処するため、最初の 1 回だけスクリプトを直接実行する。

```bash
./scripts/bootstrap.sh
```

bootstrap.sh の責務:

```text
1. Ubuntu / 必須コマンドの有無を確認する
2. uv を導入する（未導入時）
3. Task (go-task) を導入する、または導入方法を表示する
4. Node.js / npm / npx の有無を確認する（任意・ハード依存にしない）【Q7・ADR-0002】
   - コア MCP はリモート HTTP、skills は vendoring のため Node 不要
   - Node が無くても bootstrap はブロックしない。doctor が WARN 表示し、
     ローカル/npx 版 MCP を opt-in する場合のみ Node を要求する
5. GitHub CLI (gh) の有無を確認する
6. task setup を実行する
```

bootstrap でやらないこと:

```text
- GitHub PAT を生成しない
- AI サービスへ自動ログインしない
- secret を保存しない
- OS 全体を大きく変更しない（sudo を要する変更は手順表示に留める）
- 失敗を握りつぶさない
- curl | sh で外部スクリプトを実行する場合は確認/選択式にする
```

初版にあった `bootstrap.ps1` / Windows・macOS 個別手順は作らない。WSL2 利用者は「WSL 上の Ubuntu で bootstrap.sh を実行」とだけ README に書く。

---

## 15. AGENTS.md に入れたい基本方針（主体）

```text
# Global Project Instructions

## Communication
- 返答は日本語で行う。
- 不確実な点は断定しない。
- 実行していない検証は未検証と明記する。

## General Engineering Rules
- 変更は必要最小限に留める。
- 無関係なリファクタリングを行わない。
- 単一ファイルの肥大化を避ける。命名は具体的にする。
- 既存の設計意図を尊重する。

## Agents
- Codex / Claude Code の両方がこのファイルを正とする。
- Claude Code 固有の補足のみ CLAUDE.md にある。

## Workflow（OpenSpec / GSD の境界 / ADR-0003）
- 「何を・なぜ作るか」は OpenSpec で確定する（仕様・受け入れ基準）。
- 単一 change 内のタスク分解・順序・進捗は OpenSpec tasks.md / /opsx:apply が担う。
- GSD（導入時のみ）は複数 change を横断するロードマップ・フェーズ順序・復帰のみを担い、
  openspec/changes/*/tasks.md を二重化しない。受け入れ基準も新規定義しない。
- GSD 未導入時も per-change タスクは OpenSpec tasks.md で完結する。
- 可能なら tdd skill でテストから始める。
- 設計が曖昧なら grill-me / grill-with-docs で確認する。
- 複雑化しそうなら caveman で単純化する。
- エラー調査では diagnose を使う。

## Tools
- 実装前に Context7 でライブラリ/CLI の最新仕様を確認する。
- GitHub MCP は read を基本とし、write 操作は事前確認する。
- Serena はオプション。大規模リファクタリング時のみ使う。

## Validation
- 変更後は対象に近いテストを実行する。
- 少なくとも task check の実行可否を確認する。
- 実行できなかったコマンドは理由を明記する。

## Safety
- 破壊的変更・大量削除・依存の大規模更新は事前確認する。
- secret / token / private key を出力・保存・コミットしない。
- .env はコミットしない。MCP の write 操作は慎重に扱う。
```

---

## 16. README に入れたい内容

```text
# ai-coding-template-ja

日本語で AI コーディングを行う Python 研究プロジェクト向けテンプレート（Ubuntu 対象）。

## 構成
- コア層: uv / ruff / basedpyright / pytest / pre-commit / Taskfile /
  AGENTS.md / OpenSpec / Skills / Context7・GitHub MCP / Codex・Claude Code
- オプション層: GSD / Serena MCP / research extra / notebook 管理 / 追加 CI

## このテンプレートから新規プロジェクトを作る
1. GitHub の "Use this template" で新規リポジトリを作成
2. ./scripts/bootstrap.sh
3. task rename   # パッケージ名を新プロジェクト名へ一括変更
4. task check / task doctor

## 2 回目以降
task setup / task check / task doctor

## 注意
- .env はコミットしない / GitHub token は自分で設定する
- MCP の初回承認は手動で行う / AI に危険操作を任せない
- WSL 利用時は WSL 上の Ubuntu で実行する
```

---

## 17. パッケージ改名（テンプレート負債の防止）

初版で抜けていた最大の実務問題。テンプレートからコピーした際、`src/ai_coding_template_ja/` と pyproject の名前を新プロジェクト名へ変える手段をコアで提供する。

```text
scripts/rename-package.py（task rename から実行）
- 入力: 新パッケージ名（例 my_research_project）
- 置換対象: src ディレクトリ名 / pyproject.toml の name と
  [tool.*] 参照 / import 文 / README 内の名称
- ドライラン（--dry-run）を既定で提供し、変更差分を表示してから適用
```

【Q3・解決済】rename スクリプト方式に確定。`__PACKAGE_NAME__` プレースホルダ方式は、
有効な Python 識別子でなくインストール不能なため §23.1「作成直後に task check が通る」と
衝突するので却下。既定名 `ai_coding_template_ja` が実体として動き、rename は衛生処理。
rename は置換後に `uv lock`（--no-upgrade）で root プロジェクト名のみ refresh する。

---

## 18. .gitignore（研究リポジトリ向け）

研究データ・実験結果・ツールキャッシュを初期から無視する。

```text
# Python / venv
__pycache__/
.venv/
*.egg-info/

# tooling cache
.ruff_cache/
.pytest_cache/
.serena/

# secrets / generated config
.env
.mcp.json
.codex/config.toml

# research data & results（.gitkeep で空ディレクトリのみ追跡）
data/*
!data/.gitkeep
results/*
!results/.gitkeep

# notebooks
.ipynb_checkpoints/
```

`.mcp.json` の扱い（コミット可否）は §10.3 の決定に合わせる。

---

## 19. 期待するディレクトリ構成

```text
ai-coding-template-ja/
├── AGENTS.md                 # 主体
├── CLAUDE.md                 # 薄く（@AGENTS.md）
├── README.md
├── LICENSE
├── pyproject.toml
├── uv.lock
├── .python-version           # 3.12
├── .env.example
├── .gitignore
├── .pre-commit-config.yaml
├── Taskfile.yml
├── .mcp.json.template
├── .codex/
│   └── config.toml.template
├── docs/
│   ├── agents/
│   │   ├── workflow.md       # OpenSpec/GSD 境界・フロー・Skills
│   │   ├── safety.md
│   │   └── mcp.md
│   ├── adr/                  # 設計判断の記録（0001-0003 作成済）
│   ├── optional/             # オプション層の導入手順（GSD/Serena/research 等）
│   └── grill/
│       └── ai-coding-template-ja.md
├── openspec/                 # コア（project.md ＋空 specs/changes のみ）【Q6】
│   ├── project.md            # 規約・技術選定
│   ├── specs/                # 空（コピー先が自分の能力仕様を書く）
│   └── changes/              # 空
├── .agents/
│   └── skills/
├── .claude/
│   └── skills/
├── scripts/
│   ├── bootstrap.sh          # Ubuntu のみ
│   ├── doctor.py
│   ├── rename-package.py     # task rename
│   ├── setup-skills.sh
│   └── setup-mcp.sh
├── src/
│   └── ai_coding_template_ja/
│       ├── __init__.py
│       └── py.typed
├── tests/
│   └── test_smoke.py
├── notebooks/                # オプション機能の置き場（README のみ）
│   └── README.md
├── configs/
│   └── README.md
├── data/
│   └── .gitkeep
└── results/
    └── .gitkeep
```

初版にあった `bootstrap.ps1` / `*.ps1` / `docs/setup/{windows,macos,linux}.md` は削除（Ubuntu 限定・docs 圧縮のため）。`docs/adr/` は本グリルで結晶化した判断（0001-0003）を記録するため復活。`openspec/specs/` の初期 spec（bootstrap/ai-agent-rules/python-environment）は規約であり capability spec でないため廃止（内容は AGENTS.md / project.md / docs へ）。

---

## 20. 環境診断（doctor.py）

`task doctor` から実行。診断結果は日本語表示。

```text
[コア診断]
- Python バージョン / uv / 仮想環境
- pyproject.toml / uv.lock
- ruff / basedpyright / pytest / pre-commit
- Node.js / npm / npx（任意・未導入は WARN。コアはリモート MCP で Node 不要）【Q7】
- Task / Git / gh
- リモート GitHub MCP の到達性 / Copilot エンタイトルメント（使えない環境を早期検知）【ADR-0002】
- .env の有無と必要 key 雛形
- .mcp.json / .codex/config.toml の生成状況
- Skills ディレクトリの存在
- パッケージ名がテンプレート既定 (ai_coding_template_ja) のままか
  → 警告（task rename の案内）

[オプション診断（導入時のみ）]
- Serena MCP / GSD / research extra / Docker
```

表示例:

```text
[OK]   uv が利用可能です
[WARN] .env が存在しません。.env.example をコピーしてください
[WARN] パッケージ名がテンプレート既定のままです。task rename を実行してください
[INFO] Serena MCP は未導入です（オプション）
```

---

## 21. CI 方針

GitHub Actions（コア・最小）:

```text
uv sync
ruff format --check .
ruff check .
basedpyright
pytest
```

オプション（別ワークフロー / 任意）:

```text
pre-commit run --all-files
pip-audit / bandit / gitleaks
```

初期 CI を重くしないため、security チェックは別ジョブに分離する。

---

## 22. セキュリティ方針

```text
- .env はコミットしない
- API key / token / private key を出力・保存・コミットしない
- bootstrap で secret を生成・保存しない
- GitHub MCP の権限は read を既定・toolset を最小化
- MCP server の write 操作はデフォルトで慎重に扱う
- 外部 Skill を無制限に自動導入しない（導入元を固定・記録）
- curl | sh で外部スクリプトを実行する場合は確認/選択式
- sudo / 管理者権限が必要な操作は明示する
```

---

## 23. 受け入れ条件（3 段階）【Q9 で 2 段階から再分割】

外部疎通検証が要る統合（skills symlink・リモート MCP・Copilot）を skeleton と分離し、
PR1 を「機械コアのみ・作成直後 green ＋ rename 可」に絞る。

### 23.1 PR1 完成（skeleton: 機械コア）

```text
- README に「Use this template→bootstrap→rename→check」導線がある
- pyproject.toml / uv.lock / .python-version / Taskfile.yml が存在する
- .pre-commit-config.yaml（軽・detect-private-key）/ .gitignore / .env.example / LICENSE
- scripts/bootstrap.sh / doctor.py（コア診断）/ rename-package.py が存在する
- tests/test_smoke.py が存在する
- task setup / task check / task doctor / task rename が実行できる
- 最小 CI が緑になる
- secret がコミットされていない
```

### 23.2 PR2 完成（エージェント統合・なおコア）

```text
- AGENTS.md が存在し、OpenSpec/GSD 境界（ADR-0003）が明記されている
- CLAUDE.md が @AGENTS.md を参照する薄い構成になっている
- docs/agents/{workflow,safety,mcp}.md が存在する
- openspec/ = project.md ＋空 specs/changes が存在する
- コア Skills が vendoring され .agents/skills 正・.claude/skills symlink で利用可能
- .mcp.json.template / .codex/config.toml.template（リモート read-only）が存在する
- doctor が MCP / skills / Copilot エンタイトルメントを診断する
- CI security ジョブ（gitleaks）/ task security が利用できる
```

### 23.3 PR3+ 完成（オプション層）

```text
- GSD 導入手順が docs/optional にある
- Serena MCP がオプションとして導入できる
- research extra（numpy 等）/ notebook 管理が opt-in で導入できる
- GitHub MCP の Docker / ローカル npx 版が opt-in で導入できる
```

---

## 24. 実装順序（GSD 観点の参考）

```text
[コア / 第 1 PR]
1. repository skeleton（ディレクトリ + LICENSE + .gitignore）
2. pyproject.toml / uv 環境 / .python-version
3. Taskfile.yml（コアタスク）
4. pre-commit（軽量フック）
5. tests/test_smoke.py → task check 通過
6. AGENTS.md（主体）/ CLAUDE.md（薄く）
7. docs/agents/{workflow,safety,mcp}.md
8. scripts/bootstrap.sh（Ubuntu）/ doctor.py
9. scripts/rename-package.py（task rename）
10. README（新規作成導線）
11. 最小 CI

[コア続き / 同 PR or 第 2 PR]
12. OpenSpec 初期構成
13. コア Skills setup
14. Context7 / GitHub MCP template

[オプション / 後続 PR]
15. GSD / Serena / research extra / notebook / task security
```

---

## 25. grill-with-docs への依頼文

```text
このドキュメントは、研究用 Python プロジェクト向けの日本語 AI コーディング
テンプレート ai-coding-template-ja を作成するための設計資料（改訂版）です。
コア層 / オプション層の 2 層構造、AGENTS.md 主体、OpenSpec コア / GSD オプション、
Ubuntu 限定という決定を前提にしています。

あなたは厳しめの設計レビュアーとして、この構想を grill してください。
特に以下を重視してください。

1. コア / オプションの線引きは妥当か（コアに残しすぎ・送りすぎはないか）
2. OpenSpec(コア) と GSD(オプション) の責務境界(§7)で重複が本当に消えるか
3. AGENTS.md 主体 / CLAUDE.md 薄く / docs/agents 3 本で情報が不足しないか
4. Ubuntu 限定の bootstrap(§14) に破綻はないか
5. パッケージ改名(§17) と .gitignore(§18) の方針は十分か
6. Context7 / GitHub をコア・Serena をオプションとする MCP 構成は妥当か
7. セキュリティ上危険な点
8. 長期運用で負債になりそうな点 / 第 1 PR スコープから削るべき点 / 足りない点

出力形式:
- 総評 / 重大な懸念 / 中程度の懸念 / 軽微な懸念
- 削るべきもの / 追加すべきもの
- コア完成(第1PR)のスコープ案
- 受け入れ条件の修正案
- 実装前に決めるべき質問
```

---

## 26. 現時点の設計判断（確定）

```text
- 2 層構造（コア / オプション）を中心方針とする        [確定]
- Python 環境は uv 中心、pyenv は任意                  [確定]
- Taskfile を標準タスクランナーにする                  [確定]
- 対象 OS は Ubuntu のみ（bootstrap.sh のみ）           [確定]
- AGENTS.md を主体、CLAUDE.md は薄く参照               [確定]
- docs/agents は workflow/safety/mcp の 3 本           [確定]
- OpenSpec をコア、GSD をオプションにする              [確定]
- Skills（grill-me/grill-with-docs/tdd/diagnose/caveman）はコア [確定]
- Context7 / GitHub MCP はコア、Serena はオプション     [確定]
- Codex / Claude Code は両方コア対応                    [確定]
- basedpyright は basic モード既定                      [確定]
- パッケージ改名スクリプトをコアに含める                [確定]
- data/ results/ 等を初期から .gitignore               [確定]
- LICENSE を含める                                     [確定]
- research 系ライブラリは research extra に分離         [確定]
- CI は最小をコア、security は分離                      [確定]
- Skill は vendoring・.agents/skills 正・.claude symlink [確定 Q1/Q2/ADR-0001]
- GitHub/Context7 MCP はリモート HTTP read-only 既定     [確定 Q4/Q7/ADR-0002]
- Node はコア非依存（doctor WARN・bootstrap 非ブロック）  [確定 Q7/ADR-0002]
- パッケージ改名は rename スクリプト方式                 [確定 Q3]
- OpenSpec が per-change tasks 所有・GSD は横断限定        [確定 Q5/ADR-0003]
- OpenSpec 初期は project.md ＋空 specs/changes           [確定 Q6]
- gitleaks は CI security＋task security（pre-commit 非常駐）[確定 Q8]
- 受け入れは PR1 機械コア / PR2 統合 / PR3 オプションの 3 段 [確定 Q9]
- 設計判断を docs/adr/0001-0003 に記録                    [確定]
```

---

## 27. 未決定事項（レビューで詰めたい）

```text
1. .mcp.json をコミットするか            → [解決] template のみ・実体 gitignore（§10.3/§18）
2. GitHub MCP の実行形態と権限           → [解決 Q4/ADR-0002] リモート HTTP read-only 既定
3. Skills の管理方式                      → [解決 Q2/ADR-0001] vendoring
4. skill ディレクトリ重複の同期           → [解決 Q1/ADR-0001] .agents/skills 正・.claude symlink
5. OpenSpec 初期 specs の作り込み         → [解決 Q6] project.md ＋空 specs/changes
6. パッケージ改名方式                      → [解決 Q3] rename スクリプト
7. gitleaks の配置                        → [解決 Q8] CI security＋task security
8. uv.lock をテンプレに含めるか           → [解決] 同梱・rename が uv lock で refresh
9. research extra の最終ライブラリ        → [保留] オプション層構築時に確定（PR3）
10. GSD オプション時のタスク管理代替       → [解決 Q5/ADR-0003] OpenSpec tasks.md が per-change を担う

[PR2 実装時の検証タスク（設計フォークでない）]
- .codex/skills の symlink 要否を Codex の repo スコープ解決で実機確認
- doctor の Copilot エンタイトルメント検出の実装
```

---

## 28. 期待する最終成果物

> 【改訂 / Q9・§23】PR1 は機械コアのみ。エージェント統合（AGENTS/OpenSpec/Skills/MCP）は PR2。

```text
[PR1（機械コア・作成直後 green ＋ rename）]
1. GitHub template repository として使える ai-coding-template-ja
2. 日本語 README（新規作成→bootstrap→rename 導線）
3. uv による Python 開発環境（basedpyright basic）
4. ruff / basedpyright / pytest / pre-commit（軽）/ Taskfile
5. bootstrap.sh（Ubuntu）/ doctor.py（コア診断）/ rename-package.py
6. 最小 CI

[PR2（エージェント統合・なおコア）]
7. AGENTS.md 主体 + 薄い CLAUDE.md + docs/agents 3 本
8. OpenSpec 初期構成（project.md ＋空 specs/changes）
9. コア Skills（vendoring・.agents/skills 正・.claude symlink）導入スクリプト
10. Context7 / GitHub MCP のリモート read-only 設定テンプレート（Codex / Claude Code 両対応）
11. doctor の MCP・skills・Copilot 拡張 / CI security ジョブ

[PR3+（オプション）]
12. GSD / Serena MCP / research extra / notebook 管理 / task security
```

---

## 29. 最後に

このテンプレートでは「AI にたくさん権限を与えること」ではなく、「**AI が安全に迷わず作業できる境界線を作ること**」を重視する。さらに改訂版では「**コアを最小に保ち、研究内容に応じて安全に拡張できること**」を中心に据えた。

レビューでは便利さだけでなく、以下を重視してほしい。

```text
- 再現性 / 安全性 / 単純さ / 最小コア
- コア・オプションの線引きの妥当性
- OpenSpec / GSD の責務分離の有効性
- 研究プロジェクトへの適用しやすさ（特にパッケージ改名）
- 中断後の復帰しやすさ / 仕様と実装の対応関係
- 人間が後から読んで理解できること
```