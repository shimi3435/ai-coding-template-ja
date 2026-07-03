---
name: verify-change
description: >
  Verify that a change actually works, not just that tests pass: run task check,
  run tests close to the change individually, and where possible exercise the
  changed code for real (REPL / script / task doctor). Report anything that
  could not be verified as unverified, with reasons. Use after completing a
  sizeable change, or when the user says "動作確認", "実動作確認",
  "動くか確認して", or "verify-change".
---

# verify-change（実動作確認）

「テストは通るが実際には動かない」を捕捉する。変更を完了と報告する前に、テスト green
だけでなく実挙動を確認する。

## 手順（4 段）

1. **`task check`（必須ゲート）**: lint / format / typecheck / test の一式を回す。
2. **変更対象に近いテストの個別実行**: 例 `uv run pytest tests/test_xxx.py -q`。
   `task check` 全体が green でも個別に実行する（変更に対応するテストが存在しない
   ことを見逃さないため。無ければその旨を報告する）。
3. **可能なら実動作確認**: 変更した対象を実際に叩き、出力を目視する。
   - 関数: REPL や `uv run python -c "..."` で代表入力を与えて出力を見る。
   - スクリプト / CLI: 実行して出力と終了コードを見る。
   - 設定・環境系: `task doctor` 等の診断コマンドを回す。
4. **未検証の明記**: 実行できなかった確認項目は**「未検証」と理由を明記**して報告する。
   - 例: GPU 必須・長時間実行・外部データ依存・認証が必要。
   - 未検証があっても本 skill はブロッカーにしない（研究コードでは実動作不能が常態）。
     ただし**未検証を検証済みとして報告しない**こと自体が本 skill の存在理由。

## 報告形式

- **検証済み**: 実行したコマンドと結果の要点（テスト名・出力・終了コード）。
- **未検証**: 項目と理由（AGENTS.md Validation「実行できなかったコマンドは理由を明記」と
  同じ規律）。
