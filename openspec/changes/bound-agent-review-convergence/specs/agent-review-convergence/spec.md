## ADDED Requirements

### Requirement: bounded review topology

実行主体は、OpenSpec 直接経路では1 change、GSD 経路では1 phase を単位として、固定した全スコープ inventory に対する self-review 1回、initial full review 1回、最大3回の blocker fix iteration、別の fresh reviewer による final full review 1回、全体 check、同じ cycle の executor / reviewers と別の独立 verifier の順で convergence cycle を実行しなければならない（SHALL）。

全スコープ inventory は cycle 開始時に、担当変更ファイル、canonical spec と acceptance criteria、直接依存と
直接利用元、関連 tests / fixtures、触れた trust boundary を固定する。無関係な repository 全体、過去 report、
全 `.planning` は含めない。initial reviewer は finding の diff review を継続し、final reviewer は initial reviewer
と別の fresh agent とする。initial review が clean でも final full review は省略しない。final review の finding
修正後は final reviewer が差分と直接依存だけを再 review し、全スコープ review は再反復しない。

self-review の inventory は tracked unstaged diff、staged diff、base branch との差分に加え、
`git ls-files --others --exclude-standard` で未追跡 file を列挙して内容を検査し、ignored file は除外する。
large / binary file に固定 size cap は設けず、path、size、type を確認する。全文を安全に読めない場合、または
tool 出力が truncation したか不明な場合は未検証として扱う。その file が full-scope 内で required evidence なら
欠落を blocker とし、scope 外または optional なら理由と影響を記録する。

1 iteration は、未解決 blocker finding 一式の修正、focused validation、変更差分と直接依存の review が完了した
組を指す。finding 件数では数えず、initial review 開始後から final review と全体 check の収束完了までの総数を
3回以内とする。self-review と full review 自体は iteration に数えない。RED test / 再現 probe の先行は
correctness / contract defect だけに必須とする。純 prose の事実誤りは矛盾 evidence と非テスト理由を記録し、
mechanical typo / format / unused import は RED を要求せず focused validation だけを行う。blocker は severity label ではなく、
acceptance criteria / MUST / SHALL の未達、correctness / security / data loss / trust boundary の欠陥、必須 validation
の失敗、必須 evidence の欠落、または安全な merge / phase completion を許可できない状態で判定する。style nit、
主観的 refactor、独立 hardening は blocker ではなく、defer または dismiss して cycle を延長しない。

#### Scenario: clean な実装を2回の全スコープ review で確認する

- **WHEN** self-review 後の initial full review が clean であり、入力変更がない
- **THEN** 別の fresh reviewer が同じ inventory を final full review し、追加の full review は行わない

#### Scenario: blocker finding を差分 review で閉じる

- **WHEN** initial または final full review が blocker finding を報告する
- **THEN** 同じ未解決集合を修正し、focused validation と当該差分・直接依存の review が完了した時点で1 iteration と数える

#### Scenario: finding を意味で分類する

- **WHEN** reviewer の severity label と blocker の意味分類が一致しない
- **THEN** severity label ではなく acceptance、correctness、安全性、必須 validation / evidence、merge 安全性で blocker を判定する

#### Scenario: correctness finding を反証可能にする

- **WHEN** correctness または contract finding を修正する
- **THEN** RED test または再現 probe を先に用意し、純 prose の事実誤りを機械検査できない場合だけ矛盾箇所、修正前 evidence、テスト化しない理由を記録する

#### Scenario: untracked file を self-review inventory に含める

- **WHEN** tracked diff に現れない未追跡 file が working tree に存在する
- **THEN** `git ls-files --others --exclude-standard` で列挙して内容を検査し、ignored file は inventory から除外する

#### Scenario: large または binary file の全文を安全に検査できない

- **WHEN** 固定 size cap を設けず path / size / type を確認したが、全文を安全に読めないか truncation の有無が不明である
- **THEN** full-scope 内の required evidence なら blocker とし、scope 外または optional なら未検証の理由と影響を記録する

#### Scenario: mechanical defect を focused validation だけで閉じる

- **WHEN** finding が correctness / contract defect ではなく mechanical typo、format、unused import のいずれかである
- **THEN** RED test / probe を要求せず、修正後の focused validation で閉じる

### Requirement: validation cadence and reusable green evidence

実行主体は、各 blocker fix で対象に近い focused validation を行い、全 review 収束後の最新入力に対して全体 `task check` を原則1回だけ実行し、同一 command の入力同一性を証明できる green evidence だけを再利用しなければならない（MUST）。

green evidence は少なくとも実行 command と exit 0、source commit、検証入力を含む dirty diff digest または
検証後に input files が無変更である同等の証明、lockfile、build / CI 設定、対象 fixture の identity を持つ。
再利用は同一 repository real path、worktree、source snapshot、dependency environment、command と、認証、locale、
OS などその command に影響する環境の同一性を確認できる場合に限る。別環境でも同一性を証明できる場合だけ例外とし、
入力範囲または環境影響が不明なら再実行する。判定は command 単位であり、`task check` と
`task openspec:validate` の evidence を相互に代用しない。証跡だけの変更も当該 command が読むなら再利用できない。

standalone self-review が既存の必須 full-check gate を再利用する場合も、最低限として実行 command と exit 0 を
確認し、上記の source commit、dirty diff digest または不変証明、依存・設定・fixture・環境 identity をすべて
維持する。一項目でも不明なら再実行する。bounded convergence cycle 内の self-review は full check を要求せず、
修正後は focused validation だけを行う。

acceptance criteria、MUST / SHALL、project gate に必要な evidence が欠落する場合、または evidence の required 性が
不明な場合は blocker とする。理由と影響を伴う未検証を non-blocker として許せるのは optional seam、明示的な
out-of-scope、研究環境制約に限り、未検証を検証済みへ読み替えない。

全体 check が source / test failure になった場合は blocker finding として残 iteration へ戻し、修正、focused validation、
diff review、全体 check 再実行を行うが、full review は再実行しない。source 修正のない infrastructure / flaky failure は
iteration に数えず、同一入力の自律 retry は1回だけ許す。再現すれば soft-stop する。source または test を変更すれば
通常 iteration と数える。focused test で隔離できない integration finding は理由を記録して `task check` を使用でき、
その後入力が変わらなければ収束後の全体 check evidence として再利用できる。

#### Scenario: verifier が全体 check を再利用する

- **WHEN** verifier が直前の green `task check` と現在状態について command 単位の入力・環境同一性を確認できる
- **THEN** verifier は同じ全体 check を再実行せず、acceptance evidence と focused / 実動作 seam の充足を独立確認する

#### Scenario: standalone self-review が green evidence を再利用する

- **WHEN** standalone self-review が既存の必須 full-check gate を報告する
- **THEN** 実行 command、exit 0、その他すべての identity を確認し、同一なら再利用し、一項目でも不明なら再実行する

#### Scenario: required 性が不明な evidence が欠落する

- **WHEN** acceptance criteria、MUST / SHALL、project gate に関係する evidence が欠落し、required 性を確定できない
- **THEN** blocker として扱い、optional seam、明示的 out-of-scope、研究環境制約へ勝手に分類しない

#### Scenario: optional seam を未検証として残す

- **WHEN** evidence が optional seam、明示的 out-of-scope、研究環境制約のいずれかに属する
- **THEN** 理由と影響を記録した未検証として non-blocker にできるが、検証済みとは報告しない

#### Scenario: command が読む証跡を変更する

- **WHEN** `tasks.md` checkbox など証跡だけを変更したが、対象 command がそのファイルを入力として読む
- **THEN** その command の evidence は無効とし、入力にしない別 command の evidence だけを再利用できる

#### Scenario: full check が source failure になる

- **WHEN** review 収束後の `task check` が source または test の欠陥で失敗する
- **THEN** 残 iteration 内で修正と focused validation と diff review を行い、full review を反復せず `task check` を再実行する

#### Scenario: infrastructure failure が再現する

- **WHEN** source 修正のない同一入力で infrastructure / flaky failure が1回の retry 後にも再現する
- **THEN** iteration は消費せず、失敗を blocker として soft-stop し、成功へ読み替えない

#### Scenario: pre-merge close 後に影響する command だけを再実行する

- **WHEN** strict target validate、全 change validate、全体 check、verifier の後に retrospective と tasks を更新し、対象 change directory を削除する
- **THEN** 変更入力に影響する command を再実行し、削除 artifacts が `task check` の入力でないことを契約検査済みならその evidence を再利用し、`task openspec:validate` で active change 0 と green を確認する

### Requirement: proportional agent allocation

実行主体は、一体の change または phase の material implementation を原則1 executor に継続させ、initial reviewer、別の fresh final reviewer、同じ cycle の executor / reviewers と別の独立 verifier を各1名割り当て、distinct verification value または独立実装単位がない agent を追加してはならない（SHALL NOT）。

executor が利用可能で健全なら finding fixer として再利用し、終了、失敗、context contamination の場合だけ fixer を
1名追加して以後の iterations を継続させる。finding ごとに fresh fixer を作らない。成果ゼロ、無応答、採用しない部分差分は
iteration を消費せず、部分差分を採用した場合は focused validation と diff review の完了時に1 iteration と数える。同じ役割の
連続失敗2回、または working state の安全性を確認できない場合は soft-stop する。

main 実行主体は各 material task の成果を検証してから `tasks.md` を更新し、`STATE`、`ROADMAP`、checkbox、report path の
機械的補正を処理する。agent の追加は独立・非重複・個別検証可能な
実装単位、agent failure、context contamination に限り、並列化自体を理由にしない。独立単位は実行予算に記録した場合だけ
並列化できるが、review、fix、final review、verification は規定順序で直列に行う。ユーザーが vendored `code-review` skill を
明示選択した場合だけ Standards / Spec の2軸を distinct verification value のある例外配分として記録し、追加の標準 reviewer
を重ねない。

#### Scenario: executor が finding 修正を継続する

- **WHEN** initial reviewer が blocker finding を報告し、executor の context と working state が健全である
- **THEN** 同じ executor が fixer を継続し、finding ごとの fresh agent は追加しない

#### Scenario: 独立単位だけを並列化する

- **WHEN** 実行予算に独立・非重複・個別検証可能な material implementation units が記録される
- **THEN** その units だけを並列 executor へ割り当て、統合後は同じ convergence cycle で review する

#### Scenario: agent が部分成果だけを残す

- **WHEN** agent failure 後の部分差分を採用する
- **THEN** working state を既知に戻して focused validation と diff review を完了した時点で1 iteration と数え、追加理由を記録する

#### Scenario: vendored code-review を明示選択する

- **WHEN** ユーザーが vendored `code-review` skill を明示選択する
- **THEN** Standards / Spec の2軸を例外 reviewer 配分として記録し、同じ initial review に標準 reviewer を追加しない

#### Scenario: main が機械的補正を処理する

- **WHEN** 実装または review の完了状態を `STATE`、`ROADMAP`、checkbox、report path へ反映する必要がある
- **THEN** material executor や追加 agent を割り当てず、main 実行主体が成果検証後に機械的補正を処理する

#### Scenario: 新 cycle で既存 verifier を再利用する

- **WHEN** soft-stop 後の新 cycle で、旧 cycle の verifier が executor / reviewers と別役割のまま、fix に関与せず、context contamination もなく、現在入力との evidence identity を再確認できる
- **THEN** 追加 verifier を生成せず既存 verifier を再利用し、最新 `task check` と acceptance evidence を独立再確認できる

### Requirement: soft stop and replanning

実行主体は、3 iterations 後に blocker が残る場合、仕様判断が必要な場合、承認済み scope 外の material expansion を検出した場合、同じ役割の連続 agent failure が2回発生した場合、working state の安全性を確認できない場合、または許可された retry 後も infrastructure failure が再現する場合に、成功扱いせず直ちに soft-stop しなければならない（MUST）。

material expansion は trust boundary、公開 API、永続データ形式 / migration、runtime dependency / lockfile、build / CI /
配布経路、独立出荷可能な成果、OpenSpec change、GSD phase、外部依存の追加・拡張を含む。承認済み scope 内の変更は
それだけで停止条件にしない。soft-stop は cycle と iteration `3/3`（該当時）、未解決 blockers、各 iteration の追加差分、
focused tests と最新 green evidence、使用 agent と追加理由、停止理由、継続・再計画・別 change 化・中断の選択肢を、
既存 phase review / fix report または応答へ記録する。専用 state / report file は新設しない。

人間が継続を選んでも単に追加3回を承認したものとして扱わず、scope、残予算、review inventory を再計画し、iteration を
0へ戻した新しい convergence cycle として full scope review から開始する。仕様判断が必要な blocker は推測修正せず、
未解決 finding、選択肢、影響 scope、既実行 evidence を提示する。恒久的な効果測定は既存 Issue または retrospective の
どちらか一方へ、`soft-stop: cycle=<n> iterations=<n> full-checks=<n> added-agents=<n> reason=<理由>` の optional suffix を
1行だけ記録し、重複記録しない。

#### Scenario: iteration budget を使い切る

- **WHEN** 3回目の fix / focused validation / diff review 後も blocker が残る
- **THEN** blocker を成功扱いせず所定の evidence と選択肢を報告して停止する

#### Scenario: 人間が継続を選ぶ

- **WHEN** soft-stop 後に人間が継続を選ぶ
- **THEN** scope、残予算、inventory を再計画し、iteration 0と新しい最大3 iterationsを持つ cycle として initial full-scope review から開始し、必要な差分収束、別 reviewer の final full review、全体 check、独立 verifier の順で実行する

#### Scenario: 仕様判断が必要になる

- **WHEN** blocker 修正に未確定の仕様判断が必要になる
- **THEN** iteration を消化する推測修正を行わず、選択肢と影響と evidence を提示して即時 soft-stop する

#### Scenario: material expansion を検出する

- **WHEN** 承認済み scope 外で material expansion を検出する
- **THEN** 現在の iteration 数に関係なく即時 soft-stop し、change 分割または実行経路を再判定する

#### Scenario: 非 blocker finding だけが残る

- **WHEN** acceptance と project checks が green で、残 finding が style nit、主観的 refactor、独立 hardening だけである
- **THEN** finding を defer または dismiss し、外部 Issue を自動作成せず別 Issue / change 候補の文面だけを提示して cycle を延長しない
