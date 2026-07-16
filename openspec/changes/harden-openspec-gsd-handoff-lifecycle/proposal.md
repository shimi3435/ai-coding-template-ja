# Change: OpenSpec / GSD handoff のライフサイクルを堅牢化する

## Status

**Dependency and contract gates satisfied / handoff approval pending.** 先行2 changesのmerge、MVP manifest
schema v1、`handoff.json`追跡・保持方針、tool contracts、hardening schema migration、policy参照契約、
spec-holes Phase 2計画を確認済み。source-pinned commitとhandoff preview後の新たな明示承認までは実装しない。

## Why

`revise-openspec-gsd-execution-boundary` は OpenSpec / GSD の責務境界を定め、
`automate-openspec-gsd-handoff` は artifact discovery、Markdown 読取、進捗算出、最小 manifest、
capability preflight を備える MVP handoff を提供する。MVP は一つの change を安全に開始するには十分だが、
長期間の再開、複数 manifests の共存、仕様更新後の再計画、所有 artifact の finalize までを機械的には
保証しない。

この後続 change では、先行 policy を再定義せず、stable requirement ID、source-to-phase mapping、
操作前 drift 検査、multi-manifest ownership、resume / failure recovery、finalize / cleanup preview を追加する。
これにより、先行 change の独立出荷可能性を維持しながら、保守面と破壊的操作のリスクを段階的に下げる。

## Dependencies

- `revise-openspec-gsd-execution-boundary` は `origin/main` の `7c048da`、MVP change
  `automate-openspec-gsd-handoff` は `origin/main` の `d96e451` としてmerge済みである。後者をbaseにした
  `agent/harden-openspec-gsd-handoff-lifecycle` だけを本changeに使用する。
- MVP manifest schema v1、OpenSpec 1.3.1 JSON / Markdown fallback、GSD 1.5.0 composite capability、
  `inspect` / `prepare` / `mark-started` のpublic state seam、host dispatch、route別postconditionは
  merge済みcode、fixtures、first-party skillを入力契約とする。
- 本 change は `automate-openspec-gsd-handoff` をmergeしたbaseから専用branch / PRを作り、そのPRには
  本changeだけを載せる。先行2 changesと同一PRに束ねず、blocked proposalをmainへ残さない。
- 本 change は上記 policy の MUST を複製しない。各機械検査は参照する policy requirement / scenario を
  traceability metadata と test に明記する。

## What Changes

- MVP manifest を後方互換に拡張し、OpenSpec requirements / scenarios に欠番を再利用しない stable ID と
  source fingerprint を割り当てる。並び替えでは ID を変えず、曖昧一致や衝突は自動修復しない。
- stable ID を GSD phases / plans / verification evidence へ対応付け、未対応、重複、複数 changes の混在を
  機械検査する。これは `adaptive-change-execution` の所有権 policy の enforcement であり、policy 自体を
  再定義しない。
- plan、execute、resume、verify、finalize の各操作前に、canonical artifacts、mapping、source commit、
  manifest schema、phase state の drift を検査する。`tasks.md` の checkbox だけの変更は仕様 drift から除外する。
- repository 内の全 handoff manifests を照合し、artifact の単独所有、共有参照、由来不明を区別する。
  ownership が競合または不明なら変更・削除を禁止する。
- interruption / partial failure の checkpoint と recovery plan を永続化し、再開時に source、capability、
  completed operations、残存副作用を再検証する。別 route、自動 rollback、自動修復へは切り替えない。
- finalize / cleanup は候補、所有根拠、参照更新、実行順序、想定差分を preview し、承認 token と直前の
  再検査が揃うまで変更しない。途中失敗後は完了済み操作と再開点を記録する。
- stable ID、drift、mapping、ownership、recovery、preview を fixtures / unit・integration tests で検証する。
  実 OpenSpec / GSD を使う smoke は opt-in とし、通常 CI は optional tools 不在でも成立させる。

## Capabilities

### New Capabilities

- `openspec-gsd-handoff-lifecycle-hardening`: MVP handoff の派生状態へ stable mapping、操作前検査、
  multi-manifest ownership、回復可能な checkpoint、安全な finalize preview を追加する機械的 enforcement。

### Modified Capabilities

- なし。`adaptive-change-execution` の policy と MVP の基本 handoff 契約は変更しない。

## Impact

- **Code**: MVP bridge の責務別 modules、manifest migration / validation、skill の lifecycle gates を拡張する。
- **Generated state**: MVP で確定した追跡・保持方針に従い、stable mappings、ownership index、checkpoints、
  preview / finalize receipts を保存する。
- **Tests**: deterministic fixtures、property tests、filesystem / Git integration tests、opt-in tool smoke を追加する。
- **Compatibility**: MVP manifest は明示 migration preview 後だけ更新する。未知 schema と downgrade は fail-closed。
- **Policy references**: policy本文はcurrent treeのADR-0008 / workflowを正とし、stable IDは
  `docs/agents/adaptive-change-execution.references.json`で管理する。旧change spec commitは非規範の
  provenanceに限定し、通常CIは到達不能なGit履歴を読まない。
- **Safety**: repo 外 path、symlink escape、ownership 不明、drift、期限切れ承認、部分検査では書込・削除しない。
- **Git / delivery**: MVP changeをmergeしたbaseからの専用branch / PRで保持し、他のOpenSpec changeを
  同じPRへ載せない。
