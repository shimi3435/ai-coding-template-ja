# change ふりかえりログ（テンプレート自身の運用）

change close 時に 1 行ずつ追記する軽量ふりかえりの記録先。規約と形式の定義
（「逃した欠陥」の定義・発見経路 4 分類・更新規則）は
[docs/agents/workflow.md](../agents/workflow.md) の
「change close 時の軽量ふりかえり」節が owner（ここに二重化しない）。

1 change = 1 行。マージ後の発見は該当行を更新する（新行を足さない）。

## エントリ

- 2026-07-11 add-change-retrospective-rule（PR #30）: 逃した欠陥 2 件（self-review=1 / review=1 / CI=0 / merge後=0）— self-review=spec-holes H10 の本文未記載を検出、review=Codex P3（prune 後のリンク切れ・境界判断で計上）
- 2026-07-11 add-skills-upstream-check（PR #31）: 逃した欠陥 4 件（self-review=1 / review=3 / CI=0 / merge後=0）— self-review=未知 source_type の spec/実装不整合、review=Codex P2×3（単一 skill repo 直下の見逃し・オフラインで前提チェック hard fail・rename 元パスの見逃し）
- 2026-07-12 harden-skills-update-and-pat-docs（PR #32）: 逃した欠陥 0 件（self-review=0 / review=0 / CI=0 / merge後=0）— Codex adversarial-review approve・material findings なし
- 2026-07-13 document-ops-loop-criteria（PR #33）: 逃した欠陥 1 件（self-review=1 / review=0 / CI=0 / merge後=0）— self-review=proposal spec-holes 表 R2#7 の明記主張と spec delta の不一致（境界判断で計上）・Codex 指摘なし
- 2026-07-13 import-skills-upstream（PR #34）: 逃した欠陥 0 件（self-review=0 / review=0 / CI=0 / merge後=0）— B3 手順の初回 dogfood（caveman/grilling/tdd を byte-match 取り込み）・self-review は correctness/spec 欠陥なし（tasks.md チェックは通常の完了マーク）・Codex approve（actionable なし）
- 2026-07-13 vendor-code-review-skill（PR #36）: 逃した欠陥 0 件（self-review=0 / review=0 / CI=0 / merge後=0）— Issue #35 対応で上流兄弟 code-review を byte-match 取り込み（tdd:36 の Codex 行き止まり解消）・Codex P2（Spec 軸の spec 自動探索が OpenSpec レイアウト非対応）は byte-match 固有の制約として受容・記録（コード修正不要のため欠陥計上せず・回避は spec 引数の明示）
- 2026-07-13 fix-rename-and-additive-extras（PR #38）: 逃した欠陥 1 件（self-review=1 / review=0 / CI=0 / merge後=0）— rename-smoke 後に新規回帰テスト自身が書き換わる問題を実動作確認で検出
