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

#### Scenario: Current CI documentation after retirement
- **WHEN** guideの現行check/CI説明節を読む
- **THEN** 通常CIのcheckとrename-smokeがTaskfileのcheckを共有すると説明する
- **AND** source/lock/実体/legal/symlink、top-level Node tests、TypeScript、Python checksを残存検証として説明する
- **AND** 専用automation testsやcandidate validate jobを現行機能として記述しない
- **AND** 依存監査とOpenSpecの独立ジョブを通常offline gateから区別する

#### Scenario: Focused documentation regression check
- **WHEN** 現行CI説明節に旧automation testsやcandidate validate jobの既知表現が再導入される
- **THEN** 空白・改行・backtick・英字大小の違いを正規化した回帰検査が失敗する
- **AND** 撤去手順・historical文書の正当な言及はこの検査から除外する
- **AND** 未知の言い換えを含む自然言語一般の意味判定は保証しない

#### Scenario: Partially amended architecture decision
- **WHEN** ADR-0011を直接読む
- **THEN** 冒頭のStatusとAmended in part byが#71/#75による部分改訂を示す
- **AND** #64のdownstream optional/opt-in/pruneおよびplugin更新PR統合案の撤回を明示する
- **AND** 現在の手動更新・撤去手順へリンクする
- **AND** 文脈以降の当時の本文は保持し、他の責務境界まで一括で失効させない

#### Scenario: Final close after pull request creation
- **WHEN** 今回のchangeを最終closeする
- **THEN** mainをbaseとする実在Draft PRの番号でretrospectiveを規定の（PR #N）形式へ更新済みである
- **AND** 今回の2件と先行1件を合計3件・review=3・merge後=0として記録する
- **AND** PR作成や番号確認が失敗した場合はcloseせず、実在状態を読み直してから再開する
