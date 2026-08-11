---
name: verify-change
description: >
  Verify that a change actually works, not just that tests pass: reuse or run task check,
  run tests close to the change individually, and where possible exercise the
  changed code for real (REPL / script / task doctor). Report anything that
  could not be verified as unverified, with reasons. Use after completing a
  sizeable change, or when the user says "動作確認", "実動作確認",
  "動くか確認して", or "verify-change".
---

# verify-change（実動作確認）

「テストは通るが実際には動かない」を捕捉する。変更を完了と報告する前に、テスト green
だけでなく実挙動を確認する。

独立 verifier の要否は AGENTS.md の OSWF-5 だけから判断し、ここで発火条件を再定義しない。
外部 tool 固有 state は検証・完了・再開の根拠にせず、canonical `tasks.md` と現在の repository 入力を使う。

## Reusable green evidence

`task check` を含む各検証 command について、直前の green evidence と現在状態の入力同一性を
command 単位で確認する。evidence は次を含む。

- 実行 command と exit 0。
- source commit。
- 検証入力を含む dirty diff digest、または検証後に input files が無変更である同等の証明。
- source、tests、dependency environment、lockfile、build / CI 設定、対象 fixtures。
- repository real path、worktree、source snapshot、command に影響する OS、locale、認証などの環境。

1項目でも入力同一性が不明なら再実行する。同一性を証明できる場合は同じ全体 check を再実行しない。
別 command の evidence は代用せず、証跡だけの変更も対象 command が読む場合は evidence を無効にする。
focused tests / 実動作 seam は再利用しない。全体 check evidence の再利用可否に関係なく毎回確認する。

## Required evidence と未検証

acceptance criteria、MUST / SHALL、project gate に必要な required evidence が欠落する場合、または
required 性が不明な場合は blocker とする。未検証を non-blocker にできるのは optional seam、明示的 out-of-scope、
研究環境制約のいずれかに限り、理由と影響を記録する。未検証を検証済みとして報告しない。

focused validation と代替静的検証が構造上非該当の場合だけ、N/A 理由を記録して完了にできる。
環境制約または validation failure による未実行は完了にできない。検証 checkbox を未完了に保ち、
理由と影響を `tasks.md` へ記録する。

## 手順（4 段）

1. **`task check`（必須ゲート）**: 上記 identity を満たす reusable green evidence があれば結果を確認して
   再利用し、なければ lint / format / typecheck / test の一式を回す。
2. **変更対象に近いテストの個別実行**: 例 `uv run pytest tests/test_xxx.py -q`。
   `task check` 全体が green でも個別に実行する（変更に対応するテストが存在しない
   ことを見逃さないため。無ければその旨を報告する）。
3. **可能なら実動作確認**: 変更した対象を実際に叩き、出力を目視する。
   - 関数: REPL や `uv run python -c "..."` で代表入力を与えて出力を見る。
   - スクリプト / CLI: 実行して出力と終了コードを見る。
   - 設定・環境系: `task doctor` 等の診断コマンドを回す。
4. **未検証の明記**: 実行できなかった確認項目は**「未検証」と理由を明記**して報告する。
   - 例: GPU 必須・長時間実行・外部データ依存・認証が必要。
   - 上記の required evidence 欠落 / required 性不明は blocker とする。理由と影響を伴う optional seam、
     明示的 out-of-scope、研究環境制約だけを non-blocker にできる。
   - **未検証を検証済みとして報告しない**こと自体が本 skill の存在理由。

## 報告形式

- **検証済み**: 実行したコマンドと結果の要点（テスト名・出力・終了コード）。
- **未検証**: 項目と理由（AGENTS.md Validation「実行できなかったコマンドは理由を明記」と
  同じ規律）。
- 永続化する証跡は command、結果、source commit、fresh実行 / green evidence再利用の別、
  未検証理由の要約だけとする。生 log、一時 report、tool 固有 state は追跡しない。
