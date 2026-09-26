# 残存する repository parser を既存 dependency に委譲する

## Why

Issue #77。#75 / #76 が merge された main `41dc839d05dc8134f1f7509f38fb14cbd87f2d60` を基準とする。
`repository-contracts.ts` の exact SemVer 解析、Taskfile のインデント解析・文字列検索が残っている。
既存の `semver@7.8.5` / `yaml@2.9.0` に構文解析を委譲し、合意済みの project policy を分離する。

## What Changes

- exact dependency version の受理範囲を semver の数値・文字数上限に合わせ、正規形を要求する。
- Taskfile を YAML 1.2 として解析し、構文エラー・重複キーおよび合意した未対応構造を拒否する。
- 必須入口を説明文やコメントではなく、解析後の task / command から確認する。
- 下流向けの受理契約と従来との差分を恒久リファレンスと release notes に記載する。

## Impact

変更対象は repository contracts、その CLI import 境界、公開 CLI を通したテスト、仕様文書である。
dependency / lockfile、Taskfile の実行内容、Skill frontmatter parser、workflow の文字列検査、runtime
判定（#50）は変更しない。廃止済み automation / SemVer 範囲選択を復活させない。
この変更には CLI の受理挙動と CI gate の変更があるため、AGENTS.md OSWF-5 に従う。

## Acceptance

`specs/repository-contracts/spec.md` の全要件と `spec-holes.md` の検証対応を満たし、focused validation、
最新入力の `task check`、独立 review / verifier が成功する。未検証を完了としない。
利用者は対話で設計と実装・検証への移行を承認済み。commit / push / PR / merge は今回の依頼に含まない。
