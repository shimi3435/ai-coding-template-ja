# テンプレート更新は下流へ自動伝播せず version スタンプ＋手動手順に留める

「Use this template」で作成した下流リポジトリは履歴が切れた fork であり、作成時点のスナップショットになる。テンプレ側を後で改善（bootstrap 修正・新 ADR・skill 更新）しても、既存の下流リポジトリへ自動で伝播する手段は持たない。これをコアの**非目的**として明示し、代わりに最小限の追跡手段だけ提供する。

- ルートに `TEMPLATE_VERSION`（テンプレ由来版スタンプ）を置く。
- `task doctor` が「このリポジトリは template vX.Y 由来」を **INFO** 表示する（green を壊さない）。
- 下流が必要なときだけ手動で該当 PR を cherry-pick できるよう、手順を `docs/optional/template-update.md` に 1 枚で置く。

## Considered Options

- **upstream remote ＋ merge 方式**（`git remote add template` → `git merge`）: 強力だが、`task rename` でパッケージ名を全置換した後はコンフリクトが大量化し、研究者向けには重い。却下。
- **何もしない（version スタンプも持たない）**: 最小だが、下流が自分の由来版を知る手段が無く、§1 / §29 の「将来コピー時に負債化」懸念に応えられない。却下。

## Consequences

- 完全自動の更新伝播は「最小実用コア」を超えるため提供しない。下流の更新は手動 cherry-pick が前提。
- `TEMPLATE_VERSION` の更新規律（テンプレ側が変更時にバンプ）が要る。リリース手順に含める。
- rename との相互作用: version スタンプは rename 置換対象に含めない（テンプレ由来を示すメタ情報のため）。
