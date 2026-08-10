## Context

Node は利用者アプリケーションの主言語ではなく、テンプレート自身を管理するためのランタイムとする。Python の lint、typecheck、test など既存機能は維持し、Node CLI から必要に応じて呼び出す。全面移植は行わない。

## Goals / Non-Goals

**Goals:**

- 後続の OpenSpec とスキル更新を同じ repo-local 管理プレーンへ載せる。
- ローカルと CI で同じ依存、同じコマンド、同じ検査結果を再現する。
- Node 未導入時の失敗理由と、明示的な user-local 導入経路を提供する。
- Python 3.14 を v2 の明確な互換性境界にする。

**Non-Goals:**

- 既存 Python ツールを一括して TypeScript へ移植しない。
- v1 下流リポジトリを自動変換しない。
- Node や Python の patch version をリポジトリで固定しない。
- `npx`、`npm exec`、暗黙のネットワーク取得を公開経路にしない。

## Decisions

### 1. Node 24 LTS を固定し、Python 3.14 を既定かつ最低対応にする

`.node-version` は `24`、`.python-version` は `3.14` とし、CI baseline も Python 3.14 とする。bootstrap と preflight は Node 24 以外と Python 3.14 未満を拒否し、実際の version を表示する。Python 3.15 以上は major/minor line 不一致だけでは拒否せず、互換性は通常の repository checks で判定する。Node 24 と Python 3.14 の patch は固定しない。

### 2. npm dependency は exact pin と lockfile v3 を正本にする

`package.json` は `private: true` とし、依存 version に範囲指定を使わない。`package-lock.json` の lockfileVersion は 3 とする。通常導入は `npm ci --ignore-scripts`、監査は `npm audit --audit-level=high` とする。lockfile 更新は明示操作に限定する。

### 3. TypeScript は Node 24 で直接実行する

管理 CLI は ESM とし、Node 24 の型除去で直接実行できる TypeScript 構文だけを使う。`tsc --noEmit` を静的検査、`node --test` を test runner とする。`tsx`、Jest、Vitest、実行用 build / `dist` は追加しない。

### 4. `task` を安定した公開インターフェースにする

利用者は `task <name>` を使う。Taskfile は repo-local executable を直接呼び、`npx` と `npm exec` を使わない。`repo-tools` 自身も package script または直接の repo-local entrypoint から起動し、暗黙取得を発生させない。

### 5. bootstrap は検査を既定、導入を opt-in にする

既定 bootstrap は Node / npm / Python を検出し、Node 24 の不足・不一致または Python 3.14 未満なら説明付きで停止する。Python 3.15 以上は version line だけを理由に停止しない。`--install-node` 指定時だけ Node 公式配布物を user-local directory へ取得し、公開 SHA-256 と照合する。対象は Linux x64 / arm64。既存ファイルや既存導入を上書きしない。

### 6. `task check` は offline の統合ゲートにする

依存導入後の `task check` はネットワークへ接続せず、Node typecheck / test と既存 Python checks を実行する合成基盤とする。GSD 不在を表す公開入口は `check:isolated` とし、旧 `check:without-gsd` を置換する。`migrate-openspec-to-opsx` は OpenSpec generated drift と repo-local OpenSpec validate、`add-deterministic-skill-updater` は新しい skill integrity、`automate-skill-update-prs` は automation workflow check を同じ合成点へ追加する。本 change の完了は、それら未実装の後続検査に依存しない。

### 7. release version の更新を後続 change に分離する

本 change は現行 `1.0.0` の `TEMPLATE_VERSION` を変更せず、Node 必須化と Python 最低 version 更新を後続 change へ引き渡す破壊的変更として記録する。全 4 changes 完了後の `prepare-v2-release` が `TEMPLATE_VERSION=2.0.0` 更新、移行ガイド最終化、release-ready 判定を所有する。

## Risks / Trade-offs

- 管理ランタイムが増え、初期導入時間と保守対象が増える。exact lock と公開入口統一で差異を抑える。
- Node の型除去で使える TypeScript 構文に制約がある。静的検査と実行 test の双方で保証する。
- patch を固定しないため完全な runtime byte-for-byte 再現にはならない。一方、LTS security patch を取り込める。
- bootstrap の downloader は供給網リスクを持つ。公式 URL、checksum 検証、対象 architecture 制限、no-overwrite を必須にする。

## Migration Plan

1. Node / Python version 宣言と bootstrap の失敗契約を追加する。
2. package metadata、exact lock、repo-tools の最小 entrypoint と検査を追加する。
3. Taskfile / CI を Node 必須の統合経路へ切り替える。
4. Python 3.14 非互換を修正し、全検査を通す。
5. 現行 `1.0.0` の `TEMPLATE_VERSION` を維持し、破壊的変更と後続 release dependency を handoff note に記録する。

各段階で既存 Python 検査を維持する。途中で Node 経路が失敗する場合、Node 統合 commit を revert できる単位に分ける。

## Open Questions

なし。実装中に version line、checksum 形式、Node 型除去の制約が変化した場合は OpenSpec を更新し、再度 `spec-holes` を行う。
