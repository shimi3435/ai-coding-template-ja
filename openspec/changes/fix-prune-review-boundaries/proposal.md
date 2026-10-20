# PR #91 の境界条件修正

## Why

PR #91（ee7a8d04cf0d8cd6727f4068646810b9f2866664）のレビューで、hardlink による対象外変更、Git の改行・mode 判定との差異、版形式の過剰受理、parser 再検証コストが指摘された。利用者が grilling で選択した方針を実装する。

## What Changes

- 編集対象 hardlink を事前および各書込み直前に拒否する。
- Git の改行変換と core.fileMode を尊重し、未対応変換は診断付きで拒否する。
- TEMPLATE_VERSION を ASCII の通常版 X.Y.Z に限定し、Python / TypeScript の判定を共通ケースで検証する。
- parser の既知コストを測定して記録する。artifact 検証の再利用・batch 化は別 change とする。

## Impact

対象は prune の preflight、安全性、通常検証と prune に共通する版契約、およびレビューに必要な計測である。既存 PR の受入結果を修復する一体の change とし、独立した性能最適化は含めない。dependency / lockfile / CI の変更、外部 write、commit / push / merge は行わない。

## Acceptance

spec delta と design の spec-holes 対応を満たし、focused tests、最新入力の task check / ./scripts/check.sh、task check:template、OSWF-5 の review / verifier を成功させる。hosted CI は push 後の確認事項として残し、未実行を成功扱いしない。
