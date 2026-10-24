# Change: filelockの既知脆弱性を独立した依存更新で解消する

## Why

PR #93をmergeしたmainでも、コア監査はfilelock3.29.4のCVE-2026-112940 / 112913 / 112907で失敗する。
PR #92はlockを変更していない。利用者は2026-10-24に別OpenSpec・別PRでの更新と互換性検証を承認した。

## What Changes

- filelockだけを3.29.4から4.2.4へ更新する。4.2.1のセキュリティ修正に加え、後続のロック状態修正を含める。
- コア監査、実利用するFileLockと依存consumer、正式gate、独立review / verifier、hosted CIを確認する。
- ふりかえりを残してpre-merge closeする。mergeは利用者が行う。

## Impact

恒久差分はuv.lockとふりかえりだけ。prune最適化、公開設定、CI、監査除外、extrasの追加導入は変更しない。
仕様はdesign / spec-holes / specs/core-lock-dependency/spec.md、進捗はtasks.mdを正とする。
