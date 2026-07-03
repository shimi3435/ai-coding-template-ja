# self-review / verify-change skill の追加（自作・local vendoring）

## Why

現行の vendored skill 7 件は 設計（grill 系）・実装（tdd）・デバッグ（diagnosing-bugs）・
簡素化（caveman）・ドメイン整備（domain-modeling）をカバーするが、**レビューと検証の脚が
ない**。レビューはオプションの codex クロスレビュー（[docs/optional/codex-review.md](../../../docs/optional/codex-review.md)）
のみで Codex CLI 未導入環境では脚が消える。検証は AGENTS.md Validation の「テスト実行」に
留まり、「テストは通るが実際には動かない」を捕捉する手順がない。

self-review（自己 diff 検査）と verify-change（実動作確認）を自作 skill として追加し、
TDD → 実装 → self-review → verify-change →（任意）codex クロスレビュー のループを閉じる。

本 change は openspec/changes を使う初の実例であり、Workflow 規律（ADR-0003 /
[docs/agents/workflow.md](../../../docs/agents/workflow.md)）のドッグフーディングを兼ねる。

## What Changes

- `.agents/skills/self-review/SKILL.md` を新規作成（自作）。
- `.agents/skills/verify-change/SKILL.md` を新規作成（自作）。
- `skills.lock.json` に `source_type: local` のエントリを 2 件追加。
- `task skills:update` で `.claude/skills` / `.codex/skills` の symlink を生成
  （スクリプトはディレクトリ自動発見のため変更不要）。
- AGENTS.md の Workflow に推奨 1 行ずつ追記（非強制・「可能なら tdd」と同トーン）。
- [docs/agents/workflow.md](../../../docs/agents/workflow.md) の skill 表に 2 行追加。
- [docs/optional/codex-review.md](../../../docs/optional/codex-review.md) に self-review との
  住み分けを 1 行追記（self-review = 自己検査・codex = 別 AI によるクロスレビュー）。

コード（src / tests / CI / Taskfile / scripts）の変更はない。既存テスト
`tests/test_skills_lock.py` が新エントリを自動的に検証対象に含める。

## skill 仕様

### self-review

- **目的**: コミット / PR 前に自分の diff をバグ・不要な複雑化・スコープ逸脱・
  AGENTS.md 遵守の観点で検査する。
- **挙動（2 段階）**:
  - 明白な欠陥（off-by-one・未使用 import・型不整合・typo 等）はその場で修正し
    `task check` で確認する。
  - 設計判断・スコープ変更・仕様解釈に関わる指摘は**修正せず報告のみ**
    （AGENTS.md の「変更は必要最小限」「破壊的変更は事前確認」と整合）。
- **対象 diff**: 未コミットの作業ツリー＋ベースブランチとの差分（`git diff` /
  `git diff main...HEAD`）。

### verify-change

- **目的**: 変更が「テストが通る」だけでなく実際に動くことを確認する。
- **手順（4 段）**:
  1. `task check`（必須ゲート）。
  2. 変更対象に近いテストを個別実行する。
  3. 可能なら実動作確認: 変更した関数 / スクリプトを実際に叩いて出力を目視する
     （REPL・スクリプト実行・`task doctor` 等）。
  4. 実行できなかった確認項目は**「未検証」と理由を明記**して報告する
     （AGENTS.md Validation の既存文言と一致。GPU 必須・長時間実行・外部データ依存
     等で実動作不能な研究コードの常態を前提に、skill はブロッカー化させない）。

### 共通

- **記述言語**: 本文は日本語（AGENTS.md・Taskfile コメントとトーン統一）。frontmatter の
  `description` は英語主体＋日本語トリガー語併記（skill 自動発動のマッチング確実性を優先）。
- **命名**: Claude Code 内蔵の `/verify`・`/code-review`・`/review` との衝突を避ける。
  `self-review` は検査主体（自分の diff）、`verify-change` は検査対象（この変更）が
  名前に出ており、CONTEXT.md の命名方針（具体的・曖昧回避）に合う。

## 設計判断

1. **自作（source_type: local）を選ぶ**。task check・AGENTS.md 語彙（green / Validation /
   未検証明記）と直結した手順にでき、lock スキーマは `local` 対応済みで仕組み変更が不要。
   上流（mattpocock/skills 等）に適合する既製 skill があるかは未確認で、審査コストが
   自作と同等以上（2 枚の短い SKILL.md なら保守負担も小さい）。
2. **lock の local エントリの埋め方**（スキーマ・テストは変更しない）:
   - `source`: `"local (first-party)"` — 上流リポジトリが存在しないことを明示。
   - `commit`: `"local"`（センチネル）— 外部 provenance がないため。実質のバージョン
     識別は `sha256` が担い、SKILL.md 編集時は lock の `sha256` 更新が必須
     （`task skills:doctor` が不整合を FAIL で検出する。既存 vendored と同じ規律）。
   - `license`: `"MIT"` / `license_file`: `"LICENSE"`（リポジトリルート）— 自作のため
     ディレクトリ個別の LICENSE 複製は置かない（上流原本保持の目的が local にはない）。
   - `redistribution`: `"allowed"`。
3. **pre-commit の `^\.agents/skills/` 除外は維持**。local skill も除外対象に入るが、
   sha256 の安定（フックによる書き換え防止）という便益は同じ。
4. **specs delta は change 内に持つ**（codex レビュー反映）。当初は「`openspec/specs/` は
   出荷時空・下流所有（[openspec/project.md](../../project.md)）」を理由に delta なしとし
   `openspec validate` の ERROR を既知の帰結として許容したが、これは `openspec/specs/`
   （出荷物）と `changes/<id>/specs/`（change 内 delta）の混同だった。delta を
   [specs/agent-skills/spec.md](specs/agent-skills/spec.md) に置けば validate は green に
   なり、設計判断 5（archive せず削除で close）により delta が `openspec/specs/` へ
   マージされることもないため「出荷時空」と両立する。skill 追加はテンプレートの能力
   変更なので「振る舞いが変わる場合のみ spec.md」の fallback 規約にも忠実になる。
   初実例が validate ERROR を許容する前例を作らない。
5. **change ディレクトリはマージ前の最終コミットで削除して close する**。
   `openspec/changes/` も出荷時空（下流が自分の change を書く場所）のため、engine の
   archive（`changes/archive/` へ移動）は使わず、main に change ディレクトリを載せない
   （Use this template は main HEAD からコピーされるため、マージ後削除では merge〜削除の
   窓で下流へ混入し得る。document-openspec-dogfooding の codex レビュー反映）。
   経緯は PR とブランチ履歴が保持する。
6. **AGENTS.md では推奨（非強制）に留める**。必須ゲート化は 1 行修正にもフルレビューが
   走りテンポを落とす。実運用で効果を見てからでも遅くない。

## 受け入れ基準

- [ ] `.agents/skills/self-review/SKILL.md`・`.agents/skills/verify-change/SKILL.md` が
      存在し、frontmatter（name / description）を持つ。description は英語主体＋日本語
      トリガー語併記。本文は上記「skill 仕様」の挙動・手順を含む。
- [ ] `skills.lock.json` に 2 エントリ追加（source_type: local・設計判断 2 の埋め方）。
- [ ] `task skills:doctor` が green（孤児なし・sha256 一致・symlink 解決を含む）。
- [ ] `task skills:update` 実行後、`.claude/skills/{self-review,verify-change}` と
      `.codex/skills/{self-review,verify-change}` の symlink が解決する。
- [ ] AGENTS.md Workflow に「コミット / PR 前は `self-review`」「まとまった変更後は
      `verify-change`」相当の推奨 1 行ずつが追記されている。
- [ ] docs/agents/workflow.md の skill 表に 2 行（供給元 = 自作 / local）追加。
- [ ] docs/optional/codex-review.md に self-review との住み分け 1 行追記。
- [ ] `task check` が green。
- [ ] `openspec validate add-self-review-verify-skills` が green（engine 導入環境で確認。
      delta は [specs/agent-skills/spec.md](specs/agent-skills/spec.md)）。

## Non-goals

- hooks による自動発火（caveman-hook 同様、コア保証外。必要になれば別 change）。
- self-review / verify-change の必須ゲート化（実運用の効果測定後に判断）。
- 上流 skill の調査・vendoring への切り替え（適合品が見つかれば別 change で置換可能。
  lock の source_type 差し替えだけで移行できる）。
- CI・Taskfile・doctor の変更。
