# `code-review` skill の下流 vendoring（Issue #35）

## Why

PR #34（change `import-skills-upstream`）で vendored `tdd` skill を上流 HEAD
（mattpocock/skills `391a2701`）へ byte-match 取り込みした結果、新 `SKILL.md` の
リファクタ段階の導線が sibling skill 参照に変わった:

> `.agents/skills/tdd/SKILL.md:36`
> **Refactoring is not part of the loop.** It belongs to the review stage
> (see the `code-review` skill) …

`code-review` は **Claude Code のビルトイン skill** としては存在するが、**Codex 側の
skill 機構には同名 skill が無い**。vendored（`.agents/skills/`）にも `skills.lock.json`
にも `code-review` は無い。そのため Codex で red→green→refactor を回して refactor/review
段階へ進むと、`SKILL.md:36` の参照先が解決できず行き止まりになる（旧 `refactoring.md` の
代替導線も上流削除に追随して消えている）。この環境依存は Issue #35 として PR #34 から
分離済み。本 change はその恒久対応。

- 下流に複製されるテンプレートのため、両エージェント（Claude Code / Codex）で skill 参照が
  等しく解決することは品質そのもの。
- 参照元 `tdd/SKILL.md:36` は上流実体で、手改変は byte-match と sha256 ハードゲートを壊す。
  よって参照元は据え置き、**参照先を供給する**下流 vendoring で解く。

Issue: https://github.com/shimi3435/ai-coding-template-ja/issues/35

## What Changes

`docs/agents/workflow.md` Skills 節「上流取り込み手順」に準拠し、upstream `code-review`
skill 実体を byte-match で新規 vendoring し、`skills.lock.json` にエントリを追加する。

| 項目 | 値 |
| --- | --- |
| skill 名 | `code-review`（固定・`tdd:36` の literal 参照文字列に一致させる） |
| 供給元 | mattpocock/skills（`skills/engineering/code-review/SKILL.md`） |
| commit | `391a2701dd948f94f56a39f7533f8eea9a859c87`（vendored `tdd` と同一 commit・sibling byte 一致） |
| SKILL.md sha256 | `6a65cc61114f96db07ec41e3920e67c9c5bf70dd6e0901eb9460ebcb2bdc209f`（6740 bytes・実測） |
| LICENSE | MIT（mattpocock/skills ルート `LICENSE`・vendored `grill-me/LICENSE` と byte 一致） |

- `.agents/skills/code-review/SKILL.md`（上流実体を byte-match）と
  `.agents/skills/code-review/LICENSE`（MIT）を追加する。
- `skills.lock.json` に `code-review` エントリを追加する（source_type=github・
  redistribution=allowed）。
- `task skills:update` で `.claude/skills/code-review` / `.codex/skills/code-review`
  symlink を生成し、両エージェントで参照が解決するようにする。
- `tdd/SKILL.md:36` は**据え置き**（byte-match 維持・sha256 不変・編集しない）。

## 設計判断（Issue #35 で確定済み・再検討しない）

1. **対応方針 = 上流 `code-review` skill の下流 vendoring**（Issue #35 候補 3）。上流
   mattpocock/skills は健全で `skills/engineering/code-review/SKILL.md` を実際に持つため、
   「上流へ還元」（候補 2）は不成立。欠落は下流が sibling skill を取り込んでいないことに
   起因するので、下流 vendoring が正しい解。
2. **vendored skill 名は `code-review` 固定**。`tdd:36` の参照は literal 文字列であり、
   別名にすると Codex で解決しない。この名前は Claude Code のビルトイン `code-review` と
   名前衝突するが、これは**受容する**: 両者は機能的に重複（どちらも diff をレビュー）し、
   tdd 著者が意図した referent は mattpocock の `code-review` であり意味的にも正しい。
   ハードゲート `tests/test_skills_lock.py` はビルトイン名との衝突を検査しないため、
   ゲートは壊れない。
3. **pin commit = `391a2701`**（vendored `tdd` と同一）。sibling を byte 一致に保つ。
4. **`tdd/SKILL.md:36` は改変しない**。byte-match を保ち sha256 を不変に保つ。tdd は
   触らない。
5. **既知の限界（受容）**: vendored `code-review/SKILL.md` は自身の soft dependency として
   `docs/agents/issue-tracker.md` と `/setup-matt-pocock-skills` を参照するが、本リポジトリ
   には両者とも存在しない。byte-match 規律のもとで**そのまま**取り込む（Spec 軸は graceful
   に劣化し hard-stop しない）。`issue-tracker.md` を新規作成しない（スコープ膨張であり
   mattpocock 固有の成果物のため）。

## spec-holes フェーズ 1 結果

R1 = upstream `code-review` を byte-match で新規 vendoring し lock エントリを追加、
`task skills:doctor` green で完了。「明記」= proposal / spec delta に明記して潰す。
「外」= スコープ外と判断。

| # | 分類 | R1 |
| --- | --- | --- |
| 1 | 空・ゼロ長・None | 明記: SKILL.md は 6740 bytes 非空・sha256 実測を lock に固定。空取り込みは doctor の sha256 不整合で FAIL |
| 2 | 境界値 | 明記: 完了判定は doctor green（SKILL.md 実測 sha256 == lock）＋`task check` green |
| 3 | 重複・衝突 | 明記: Claude Code ビルトイン `code-review` と名前衝突するが受容（設計判断 2）。ハードゲートは builtin 名衝突を検査しない |
| 4 | 順序 | 明記: SKILL.md + LICENSE 追加 → lock エントリ追加 → `task skills:update`（symlink）→ doctor の順 |
| 5 | 型・形式不正 | 明記: 付随ファイルは LICENSE のみ（SKILL.md 以外に references なし・上流 code-review dir は SKILL.md 単体） |
| 6 | エラー経路 | 明記: doctor red の間は取り込み未完として lock / 実体を修正して再実行。sha256 不一致時は SKILL.md を再取得（改変で通さない） |
| 7 | 冪等性・再実行 | 明記: 同 commit の再取得で SKILL.md・sha256 は不変。`task skills:update` は symlink を冪等再生成 |
| 8 | 時刻 | 明記: commit は `391a2701` に pin（以降の上流進行は本 change 対象外） |
| 9 | 文字列 | 明記: skill 名は `code-review`（`tdd:36` の literal 参照に一致・ASCII slug） |
| 10 | 数値 | —（該当なし） |
| 11 | 巨大入力 | —（単一 skill・SKILL.md 1 ファイル） |
| 12 | 状態遷移 | 明記: vendored skill が 10 → 11 件に増える。孤児検査（test_skills_lock）は allowed エントリ ⇔ ディレクトリの一対一を見るため、lock エントリと dir を同時に追加すれば整合 |

フェーズ 2（テスト対応付け）: 実体・lock の整合は既存の `tests/test_skills_lock.py`
（SKILL.md の sha256・孤児・symlink 解決のハードゲート）が担保する。新規テストは不要。
backstop は self-review（実体・lock・proposal の突き合わせ）。
