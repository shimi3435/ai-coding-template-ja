# 最小runtime bundle対応 tasks

## Execution Constraints

- 最初の環境依存sliceでCI parityを確認し、Node.js 24／Python 3.14で `./scripts/check.sh` を実行する。
- 仕様判断・material expansion・必須検証失敗では停止し、完了済みcheckboxを保持して承認済み範囲を再計画する。
- 一時fixture、独立candidate、取得logは追跡せず、自分が作成した一時artifactだけを確認してcleanupする。

## Tasks

- [x] 1. 先行changeの仕様を設計・検証する
  - 成果: #74の不足に限定したproposal/design/metadata/spec/spec-holesと固定版feasibilityを作成する。
  - 依存: なし。
  - 対象:
    - `openspec/changes/support-selected-runtime-bundles/`
  - [x] 実装: authoringとして設計草案を作成した。製品実装は未開始。
  - [x] 検証: 外部レビュー修正後のstrict validate、task gate、self-review、独立draft review、project gate、別draft verifierを確認した。
  - 再開状態: 修正方針は承認済み。旧草案の証跡を保持し、最新草案の検証完了により親taskを再度完了とした。

- [ ] 2. Bundle schemaとcanonical inventoryを実装する
  - 成果: BD-1/3の厳密なdescriptor、limits、fileDigestsを既存v2へ追加する。
  - 依存: 1。
  - 対象:
    - `repo-tools/skill-updater/types.ts`
    - `repo-tools/skill-updater/schema.ts`
    - `repo-tools/skill-updater/bundle.ts`
    - `repo-tools/skill-updater/legal.ts`
    - `repo-tools/skill-updater/metadata.ts`
    - `repo-tools/skill-updater-bundle-schema.test.ts`
  - [ ] 実装: 通常Skillのserialized bytes／hashを変えずbundleだけを拡張する。
  - [ ] 検証: spec-holes項目1/4と既存golden fixtureを確認する。
    bundle source／lockのlegacyRef拒否も含める。
  - 開始条件: 利用者の具体仕様承認、executor preflightとdirty ownership確認。現時点では未成立。

- [ ] 3. 既存GitHub adapterへ選択的bundle取得を追加する
  - 成果: BD-2のstable release、metadata先行検査、選択blobのみの取得を提供する。
  - 依存: 2。
  - 対象:
    - `repo-tools/skill-updater/github.ts`
    - `repo-tools/skill-updater/bundle.ts`
    - `repo-tools/skill-updater-bundle-github.test.ts`
  - [ ] 実装: 既存runner・固定commit・credential保護・legal検証を再利用する。
  - [ ] 検証: spec-holes項目2/3/9/10のrequest順序、mode両方向不一致、cohort内blob requestゼロ、
    SHA/size不一致、GitHub属性によるstable判定、取得後release再確認をfake応答で確認する。

- [ ] 4. Offline／snapshot／linksとownership操作を統合する
  - 成果: BD-3/5/6の実体検証、bundle link非生成、通常Skillとの混在を提供する。
  - 依存: 3。
  - 対象:
    - `repo-tools/skill-updater/repository.ts`
    - `repo-tools/skill-updater/ownership.ts`
    - `repo-tools/skill-updater/planner.ts`
    - `repo-tools/skill-updater/links.ts`
    - `repo-tools/skill-updater/migration/index.ts`
    - `repo-tools/skill-updater-bundle-repository.test.ts`
  - [ ] 実装: 未宣言vendor・mode・hardlink等を検査し、bundle adopt-localを拒否する。
  - [ ] 検証: spec-holes項目4/5/7/8/11のoffline・混在・互換・no-op、vendor直下の種別不正、
    source／lock／実体の部分残存をliveとsnapshotの適用可能な範囲で確認する。

- [ ] 5. 指名repinと隔離applyを統合する
  - 成果: BD-4の旧／新policy分離、最小preview差分、vendor衝突検査を提供する。
  - 依存: 4。
  - 対象:
    - `repo-tools/skill-updater/planner.ts`
    - `repo-tools/skill-updater/commands.ts`
    - `repo-tools/skill-updater/isolation.ts`
    - `repo-tools/skill-updater/apply.ts`
    - `repo-tools/skill-updater-bundle-command.test.ts`
  - [ ] 実装: 既存command／independent candidate契約を維持してbundleを追加する。
  - [ ] 検証: spec-holes項目3/5/6/9、元repository不変、後続cohort失敗時のno-apply、
    mode変更repin、policy-only変更と再実行を公開commandで確認する。

- [ ] 6. 配布契約・prune・文書を整合させる
  - 成果: BD-6の下流検証、公開schema／更新手順、#74への引渡しを完成させる。
  - 依存: 5。
  - 対象:
    - `docs/reference/skill-metadata-v2.md`
    - `docs/reference/skill-maintenance.md`
    - `docs/reference/prune-template-assets.md`
    - `template-maintenance/tests/test_prune_integration.py`
    - `template-maintenance/tests/template_prune_fixture.py`
    - `repo-tools/skill-updater-bundle-command.test.ts`
  - [ ] 実装: 既存通常Skill互換、bundleの非対応操作、Git変更による撤去手順と残存リスクを記載する。
  - [ ] 検証: synthetic bundle入りprune前後のoffline verify／通常checkとspec-holes項目8/11/12を確認する。
    撤去後commit基準のcheck、残存bundleあり／なしの撤去後prune、固定版feasibilityと最終制約の整合を含める。

- [ ] 7. Review・最終gate・引渡しを行う
  - 成果: 全要件とspec-holesの検証対応、必要review、#74再開条件を確認する。
  - 依存: 6。
  - 対象:
    - `openspec/changes/support-selected-runtime-bundles/tasks.md`
    - `docs/template/retrospectives.md`
  - [ ] 実装: 検証結果・制限・引渡し先を記録する。
  - [ ] 検証: self-review、独立review、必要なfix/validation/diff review、最新 `./scripts/check.sh`、
    `task check:template`、別verifierをworkflow順に完了する。PRレビューは別途確認する。

## Authoring state

基点は `f74c99a9c355648f4580f78b0504007ce2d8c67f`、branchは `design/genshijin-bundle-support`。
worktreeは `/home/shimi3435/workspace/python/ai-coding-template-ja-genshijin-bundle-support`。
開始時tracked／untracked差分はなかった。#74草案と利用者差分は元worktreeに保持する。
通常日本語の文書生成方針とテンプレート保守向けclose選択を会話から継承する。

executor preflight／safe boundaryは未実行。新しいschema案の承認後に実装を開始する。
authoring差分を自動的にexecutor-owned snapshotと読み替えず、開始時にownershipを照合する。
実装は1 executorが所有し、追加executorは使用しない。必須reviewer／verifierは順次起動する。
現在は設計段階であり、implementation complete／close-readyではない。

### Authoring preparation

- `npm ci --offline --ignore-scripts --no-audit --no-fund` と `uv sync --locked --offline --inexact` はexit 0。
  新worktreeに独立した依存環境を作成し、package-lock／uv.lockは変更していない。
- shell parserは元worktreeの既存artifactをcopyし、新worktreeの固定入力・checksumで再検証した。
  source／Go toolchainの取得・buildは行っていない。cacheはgitignore対象である。
- self-reviewで、rootごとの宣言集合分離、祖先directoryの上限、Task 4のplanner依存を明記した。
  いずれも仕様草案の記述であり、製品codeの修正や検証成功を意味しない。

### Authoring review

- initial independent reviewは `issue74_draft_review` が新規6 Markdownと#74側の依存状態更新を確認した。
- iteration 1の修正前evidenceは、変更file pathを表示する契約に対してJSONにfile差分情報がない点と、
  選択file取得を許す契約に対してinstaller等の取得も一律禁止する文章の2件である。
  純proseの矛盾で製品実装はまだないため、RED testの代わりに矛盾箇所を記録した。
- bundle限定 `bundleFileChanges` を定義し、一覧外取得禁止／全取得物実行禁止を分離した。
  metadata先行検査の単位も既存cohortへ明確化した。
- iteration 1のfocused validationはstrict OpenSpec validate、task gate、Markdownリンク／空白検査が成功した。
  `issue74_draft_review` のdiff reviewで2件の解消を確認し、authoring範囲のblocker残存なしと判定された。

### Authoring validation

2026-11-12、基点 `f74c99a9c355648f4580f78b0504007ce2d8c67f` の本worktreeでfresh実行した。

- `openspec validate support-selected-runtime-bundles --strict --no-interactive`: exit 0。
- `task openspec:validate`: exit 0、1 change passed。
- `./scripts/check.sh`: Node.js 24.14.1／Python 3.14.6のPATHでexit 0。
  Node tests 638 passed、Python tests 662 passed / 126 skipped、format／lint／typecheck成功。
  skipは既存suiteの結果であり、未実装bundleの機能検証を意味しない。
- 製品focused tests、bundle取得／配置／repin、prune integrationは未実施であり、Task 2〜7に残す。
  Genshijin runtime smokeは本changeのscope外で、#74が所有する。
- initial reviewerとは別の `issue74_draft_verify` が6 Markdownと元#74の依存状態更新をread-onlyで検証した。
  独自の構造確認も成功し、authoring範囲に新規blockerなし、草案引渡し可と判定された。
  製品closeは不可とし、具体仕様承認後のpreflightとTask 2〜7を未完了のまま保持する。
- 利用者からレビュー用の草案commit／pushを依頼された。実装開始の承認とは区別する。
  仕様承認、executor preflight、実装、PR作成／mergeは未実施。

## 外部レビュー後の修正cycle

基点は `5b91fc3e4e4bc66c5c392f7ad2dc7f2d1b365945`。開始時の本worktreeはcleanだった。
利用者が提示したAdversarial ReviewはP1 1件／P2 4件のREQUEST CHANGESである。
修正方針と独立再レビューは会話で承認済み。製品実装開始とは区別し、Task 2〜7は未着手のまま保持する。

### 修正前evidenceと処理先

製品codeが未実装のため、RED runtime testの代わりに旧commitの仕様上の欠落を記録する。
以下は仕様修正であり、製品testの成功を意味しない。

- P1-1: 旧metadataは宣言modeで配置し、upstream mode一致条件がなかった。
  一致必須・override禁止をmetadata／design／BD-2/4へ反映した。spec-holes項目2/6、Task 3/5で検証する。
- P2-1: 旧metadataはbundle／cohort上限だけを記し、操作全体の累積制限の有無が不明だった。
  単位別上限、後続cohort失敗時の保証、累積予算を追加しない理由と残存リスクを明記した。
  spec-holes項目9、Task 3/5へ対応させた。共通予算はdesign内の別change候補であり、外部Issue未発行である。
- P2-2: 旧文書はstableという語のSemVerとの関係を定義していなかった。
  GitHub release属性だけの判定とrc名の受理を明記した。spec-holes項目10、Task 3で検証する。
- P2-3: 本changeには実対象の配布制約の確認証跡がなかった。
  [feasibility](feasibility.md)へ25候補のmetadata確認を記録した。最終closureとruntimeは#74に残す。
  spec-holes項目12、Task 1/6へ対応させた。
- P2-4: sourceだけの削除拒否はあったが、配布廃止の手順と検証順がなかった。
  Git変更による一括撤去、offline verify先行、撤去commit基準のcheck、prune確認をdesign／BD-6へ追加した。
  spec-holes項目11、Task 4/6へ対応させた。旧checkoutとhost登録は自動削除しない。
- 追加確認1: bundleのlegacyRefを拒否する。spec-holes項目1、Task 2。
- 追加確認2: policy-only変更と空のfile差分でもplanned／lock更新となる。spec-holes項目6、Task 5。
- 追加確認3: release／refをpreview／applyと本文取得後に再確認する。spec-holes項目3、Task 3/5。
- 追加確認4: 通常Skillのserialize／hash／links／adopt-local／migrate互換を維持する。Task 2/4/6。
- 追加確認5: vendor rootと直下の種別不正／衝突を明記した。spec-holes項目4、Task 4。

### 最新の検証状態

- metadata feasibility: fresh probe exit 0。25 files／128,556 bytes、path／祖先／type／mode／上限が整合した。
  blob requestは0件であり、製品bundle実装の検証ではない。
- self-reviewで7文書と既存実装への接続を確認した。mode変更fixtureを新commitの例へ揃え、
  撤去時の部分残存拒否と新規source-only追加経路を区別した。修正後に未解決指摘はなかった。
- `openspec validate support-selected-runtime-bundles --strict --no-interactive` と `task openspec:validate` はfresh実行exit 0。
  7 Markdownのlocal links／anchors／空白、feasibility表の件数・合計・最大値、要件とcoverageの構造確認も成功した。
- `issue74_draft_review` の独立再レビューで外部5 findingsと追加5確認の対応を確認し、新規blockerなしと判定された。
  feasibility表も独立再集計された。このcycleでは追加fix iterationは発生していない。
- 最新入力で `./scripts/check.sh` をfresh実行しexit 0だった。Node.js 24.14.1／Python 3.14.6のPATHを使用した。
  Node tests 638 passed、Python tests 662 passed / 126 skipped、format／lint／typecheck成功。
  既存suiteの結果であり、未実装bundleの新しい機能検証には読み替えない。
- `issue74_draft_verify` は最初の試行でusage limitにより成果を返せなかったが、利用者の再開指示後の再試行で完了した。
  reviewerとは別の独立verifierとして7文書・外部5指摘・追加5確認・承認範囲を確認し、新規blockerなし、草案引渡し可と判定した。
  独自の構造検証とfeasibility表の再集計も成功した。製品実装は未承認、Task 2〜7は未完了、製品close不可である。
