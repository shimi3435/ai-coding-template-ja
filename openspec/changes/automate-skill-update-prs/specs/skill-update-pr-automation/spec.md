## ADDED Requirements

### Requirement: SKAUTO-1 weekly と manual trigger を fail-closed に制御する

automation は MUST weekly schedule を repository variable の exact opt-in で制御し、manual input を宣言済み allowlist へ限定する。

#### Scenario: weekly opt-in が無効である
- **WHEN** schedule event で `SKILLS_AUTO_UPDATE` が exact string `true` ではない
- **THEN** workflow は checkout、remote detection、artifact 作成、branch / PR / issue write を行わず no-op で終了する

#### Scenario: weekly opt-in が有効である
- **WHEN** 毎週月曜 03:17 UTC の schedule event で `SKILLS_AUTO_UPDATE` が exact string `true` である
- **THEN** workflow は read-only detection を開始する

#### Scenario: manual dispatch を行う
- **WHEN** `workflow_dispatch` が宣言済み boolean `resume_closed` だけを渡す
- **THEN** workflow は repository variable に依存せず read-only detection を開始する

#### Scenario: manual input が allowlist 外である
- **WHEN** input key 集合が `resume_closed` 以外を含む、必須 key が欠落する、または値が boolean ではない
- **THEN** workflow は external write 前に usage failure で停止する

#### Scenario: run が重複する
- **WHEN** 同じ repository の automation run が実行中または pending である
- **THEN** 固定 concurrency group は publish を直列化し、write 中 run を cancel しない

### Requirement: SKAUTO-2 現行 updater の公開契約だけから candidate を作る

automation は MUST current updater の JSON schema v1、全 cohort dry-run / apply、status、exit code、transaction を consumer として使い、再定義しない。

#### Scenario: update を preview する
- **WHEN** detection が `task skills:update -- --json` を一時 worktree で実行する
- **THEN** host へ write せず schema v1 report、canonical cohort status、warnings、errors、exit code を保存する

#### Scenario: valid update がある
- **WHEN** preview が update available を示し、updater apply が exit 0 で完了する
- **THEN** automation は同じ一時 worktree の全 cohort 差分を一つの candidate commit と bundle に固定する

#### Scenario: exit 3 専用 route を automation seam から分離する
- **WHEN** current updater が `skills:check --fail-on-update` だけで update available を exit 3 として通知する
- **THEN** automation はこの route を呼ばず、`skills:update` preview の exit 0 と report status から更新を検出する

#### Scenario: updater が失敗する
- **WHEN** command が exit 1 または top-level `failed` を返す
- **THEN** automation は branch / PR を作らず updater-rejected として report を tracking issue 候補にする

#### Scenario: updater成功後の postcondition が壊れている
- **WHEN** command が exit 0 と成功 report を返した後、transaction artifact 残存、managed path 外差分、manifest / bundle / digest 不整合のいずれかを検出する
- **THEN** automation は candidate-invalid として external write 前に停止し、exit 1 / failed も同時に観測した場合だけ updater-rejected を優先する

#### Scenario: license または policy validation が失敗する
- **WHEN** updater の既存 validation が legal hash、redistribution、source、ownership、history を拒否する
- **THEN** automation は opaque errors を改変せず updater-rejected として保持し、独自 subtype を作らず、source / lock を自動修正しない

#### Scenario: 複数 cohort がある
- **WHEN** updater report が複数 cohort を列挙する
- **THEN** automation は current full-cohort apply を一つの PR に集約し、cohort selector や cohort 別 apply を追加しない

### Requirement: SKAUTO-3 detection と validation を read-only permission で隔離する

production workflow は MUST GitHub host に対する detection / validation を read-only にし、write permission を二つの publish jobs だけへ最小付与する。人がfresh approval後にworkflow外で実行するreal-host smoke CLIはSKAUTO-10の別trust boundaryとする。

#### Scenario: detection を実行する
- **WHEN** trigger、PR / issue state、updater report、candidate artifact を検査する
- **THEN** `detect` job は `contents: read`、`pull-requests: read`、`issues: read` だけを持ち、一時 filesystem 以外を変更しない

#### Scenario: draft を publish する
- **WHEN** validated manifest が managed branch / draft PR の作成または更新を要求する
- **THEN** `publish-draft` job だけが `contents: write` と `pull-requests: write` を持つ

#### Scenario: candidate を検証する
- **WHEN** exact candidate SHA の repository checks を実行する
- **THEN** `validate` job は `contents: read` だけを持ち、branch、PR、issue を変更しない

#### Scenario: final state を publish する
- **WHEN** ready state、validation failure summary、tracking issue を更新する
- **THEN** `publish-finalize` job だけが `contents: read`、`pull-requests: write`、`issues: write` を持ち、contents read は branch tip 再検証だけに使う

#### Scenario: upstream job が失敗する
- **WHEN** updater rejection、draft publish failure、または validation failure の recovery / issue state が必要である
- **THEN** `publish-finalize` は明示的な always 条件で実行されるが、weekly opt-out、trigger usage failure、PR partial identity では実行されない

#### Scenario: issue identity conflict 中に PR を finalize する
- **WHEN** issue-identity-conflict があり、PR identity、candidate、validation result、branch tip が全て安全条件を満たす
- **THEN** `publish-finalize` は issue operation だけを skip して workflow summary へ conflict を出し、PR ready 化、draft 維持、PR managed summary 更新を継続する

#### Scenario: issue cardinality conflict 中に PR を finalize する
- **WHEN** strict managed issueが複数openであり、PR identity、candidate、validation result、branch tipが全て安全条件を満たす
- **THEN** `publish-finalize`はissue create / reopen / update / closeだけをskipして全issue numberをsummaryへ出し、PR ready化、draft維持、PR managed summary更新を継続する

#### Scenario: permission 外操作が必要になる
- **WHEN** default `GITHUB_TOKEN` が対象 write を拒否する
- **THEN** workflow は permission-denied として停止し、PAT、GitHub App、別 credential へ fallback しない

#### Scenario: privileged trigger が追加される
- **WHEN** workflow に `pull_request_target` または fork code の privileged execution が混入する
- **THEN** offline contract test は失敗する

### Requirement: SKAUTO-4 candidate artifact を exact commit と run へ束縛する

automation は MUST artifact variant に必要な file と manifest の identity、digest、parent、tree、size を全 write と validation の直前に検証する。

#### Scenario: candidate artifact を生成する
- **WHEN** updater apply が一時 worktree で成功する
- **THEN** `candidate-update` manifest は exact v1 schema の repository ID / full name、run ID / attempt、trigger / base / candidate / tree SHA、create / update publish target、candidate digest、UTC timestamp、exact三file metadataを固定する

#### Scenario: publish targetを固定する
- **WHEN** detectがfully paginated same-repository automation candidate PR履歴からcreate / update / validate対象を選ぶ
- **THEN** manifestはtarget mode、generation、exact head ref、PR number、expected branch tip、managed marker digest、canonical history digestのvariant別必須fieldを固定し、no-opだけmode noneを使う

#### Scenario: PR履歴がpublish前に変化する
- **WHEN** publish直前のfully paginated candidate集合、target generation / ref / PR number、branch tip、marker digestのいずれかがmanifestと一致しない
- **THEN** automationはpublish側で別targetを選び直さず、fresh discoveryがpartial identity、human head、generation / open conflictを証明した場合は各state reducerを優先し、それ以外はcandidate-invalidとしてwrite前に拒否する

#### Scenario: draft publish receiptを生成する
- **WHEN** candidate-updateのdraft branch / PR publishが成功する
- **THEN** publish-draftはactual PR number、manifest / candidate digest、generation / ref / head、post-publish marker / history digestをexact `DraftReceipt`へ固定し、validate / finalizeはreceiptを再検証する

#### Scenario: draft publish receiptが不正である
- **WHEN** publish-draft成功が報告されたのにDraftReceiptが欠落する、48 KiBを超える、schema / manifest digest / post-publish stateが一致しない、またはretention 1日を超える
- **THEN** validate / finalizeはcandidate-invalidとして後続PR / issue write前に停止する

#### Scenario: manifest を canonical encode する
- **WHEN** manifest、PR envelope、issue envelope、または smoke preview を encode / decode する
- **THEN** automation は schema宣言順、variant別array順、whitespaceなしUTF-8、HTML-sensitive escape、末尾改行なしを要求し、再encode bytes不一致、duplicate / missing / unknown key、型・範囲・variant混在を拒否する

#### Scenario: open draft に新しい content がない
- **WHEN** exact managed head を再検証する必要があるが updater 差分がない
- **THEN** manifest は `preview-report.json` だけを持つ exact `existing-head-validation` variant として candidate SHA / tree、validate target、既存 candidate digestを固定し、finalize前に同じhistory / PR / branch / marker stateを再検証する

#### Scenario: publish も再検証も不要である
- **WHEN** 新規 update がなく、再検証対象の draft もない
- **THEN** manifest は `preview-report.json` だけを持ち candidate field を持たない exact `no-op` variant になり、write / validation を要求しない

#### Scenario: artifact が改変または混線する
- **WHEN** repository ID / full name、run ID / attempt、digest、commit parent、candidate tree、expected head のいずれかが current context と一致しない
- **THEN** publish / validation は candidate-invalid として external write 前に停止する

#### Scenario: 同じ workflow run を rerun する
- **WHEN** workflow run ID は同じだが workflow run attempt が異なる artifact を受け取る
- **THEN** automation は旧 attempt の artifact を candidate-invalid として拒否し、別 repository ID の artifact も再利用しない

#### Scenario: artifact が巨大である
- **WHEN** artifact variant に存在する thin bundle、preview report、apply report、manifest の regular file raw bytes 非圧縮合計が100 MiBを超える、または download 後の許可 file 集合 / digest / 合計が一致しない
- **THEN** automation は upload または bundle import / publish を行わず candidate-invalid として報告し、exact 100 MiB だけを許可する

#### Scenario: managed summary が巨大である
- **WHEN** PR または issue の managed section がUTF-8 48 KiBを超える
- **THEN** automation はbounded summary、省略件数、full report digest、workflow run URLを記録し、切り詰めた値をidentityに使わない

#### Scenario: artifact に外部文字列を含める
- **WHEN** updater error、warning、cohort key を manifest、machine envelope、またはhuman summaryに埋め込む
- **THEN** automation はcanonical JSON string literalとHTML-sensitive character escapeを適用し、raw HTMLやmarker tokenとして解釈させない

#### Scenario: artifact retention が終了する
- **WHEN** 生成から1日を超える、または run が完了する
- **THEN** artifact は将来 run の承認済み candidate として再利用されない

### Requirement: SKAUTO-5 managed PR を draft-first と append-only で更新する

automation は MUST managed identity と exact head を確認した PR だけを draft-first、normal fast-forward push、no-auto-merge で更新する。

#### Scenario: 初回 update を publish する
- **WHEN** open managed PR がなく valid candidate がある
- **THEN** 次 generation branch を normal push し、managed marker を持つ draft PR を作成する

#### Scenario: managed PR identity を判定する
- **WHEN** head / base repository ID が current repository、base ref が current default branch、branch が `automation/skill-updates/gNNNNNN`、title が exact `chore(skills): update vendored skills`、body が一組の v1 PR marker を持つ
- **THEN** automation は exact `PrEnvelope` の repository、generation、head / base ref、expected head、validation base、candidate / report digest、validation tagged union と canonical bytes の strict validation 後だけ managed PR とみなす

#### Scenario: cross-repository PR が automation identity を模倣する
- **WHEN** head または base repository ID が current repository と異なる PR が managed branch、title、markerを模倣する
- **THEN** automation はそのPRを候補外として変更せず cardinalityから除外し、workflow summaryへwarningだけを出す

#### Scenario: same-repository candidate の base ref が current default branch と異なる
- **WHEN** head / base repository ID が current repositoryで、managed branch、exact title、v1 markerのいずれかが一致するPRのbase refがcurrent default branchと異なる
- **THEN** automationはそのPRをhistory digestとidentity判定へ含め、`pr-identity-conflict`としてtracking issueを含む全external write、managed remote cleanup、自動修復を停止し、新PRを作らない

#### Scenario: PR managed section を生成する
- **WHEN** automation が draft、validation failure、またはready stateを記録する
- **THEN** marker間の先頭1行にcanonical `PrEnvelope`、空行後にbounded human summaryを置き、updater report本文はmachine identityへ含めずfull report digestで束縛する

#### Scenario: automation identity が部分一致する
- **WHEN** same-repository PR の branch namespace、exact title、v1 marker のいずれかが一致するが、marker / envelope が欠落・重複・破損している、または branch / title / generation / repository / ref が整合しない
- **THEN** automation は `pr-identity-conflict` とし、tracking issue を含む全 external write、managed remote cleanup、自動修復を行わず、workflow summary だけへ記録し、local temporary resource は cleanup する

#### Scenario: automation identity が全く一致しない
- **WHEN** branch namespace、exact title、v1 marker のいずれにも一致しない PR がある
- **THEN** automation はその PR を unmanaged として変更せず、managed PR cardinality から除外する

#### Scenario: open updater PR を更新する
- **WHEN** branch、generation、marker、remote tip、expected head が一致し、新 candidate がある
- **THEN** ready PR は先に draft へ戻され、candidate commit は normal fast-forward push で append される

#### Scenario: human または external commit がある
- **WHEN** strict managed identity を証明済みだが remote branch tip だけが marker の expected head SHA と一致しない
- **THEN** author 表示に関係なく intervention-required とし、branch / PR / remote cleanup を変更せず、strict managed tracking issue への記録だけを許可する

#### Scenario: managed PR が複数 open である
- **WHEN** generationが一意だがexact managed identityを持つopen PRが複数ある
- **THEN** automationはopen-pr-conflictとし、全open memberをgeneration→PR number順のpr set scopeへ入れ、latestを選ばずPR / branch / remote cleanupを停止する

#### Scenario: validation が成功する
- **WHEN** read-only validation が exact candidate SHA と trigger SHA の integration state で全 required checks に成功し、branch tip が変化していない
- **THEN** `publish-finalize` は PR を ready for review にし、merge、approval、merge queue 登録を行わない

#### Scenario: validation が失敗する
- **WHEN** merge conflict、`task check`、focused test のいずれかが失敗する
- **THEN** PR は draft のまま維持され、failed command と candidate SHA が managed summary と tracking issue に記録される

#### Scenario: validation infrastructure が失敗する
- **WHEN** checkout、artifact、runner、timeout、cancelのいずれかでrequired command resultを得られない
- **THEN** validationはclosed stageを持つinfrastructure failure、automation stateは`recovery-required`となり、command名を推測せずPRをdraftのまま維持してready化しない

#### Scenario: finalizeされないpending validationを次runが検出する
- **WHEN** `publish-finalize`が起動せずPrEnvelopeがpendingのまま残り、そのpending runが既に完了してvalidate継続中でない
- **THEN** 次runのread-only detectionは`recovery-required`としてready化を禁止し、activeなvalidation runのpendingとは区別する

#### Scenario: 禁止された history operation が混入する
- **WHEN** workflow に force push、`--force-with-lease`、`+refspec`、rebase、auto-merge が追加される
- **THEN** offline contract test は対象 path と禁止 token を報告して失敗する

### Requirement: SKAUTO-6 closed-unmerged と既存 PR の状態遷移を保護する

automation は MUST open、draft、ready、merged、closed-unmerged、intervention の各状態から許可された遷移だけを実行する。

#### Scenario: latest managed PR を選択する
- **WHEN** 全 PR 履歴の pagination と strict identity validation が完了する
- **THEN** 同一generationのstrict managed PRが複数ならgeneration-conflictをopen-pr-conflictより優先し、重複generationに属する全memberをsorted pr set scopeへ入れてlatestを選ばずPR / branch / remote cleanupを停止し、重複がなくopenも高々一件なら最大generationをlatestとする

#### Scenario: generation conflict解消後も複数openが残る
- **WHEN** fresh runでgeneration重複は解消したがgeneration一意のstrict managed open PRが複数ある
- **THEN** automationはopen-pr-conflictへ遷移し、任意の代表PRへscopeを縮退しない

#### Scenario: closed-unmerged PR を schedule が検出する
- **WHEN** 最新 managed PR が merge されず close されている
- **THEN** schedule は paused-closed を報告し、新 branch / PR を作らない

#### Scenario: closed-unmerged PR を通常 manual run が検出する
- **WHEN** `workflow_dispatch.resume_closed` が false で最新 managed PR が closed-unmerged である
- **THEN** run は paused-closed を維持し、新 branch / PR を作らない

#### Scenario: closed-unmerged PR を明示 resume する
- **WHEN** `workflow_dispatch.resume_closed` が true で最新 managed PR が closed-unmerged であり、fresh detection が成功する
- **THEN** automation は過去最大値+1の generation branch から新しい draft PR を作成できる

#### Scenario: resume flag を誤用する
- **WHEN** `resume_closed` が true だが最新 managed PR が closed-unmerged ではない
- **THEN** workflow は external write 前に usage failure で停止する

#### Scenario: open draft に新 content がない
- **WHEN** open managed PR の exact head に updater change がなく、前回 validation が未成功である
- **THEN** automation は同じ head を再検証し、green の場合だけ ready にできる

#### Scenario: open ready に新 content がない
- **WHEN** open managed PR が ready、head が exact match、updater change がない
- **THEN** workflow は PR state を変更せず no-op にする

#### Scenario: merged generation がある
- **WHEN** 最新 managed PR が merged で新 update がある
- **THEN** automation は次 generation を使い、merged branch cleanup を独立 guard の下で扱う

### Requirement: SKAUTO-7 failure と不明状態を安全に復旧する

automation は MUST updater rejection、validation failure、permission denial、partial publish、unknown post-state、cleanup failure を区別し、自動上書きや無制限 retry を行わない。

#### Scenario: updater rejection が起きる
- **WHEN** updater が schema、source、history、license、policy、transaction error を返す
- **THEN** branch / PR write を行わず opaque report を updater-rejected として保持し、policy / license subtype を作らない

#### Scenario: draft publish の途中で失敗する
- **WHEN** branch push または draft PR mutation の応答が失敗する
- **THEN** workflow は remote head と PR state を再読込し、expected-before または exact candidate を証明できる場合だけ一度の冪等再試行を許す

#### Scenario: publish 後状態を証明できない
- **WHEN** remote head / PR / issue が expected-before と candidate-after のいずれにも一致しない
- **THEN** recovery-required とし、後続 write、自動 retry、ready 化を停止する

#### Scenario: test failure が起きる
- **WHEN** exact candidate の validation が失敗する
- **THEN** candidate branch と draft PR を保持し、次 run の同一 head 再検証を許す

#### Scenario: permission denial が起きる
- **WHEN** publish operation が default token の permission error を返す
- **THEN** exact対象operationとclosed post-state `unchanged` / `applied` / `unknown`を記録し、403では`unchanged`を要求してcredential fallbackを行わない

#### Scenario: permission denial contractを検証する
- **WHEN** production default `GITHUB_TOKEN`のpermission denial経路を検証する
- **THEN** offline fake 403 transcriptでexact operation、`unchanged` post-state、write retryとcredential fallbackの不存在を決定論的に検証し、operator credentialを弱めるreal-host smokeを完了条件にしない

#### Scenario: cleanup failure が起きる
- **WHEN** 安全条件を満たす resource の cleanup が失敗する
- **THEN** ready / merged 状態を巻き戻さず cleanup-failed を tracking issue に残し、次 run で guard を再評価する

### Requirement: SKAUTO-8 tracking issue を重複なく更新する

automation は MUST exact title、hidden marker、managed section、scope tagged union の stable entry key により open tracking issue を高々一つに保つ。

#### Scenario: open strict managed issue が一つある
- **WHEN** unresolved automation state を publish する
- **THEN** marker 間だけを更新し、marker 外の人の本文を保持する

#### Scenario: strict managed issue identity を判定する
- **WHEN** title が exact `Skill update automation requires attention` で body が一組の v1 issue marker を持つ
- **THEN** automation は exact `IssueEnvelope` の repository ID / full name、entry key順、entry schema、canonical bytes の strict validation 後だけ strict managed issue とみなす

#### Scenario: issue managed section を生成する
- **WHEN** automation が unresolved entries を issue へ記録する
- **THEN** marker間の先頭1行に schema version、kind、repository identity、key昇順の exact entriesを持つcanonical `IssueEnvelope`、空行後にbounded human summaryを置く

#### Scenario: issue entry を検証する
- **WHEN** `IssueEntry` を decode または更新する
- **THEN** automation は closed `FailureState`、strict `Scope`、immutable first-seen、更新可能last-seen、detail digest、non-empty bounded summary、stable key再計算一致を要求し、updater内部report fieldを再定義しない

#### Scenario: summary専用stop stateをissue entryへ入れる
- **WHEN** `pr-identity-conflict`、`issue-identity-conflict`、`issue-cardinality-conflict`のいずれかをstateに持つIssueEntryをdecodeする
- **THEN** automationはunknown FailureStateとして拒否し、これらをworkflow summaryだけへ記録する

#### Scenario: managed issue identity が部分一致する
- **WHEN** exact title、v1 start marker、v1 end marker のいずれかが存在するが、title / marker pair / schema が全整合しない
- **THEN** automation は issue-identity-conflict とし、issue create / reopen / update / close を停止して workflow summary だけへ記録し、安全な PR / branch lifecycle は継続する

#### Scenario: open strict managed issue がない
- **WHEN** unresolved state があり closed strict managed issue が存在する
- **THEN** 最大 issue number の一件を reopen して更新し、新規 duplicate issue を作らない

#### Scenario: issue candidate が一件もない
- **WHEN** unresolved state があり strict managed issue も partial identity candidate も存在しない
- **THEN** automation は strict managed issue を一件だけ作成する

#### Scenario: open strict managed issue が複数ある
- **WHEN** exact managed identity の open issue が複数ある
- **THEN** automationはissue-cardinality-conflictとして任意のissueを上書きせずissue operationだけを停止し、全issue numberを昇順でworkflow summaryへ出して安全なPR / branch lifecycleを継続する

#### Scenario: 同じ failure を再検出する
- **WHEN** schema version、automation state、strict scope tagged union の canonical JSON から作る stable entry key が既存 entry と一致する
- **THEN** duplicate row を追加せず last-seen metadata だけを更新する

#### Scenario: failure scope を生成する
- **WHEN** failure が whole operation、cohort、PR のいずれかに属する
- **THEN** automationは`global`のclosed operation、現行updaterのexact cohort key、またはsingle PRのgeneration / numberか2件以上のgeneration→number順member setだけをkey inputにする

#### Scenario: PR set scopeを生成する
- **WHEN** generation-conflictまたはopen-pr-conflictをtracking entryへ記録する
- **THEN** automationは重複なし2件以上のmembersをgeneration、次にPR number昇順へcanonicalizeし、generation-conflictは重複generation所属member、open-pr-conflictは全open memberを含める

#### Scenario: managed resource scope を生成する
- **WHEN** failure が managed branch または既存 tracking issue に属する
- **THEN** automation は `branch` と exact `refs/heads/automation/skill-updates/gNNNNNN`、または `tracking-issue` と exact `issues/<positive-safe-integer>` だけを resource scope にする

#### Scenario: candidate scope を生成する
- **WHEN** failure が exact candidate に属する
- **THEN** automation は UTF-8 canonical JSON `{"schemaVersion":1,"baseHeadSha":"...","candidateTreeSha":"...","applyReportDigest":"sha256:..."}` を SHA-256 にし、`sha256:<64 lowercase hex>` を使い、run ID、timestamp、candidate commit SHA、bundle digest を除外する

#### Scenario: failure scope を一意に選択する
- **WHEN** 一つの failure が複数 scope の identity を持つ
- **THEN** automation は candidate integrity / validation、known resource operation / cleanup、PR lifecycle、cohort 固有 failure、identity なし global operation の順で最初に一致する scope 一つだけを使い、issue 作成前 failure は global(publish-finalize)、cohort identity なし updater failure は global(detect) にする

#### Scenario: failure scope が不正である
- **WHEN** scope variant の必須 field が欠落する、unknown field がある、または別 variant の field が混在する
- **THEN** automation は tracking issue を更新せず recovery-required として停止する

#### Scenario: 別 run で同じ failure を検出する
- **WHEN** run ID / attempt、timestamp、detail、summaryだけが異なり automation state とscopeが一致する
- **THEN** これらのmetadataをdedupe keyへ含めず、first-seenを保持して既存entryのlast-seen / detail / summaryだけを更新する

#### Scenario: failure が解消する
- **WHEN** outstanding entry の state が fresh run で解消される
- **THEN** managed section から entry を除き、0件なら解消済み表示にするが issue を自動 close しない

#### Scenario: managed section が壊れている
- **WHEN** marker が欠落、重複、逆順、または schema 不正である
- **THEN** automation は人の本文を推測修復せず write を停止する

### Requirement: SKAUTO-9 temporary resource と managed branch を guarded cleanup する

automation は MUST local temporary resource を全終了経路で削除し、remote branch は merged ownership を証明した場合だけ削除する。

#### Scenario: job が成功または失敗する
- **WHEN** 一時 worktree、bundle 展開、artifact download、updater transaction directory を作成した
- **THEN** `always()` cleanup は対象を明示列挙して削除し、残存検査を行う

#### Scenario: merged branch を cleanup する
- **WHEN** PR が merged、branch / generation / marker / exact head が一致し、open PR が参照していない
- **THEN** `publish-draft` は対応 managed branch だけを削除できる

#### Scenario: closed-unmerged branch がある
- **WHEN** managed PR が merge されず close されている
- **THEN** automation は branch を自動削除せず pause / recovery evidence として保持する

#### Scenario: human intervention がある
- **WHEN** branch tip または marker が expected state と一致しない
- **THEN** cleanup は対象 branch / PR / issue を変更しない

#### Scenario: 同じ candidate を再実行する
- **WHEN** candidate SHA、managed PR head、issue entry が既に expected state である
- **THEN** duplicate commit、PR、issue、ready transition を作らず no-op にする

### Requirement: SKAUTO-10 offline validation と承認付き real-host smoke を完了条件にする

repository は MUST automation contract を offline `task check` で検証し、real GitHub write smoke は人の fresh approval 後だけ実行する。

#### Scenario: offline repository check を実行する
- **WHEN** dependency 導入済み環境で `task check` を実行する
- **THEN** trigger、input allowlist、permissions、state reducer、artifact integrity、draft-first ordering、no-force / no-auto-merge、issue dedupe、cleanup guard を network なしで検証する

#### Scenario: workflow contract が弱められる
- **WHEN** read-only job の write permission、publish job の過剰 permission、禁止 trigger / history operation、marker bypass が混入する
- **THEN** offline test は対象 path と違反 contract を示して非ゼロ終了する

#### Scenario: real write smoke を準備する
- **WHEN** real repository で lifecycle を検証する必要がある
- **THEN** production automationを無効にした専用test repositoryで、read-only previewはexact `SmokePreview` v3としてnormal / recovery mode、repository ID / full name、run ID / attempt、base commit、source first parent / commit、UTC timestamp、non-emptyなunique symbolic resource keyとexisting / planned locator、実行順step、各stepのnon-emptyなbefore / after resource observation、semantic checkpoint、各present state本体と再計算一致するdigestを列挙し、canonical raw bytes 48 KiB以下でdigestを表示する

#### Scenario: smoke runをsource commitへ束縛する
- **WHEN** CLIがSmokePreviewに既存workflow run ID / attemptとsource commitを入れる
- **THEN** read-only APIでrunのrepository、ID、attempt、head SHAを取得し、`run.head_sha == sourceCommit`をpreview生成前とapproval後write開始時に要求して、不在または不一致を拒否する

#### Scenario: normal smokeのPR作成可能性を束縛する
- **WHEN** CLIがnormal modeのread-only previewを生成する
- **THEN** default branch tipをbase commit、source commitのdistinct first parentをsource parentへ束縛し、complete compare結果がbaseからsource parentへの`ahead`かつ`ahead_by >= 1`かつ`behind_by == 0`である場合だけpreviewを生成し、approval後write開始時にも同じ値を要求する

#### Scenario: planned resourceを作成して後続操作へ束縛する
- **WHEN** previewが未採番PRまたはissueのcreateと後続operationを含む
- **THEN** 最初のcreate応答をrepository / locator検証後にsymbolic keyへ一度だけ束縛し、後続operationは同じkeyからactual numberを解決し、再束縛、descriptor差替え、create前参照を拒否する

#### Scenario: smoke transitionを検証する
- **WHEN** SmokeStepのoperation、primaryKey、before / after observationをdecodeする
- **THEN** before / afterを同じsorted unique key集合としprimaryKeyをexactly once含め、resource kindとnormalized value kind、valueのcanonical digestを一致させた上で、primary branchはcreate / update / delete、primary PRはcreate / update / draft / ready / close / reopen、primary issueはcreate / update / close / reopenの閉じた行列だけを許可し、PR openはmerged=false、PR reopenはclosed-unmergedだけ、draft / readyはdraftだけ、close / reopenはstateだけを変えてその他fieldを保持し、updateはlifecycle不変を要求する

#### Scenario: open PR branch appendのcross-resource副作用を束縛する
- **WHEN** primary branchをopen PR参照中にfast-forward appendするstepをdecodeして実行する
- **THEN** 同stepのbefore / afterにbranchとPRを含め、branch SHAとPR head SHAを同じold SHAから同じnew SHAへ変更しPRの他fieldを保持することをpreview digest、write直前、write直後に要求し、一resourceでも不在、不一致、partialならstep全体をunknownとして停止する

#### Scenario: post-write observationが一時的にstaleである
- **WHEN** 承認済みtargetへのwrite応答はexact afterと一致するが、直後のlive after全resource読取がnormalized stateまたはactual numberだけ不一致になる
- **THEN** executorは500 ms間隔で最大10回までafter全resourceをread-only再取得し、exact一致後だけ次stepへ進み、試行回数をevidenceへ記録する。write、before / identity検証、write応答、API errorはretryせず、上限まで一致しなければapprovalを失効させてrecoveryへ停止する

#### Scenario: merged PRをsmokeでreopenする
- **WHEN** existing PRのnormalized stateがclosedかつmerged=trueでreopen targetを持つ、またはplanned PRのterminal closeがmerged=trueである
- **THEN** decoderはwrite前に拒否し、planned PRのterminal stateはclosedかつmerged=falseだけを許可する

#### Scenario: PRとissueのcreate / close postconditionを検証する
- **WHEN** PRまたはissueのcreate / close targetをdecodeする
- **THEN** PR createはabsentからopen / draft / unmerged、issue createはabsentからopenだけ、PR closeはopen / unmergedからdraftその他fieldを保持したclosed / unmerged、issue closeは他fieldを保持したopenからclosedだけを許可し、違反previewをwrite前に拒否する

#### Scenario: smoke descriptorとnormalized state identityを照合する
- **WHEN** present before / after observationを持つSmokeStepをdecodeする
- **THEN** branch ref、planned PRのhead / base ref、planned issue titleをdescriptorとnormalized valueでexact matchさせ、existing PR / issueはexact numberから取得したlive stateを同じvalueへ正規化し、identity不一致をwrite前に拒否する

#### Scenario: smoke operation sequenceを検証する
- **WHEN** 同じsymbolic keyを複数stepが観測し、planned resourceのlifecycleとcleanupをdecodeする
- **THEN** key別step列の各after observationは次のbefore observationとbyte-identical、normal modeではplanned resourceをprimaryにするcreateは先頭でexactly once、existing resourceのcreateは禁止、planned branchはdelete / absent、planned PR / issueはclose / presentかつclosedで終了し、step外side effect、矛盾、cleanup欠落をwrite前に拒否する

#### Scenario: recovery previewを構築する
- **WHEN** 前回の承認済みprocessが失敗しreserved branch、strict smoke PR、strict smoke issueのいずれかが残存する
- **THEN** 別processはlive stateをread-only再観測して同じrepository / run / source commitへexactに束縛できるpresent residual resourceだけをv3 recovery modeへ含め、create / update / ready / reopenを禁止し、必要なPR draft、PR / issue close、branch deleteだけをterminal方向へ並べ、branch deleteには同run / sourceへ本文で束縛されたstrict smoke PRまたはissueのpresent相関を要求し、最後のcleanup checkpointへ全対象resourceを束縛する

#### Scenario: branch-only residualのrun ownershipを証明できない
- **WHEN** reserved branchが許可SHAでpresentだが、同run / source commitへ本文で束縛されたstrict smoke PRまたはissueがpresentでない
- **THEN** canonical recovery previewはbranch deleteを生成せずread-onlyで停止し、live repository / ref / SHAとexact delete commandを列挙する別のmanual previewに対する人のfresh approvalなしではcleanupしない

#### Scenario: semantic checkpointを検証する
- **WHEN** previewとlive execution evidenceからdraft、validation failure、append、human intervention、ready、pause、resume、issue dedupe、cleanupを判定する
- **THEN** normal modeは各checkpoint kindをexactly once、recovery modeはcleanupだけをexactly once、存在step index、同step内sorted unique resource keyへ束縛し、operation名や固定phase labelだけでは成功にせず、validation failureはlive strict managed envelopeのcommand failure、appendはopen PRとbranchのcoupled transition、human interventionはappend後live PRに対するproduction reducerの`intervention-required`、issue dedupeは同一actual number、cleanupは全対象resource terminal stateから証明する

#### Scenario: real write smoke を開始する
- **WHEN** 人がpreview全文とdigestを見た同じ対話・同じ実行cycleで、そのdigestを明示してfresh approvalを与える
- **THEN** workflow外のhuman-operated CLIは既存operator `gh auth` sessionを使い、一つのprocessでpreview全文とdigestを表示して同じTTY / stdinからexact digestを受けた後だけ、canonical preview全体、repository、run、source commit、各resourceの最初のbefore stateを検証し、各step直前にbefore全resource、直後にafter全resourceを検証して承認済みplanだけを順に実行する

#### Scenario: smoke CLIのcredential境界を検証する
- **WHEN** real-host smoke CLIを起動する
- **THEN** production workflowのpermissionとdefault `GITHUB_TOKEN`契約を変更せず、`gh` child processへ非credential環境の明示allowlistだけを渡してambient `GH_TOKEN` / `GITHUB_TOKEN` / enterprise tokenその他未列挙環境を転送せず、既存operator `gh auth` sessionだけを使い、新しいPAT / GitHub App、repository保管credential、approval artifactを作らず、EOF、空または不一致digestではwrite seamを呼ばない

#### Scenario: approval がないまたは古い
- **WHEN** fresh approvalがない、新しい対話へ移った、run / attempt、source commit、対象resource、初期before state、operation順が変化した、processが終了した、operationが失敗した、または同じpreviewを別processで再利用する
- **THEN** workflowは承認を失効させreal GitHub writeを実行せずsmokeを未完了に保ち、approval credentialや永続approval artifactを作らない

#### Scenario: approval guard を offline test する
- **WHEN** real-host smoke のoffline contract testを実行する
- **THEN** human approval自体を偽装せず、preview exact schema / digest、stale state拒否、未承認時write seam未呼出だけを検証する

#### Scenario: smoke または cleanup が失敗する
- **WHEN** state transition、dedupe、resource cleanup のいずれかを証明できない
- **THEN** CLI processは即停止して残存resourceを記録し、同じpreviewを失効させ、別processがlive residual stateから構築したv3 recovery previewとfresh approvalまでwrite / cleanupを再開せず、completion gateを未完了としてmock / offline greenだけで代替しない

#### Scenario: OpenSpec CLI がlocal環境にない
- **WHEN** executorがCLI不在の環境で未完了taskを再開する
- **THEN** automationは自動installせずMarkdown artifactsとcheckboxを正本に依存順実行を継続し、strict validationを未検証と記録する

#### Scenario: CLI不在環境からTask 10を完了する
- **WHEN** local strict validationが未検証である
- **THEN** 同じsource commitに対するCIまたは別環境のfresh `task openspec:validate` green evidenceが得られるまでTask 10検証checkboxを完了にしない
