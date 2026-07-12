# vendored skill 3 件の上流取り込み（caveman / grilling / tdd）

## Why

2026-07-12 のプロジェクト全体レビュー残件 B 群のうち B2。`task skills:upstream` が
caveman / grilling / tdd の 3 件に WARN（上流で skill 本体が更新済み）を出しており、
前セッションで 3 件とも diff レビュー済み・取り込み承認済み。B3（取り込み手順）と B1
（軽微変更基準）を明文化した PR #33 が main に merge されたため、その手順の初回 dogfood
として実処理する。

- 検知（`task skills:upstream` の WARN 3 件）はあるが、実体・lock が古いまま。
- 下流に複製されるテンプレートのため vendored skill の鮮度は品質そのもの。
- 3 件とも同一レビュー由来・同一手順（byte-match 反映＋lock 更新＋doctor green）のため
  1 change に束ねる（lock は skill ごとに更新する）。

## What Changes

`docs/agents/workflow.md` Skills 節「上流取り込み手順」に従い、実体を上流実体で
byte-match 反映し、`skills.lock.json` の該当 3 エントリの `commit` / `sha256` を更新する。
手で編集しない（pre-commit は `.agents/skills` を整形対象外にしている）。

取り込み先はいずれも 2026-07-13 時点の上流既定ブランチ HEAD（着手時に
`task skills:upstream` を再実行し WARN 継続と HEAD を再確認・moving HEAD 回避）:

| skill | repo | commit（現行 → 取り込み先） |
| --- | --- | --- |
| caveman | JuliusBrussee/caveman | `655b7d9c…` → `0d95a81d35a9f2d123a5e9430d1cfc43d55f1bb0` |
| grilling | mattpocock/skills | `bc4cf903…` → `391a2701dd948f94f56a39f7533f8eea9a859c87` |
| tdd | mattpocock/skills | `43ea0884…` → `391a2701dd948f94f56a39f7533f8eea9a859c87` |

- **caveman**（SKILL.md + README.md 更新）: トークン削減主張を「65%（実測）」に是正、
  ルール強化（造語略語・矢印・ツール実況の禁止）、「ユーザ言語を保持」ルール新設、
  自己言及禁止。機能上の破壊なし。
- **grilling**（SKILL.md のみ・小差分）: 「事実は codebase 参照・決定はユーザに問う」の
  分離明確化、「共有理解の確認までプランを実行しない」1 行追加。
- **tdd**（SKILL.md 更新 + `refactoring.md` 削除）: 大幅簡素化（seam 概念導入・
  anti-patterns 集約）。上流から `refactoring.md` が削除されたため
  `git rm .agents/skills/tdd/refactoring.md` を行う（vendored 5 → 4 ファイル）。
  `mocking.md` / `tests.md` は上流無変更のため据え置き。

新 SKILL.md の sha256（実測・lock に記録する値）:
- caveman: `5e30bb56afbd0b01bd736f2da84180e76f18db4a64de8e124525d5c8dc2e8605`
- grilling: `5a35925d03a391bcfa46940868b649b72dba89ec9c19525e785bbb6bd3a7f478`
- tdd: `5363bb2775679fe9311fbb67947f95359169c6e7f1fac77c0f25e190bca6cf2f`

## 設計判断

1. **上流どおり byte-match で取り込む（改変しない）**。新 tdd SKILL.md は
   「Refactoring is not part of the loop … see the `code-review` skill」と記述するが、
   Codex 側の skill 機構には同名 `code-review` skill が無く、この参照は環境依存になる
   （Claude Code 側には `code-review` skill がある）。既知の環境依存として記録するに
   留め、上流実体は改変しない（手改変は再現性と byte-match ゲートを壊す）。
2. **3 件を 1 change に束ねる**。同一レビュー由来・同一手順・共通目的（検知→対応の
   完結）。分割コスト > 利益。lock は skill ごとに独立更新する。
3. **完了判定は `task skills:doctor` green**（sha256 整合・孤児なし・symlink 解決）。
   `task skills:upstream` の再実行での WARN 消失は帰結だが、上流がさらに進めば WARN が
   正当に残りうるため完了判定には使わない（workflow.md 手順どおり）。

## spec-holes フェーズ 1 結果

R1 = 3 skill を上流 HEAD 実体で byte-match 反映し lock（commit / sha256）を skill ごとに
更新、doctor green で完了。「明記」= proposal / spec delta に明記して潰す。「外」=
スコープ外と判断。

| # | 分類 | R1 |
| --- | --- | --- |
| 1 | 空・ゼロ長・None | 明記: WARN が INFO/OK に落ちた skill は取り込み対象外（本 change は WARN 3 件のみ） |
| 2 | 境界値 | 明記: 完了判定は doctor green（SKILL.md の sha256 が実体と lock で一致） |
| 3 | 重複・衝突 | 明記: grilling / tdd は同一 repo・同一 commit だが lock エントリは独立更新（sha256 は各 SKILL.md 個別） |
| 4 | 順序 | 明記: 実体更新（＋refactoring.md 削除）→ lock の commit/sha256 更新 → doctor の順 |
| 5 | 型・形式不正 | 明記: SKILL.md 以外の付随ファイル（README/mocking/tests）は sha256 ゲート対象外だが byte-match 方針で反映（README は更新・mocking/tests は上流無変更で据え置き） |
| 6 | エラー経路 | 明記: doctor red の間は取り込み未完として lock/実体を修正して再実行 |
| 7 | 冪等性・再実行 | 明記: 着手時に skills:upstream を再実行し HEAD 再確認（moving HEAD 回避）。再取り込みしても同 commit なら実体・sha256 は不変 |
| 8 | 時刻 | 明記: HEAD は 2026-07-13 時点で pin（以降の上流進行は本 change 対象外） |
| 9 | 文字列 | 外: skill 名は lock 管理の ASCII slug（新規追加なし） |
| 10 | 数値 | —（該当なし） |
| 11 | 巨大入力 | —（3 skill・小ファイル） |
| 12 | 状態遷移 | 明記: tdd は 5 → 4 ファイル（refactoring.md 削除）。孤児検査（test_skills_lock）は allowed エントリ ⇔ ディレクトリの一対一のみを見るため、ファイル単位削除は lock 変更不要で doctor に影響しない |

フェーズ 2（テスト対応付け）: 実体・lock の整合は既存の `tests/test_skills_lock.py`
（SKILL.md の sha256・孤児・symlink 解決のハードゲート）が担保する。新規テストは不要。
backstop は self-review（実体・lock・proposal の突き合わせ）。
