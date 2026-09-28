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
dependency / lockfile、Skill frontmatter parser、workflow の禁止 runner 文字列検査、runtime
判定（#50）は変更しない。廃止済み automation / SemVer 範囲選択を復活させない。
この変更には CLI の受理挙動と CI gate の変更があるため、AGENTS.md OSWF-5 に従う。

## Acceptance

`specs/repository-contracts/spec.md` の全要件と `spec-holes.md` の検証対応を満たし、focused validation、
最新入力の `./scripts/check.sh`、独立 review / verifier が成功する。未検証を完了としない。
利用者は対話で設計と実装・検証への移行を承認済み。commit / push は後続の明示依頼で承認済み。
PR / merge は依頼に含まない。

## Cycle 2 の修正範囲

補助設定による gate skip と shell 実行の迂回を閉じるため、Taskfile の最小許可リストを仕様化する。
CI check / rename-smoke に独立 contract step を追加し、ローカル最終検証も同じ順序にする。
静的検査の成功表示、利用ガイド、agent workflow の最終検証手順、回帰 tests を整合させる。
dependency / lockfile、runtime 文法は変更しない。

## Cycle 3 の修正範囲

vars / 任意 template を拒否し、現行10組の CLI_ARGS だけを残す。正式な scripts/check.sh を追加し、
SoT・利用者・Agent・CI の最終検証入口を統一する。隔離 check も内側でこの script を呼ぶ。
通常 test から Task exact pin を撤去し、バージョン依存の旧挙動再現を CI 専用に分離する。
利用者は方針全体と実装・検証・commit / push を「OK」で承認した。
