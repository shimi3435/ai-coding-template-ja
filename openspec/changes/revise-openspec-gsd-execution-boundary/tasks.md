# Execution route: OpenSpec CLI / Markdown fallback

この change はガバナンス文書だけを更新し、単一コンテキストで安全に実装・検証できるため、
`openspec instructions apply --change revise-openspec-gsd-execution-boundary` の指示に沿って直接実行する。
CLI が利用できない場合も同じ artifacts と checkbox を手動で扱う。一つの PR は本 change だけを運ぶ。

## 0. Delivery isolation

- [x] 0.1 本 change を専用 branch / PR に分離し、`automate-openspec-gsd-handoff` と `harden-openspec-gsd-handoff-lifecycle` を同じ PR に含めず、pre-merge close 後の main に change directory を残さない

## 1. ADR

- [x] 1.1 ADR-0008 を追加し、ADR-0003 本文は履歴として据え置いたまま `Superseded by`、ADR-0008 には `Supersedes` を双方向に記録する

## 2. Core governance

- [x] 2.1 `AGENTS.md` の Workflow 見出しと本文を ADR-0008 の適応型実行境界へ更新する
- [x] 2.2 `openspec/project.md` の ADR 参照、責務境界、one-change-per-PR の段階 close 規約を更新する
- [x] 2.3 `docs/agents/workflow.md` の責務境界セクションを経路判定、直接実行、GSD 詳細計画所有、途中昇格、最終検証へ更新する
- [x] 2.4 同 workflow の engine アクセス / Markdown fallback セクションを残し、CLI JSON 契約と小規模直接実行・大規模手動 handoff の両方へ整合させる

## 3. User-facing and historical documentation

- [x] 3.1 `docs/optional/gsd.md` を大規模 change の役割、手動 handoff、opt-in fallback に整合させる
- [x] 3.2 `docs/guide.md` の OpenSpec / GSD 選択ガイドを新境界へ更新する
- [x] 3.3 `docs/template/grill/ai-coding-template-ja.md` は本文を歴史的記録として据え置き、ADR-0003 の境界が superseded で現行 authority は `AGENTS.md` / workflow である旨を冒頭へ注記する

## 4. Verification

- [x] 4.1 文書間リンク、全 ADR-0003 参照の active / historical 区分、CLI JSON の「パス列挙＋進捗」契約、後続 changes への分離、one-change-per-PR close を確認する
- [x] 4.2 process 仕様の spec-holes Phase 2 として、全 requirement / scenario / Phase 1 holes を更新文書、手動 scenario walkthrough、リンク検査、CLI 確認、または理由付き未検証へ対応付ける
- [x] 4.3 `task openspec:validate` と `task check` を実行する
- [x] 4.4 `self-review` を実行し、OpenSpec 原本の全 requirement / scenario と変更内容の対応を確認する
