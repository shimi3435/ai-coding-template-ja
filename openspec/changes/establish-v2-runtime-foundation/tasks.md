## Execution Route

**Route: direct OpenSpec apply.** 一体の成果だが、単一 change、単一管理 CLI、独立 phase 不要であり、OpenSpec の詳細タスクから安全に実装・検証できる。GSD は使わない。

## 1. Dependency and test baseline

- [ ] 1.1 `main` を最新化し、他の active change を branch に含めない
- [ ] 1.2 Node 24、Python 3.14 既定 / `>=3.14` 最低境界、npm lockfile、bootstrap、Task 公開入口の spec-hole を例示 test と property test に対応付ける
- [ ] 1.3 現行 `task check` と bootstrap の baseline 結果を記録する

## 2. Runtime and dependency contract

- [ ] 2.1 `.node-version` を Node 24、`.python-version` と CI baseline を Python 3.14、Python package metadata を `>=3.14` へ更新する
- [ ] 2.2 `private: true`、exact dependency、lockfile v3 の `package.json` / `package-lock.json` を追加する
- [ ] 2.3 `npm ci --ignore-scripts` と `npm audit --audit-level=high` の明示入口を追加する

## 3. Node management CLI

- [ ] 3.1 TypeScript ESM の最小 `repo-tools` entrypoint と責務別 module を追加する
- [ ] 3.2 `tsc --noEmit` と Node test runner の test を追加し、Node 24 型除去で直接実行する
- [ ] 3.3 `npx`、`npm exec`、`tsx`、Jest、Vitest、実行用 `dist` が公開経路にないことを検査する

## 4. Bootstrap and Task integration

- [ ] 4.1 bootstrap に Node / npm / Python version 検出を追加し、Node 24 以外と Python 3.14 未満を fail-fast にする。Python 3.15 以上は line 不一致だけでは拒否しない
- [ ] 4.2 `--install-node` に公式配布物、SHA-256、Linux x64 / arm64、user-local、no-overwrite 契約を実装・テストする
- [ ] 4.3 Taskfile から repo-local Node CLI を直接呼び、`check:without-gsd` を `check:isolated` へ置換する
- [ ] 4.4 `task check` に Node typecheck / test と既存 Python checks を統合し、ネットワークアクセスを禁止する

## 5. Version handoff and verification

- [ ] 5.1 現行 `1.0.0` の `TEMPLATE_VERSION` が未変更であることを検査し、破壊的変更と `prepare-v2-release` への dependency handoff note を追加する
- [ ] 5.2 Node 24 と Python 3.14 の clean bootstrap、Python 3.14 未満の拒否、Python 3.15 以上の preflight 受理、既存環境検出、architecture / checksum / no-overwrite failure を検証する
- [ ] 5.3 `task check`、`task check:isolated`、`task openspec:validate` を実行する
- [ ] 5.4 全 requirements / scenarios と test evidence を対応付け、change を close する
