# spec-holes skill の追加（仕様の穴の機械的列挙と検証接続・自作 local vendoring）

## Why

現行ループ（OpenSpec で仕様確定 → tdd → self-review → verify-change →（任意）codex
クロスレビュー）をすり抜けて残るバグの主層は**仕様の穴・エッジケース**である。すなわち
仕様に書かれていない入力・状態に対して実装エージェントが暗黙の判断を行い、その判断が
後から誤りと分かる箇所。grill 系 skill は「ユーザに聞く」装置であり、**聞かれなかった
ことは穴として残る**。この層は注意力（モデルの強さ・人間の集中力）に依存する限り消えない。

モデル非依存で効く対策は「注意力を賢くする」ことではなく、
**固定タクソノミーによる機械的な列挙**と、**列挙した穴を機械が反証できる形（テスト）に
落とす接続**の 2 つである。本 change はこれを 1 つの自作 skill `spec-holes` として追加する。

また `hypothesis` は dev group に導入済（pyproject.toml）だが、どの skill・docs からも
参照されておらず**道具と規律が断絶している**。property-based testing の使いどころを
本 skill のフェーズ 2 として規約化し、この断絶を閉じる。

## What Changes

- `.agents/skills/spec-holes/SKILL.md` を新規作成（自作）。
- `.agents/skills/skills.lock.json` に `source_type: local` のエントリを 1 件追加。
- `task skills:update` で `.claude/skills` / `.codex/skills` の symlink を生成
  （スクリプトはディレクトリ自動発見のため変更不要）。
- AGENTS.md の Workflow に追記（**フェーズ 1 は無条件・フェーズ 2 は「可能なら」**。
  設計判断 3 参照）:
  - 「OpenSpec で仕様を確定する前に `spec-holes` で未定義の振る舞いを列挙して潰す。」
  - 「列挙した穴は可能なら例示テスト / Hypothesis property に落とす。」
- [docs/agents/workflow.md](../../../docs/agents/workflow.md) の skill 表に 1 行追加
  （供給元 = 自作 / local）＋ 2 フェーズ運用の短い補足。
- `.agents/skills/self-review/SKILL.md` の検査観点に「spec-holes 対応表の照合」を
  1 項目追記（フェーズ 2 の対応表の漏れ検出を self-review が実行することを実効化する。
  編集に伴い skills.lock.json の self-review エントリの sha256 も更新）。

コード（src / tests / CI / Taskfile / scripts）の変更はない。**依存の追加もない**
（hypothesis は dev group 導入済）。既存テスト `tests/test_skills_lock.py` が
新エントリを自動的に検証対象に含める。

## skill 仕様

### spec-holes（2 フェーズ型）

- **目的**: 仕様の穴（未定義の振る舞い）を注意力に依存せず機械的に列挙し、
  列挙した穴を機械が反証できる形（テスト）まで運ぶ。

- **フェーズ 1（仕様時・無条件）**: OpenSpec proposal / spec delta の各要件に対して
  下記の固定タクソノミーを順に当て、「この入力・状態のとき仕様上どうなるか」が
  未定義のものを列挙する。列挙した各穴は次のいずれかで必ず潰す:
  1. 仕様に振る舞いを明記する（正常系 / エラー系のシナリオ追加）。
  2. **スコープ外**と仕様に明記する（暗黙に落とさない）。
  3. 判断がユーザに属するものは確認する（grill 系と同じ扱い）。

- **フェーズ 2（実装時・努力目標）**: フェーズ 1 で仕様に埋めた各穴を
  「例示テスト or Hypothesis property」に対応付ける対応表を作り、テストに落とす。
  - **property 化に向く対象**（純関数・パーサ / シリアライザ・データ変換・
    「往復で元に戻る」「順序に依らない」等の不変条件）は Hypothesis を使う。
  - 向かない対象（I/O glue・実験スクリプト・外部依存）は例示テストに落とすか、
    verify-change と同じ規律で**「未検証」と理由を明記**する。
  - 対応表の漏れは self-review が照合する（穴リストとテストの突き合わせ）。

- **タクソノミー（初版）**: 空・ゼロ長・None / 境界値（最小・最大・off-by-one）/
  重複・衝突 / 順序（未ソート・逆順・安定性）/ 型・形式不正 / エラー経路（例外・
  部分失敗・リトライ）/ 冪等性・再実行 / 時刻・タイムゾーン / 文字列（Unicode・
  空白のみ・エンコーディング）/ 数値（NaN・inf・負数・ゼロ除算・精度）/
  巨大入力・リソース枯渇 / 状態遷移の未定義パス。
  研究コードの常態（数値計算・乱数・空データフレーム）を意識して数値系・シード・
  空データを明示的に含める。全項目が全要件に適用されるわけではなく、
  「該当しない」と判断した項目はスキップしてよい（ただし黙殺せず判断はする）。

- **記述言語・命名**: 前例（self-review / verify-change）と同じ。本文日本語・
  frontmatter description は英語主体＋日本語トリガー語（「仕様の穴」「エッジケース」
  「spec-holes」）併記。

## 設計判断

1. **自作（source_type: local）を選ぶ**。grill-me / grilling / tdd は upstream vendored
   （mattpocock/skills）であり、直接改変は fork drift を生む。lock エントリの埋め方は
   前例の確定値を踏襲（source: "local (first-party)" / commit: "local" /
   license_file: "LICENSE" / sha256 は SKILL.md 実測・編集時更新必須）。
2. **1 skill で列挙→テスト化を一気通貫にする**（2 skill 分割案は不採用）。分割すると
   「列挙した穴がテストに落ちる」保証が skill 間の運用依存になり、
   本 change の目的（機械による反証への接続）が完結しないため。
3. **強制度は非対称にする**。フェーズ 1 は無条件（「可能なら」を付けない）。
   動機が「注意力依存の排除」なので努力目標にすると自己矛盾し、proposal 確定という
   自然な関所があるため運用負荷も低い。フェーズ 2 は既存 Workflow 行と同じ
   「可能なら」調。実装形態が多様（I/O glue・実験コード）で、無条件化は形骸化・
   虚偽 compliance を誘発するため。
4. **specs delta は作らない**。前例（add-self-review-verify-skills 設計判断 4）と同じ
   template-meta 運用判断。`openspec validate` が本 change を ERROR にするのは意図的で、
   Markdown fallback（proposal / tasks 手書き）で進める。
5. **完了後は change ディレクトリを削除して close する**（pre-merge 削除。
   `openspec/changes/` は出荷時空・経緯は git 履歴と PR が保持）。
6. **依存は変更しない**。hypothesis は dev group 導入済のため、pyproject.toml /
   uv.lock に手を入れない。

## 受け入れ基準

- [ ] `.agents/skills/spec-holes/SKILL.md` が存在し、frontmatter（name / description）を
      持つ。本文に 2 フェーズ手順・タクソノミー全項目・穴の潰し方 3 択・
      property 化の向き不向き基準を含む。
- [ ] `.agents/skills/skills.lock.json` に 1 エントリ追加（設計判断 1 の埋め方）。
- [ ] `task skills:doctor` が green（sha256 一致・symlink 解決を含む）。
- [ ] `task skills:update` 実行後、`.claude/skills/spec-holes` と
      `.codex/skills/spec-holes` の symlink が解決する。
- [ ] AGENTS.md Workflow にフェーズ 1（無条件）・フェーズ 2（可能なら）の文言が
      追記されている。
- [ ] docs/agents/workflow.md の skill 表に 1 行追加＋ 2 フェーズ運用の補足。
- [ ] `task check` が green。
- [ ] smoke: 実在の要件（本 change 自身または模擬要件）に対しフェーズ 1 の列挙と
      フェーズ 2 の対応表出力を 1 回実行し、タクソノミーの各項目に判断
      （該当 / 非該当）が付くことを確認する。

## Non-goals

- **契約 / assertion 規約（design by contract）・敵対的別コンテキスト仕様攻撃・
  mutation testing**。注入点の候補として検討したが今回は不採用（バックログ保持）。
  仕様時列挙＋ PBT で効果を見てから判断する。
- grill-me / grilling / tdd（upstream vendored）への機能追加。
- `openspec validate` のゲート化（バックログ既存項目・ADR-0002 との調整が別途必要）。
- hooks による spec-holes の自動発火（コア保証外。必要になれば別 change）。
- フェーズ 2 の無条件化（実運用の効果測定後に判断）。
