# ADR-0011: v2の下流必須・任意・テンプレート保守の責務境界

> Status: Accepted at Issue #67; amended in part as noted below.
> Amended in part by [Issue #71](https://github.com/shimi3435/ai-coding-template-ja/issues/71) / [Issue #75](https://github.com/shimi3435/ai-coding-template-ja/issues/75).
> #64 Skill更新PR自動化のdownstream optional / opt-in / prune方針と、#64へのplugin更新PR統合案は撤回された。
> 自動化は本体から完全撤去し、保守者専用・下流optionalとしても提供しない。現行運用は[手動更新・撤去手順](../../guide.md#7-skillの手動更新と旧自動化の撤去)を参照する。
> 以下の本文はIssue #67当時の判断記録として保持する。この部分改訂によって他の責務境界を一括で失効させない。

## 文脈

研究開始に必要な基盤とテンプレート保守契約が通常checkに混在している。
同梱されているだけで必須と判断すると、不要な自動化を削除できず、下流が保守履歴に依存する。
[Issue #67](https://github.com/shimi3435/ai-coding-template-ja/issues/67)の最新本文を境界判断の入力とする。
現行の具体的な資産・既知不具合・後続受け入れ条件は[監査リファレンス](../v2-boundary-audit.md)に置く。
本ADRは将来の移行方針を確定するもので、現在のlive workflowや検証を変更しない。

## 決定

- 分類はdownstream mandatory / downstream optional / template-maintainer onlyの責務単位とする。
  同一ファイル内の共有コード・任意機能・保守契約は区別する。
- Python開発基盤、通常品質・安全性検証、Node.js 24 / npm、配布Skillのsource / lock / licenseとoffline検証、
  リンク管理、local lock更新、共通policy、OpenSpecの下流運用、由来情報のTEMPLATE_VERSIONを保持する。
  Node / npmは必須のSkill検証とlocal lock更新が#57の共通実装を使うため必要である。
- #57によるupstream Skill手動更新は下流でも明示操作で利用できる。#64のPR自動化は別の任意機能で、
  既定無効・明示opt-in・専用資産prune可能とする。未使用を理由に共有検証を削らない。
- 同一テンプレートへ同梱し、明示pruneで用途に合わせる。別repo・専用配布branch・追加配布基盤は作らない。
  同梱中の任意機能はoffline検証し、未使用時のhost・認証・ネットワークを通常checkへ要求しない。
  pruneはtask・import/export・tests・CI・文書参照まで整合させ、部分欠落を正常な不在と扱わない。
- 下流workflowの正本は`docs/agents/workflow.md`。spec同期と履歴保存を伴うarchiveを既定とし、
  `openspec/project.md`は構成規約と正本への参照を持つ。削除型pre-merge closeは保守者の明示手順に限定する。
  repository名・remote・保守文書の残存から運用を推測しない。移行実装は#66が所有する。
- `bootstrap.sh --install-node`を維持し、#52の分離はv2.xへ延期する。
- Genshijin移行の提供はv2必須、有効化は下流任意。必要な#57 bundle最小拡張だけを条件付きで行い、
  #64へのplugin更新PR統合は別判断とする。#61・#63はv2対象外。
- #62は出荷構成確定後、#47はGenshijinを含む最終workflow確定後に行う。

## 結果と採らない案

下流が任意機能とテンプレート保守資産を除去しても、残した研究基盤の検証を維持できる設計とする。
その成立は#51等の実装・検証で判断し、本監査の完了で代替しない。
Node全面撤去、vendored Skill全面廃止、無効機能の検証全skip、欠落ファイル一つによる全skipは採らない。
実装をコード・tests・docsの種類で分割せず、独立して受け入れ可能な成果で分割する。
既存ADRは履歴として保存し、当時から本方針だったように書き換えない。
