# Execution route: GSD（direction-approved / implementation-blocked）

このchangeはbridge MVP、skill、追跡manifest、検証基盤を複数phaseで実装するためGSD経路とする。
bridge不在の初回は先行changeの手動handoffを使う。tool contractsは固定済みだが、1.4のstrict
validate、`spec-holes` Phase 1再確認、利用者承認までproduction codeを実装せず、以下はOpenSpecの
境界ゲートだけを持つ。

## 1. Implementation gates

- [x] 1.1 `revise-openspec-gsd-execution-boundary` がmerge済みであることと、参照するpolicy requirement・手動handoff・close policyの整合を確認し、そのbaseから本changeだけを載せる専用branch / PRを用意する
- [x] 1.2 対応OpenSpec CLI version / JSON schema fixtureと、MVPに必要なGSD capabilityの具体probe signal・失敗条件を確定する
- [x] 1.3 最小manifestのfeature-branch追跡、source commit後の別commit、ignore時の停止、テンプレートpre-merge手動削除をfixtureとworkflowへ反映し、`.planning/`をignoreする下流ではcross-session resumeを保証できない旨を`docs/optional/gsd.md`へ追記する
- [x] 1.4 1.1–1.3の決定をOpenSpecへ反映し、strict validateと`spec-holes` Phase 1を再実行して承認後に手動handoffする

## 2. Bridge MVP phase

- [x] 2.1 artifact path discovery、共通Markdown reader、task progress算出、最小manifest、capability / Git preflightを責務別moduleで実装する
- [x] 2.2 path traversal、空・重複・壊れた入力、部分生成、ignoreされたmanifest、capability不足でfail-closedすることを検証する

## 3. Skill phase

- [x] 3.1 `execute-openspec-change` skillと必要なagent用導線を実装し、先行policyの検査、入力表示、承認、bridge実行、GSD handoff開始までを検証する

## 4. Test phase

- [ ] 4.1 JSON path discoveryとMarkdown fallback、進捗、最小manifest、path safety、atomic writeのfixtures / testsを通常CIへ追加する
- [ ] 4.2 実OpenSpec / GSDのopt-in smokeを追加し、GSD未導入環境の通常`task check`が成功することを確認する

## 5. OpenSpec acceptance

- [ ] 5.1 先行changeの最終完了requirementに従い、MVPの全requirement・scenario・spec-holesと実装・テスト・理由付き未検証を対応付ける
- [ ] 5.2 `openspec validate automate-openspec-gsd-handoff --strict`、`task openspec:validate`、`task check`、manifest追跡・リンク検査を通す

## 6. Close

- [ ] 6.1 `self-review`を行い、後続hardeningとの境界を確認し、既存close policyで一時handoff artifactsを手動処理する
