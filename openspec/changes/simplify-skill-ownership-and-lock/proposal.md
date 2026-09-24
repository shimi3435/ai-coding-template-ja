# Skill取得・検証の縮小とownership／lockの移行

文書種別: 変更提案。対象: [Issue #76](https://github.com/shimi3435/ai-coding-template-ja/issues/76)。

## Why

Skill更新PR自動化の撤去（#75、PR #79）は `66a1cba` でマージ済みである。このchangeは
最新main `cae73342c1b25755fe3a7abceb4032b1f9b21837` を起点とする。
公開GitHubからの取得前検査、integrity、legal承認、offline検証は維持し、
自作Skillの内容lock、SemVer範囲探索、元の作業コピーを更新するtransactionの責務を減らす。

2026-09-22の設計対話で以下の方針を合意した。今回の依頼は**OpenSpec文書の作成とbranchへのpushだけ**であり、
実装・実データ移行・公開CLI変更・change close・mainへのmergeは行わない。

## PR #81レビュー後の修正cycle

2026-09-25の利用者指示により、実装済みの同changeを再開する。remote取得の全 `gh api` 呼出へ
`--hostname github.com` を明示し、GH_HOST等の外部環境による取得先変更を防ぐ。
以下の初回文書段階の制約・未完了記述は履歴であり、現在の進捗・検証・再close条件はtasks.mdを正本とする。

## What Changes

- source / lockをschemaVersion 2へ変更する。sourceはremote / local / pluginを宣言し、lockはremoteだけを持つ。
- refはbranch / commit / 明示tagとする。SemVer範囲探索を廃止し、旧設定は固定commitへoffline変換する。
- `skill-tree-v1` を維持する。本文が同一でも、更新で確認した新commitへlockを進める。
- tagはrefの直接object SHAと解決済みcommitを固定する。同一commitへのtag再作成も通常更新を停止する。
- repinには承認するcommitを必須とし、tagでは直接object SHAも指定する。指定名だけlicense / legalMappingsの変更も受理し、旧実体は旧lock、新取得物は新sourceで検証する。包括的なforceを設けない。
- remoteからlocalへの明示切替は編集済み本文を保持し、出典・legalをsourceへ残す。自動remote復帰は提供しない。
- remote / local共通のroot SKILL.md、UTF-8、frontmatter / YAML、name一致、必須metadata検証を維持する。
- update / repin / adopt-local / migrateは元repository、開始commit、更新先の独立cloneを指定し、書込み先を検査する。clone作成・破棄・PR操作は標準ツールの手順とする。
- `skills:links` は現在checkoutの冪等な直接修復を維持し、非symlink衝突と親path逸脱を全対象で事前拒否する。
- 失敗・中断した候補は診断用に残し、再実行は新しいcloneから行う。旧transactionの撤去は保護境界の実証後とする。
- 旧形式は専用移行処理だけで読む。編集済みremoteのlocal化は名前指定で同時移行できる。不明な状態は推測しない。
- 実装時に実体・metadata・CLI / task・tests・CI・利用手順を一体で整合させる。

## Capabilities

### New Capabilities

出荷時の `openspec/specs/` は空であるため、このchangeではADDED Requirementsとして完全な契約を記載する。
既存機能の存在を否定する意味ではない。

- `skill-metadata`: R1 宣言とlock、R2 canonical / offline検証、R5 local ownership。
- `skill-acquisition`: R3 取得前検査とintegrity、R4 ref追跡とrepin。
- `skill-isolated-maintenance`: R6 隔離書込み、R7 一度だけの移行、R8 公開操作と完了条件。

## Impact

将来の実装対象は `repo-tools/skill-updater/`、関連tests、CLI、Taskfile、Skill metadata、
既存CIと利用文書である。WSL Ubuntuの保証対象はLinux filesystem上の元repository・候補clone・Git metadataに限定する。Node.js 24 / npmとPython >=3.14を維持する。schema libraryを先行導入しない。
#51 / #73 / #74は本change完了後の契約を受け取る。

今回のdiffはこのchange配下のMarkdownだけとする。既存のローカル調査メモ、実装、lock、CI設定は変更しない。

## Non-goals

自動PR、専用clone manager、途中再開、localからremoteへの自動復帰、新しいpackage / plugin manager、
private GitHub・他forge保証、Windowsネイティブ保証、WSLのWindows / DrvFS上での動作保証、Node全面撤去、Genshijin専用updater、
Skill選別（#73）、host integration（#74）は対象外である。
GitHub metadata検査後にGitで本文を取得する方式は今回採用しない。

## Acceptance

| Issue #76の受け入れ事項 | 契約 | 検証計画 |
| --- | --- | --- |
| 必須契約と公開操作・失敗時検証の対応 | R1–R8、[interfaces.md](interfaces.md) | V1–V8 |
| local内容lock廃止、ownership、出典・legal・編集保護 | R1、R2、R5 | V1、V2、V5 |
| 固定commitを保持する移行、曖昧状態の停止、再実行 | R7 | V7 |
| 取得前上限、特殊file、integrity、legal、tag、履歴 | R3、R4 | V3、V4 |
| 失敗・中断・再実行時の元コピー保護 | R6、R8 | V6、V8 |
| 通常offline CIのremote本文・mode・lock・legal検査 | R2、R8 | V2、V8 |
| 実体・metadata・CLI / task・tests・CI・文書の一体移行 | R7、R8、tasks 2–8 | V7、V8 |
| focused / project checks、独立review / verifier | tasks 7–8、OSWF-5 | 実装時にfresh実行 |

V1–V8は[validation.md](validation.md)の検証群である。全要件の12分類監査は
[spec-holes.md](spec-holes.md)を参照する。現時点の実装受け入れはすべて未完了である。
