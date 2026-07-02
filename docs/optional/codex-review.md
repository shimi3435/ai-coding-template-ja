# クロス AI レビュー（オプション・Codex plugin for Claude Code）

OpenAI の Codex plugin（marketplace `openai/codex-plugin-cc`・plugin 名 `codex@openai-codex`）を
Claude Code に導入すると、PR 前後に `/codex:review` で Codex による読み取り専用のクロス AI
レビューを回せる。**本テンプレートには vendoring しない**（opt-in install・コミットしない）。

## セキュリティ境界（§22 再掲・破らない）

- クロス AI レビューは**コードを外部（OpenAI）へ送信する**。
- **CI / hook で自動送信しない。トリガは常に人起点**（エージェントが勝手に回さない）。
- 実行前に**可用性ゲート**を通す: codex CLI 在席 ＋ 認証済み ＋ ネットワーク到達 ＋
  API コスト（ChatGPT サブスクリプションまたは OpenAI API key の利用枠を消費する）を許容。
- `task doctor` は codex CLI の在席を INFO 報告するのみで、認証・到達性の probe はしない。

## インストール（要 Node.js 18.18+・ChatGPT サブスクリプションまたは OpenAI API key）

Claude Code 内で:

```text
/plugin marketplace add openai/codex-plugin-cc
/plugin install codex@openai-codex
/reload-plugins
/codex:setup
```

- `/codex:setup` が codex CLI の準備状態を診断する（未導入なら npm 経由の導入を提案）。
  自分で入れる場合は `npm install -g @openai/codex`。
- 認証は `codex login`（plugin 導入手順 v1.0.5 で確認・2026-07-02）。

## 使い方（人起点のみ）

- レビュー: `/codex:review`（読み取り専用）。PR 前のセルフチェックに使う。
- 指摘は鵜呑みにせず、実行形で検証してから反映する（false positive があり得る）。
- quota 到達時はレビューが失敗する（「Reviewer failed to output a response」等）。
  リセット時刻を確認して再実行する。
