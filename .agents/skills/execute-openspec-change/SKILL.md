---
name: execute-openspec-change
description: OpenSpec change を fail-closed で preflight し、tasks.md の依存順に直接実装・検証・進捗更新する。
---

# Execute OpenSpec Change

利用者による明示呼出自体を、OpenSpec change の実装と必要な reviewer / verifier の順次起動を承認した
ものとして扱う。追加 preview 承認を要求しない。proposal、design、spec delta、受け入れ基準、
`spec-holes` を仕様の正本、`tasks.md` を実装順序、進捗、検証状態、復帰位置の正本として直接実行する。

以下を順番に行う。fail-closed とし、不成立条件を推測や自動修復で補わない。

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
   - `Execution Constraints section` は `## Execution Constraints` から次のheadingまでとする。
     同 section は exactly 3 項目とし、最初の CI parity、停止・再計画条件、一時 artifact cleanup を
     それぞれ1回だけ要求する。欠落、重複、余剰があれば拒否する。
   - `## Tasks` section に task entry を1件以上要求する。task が0件なら実装対象と完了条件を確定できないため
     拒否する。
   - 各 task に成果、依存、対象、実装 checkbox、検証 checkbox を要求する。
   - 対象pathの各項目は単一の Markdown inline code span として記述する。code span内の値は
     trim または Unicode 正規化をせず exact に保持し、Unicodeと空白を許可した上でrepository-relative
     pathとして検証する。閉じていない code span、code span外のpath値、一項目内の複数の code spanは拒否する。
   - task ID の重複、未知の依存、自己依存、循環依存、曖昧または repository 外の対象 path、壊れた
     checkbox を拒否する。
   - 全taskの対象pathを解決し、異なるtask間で exact match または directory containment がある場合、
     一方から他方へ推移的な依存 path が存在することを要求する。依存関係で順序化されない重複は拒否する。

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

preflight と dirty overlap の両方が成功した時点を `safe boundary` とする。preflight または dirty overlap の失敗は
`report-only` とし、`tasks.md` を含むrepositoryを変更しない。safe boundary通過後の `task execution blocker` は、
停止前に理由と再開条件を該当task直下へ記録する。選択済みtaskの実装・検証blockerはそのtask、依存循環などで
実行可能taskがない場合は文書順で先頭の未解決 task、reviewまたはproject checkのblockerは先頭の未完了 validation task
へ記録する。未完了validation taskがなければ、文書順で最後の taskへ記録する。
initial / diff review、project check、verifier のblockerを記録するtaskに完了済みの検証 checkboxがある場合、
停止前にその検証 checkbox と親 task を未完了へ戻す。blocker 解消後の新しい evidenceが成功した場合だけ、
両checkboxを再度完了へ更新する。

## 3. task 実行

依存が全て完了した先頭の未完了 task を選ぶ。文書順の先頭が実行不能なら skip し、次の実行可能 task
を選ぶ。未完了 task があるのに実行可能 task がない場合、循環依存または blocker を文書順で先頭の未解決 task
直下へ記録して停止する。

task ごとに次を行う。

1. canonical artifacts、成果、対象、受け入れ条件を読む。
2. 適用可能なら TDD の一つの vertical slice として failing test / 再現 probe を先に作る。
3. task の成果に必要な最小変更だけを実装する。
4. diff と成果を確認し、実装 checkbox を完了へ更新する。
5. 指定された focused validation を実行する。
6. validation が成功したら検証 checkbox を完了へ更新する。task の実装 checkbox と検証 checkbox が
   両方完了した場合だけ親 task を完了へ更新する。

環境制約または validation failure の場合、実装 checkbox は完了にできるが、検証 checkbox は未完了の
まま理由を task 直下へ記録し、change close を禁止する。focused validation と代替静的検証が構造上非該当
の場合だけ、N/A 理由を記録して検証 checkbox を完了できる。

各 task 完了後に `tasks.md` を保存し、次の依存済み未完了 task へ進む。途中停止時も完了済み checkbox を
保持する。別の state / roadmap / manifest を作らない。

### 再呼出

再呼出時は preflight と dirty overlap を再実行する。完了済み task を再実行しない。実装済み・検証未完了
の task は検証から再開する。validation 入力が実装後から変化した場合は stale evidence を再利用せず、
最新入力で実行する。

## 4. review と project checks

全変更で self-review と適用可能な focused validation を行う。独立 review / verifier の発火条件は
`AGENTS.md` の OSWF-5 だけから読む。列挙条件に該当する場合、明示呼出時の承認に基づき次の順序で実行する。

1. self-review。
2. initial independent review。
3. blocker finding の fix → focused validation → diff review を最大3 iterations。
4. 最新入力の `task check`。
5. initial reviewer と別の独立 verifier。

3 iterations 後の未解決 blocker、同一役割・task の agent 連続2回失敗、同じ環境・command・入力で
再現した2回目の infrastructure failure、verifier blocker は成功扱いせず停止する。verifier blocker 後の
fix は利用者が新 cycle を承認するまで開始しない。

高リスク条件に該当しない場合、self-review、適用可能な focused validation、通常の final checks で
完了判定し、独立 reviewer / verifier を起動しない。

明示呼出が承認するagent起動は必要なreviewer / verifierだけである。追加 executor は独立・非重複・
個別検証可能な実装単位でも、起動前に別の明示承認を得る。承認までは同じexecutorが継続する。

## 5. safety boundary

不可逆操作、外部 write、または承認済み OpenSpec を超える仕様拡張が必要になった時点で、完了済み
checkbox を保持して利用者承認まで停止する。影響と OpenSpec 更新案を提示し、承認後にだけ仕様、
spec-holes、validation、tasks を更新する。

この skill は次の Git 操作を利用者の別の明示依頼まで実行しない。

- `stash`
- `commit`
- `push`
- `pull-request`
- `merge`

branch 切替、reset、clean、利用者差分の復元も自動実行しない。

## 6. report

実行した focused test、review、project check、verification は command、結果、source commit、
fresh実行 / green evidence再利用の別、未検証理由の要約だけを対応 task 直下の `tasks.md` へ記録する。
生 log、一時 report、tool 固有 state は追跡しない。

最終報告には完了 task、未完了 task / blocker、変更 file、実行 command と結果、未検証項目を含める。
全実装・検証 checkbox が完了していない限り change 完了を宣言しない。
