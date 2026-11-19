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
  - [x] 検証: filesystem再レビュー修正後のstrict validate、task gate、self-review、独立diff review、project gate、別draft verifierを確認した。
  - 再開状態: grillingの最終認識合わせで修正を承認済み。旧草案の証跡を保持し、新cycleの検証完了により親taskを再度完了とした。

- [x] 2. Bundle schemaとcanonical inventoryを実装する
  - 成果: BD-1/3の厳密なdescriptor、limits、fileDigestsを既存v2へ追加する。
  - 依存: 1。
  - 対象:
    - `repo-tools/skill-updater/types.ts`
    - `repo-tools/skill-updater/schema.ts`
    - `repo-tools/skill-updater/bundle.ts`
    - `repo-tools/skill-updater/legal.ts`
    - `repo-tools/skill-updater/metadata.ts`
    - `repo-tools/skill-updater-bundle-schema.test.ts`
  - [x] 実装: 通常Skillのserialized bytes／hashを変えずbundleだけを拡張する。
  - [x] 検証: spec-holes項目1/4/16と既存golden fixtureを確認する。
    bundle source／lockのlegacyRef拒否も含める。
  - 証跡: schemaの正常bundle受理でREDを確認後、bundle-schema／v2-foundation／foundationの82 testsが成功した。
    `npm run typecheck` はexit 0。初期CI parityの `./scripts/check.sh` はfresh実行exit 0（638 Node／662 Python成功、126 skip）。
    後続実装を含む最終gateはTask 7で再実行する。
  - 開始条件: 利用者の具体仕様承認、executor preflightとdirty ownership確認。2026-11-13の依頼と下記preflightにより成立。

- [x] 3. 既存GitHub adapterへ選択的bundle取得を追加する
  - 成果: BD-2のstable release、metadata先行検査、選択blobのみの取得を提供する。
  - 依存: 2。
  - 対象:
    - `repo-tools/skill-updater/github.ts`
    - `repo-tools/skill-updater/bundle.ts`
    - `repo-tools/skill-updater-bundle-github.test.ts`
  - [x] 実装: 既存runner・固定commit・credential保護・legal検証を再利用する。
  - [x] 検証: spec-holes項目2/3/9/10/16のrequest順序、mode両方向不一致、祖先表記衝突、cohort内blob requestゼロ、
    SHA/size不一致、GitHub属性によるstable判定、取得後release再確認をfake応答で確認する。
  - 証跡: 正常取得とrelease再確認のRED後、bundle-github／githubの73 tests成功。typecheckもexit 0。
    cohort横断の累積予算非追加と後続失敗の公開操作検証はTask 5で行う。

- [x] 4. Offline／snapshot／linksとownership操作を統合する
  - 成果: BD-3/5/6の実体検証、bundle link非生成、通常Skillとの混在を提供する。
  - 依存: 3。
  - 対象:
    - `repo-tools/skill-updater/repository.ts`
    - `repo-tools/skill-updater/bundle.ts`
    - `repo-tools/skill-updater/ownership.ts`
    - `repo-tools/skill-updater/planner.ts`
    - `repo-tools/skill-updater/links.ts`
    - `repo-tools/skill-updater/migration/index.ts`
    - `repo-tools/skill-updater-bundle-repository.test.ts`
    - `repo-tools/skill-updater-bundle-test-fixture.ts`
  - [x] 実装: 未宣言vendor・mode・hardlink等を検査し、bundle adopt-localを拒否する。
  - [x] 検証: spec-holes項目4/5/7/8/11/13/14/15/16のoffline・混在・互換・no-op、vendor直下の種別不正、
    部分残存、全祖先path衝突、umask別clone／制限的権限のverifyをliveとsnapshotの適用可能な範囲で確認する。
  - 証跡: bundle-repository／repository／ownership／migrationの47 tests成功。
    公開verify／links／migrate／bundle adopt-local拒否、通常adopt-localとの混在、022／077独立clone、
    POSIX各bit、hardlink／FIFO、partial retirement 6通り、snapshot余剰pathを確認した。
    candidate差替え／host linkの操作別挙動／部分writeはTask 5の公開操作で確認する。

- [x] 5. 指名repinと隔離applyを統合する
  - 成果: BD-4の旧／新policy分離、最小preview差分、vendor衝突検査を提供する。
  - 依存: 4。
  - 対象:
    - `repo-tools/skill-updater/planner.ts`
    - `repo-tools/skill-updater/commands.ts`
    - `repo-tools/skill-updater/isolation.ts`
    - `repo-tools/skill-updater/apply.ts`
    - `repo-tools/skill-updater-bundle-command.test.ts`
  - [x] 実装: 既存command／independent candidate契約を維持してbundleを追加する。
  - [x] 検証: spec-holes項目3/5/6/9/13/15、元repository不変、後続cohort失敗時のno-apply、
    mode変更repin、policy-only変更、host linkの維持／修復／保持／拒否、umask別生成と再実行を公開commandで確認する。
  - 証跡: bundle-command／remote-command／isolationの68 tests成功。新規bundle／旧新policy分離のRED後に実装した。
    umask 022／077の追加・置換、0400／0100の全write前拒否、0222でowner writeを失うdirectoryのEACCES、
    file 1件後のEIO、元repositoryのindex／refs／config保持、新candidate再試行を確認した。
    26 MiB超の独立2 cohorts、後続cohort拒否、preview後再観測、host link別挙動もfake応答で確認した。

- [x] 6. 配布契約・prune・文書を整合させる
  - 成果: BD-6の下流検証、公開schema／更新手順、#74への引渡しを完成させる。
  - 依存: 5。
  - 対象:
    - `docs/reference/skill-metadata-v2.md`
    - `docs/reference/skill-maintenance.md`
    - `docs/reference/prune-template-assets.md`
    - `template-maintenance/tests/test_prune_integration.py`
    - `template-maintenance/tests/template_prune_fixture.py`
    - `repo-tools/skill-updater-bundle-command.test.ts`
  - [x] 実装: 既存通常Skill互換、bundleの非対応操作、Git変更による撤去手順と残存リスクを記載する。
  - [x] 検証: synthetic bundle入りprune前後のoffline verify／通常checkとspec-holes項目8/11/12を確認する。
    撤去後commit基準のcheck、残存bundleあり／なしの撤去後prune、固定版feasibilityと最終制約の整合を含める。
  - 証跡（2026-11-18）: `uv run --no-sync pytest template-maintenance/tests/test_prune_integration.py -q -x` はfresh実行exit 0、7 passed。
    synthetic bundle入りsetup／rename／prune、隔離したoffline通常check、全撤去／他bundle保持の両方を確認した。
    subprocess中心のためcoverage集計はNo data警告となるが、commandのexitとassertion結果で判定した。
    固定版feasibilityの記録を現在のdecoder／inventory／size検査へ通し、25 files／128,556 bytes／33 entriesを再確認した。
    7e06d8eの旧decoderとの一時probeで、同梱通常Skillのsource／lock serialized bytes一致と旧readerのbundle拒否を確認した。
    このprobeは通常CIへGit履歴依存を追加せず、一時ファイルを削除した。

- [x] 7. Review・最終gate・引渡しを行う
  - 成果: 全要件とspec-holesの検証対応、必要review、#74再開条件を確認する。
  - 依存: 6。
  - 対象:
    - `openspec/changes/support-selected-runtime-bundles/tasks.md`
    - `docs/template/retrospectives.md`
  - [x] 実装: 検証結果・制限・引渡し先を記録する。最終review／gate結果は同taskの検証状態として追記する。
  - [x] 検証: self-review、独立review、必要なfix/validation/diff review、最新 `./scripts/check.sh`、
    `task check:template`、別verifierをworkflow順に完了する。PRレビューは別途確認する。

## 実装検証の対応と引渡し（2026-11-18）

source commitは `7e06d8e45e4d4046c4dfa01d6c62283e9d6a7e45`、本branchのexecutor-owned差分を対象とする。
以下は実装後のfresh検証であり、設計段階のsuite結果を代用しない。

- `node --test repo-tools/skill-updater-*.test.ts`: 305 passed。その後追加した通常Skill混在umask回帰はfocused 1 passed。
  `npm run typecheck`、変更Pythonのruff、`git diff --check` はexit 0。
- spec-holes 1/4/16: bundle-schemaのdecoder／canonical順序／境界と既存foundation golden、bundle-repositoryのlive／snapshot集合照合。
- spec-holes 2/3/9/10/16: bundle-githubのcohort全件metadata先行・Git mode・祖先・release属性／再確認・size／SHA拒否、
  bundle-commandのpreview後再観測、後続cohort失敗、独立2 cohorts各26 MiBの累積予算非追加。
- spec-holes 5/6/13/15: bundle-commandの公開update／repin、旧新policy分離、mode／content／policy-only差分、
  host linkの操作別契約、全write前拒否、022／077生成、0400／0100拒否、0222のEACCESとEIO後のcandidate保持・新clone再試行。
  元repositoryの実体／index／refs／config保持、通常Skillの0644／0755生成も確認した。
- spec-holes 4/5/7/8/11/14/15/16: bundle-repositoryのoffline verify／links／migrate／adopt-local、
  全8撤去状態、POSIX bit別判定とchmodなし、hardlink／FIFO／symlink／余剰path、読込中size／identity変更、022／077 fresh clone。
  Gitで表せない特殊fileはlive側で検証し、device nodeの実作成は行わず通常file以外を拒否する同じ分岐をFIFOで検証した。
- spec-holes 8/11/12: Task 6のprune integration、撤去commit基準の公開check、旧reader互換probe、固定版metadata記録との整合。
- self-review: 7e06d8eからのtracked差分と新規6 files、直接依存、文書、spec-holesを照合した。
  読込中size／identity変更と通常Skill混在umaskの検証不足を検出し、executorが回帰を追加して成功を確認した。
  Task 6未完了中のfixture commit欠落／lint失敗も修正・再検証済み。現時点で未解決の製品欠陥・仕様判断はない。
  self-review時点では独立review、最終project gate、別verifierは未実施だった。完了結果は下記cycle 1を参照する。
- 残存リスク: 操作全体の累積予算は追加していない。同一ユーザーの任意の敵対的processとの完全排他、
  複数file書込の原子性、最後の観測後のrelease／ref変更防止は保証しない。
- Issue #74への引渡し: この先行changeの受入後、固定版の最終required file closure／legal本文承認、Genshijin実体同梱、
  host adapter、caveman撤去、runtime smokeを別途実施する。本changeでは実upstream codeの取得・実行・importを追加しない。
- 未検証／後続: hosted CIとPRレビューはPR作成後に確認する。PR作成、merge、close／archiveは今回の対象外である。
  `docs/template/retrospectives.md` の正式1行は実PR番号とclose時点の集計を要するため未追記。
  後続closeへの集計メモ: self-review=2（完了後に発見したrequired回帰検証不足2件）、review=0、CI=0、merge後=0。
  未完了Task 6のfixture／lint修正は「実装checkbox完了後」の欠陥に数えない。今後PR review等で修正が生じた場合は更新する。

## 実装review cycle 1（2026-11-19）

- 再開preflightでbranch／HEAD／active change／未解決判断なしと25 pathsの累積snapshot一致を確認した。
  Node.js 24.14.1／Python 3.14.6を再確認した。Task 2〜6の完了を保持し、Task 7の検証から再開した。
- initial independent reviewer `bundle_initial_review` はtracked差分、新規6 files、正本7 artifactsと直接依存をread-onlyで検査した。
  APPROVE、P0／P1／P2は全て0、blockerなし。fix／diff review iterationは0回である。
- reviewerのfresh検証: `node --test repo-tools/skill-updater-bundle-*.test.ts` は113 passed、失敗／skip 0。
  独自probeでLICENSEからCOPYINGへのlegal変更とfile追加の公開repin／apply／offline verifyが成功し、追加・削除差分が一致した。
- executorのfresh検証: `node --test repo-tools/skill-updater-*.test.ts` は306 passed、失敗／skip 0。
  `task openspec:validate` と `git diff --check` はexit 0。
- reviewer承認後、同worktreeで最新入力の `./scripts/check.sh` をfresh実行しexit 0。
  Node 751 passed、Python 662 passed／126 skipped、format／lint／typecheckが成功した。
  `task check:template` もfresh実行exit 0、999 passed、保守側typecheckは0 errorsだった。
  両commandのPATHは `/home/shimi3435/.nvm/versions/node/v24.14.1/bin:$PWD/.venv/bin:$PATH`。
  Node.js 24.14.1／Python 3.14.6、Linux WSL2 x86_64、C.UTF-8で実行した。設計段階の結果は再利用していない。
- 別の独立verifier `bundle_final_verifier` は一度usage limitで中断した。findingはなく、利用者の再開依頼後、
  同agentを再開して検証を完了した。利用可能な成果を返さない連続2回の失敗には該当しない。
- verifierのfresh focused検証は306 passed。独自の公開操作probeで、取得後release無効化時のwriteゼロ、
  preview不変、空fileを含む選択blobだけの取得、rc tagのstable属性受理、umask 077、元repositoryのbytes／mode／Git不変、
  readonly offline verify／chmodなし、不正execute拒否、bundle host link非生成を確認した。
  固定版feasibility記録と実装の照合、`git diff --check` も成功した。
- verifierはHEAD／realpath／dirty 25 pathsの集合・type・mode・SHAを独自に前後照合し、executorが環境・依存の無変更を確認した。
  上記2つの全体gateは入力同一性を満たすgreen evidenceとして再利用した。blockerなし、required evidence不足なしと判定された。
- 証跡更新もprune integrationのcopy対象になるため、最終記録反映後の `./scripts/check.sh` と `task check:template` の
  fresh再実行を最終完了判定の条件とする。失敗した場合はTask 7の検証状態を未完了へ戻し、成功扱いしない。
- Task 2〜7の実装とローカル検証を完了した。実装担当は1 executor、初回reviewerとverifierは別agentであり、
  追加executor、仕様拡張、commit／push／PR作成／merge／close／archiveは実行していない。
  運用はテンプレート保守向けcloseを継承する。PRレビュー／hosted CIとclose時のretrospective正式行は後続であり、
  現段階ではclose-ready／archive-readyとせず、利用者の別途指示を待つ。

## Authoring state

基点は `f74c99a9c355648f4580f78b0504007ce2d8c67f`、branchは `design/genshijin-bundle-support`。
worktreeは `/home/shimi3435/workspace/python/ai-coding-template-ja-genshijin-bundle-support`。
開始時tracked／untracked差分はなかった。#74草案と利用者差分は元worktreeに保持する。
通常日本語の文書生成方針とテンプレート保守向けclose選択を会話から継承する。

設計段階ではexecutor preflight／safe boundaryは未実行だった。現在の開始状態は次節を正とする。
authoring差分を自動的にexecutor-owned snapshotと読み替えず、開始時にownershipを照合する。
実装は1 executorが所有し、追加executorは使用しない。必須reviewer／verifierは順次起動する。
この節は設計段階の履歴である。現在の実装・検証状態は各taskと実装開始承認を参照する。

## 再開時の差分引継ぎ（2026-11-18）

中断時の累積snapshotがなく、再開時はreport-onlyで停止した。利用者が現在の未コミット25ファイルを
前回executor差分として引き継ぐことを「ok」で明示承認した。branch／HEAD／active changeは開始時と同じで、
全artifactsとtasksの構造・依存・対象path・ignored対象なしを再確認し、safe boundaryを通過した。
元worktreeの保護対象は引き続き参照・変更しない。実装担当は引き続き1 executorである。
再開時点ではTask 6の文書とprune fixtureは実装途中だった。前回の一時logは現環境にないため、必須検証をfresh実行した。
初回prune検証ではfixtureの撤去前commit欠落とPython lint違反が失敗原因だった。修正後の再検証で7 testsが成功した。
self-reviewで読込中size／identity変更のtest不足を確認して追加した。再開時点では独立reviewと別verifierは未実施だった。

## 実装開始承認とpreflight（2026-11-13）

- 利用者がTask 2〜7の実装・検証と必要な独立reviewer／verifierを明示承認した。実装担当は1 executorとする。
- branchは `design/genshijin-bundle-support`、HEADは `7e06d8e45e4d4046c4dfa01d6c62283e9d6a7e45`。
  repository real pathは上記worktreeと一致し、開始時tracked／untracked差分は0件だった。対象外dirty paths／digestは該当なし。
- active changeは本件だけ。必須7 artifacts、requirementのMUST、12分類のaudit、未解決判断なしを確認した。
  Execution Constraints 3項目、7 taskの成果／依存／対象／実装・検証checkbox、依存の存在・非循環性、
  exact pathと包含の重複順序、repository内解決、ignored対象なしを確認し、safe boundaryを通過した。
- Node.js 24.14.1とPython 3.14.6の実在・起動を確認した。設計段階のsuite結果は再利用しない。
- 第3回設計レビューAPPROVE（P0/P1/P2全て0）は設計の証跡であり、以下の過去の「実装未承認」は当時の状態である。
  本依頼で実装開始を承認済みに更新した。開始時点では製品実装・機能検証・closeは未完了だった。
- 元worktreeのIssue #74草案と利用者所有文書は参照・変更しない。linked worktreeはapply candidateへ流用しない。
- commit／push／PR／merge／close／archiveは今回実行しない。

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

## Filesystem再レビュー後の修正cycle

基点は `421d40795e972775e8ad94fd8f94399427beac52`。開始時の本worktreeはcleanだった。
利用者が提示した再レビューは、前回指摘をRESOLVEDとし、新規P2 3件をREQUEST CHANGESとした。
grillingの質問への回答と最終認識合わせで、下記の仕様修正・独立再レビューを承認した。
製品実装開始、通常Skillの契約変更、新しい配布機構の追加は含まない。

### 修正前evidenceと合意

- 再レビューP2-1: 旧designはhost leaf linkを許可する一方、管理領域の全symlinkを拒否する文章を含んでいた。
  既存の正常link維持、変更ありapplyでの宣言名誤target修復、追跡済み宣言外link保持を区別した。
  vendor／Skill実体・管理root／親・hostの深いlink・未追跡／ignored衝突の拒否は維持する。
  designのhost link境界、BD-4/5、spec-holes項目13、Task 4/5へ対応させた。
- 再レビューP2-2: 旧metadataはliveの0644／0755完全一致を要求し、正常なumask 077 cloneと両立しなかった。
  制限的な権限を受理し、owner read／必要executeを必須、group／other writeと特殊bitを拒否する。
  verifyはchmodしない。bundle生成時はumaskを反映し、予定modeの必須権限欠落は全write前に拒否する。
  metadataの権限契約、BD-3/4、spec-holes項目14/15、Task 4/5へ対応させた。
- 再レビューP2-3: 旧metadataはcase-fold拒否だけを記し、既存helperでは祖先表記違いを受理し得た。
  全file・全祖先directoryの表記と種別をbundle専用inventoryで照合し、同じ表記の祖先だけ共有する。
  通常Skillのhelperを厳格化しない。BD-1/2/3、spec-holes項目16、Task 2/3/4へ対応させた。

`issue74_facts` の自作一時fixtureによる既存挙動probeでは、host linkの維持／修復／保持と禁止linkのwrite 0件を確認した。
umask 022 cloneはdirectory／実行file0755・非実行file0644、077 cloneは0700・0600だった。Git modeは共通だった。
既存path helperは `Lib/a.txt`＋`lib/b.txt` を受理し、file重複とfile／directory prefix衝突は拒否した。
調査probeはNode 26で行われたもので、Node 24のproject gateや未実装bundleの受入testには読み替えない。
製品codeは未実装のため、RED runtime testの代わりに上記の旧文書の矛盾・欠落と既存挙動を修正前evidenceとする。

### 最新の検証状態

- self-reviewで6文書の差分と既存契約への接続を確認した。論理的実行属性とPOSIX mode、
  tracked誤target・baseにもないlink欠落・candidateだけのdirty削除を区別し、未解決指摘はなかった。
- `openspec validate support-selected-runtime-bundles --strict --no-interactive` と `task openspec:validate` はfresh実行exit 0。
  diff空白検査、7 Markdownのlinks／anchors、既存feasibility表のfileと全祖先33 entriesの表記・種別照合も成功した。
- `issue74_draft_review` の独立diff reviewで新規P2 3件の仕様上の解消と、scenario／spec-holes13〜16／tasksの対応を確認した。
  新規blockerなし、承認範囲逸脱なしと判定され、このcycleで追加fix iterationは発生していない。
- 最新入力の `./scripts/check.sh` はNode.js 24.14.1／Python 3.14.6のPATHでfresh実行exit 0。
  Node tests 638 passed、Python tests 662 passed / 126 skipped、format／lint／typecheck成功。
- reviewerとは別の `issue74_draft_verify` が仕様・scenario・tasks・合意と既存コードの境界を確認し、
  新規blockerなし、草案引渡し可と判定した。独自の文書構造検証とfeasibilityの33 entries照合も成功した。
  製品実装は未承認、Task 2〜7は未完了、製品close不可を維持する。
- Task 2〜7の新しい機能testは未実施であり、既存probeからbundle実装の成功を主張しない。
