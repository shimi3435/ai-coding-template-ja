# 運用ループ規約 4 件の明文化（軽微変更基準・skill 取り込み手順・dependabot 基準・陳腐化点検）

## Why

2026-07-12 のプロジェクト全体レビュー残件のうち運用系 B 群。安全性 2 件（A1/A2）は
PR #32 で修正済み。残る 4 件はいずれも「検知→対応→還流」ループの後半（対応規約）が
未定義で、検知機構（`task skills:upstream` / dependabot / リリース手順）だけがある状態。
同一レビュー由来・すべて docs への数行追記のため 1 change に束ねる（spec delta 4 本）。

- **B1**: 軽微変更（typo 等）に change が要るかの基準が `openspec/project.md` に無く、
  毎回判断がぶれる。
- **B3**: `task skills:upstream` が WARN を出した後の取り込み手順が
  `docs/agents/workflow.md` に無い（検知だけあって対応手順が無い）。
- **B4（基準のみ）**: dependabot PR の処理基準が docs に無い（PR 3 件が滞留中）。
  open PR の実処理・merge は本 change のスコープ外（人起点）。
- **B5**: リリース前チェックにバージョン結合記述（CI の openspec exact pin・
  Codex plugin 実機挙動・skill 上流乖離）の陳腐化点検が無い。

## What Changes

- **openspec/project.md**（B1）: 「テンプレート自身の change 運用」節に軽微変更の
  change 不要基準を追記する。spec（振る舞い・規約）に触れない軽微修正（typo・
  リンク切れ・表現修正等）は change 不要・直接 PR 可。迷う場合・途中で規約に触れると
  判明した場合は change を切る。
- **docs/agents/workflow.md**（B3）: Skills 節に上流取り込み手順を追記する。
  WARN 確認 → 上流 diff レビュー → 取り込み判断（人起点）→ `.agents/skills/<name>/` の
  実体更新 → `skills.lock.json` の commit / sha256 更新 → `task skills:doctor` green。
  取り込みは lock・skill 実体の変更を伴うため軽微変更に当たらず change を切る。
- **docs/agents/safety.md**（B4 基準）: dependabot PR の処理基準を追記する。
  minor / patch は次回作業時にまとめて確認して merge、major は changelog（breaking
  changes）と CI 結果を確認の上で個別判断。merge は人起点（自動 merge を設定しない）。
- **docs/template/release.md**（B5）: リリース前提チェックに陳腐化点検 1 項目を追加する。
  点検の実施は必須だが、検出された乖離への対応（更新か据え置きか）は人判断で、
  据え置きのままのリリースを妨げない。

## 設計判断

1. **B4 の置き場は safety.md**。AGENTS.md Safety の「依存の大規模更新は事前確認する」の
   具体化であり、dependabot.yml 自体が供給網対策（safety 文脈）として導入されている。
   workflow.md はスコープが OpenSpec / GSD / Skills で、依存更新を足すと表題と乖離する。
2. **4 件を 1 change に束ねる**。同一レビュー由来・全て docs/規約の数行追記・
   「検知→対応」ループの完結という共通目的。分割コスト > 利益。
3. **B5 は「実施必須・green 必須ではない」**。skills:upstream の WARN や上流の新版は
   据え置きが正当な場合がある（更新判断は人起点）。リリース可否を上流の更新頻度に
   結合させない。ただし CI の openspec exact pin と実機挙動記述の**事実誤り**が見つかった
   場合は通常のリリース前提（記述の修正）に従う。
4. **B3 手順に「取り込みは change を切る」を含める**。B1 基準の初回適用を手順側にも
   明文化し、B2（上流 WARN 3 件の実処理）で dogfood する。

## spec-holes フェーズ 1 結果

R1=B1 軽微変更基準 / R2=B3 取り込み手順 / R3=B4 dependabot 基準 / R4=B5 陳腐化点検。
「明記」= 仕様（spec delta / docs 本文）に明記して潰す。「外」= スコープ外と判断。

| # | 分類 | R1 | R2 | R3 | R4 |
| --- | --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | —（変更ゼロの PR は無い） | WARN 0 件なら手順不要（明記不要・自明） | open PR 0 件なら適用なし（自明） | 乖離 0 件なら即 pass（明記: 点検実施のみ必須） |
| 2 | 境界値 | 明記: 判定はファイル種別でなく「振る舞い・規約に触れるか」 | 明記: 取り込み完了の判定 = doctor green | 明記: major 判定はバージョン番号（タグ表記）による | 明記: 点検対象 3 点を列挙（pin・実機挙動・skills:upstream） |
| 3 | 重複・衝突 | 明記: 軽微修正の束ね PR も基準は同じ（1 件でも規約に触れれば change） | 明記: 複数 skill 同時取り込み可（lock は skill ごとに更新） | 外: 同一依存の重複 PR は dependabot が自動 supersede | —（点検項目は独立） |
| 4 | 順序 | — | 明記: 実体更新 → lock 更新 → doctor の順 | 明記: minor/patch は「次回作業時にまとめて」（即時対応を要求しない） | 明記: リリース前提チェック内の 1 項目（step 1 より前） |
| 5 | 型・形式不正 | 明記: docs でもコードでも基準は同一 | 外: 上流リポジトリ消滅・force-push は人判断（手順は正常系） | 明記: SHA ピン更新でも判定は併記タグから | — |
| 6 | エラー経路 | — | 明記: doctor red なら取り込み未完（lock/実体を修正して再実行） | 明記: CI red の PR は merge しない | 明記: skills:upstream 実行不可（ネットワーク等）なら不可の旨を認識して人判断 |
| 7 | 冪等性・再実行 | — | 明記: 完了判定は doctor green（lock⇔実体整合）。upstream 再実行の OK 化は帰結だが、取り込み後に上流がさらに進めば WARN が正当に残るため完了判定には使わない | —（merge は 1 回で終端） | 明記: 毎リリース実施（前提チェックの一部） |
| 8 | 時刻 | — | — | — | — |
| 9 | 文字列 | — | —（skill 名は lock 管理の ASCII slug） | — | — |
| 10 | 数値 | — | — | 明記: pre-1.0 依存（0.x）は minor でも breaking がありうるため major 扱いで個別判断 | — |
| 11 | 巨大入力 | — | — | —（週次・数件規模） | — |
| 12 | 状態遷移 | 明記: 軽微として開始→途中で規約に触れると判明→change を切り直す | 明記: 据え置き判断した WARN は次回も再表示される（記録は人判断・任意） | — | 明記: 乖離検出→据え置きリリース可（対応は人判断） |

フェーズ 2（テスト対応付け）: 本 change は docs のみで実行可能な振る舞いを持たないため、
例示テスト / property は対象外。backstop は self-review での spec delta ⇔ docs 本文照合。
