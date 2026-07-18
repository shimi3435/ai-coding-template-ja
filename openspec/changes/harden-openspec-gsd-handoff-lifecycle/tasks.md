# Execution route: GSD

この change は stable mapping、複数 manifest の ownership、操作前検査、failure recovery、finalize を
依存順序を持つ複数 phase で実装するため GSD 経路とする。OpenSpec `tasks.md` は境界ゲートだけを持ち、
詳細計画と phase 進捗は GSD 側に置く。

## 1. Dependency and contract gates

- [x] 1.1 `revise-openspec-gsd-execution-boundary` と `automate-openspec-gsd-handoff` がmerge済みであること、MVP manifest schema、`handoff.json` 追跡・保持方針、対応 tool contracts を確認し、MVP merge後のbaseから本 change だけを載せる専用 branch / PRを用意する
- [x] 1.2 本 change の各 enforcement と参照する `adaptive-change-execution` requirement / scenario の対応、manifest migration / rollback contract、実装時の spec-holes Phase 2 計画を確定し、strict validate 後に source-pinned handoff previewを提示できる状態にする
- [x] 1.3 previewへの新たな明示承認後にだけprepared manifestを永続化し、GSD 1.5.0 entrypointのstructured acceptanceとroute別postconditionを確認して`mark-started`を完了する

## 2. Stable identity and mapping gates

- [x] 2.1 manifest migration と stable source identity の phase を完了し、対応する OpenSpec scenarios の検証を通す
- [ ] 2.2 source-to-phase / plan / evidence mapping の phase を完了し、対応する OpenSpec scenarios の検証を通す

## 3. Drift and ownership gates

- [ ] 3.1 lifecycle operation 前の drift 検査 phase を完了し、対応する OpenSpec scenarios の検証を通す
- [ ] 3.2 repository-wide multi-manifest ownership phase を完了し、対応する OpenSpec scenarios の検証を通す

## 4. Recovery and finalize gates

- [ ] 4.1 interruption / partial failure からの resume / recovery phase を完了し、対応する OpenSpec scenarios の検証を通す
- [ ] 4.2 finalize / cleanup preview と receipt の phase を完了し、対応する OpenSpec scenarios の検証を通す

## 5. Verification gates

- [ ] 5.1 全 spec-holes Phase 1 の該当項目を fixture test、例示 test、property test、または理由付き未検証へ一対一で対応付け、通常 CI と opt-in OpenSpec / GSD smoke を通す
- [ ] 5.2 GSD verification と独立して OpenSpec 原本との対応を確認し、`openspec validate harden-openspec-gsd-handoff-lifecycle --strict`、`task openspec:validate`、`task check`、drift・ownership・broken-reference 検査を通す

## 6. Close gate

- [ ] 6.1 `self-review` と close policy の確認後、finalize preview と承認 receipt を検証し、本 change の所有範囲だけを close する
