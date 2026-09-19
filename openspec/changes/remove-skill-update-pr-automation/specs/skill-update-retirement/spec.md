# Skill update retirement

## ADDED Requirements

### Requirement: Automation retirement
テンプレートはSkill更新PR自動化の専用workflow、実装、tests、CLI、task route、必須存在検査を撤去しなければならない（MUST）。保守者専用・optional・別schedulerへの移植は行わない（MUST NOT）。

#### Scenario: Retired entrypoint
- **WHEN** Node 24で旧candidateまたはhuman smoke CLIを呼ぶ
- **THEN** usageを表示しexit 2で拒否する
- **AND** GitHub呼出やrepositoryの書込みを行わない

#### Scenario: Repository without automation assets
- **WHEN** 専用workflow/subtreeを含まない配布物を検査する
- **THEN** 専用資産の欠落を理由に失敗しない
- **AND** 空glob、dangling import、専用permission/doc marker契約を残さない

### Requirement: Preserve manual updates and offline checks
テンプレートは既存の手動Skill更新とremote取得・固定・legal・integrity・取得前上限・offline verify・linksを保持しなければならない（MUST）。通常CIとrename-smokeは同じ残存task checkを実行しなければならない（MUST）。

#### Scenario: Remaining validation routes
- **WHEN** Node 24、npm、Python >=3.14とlocked dependencyが揃う
- **THEN** task check、task check:isolated、rename apply後task checkが成功する
- **AND** 通常checkはネットワークやOpenSpec CLIを要求しない

#### Scenario: Manual update failure
- **WHEN** 取得前上限、特殊file、legal不一致、履歴変更、壊れたlockまたは利用者編集に既存updaterが遭遇する
- **THEN** 既存の拒否・保護契約を維持する
- **AND** 失敗した隔離コピーを通常PRへ進めない
- **AND** source/lock形式、SemVer受理文法、local lock、transactionは本changeで変更しない

### Requirement: Safe retirement guidance
現行文書は自動化の有効化・再実行・復旧手順を提供終了し、停止・棚卸し・手動更新の順序を網羅しなければならない（MUST）。repository内の撤去処理は外部resourceや利用者差分を自動削除してはならない（MUST NOT）。

#### Scenario: Existing or uncertain remote state
- **WHEN** queued/in-progress run、open/closed/merged PR、tracking issue、branch、artifact、variable/secretが残る
- **THEN** 対象repositoryのworkflowを人が無効化し、run停止を確認してから撤去を反映する
- **AND** 未停止・不明・部分失敗時は移行を止め、再取得した状態から棚卸しを再開する
- **AND** 名前や古いjournalだけで所有を推測せず、利用者変更と共有credentialを保護する

#### Scenario: Already retired or unused repository
- **WHEN** workflowまたは対象resourceが存在しない
- **THEN** 不在を確認して該当操作を省略し、再作成しない
- **AND** 再実行でも未知のresourceを削除しない

#### Scenario: Historical documentation
- **WHEN** ADR、retrospective、固定点監査に旧機能の説明がある
- **THEN** 過去の本文は保持し、必要な現行導線だけを撤去手順へ向ける
