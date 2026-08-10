# Change: v2 の Node 管理基盤と Python 3.14 基準を確立する

## Status

実行経路と進捗の正本は `tasks.md` とする。

## Why

現行テンプレートは Python 中心であり、OpenSpec、スキル管理、生成物検査など、リポジトリ全体を管理する機能を拡張するための共通ランタイムがない。Python 製ツールへ管理責務を追加し続けると、利用者向けアプリケーション環境とテンプレート自身の管理環境が混ざる。

v2 では Node.js を必須の管理プレーンとして導入し、既存 Python ツールは段階的に統合する。同時に Python の既定・最低バージョンを 3.14 へ更新し、以後の OpenSpec OPSX 化と決定論的スキル更新の基礎を作る。

## Dependencies

- 独立 change。`main` の `8a1d42f` を proposal の基点とする。
- 後続 `migrate-openspec-to-opsx` と `add-deterministic-skill-updater` は、本 change の close と merge を実装開始条件とする。
- 現在進行中の `harden-openspec-gsd-handoff-lifecycle` と同じ PR に含めない。

## What Changes

- Node.js 24 LTS と npm をテンプレートの必須管理ランタイムにする。
- Python の既定・最低バージョンを 3.14 に更新する。
- npm 依存を exact pin と lockfile v3 で固定し、安全なインストール契約を定める。
- TypeScript ESM の `repo-tools` CLI を追加し、Node 24 の型除去、`tsc --noEmit`、Node test runner を使う。実行用 `dist` や追加ランナーは導入しない。
- `task` を利用者向けの公開インターフェースとして維持し、Node / Python の内部コマンドを集約する。
- bootstrap にランタイム検査と明示的な Node 導入経路を追加する。
- `task check` をネットワーク不要の統合検査へ拡張し、v2 のバージョン境界を確立する。

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
- **Compatibility**: v1 利用者向け自動移行は提供しない。v2 移行ガイドを用意する。
- **Release**: `TEMPLATE_VERSION` を `2.0.0` に更新する。
