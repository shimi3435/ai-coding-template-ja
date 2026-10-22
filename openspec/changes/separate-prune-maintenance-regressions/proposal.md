# Change: prune 専用回帰検証を保守側へ分離する

## Why

Issue #51 / PR #91 は2026-10-21に merge された（base `9db2f3366d4f2a4bd04fcb993144b54d36ebe102`）。
固定 mvdan/sh parser と R01〜R06 は維持する。旧レビューの独自 shell parser blocker は現状に該当しない。
ただし通常 pytest が prune の詳細回帰を収集し、runtime も K05 のテスト corpus を要求している。
prune 後のアプリケーション開発へこの保守負担を配布し続ける必要はない。

## What Changes

- **BREAKING（保守資産配置）**: 旧 K05 `tests/fixtures/template_prune/references.json` を
  `template-maintenance/fixtures/prune/references.json` へ移し、下流保持要件を撤回する。
- prune 詳細回帰・token property・計測テストを保守側へ移し、`task check:template` で全件収集する。
- runtime の corpus 読取り・schema 検証を撤去し、保守 gate が corpus を検証する。
- 通常 check には公開 CLI smoke、構成・参照安全性、version、parser artifact、JSON protocol、
  Skill / legal / links 等の共通検証を維持する。共通 fixture を corpus 非依存に分離する。
- 更新した固定 manifest により、新しい保守資産も bundled 時は必須、prune 時はまとめて削除する。
- pruned `task check` の変更前後各3回を同じ環境で測定し、時間・最大RSS・収集件数を比較する。

## Impact

詳細は [design.md](design.md)、[validation.md](validation.md)、[spec-holes.md](spec-holes.md)、
[tasks.md](tasks.md) を参照する。これは既存合意のテスト配布境界変更であり、CLI / JSON protocol、
R01〜R06、Git / hardlink / index 保護、syntax 拒否、offline 性は変更しない。
Node 起動削減、artifact hash 再利用、batch parser、apply 再検証の最適化、依存更新は対象外とする。
速度向上率は必須条件にせず、明らかな悪化が出た場合は採用を再判断する。
