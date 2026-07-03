# dependabot による GitHub Actions SHA ピン更新の自動化

## Why

CI の action は供給網対策で SHA ピンしている（[.github/workflows/ci.yml](../../../.github/workflows/ci.yml)
冒頭コメント）が、更新手段が完全手動で、ピンが古くなっても気づく仕組みがない。
`.github/dependabot.yml` を 1 枚置けば、新版検出時に SHA とタグ併記コメントを更新する
PR が自動で立つ。コスト最小・効果大のバックログ最有力（テンプレ改善バックログ 1）。

## What Changes

- `.github/dependabot.yml` を新規作成する:
  - `package-ecosystem: "github-actions"` / `directory: "/"` / `schedule.interval: "weekly"`。
  - 対象は `.github/workflows/` 配下の全 workflow（ci.yml / extras-smoke.yml）。
- 既存ファイル・CI ジョブ・Taskfile の変更はない。

## 設計判断

1. **対象は github-actions ecosystem のみ**。Python 依存は uv.lock ＋ pip-audit ゲート
   （task security / CI audit）で管理しており、更新は意図を持った手動操作とする既存方針を
   変えない。
2. **weekly・効果は version updates に限定**（codex レビュー反映）。テンプレートは変更
   頻度が低く daily はノイズ。本 change が保証するのは weekly の version update PR のみ。
   security advisory 起点の即時 PR（Dependabot security updates）は GitHub 側のリポジトリ
   設定（Dependabot alerts / security updates の有効化）に依存し dependabot.yml では制御
   できないため、本 change の効果に含めない。有効化は各リポジトリの GitHub 設定で行う
   （テンプレートからは強制できない）。
3. **SHA ピンとの整合**。dependabot は SHA ピン＋タグ併記コメント（`# v4.2.2` 形式）を
   認識し、両方を更新する。既存のピン規律はそのまま維持される。
4. **extras-smoke の検証線**（codex レビュー反映）。extras-smoke.yml は workflow_dispatch
   専用のため dependabot PR の CI では実行されない。ただし使用 action はコア CI と同一
   SHA ピン（extras-smoke.yml 冒頭コメントの既存方針）で、dependabot は同一 action の
   参照を一括更新するのが既定の挙動のため、新 SHA は ci.yml 側の PR CI で検証される。
   github-actions ecosystem はファイル単位のスコープ指定ができず対象限定は不可。残余
   リスクは extras-smoke 固有の action を将来追加した場合のみで、その際は dependabot
   PR 上で extras-smoke を手動 dispatch して確認する。

## 受け入れ基準

- [ ] `.github/dependabot.yml` が存在し、github-actions ecosystem / weekly を定義している。
- [ ] pre-commit の check-yaml を通過する。
- [ ] `task check` が green（既存ゲートに影響しないことの確認）。
- [ ] `openspec validate add-dependabot` が green。
- [ ] GitHub 上での dependabot PR 生成は本 change では**未検証**と明記する
      （push 後に GitHub 側で動作するため、ローカルでは検証不能。マージ後の初回実行で確認）。

## Non-goals

- pip / uv ecosystem の dependabot 追加（uv.lock ＋ pip-audit の既存方針を維持）。
- pre-commit-hooks の tag ピン → SHA ピン化（バックログ 2。dependabot は pre-commit を
  サポートしないため別解が要る。別 change）。
- 自動マージ設定。
