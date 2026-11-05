# Tasks

## Execution Constraints

- 最初のCI parity: 修正cycleのTask 5でNode.js 24、Python 3.14、locked dependencies、shell parserを確認し、統合後の通常test collectionと保守側型検査・focused testsを全修正完了前に実行する。最終判定は両gateのfresh実行とする。
- 停止・再計画条件: 承認済み仕様を拡張する判断、必須検証の失敗、共通workflowの停止条件では未完了を保持する。2026-10-30の利用者依頼によりTask 2–4も実行する。既存のTask 1成果を保持する。実装・検証完了後の利用者依頼により作業branchへのcommit・pushを行う。2026-11-04の修正依頼では最新mainの作業branchへのmergeを承認済みとする。PR作成・mainへのmergeは行わない。
- 一時artifact cleanup: 隔離clone・一時log・比較artifactを品質の正本とせず、結果を本書に要約する。利用者所有の docs/template/issue-71-ownership-poc.md は変更しない。

## Tasks

### 1. 上流Skill群と用語集を一体で移行する

- 成果: 由来が確認された用語集と、最新版の必要なSkill群が同じ名称・参照で動作する。
- 依存: なし。
- 対象: `CONTEXT.md`, `GLOSSARY.md`, `.agents/skills`, `.claude/skills`, `.codex/skills`, `AGENTS.md`, `openspec/project.md`, `docs/agents`, `scripts/rename-package.py`, `repo-tools/template_prune_state.py`, `repo-tools/template_prune_document.py`, `docs/reference/prune-template-assets.md`, `tests`。
- [x] 実装 checkbox: 9件の上流Skill、metadata、links、用語集、live consumersを整合させる。
- [x] 検証 checkbox: 上流一致・offline verify・用語本文保持・rename/prune focused tests・self-review・独立review・./scripts/check.sh・別verifierを確認する。

由来: PR #1 / d342826c1ccee510d2946c622b33953e65f1678e が grill-with-docs の成果として CONTEXT.md を新規作成した。詳細はdesign.md。

検証のsource commitは 50687105f1fc6a21992ddc1d90ca959a6cd023a9 と現在の未コミット差分。以下は全てfresh実行であり、green evidenceの再利用ではない。

- 先行 ./scripts/check.sh: shell parser未準備でexit 1。uv run --no-sync python scripts/setup-shell-parser.pyで固定parserを準備した。
- 環境準備後の先行 ./scripts/check.sh: 1402 passed / 126 skipped。先に変更したrenameテストだけが想定どおり失敗し、GLOSSARY.mdが改名対象にならないことを確認した。最終完了のgreen証跡には使わない。
- 隔離したsource / candidate cloneでMatt cohortを選び、既存の skills:update をpreview・applyした。全9件が 59db609eb1e18aaf59b63284d0e52255aff0c63c、warnings / errorsなし。生成済みentriesとtreeだけを統合し、cavemanの既存entryを保持した。lock hashの手計算・上流本文の改変は行っていない。
- node repo-tools/entrypoint.mjs skills:links と skills:verify: exit 0。両hostの追加linkとoffline整合を確認した。
- Pythonによるbytes/mode照合: GLOSSARY.mdがHEAD:CONTEXT.mdと同一、9 Skill treeが検証済みcandidateと同一、caveman lock entryがHEADと同一。
- python -m pytest --no-cov tests/test_rename_package.py tests/test_template_prune_state.py tests/test_project_gate_contract.py tests/test_openspec_direct_workflow_contract.py tests/test_review_convergence_contract.py -q: 692 passed。
- git diff --check: exit 0。self-reviewで上流本文、追加supporting files、metadata、移行、live参照、公開挙動のdiffを確認した。
- initial independent review（migration_review）: blocking findingなし。用語集bytes、9件の上流treeと実行mode、caveman維持、offline verify、host links、live参照を確認した。
- task openspec:validate: 1 passed。
- 前cycleの ./scripts/check.sh: exit 1。R06が `.agents/skills/grilling/SKILL.md` の質問テンプレートを解析し、line 13で syntax error（`>` must be followed by a word）となった。
- 2026-10-29の最小再現: `.venv/bin/python` から `template_prune_shell.commands` を `doc_kind=''` で呼び、上流の質問テンプレート全体と `<question title>` が同じsyntax error、対照の `<question_title>` がplaceholderとなることを確認した。現仕様は空白を含むplaceholderを許可しないため、単なる名称移行では解消できない。
- 前cycleの停止理由: R06の対応記法追加は仕様判断を伴うため停止した。2026-10-29に利用者が推奨案を承認した。既存checkboxを保持し、新cycleで追加仕様を実装・検証する。
- [x] 追加実装 checkbox: 承認済みの文書用複数語placeholder、公開仕様、対照テストを追加する。
- 新cycleのRED: python -m pytest --no-cov tests/test_template_prune_phrase_placeholders.py -q は実装修正前に2 failed。同じ公開inspectの再現が修正後に成功した。
- 新cycleのfocused validation: python -m pytest --no-cov tests/test_template_prune_state.py tests/test_template_prune_diagnostics.py tests/test_template_prune_tokens.py tests/test_template_prune_phrase_placeholders.py tests/test_rename_package.py -q は762 passed。境界例追加後の phrase_placeholders / tokens 個別実行は89 passed。
- 上流grillingの質問テンプレート実物を commands(doc_kind='') で解析: 5 commands / 6 placeholder words、構文エラーなし。
- 新cycleのself-review: 文法、引用・escape・改行・位置復元、strict shellの維持、公開仕様、spec-holesとの対応を確認し、blocking findingなし。ruff format --check / ruff check / git diff --checkは成功。skills:verifyはerrors / warningsなし、task openspec:validateは1 passed。
- 新cycleの独立reviewは利用上限で一度中断したが、利用者の再開指示後に完了した。migration_reviewはTask 1全体とR06追加仕様にblocking findingなしと判定し、複数placeholder・CRLF・日本語・後続コマンド位置・上流整合をread-onlyで確認した。この時点では最新入力のproject checkと別verifierは未完了だった。
- 新cycle iteration 1: ./scripts/check.sh の入口で公開仕様に追加した不完全なshell例がsyntax failureとなった。文法・実装は変更せず、例を完全な `cat < input > output` に修正した。focusedの node repo-tools/entrypoint.mjs check-contracts はexit 0（bundled、既存契約に沿うpartial、analysis errorsなし）。
- iteration 1 diff review: migration_reviewが全7入力区分でredirection例を実parser確認し、blocking findingなし。git diff --checkも成功した。
- 新cycle iteration 2: ./scripts/check.sh はNode tests 638 passedとruff成功後、新テストの静的importがbasedpyrightのreportMissingImportsで失敗した。既存テストと同じimportlib経由へ変更し、runtime・assertionを保持した。focused basedpyrightは0 errors、phrase_placeholders / tokensは89 passed、ruff / git diff --checkは成功。migration_reviewによるdiff reviewはblocking findingなし。
- 最新入力の ./scripts/check.sh（Node.js 24.14.1 / Python 3.14.6、locked dependencies）: exit 0。Node tests 638 passed、ruff / TypeScript / basedpyright成功、Python tests 1491 passed / 126 skipped。実行前後の追跡・非ignored未追跡268 pathsのbytes / mode / link照合で変更なしを確認した。source commitは上記と同じ。実行後の変更は本書の進捗・検証証跡だけであり、検証対象の実装・依存・設定・fixturesに変更はない。
- task check:template: exit 0、15 passed。現在の作業treeを隔離コピーし、setup、共通gate、doctor、package rename、offline pruneのpreview / apply / 冪等再実行、再setup、各段階の共通gateとdoctorまでfresh実行で確認した。
- 別担当migration_verifier: Task 1 / R4にblocking findingなし。fresh focused testsは90 passed、GLOSSARY prune検査は2 passed。上流tree / mode / links・本文保持・実物テンプレート解析・境界条件を独自確認し、入力同一性確認のうえ全体checkのgreen evidenceを再利用した。task check:templateの15 passed、OpenSpec検証、git diff --checkの成功も確認した。Task 2–4およびIssue #73全体は未完了のまま保持する。
- 一時artifact cleanup: 検証対象がgreen時点から不変であることを再確認し、今回作成した隔離clone・比較snapshot・検証logを削除した。結果は本書へ要約済み。利用者所有のPoCは変更していない。

### 2. First-party Skills の責務を縮小する

- 成果: report-only self-review、穴の発見に集中したspec-holes、実動作確認、executor固有手順を分離する。
- 依存: 1。
- 対象: `.agents/skills/self-review`, `.agents/skills/spec-holes`, `.agents/skills/verify-change`, `.agents/skills/execute-openspec-change`, `docs/agents/workflow.md`, `tests`。
- [x] 実装 checkbox: 合意済みの責務分担を反映する。
- [x] 検証 checkbox: focused testsと、対象Skillの有無による隔離behavior比較を確認する。

検証source commitは50687105f1fc6a21992ddc1d90ca959a6cd023a9と現在の未コミット差分。以下はfresh実行。

- pytest --no-cov tests/test_execute_openspec_change_skill.py tests/test_openspec_direct_workflow_contract.py tests/test_review_convergence_contract.py tests/test_project_gate_contract.py -q: 54 passed。旧来の境界fixtureを保持し、契約の正本と参照元を検証した。
- skill-creator/scripts/quick_validate.pyを変更した4 Skillへ実行: 全件valid。skills:verify / check-contracts: exit 0。環境はTask 1と同じNode.js 24 / Python 3.14である。
- 手動behavior比較: 別agentへSkillなし / ありの独立workspaceと同じ4依頼を渡した。両条件ともsource・仕様・checkboxを編集せず、計算バグ、必須実動作の未検証、既存dirty overlapを検出した。Skillありではself-reviewが検証実行も実行担当へ返し、spec-holesがR1/R2各12分類と検証候補を明示した。verify-changeはgate成功・capture skip・CLI exit 2を区別し、executorはsafe boundary前に停止した。
- 比較の限界: 少数の手動scenarioであり、統計的な優位性や全分岐を証明しない。共通workflowは両条件で与えた。baseline agentは必須tool初期化で実repositoryのactive-project metadataを受け取ったが、そのfileやSkill本文は読んでいない。実験workspaceのGit状態を確認し、各caseの既存差分が保持されたことを確認した。

2026-10-30の再開: この会話で実装・検証したTask 1の差分を引き継ぐ。既存の利用者所有PoCは対象外として保護する。新cycleの初回CI parityはTask 1で確認済みの同じ環境を使用し、Task 2のfocused validation、skills:verify、check-contractsで先行確認する。最終project checksは責務整理後の最新入力でfresh実行する。

### 3. Root policy と workflow の重複を削減する

- 成果: 条件の正本と手順の正本を明示し、live policyからOSWF-5の規則名を除く。
- 依存: 2。
- 対象: `AGENTS.md`, `GLOSSARY.md`, `openspec/project.md`, `docs/agents`, `tests`。
- [x] 実装 checkbox: 共通手順をworkflowへ集約し、参照とstatic contractsを更新する。
- [x] 検証 checkbox: 必須条件の意味保存と参照解決を確認する。

- fresh focused validation: Task 2と同じ4 contract testsは54 passed。独立レビューの7条件・review順序と上限・preflight / dirty / resume・未検証の非完了扱いを正本へ対応付けた。
- live policy、workflow、first-party Skillsから旧規則名を除去した。GLOSSARY.mdは語義を保持し手順を参照へ移し、openspec/project.mdはartifact配置とテンプレート固有close規約を保持した。歴史監査・ADR・retrospectiveと利用者所有PoCは変更していない。

### 4. Issue #73 全体の完了条件を確認する

- 成果: 全受入条件に対応するfreshまたは有効な再利用evidenceを得る。
- 依存: 3。
- 対象: `openspec/changes/simplify-policy-skill-ownership`, `docs/template/release.md`。
- [x] 実装 checkbox: self-reviewと独立reviewのfindingを処理する。
- [x] 検証 checkbox: 最新入力の./scripts/check.sh、initial reviewerと別のverifier、OpenSpec検証を完了する。

- self-review: 役割移動、参照先、7条件、review上限、必須evidence、dirty/resume、12分類、既存差分保護を確認した。engineのCLI / chat入口と必要なdesign artifactの記述が移動時に脱落していたため、実行担当が各ownerへ補った。これはproseの契約確認であり、元記述と移動先の照合、54件のfocused testsで確認した。
- Context7のOpenSpec一次資料でterminal CLIとchatの /opsx:* の区別を再確認した。task openspec:validateは1 passed、ruff / git diff --checkも成功。Task 1から変更していない上流Skill・legal・metadataと歴史記録は初期snapshotとの照合で保持を確認する。
- self-review時点では、Task 2–4の実装を含む最新入力の独立review、project checks、別verifierは未完了だった。外部Issueのcloseや公開操作は行わない。
- 2026-10-31のinitial independent review（ownership_review）: blockerなし。役割移管・意味保存・予定内16ファイル・参照53件を確認し、focused testsは43 passed、git diff --checkは成功した。上流・metadata・legal・links・歴史記録・利用者PoCの不変も確認した。review中のuv runにより.venvの4 packagesが再installされたため、全体gateは最新環境でfresh実行する。
- 追加focused validation: basedpyrightは0 errors、ruff check / formatは成功。template release / history contract testsは10 passed。
- 最新入力の ./scripts/check.sh: fresh実行でexit 0。Node tests 638 passed、Python tests 1494 passed / 126 skipped、ruff / TypeScript / basedpyright成功。source commitは50687105f1fc6a21992ddc1d90ca959a6cd023a9と現在の未コミット差分。この時点ではTask 2–4を含むtemplate lifecycleと別verifierは未完了だった。
- task check:template: fresh実行でexit 0、15 passed（843.70秒）。Task 2–4の成果を含む隔離コピーでsetup、gate、doctor、package rename、offline prune、再setupと各段階のgateを確認した。source commitは上記と同じ。残る完了条件は別verifierによる確認である。
- 2026-11-04の再開: verifierは一度利用上限で中断した。再開を跨いで一時logと入力snapshotが消失し環境同一性を証明できないため、過去のgreen evidenceを再利用せず最新入力で検証する。前回の再実行では ./scripts/check.sh はexit 0（1494 passed / 126 skipped）を確認したが、template lifecycleの終了結果は取得できなかった。実装の変更はない。
- 2026-11-04の ./scripts/check.sh: fresh実行でexit 0。Node tests 638 passed、Python tests 1494 passed / 126 skipped（161.20秒）、ruff / TypeScript / basedpyright成功。source commitは50687105f1fc6a21992ddc1d90ca959a6cd023a9と現在の未コミット差分。この時点ではtemplate lifecycleと別verifierの最終判定は継続中だった。
- 2026-11-04の task check:template: fresh実行でexit 0、15 passed（847.24秒）。source commitは上記と同じ。setup、package rename、offline prune、再setup、各段階のgateとdoctorを最新入力で確認した。実行前の入力snapshotからの変更は本書の証跡だけである。
- 別担当ownership_verifier: blocking findingなし。fresh focused validationは140 passed、skills:verifyとgit diff --checkは成功。必須7条件、4 Skillの責務、停止・再開・未検証の扱い、用語14件、参照53件を独立確認した。11月4日の全体gateとtemplate lifecycleの結果を確認し、268 pathsの照合で変更が本書の証跡だけであることを確認して最新green evidenceを再利用した。初回reviewerとは別担当であり、ファイルの編集は行っていない。
- 最終証跡更新後のtask openspec:validateは1 passed、git diff --checkは成功。OpenSpec検証の初回はPATHに既存CLIの配置先が含まれずexit 1となったが、配置先を補った再実行はexit 0だった。新規installや依存変更は行っていない。
- 一時artifact cleanup: gate入力からの変更が本書だけであることを再確認し、今回所有の一時snapshotとlogを削除した。再開前の一時directoryは既に存在しなかった。検証結果は本書へ要約し、利用者所有PoCを保持した。
- Task 1–4のローカル実装と必須検証を完了した。実装・検証完了時点ではcommit、PR、外部Issueの更新・close、mergeは未実行だった。後続の利用者依頼により、利用者所有PoCを除く検証済み成果を作業branchへcommit・pushする。change directoryはpre-merge closeまで保持する。


### 5. 現行mainと保守テスト配置を統合する

- 成果: PR #92の配布境界を維持し、R06とGLOSSARY回帰が正しいgateで動作する。
- 依存: 4。
- 対象: `tests`, `template-maintenance`, `repo-tools/template_prune_state.py`, `repo-tools/template_prune_manifest.py`, `Taskfile.yml`, `pyproject.toml`, `docs/reference/prune-template-assets.md`, `docs/template/release.md`, `openspec/changes/simplify-policy-skill-ownership`。
- [x] 実装 checkbox: mainをmergeし、placeholder回帰とGLOSSARY回帰を移設先へ統合してmanifestを更新する。
- [x] 検証 checkbox: 統合直後のcollection、保守側型検査、bundled/prunedのfocused testsを確認する。

外部レビューP1/P2とgrilling Q1–Q4の合意に基づく新cycle。過去のTask 1–4の成功は旧入力の履歴であり、現在の完了判定には再利用しない。開始HEADはd2f687baea0bf151aed8e84629d407542ccd81de、統合mainは3e25fd1ab735fc43ae76944b80e4142b84f8e41c。既存の非追跡PoCは対象外として保持する。

Task 5 evidence（fresh、source commit d2f687baea0bf151aed8e84629d407542ccd81deとmain 3e25fd1ab735fc43ae76944b80e4142b84f8e41cの未commit統合差分）:

- merge --no-commitは自動統合に成功し、GLOSSARY回帰も移設先へ保持された。merge commitは全体検証後に作成する。
- RED: 通常側に残ったphraseテストのpytest collectionはModuleNotFoundError: No module named 'template_prune_fixture'でexit 2。移設後の通常collectionは766 tests、exit 0。
- manifestへの追加後、独立したdownstream fixtureの固定資産一覧が不足し、test_complete_configuration[True]がinconsistentで失敗した。失敗が判明した広いfocused実行は中断し、最小再現を確認して同fixtureへ新資産を追加した。
- .venv/bin/basedpyright template-maintenance/tests: 0 errors。phrase / corpus / complete_configuration / glossary / downstream公開CLIのfocused pytest: 109 passed（4.72秒）。bundled/prunedのR06・GLOSSARYと保守corpusを持たない下流を確認した。

### 6. setup配布を撤回し設定復旧をprojectへ戻す

- 成果: 不要なsetup入口を除去し、共有設定のownerを維持したまま上流Skillの前提を満たす。
- 依存: 5。
- 対象: `.agents/skills/setup-matt-pocock-skills`, `.agents/skills/skills.sources.json`, `.agents/skills/skills.lock.json`, `.claude/skills/setup-matt-pocock-skills`, `.codex/skills/setup-matt-pocock-skills`, `AGENTS.md`, `docs/agents`, `docs/template/release.md`, `openspec/changes/simplify-policy-skill-ownership`。
- [x] 実装 checkbox: setup本体・登録・link・利用案内を除去し、復旧ownerと入口を明記する。
- [x] 検証 checkbox: offline整合、他上流Skillの不変、AGENTS/CLAUDE共存fixtureの設定あり/欠落behaviorを確認する。

Task 6 evidence（fresh、source commitと統合差分はTask 5と同じ）:

- skills:verify --jsonはexit 0、errors/warningsなし。sourceとlockはsetup entryの除去以外に構造差分なし。setup以外の38 Skill pathsのbytes/modeを開始snapshotと照合し不変を確認した。
- AGENTS.md/CLAUDE.mdが共存する独立fixtureを設定あり・設定欠落の2ケースで手動agent検証した。設定ありではproject remoteと設定文書からIssue/仕様入力を選び、setup不要と判断した。欠落ではtrackerを推測せず利用者確認とdocs/agentsの復旧案へ進み、CLAUDE共通設定追加・setup案内・外部アクセス・編集を行わなかった。両fixtureのGit状態も不変だった。少数の準備段階のbehavior確認であり、全reviewセッションの統計的保証ではない。
- 既存workflow contract testsは54 passed。ruff check / format、OpenSpec検証、git diff --checkは成功。

### 7. 修正cycleの受入を完了する

- 成果: 最新統合入力で外部レビューのP1/P2を解消し、必須検証を完了する。
- 依存: 6。
- 対象: `openspec/changes/simplify-policy-skill-ownership`。
- [x] 実装 checkbox: self-review、独立reviewとfinding修正を完了する。
- [x] 検証 checkbox: ./scripts/check.sh、task check:template、OpenSpec検証、初回reviewerと別のverifierを完了する。

- self-review: 自動mergeが保持したGLOSSARY回帰、runtimeのcorpus非依存、phraseテスト本文のbytes同一移設、source/lock/linkの除去範囲、AGENTSから欠落時にも到達できる復旧手順、read-only境界を確認した。新規manifest項目により保守資産が31から32へ増えるため、公開文書の件数を修正した。manifest件数との照合で確認し、proseの数値修正なので新テストは追加しない。前cycleの歴史記録やPoCは保持する。

- initial independent review（repair_review）: blocking findingなし。P1/P2、manifest32資産、残存38 Skill paths、PoC保護、phrase本文同一移設を確認した。fresh focused testsは107 passed、skills:verify / git diff --checkは成功。検証source commitはTask 5と同じで、全体両gateと別verifierは後続で実施する。

- ./scripts/check.sh: fresh実行でexit 0。Node tests 638 passed、Python tests 640 passed / 126 skipped（16.80秒）、ruff / TypeScript / basedpyright成功。source commitはd2f687baea0bf151aed8e84629d407542ccd81deとmain 3e25fd1ab735fc43ae76944b80e4142b84f8e41cの統合差分。通常gateから保守回帰を分離した結果であり、件数減少を検証省略の代替にしない。task check:templateと別verifierは未完了。

- task check:template: fresh実行でexit 0、955 passed（403.88秒）。保守側型検査0 errors、実setup・rename・offline prune・再setupと各段階の通常gateを含む。再開後に終了結果と入力snapshotを照合し、変更が本書の証跡だけであることを確認した。source commitと統合差分はTask 5と同じ。残る完了条件は別verifierと最終のOpenSpec形式検証である。

- 2026-11-05の別担当repair_verifier: blocking findingなし。fresh focused pytestは109 passed、skills:verify / git diff --checkは成功。271 pathsのsnapshot照合で変更が本書の証跡だけであること、Node.js 24.14.1 / Python 3.14.6とdependency metadataの不変を確認し、両gateのgreen evidenceを再利用した。PR #92の境界、setup廃止、設定復旧、残存Skill/PoC保護も独立確認した。
- Task 5–7の実装・必須検証を完了した。最終のOpenSpec形式検証は1 passed。検証後に作業branchへのmain取込みをmerge commitとして確定し、承認済みのcommit/push範囲で公開する。PR作成、mainへのmerge、外部Issueの更新・closeは行わない。change directoryはpre-merge closeまで保持する。

- cleanup: 入力同一性の再確認後、今回所有の一時log・snapshot・behavior fixtureを削除した。結果は本書に要約済みで、利用者所有PoCは変更していない。
