# Change: v2 の Node 管理基盤と Python 3.14 基準を確立する

## Status

実行経路と進捗の正本は `tasks.md` とする。

## Why

現行テンプレートは Python 中心であり、OpenSpec、スキル管理、生成物検査など、リポジトリ全体を管理する機能を拡張するための共通ランタイムがない。Python 製ツールへ管理責務を追加し続けると、利用者向けアプリケーション環境とテンプレート自身の管理環境が混ざる。

v2 では Node.js を必須の管理プレーンとして導入し、既存 Python ツールは段階的に統合する。同時に Python の既定を 3.14、対応最低バージョンを 3.14 以上へ更新し、以後の OpenSpec OPSX 化と決定論的スキル更新の基礎を作る。

## Dependencies

- 独立 change。`main` の `8a1d42f` を proposal の基点とする。
- 現 branch は計画専用であり、実装を行わない。実装承認後に最新 `main` から新しい専用 branch を作り、canonical artifacts を cherry-pick して `spec-holes` と OpenSpec validation を再実行する。
- 後続 `migrate-openspec-to-opsx` と `add-deterministic-skill-updater` は、本 change の close と merge を実装開始条件とする。
- 全 4 changes 完了後の `TEMPLATE_VERSION=2.0.0` 更新、移行ガイド最終化、release-ready 判定は、別 change `prepare-v2-release` が所有する。
- 現在進行中の `harden-openspec-gsd-handoff-lifecycle` と同じ PR に含めない。

## What Changes

- Node.js 24 LTS と npm をテンプレートの必須管理ランタイムにする。
- Python の既定を 3.14、対応最低バージョンを 3.14 以上に更新する。
- npm 依存を exact pin と lockfile v3 で固定し、安全なインストール契約を定める。
- TypeScript ESM の `repo-tools` CLI を追加し、Node 24 の型除去、`tsc --noEmit`、Node test runner を使う。実行用 `dist` や追加ランナーは導入しない。
- `task` を利用者向けの公開インターフェースとして維持し、Node / Python の内部コマンドを集約する。
- bootstrap にランタイム検査と明示的な Node 導入経路を追加する。
- `task check` の offline 合成基盤を作り、Node typecheck / test と既存 Python checks を統合する。後続 change は同じ合成点へ各自の検査を追加する。

## Capabilities

### New Capabilities

- `v2-runtime-foundation`: Node 管理プレーン、Python 3.14 基準、決定論的依存導入、統合検査を提供する。

### Modified Capabilities

- なし。

## Impact

- **Runtime**: Node.js 24 LTS と npm が必須になる。Python 3.14 未満は非対応になる。
- **Dependencies**: `package.json`、`package-lock.json`、`.node-version` を追加し、Python 側の version 制約を更新する。
- **CLI**: `task` の既存入口は維持するが、内部で repo-local Node CLI を呼び出せるようになる。
- **CI / bootstrap**: Node と Python の version 検査、npm の決定論的導入、Node 検査が追加される。
- **Compatibility**: v1 利用者向け自動移行は提供しない。移行ガイド最終化は `prepare-v2-release` に引き渡す。
- **Release**: 現行 `1.0.0` の `TEMPLATE_VERSION` を維持する。`2.0.0` への更新と release-ready 判定は `prepare-v2-release` に引き渡す。
