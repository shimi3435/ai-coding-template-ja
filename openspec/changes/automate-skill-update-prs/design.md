## Context

現行 updater の公開入口は `skills:check` と `skills:update` である。JSON output は `schemaVersion: 1`、
top-level status、canonical order の cohorts、warnings、errors、exit code 0 / 1 / 3 を返す。`skills:update` は
既定 dry-run、`--apply` だけが transaction を実行する。apply は宣言済み全 remote cohorts を一つの global
preflight 後に依存順で扱い、cohort selector や candidate file export は提供しない。

automation はこの interface の consumer とする。一時 worktree で public command を実行して candidate commit を
作り、Git bundle と manifest を job 間 artifact にする。updater の source / lock / cohort / transaction を別実装
しない。upstream catalog discovery も行わない。

GitHub Actions では permission を job ごとに固定する。job 実行途中に write permission を read-only へ縮小できない
ため、利用者承認済み判断に従い、draft 作成と ready 化を別 publish job に分け、その間の validation job を
read-only にする。

## Goals / Non-Goals

**Goals:**

- weekly automation を既定無効にし、manual dispatch と schedule gate を機械検証する。
- updater の stable JSON と full-cohort apply をそのまま消費して candidate を作る。
- managed PR を draft-first、append-only、no-force で更新する。
- human intervention、closed-unmerged、updater rejection、test failure、cleanup failure を fail-closed に扱う。
- tracking issue を一つの managed identity に集約し、人の本文を保護する。
- mocked / offline validation と、人の fresh approval 後だけ行う real-host smoke を分離する。

**Non-Goals:**

- updater に cohort selector、catalog discovery、別 JSON field、別 exit code を追加しない。
- upstream code、vendored script、hook を automation 中に実行しない。
- private upstream や追加 credential を探索しない。
- PR を自動 merge、approve、rebase、force update しない。
- malformed marker、human commit、duplicate managed resources を自動修復しない。

## Decisions

### 1. trigger と concurrency を固定する

schedule は、利用者が2026-08-20に承認した `17 3 * * 1`（毎週月曜 03:17 UTC）とする。最初の gate は
`vars.SKILLS_AUTO_UPDATE == 'true'` の exact comparison を行い、不一致なら checkout、remote detection、artifact、
external write を行わず no-op で終了する。manual `workflow_dispatch` は variable に依存せず利用できる。

manual input は `resume_closed` 一つだけで、`type: boolean`、`required: true`、default `false` とする。event payload の
input key 集合と boolean 型を最初の read-only job で再検証し、unknown key や string 代替を write 前に拒否する。
`resume_closed: true` は managed PR の最新状態が closed-unmerged の場合だけ有効で、それ以外は usage failure にする。

workflow は repository 単位の固定 concurrency group を使い、`cancel-in-progress: false` とする。同時 publish を許さず、
superseded pending run の cancellation は write 開始前なら安全な no-op として扱う。各 job に timeout を設定する。

### 2. updater の公開契約を consumer 境界にする

detection は現行 branch state を一時 worktree に作る。open managed PR がなければ trigger 時の default branch SHA、
open managed PR があれば marker に記録された exact head SHA を起点にする。次を public command として実行する。

1. `task skills:update -- --json` で副作用なし preview を得る。
2. update がある場合、同じ一時 worktree で `task skills:update -- --apply --json` を実行する。
3. exit 0 と machine report の成功状態、transaction artifact 不在、managed path 以外の差分不在を確認する。
4. normal commit を作り、candidate commit、親 SHA、tree SHA、preview / apply report digest、bundle digest を manifest に固定する。

`skills:check --fail-on-update` の exit 3 は update 検出であり error ではないが、automation seam はこの command を
呼ばない。automation が呼ぶ `skills:update` preview / apply は exit 0 / 1 だけを受理し、exit 0 の report status で
update available を判定する。exit 1 または top-level `failed` は、transaction artifact 残存など updater が返した
error detail を含めて `updater-rejected` とし、candidate branch / PR を作らない。exit 0 と成功 report の後に automation
postcondition が transaction artifact 残存、managed path 外差分、manifest / bundle / digest 不整合を検出した場合は
`candidate-invalid` とする。両方が観測された場合は updater の公開結果を優先して `updater-rejected` とする。legal hash
mismatch や policy failure も updater の既存 `errors` をそのまま保持し、automation が free-form error text を解析して
新分類を捏造しない。

現行 apply は全 remote cohorts を一つの run で扱うため、PR も一つの automation stream に集約する。PR body と
tracking issue は cohort report を canonical order で表示する。cohort ごとの branch / apply option は追加しない。

### 3. candidate artifact を exact commit に束縛する

automation 所有 JSON は次の primitive を共有する。

- `Sha`: exact `[0-9a-f]{40}`。
- `Digest`: exact `sha256:[0-9a-f]{64}`。
- `DecimalId`: exact `[1-9][0-9]{0,19}` の positive ASCII decimal string。
- `PositiveSafeInteger`: 1 以上 `Number.MAX_SAFE_INTEGER` 以下の JSON integer。
- `Generation`: 1 以上999999以下の JSON integer。
- `RepositoryFullName`: exact `github.repository` と一致する `owner/name`。
- `UtcTimestamp`: millisecond 付き UTC RFC 3339 `YYYY-MM-DDTHH:mm:ss.sssZ`。表示 metadata だけに使う。
- `RunRef`: exact keys `{workflowRunId: DecimalId, workflowRunAttempt: PositiveSafeInteger}`。

全 object は下記 schema に列挙した key だけを持ち、optional key を持たない。tagged union は variant の key 混在を
拒否する。encoder は schema 宣言順で object を再構築し、配列を schema ごとの指定順に並べ、`JSON.stringify` の
whitespace なしUTF-8 bytesを出す。文字列中の `<`、`>`、`&` はそれぞれ lowercase `\u003c`、`\u003e`、`\u0026`
へ置換し、末尾改行を付けない。decoder は UTF-8不正、BOM、duplicate / missing / unknown key、型・範囲不正に加え、
decode後の再encode bytesが入力と一致しない非canonical表現を拒否する。

job 間 artifact は `manifest.json` と manifest variant が許可する payload file だけを含む。exact v1 schema は次の
tagged union とする。

```text
ArtifactFile = {name: string, byteLength: PositiveSafeInteger, digest: Digest}
PublishTarget =
  {mode: "create", generation: Generation, headRef: string, expectedBranch: {state: "absent"}, historyDigest: Digest}
  | {mode: "update", generation: Generation, prNumber: PositiveSafeInteger, headRef: string, expectedBranch: {state: "present", sha: Sha}, markerDigest: Digest, historyDigest: Digest}
  | {mode: "validate", generation: Generation, prNumber: PositiveSafeInteger, headRef: string, expectedBranch: {state: "present", sha: Sha}, markerDigest: Digest, historyDigest: Digest}
  | {mode: "none", historyDigest: Digest}

CandidateUpdateManifest = {
  schemaVersion: 1,
  kind: "candidate-update",
  repositoryId: DecimalId,
  repository: RepositoryFullName,
  run: RunRef,
  triggerSha: Sha,
  baseHeadSha: Sha,
  candidateSha: Sha,
  candidateTreeSha: Sha,
  target: PublishTarget,
  candidateDigest: Digest,
  createdAt: UtcTimestamp,
  files: [ArtifactFile, ArtifactFile, ArtifactFile]
}

ExistingHeadValidationManifest = {
  schemaVersion: 1,
  kind: "existing-head-validation",
  repositoryId: DecimalId,
  repository: RepositoryFullName,
  run: RunRef,
  triggerSha: Sha,
  baseHeadSha: Sha,
  candidateSha: Sha,
  candidateTreeSha: Sha,
  target: PublishTarget,
  candidateDigest: Digest,
  createdAt: UtcTimestamp,
  files: [ArtifactFile]
}

NoOpManifest = {
  schemaVersion: 1,
  kind: "no-op",
  repositoryId: DecimalId,
  repository: RepositoryFullName,
  run: RunRef,
  triggerSha: Sha,
  baseHeadSha: Sha,
  target: {mode: "none", historyDigest: Digest},
  createdAt: UtcTimestamp,
  files: [ArtifactFile]
}

DraftReceipt = {
  schemaVersion: 1,
  kind: "published-draft",
  repositoryId: DecimalId,
  repository: RepositoryFullName,
  run: RunRef,
  manifestDigest: Digest,
  candidateDigest: Digest,
  generation: Generation,
  prNumber: PositiveSafeInteger,
  headRef: string,
  headSha: Sha,
  markerDigest: Digest,
  historyDigest: Digest,
  createdAt: UtcTimestamp
}
```

`candidate-update.files` は name の ASCII 昇順で `apply-report.json`、`candidate.bundle`、
`preview-report.json` の三件、他二 variant は `preview-report.json` 一件だけとする。`manifest.json` は自己digestを
持たず `files` に含めないが、artifact size合計には含める。`candidate-update` の candidate commit は親を
`baseHeadSha` 一件だけとし、`candidateDigest` は既定の schema-order canonical JSON
`{schemaVersion:1,baseHeadSha,candidateTreeSha,applyReportDigest}` の SHA-256 とする。`applyReportDigest` は exact
`apply-report.json` file entry の digest である。`candidate-update.target` は `create | update` だけ、
`existing-head-validation.target` は `validate` だけを許可する。後者は既存 marker の `candidateDigest` を保持し、
`candidateSha` と `target.expectedBranch.sha` の一致を要求する。全 `headRef` は target generation と一致する exact
`refs/heads/automation/skill-updates/gNNNNNN` とする。create targetは履歴0件ならgeneration 1、それ以外はfully paginated履歴の過去最大generation+1と
branch absentを要求する。update targetはselected strict managed PRとgeneration / PR number / refを一致させ、
`expectedBranch.sha == baseHeadSha`を要求する。validate targetはさらに
`expectedBranch.sha == baseHeadSha == candidateSha`を要求する。

`historyDigest` は fully paginated same-repository automation candidate PR集合から作る。current default branch と異なる
base ref を持つ candidate も集合から除外しない。各memberはexact keys
`{prNumber,state,merged,headRepositoryId,headRef,headSha,baseRepositoryId,baseRef,titleDigest,bodyDigest}` を持ち、
`state` は `open | closed`、repository IDは`DecimalId`、title / body digestはraw UTF-8 bytesのDigestとする。memberを
PR number昇順にし、canonical `{schemaVersion:1,repositoryId,members}` のSHA-256を取る。`state=open`と
`merged=true`の矛盾、duplicate / unsafe PR number、pagination cursor欠落はfail-closedに拒否する。API body `null`は
empty UTF-8 bytesとしてdigestする。cross-repository PRと三要素が
全不一致のunmanaged PRはmembersから除外する。pagination不完全時はartifactを生成しない。

`publish-draft` はwrite直前に履歴を再列挙し、manifestのhistoryDigest、target generation / ref / PR number、expected
branch tip、managed section raw UTF-8 `markerDigest`を全て一致させる。draft publish成功後はactual PR numberを含む
`DraftReceipt`を作り、candidate manifest raw bytesのdigest、post-publish marker / history digestへ束縛する。
`draft-receipt.json` はUTF-8 48 KiB以下、retention 1日、上記exact schemaだけを許可する。

`validate` と `publish-finalize` はcandidate update経路ではDraftReceipt、bundleなし既存head再検証経路ではmanifestの
validate targetを使う。finalize直前に履歴を再列挙し、receiptまたはmanifestのhistoryDigest、generation / ref / PR number、
head SHA、marker digestを全て一致させる。一つでも変化した入力はcandidate-invalidとしてwrite前に拒否し、publish側で
別targetを選び直さない。ただしfresh discoveryがPR partial identity、strict identityのhuman head、generation-conflict、
open-pr-conflictを証明した場合は、generic digest mismatchより先に各state reducer規則を適用する。

`repositoryId`、`repository`、`workflowRunId`、`workflowRunAttempt` は current context と全段で一致させる。同じ
workflow run の rerun でも attempt が異なる artifact は再利用しない。`triggerSha` は event SHA、`baseHeadSha` は
candidate生成を開始した exact commit とする。

PR と issue の managed section はそれぞれ UTF-8 48 KiB 以下に制限する。超過時は canonical order の先頭から
bounded summary を残し、省略件数、full report digest、workflow run URL を記録する。切り詰めた文字列を state
identity や dedupe key に使わない。human summary 内の updater由来文字列は canonical JSON string literal として
表示し、`<`、`>`、`&` を同じUnicode escapeへ置換する。raw HTML と marker token を生成しない。

artifact は上記 strict tagged union とする。`candidate-update` は thin bundle を必須とする。open draft に新しい
content がない場合の `existing-head-validation` は exact managed head を固定し、bundle を持たない。新規 update も
再検証対象の draft もない `no-op` は publish / validation を要求しない。variant 間の field 混在は拒否する。

publish / validation は artifact の workflow run ID、全 digest、commit parent、candidate tree、expected branch tip を
再検証する。artifact size は variant に存在する upload 対象の thin bundle、preview report、apply report、manifest の
regular file raw bytes 合計とする。upload 前と download 後の bundle import 前に、許可 file 集合、各 digest、非圧縮合計を
検証する。exact
100 MiB は許可し、超過、extra / unknown file、不一致、欠落、generation overflow は write 前に拒否する。
artifact retention は1日とし、secret、token、authorization header を含めない。

### 4. managed PR identity と generation を固定する

branch は `automation/skill-updates/gNNNNNN` とし、generation は1から始まる6桁 decimal とする。PR body の machine
envelope は次の exact v1 schema とする。

```text
ValidationState =
  {status: "pending", run: RunRef}
  | {status: "passed", run: RunRef}
  | {status: "failed", run: RunRef, failureKind: "command", command: string}
  | {status: "failed", run: RunRef, failureKind: "infrastructure",
      stage: "checkout" | "artifact" | "runner" | "timeout" | "cancelled" | "unknown"}

PrEnvelope = {
  schemaVersion: 1,
  kind: "managed-pr",
  repositoryId: DecimalId,
  repository: RepositoryFullName,
  generation: Generation,
  headRef: string,
  baseRef: string,
  expectedHeadSha: Sha,
  validationBaseSha: Sha,
  candidateDigest: Digest,
  reportDigest: Digest,
  validation: ValidationState
}
```

`headRef` は exact `refs/heads/automation/skill-updates/gNNNNNN`、`baseRef` は current default branch の exact
`refs/heads/<name>` とし、generation と headRef の数字を一致させる。`validation.status` が `pending` の variant は
`run`だけを持ち、`failureKind` / `command` / `stage`を持たない。`passed` は `run` だけ、command failureは`run`、
`failureKind=command`、non-empty `command`だけ、infrastructure failureは`run`、`failureKind=infrastructure`、closed
`stage`だけを持つ。draft は`pending | failed`、ready は `passed` だけを許可する。`validationBaseSha` は検証時にlocal mergeするdefault branchの
exact head、`reportDigest` はcandidateを生成したapply reportのdigestとし、bundleなし再検証では既存値を保持する。

PR title は exact `chore(skills): update vendored skills` とする。managed section は
`<!-- skill-update-pr-automation:pr:v1:start -->` と
`<!-- skill-update-pr-automation:pr:v1:end -->` の間を `canonical PrEnvelope 1行`、空行、bounded human summary の
順にする。human summary は updater report の canonical cohort順を表示するだけで machine identity に含めず、
`PrEnvelope.reportDigest` が full report を束縛する。marker は各一件、start が end より前であることを要求する。

全履歴の PR を read-only で列挙する。最初に head repository ID と base repository ID が current `repositoryId` と
一致する same-repository PR を、base ref に関係なく automation identity 判定へ入れる。cross-repository PR は title /
branch / marker が類似しても候補外として変更せず、cardinality から除外して warning だけを workflow summary へ出す。

same-repository PR の branch namespace、exact title、v1 marker のいずれか一つでも automation identity に一致する PR を
automation candidate とし、base ref が current default branch と異なる場合も history digest へ含める。candidate の marker
欠落・重複・破損、envelope schema / canonical bytes 不正、または branch / title / generation / repositoryId / repository /
headRef / baseRef 不一致は `pr-identity-conflict` とする。この
partial identity では tracking issue を含む全 external write、managed remote cleanup、自動修復を停止し、workflow summary
だけへ記録する。local temporary resource の `always()` cleanup は継続する。三要素のいずれにも一致しない PR だけを
unmanaged として無視する。strict managed PR は open で高々一つを要求し、generation一意の複数openは
`open-pr-conflict` とする。新 PR は
過去最大 generation + 1 を使う。最大 `999999` を超える場合は停止する。

open PR を更新する前に remote branch tip が marker の expected head SHA と exact match することを再検証する。
strict managed identity を証明済みで tip だけが不一致なら、author 表示にかかわらず human / external commit とみなし、
branch、PR、remote cleanup を変更しない。別途 strict identity を証明した managed tracking issue への記録だけを許可する。
正常時は candidate commit を normal fast-forward push で append し、`--force`、`--force-with-lease`、`+refspec`、
rebase を使わない。

### 5. draft-first lifecycle を4段階 jobで実現する

job の順序と permission は次の通りとする。

1. `detect`: `contents: read`、`pull-requests: read`、`issues: read`。trigger / state / updater / artifact を検証し、
   external write を行わない。一時 worktree 内の local mutation だけを許す。
2. `publish-draft`: `contents: write`、`pull-requests: write`。state と artifact を fresh recheck し、managed branch を
   normal push して draft PR を作成または更新する。既存 ready PR に新 commit を追加する場合は、push 前に draft へ戻す。
3. `validate`: `contents: read`。exact candidate SHA を checkout し、trigger SHA の default branch を local merge
   した統合状態で `task check` と automation focused tests を実行する。merge / check command非ゼロはcommand failure、
   checkout、artifact、runner、timeout、cancelはinfrastructure failureとする。
4. `publish-finalize`: `contents: read`、`pull-requests: write`、`issues: write`。candidate SHA と branch tip を再検証し、validation が
   green の場合だけ ready for review にする。failure では draft を維持し、PR managed section と tracking issue を更新する。

`publish-finalize` は `if: always()` と明示的な opt-out guard を組み合わせ、updater rejection、draft publish failure、
validation failure でも必要な recovery / issue state を処理する。ただし weekly opt-out、trigger usage failure、PR partial
identity では起動せず、write を行わない。`issue-identity-conflict` では `publish-finalize` を起動し、issue operation だけを
skip して workflow summary へ conflict を出し、安全な PR ready 化、draft 維持、PR managed summary 更新を継続する。
`issue-cardinality-conflict` も同じissue-only guardを使う。

command failureは`validation-failed`としてdraftを維持する。infrastructure failureは`recovery-required`としてdraftを維持する。
cancel等で`publish-finalize`自体が起動しなければenvelopeの`pending`を変更しない。次runのread-only detectionは、`pending.run`が
既に完了したrunでvalidate継続中でないことを確認した場合だけ`recovery-required`へ分類し、ready化を禁止する。command名や
infrastructure stageを観測情報なしに推測しない。

production workflowのtop-level と各 job で明示していない permission は `none` とする。`contents: read` は finalize 直前の remote branch
tip 照合だけに使う。`pull_request_target`、fork code の privileged 実行、
PAT、GitHub App は使わない。production workflowではpublish jobs以外はbranch、PR、issueを変更しない。workflow外の
human-operated smoke CLIは第10節の既存operator `gh auth`境界だけを使う。

### 6. existing PR の状態遷移を fail-closed にする

- **open / exact managed head / update available:** 同じ branch に normal commit を appendし、draftへ戻して再検証する。
- **open / exact managed head / no new content / draft:** 既存 head を再検証し、green の場合だけ ready にできる。
- **open / exact managed head / no new content / ready:** write なしで維持する。
- **open / PR partial identity:** `pr-identity-conflict`。tracking issue を含む全 external write、managed remote cleanup、
  自動修復を停止し、workflow summary だけへ記録する。local temporary resource は通常どおり cleanup する。
- **open / strict managed identity / head 不一致:** `intervention-required`。PR / branch / remote cleanup を変更せず、strict managed
  tracking issue への記録だけを許可する。
- **closed-unmerged:** `paused-closed`。schedule と通常 manual run は新 PR を作らない。
- **closed-unmerged + manual `resume_closed: true`:** fresh detection 後、次 generation の新 draft PR を作る。
- **merged:** 次の update は次 generation を使う。前 generation branch は exact marker / head / merged state を
  証明できた場合だけ cleanup 対象にする。

closed-unmerged branch は自動削除しない。人の調査・復旧に必要な evidence として保持する。

全 PR 履歴の pagination と strict identity validation 後に latest を選ぶ。最初に全 strict managed PRのgeneration重複を
判定し、一件でもあれば `generation-conflict` とする。このstateを複数open判定より優先し、重複generationに属する全memberを
scopeへ入れ、latestを選ばずPR / branch / remote cleanupを停止する。strict managed tracking issueへの記録だけを許可する。

generationが一意だがstrict managed open PRが複数あれば `open-pr-conflict` とし、全open memberをscopeへ入れて同じ停止を
適用する。どちらもなければ最大generationをlatestとする。PR numberはlatest選択に使わず、conflict memberを
generation昇順、次にPR number昇順へ固定するために使う。generation-conflict解消後の次runで複数openが残れば
`open-pr-conflict`へ遷移する。

### 7. failure state と publish policy を分ける

- **updater-rejected:** exit 1 または report `failed`。branch / PR write なし。license、policy、source、history を含む
  updater `errors` と cohort status を opaque 値として issue に記録し、automation 独自 subtype を作らない。
- **candidate-invalid:** apply 成功後の manifest / diff / bundle 不整合。write なし。
- **validation-failed:** draft は維持する。ready 化せず、exact candidate SHA と failed command を記録する。
- **permission-denied:** credential fallback なし。成功済み write の有無を再読込し、状態不明なら recovery-required にする。
- **recovery-required:** validation infrastructure failure、完了済み旧runのpending、またはbranch / PR / issue の post-state を
  expected state と照合できない状態。後続 write と自動 retry を止める。
- **cleanup-failed:** main update PR の ready 状態を巻き戻さないが、tracking issue に残し、次 run で guarded cleanup を再試行する。

publish-draft の途中失敗では remote branch / PR を再読込する。candidate head の正常 push を証明でき、PR が未作成なら
同じ run で draft PR 作成を一度だけ再試行できる。head が expected before / candidate のどちらでもない場合は
recovery-required とし、自動 retry しない。

### 8. tracking issue を一つの managed identity に集約する

tracking issue は固定 title と hidden marker を持つ。detection は issue API を全 pagination し、pull request を除外する。
exact title、v1 start marker、v1 end marker のいずれかが存在する issue を automation candidate とする。exact title と
一組の marker、schema が全て整合する candidate だけを strict managed issue とみなす。candidate だが全整合しない場合は
`issue-identity-conflict` とし、issue create / reopen / update / close を全て停止して workflow summary だけへ記録する。
安全条件を満たす PR / branch lifecycle は継続する。三要素のいずれにも一致しない issue だけを unmanaged として無視する。
open strict managed issue は高々一つを要求し、複数openは `issue-cardinality-conflict` としてissue writeを停止するが、
安全なPR / branch lifecycleは継続する。

issue title は exact `Skill update automation requires attention` とする。managed section は
`<!-- skill-update-pr-automation:issue:v1:start -->` と
`<!-- skill-update-pr-automation:issue:v1:end -->` の間を `canonical IssueEnvelope 1行`、空行、bounded human summary の
順にする。exact v1 schema は次の通りとする。

```text
FailureState =
  "updater-rejected" | "candidate-invalid" | "validation-failed"
  | "permission-denied" | "recovery-required" | "cleanup-failed"
  | "intervention-required" | "generation-conflict" | "open-pr-conflict" | "paused-closed"

PrMember = {generation: Generation, prNumber: PositiveSafeInteger}
PrScope =
  {kind: "pr", mode: "single", generation: Generation, prNumber: PositiveSafeInteger}
  | {kind: "pr", mode: "set", members: PrMember[]}

Scope =
  {kind: "global", operation: "detect" | "publish-draft" | "validate" | "publish-finalize" | "cleanup" | "real-host-smoke"}
  | {kind: "cohort", cohortKey: string}
  | PrScope
  | {kind: "resource", resourceKind: "branch" | "tracking-issue", identity: string}
  | {kind: "candidate", digest: Digest}

Seen = {run: RunRef, at: UtcTimestamp}

IssueEntry = {
  key: Digest,
  state: FailureState,
  scope: Scope,
  firstSeen: Seen,
  lastSeen: Seen,
  detailDigest: Digest,
  summary: string
}

IssueEnvelope = {
  schemaVersion: 1,
  kind: "managed-issue",
  repositoryId: DecimalId,
  repository: RepositoryFullName,
  entries: IssueEntry[]
}
```

`entries` は `key` のUTF-8 bytes昇順とし、duplicate key を拒否する。`summary` は non-empty bounded display string、
`detailDigest` は full opaque detail を束縛する。updater cohort status / error の内部 field は IssueEnvelope で再定義しない。
`firstSeen` は entry 作成後に変更せず、`lastSeen` だけを更新する。`issue-identity-conflict` と
`issue-cardinality-conflict`、`pr-identity-conflict`はissue自体へ書けないためFailureStateに含めずworkflow summaryだけで
扱う。これらをstateに持つIssueEntryはunknown enumとして拒否する。
`PrScope.mode=set` は2件以上の重複なしmembersをgeneration、
PR number順に並べる。single lifecycle failureは`mode=single`だけを使い、set conflictを任意の代表PRへ縮退しない。

open strict managed issue が一件だけあれば固定 marker 間だけを更新し、人が書いた marker 外の本文を保持する。複数openは
`issue-cardinality-conflict` としてissue create / reopen / update / closeだけを停止し、workflow summaryへ全issue numberを
昇順で出す。安全条件を満たすPR ready化、draft維持、PR managed summary更新は継続する。open strict
managed issue がなく、closed strict managed issue があれば最大 issue number の一件を reopen する。strict managed issue
も partial identity candidate もなければ新規作成する。同じ run の write 直前にも一覧と marker digest を再検査する。

未解決 entry は stable key で deduplicate する。key input は `schemaVersion: 1`、`state: FailureState`、`scope: Scope` の
schema-order canonical JSON とし、その SHA-256 を `IssueEntry.key` にする。variant の必須 field 欠落、unknown field、
variant 間 field 混在、各 field の形式不正、key再計算不一致を拒否する。scope は次の五つだけを許可する。

- `global`: operation は `detect`、`publish-draft`、`validate`、`publish-finalize`、`cleanup`、`real-host-smoke` の
  closed enum。
- `cohort`: 現行 updater の exact cohort key。
- `pr`: singleは1〜999999のgenerationとpositive safe integerのPR number、setは2件以上のsorted `PrMember`。
- `resource`: kind は `branch` または `tracking-issue`。`branch` identity は exact
  `refs/heads/automation/skill-updates/gNNNNNN`、`tracking-issue` identity は exact `issues/<positive-safe-integer>`。
- `candidate`: digest は `sha256:<64 lowercase hex>`。digest input は UTF-8 canonical JSON
  `{"schemaVersion":1,"baseHeadSha":"...","candidateTreeSha":"...","applyReportDigest":"sha256:..."}` とする。
  run ID、timestamp、candidate commit SHA、bundle digest は含めない。

failure ごとに次の順で最初に一致する scope 一つだけを選び、複数 entry を作らない。

1. `candidate`: candidate integrity または exact candidate validation failure。
2. `resource`: known branch / known tracking issue への operation または cleanup failure。
3. `pr`: PR lifecycle、human head、closed / duplicate generation、ready / draft mutation。
4. `cohort`: updater cohort 固有 rejection / status failure。
5. `global`: より細かい identity がない operation 全体の failure。

issue 作成前の failure は `global(publish-finalize)`、cohort identity のない updater failure は `global(detect)` とする。

run ID / attempt / timestamp / detailDigest / summary は dedupe key に含めず、last-seen metadata として更新する。同じ根本状態を run 横断で一行に集約する。
解消時は managed section から outstanding entry を除き、0件なら「現在の未解決項目なし」とする。issue は自動 close
せず、人の close 判断を保持する。

### 9. cleanup と再実行を idempotent にする

一時 worktree、bundle 展開 directory、download artifact、updater transaction directory は job の `always()` cleanup で
削除し、cleanup 前後を検証する。local cleanup failure は job failure とする。

remote branch は、対応 PR が merged、branch name / generation / marker / exact head が一致し、open PR が参照していない
場合だけ `publish-draft` が削除できる。closed-unmerged、human intervention、recovery-required の branch は削除しない。

同じ run または同じ candidate の再実行では、既存 candidate head、PR、issue entry を検出して duplicate commit、PR、
issue を作らない。ready 済み同一 head の再 finalize は no-op とする。

### 10. offline gate と real-host smoke を分離する

offline tests は workflow YAML、state reducer、fake GitHub transcript、candidate manifest fixtures を使い、trigger、input
allowlist、permissions、draft-first ordering、head recheck、append-only push、pause / resume、issue dedupe、cleanup guard、
禁止 token を検証する。`task check` は network、GitHub auth、real branch / PR / issue を要求しない。

real GitHub write smoke はproduction automationを無効にした専用test repositoryを使う。read-only preview の exact v3
schema は次の通りとする。

```text
BranchState = {schemaVersion: 1, kind: "branch-state", ref: string, sha: Sha}
PullRequestState = {schemaVersion: 1, kind: "pull-request-state", headRepositoryId: DecimalId,
  headRef: string, headSha: Sha, baseRepositoryId: DecimalId, baseRef: string,
  draft: boolean, state: "open" | "closed", merged: boolean, bodyDigest: Digest}
IssueState = {schemaVersion: 1, kind: "issue-state", state: "open" | "closed",
  title: string, bodyDigest: Digest}
ResourceState =
  {state: "absent"}
  | {state: "present", value: BranchState | PullRequestState | IssueState, digest: Digest}
ResourceKey = string

SmokeResource =
  {kind: "branch", key: ResourceKey, ref: string}
  | {kind: "pull-request", key: ResourceKey, locator: {mode: "existing", number: PositiveSafeInteger}}
  | {kind: "pull-request", key: ResourceKey, locator: {mode: "planned", headRef: string, baseRef: string}}
  | {kind: "issue", key: ResourceKey, locator: {mode: "existing", number: PositiveSafeInteger}}
  | {kind: "issue", key: ResourceKey, locator: {mode: "planned", title: "Skill update automation requires attention", markerVersion: 1}}

SmokeObservation = {
  resource: SmokeResource,
  state: ResourceState
}

SmokeStep = {
  operation: "create" | "update" | "draft" | "ready" | "close" | "reopen" | "delete",
  primaryKey: ResourceKey,
  before: SmokeObservation[],
  after: SmokeObservation[]
}

SmokeCheckpoint = {
  kind: "draft" | "validation-failure" | "append" | "human-intervention" | "ready" |
    "pause" | "resume" | "issue-dedupe" | "cleanup",
  stepIndex: NonNegativeSafeInteger,
  resourceKeys: ResourceKey[]
}

SmokePreview = {
  schemaVersion: 3,
  kind: "real-host-smoke-preview",
  mode: "normal" | "recovery",
  repositoryId: DecimalId,
  repository: RepositoryFullName,
  run: RunRef,
  baseCommit: Sha,
  sourceParentCommit: Sha,
  sourceCommit: Sha,
  createdAt: UtcTimestamp,
  steps: SmokeStep[],
  checkpoints: SmokeCheckpoint[]
}
```

`SmokePreview.run`は検証対象となる既存GitHub Actions workflow runのidentityであり、CLI processのidentityではない。
CLIはread-only APIでrunのrepository、ID、attempt、`head_sha`を照合し、不在、repository不一致、または
`run.head_sha != SmokePreview.sourceCommit`をpreview生成前に拒否する。approval後のwrite開始時にも同じ一致を再検証する。
`baseCommit`はpreview生成時のdefault branch tip、`sourceParentCommit`はsource commitのdistinct first parentへ束縛する。
normal modeはGitHub compareのcomplete responseで`baseCommit...sourceParentCommit`が`ahead`、`ahead_by >= 1`、
`behind_by == 0`である場合だけ生成し、最初のdraft PRが作成可能でないrunをapproval前に拒否する。approval後にもdefault
branch tip、first parent、compare結果を再検証する。recovery modeは新しいnormal writeを計画せず、このrelationを要求しない。

canonical SmokePreview raw UTF-8 bytesは1 byte以上48 KiB以下、`steps`、各stepのbefore / after、`checkpoints`はnon-emptyとする。超過、空step / observation、
duplicate key、unknown fieldは承認候補にせずread-onlyで拒否する。

`ResourceKey` はexact `[a-z][a-z0-9-]{0,63}` とし、一つのpreview内のdistinct resource間でglobal uniqueとする。同じkeyを
使う全observationはbyte-identical descriptorを繰り返し、異なるdescriptorによるkey共有を拒否する。各stepのbefore / afterは
同じkey集合をlexicographic昇順でexactly onceだけ持ち、`primaryKey`を必ず含める。branch ref、planned PRのhead / base refはexact `refs/heads/...`、existing
PR / issueはpositive safe integer number、planned issueは固定title / marker versionで未採番resourceを識別する。

normal modeでplanned PR / issueをprimaryKeyにする最初のstepは必ず`create`であり、一つのkeyにつきexactly onceだけ許可する。existing resourceの
`create`は拒否する。各keyを観測するstep列では、各先行after observationと次before observationがbyte-identicalでなければならない。
create応答のrepository ID、resource number、head / base refまたは
title / markerを検証してruntime map `ResourceKey -> actual number`へ一度だけ束縛し、後続stepは同じkeyから実numberを
解決する。再束縛、descriptor差替え、create前参照、未作成key参照を拒否する。actual numberは事前preview digestへ
含めず、実行evidenceへ記録する。

一stepは`primaryKey`のoperationを一度だけ実行し、operation直前にbefore全resource、直後にafter全resourceをlive hostから
再読込する。before / afterに列挙していないresource変化を承認済みと推測しない。open PRを参照するbranchのfast-forward appendは、
同じstepにbranchとPRを含め、branch SHAとPR head SHAが同じold SHAから同じnew SHAへ変化し、PRの他fieldを保持する場合だけ許可する。
これによりGitHubの一writeによるcross-resource副作用を、resource別chainを破らずpreview digestへ束縛する。

GitHubがbranch write後にPR headの反映を遅延させる場合に限り、primary write応答が承認済みafterとexact一致した後の
after全resource読取を500 ms間隔で最大10回まで繰り返す。retry対象はnormalized stateまたはactual numberの不一致だけとし、
API error、write直前のbefore / identity不一致、write応答不一致は即停止する。write自体は再試行せず、一回のread attemptで
一部resourceが一致しても次attemptはafter全resourceを再取得する。exact一致したattempt数をstep execution evidenceへ記録し、
10回で収束しなければapprovalを失効させて通常のrecoveryへ送る。

許可遷移は次の閉じた行列だけとする。

- branch: `create absent -> present`、`update present -> present`、`delete present -> absent`。
- PR: `create absent -> present`、`update present -> present`、`draft present -> present`、
  `ready present -> present`、`close present -> present`、`reopen present -> present`。
- issue: `create absent -> present`、`update present -> present`、`close present -> present`、
  `reopen present -> present`。

閉じた行列は各stepのprimary resourceへ適用する。PRの`draft`はopen / non-draftからopen / draft、`ready`はopen / draftからopen / non-draftだけ、PR / issueの`close`は
openからclosed、PRの`reopen`はclosedかつ`merged=false`からopenだけ、issueの`reopen`はclosedからopenだけを許可する。
PRは`state=open`なら`merged=false`を要求し、merged PRのreopenを拒否する。PRのdraft / readyはdraftだけ、close / reopenは
stateだけ、issueのclose / reopenもstateだけを変え、その他normalized fieldを保持する。`update`はopen / closed、draft、mergedを変えない。planned locatorの
createだけを許可し、existing locatorのcreate、PR / issueのdelete、branchのdraft / ready / close / reopen、issueの
draft / readyを拒否する。PR createのafterはopen、draft、`merged=false`、issue createのafterはopenだけを許可する。
PR closeはopenかつ`merged=false`からclosedかつ`merged=false`へstateだけを変え、draftその他fieldを保持する。issue closeも
openからclosedへstateだけを変える。planned branchは最後にprimaryとなるstepを`delete`、最終stateを`absent`とし、planned PR / issueは最後にprimaryとなるstepを
`close`、最終stateを`present`かつclosedとし、planned PRは`merged=false`も要求する。cleanup到達不能、途中のstate chain不一致、create後cleanup欠落はpreview
生成時とdecode時に拒否する。preview digestはcanonical SmokePreview全体のSHA-256とする。

各checkpoint kindはexactly onceとし、`stepIndex`は存在するstep、`resourceKeys`はsorted uniqueかつ同stepの観測keyだけを参照する。
`append`は前述のbranch / open PR同時遷移、`draft` / `ready` / `pause` / `resume`はlive PR lifecycle、`issue-dedupe`はcreate時に
束縛した同一issue numberのupdate、`cleanup`は全planned resourceのterminal stateからだけ生成する。`validation-failure`はlive PRの
strict managed envelopeがcommand failureかつdraftであること、`human-intervention`はappend後のlive PRをproduction
`discoverManagedPullRequests` reducerへ入力して`intervention-required`となることを実行時に要求する。operation名、phase label、
固定checkpoint文字列だけから成功evidenceを作らない。production reducer判定入力と結果をexecution evidenceへ含める。

present `ResourceState.value` は resource numberを含めず、resource descriptorのkindとvalue.kindを一致させる。branchは
`SmokeResource.ref == BranchState.ref`、planned PRはlocatorの`headRef` / `baseRef`とPullRequestStateの同field、planned issueは
locatorの`title`とIssueState.titleを、全present before / afterでexact matchさせる。existing PR / issueはdescriptorのexact
numberからlive stateを取得し、同じnormalized valueへ変換する。`digest`はvalueをschema-order canonical encodeしたSHA-256とし、
decode時に再計算一致を要求する。unknown field、kind / descriptor identity不一致、digest不一致をwrite前に拒否する。
bodyDigestはraw UTF-8 bodyのDigestとする。normalized value本体によりdecoderはdraft / open /
closed、terminal cleanupを純粋検証でき、live stateも同じvalueへ正規化して比較する。create前の`absent`とcreate後のplanned
contentはserver採番に依存せず比較できる。

normal modeは従来の全checkpointをexactly once要求する。recovery modeは前回失敗後のreserved branch、strict smoke PR、strict
smoke issueをread-only再観測し、presentかつ同じrepository / run / source commitへ束縛できるresidual resourceだけをstepsへ含める。
`create`、`update`、`ready`、`reopen`は禁止し、open ready PRの`draft`、open PR / issueの`close`、branchの`delete`だけをterminal stateへ
向かう順で許可する。absent resourceはstepsから除外し、unknown、partial identity、merged PR、想定外SHA / body digest、複数候補は
preview生成前に拒否する。branch deleteは同じpreview内に同じrun / source commitへ本文で束縛されたstrict smoke PRまたはstrict
smoke issueがpresentである場合だけ許可する。固定refとSHAだけのbranch-only residualはrun / attempt ownershipを証明できないため
canonical recovery previewを生成せず、live repository / ref / SHAとexact delete commandを示す別のmanual previewに対する人のfresh
approvalへ送る。recovery modeは最後のstepに全対象resourceを束縛する`cleanup` checkpointだけをexactly once持ち、
全resourceのterminal stateを検証する。residual resourceが0件ならrecovery previewを生成しない。

real-host smokeはproduction workflow外のhuman-operated CLIで行い、既存operator `gh auth` sessionだけを使用する。新しいPAT /
GitHub App、repository保管credential、approval artifactを作らない。`gh` child processへは`PATH`、operator configの所在、locale、
CA等の非credential環境だけを明示的に渡し、ambient `GH_TOKEN`、`GITHUB_TOKEN`、enterprise tokenその他未列挙環境を
転送しない。CLIは一つのprocessでread-only preview全文とdigestを表示し、
同じTTY / stdinからexact digestが入力されるまでwrite seamを呼ばない。EOF、空入力、不一致はread-only終了とする。
人はpreview全文とdigestを見た同じ対話・同じ実行cycleで、immutableな全operation planのdigestを明示して承認する。承認は
credentialや永続artifactではなくprocess-local control-plane actionであり、automationは人の意思を自動生成・推測しない。
CLI process は承認済み preview digest を入力として受け、write開始時にcanonical preview全体、repository、source
commit、run、全resourceの最初のbefore stateを再読込して検証する。process内では各step直前にbefore全state、
直後にafter全stateを検証する。先行operationによる承認済みstate変化は失効理由にせず、preview全体をlive stateから再計算しない。
process終了、operation失敗、予期しないstate変化、新しい対話・run / attempt、source commit、target、順序の変化、同じpreviewの
別process再利用で承認は失効する。step内の一部resourceだけpost-stateを取得できない場合もstep全体をunknownとして停止する。
失敗時は残存resourceを記録し、同じpreviewを失効させる。次processはlive residual stateからv3 recovery modeを再構築し、別の
read-only previewとfresh approvalなしにwrite / cleanupを再開しない。human approval自体をoffline testで偽装せず、preview schema / digest、state chain、stale state拒否、未承認時
write seam未呼出を検証する。

承認後だけ draft、validation failure、ready、open PRへのappend、production reducerが検出するhuman intervention、closed pause、
manual resume、issue dedupe、cleanup をsemantic checkpointで確認し、作成 resource を guarded cleanup する。production default
`GITHUB_TOKEN`のpermission denialはexact operationとclosed post-state `unchanged` / `applied` / `unknown`を保持するoffline fake
403 transcriptで検証し、403では`unchanged`とcredential fallbackなしを要求する。operator credentialを意図的に弱めるreal-host
smokeは完了条件にしない。

OpenSpec CLI は任意の validation engine とし、Markdown artifacts と checkbox を実行・再開の正本とする。CLI が local
PATH にない場合も自動 install や別orchestrator探索を行わず、依存が満たされた先頭 taskから直接実行を継続し、strict
CLI validation を未検証として `tasks.md` に記録する。Task 10 の完了には、同じ source commit に対する CI または別環境の
fresh `task openspec:validate` green evidence が必要であり、手動 prose review だけで代替しない。

## Risks / Trade-offs

- 一つの PR が複数 cohort を含み得る。これは現行 updater の full-cohort public apply を守り、未公開内部 API への依存を
  避ける代償である。cohort 別 status は PR body と issue に残る。
- draft 作成と ready 化に二つの write job が必要になる。各 job の permission を分離し、間の validation を read-only に
  することで、draft-first と least privilege を両立する。
- strict managed identity の branch tip mismatch は automation 自身の途中失敗も intervention と判定し得る。誤上書きより
  fail-closed を優先し、strict managed tracking issue と manual recovery を使う。marker を含む partial identity は
  workflow summary だけを使う。
- tracking issue を自動 close しないため open issue が残る場合がある。人の議論を消さず、managed section で解消状態を示す。

## Implementation Order

1. pure state model、marker codec、artifact manifest、fake GitHub adapter を test-first で作る。
2. current updater public command から candidate bundle を作る read-only detection を実装する。
3. trigger / allowlist / permission の workflow と offline structural tests を追加する。
4. publish-draft、read-only validation、publish-finalize を順に追加する。
5. pause / resume、tracking issue dedupe、cleanup / recovery を追加する。
6. docs、`task check` integration、real-host smoke commandとoffline fake-host testsを追加する。
7. OSWF-5 review / verifier を完了する。
8. 人の fresh approval 後だけ real GitHub write smoke を行う。

## Open Questions

なし。permission topology、tracking entry scope、malformed PR の介入停止、weekly schedule、exact v1 schema、
same-repository PR境界、failure分類、fresh approval媒体、OpenSpec CLI不在時運用、publish target / history receipt、
PR set conflict、symbolic smoke transition、issue cardinality時のPR継続、default branch不一致PRの介入停止、承認済み
smoke planの同一process実行とterminal cleanup、human CLIの既存`gh auth`境界、normalized smoke state、validation
infrastructure failure、summary専用`pr-identity-conflict`、production permission denialのoffline限定、workflow run head SHAと
source commitの束縛、PR / issue create postcondition、PR closeのunmerged維持は利用者承認により確定した。
