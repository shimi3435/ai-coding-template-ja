## Context

PR #64 head `d2ab38d4cddcd922d984a1e7a8555aac9fb6037a` を baseline とする。現行 v1 は managed state を
PR / Issue body 内 marker に保存し、body 全体を PATCH する。branch create / append / delete は read後の通常 push。
cleanup は `publish-draft` job 内にある。

## Decisions

### 1. Git ref mutationをexplicit leaseでCAS化する

remote ref `R` に対し、次だけを許可する。

- create: `git push --force-with-lease=R: origin <candidate>:R`
- append: `git push --force-with-lease=R:<expectedSha> origin <candidate>:R`
- delete: `git push --force-with-lease=R:<expectedSha> origin :R`

bare `--force-with-lease`、remote-tracking ref推測、通常 push、retry時 expected値の自動更新は禁止。push失敗後は
read-only再取得し、expected stateと一致しなければ競合として停止する。

### 2. cleanup lifecycleを独立 jobへ移す

`cleanup-merged` は detection artifact kind が `candidate-update | existing-head-validation | no-op` の全 eligible runで
起動する。candidate publish成否に依存しない。jobはmanaged PR historyとbranch tipをfresh readし、strict identity、merged、
exact lease SHAを満たすbranchだけ削除する。identity conflict、partial pagination、lease rejectionはdeleteせずjournalへfailureを記録する。

### 3. immutable rootとcomment journal v2を分離する

PR / Issue作成bodyは immutable root snapshot。root markerはresource kind、schema version 2、repository ID、creator numeric
user ID、generation / stable scope、canonicalなfull initial snapshot、そのsnapshotから算出したinitial state digestを持つ。
decode時はsnapshotのcanonical digestとroot digestの一致を必須とする。作成後body PATCHは禁止。

可変stateはissue comment APIのappendだけで記録する。entryはcanonical JSON envelopeを単一markerに格納し、最低限次を持つ。

```text
JournalEntryV2 = {
  schemaVersion: 2,
  resourceKind: "pull-request" | "issue",
  resourceNumber: PositiveSafeInteger,
  creatorUserId: DecimalId,
  sequence: PositiveSafeInteger,
  previousDigest: Digest | null,
  phase: "committed" | "prepared",
  operation: Operation,
  operationId: Digest,
  snapshot: FullSnapshot,
  digest: Digest
}
```

`digest`は`digest` fieldを除いたschema-order canonical bytesのSHA-256。comment author numeric IDはroot creatorと一致必須。
comment `created_at` と `updated_at` 不一致は改変扱い。markerを含む別author comment、surviving successorから判明する
sequence gap / duplicate、previousDigest不一致、同じpreviousDigestからのfork、unknown field、非canonical bytesはfail closed。
表示用 human commentはmarkerを含まない限り無視する。

comment digest chainは末尾のstate-only entry suffixが全削除された状態を「未作成」と区別できない。immutable root以外の
latest digest anchorを追加しない確定方針により、このterminal truncationは検出保証外とする。branch / PR state mutationを伴う
entry削除はjournal latest snapshotとfresh live stateの不一致としてfail closedにする。

workflow は作成APIの主体である `github-actions[bot]` のnumeric user IDをread-only user lookupで取得してからrootを作る。
workflow trigger actorの `github.actor_id` は作成主体と一致する保証がないためcreator束縛へ使わない。comment作成応答と再取得した
comment author IDがroot creatorと一致しない場合はfail closedにする。

full snapshotは各entry単独でstate復元可能。delta replayは使わない。v1 marker / v1 mutable bodyはv2として読まず、migrationもしない。

PR / Issue createの応答消失によりstrict rootだけが存在しjournal commentが0件の場合、root authorのnumeric user IDがcreatorと一致し、
GitHub GraphQLの`lastEditedAt`が`null`で、resourceが期待するopen状態にあり、fresh live stateがroot内initial snapshotとexact一致する場合だけ
commentless rootとして回復できる。PRはopen / unmerged / draft、Issueはopenを要求する。author欠落・不一致、edit metadata欠落・非null、
snapshot / digest不一致、live state不一致はfail closedとする。回復writerは既存の`publish-draft`（candidate-update）と
`publish-finalize`（existing-head-validation）に限定し、新jobは追加しない。

initial comment append後に応答が失われた場合、同じcommentを再送しない。freshに全commentを再取得し、creator author、canonical body、
expected sequence / operation / digestとexact一致するentryが1件だけ存在すれば成功として続行する。0件、incomplete pagination、複数、別entry、
foreign markerはfail closedとする。

### 4. prepared / mutation / committed protocolを固定する

branch append、PR draft、PR readyは次の順序だけを許可する。

1. fresh root / journal / live resourceをread-only検証する。
2. intended before / after full snapshotと一意な`operationId`を持つ`prepared` entryをappendする。
3. expected live stateをCASまたはexact preconditionでmutationする。
4. mutation後live stateを再取得する。
5.同じ`operationId`の`committed` full snapshotをappendする。

末尾preparedから再開する場合、live stateがbeforeなら同じexpected値でmutationを再試行できる。afterならcommittedだけをappendする。
before / after以外、prepared重複、別operationの後続はfail closed。PR draft / ready API自体にconditional writeがないため、
prepared後かつmutation直前のfresh readとmutation後readを必須にし、人の状態変更を推測修復しない。

GitHubはbranch push成功直後、branch refをafter、PR head projectionをbeforeとして一時的に返す場合がある。このexact mixed projection、
またはmutation後の一時的な旧projectionに限り、automationは追加mutationやjournal appendを行わず、有界回数のread-only再取得で
before / after判定を安定化する。同じ`recoverExactPreparedTransition`実行中にbranch afterを一度観測した証拠は、mutation直前のfresh readを
挟む複数のstabilization phase間でも保持する。その後branchがbeforeまたはmissingへ回帰した場合、後続でafterへ戻ってもfail closedにする。
PR projectionはexact before / after間の揺れを許し、全projectionがexact afterへ収束した場合だけ同じoperation IDの`committed`をappendする。
上限到達、immutable identity差、before / after以外のSHA、branch後退は従来どおりfail closedとする。経過時間からmutation成功を推測しない。

### 5. tracking issue lifecycleを世代化する

open strict v2 issueがあればfailure snapshotをjournal appendする。closed issueはterminal rootとして保持し、reopen / body update /
comment appendしない。新failureは新 issueを作成する。複数open strict roots、partial identity、foreign markerはissue writeだけ停止する。
Issue comment APIにはstate conditional writeがないため、保証境界はcomment append直前のfresh Issue readとする。そのreadでclosedなら
既存rootへappendせず1回だけrediscoveryし、新issueを作る。fresh read後の人手close raceはAPI制約として検出保証外とする。

### 6. smokeはfresh repositoryへ隔離する

v2 smoke previewはrepository ID、empty managed resource precondition、creator numeric user ID、全planned root / journal comments、
lease expected values、prepared / committed steps、terminal cleanupを束縛する。既存v1 smoke resourceを再利用しない。
CLIはpreview表示後、同process内fresh approvalまでwrite seamへ到達しない。
通常planはPR ready後に人手merge checkpointで停止し、exact checkpoint digest入力後にmerged stateをfresh検証して独立cleanup seamを実行する。
fresh repositoryのmerged branch自動削除は無効化し、cleanup seam前のbranch不在をfail closedとする。
途中停止時はresidual resource identityとexact SHAを束縛したterminal-only recovery previewを作り、別のfresh approval後だけclose / deleteする。
terminal recoveryでは各write直前にpreviewへ束縛したimmutable body、journal digest、resource state、branch exact SHAを再取得する。PR close後の
terminal prepared journalが通常のmerged-only aggregate cleanup discoveryでconflictになる場合でも、そのaggregate discoveryへ経路を渡さず、
束縛済みの単一branchだけをexplicit exact leaseで削除する。通常runの独立aggregate cleanup契約は変更しない。
merge後の再開はdefault branchがsource commitを含むread-only comparisonを`merged` relationとしてpreviewへ束縛する。

## Validation Strategy

- public seam: production adapter command runner、fake GitHub adapter、workflow YAML contract、smoke preview / execution CLI。
- TDD: race、tamper、missing / fork、foreign author、commentless root、append response loss、prepared crash recovery、cross-phase projection regression、terminal-only exact cleanup、no-op cleanup、closed issue generationをREDから追加する。
- Node 24 focused tests、typecheck、`uv run --no-sync task check`。
- real GitHub writeはrequired final evidenceではあるがfresh approval boundaryまで未実行・change未完了とする。

## Sources

- Git `git-push`: explicit `<refname>:<expect>` lease。empty expectはref absenceを要求する。
- GitHub issue comments API: PR / Issue comment共通。ascending ID、numeric author ID、`created_at` / `updated_at`を取得可能。
- GitHub GraphQL PullRequest / Issue: resource authorのnumeric database IDとbody edit証拠`lastEditedAt`を取得可能。
- GitHub Actions jobs: `needs`、job-level `if`、`always()`によりcleanup topologyを独立表現できる。
