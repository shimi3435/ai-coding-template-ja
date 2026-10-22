# Change: virtualenvの既知脆弱性を最小依存更新で解消する

## Why

PR #92のコア依存監査が、既存virtualenv 21.7.13のCVE-2026-113726 / 113776 / 113732 / 113725 / 113722で失敗した。
同PRはlockを変更していない。利用者は2026-10-22に、独立したchange・PRで最小更新を行い、先行merge後に#92へ戻る方針を承認した。

## What Changes

- virtualenvを5件の修正を含む21.14.9へ更新する。解決に必要な推移依存だけを追従させる。
- locked環境、正式gate、コア監査、virtualenv生成環境とpre-commitの実動作、hosted CIを検証する。
- 完了時にふりかえりを記録してpre-merge closeする。mergeは利用者が行う。

## Impact

uv.lockとclose時のふりかえりだけを恒久変更とし、prune最適化・runtime policy・監査範囲・ignore設定は変更しない。
仕様はdesign / spec-holes / specs/core-dependency-audit/spec.md、進捗と証跡はtasks.mdを正とする。
