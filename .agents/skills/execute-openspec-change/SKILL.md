---
name: execute-openspec-change
description: OpenSpec change を fail-closed で preflight し、tasks.md の依存順に直接実装・検証・進捗更新する。
---

# Execute OpenSpec Change

利用者による明示呼出自体を、OpenSpec change の実装と必要な reviewer / verifier の順次起動を承認した
ものとして扱う。追加 preview 承認を要求しない。proposal、design、spec delta、受け入れ基準、
`spec-holes` を仕様の正本、`tasks.md` を実装順序、進捗、検証状態、復帰位置の正本として直接実行する。

以下を順番に行う。fail-closed とし、不成立条件を推測や自動修復で補わない。
開始前に[共通workflow](../../../docs/agents/workflow.md)を読む。task形式・選択・進捗、blocker記録、review・検証・完了の正本は同書であり、このSkillはpreflight・dirty保護・再開を所有する。

## 1. preflight

4条件を全て確認するまで repository を変更しない。

1. **active change が exactly one**
   - repository real path を確定し、`openspec/changes/` 直下の active change directories を列挙する。
   - 0件または複数件なら候補を列挙し、対象を推測せず停止する。
2. **必須 OpenSpec artifacts が valid**
   - `openspec/project.md` の repository policy を読む。
   - `proposal.md` と `tasks.md` を必須とし、policy または proposal が要求する `design.md` と
     `specs/<capability>/spec.md` も確認する。
   - 必須 file の欠落、空 file、repository 外 path、壊れた Markdown 構造、requirement 先頭行の
     MUST / SHALL 欠落を拒否する。OpenSpec CLI が利用可能なら validation を追加できるが、CLI の
     在席を preflight 成否条件にしない。
3. **spec-holes に未解決判断がない**
   - canonical artifacts に spec-holes audit が存在し、repository policy が要求する分類を全て扱うことを
     確認する。
   - `Open Questions`、TODO、TBD、利用者確認待ち、選択未確定、仕様未反映の穴が一つでもあれば、
     該当箇所を示して停止する。「なし」と明記された項目は解決済みとして扱う。
4. **詳細 tasks が valid**
   - [tasks.mdの最小契約](../../../docs/agents/workflow.md#tasksmd-の最小契約)の全条件を検証する。
   - execution constraints、task entry、各field、IDと依存、対象pathの構文・解決・重複順序を
     省略せず確認する。形式を推測・補正せず、不成立なら変更前に拒否する。

失敗時は条件名、該当 path / task、未成立理由を報告し、code、tests、docs、checkbox を変更しない。

## 2. dirty overlap

`git status --porcelain=v1 -z` 相当で tracked / untracked dirty paths を取得する。未完了 task の対象 path
を repository-relative path として解決し、dirty paths との exact match または directory containment を
調べる。初回実行では対象 path と重なる既存差分を利用者所有として扱う。

- 重複があれば、自動 stash、上書き、commit を行わず、重複 path を列挙して停止する。
- dirty 差分が対象外だけなら、無関係 dirty 差分を保持して続行する。変更、整形、削除、復元しない。
- ignored files は対象外とする。ただし task が ignored path を明示対象にしている場合は曖昧な ownership
  として停止する。

開始時の対象外 dirty paths と digest を記録し、後続の self-review と検証で利用者差分を自分の差分へ
混在させない。

未完了taskを残して呼出を終了する場合、全完了task、実装済み・検証未完了task、およびsafe boundary後に
file変更済みだが実装 checkbox が未完了の実装途中 taskが変更したrepository-relative
`executor-owned paths` を統合し、各pathを最後に変更した task と対応付けた
`累積 executor-owned snapshot` を先頭の実行可能な未完了task直下へ記録する。各pathのfile type、mode、
bytesまたはsymlink target、削除markerから `post-task diff digest` を算出する。`tasks.md` 自身はresume
metadata行を除いた内容でdigestを算出し、自己参照を避ける。古いsnapshotは置換し、同じpathは最後に変更した
taskのdigestだけを保持する。skillが制御できる `orderly stop` では、実装途中 taskを
`implementation-in-progress` 状態として停止前に記録する。この記録はセッション復帰用ownershipであり
review evidenceではない。

再呼出では、現在のpath集合とdigest が累積executor-owned paths / post-task diff digestと全て一致する場合だけ
executor自身の差分と判定する。実装済み・検証未完了taskは検証から再開し、完了taskの記録済みdirty pathが
後続の未実装 task対象と重なる場合も実装を続行する。digest が一致しない、snapshot記録外pathが重なる、
ownership記録が欠落する場合は利用者変更との区別不能として重複pathを示し、変更前に停止する。
`implementation-in-progress` のpath集合とdigestが一致する場合は同じ実装途中 taskの実装を継続する。
process killやhost crashなどの `abrupt termination` ではsnapshot更新を保証できない。再呼出時の未記録差分は
executor所有と推測せず、dirty overlapとしてfail-closedで停止する。

preflight と dirty overlap の両方が成功した時点を `safe boundary` とする。
preflight または dirty overlap の失敗は `report-only` とし、`tasks.md` を含むrepositoryを変更しない。
safe boundary後の `task execution blocker` は[実行・進捗・blocker記録](../../../docs/agents/workflow.md#実行進捗blocker記録)
に従って記録し、必要なら検証完了を取り消す。停止時には上記ownership snapshotを保存する。

## 3. task 実行と再呼出

safe boundary通過後は[実行・進捗・blocker記録](../../../docs/agents/workflow.md#実行進捗blocker記録)に従い、
依存済みのtaskを実装・検証し、結果に応じてtasks.mdを更新する。別のstate / roadmap / manifestを作らない。

再呼出ではpreflightとdirty overlapを再実行する。完了済み task を再実行しない。
実装済み・検証未完了のtaskは検証から再開する。validation入力が変わっていればstale evidenceを再利用しない。
実装途中taskの再開可否は上記ownership規則で決める。

## 4. review・検証・報告

[共通review手順](../../../docs/agents/workflow.md#bounded-review-convergence)と
[検証・証跡・完了条件](../../../docs/agents/workflow.md#validation-cadence-と-reusable-green-evidence)に従う。
正式なproject gateは `./scripts/check.sh`。self-reviewの指摘を受けた修正・検証・tasks.md更新は実行担当が所有する。
必要なreviewer / verifier以外の追加 executorは、[配分規則](../../../docs/agents/workflow.md#agent-allocation)に従い
別の明示承認を得る。共通の停止条件に達した場合、ownership snapshotを保存して停止する。

最終報告には完了task、未完了task / blocker、変更file、commandと結果、未検証項目を含める。
全実装・検証checkboxが完了していない限りarchive-ready / close-readyと報告しない。完了状態の定義は
[workflowの引き渡し条件](../../../docs/agents/workflow.md#完了状態と引き渡し)に従い、implementation complete、
archive-ready、close-ready、archive completeを区別する。必要なreview・verifier・project gateの欠落や既知blockerが
ある場合もarchive-ready / close-readyではない。PRレビュー待ち・未確認の場合はその状態を併記し、レビュー収束を
確認するまでclose/archive不可と報告する。全checkbox完了だけでarchive completeを宣言しない。
運用モードと次操作を明示し、下流は`archive-ready / next: archive`、テンプレート保守は
`close-ready / next: deletion close`と報告する。close-readyは保守側の引き渡し表現であり、archiveの許可ではない。

次のclose/archive操作は明示されたrepository policyに沿って案内する。下流では
[同一PRのarchive手順](../../../docs/agents/workflow.md#下流の-archive-フロー)へ引き渡す。
会話・承認済み仕様の運用選択を引き継ぎ、未選択ならarchive-ready / close-ready判定を保留する。
その場合は実装完了・検証結果と完了操作の選択待ちを報告し、close/archiveの前に停止する。
実装・検証の開始条件は変更しない。選択と必要手順の存在は[運用選択](../../../docs/agents/workflow.md#完了操作の運用選択)に従う。
テンプレート自身の削除型closeは専用保守手順を明示選択した場合だけ案内し、repository名・remote・
保守文書の存在から推測しない。自動archive・自動削除は行わず、利用者の明示操作またはarchive workflowへ委ねる。
本Skillはactive change専用であり、archive後修正はworkflowの手順で保存済みchangeを直接扱う。

## 5. 操作境界

不可逆操作、外部 write、承認済みOpenSpecを超える仕様拡張が必要なら利用者承認まで停止する。
再計画と新cycleは[停止・再計画](../../../docs/agents/workflow.md#停止再計画)に従う。

次のGit操作は利用者の別の明示依頼まで実行しない。

- `stash`
- `commit`
- `push`
- `pull-request`
- `merge`

branch切替、reset、clean、利用者差分の復元も自動実行しない。
