# 実行中の情報損失を防ぐ規約の追加（tasks.md 進捗マーク・別スコープ発見の記録）

## Why

2 つの「実行中に情報が失われる」穴を塞ぐ。

1. **tasks.md 進捗が更新されない**。別プロジェクト（本テンプレート未使用）で GSD に
   OpenSpec の change を実行させた際、`tasks.md` のチェックが更新されず、OpenSpec 側から
   どこまで進んだか判断できなかった。本テンプレートの ADR-0003 境界は per-change タスクの
   所有を OpenSpec に置くが、engine 不在時の Markdown fallback
   （[docs/agents/workflow.md](../../../docs/agents/workflow.md)）は tasks.md の**形式**だけを
   定義し、「**誰が・いつチェックを付けるか**」という能動規律が抜けている。`/opsx:apply`
   が進捗マークを担う前提が崩れる場面（engine 不在・GSD 駆動・手動実行）で穴が残る。

2. **別スコープの発見が失われる**。あるスコープの作業中に別スコープの問題に気づいたとき、
   既存規約「無関係なリファクタリングを行わない」は「直すな」としか言わず、**発見をどう
   扱うか**が未定義。結果、気づいた問題が会話に埋もれて失われる。

## What Changes

- **AGENTS.md「Workflow」**: change 実行時の tasks.md 進捗更新を能動規約として追記。
- **docs/agents/workflow.md（fallback 節）**: 同じ能動規約を、形式定義しかない実体箇所に追記。
- **`.agents/skills/self-review/SKILL.md`**: 検査観点に「active change の tasks.md が実装
  実態を反映しているか」の専用照合行を追加。self-review は local skill のため
  `.agents/skills/skills.lock.json` の sha256 を更新し `tests/test_skills_lock.py` を green に保つ。
- **docs/optional/codex-review.md**: 「Codex クロスレビューは PR 前に限らず任意のレビュー
  チェックポイントで使える（人起点）」の一文を追記。
- **AGENTS.md「General Engineering Rules」**: 「無関係なリファクタリングを行わない」の直後に、
  別スコープの発見を失わないよう記録する補完 bullet を追加。

spec delta は `changes/add-execution-tracking-rules/specs/execution-tracking/spec.md` に置く。
`openspec validate` は change にデルタが最低 1 つあることを要求するため、project.md
「テンプレート自身の change 運用」に従い delta を change 配下に置く。close 時にディレクトリごと
削除するため `openspec/specs/`（出荷時空）へはマージされず、validate green と両立する。

## 設計判断

grill-me（本 change の設計インタビュー）で確定した判断を記録する。

1. **backstop は self-review が無条件で担い、Codex は上乗せ（排他でない）**。Codex クロス
   レビューは人起点のみ・自動送信しないため「走る保証」がない。tasks.md 照合の恒久ホームは
   常時走る self-review とし、Codex は人が起動した時の追加の目に留める。「Codex 使える時は
   Codex、無い時 self-review」の排他案は、Codex 有効プロジェクトで保証層が消えるため却下。
2. **能動（実行者が付ける）と受動（付け忘れ検知）を分離する**。第一機構は AGENTS.md /
   workflow.md の能動規約、第二機構は self-review の照合行。両輪で穴を塞ぐ。
3. **verify-change は触らない**。verify-change の責務は「コードが実際に動くか」。tasks.md
   進捗は追跡可能性の bookkeeping であり実動作ではないため、混ぜると責務がぼやける。
   逸脱・遵守検査を担う self-review が正しいホーム。
4. **別スコープ発見の記録先は GitHub 非依存の中立表現**。テンプレートは汎用で全 downstream
   が GitHub を使うとは限らない。「記録して失わない。記録先はプロジェクトの課題管理
   （GitHub Issue / OpenSpec backlog / TODO 等）」とし、GitHub Issue をハードコードしない。
5. **外部 write は事前確認**。`gh issue create` 等の外部 issue 発行は GitHub write。AGENTS.md
   Tools「write は事前確認」/ Safety に従い、エージェントは自動発行せず、発見をその場で応答内に
   明示し文面を提案するに留める（発行は人起点）。
6. **記録の発火閾値を明文化する**。正確性 / セキュリティ / データ損失 / 将来をブロックする
   設計負債のみを対象とし、スタイル nit・主観的 refactor は対象外（self-review /
   cavecrew-reviewer の「意味を変えない nit は流す」と同型）。誤発火とノイズを抑える。
7. **能動規約のミラーは 2 箇所に限定**。AGENTS.md（単一の正）＋ workflow.md fallback 節
   （穴の実体箇所）のみ。openspec/project.md / docs/optional/gsd.md は所有権を既述のため
   複製せず、4 箇所同期によるドリフト源を増やさない。

## 受け入れ基準

- [ ] AGENTS.md「Workflow」に、change 実行主体（手動・GSD 駆動問わず）が各タスク完了時に
      対応する `tasks.md` のチェックを更新する能動規約が入っている（engine 不在の fallback
      でも同じ旨を含む）。
- [ ] AGENTS.md「General Engineering Rules」に、別スコープの発見を直さず記録する補完 bullet が
      入っている（GitHub 非依存の中立表現・外部 write は事前確認・閾値を明記）。
- [ ] docs/agents/workflow.md の fallback 節に同じ能動規約が入っている。
- [ ] `.agents/skills/self-review/SKILL.md` の検査観点に tasks.md 進捗照合行が入っている。
- [ ] `.agents/skills/skills.lock.json` の self-review の sha256 が更新され、
      `uv run pytest tests/test_skills_lock.py -q` が green。
- [ ] docs/optional/codex-review.md に「任意チェックポイントで Codex 可・人起点」の一文が入っている。
- [ ] `task check` が green。
- [ ] `openspec validate add-execution-tracking-rules` が green（engine 導入時。不在時は未実行と明記）。
- [ ] spec delta は change 配下（`changes/.../specs/execution-tracking/spec.md`）に置き、
      `openspec/specs/` の出荷時空は維持する。

## Non-goals

- **個人 global `~/.claude/commands/codex-pr-review.md` の rename / 汎用化**。repo 外のユーザ
  環境ファイルで、テンプレート利用者に配布されないため本 change のスコープ外（別タスク）。
- **tasks.md 進捗の機械ゲート化**（`task doctor` / `task check` で未チェックを WARN/FAIL）。
  途中コミット・複数 active change・engine 差分を区別できず誤検知が多いため却下。
- **verify-change skill への tasks.md 照合追加**（責務分離のため self-review のみ）。
- **ローカル backlog ファイル規約の新設**（置き場所・フォーマット・掃除責任を汎用テンプレに
  増やす重さに見合わないため。記録は応答内明示＋人起点の外部化で足りる）。
- **別スコープ発見の GitHub Issue ハードコード / OpenSpec change 強制**（移植性のため中立表現）。
