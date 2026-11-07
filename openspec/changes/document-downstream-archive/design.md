# 設計と合意

## 責務

- workflow: 下流archiveの順序、状態、例外、復旧の正本。
- project: canonical / active / archiveの配置と正本への参照。
- template release: 明示選択された保守作業の削除型close。名前・remote・文書の存在から選択しない。
- guide: 短い要約とworkflowへの導線。
- executor: active changeを実装・検証し、次の操作と未確認状態を報告する。archiveを実行しない。

## 利用者との合意（Q1〜Q10）

1. CLIなしでも担当者が意味を確認してspec同期・履歴移動・結果検証する。自作同期engineは作らない。
2. 新しい完了条件は今回作成・変更するarchiveに適用し、過去履歴へ最新tasks形式を遡及適用しない。
3. template削除型closeは専用保守手順の明示選択のみ。新設定や推測による運用選択は追加しない。
4. merge前の同scope修正ではarchiveの場所を維持し、実装・canonical・artifacts/tasksを再整合する。
5. archive後修正はworkflowの明示対象手順で扱い、active-only executorを再呼出しない。
6. 当初は追加自動検証を静的contract testsに限定した。外部review後の追補でshell引数と実pruneの回帰を加える。
   意味整合は対象review、必須gate未実行は未完了とする。
7. PRレビュー待ち・未確認は条件付きarchive-readyとして報告可。既知blockerがあれば不可。
8. 部分失敗・衝突時は三者の実状態を確認し、無条件再試行・自動rollbackをしない。不明なら停止する。
9. 同一capabilityへの並行変更は実装事実と順序を確認して直列同期する。bulk手順は追加しない。
10. deltaの効果が同期済みと内容で確認できた場合だけ、再適用せず履歴移動する。

## 外部review後の合意（修正Q1〜Q5、新cycle）

利用者はP2-1〜P2-3とP3-1について、次の修正方針と仕様・tasks更新、実装、fresh検証、独立review/verifierを承認した。

1. 下流archive／テンプレート保守の運用選択は完了操作の直前に必須とする。実装開始は止めない。
   会話・承認済み仕様の選択は引き継ぐ。未選択なら推測せず完了操作前に停止する。
2. projectから保守専用案内を除く。常設workflowへの一般参照と、prune前の既存marker内の保守導線を維持する。
   実prune前後で対象文書のリンク先file/headingまで照合する。新marker・全体リンク検査機構は追加しない。
3. 既存change名は新規作成のkebab-case制約と区別する。shell変数、引用、option終端でliteralに渡す。
   変数未設定・空名、対象不明、path/symlink越境、使用版が非対応の名称では実行しない。
4. CLI利用時は今回同期・修正したcanonical capabilityのstrict検証をarchive完了条件とする。
   全spec検証は既存repository policyに従う。対象なしを成功に数えず、必要なspecの欠落は停止する。
   CLIなしの手動確認、未実行必須gateの未完了扱いを維持し、CI gate自体は変更しない。
5. 運用未選択時は実装完了・検証結果・完了操作の選択待ちを報告し、archive-ready判定を保留する。
   選択された専用手順が提供されていない場合も実行前停止し、別運用へ自動で切り替えない。

名称はv1.3.1のcreate時とarchive時で検査が異なること、Commanderの`--`対応、
`validate --type spec --strict --no-interactive`による対象限定検証、全specが0件でもexit 0となることを
Context7とinstalled source/helpで再確認した。根拠は公式v1.3.1の
[change-utils](https://github.com/Fission-AI/OpenSpec/blob/v1.3.1/src/utils/change-utils.ts)、
[validate](https://github.com/Fission-AI/OpenSpec/blob/v1.3.1/src/commands/validate.ts)。

## 公式契約の確認

Context7 /fission-ai/openspecと公式docs・v1.3.1実装を調査済み。CI pinと最新mainを混同しない。

- [v1.3.1 archive実装](https://github.com/Fission-AI/OpenSpec/blob/v1.3.1/src/core/archive.ts):
  --yesは未完task警告にも続行する。canonical更新後に同名archive確認を行うため部分同期が残りうる。
- [v1.3.1 CLI](https://github.com/Fission-AI/OpenSpec/blob/v1.3.1/docs/cli.md#openspec-archive):
  --skip-specsは同期省略、--no-validateは検証省略。今回、後者は使用しない。
- [公式sync](https://github.com/Fission-AI/OpenSpec/blob/main/docs/commands.md#opsxsync):
  deltaは単純コピーではなくADDED/MODIFIED/REMOVED/RENAMEDを反映する。
- [公式bulk-archive](https://github.com/Fission-AI/OpenSpec/blob/main/docs/commands.md#opsxbulk-archive):
  競合は実装事実の確認が必要。今回の手順は単一changeの直列処理に限定する。

手動fallbackとmerge前のarchive内修正は、本repositoryが定める運用契約である。
task openspec:validateはCLI必須のactive検証のままとし、archive/canonical全体の検査成功と解釈しない。
通常checkはCLI任意だが、対象repositoryで必須とされるCLI gateの未実行は成功へ置換しない。

## 検証境界

恒久テストは文書の責務・順序・引き渡し・失敗時境界と掲載shellの引数保全を検査し、change directoryやGit履歴へ依存しない。
保守用の既存prune integrationで実prune前後の対象導線を検証する。
意味整合・例外復旧は例示シナリオの文書reviewで確認する。実hostでのagent運用acceptanceは後続#47の
担当であり、静的テストを実agent動作の証明にはしない。新規runtime parserや自動archiveの実装はない。
