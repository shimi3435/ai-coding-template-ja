# v2の配布境界と移行引き渡しを確定する

## Why

Issue #67の合意済み方針を、最新mainのファイル・public task・CI・共有依存へ対応付ける。
現在は任意機能やprune対象の保守文書を通常checkが要求しており、分類だけでは下流利用は成立しない。

## What Changes

- テンプレート保守者向けADRに配布境界の判断を保存する。
- 同じ保守文書領域の監査リファレンスに分類、根拠、prune境界、後続Issueの受け入れ条件を保存する。
- 既存release手順から監査へ導線を付ける。実装、live policy、既存履歴、版数、CIは変更しない。
- CI検証漏れとprepare-v2-releaseは、それぞれ独立したIssue提案文として記録する。外部発行しない。

## Impact

対象は `docs/template/` の設計・監査文書と本changeだけ。
#51・#65・#66の実装修復、prune実適用、host導入、外部write、commit、push、PR、close、mergeは対象外。
通常CIに本changeや一時probeを組み込まない。監査完了と後続修復・v2出荷完了を区別する。

## Acceptance

仕様は `specs/v2-boundary-audit/spec.md`、12分類の穴と検証対応は `spec-holes.md`、
依存順と証跡は `tasks.md` を参照する。合意済み方針は再議論せず、新しい未決判断は後続authoringの境界を明示する。
