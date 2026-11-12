# 選択したruntime bundleを既存Skill管理で扱う

## Why

[Issue #74](https://github.com/shimi3435/ai-coding-template-ja/issues/74)の初期検証で、
Genshijinの専用配置、選択的取得、root `SKILL.md` を持たない構造を現行metadata v2では表現できないと確認した。
利用者は2026-11-12、この不足だけを先行する独立OpenSpec changeとして設計することを承認した。

#74のGenshijin導入・host adapter・caveman撤去とは独立した受入成果にする。
同梱内容の最終選択は#74が所有し、本changeはsynthetic bundleを通して必要な配布機構だけを提供する。
固定版Genshijinの暫定候補についてはmetadataだけのfeasibility確認を行い、配布制約との整合を記録する。

## What Changes

- 既存source／lockの `schemaVersion: 2` と `ownership: remote` を維持し、任意の `bundle` fieldで
  通常Skillとruntime bundleを区別する。既存entryの意味・正規化結果は変更しない。
- bundleの配置先を `.agents/vendor/<name>` に限定する。通常Skillの配置・root Skill検証は維持する。
- 正確なpath一覧をallowlist兼required listとして宣言し、全fileの取得前上限・mode・legalを検査する。
- upstream modeと宣言した実行bitの一致を要求し、権限overrideとbundleのlegacyRefを拒否する。
- GitHubのstable release tagを指定し、resolved commitを固定する。既存adapterと隔離更新手順を再利用する。
- 既存tree hashに加え、bundleだけにper-file SHA-256／bytes／実行bitをlockへ記録する。
- offline verify、snapshot、update／repin、links、既存template資産pruneとの整合を同じ管理経路へ統合する。
- bundleの配布廃止はsource／lock／実体を同じGit変更で撤去する手順として定義する。

## Non-goals

新しいCLI command、updater、scheduler、plugin manager、配布基盤、任意target、glob、directory一括選択、
optional file、path rename、local-owned bundle、bundleのadopt-local、schema v3移行は追加しない。
SemVer正式版の判定、cohort横断の累積リソース予算も追加しない。既存制約と残存リスクはdesignに明記する。
Genshijin実体・host設定・認証・hook実行・caveman削除・runtime smokeは#74の所有である。
通常CIはupstreamの実コードを実行・importしない。レビュー用の草案commit／pushは利用者から依頼済みである。
GitHub Issueの発行、PR作成、mergeは未依頼である。

## Status and Approval

**今回の成果は設計草案のみ。製品コード・metadata・lockは未変更。**
以下の具体仕様は設計案として提示し、実装開始前に利用者の合意を確認する。
外部レビュー後、利用者は実行権限一致、既存上限継承、GitHub属性によるstable定義、metadata feasibility、
Git変更による撤去手順の修正方針と独立再レビューを承認した。製品実装の開始とは区別する。
別worktree／branch `design/genshijin-bundle-support` を基点
`f74c99a9c355648f4580f78b0504007ce2d8c67f` から作成し、active changeは本件1つだけにする。
#74の草案を本worktreeへ複製せず、元の作業ツリーに保持する。
本worktreeはauthoring用であり、手動更新のindependent candidate cloneとしては使用しない。

## Acceptance and Impact

- source／lockの厳密なdecoder、取得前拒否、offline integrity、隔離applyを公開操作から検証できる。
- 通常Skillのgolden hash・source／lockのserialize結果・既存CLI挙動を維持する。
- bundleの欠落、余剰、改ざん、権限不一致、symlink／hardlink、移動tag、legal未承認を拒否する。
- bundleからhost用linkを生成せず、template文書のprune後もbundleのoffline検証を維持する。
- [固定版feasibility](feasibility.md)の候補について配布制約との整合を確認する。runtime互換性の保証とは区別する。
- bundle撤去後のverify、撤去後commit基準のcheck、prune integrationで残存資産との整合を確認する。
- focused validation、独立review／verifier、`./scripts/check.sh`、必要なprune integrationを成功させる。
- 新しいschemaを理解しない旧validatorはbundleを拒否する。新bundleを旧toolで扱えるとは主張しない。

仕様は[spec delta](specs/runtime-bundle-distribution/spec.md)、data契約は[metadata](metadata.md)、
設計理由は[design](design.md)、未定義確認は[spec-holes](spec-holes.md)、進捗は[tasks](tasks.md)を参照する。
テンプレート保守向けcloseの選択を継承するが、仕様承認・実装・review・検証・PRレビュー前にcloseしない。
先行changeのclose／merge後、#74をそのbaseへ更新して必要runtime closureの確定と同梱を再開する。
