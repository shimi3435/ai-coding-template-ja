# Change: openspec validate ゲートの強化（tasks.md 形式検査＋CI 配線）

## Why

backlog #14: gate（scripts/openspec-validate-gate.py）の preflight は proposal.md /
tasks.md の**存在**のみ検査し、tasks.md のチェックボックス形式は検査しない。engine 不在の
手動運用（Markdown fallback）で malformed な tasks.md（checkbox 行ゼロ・崩れた checkbox）
を機械検出できず、進捗マーク規律（workflow.md）の土台が壊れていても気づけない。

加えて、gate は `task openspec:validate` としてローカルにのみ存在し CI に配線されて
いない（backlog #8 の後継）。pre-merge close 規約でも PR 途中のコミットは change
ディレクトリを運ぶため、CI で回せば malformed / invalid な change を PR レビュー中に
機械検出できる。

## What Changes

1. **doctor.py に共有ヘルパー `malformed_tasks_changes` を追加**: 各 change の tasks.md を
   検査し、(a) 整形式 checkbox 行（`- [ ] ` / `- [x] `・大文字 X 可・インデント可）が
   1 行も無い、(b) checkbox もどき行（`- []`・`- [x]foo` など、checkbox を意図したと
   見える崩れ形）がある、(c) UTF-8 で読めない、のいずれかを行番号付きで報告する。
   列挙・欠落判定と同様に gate と doctor の単一の正として共有する。
   - CRLF は splitlines で吸収する。
   - markdown リンクを含むリスト行（`- [foo](bar)` 等・括弧内 2 文字以上）は checkbox
     もどきとして扱わない（誤検知防止）。
2. **gate preflight の拡張（FAIL 側）**: 既存の proposal.md / tasks.md 欠落検査に加え、
   ヘルパーの検出結果を FAIL とし CLI を実行せず非ゼロ終了する（fail-closed）。
3. **doctor probe の拡張（WARN 側）**: `_check_openspec_validate` が同ヘルパーで WARN を
   出す（exit 0 維持・doctor の green を壊さない。既存の broken 検出と対の設計）。
4. **ci.yml に `openspec-validate` ジョブを追加**: checkout → uv sync --locked →
   `npm install -g @fission-ai/openspec@1.3.1`（runner 同梱 Node を使用・新規 action 追加
   なし・exact version pin）→ gate 実行。
   - 空の changes/ では CLI が「No items found to validate.」exit 0（実測済み）のため
     ジョブは trivially green（main への push・close 済み PR 最終状態で赤にならない）。
   - ADR-0002 の「コアは Node 非依存」は bootstrap / 下流ローカルコアの話で、CI runner
     内の導入はこれに反しない（下流ローカルに Node を要求しない）。
   - CI コスト増は +1 ジョブ（~30 秒程度）で許容。
5. **docs の整合更新（3 箇所・各 1〜2 行）**: workflow.md quickstart step 5（preflight の
   検査対象に checkbox 形式を追記）・workflow.md fallback 節と release.md 前提チェックの
   「opt-in ゲート」表現（CI 配線後は opt-in ではなくなるため「CI でも同じ gate が走る」
   へ更新）。

## Non-goals / スコープ外（spec-holes フェーズ 1 反映）

- **番号付き（`1.` `2.`）の機械検査**: 続行・入れ子など正当な変形の誤検知リスクが
  高いため checkbox 形式のみ検査する。番号規律は convention のまま。
- **全角括弧 checkbox（`- ［ ］`）などの変形検出**: heuristic の対象外。全行が変形なら
  「整形式 checkbox 行ゼロ」で FAIL するため下支えはある。
- **チェック済み / 未チェックの意味的検査**（例: close 前に全チェック済みか）: 進捗の
  意味判断は実行主体と self-review の責務のまま。
- **openspec/ ディレクトリ自体を撤去した下流**: gate / CI ジョブごと撤去する運用
  （ジョブは独立しており削除で他ジョブに影響しない）。
- **openspec CLI の自動 version 追随**: exact pin（1.3.1・実機検証済み版）とし、bump は
  人起点。
