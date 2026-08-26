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
user ID、generation / stable scope、initial state digestを持つ。作成後body PATCHは禁止。

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

full snapshotは各entry単独でstate復元可能。delta replayは使わない。v1 marker / v1 mutable bodyはv2として読まず、migrationもしない。

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

### 5. tracking issue lifecycleを世代化する

open strict v2 issueがあればfailure snapshotをjournal appendする。closed issueはterminal rootとして保持し、reopen / body update /
comment appendしない。新failureは新 issueを作成する。複数open strict roots、partial identity、foreign markerはissue writeだけ停止する。

### 6. smokeはfresh repositoryへ隔離する

v2 smoke previewはrepository ID、empty managed resource precondition、creator numeric user ID、全planned root / journal comments、
lease expected values、prepared / committed steps、terminal cleanupを束縛する。既存v1 smoke resourceを再利用しない。
CLIはpreview表示後、同process内fresh approvalまでwrite seamへ到達しない。

## Validation Strategy

- public seam: production adapter command runner、fake GitHub adapter、workflow YAML contract、smoke preview / execution CLI。
- TDD: race、tamper、missing / fork、foreign author、prepared crash recovery、no-op cleanup、closed issue generationをREDから追加する。
- Node 24 focused tests、typecheck、`uv run --no-sync task check`。
- real GitHub writeはrequired final evidenceではあるがfresh approval boundaryまで未実行・change未完了とする。

## Sources

- Git `git-push`: explicit `<refname>:<expect>` lease。empty expectはref absenceを要求する。
- GitHub issue comments API: PR / Issue comment共通。ascending ID、numeric author ID、`created_at` / `updated_at`を取得可能。
- GitHub Actions jobs: `needs`、job-level `if`、`always()`によりcleanup topologyを独立表現できる。
