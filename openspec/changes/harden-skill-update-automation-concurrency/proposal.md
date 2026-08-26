# Change: skill update automation の競合耐性を強化する

## Status

PR #64 の request-changes に対する修正 change。仕様、実装、検証中。

## Why

現行 automation は branch mutation 前に remote state を検査するが、検査と push の間に race window がある。
また、merged branch cleanup は candidate publish job に内包され、no-op / existing-head-validation run では recovery
できない。PR / Issue body の read-modify-write は同時編集を失わせる。

branch mutation 自体を compare-and-swap にし、cleanup を candidate lifecycle から分離する。本文を immutable root
snapshot とし、可変 state を改変検出可能な append-only comment journal へ移す。

## What Changes

- branch create / append / delete は explicit `--force-with-lease=<ref>:<expected>` だけで実行する。create の expected は空、append / delete は exact SHA とする。
- `cleanup-merged` を独立 job とし、candidate-update、existing-head-validation、no-op の eligible run で実行する。
- managed PR / tracking Issue body は作成時の immutable root snapshot とし、作成後は更新しない。
- 可変 state は creator numeric user ID に束縛した append-only canonical comment journal v2 に保存する。
- journal entry は full snapshot と前 entry digest を持つ。改変、中間欠落、fork、別 author marker、非 canonical 表現、journalとlive stateの不一致を fail closed にする。state mutationを伴わない末尾entry suffixの全削除は検出不能と明記する。v1 migrationは提供しない。
- branch append と PR draft / ready mutation は `prepared -> mutation -> committed` protocol を使い、中断後の live state と journal を決定論的に再検証する。
- closed tracking issue は再 open しない。新 failure は新 issue と新 journal root を作る。
- schema v2 real-host smoke は fresh smoke repository だけを使う。全 write 前に read-only preview と fresh approval を要求する。

## Impact

- **Security / trust boundary:** remote Git ref、PR / Issue comments、actor identity、recovery protocol を変更する。
- **External writes:** branch push/delete、comment create、PR draft/ready、Issue create の順序と条件を変更する。
- **Public interface:** managed root marker / journal schema v2、workflow job topology、smoke preview schema が変更される。
- **Build / CI:** workflow contract、Node tests、fresh smoke planを更新する。
- **OSWF-5:** self-review、initial independent review、finding修正、Node 24 `task check`、別 independent verifier が必須。

## Out of Scope

- schema v1 resource の自動 migration、修復、再利用。
- comment update / delete。
- closed tracking issue の reopen。
- force push、rebase、auto-merge。
- GitHub App、PAT、追加 credential。
- fresh approval 前の real GitHub write。

## Spec Holes

12分類の監査、解消、テスト対応は [spec-holes.md](spec-holes.md) を正本とする。未解決判断なし。
