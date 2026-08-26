# Change: スキル更新 PR を安全に自動化する

## Status

本 change は実装・検証中である。Task 1〜10は完了した。Task 11のreal-host smokeはdraft PR作成時に停止し、
利用者承認済みの`SmokePreview` v3 finding修正cycleを実装している。branch-only residualはrun ownershipを
live stateから証明できないためcanonical recovery対象外とし、legacy branchは別のmanual delete previewとfresh approvalで扱う。proposal、design、
spec delta、`spec-holes.md` が仕様の正本であり、`tasks.md` が残りの実装順序、進捗、検証状態の正本である。

## Why

決定論的 skill updater は、review 済み source declaration と generated lock を基に、public GitHub 上の
更新を cohort 単位で検査し、既定 dry-run と明示 apply を提供する。しかし、定期実行、既存 PR の安全な
再利用、失敗時の pause、tracking issue への集約は人手に残っている。

常時有効な自動 write、広い workflow permission、force push、auto-merge は、repository と supply chain の
trust boundary を広げる。weekly 実行を明示 opt-in とし、host に対して read-only な detection / validation と、
限定された publish jobs を分離する。更新 PR は必ず draft から開始し、read-only validation が成功した
同一 commit だけを ready for review にする。

## Current Baseline

- 本 change は `origin/main` の `f17b2e291a83674e22ae2cfc936eba2fe9476d06` から作成した
  `agent/rebuild-automate-skill-update-prs` だけで進める。
- `main` の active OpenSpec change は 0 件であり、本 branch の active change は
  `automate-skill-update-prs` だけとする。
- 旧 branch は read-only で参照し、現行 `main` と矛盾する成果を移行しない。
- 現行 updater の command、JSON schema v1、cohort key、status、exit code、dry-run / apply、transaction 契約を
  正とし、本 change で再定義しない。

## What Changes

- weekly schedule は repository variable `SKILLS_AUTO_UPDATE` が exact string `true` の場合だけ進める。
- `workflow_dispatch` は常時利用可能とし、宣言済み boolean input `resume_closed` だけを受理する。
- detection と validation は GitHub host に対して read-only とする。candidate 生成時の updater apply は
  一時 worktree 内だけを変更し、external write を行わない。
- write permission は publish stage の `publish-draft` と `publish-finalize` だけに与え、各 job の操作に
  必要な scope だけを付与する。
- updater の全 remote cohorts を一回の public command で扱う現行契約に合わせ、一つの managed PR に
  cohort 別結果を集約する。cohort selector や catalog discovery は追加しない。
- managed PR は generation 付き branch と marker で識別する。open PR は normal commit を append して再利用し、
  更新前に draft へ戻す。force push、rebase、auto-merge、approval、merge queue 登録は禁止する。
- manifest、DraftReceipt、PR marker、issue marker は automation 所有の最小 envelope を exact v1 schema として固定する。
  updater の cohort / error 本文は opaque な表示情報として扱い、automation schema へ複製しない。
- candidate artifact は create / update / validate の exact publish target と fully paginated same-repository
  automation candidate履歴digestへ束縛し、publish直前の履歴変化を stale として拒否する。
- managed PR candidate は head / base repository ID が current repository と一致する same-repository PR から、
  managed branch、title、marker の部分一致で抽出する。base ref が current default branch と異なる candidate は
  `pr-identity-conflict` として履歴 digest に含め、全 external write を停止する。cross-repository PR は候補外として
  変更せず warning だけを出す。
- branch / title / marker の partial identity は全 external write と managed remote cleanup を停止して workflow summary
  だけへ記録する。strict managed identity の branch tip と想定 head SHA だけが不一致なら PR / branch / remote cleanup を停止し、
  strict managed tracking issue への記録だけを許可する。
- closed-unmerged PR は pause とし、`workflow_dispatch` の `resume_closed: true` だけが fresh detection 後に
  次 generation を開始できる。
- updater rejection、candidate test failure、permission failure、cleanup failure を状態遷移として定義する。license / policy /
  source / history rejection は opaque updater reason を保持した `updater-rejected` に統一し、重複しない managed
  tracking issue に集約する。
- tracking issue は exact title または marker token の部分一致も automation candidate とし、strict identity を
  証明できない場合は `issue-identity-conflict` として issue write だけを停止する。
- duplicate generation は `generation-conflict`、generation一意だが複数open PRは `open-pr-conflict` とし、
  sorted PR member setをstable scopeへ含める。duplicate generationを先に判定する。
- strict managed tracking issueが複数openの場合は `issue-cardinality-conflict` をworkflow summaryへ出し、
  issue operationだけを停止して安全なPR lifecycleを継続する。
- workflow の trigger、permissions、禁止経路、state reducer、artifact integrity、cleanup を offline test と
  `task check` で検証する。
- real GitHub write smoke は対象 resource を read-only preview した後、人が実行直前に immutable な全 operation plan の
  digest を fresh approval した場合だけ、workflow外のhuman-operated CLI一processで行う。CLIは既存`gh auth` sessionを
  使用し、新しいcredentialを作成・保存しない。exact `SmokePreview` v3はnormal / recovery modeと一stepの全before / after
  resourceを束縛し、normal modeはbaseからfirst parentがaheadであることをapproval前に確認する。open PR
  branch appendによるbranchとPR headの同時変化を一つの承認対象として表現する。未採番resourceのsymbolic key、resource別の
  閉じた状態遷移表、workflow run head SHAとsource commit、normalized state本体とdigest、step間の連続state、exactly-once
  create、terminal cleanupを満たすwriteだけを許可する。required checkpointはoperation名ではなくlive stateとproduction reducer
  判定から生成する。production permission denialはoperationと既知post-stateをoffline fake 403で検証しreal smoke対象外とする。
  recovery branch deleteは同run / sourceへ束縛されたstrict smoke PRまたはissueとの相関を要求し、branch-only residualを
  canonical recoveryで削除しない。`gh` child processへambient tokenを転送せず、非credential環境だけを明示的に渡す。
- OpenSpec CLI は任意の validation engine とする。不在時も Markdown artifacts と checkbox を正本に直接実行を
  継続し、自動 install は行わない。完了には同じ source commit に対する CI または別環境の fresh
  `task openspec:validate` green evidence を要求する。

## Capabilities

### New Capabilities

- `skill-update-pr-automation`: opt-in schedule、allowlisted manual dispatch、least-privilege publish、draft-first PR、
  pause / resume、tracking issue deduplication、cleanup / recovery を提供する。

### Modified Capabilities

- なし。現行 deterministic updater の公開契約は変更しない。

## Impact

- **GitHub Actions / build / CI:** weekly / manual workflow、offline contract tests、`task check` integration を追加する。
- **External writes:** managed branch、draft PR、PR ready state、managed tracking issue だけを変更する。
- **Permissions:** detection / validation は read-only。`publish-draft` は `contents: write` と
  `pull-requests: write`、`publish-finalize` は `contents: read`、`pull-requests: write`、`issues: write` だけを持つ。
- **Public interface:** repository variable `SKILLS_AUTO_UPDATE`、`workflow_dispatch.resume_closed`、managed PR / issue
  marker、automation state、artifact manifest v1、human-operated real-host smoke CLI / preview v3 が運用 interface になる。
- **Security / trust boundary:** production workflowはdefault `GITHUB_TOKEN`だけを使い、PAT、GitHub App、
  `pull_request_target`を使わない。workflow外のreal-host smokeだけは既存operator `gh auth` sessionを使い、
  project-owned credentialやapproval artifactを保存しない。
- **OSWF-5:** 対象変更として、self-review、
  initial independent review、finding 修正、最新 `task check`、別 independent verifier を必須にする。

## Out of Scope

- updater の sources / lock schema、cohort grouping、status vocabulary、exit code、transaction semantics の変更。
- upstream catalog discovery、新規 skill の自動導入、cohort selector の追加。
- private upstream、PAT、GitHub App、organization-wide automation。
- auto-merge、force push、rebase、approval、merge queue 登録。
- 人の commit や malformed managed section の自動修復。
- approval credential、署名 approval artifact、GitHub Environment protection rule の導入。

## Spec Holes

12分類の監査結果、解消方法、予定検証は [spec-holes.md](spec-holes.md) を正本とする。未解決判断はない。
