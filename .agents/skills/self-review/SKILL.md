---
name: self-review
description: >
  Review your own diff before commit / PR: check for bugs, needless complexity,
  scope creep, and AGENTS.md compliance. Fix obvious defects on the spot and
  run focused validation; report judgment calls without fixing them. Use before
  committing or opening a PR, or when the user says "セルフレビュー",
  "自己レビュー", "コミット前チェック", or "self-review".
---

# self-review（自己 diff 検査）

コミット / PR 前に自分の diff を「他人のコード」として読み直し、バグと逸脱をコミット前に
捕まえる。別 AI によるクロスレビュー（[docs/optional/codex-review.md](../../../docs/optional/codex-review.md)）
の代替ではなく、その前段の自己検査。

## Convergence cycle との関係

bounded review convergence では cycle の先頭に1回だけ実行する。反復する full review の代わりにしない。
明白な欠陥を修正した場合は対象に近い focused validation を実行し、設計・scope・仕様の判断事項は
修正せず initial reviewer へ引き継ぐ。

## 対象 diff

1. 未コミットの作業ツリー: `git diff`（ステージ済みがあれば `git diff --cached` も）。
2. ベースブランチとの差分: `git diff main...HEAD`。
3. 未追跡 file: `git ls-files --others --exclude-standard` で列挙し、内容を検査する。ignored file は除外する。

すべてを読む。diff に現れないが影響を受ける箇所（呼び出し元・設定・ドキュメント）も必要に
応じて開いて確認する。

large / binary file に固定 size cap は設けない。path、size、type を確認する。全文を安全に読めない場合、
または tool 出力が truncation したか不明な場合は未検証として扱う。full-scope 内の required evidence なら
欠落を blocker とし、scope 外または optional なら未検証の理由と影響を記録する。

## 検査観点

- **バグ**: off-by-one・境界条件・None / 例外処理漏れ・型不整合・未使用 import・typo。
- **不要な複雑化**: 使われない抽象化・過剰な分岐・重複
  （AGENTS.md「単一ファイルの肥大化を避ける」）。
- **スコープ逸脱**: 依頼や proposal にない変更・無関係なリファクタリング
  （AGENTS.md「変更は必要最小限」）。
- **AGENTS.md 遵守**: 具体的な命名・既存の設計意図の尊重・secret / token の混入なし。
- **spec-holes 対応表の照合**: `spec-holes` フェーズ 1 の穴リストがある場合、各穴が
  フェーズ 2 の対応表（例示テスト / Hypothesis property / 理由付き「未検証」）に
  落ちているかを突き合わせ、漏れを指摘する。
- **active change の tasks.md 照合**: 実行中の OpenSpec change がある場合、その `tasks.md` の
  チェック状態が diff の実装実態を反映しているかを突き合わせ、完了済みなのに `- [ ]` の
  ままのタスク・未着手なのに `- [x]` のタスクなど乖離があれば指摘する（backstop）。

## 2 段階挙動

検出した問題は次の 2 つに仕分けする。

1. **明白な欠陥 → その場で修正する**。
   - 例: off-by-one・未使用 import・型不整合・typo・明らかな処理漏れ。
   - correctness / contract defect は RED test または再現 probe を先に用意する。
   - 純 prose の事実誤りを機械検査できない場合は、矛盾 evidence と非テスト理由を記録する。
   - mechanical typo / format / unused import は RED を要求しない。修正後の focused validation だけを行う。
   - 修正後に対象に近い focused validation で green を確認する。
2. **判断事項 → 修正せず報告のみ**。
   - 例: 設計判断の変更・スコープの追加 / 削減・仕様解釈が割れる箇所。
   - AGENTS.md「変更は必要最小限」「破壊的変更・大量削除は事前確認」と整合させるため、
     勝手に直さず指摘として列挙し、ユーザの判断を仰ぐ。

どちらか迷う場合は報告側に倒す（勝手な修正はそれ自体がスコープ逸脱になる）。

bounded convergence cycle 内の self-review は全体 check を要求しない。明白な欠陥の修正後は focused
validation だけを行い、全体 check は review 収束後の topology に委ねる。

standalone self-review で既存の必須 full-check gate を報告する場合だけ、次の minimum fields を command 単位で
確認する。

- 実行 command と exit 0。
- source commit。
- 検証入力を含む dirty diff digest、または検証後に input files が無変更である同等の証明。
- source、tests、dependency environment、lockfile、build / CI 設定、対象 fixtures。
- repository real path、worktree、source snapshot、command に影響する OS、locale、認証などの環境。

入力同一性が一項目でも不明なら全体 check を実行する。同一性を証明できる場合は同じ全体 check を再実行しない。

## 報告形式

- **修正した項目**: ファイル・修正内容・focused validation の結果。
- **報告のみの項目**: ファイル・問題・判断事項とみなした理由・推奨対応。
- 問題なしの場合もその旨と検査した観点を明記する（無言で通過させない）。
