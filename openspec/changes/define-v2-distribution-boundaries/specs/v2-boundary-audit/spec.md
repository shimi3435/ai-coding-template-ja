## ADDED Requirements

### Requirement: 責務単位の配布監査
監査成果は SHALL Issue #67の必須監査対象を、downstream mandatory / downstream optional / template-maintainer onlyへ責務単位で分類し、価値・根拠・依存・通常setup/check/doctor・移行・検証・実装ownerを記録する。

#### Scenario: public taskとCIの漏れを検出する
- **WHEN** mainのTaskfileとworkflowの全公開入口を監査する
- **THEN** 各taskと各jobに分類と担当があり、Node 24 / npmの理由を#57の必須機能との依存で説明する

### Requirement: pruneと保持の境界
監査成果は SHALL #57のoffline検証・local lock更新・任意の手動更新を保持したまま、#64専用資産と混在する参照の除去範囲を示し、部分欠落を正常なprune済み状態と区別する。

#### Scenario: 無効・同梱・pruneは異なる
- **WHEN** #64を無効化またはpruneする移行を設計する
- **THEN** 同梱中はoffline検証し、prune後は専用検証だけを除き、host・認証・ネットワークを通常checkへ要求しない

### Requirement: 独立成果への引き渡し
監査成果は SHALL #51・#65・#66の担当と受け入れ条件、CI検証漏れとrelease準備の独立した実Issue番号を示し、監査完了を修復完了や出荷可と表現しない。

#### Scenario: 合意済み順序と対象外を保持する
- **WHEN** 後続作業を引き渡す
- **THEN** #67先行、#65 Change 2条件付き・Change 3必須、#62構成確定後、#47最終workflow後、#52分離延期、#61/#63対象外を保持し、Issue起票は明示承認された2件に限定する

#### Scenario: 追跡先が未確定の場合
- **WHEN** 独立Issueの一方でも起票未完了または重複先不明である
- **THEN** 未完了handoffを残し、#67完了と扱わず、成功した起票を重複実行しない

### Requirement: 移行契約のreviewとpre-merge close
本changeは SHALL Accepted ADRによる削除/migration契約の確定としてOSWF-5を適用し、必要なreview・検証と実Issueへの接続を完了してから、利用者承認済みのpre-merge closeを行う。

#### Scenario: 既存2軸reviewでは別verifierを代替しない
- **WHEN** 文書のみを理由とした非該当判定を訂正する
- **THEN** 新cycleでself-review、initial independent review、必要な修正とfocused validation/diff review、最新入力task check、別independent verifierを順に実施し、証跡をtasksへ記録する

#### Scenario: 必須検証後にchangeだけをcloseする
- **WHEN** 全task・検証が成功し、retrospectiveとclose前の証跡commitを保存した
- **THEN** 本changeの5文書のみを削除し、task openspec:validateでactive change 0 / greenを確認して必要な再検証と最終CIを行い、恒久成果・他change・Issue #67・PRの状態を無断削除またはclose/mergeしない
