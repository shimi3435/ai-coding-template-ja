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

### 1. Node 24 LTS と Python 3.14 の major/minor line を固定する

`.node-version` は `24`、`.python-version` は `3.14` とする。patch は利用環境の同一 line 内で更新可能とし、CI も同じ line を使う。bootstrap と doctor は実際の version を表示し、line 不一致を失敗にする。

### 2. npm dependency は exact pin と lockfile v3 を正本にする

`package.json` は `private: true` とし、依存 version に範囲指定を使わない。`package-lock.json` の lockfileVersion は 3 とする。通常導入は `npm ci --ignore-scripts`、監査は `npm audit --audit-level=high` とする。lockfile 更新は明示操作に限定する。

### 3. TypeScript は Node 24 で直接実行する

管理 CLI は ESM とし、Node 24 の型除去で直接実行できる TypeScript 構文だけを使う。`tsc --noEmit` を静的検査、`node --test` を test runner とする。`tsx`、Jest、Vitest、実行用 build / `dist` は追加しない。

### 4. `task` を安定した公開インターフェースにする

利用者は `task <name>` を使う。Taskfile は repo-local executable を直接呼び、`npx` と `npm exec` を使わない。`repo-tools` 自身も package script または直接の repo-local entrypoint から起動し、暗黙取得を発生させない。

### 5. bootstrap は検査を既定、導入を opt-in にする

既定 bootstrap は Node 24 / npm / Python 3.14 を検出し、不足または version 不一致なら説明付きで停止する。`--install-node` 指定時だけ Node 公式配布物を user-local directory へ取得し、公開 SHA-256 と照合する。対象は Linux x64 / arm64。既存ファイルや既存導入を上書きしない。

### 6. `task check` は offline の統合ゲートにする

依存導入後の `task check` はネットワークへ接続せず、Node typecheck / test、Python checks、スキル整合性、OpenSpec 生成物 drift、repo-local OpenSpec validate を実行する。GSD 不在を表す公開入口は `check:isolated` とし、旧 `check:without-gsd` を置換する。

### 7. v2 は major release とする

`TEMPLATE_VERSION` を `2.0.0` に更新し、Node 必須化と Python 最低 version 更新を破壊的変更として明示する。自動移行ではなく、前提、変更点、手動手順、rollback を記載した移行ガイドを提供する。

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
5. `TEMPLATE_VERSION` と v2 移行ガイドを更新する。

各段階で既存 Python 検査を維持する。途中で Node 経路が失敗する場合、Node 統合 commit を revert できる単位に分ける。

## Open Questions

なし。実装中に version line、checksum 形式、Node 型除去の制約が変化した場合は OpenSpec を更新し、再度 `spec-holes` を行う。
