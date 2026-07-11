# change ふりかえりログ（テンプレート自身の運用）

change close 時に 1 行ずつ追記する軽量ふりかえりの記録先。規約と形式の定義
（「逃した欠陥」の定義・発見経路 4 分類・更新規則）は
[docs/agents/workflow.md](../agents/workflow.md) の
「change close 時の軽量ふりかえり」節が owner（ここに二重化しない）。

1 change = 1 行。マージ後の発見は該当行を更新する（新行を足さない）。

## エントリ

- 2026-07-11 add-change-retrospective-rule（PR #30）: 逃した欠陥 2 件（self-review=1 / review=1 / CI=0 / merge後=0）— self-review=spec-holes H10 の本文未記載を検出、review=Codex P3（prune 後のリンク切れ・境界判断で計上）
- 2026-07-11 add-skills-upstream-check（PR #31）: 逃した欠陥 4 件（self-review=1 / review=3 / CI=0 / merge後=0）— self-review=未知 source_type の spec/実装不整合、review=Codex P2×3（単一 skill repo 直下の見逃し・オフラインで前提チェック hard fail・rename 元パスの見逃し）
