# Change: dependabot に pre-commit ecosystem を追加（backlog #16 消化）

## Why

.pre-commit-config.yaml の `pre-commit-hooks` repo は tag pin（v5.0.0）で、dependabot の
監視対象外（github-actions ecosystem のみ）。この非対称は prepare-v1-release（PR #24）で
意図的と記録したが、dependabot は pre-commit ecosystem に対応済み（2026-03 GitHub
Changelog・PR #24 の Codex R1 で事実確認済み）のため、ecosystem を 1 エントリ追加する
だけで rev 更新 PR が自動化される。監視の空白を安く埋められる判断材料が揃っている
（PR #24 proposal Non-goals で「記録消化スコープを超える」として見送り→本 change で消化）。

## What Changes

1. **.github/dependabot.yml に pre-commit ecosystem エントリを追加**: `directory: "/"` ・
   weekly（github-actions と同スケジュール）。ヘッダコメントの「対象は github-actions
   ecosystem のみ」を実態へ更新する（Python 依存を pip / uv ecosystem で扱わない方針は
   不変）。
2. **.pre-commit-config.yaml の非対称コメント更新**: 「dependabot 監視外」の記述が false に
   なるため、tag pin 自体は維持しつつ（pre-commit 慣行・`pre-commit autoupdate` が機能）、
   dependabot が rev 更新 PR を自動生成する旨へ書き換える。

## 検証方針

- ecosystem 名（`"pre-commit"`）と設定の有効性は、マージ後の dependabot 実行でしか
  最終確認できない（add-dependabot / PR #13 と同じ流儀）。マージ後に
  Insights → Dependency graph → Dependabot で pre-commit エントリの認識を実機確認する。
  それまでは**未検証**。
- 生成される rev 更新 PR の妥当性は通常の CI ゲート（check ほか）が検出する。

## Non-goals / スコープ外（spec-holes フェーズ 1 反映）

- **`repo: local` エントリ**（ruff）: rev を持たないため dependabot の更新対象外
  （version 源は uv.lock 単一化の既存設計のまま）。
- **pip / uv ecosystem の追加**: Python 依存は uv.lock ＋ pip-audit の既存方針
  （add-dependabot proposal Non-goals）を維持する。
- **tag pin → SHA pin への変更**: pre-commit の慣行（autoupdate 互換）を維持する。
  低リスク面の判断（CI 非実行・secrets 非曝露）も PR #24 の記録から不変。
