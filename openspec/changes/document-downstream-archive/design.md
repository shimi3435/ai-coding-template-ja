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
6. 追加自動検証は静的contract testsのみ。意味整合は対象review、必須gate未実行は未完了とする。
7. PRレビュー待ち・未確認は条件付きarchive-readyとして報告可。既知blockerがあれば不可。
8. 部分失敗・衝突時は三者の実状態を確認し、無条件再試行・自動rollbackをしない。不明なら停止する。
9. 同一capabilityへの並行変更は実装事実と順序を確認して直列同期する。bulk手順は追加しない。
10. deltaの効果が同期済みと内容で確認できた場合だけ、再適用せず履歴移動する。

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

恒久テストは文書の責務・順序・引き渡し・失敗時境界だけを検査し、change directoryやGit履歴へ依存しない。
意味整合・例外復旧は例示シナリオの文書reviewで確認する。実hostでのagent運用acceptanceは後続#47の
担当であり、静的テストを実agent動作の証明にはしない。新規runtime parserや自動archiveの実装はない。
