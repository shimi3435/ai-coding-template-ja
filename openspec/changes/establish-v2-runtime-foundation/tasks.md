## Execution Route

**Route: direct OpenSpec apply.** 一体の成果だが、単一 change、単一管理 CLI、独立 phase 不要であり、OpenSpec の詳細タスクから安全に実装・検証できる。GSD は使わない。

## Execution Budget

- **恒久成果:** Node / Python runtime 宣言、exact npm lock、TypeScript 管理 CLI、bootstrap、Task / CI 統合、test、release handoff note。
- **一時実行証跡:** 本 change directory の spec-holes 対応表、baseline、requirement / test 対応。close 前に change directory とともに削除する。
- **早期検証:** runtime / package parser の Node test、bootstrap の fake command / local fixture test、`task check:isolated`。
- **停止・再計画:** 新しい外部 dependency、公開 runtime command、trust boundary、独立出荷可能成果、通常 CI job の追加が必要になった場合。

## 1. Dependency and test baseline

- [x] 1.1 現 planning branch では実装せず、実装承認後に最新 `main` から新しい専用 branch を作り、canonical artifacts だけを cherry-pick する
- [x] 1.2 移植後の source で `spec-holes` と `task openspec:validate` を再実行し、Node 24、Python 3.14 既定 / `>=3.14` 最低境界、npm lockfile、bootstrap、Task 公開入口を例示 test と property test に対応付ける
- [x] 1.3 現行 `task check` と bootstrap の baseline 結果を記録する

## 2. Runtime and dependency contract

- [x] 2.1 `.node-version` を Node 24、`.python-version` と CI baseline を Python 3.14、Python package metadata を `>=3.14` へ更新する
- [x] 2.2 `private: true`、exact dependency、lockfile v3 の `package.json` / `package-lock.json` を追加する
- [x] 2.3 `npm ci --ignore-scripts` と `npm audit --audit-level=high` の明示入口を追加する

## 3. Node management CLI

- [x] 3.1 TypeScript ESM の最小 `repo-tools` entrypoint と責務別 module を追加する
- [x] 3.2 `tsc --noEmit` と Node test runner の test を追加し、Node 24 型除去で直接実行する
- [x] 3.3 `npx`、`npm exec`、`tsx`、Jest、Vitest、実行用 `dist` が公開経路にないことを検査する

## 4. Bootstrap and Task integration

- [x] 4.1 bootstrap に Node / npm / Python version 検出を追加し、Node 24 以外と Python 3.14 未満を fail-fast にする。Python 3.15 以上は line 不一致だけでは拒否しない
- [x] 4.2 `--install-node` に公式配布物、SHA-256、Linux x64 / arm64、user-local、no-overwrite 契約を実装・テストする
- [x] 4.3 Taskfile から repo-local Node CLI を直接呼び、`check:without-gsd` を `check:isolated` へ置換する
- [x] 4.4 `task check` に Node typecheck / test と既存 Python checks を統合し、ネットワークアクセスを禁止する

## 5. Version handoff and verification

- [x] 5.1 現行 `1.0.0` の `TEMPLATE_VERSION` が未変更であることを検査し、破壊的変更と `prepare-v2-release` への dependency handoff note を追加する
- [x] 5.2 Node 24 と Python 3.14 の clean bootstrap、Python 3.14 未満の拒否、Python 3.15 以上の preflight 受理、既存環境検出、architecture / checksum / no-overwrite failure を検証する
- [x] 5.3 `task check`、`task check:isolated`、`task openspec:validate` を実行する
- [ ] 5.4 全 requirements / scenarios と test evidence を対応付け、change を close する

## Implementation Evidence

- `spec-holes`: [spec-holes.md](spec-holes.md)。再列挙で検出した runtime 検出不能、package metadata 不正、未知 CLI command、旧 task alias、bootstrap 部分失敗、offline dependency 不足を spec delta へ追加した。
- OpenSpec validate baseline: OpenSpec CLI `1.3.1`、`task openspec:validate` は `1 passed, 0 failed`。
- Project baseline: Node `v26.1.0`、npm `11.17.0`、Python `3.12.9`、uv `0.11.26`、Task `3.51.1`。`task check` は `247 passed`、ruff / basedpyright green。
- Bootstrap baseline: Ubuntu `22.04.5 LTS`、既存 uv / Task / Node / npm / gh を検出し、`task setup` と pre-commit hook 導入を完了、exit 0。
- Supported runtime / dependency: Node `v24.14.1`、npm `11.11.0`、Python `3.14.6` で `npm ci --ignore-scripts`、`npm run typecheck`、Node test `43 passed`、`npm audit --audit-level=high`（脆弱性 0 件）を確認した。Node `v18.20.8` から boot guard が TypeScript load 前に必要 line と完全 version を表示して非ゼロ終了することも実行確認した。
- Bootstrap verification: fixture test `27 passed`。Python 3.13 拒否、Python 3.15 / 4.0 受理、Linux x64 / arm64、空白・shell 特殊文字を含む path、unsafe root / symlink escape、checksum / download / extract、no-overwrite、activation race を確認した。公式 `latest-v24.x` の checksum と x64 archive を使う opt-in 経路では Node `v24.19.0` を空の一時 HOME 配下へ導入し、完全 version、path、安全に再実行できる PATH 設定 command の表示を確認した。
- Final gates: `task check` は Node test `43 passed`、pytest `292 passed`、ruff / basedpyright / TypeScript typecheck green。`task check:isolated` は OpenSpec / GSD / `npx` 不在、無効 proxy、空の HOME / cache で同じ結果。独立 verifier の `strace -f -e trace=network task check` は AF_INET / AF_INET6 の connect / send 0 件。`task openspec:validate` は `1 passed, 0 failed`。
- Requirement mapping: H1–H15 は [spec-holes.md](spec-holes.md) の対応表どおり、runtime / repository contract / bootstrap / Task integration / handoff test と実 CLI evidence へ対応済み。実 Linux arm64 host、実 disk-full、GitHub-hosted CI は未検証であり、arm64 と失敗境界は local fixture で検証した。
