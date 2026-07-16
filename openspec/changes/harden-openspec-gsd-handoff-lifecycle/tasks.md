# Execution route: GSD（dependency-gates-satisfied / handoff-approval-pending）

この change は stable mapping、複数 manifest の ownership、操作前検査、failure recovery、finalize を
依存順序を持つ複数 phase で実装するため GSD 経路とする。OpenSpec `tasks.md` は境界ゲートだけを持ち、
詳細計画と phase 進捗は GSD 側に置く。

## 1. Dependency and contract gates

- [x] 1.1 `revise-openspec-gsd-execution-boundary` と `automate-openspec-gsd-handoff` がmerge済みであること、MVP manifest schema、`handoff.json` 追跡・保持方針、対応 tool contracts を確認し、MVP merge後のbaseから本changeだけを載せる専用branch / PRを用意する
- [x] 1.2 本 change の各 enforcement と参照する `adaptive-change-execution` requirement / scenario の対応、manifest migration / rollback contract、実装時の spec-holes Phase 2 計画を確定し、strict validate 後に handoff する

## 2. Stable identity and mapping gates

- [ ] 2.1 stable requirement / scenario ID、欠番非再利用、source fingerprint、manifest migration の phase を完了し、順序変更・Unicode・衝突・再実行の検証を通す
- [ ] 2.2 source-to-phase / plan / evidence mapping の phase を完了し、未対応・重複・cross-change 混在を fail-closed に検出する

## 3. Drift and ownership gates

- [ ] 3.1 plan / execute / resume / verify / finalize 前の高度 drift 検査 phase を完了し、checkbox-only 差分と仕様差分を区別する
- [ ] 3.2 repository-wide multi-manifest ownership phase を完了し、単独所有・共有参照・競合・由来不明・path escape の検証を通す

## 4. Recovery and finalize gates

- [ ] 4.1 checkpoint、interruption、partial failure、capability change を扱う resume / recovery phase を完了し、自動 route switch・rollback・修復を行わないことを検証する
- [ ] 4.2 finalize / cleanup preview、承認、直前再検査、receipt、途中失敗再開の phase を完了し、ownership 外変更がないことを検証する

## 5. Verification gates

- [ ] 5.1 全 spec-holes Phase 1 の該当項目を fixture test、例示 test、property test、または理由付き未検証へ一対一で対応付け、通常 CI と opt-in OpenSpec / GSD smoke を通す
- [ ] 5.2 GSD verification と独立して OpenSpec 原本との対応を確認し、`openspec validate harden-openspec-gsd-handoff-lifecycle --strict`、`task openspec:validate`、`task check`、drift・ownership・broken-reference 検査を通す

## 6. Close gate

- [ ] 6.1 `self-review` と close policy の確認後、finalize preview と承認 receipt を検証し、本 change の所有範囲だけを close する
