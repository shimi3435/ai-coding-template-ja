# テンプレート自身の OpenSpec change 運用の明文化

## Why

openspec/changes の初実例（add-self-review-verify-skills）で、テンプレート自身が change を
切る際の運用判断を 2 つ確立した:

1. delta は `changes/<id>/specs/` に置けば `openspec validate` green と
   `openspec/specs/` の「出荷時空・下流所有」が両立する（archive しないため
   マージされない）。
2. close は archive ではなくディレクトリ削除で行う（`openspec/changes/` も出荷時空）。
   削除タイミングは当初「PR マージ後」としていたが、codex レビューで「merge〜削除の
   窓で changes/ が main に載り、Use this template（main HEAD からのコピー）の下流へ
   混入し得る」と指摘され、**マージ前（同一 PR の最終コミット）での削除**に改めた。
   経緯は PR とブランチ履歴が保持する。

しかしこの運用は当該 change の proposal 内にしか書かれておらず、次の change が同じ議論を
繰り返す（テンプレ改善バックログ 7）。また同実例で engine parser の制約
（SHALL/MUST 判定は requirement 本文の 1 行目のみ）を踏んでおり、fallback 形式の説明にも
未記載（バックログ 6）。どちらも OpenSpec 運用知見の明文化であり 1 change にまとめる。

## What Changes

- [openspec/project.md](../../project.md) に「テンプレート自身の change 運用」小節を追記
  （5 行程度）: delta は change 内に置く / archive せずマージ前の最終コミットで削除して
  close（main に change ディレクトリを載せない）/ validate green を維持 /
  specs/・changes/ の出荷時空は変えない。
- [docs/agents/workflow.md](../../../docs/agents/workflow.md) の Markdown fallback 形式説明に
  engine 互換の注記を追記（2〜3 行）: requirement 本文の 1 行目に SHALL / MUST を置く
  （parser は 1 行目のみ判定・全角括弧は可）。
- 既存 in-flight change の close 記述を pre-merge close に揃える:
  add-self-review-verify-skills（設計判断 5・tasks 10。`feat/self-review-verify-skills`
  ブランチ上で実施）・add-dependabot（tasks 4）。
- コード・設定・skill の変更はない（docs のみ）。

## 設計判断

1. **バックログ 6・7 を 1 change に束ねる**。同じ 2 ファイルへの小追記で、分けると
   change 管理コストが本文より大きくなる。
2. **project.md 側に運用・workflow.md 側に形式**を書く。project.md は「OpenSpec 固有の
   運用規約」の置き場（既存の責務分担）で、SHALL 行の書き方は fallback 形式の一部なので
   workflow.md の該当節に置く。AGENTS.md には足さない（作業方針の変更ではないため）。
3. **追記は最小限**（合計 10 行以内目安）。判断の経緯は初実例の proposal と git 履歴が
   持っており、規約側には結論だけ書く。

## 受け入れ基準

- [ ] openspec/project.md に「テンプレート自身の change 運用」小節がある（delta の置き場・
      pre-merge 削除での close・validate green 維持を含む）。
- [ ] 既存 in-flight change（add-self-review-verify-skills / add-dependabot）の close 記述が
      pre-merge close に揃っている。
- [ ] docs/agents/workflow.md の fallback 形式説明に SHALL 1 行目制約の注記がある。
- [ ] 追記は結論のみで合計 10 行以内目安（経緯の重複記載をしない）。
- [ ] `task check` が green。
- [ ] `openspec validate document-openspec-dogfooding` が green。

## Non-goals

- openspec validate の doctor / CI への組み込み（バックログ 8。ADR-0002 の Node 非コア
  依存原則との調整が要るため別 change）。
- AGENTS.md・CLAUDE.md の変更。
