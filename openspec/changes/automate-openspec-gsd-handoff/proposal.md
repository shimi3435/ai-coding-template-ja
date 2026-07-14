# Change: OpenSpec から GSD への handoff MVP を自動化する

## Status

**Contracts fixed / implementation gate pending.** 方向とMVP境界、対応OpenSpec 1.3.1 JSON契約、
GSD 1.5.0 capability probe契約はfixturesへ固定済み。strict validateと`spec-holes` Phase 1の再確認、
利用者承認が完了するまでproduction codeを実装しない。

## Why

`revise-openspec-gsd-execution-boundary` は、OpenSpec を仕様と最終完了判定の正、GSD を大規模な
単一 change の詳細計画・実行主体とする境界と、bridge 不在時にも使える手動 handoff を定める。
手動手順だけでは、canonical artifact path の取り違え、CLI JSON を本文と誤認すること、task進捗の
転記誤り、cross-session resumeに必要なsource状態の欠落を毎回人手で防ぐ必要がある。

本 change は自動化をMVPに限定し、artifact discovery、Markdown読取、進捗算出、最小manifest、
capability / Git preflight、GSD handoff開始までを機械化する。stable requirement ID、詳細mapping、
multi-manifest ownership、全操作前の高度なdrift検査、finalize / cleanupは後続
`harden-openspec-gsd-handoff-lifecycle` に分離する。

## Dependencies

- `revise-openspec-gsd-execution-boundary` のADR、workflow、手動handoff、close policyが完了していることを
  実装開始条件とする。経路選択、1 phase / 1 change、OpenSpec原本での最終完了判定は同changeの
  `adaptive-change-execution` を参照し、本changeで再定義しない。PR #40 merge後の`origin/main`
  `7c048da`と、policy原本commit `a2eb744`の整合を確認済み。
- 本 change は `revise-openspec-gsd-execution-boundary` をmergeしたbaseから専用branch / PRを作り、
  `agent/automate-openspec-gsd-handoff`に本changeだけを載せる。先行changeと同一PRに束ねず、blocked
  proposalをmainへ残さない。`harden-openspec-gsd-handoff-lifecycle`は後続branch / PRの対象外成果である。
- OpenSpec JSONは1.3.1完全一致、GSDは1.5.0完全一致をMVP契約とし、具体schema、複合probe signal、
  上限、fallback / fail-closed条件はdesignと`tests/fixtures/openspec_gsd_handoff/`を正とする。
  strict validate、`spec-holes` Phase 1再確認、利用者承認まで実装を開始しない。

## What Changes

- project skill `execute-openspec-change` をGSD handoff準備の入口として追加する。先行policyの準備条件を
  検査し、入力と経路理由を表示して承認を得た後、bridgeと対応GSD skillを起動する。GSD実行後の
  lifecycle管理やfinalizeは行わない。
- 薄いbridge CLIと責務別moduleを追加し、OpenSpec artifact discovery、Markdown読取、task progress
  算出、最小manifest作成、capability / Git preflightだけを担当させる。
- 対応OpenSpec CLI JSONの`contextFiles`をpath discovery、`progress` / `tasks`を進捗メタデータに
  だけ使う。canonical contentは列挙されたMarkdown filesから常に読み、CLI不在・非対応schemaでは
  固定directory規約と`tasks.md`解析へ縮退する。
- canonical入力はlower-kebab change ID 128 bytes、64 files、各1 MiB / 合計4 MiB、4096 tasksを
  上限とし、超過時は切り捨てず手動handoffを提示する。
- `.planning/openspec/<change-id>/handoff.json` にschema version、change ID、canonical relative paths
  とcontent hashes、source commit、正規化task progress、検出capabilities、handoff stateだけを記録する。
  requirement mapping、phase IDs、artifact ownershipはMVP manifestへ含めない。
- manifestはcanonical artifactsを固定したsource commitの後に、feature branchで追跡対象として別commit
  する。`.planning/`がignoreされる環境ではcross-session resume可能とみなさず、永続化方針を明示する
  まで停止する。テンプレート自身は既存close policyに従いpre-mergeに手動削除する。
- JSON discovery / Markdown fallback、進捗算出、最小manifest、path safety、部分生成、capability不足を
  fixturesで検証する。実OpenSpec / GSD smokeはopt-inとする。
- stable ID、requirement / phase mappingの機械化、multi-manifest ownership、plan / execute / resume /
  verify / finalize前の高度なdrift gate、cleanup preview、高度なfailure recoveryは後続changeへ移す。

## Capabilities

### New Capabilities

- `openspec-gsd-handoff-automation`: 確定済みOpenSpec changeのcanonical artifactsと進捗を安全に発見し、
  追跡可能な最小manifestを作成して、承認後にGSD handoffを開始するMVP自動化。

### Modified Capabilities

- なし。責務境界と完了policyは先行changeが所有し、本changeはそのhandoff準備だけを実装する。

## Impact

- **New code**: `.agents/skills/execute-openspec-change/`、必要なagent用symlink、薄いbridge CLIと
  discovery / reader / progress / manifest / preflight module。
- **Generated state**: feature branchで追跡する`.planning/openspec/<change-id>/handoff.json`。
- **Tests**: MVP範囲のfixture / unit・integration testsと、任意の実tool smoke導線。
- **Compatibility**: GSDはコア依存にしない。MVPのJSON経路はOpenSpec 1.3.1だけを対応対象とし、
  version / schema / path / cardinality / progress不一致時もMarkdown fallbackを使えるが、
  最終validateは先行policyに従う。`.planning/`をignoreする下流ではcross-session resumeを保証できない
  ことを、実装時に`docs/optional/gsd.md`へ明記する。
- **Git / external effects**: 先行policyに反するbranch / working tree状態では停止する。push、PR、merge、
  自動stash / commit / reset、finalize / cleanupは行わない。本changeは先行changeをmergeしたbaseからの
  専用branch / PRで保持し、他のOpenSpec changeを同じPRへ載せない。
- **Follow-up**: `harden-openspec-gsd-handoff-lifecycle` が高度な追跡・ownership・finalizeを追加する。
