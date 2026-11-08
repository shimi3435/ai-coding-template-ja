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
7. 下流のPRレビュー待ち・未確認は条件付きarchive-readyとして報告可。既知blockerがあれば不可。
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

## 再reviewのP3修正

利用者の修正依頼に従い、下流の報告を`下流 / archive-ready / next: archive`、保守側を
`テンプレート保守 / close-ready / next: deletion close`とする。close-readyは報告表現だけで、
archive-readyと同じ実装・検証・review・blocker条件を使い、専用保守手順の存在も要求する。
未選択時は両方のreadyを保留する。PRレビュー待ちは併記し、収束前のclose/archiveは禁止する。
implementation completeとarchive completeの定義、自動操作禁止、明示操作の境界は維持する。

## PR #96の追加review後の合意（Q1〜Q6）

- 既存文書・仕様・検証へ限定し、同期engine、runtime検査ツール、CI設定の変更は追加しない。
- canonical書き込み前にrepositoryのreal rootから既存の全親componentと対象をlstat相当で確認する。
  内部を含むsymlinkは拒否し、既存対象ファイルは通常ファイルかつリンク数1だけを許可する。
  未作成対象でも既存親を確認する。親directoryのリンク数にはこの条件を適用しない。
  判定不能は停止し、自動unlink・コピー置換は行わない。並行変更を止め、直前に再確認する。
- 同じ条件をCLI同期・手動同期・復旧・archive後canonical修正に適用する。canonicalに書き込まない操作には
  新しい書込条件を課さない。文書手順だけで競合を原子的に防ぐ保証はしない。
- merge直前に最新HEADのPRレビュー・必須承認・未解決thread・CIを照合する。失効した必要承認は再取得し、
  不明・未成立ならmergeしない。適用されるrepository規約とGitHub設定に従い、新しい承認数要件は作らない。
- 実行日時・報告は日本時間（JST、UTC+09:00）とし、CLIのarchive名はv1.3.1のUTC基準を維持する。
  CLIなしの手動fallbackも保存先名はUTCに揃える。直前UTC日付と予定先を確認し、実行後はCLI出力と実pathを照合する。
  日付はcanonical更新後に算出されるため、処理中の日付境界越えを確認・記録する。自動改名・再archiveは禁止する。
- 一時環境で通常ファイル、内部file symlink、親symlink、hardlink、新規対象の親symlinkを確認する。
  実CLIのalias副作用再現も一時環境だけとし、手順の自動強制を証明したとは扱わない。
- 旧HEADの失敗2ジョブは1回再実行し、同じ取得障害が再発したら停止・切り分ける。旧HEADのgreenを新HEADへ流用しない。

根拠: [v1.3.1 specs-apply](https://github.com/Fission-AI/OpenSpec/blob/v1.3.1/src/core/specs-apply.ts)は
親mkdir後にwriteFileでcanonicalを書き換え、alias確認を行わない。REMOVED / RENAMEDもrequirement操作後に
同じファイルへ書く。日付は[v1.3.1 archive](https://github.com/Fission-AI/OpenSpec/blob/v1.3.1/src/core/archive.ts)の
getArchiveDateでtoISOStringから算出する。Context7とinstalled 1.3.1 sourceを事実調査agentが確認済み。

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
