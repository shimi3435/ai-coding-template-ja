# `task skills:update` の非 symlink 保護と GitHub MCP PAT 案内の是正

## Why

2026-07-12 の Codex adversarial-review（プロジェクト全体 focus・verdict: needs-attention）の
指摘 2 件を修正する。同一レビュー由来のため 1 change に束ねる（spec delta 2 本）。

- **A1 [high]**: `scripts/setup-skills.sh`（`task skills:update`）は、リンク先パス
  （`.claude/skills/<name>` / `.codex/skills/<name>`）の既存実体が期待 symlink でない場合
  （ユーザーの実ディレクトリ・手動配置 skill 等）にも `rm -rf` で削除する。ローカル成果物を
  不可逆に削除しうる。AGENTS.md Safety（破壊的変更・大量削除は事前確認）と矛盾。
- **A2 [medium]**: `docs/agents/mcp.md` の Codex 向け GitHub MCP 手順が
  `.codex/config.toml` への `GITHUB_PERSONAL_ACCESS_TOKEN = "..."` 直書きを案内しており、
  直前の共通方針（PAT は環境変数で渡す・直書きしない）と docs/agents/safety.md
  （token を出力・保存・コミットしない）に矛盾する。

## What Changes

- **scripts/setup-skills.sh**: preflight で非 symlink 衝突を全件検出し、1 件でもあれば
  一切のファイルシステム変更を行わず、全衝突パスと復旧手順を表示して非ゼロ終了する。
  置換のための削除は symlink の unlink（`rm`）に限定し `rm -rf` を廃止する。
- **tests/test_setup_skills.py**（新規）: 保護（実ディレクトリ・通常ファイル・複数衝突・
  部分変更なし）と置換（壊れた symlink・誤った先の symlink・冪等）の例示テスト。
  tmp 配下にリポジトリ構造を複製して subprocess でスクリプトを実行する（ネットワーク不使用）。
- **docs/agents/mcp.md**: Codex 向け PAT 直書き案内（78-81 行付近）を撤去し、
  `env_vars`（親環境からの名前指定 forward）による手順へ書き換える。

## 設計判断

1. **実ディレクトリを置換する明示フラグ（`--force` 等）は実装しない**。フラグは
   データ損失経路の再導入であり、退避はユーザーの `mv` 一発で安全に行える（最小変更）。
   エラーメッセージに退避／削除→再実行の復旧手順を表示する。
2. **preflight 方式（検査と変更の 2 パス）**。衝突が 1 件でもあれば他 root の壊れた
   symlink 修復も含め一切変更しない。処理順による部分実行状態を残さない。
3. **A2 は Codex の `env_vars` forward へ書き換える**。Codex は MCP server の子プロセス環境を
   最小集合（PATH 等）＋ `env_vars` で名前指定した親環境変数＋ `env` の literal に限定する
   （上流 codex-rs `rmcp-client/src/utils.rs` の `create_env_for_mcp_server` で確認）。
   `env_vars` フィールドは rust-v0.142.5 タグに存在し、ローカル codex-cli 0.142.5 でも
   利用可能。PAT の保存手順は残さない（env_vars で保存自体が不要になるため）。PAT 自体は
   read-only fine-grained・短い有効期限を推奨として 1 行明記する。

## spec-holes フェーズ 1 結果

### R1: 非 symlink 実体の保護

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | リンク先パスに何も無い場合 | 1: 新規作成（既存挙動維持）を明記 |
| 2 | 境界値 | 該当 | 衝突 1 件 vs 複数件 | 1: 全件列挙後に非ゼロ終了と明記 |
| 3 | 重複・衝突 | 該当 | vendored 名とユーザー実体の名前衝突・片 root のみ衝突 | 1: 衝突時は一切変更しない（部分変更なし）と明記 |
| 4 | 順序 | 非該当 | —（preflight 方式で処理順が結果に影響しない） | — |
| 5 | 型・形式不正 | 該当 | dir / file 以外の非 symlink 実体（fifo 等） | 1: 「symlink 以外の実体すべて」を保護対象と明記 |
| 6 | エラー経路 | 該当 | エラー終了時の部分変更 | 1: preflight＝変更ゼロで非ゼロ終了と明記。`ln` 自体の失敗（権限）は 2: スコープ外（従来同様 `set -e`） |
| 7 | 冪等性・再実行 | 該当 | エラー後再実行・退避後再実行 | 1: 状態不変なら同じ結果／退避後は正常生成を scenario 化 |
| 8 | 時刻 | 非該当 | — | — |
| 9 | 文字列 | 非該当 | —（skill 名は quote 済み・lock 管理の ASCII slug） | — |
| 10 | 数値 | 非該当 | — | — |
| 11 | 巨大入力 | 非該当 | —（skill 数十件規模） | — |
| 12 | 状態遷移 | 該当 | link root（`.claude/skills` 自体）が非 dir | 2: スコープ外と明記（保護対象は per-skill エントリ・root 異常は `mkdir -p` の失敗に委ねる） |

### R2: 置換削除の unlink 限定

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 3 | 重複・衝突 | 該当 | R1 と同一（衝突時変更なし） | 1: R1 で明記 |
| 5 | 型・形式不正 | 該当 | broken / wrong-target / correct symlink の 3 分類・wrong-target が実 dir を指すケース | 1: unlink は link のみ削除・指し先無傷と明記 |
| 7 | 冪等性・再実行 | 該当 | correct symlink での再実行 | 1: 変更なし exit 0 を scenario 化 |
| 12 | 状態遷移 | 該当 | symlink chain（symlink→symlink→dir） | 1: readlink 第一段の文字列比較・unlink は対象パスのみ削除、に内包 |
| 他 | 1/2/4/6/8-11 | 非該当 | —（R1 側で判断済みまたは入力が存在しない） | — |

### R3: PAT 平文保存を案内しない（docs）

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 5 | 型・形式不正 | 該当 | `env_vars` 未対応の旧 codex | 1: 確認済みバージョン（codex-cli 0.142.5）を docs に明記 |
| 6 | エラー経路 | 該当 | 環境変数未設定のまま MCP 起動 | 1: 起動シェルで export（`gh auth token` 等）する手順を明記 |
| 7 | 冪等性・再実行 | 該当 | `task mcp:setup` 再生成でエントリ消失 | 1: 既存の注意書きを維持 |
| 他 | 1-4/8-12 | 非該当 | —（docs 変更・実行系入力なし） | — |
