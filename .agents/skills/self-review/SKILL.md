---
name: self-review
description: >
  Review your own diff before commit / PR: check for bugs, needless complexity,
  scope creep, and AGENTS.md compliance. Fix obvious defects on the spot and
  re-run task check; report judgment calls without fixing them. Use before
  committing or opening a PR, or when the user says "セルフレビュー",
  "自己レビュー", "コミット前チェック", or "self-review".
---

# self-review（自己 diff 検査）

コミット / PR 前に自分の diff を「他人のコード」として読み直し、バグと逸脱をコミット前に
捕まえる。別 AI によるクロスレビュー（[docs/optional/codex-review.md](../../../docs/optional/codex-review.md)）
の代替ではなく、その前段の自己検査。

## 対象 diff

1. 未コミットの作業ツリー: `git diff`（ステージ済みがあれば `git diff --cached` も）。
2. ベースブランチとの差分: `git diff main...HEAD`。

両方を読む。diff に現れないが影響を受ける箇所（呼び出し元・設定・ドキュメント）も必要に
応じて開いて確認する。

## 検査観点

- **バグ**: off-by-one・境界条件・None / 例外処理漏れ・型不整合・未使用 import・typo。
- **不要な複雑化**: 使われない抽象化・過剰な分岐・重複
  （AGENTS.md「単一ファイルの肥大化を避ける」）。
- **スコープ逸脱**: 依頼や proposal にない変更・無関係なリファクタリング
  （AGENTS.md「変更は必要最小限」）。
- **AGENTS.md 遵守**: 具体的な命名・既存の設計意図の尊重・secret / token の混入なし。

## 2 段階挙動

検出した問題は次の 2 つに仕分けする。

1. **明白な欠陥 → その場で修正する**。
   - 例: off-by-one・未使用 import・型不整合・typo・明らかな処理漏れ。
   - 修正後に `task check` で green を確認する。
2. **判断事項 → 修正せず報告のみ**。
   - 例: 設計判断の変更・スコープの追加 / 削減・仕様解釈が割れる箇所。
   - AGENTS.md「変更は必要最小限」「破壊的変更・大量削除は事前確認」と整合させるため、
     勝手に直さず指摘として列挙し、ユーザの判断を仰ぐ。

どちらか迷う場合は報告側に倒す（勝手な修正はそれ自体がスコープ逸脱になる）。

## 報告形式

- **修正した項目**: ファイル・修正内容・`task check` の結果。
- **報告のみの項目**: ファイル・問題・判断事項とみなした理由・推奨対応。
- 問題なしの場合もその旨と検査した観点を明記する（無言で通過させない）。
