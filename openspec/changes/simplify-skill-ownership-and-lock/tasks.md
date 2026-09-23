# Tasks: Skill ownership / lock縮小

## 実行制約

1. **最初のCI parity**: Node.js 24 / npmとPython >=3.14、locked依存で現行 `task check` を確認する。
   最初の環境依存vertical slice（task 2）で実clone境界とoffline verifyを接続し、CIと同じcheckを全実装完了前に実行する。
2. **停止・再計画条件**: 利用者の現承認は文書作成・pushだけである。実装は新しい明示指示まで開始しない。
   実装時の仕様判断、material expansion、review / infrastructure blockerはAGENTS.mdのOSWF-5とworkflowに従い、
   完了済みcheckboxを保持して停止する。未実行・失敗を完了へ読み替えない。
3. **一時artifact cleanup**: fixture clone、故障注入用file、raw logはrepository外またはgitignore済み領域だけに置く。
   失敗候補は診断後に対象を確認して破棄し、source / 利用者fileを削除しない。
   一時artifactを通常CI・完了判定の恒久依存にせず、文書branchのchangeは実装完了までcloseしない。

## Tasks

以下は将来の実装計画である。今回の文書作成で完了させない。
一体のchangeを同じexecutorが順次実行し、追加の実装executorは割り当てない。
独立review / verifierはOSWF-5に従う。

### 1. baselineとv2 metadataの純粋モデル

- 成果: 現行checkのbaseline、schema v2、remote専用lock、origin、plugin宣言保持、canonical互換をfixtureで定義する。
- 依存: なし。
- 対象:
  - `repo-tools/skill-updater/types-v2.ts`
  - `repo-tools/skill-updater/schema-v2.ts`
  - `repo-tools/skill-updater/canonical.ts`
  - `repo-tools/skill-updater/legal.ts`
  - `repo-tools/skill-updater/metadata.ts`
  - `repo-tools/skill-updater-v2-foundation.test.ts`
  - `repo-tools/fixtures/skill-updater`
- [ ] 実装: v2モデルを独立moduleに追加しV1 / V2の純粋変換testsを作る。既存v1 CLI / 配布物はまだ切り替えず、task 2の通常checkを維持する。
- [ ] 検証: 既存 `task check` baseline、v2 decode / serialize・tree-v1 golden・境界・重複負例と、R2のremote / local共通SKILL.md構造・identity互換をfocused実行する。

### 2. 隔離書込みのvertical slice

- 成果: source snapshotの読取り、独立候補preflight、候補だけへの最小書込みと最終offline検証を実証する。
- 依存: 1。
- 対象:
  - `repo-tools/skill-updater/repository.ts`
  - `repo-tools/skill-updater/isolation.ts`
  - `repo-tools/skill-updater/apply.ts`
  - `repo-tools/skill-updater-isolation.test.ts`
  - `repo-tools/skill-updater-repository.test.ts`
- [ ] 実装: R6境界をfixtureの実cloneで接続する。旧transactionはこの時点で撤去しない。
- [ ] 検証: V6のsource不変・共有領域拒否・途中失敗 / kill・新clone再実行（WSLはLinux filesystem、mount条件を記録）と、最初のCI parity `task check` を実行する。

### 3. branch / commit / tag取得とrepin

- 成果: metadata事前検査を保った取得、tag二重固定、名前指定の出典・license / legalMappings repin、本文同一commit更新。
- 依存: 2。
- 対象:
  - `repo-tools/skill-updater/github.ts`
  - `repo-tools/skill-updater/git-object.ts`
  - `repo-tools/skill-updater/planner.ts`
  - `repo-tools/skill-updater-github.test.ts`
  - `repo-tools/skill-updater-planner.test.ts`
  - `repo-tools/skill-updater-remote-command.test.ts`
- [ ] 実装: R3 / R4を接続し、SemVer範囲探索を通常経路から外す。
- [ ] 検証: V3 / V4、事前拒否時blob呼出0、通常updateのpolicy / mapping変更拒否、指名repinの旧lock / 新source別検証・同commit legal変更、SKILL.md構造・identity拒否、実公開GitHubの固定commit read-only取得を実行する。

### 4. local化とv1専用移行

- 成果: 本文保持local化、offline v1→v2、明示localize、再実行条件を実装する。
- 依存: 3。
- 対象:
  - `repo-tools/skill-updater/ownership.ts`
  - `repo-tools/skill-updater/migration`
  - `repo-tools/skill-updater-migration.test.ts`
  - `repo-tools/skill-updater-ownership.test.ts`
  - `repo-tools/fixtures/skill-updater`
- [ ] 実装: R5 / R7を実装し、旧decoderを通常CLIから分離する。
- [ ] 検証: V5 / V7、network呼出0、全本文 / mode / commit / legal保持、混在 / 欠損 / 未指定編集 / SKILL.md構造・identity不正の拒否を実行する。

### 5. 公開操作への統合と不要責務の撤去

- 成果: 公開CLIとTaskfileをv2へ接続し、不要となったlocal-lock、SemVer探索、transaction / rollback状態を除去する。
- 依存: 4。
- 対象:
  - `repo-tools/skill-updater`
  - `repo-tools/cli.ts`
  - `repo-tools/skill-updater-cli.test.ts`
  - `repo-tools/skill-updater-transaction.test.ts`
  - `scripts/setup-skills.sh`
  - `tests/test_setup_skills.py`
  - `Taskfile.yml`
- [ ] 実装: interfaces.mdの隔離更新preview / apply / JSON / exitとlinksの直接修復・全対象衝突 / 親path検査を実装し、V6の成功証拠を確認してから不要処理を撤去する。
- [ ] 検証: V8、legacy route拒否、隔離更新のsource直接書込み拒否、linksの現在checkout修復・冪等性・衝突時書込み0、部分失敗の全体失敗、typecheck / focused testsを実行する。

### 6. 配布物・CI・利用文書の一体移行

- 成果: 配布metadataと実体、通常offline CI、local / rename checks、手動更新手順を整合させる。
- 依存: 5。
- 対象:
  - `.agents/skills`
  - `.claude/skills`
  - `.codex/skills`
  - `repo-tools/repository-contracts.ts`
  - `repo-tools/skill-updater-migration.test.ts`
  - `.github/workflows/ci.yml`
  - `Taskfile.yml`
  - `README.md`
  - `docs/agents/workflow.md`
  - `docs/template`
  - `tests/test_setup_skills.py`
- [ ] 実装: 旧配布物を専用移行で変換し、必要なCI / contract / 文書参照だけを更新する。Skill選別やhost integrationを追加しない。
- [ ] 検証: offline verify、通常check / rename smokeの整合、Ubuntu / WSL Ubuntu（Linux filesystem上のsource・candidate・Git metadata、mount条件を記録）の標準手順、失敗候補のPR手順停止を確認する。

### 7. change全体のreviewと検証

- 成果: R1–R8、96分類判断、V1–V8を実装・検証証拠へ対応付ける。
- 依存: 6。
- 対象:
  - `repo-tools`
  - `.agents/skills`
  - `Taskfile.yml`
  - `.github/workflows/ci.yml`
  - `docs`
  - `openspec/changes/simplify-skill-ownership-and-lock`
- [ ] 実装: self-review、OSWF-5のinitial independent review、必要なfinding修正を実施する。
- [ ] 検証: focused validation、最新入力の `task check`、`task check:isolated`、strict OpenSpec検証、`task openspec:validate`、別agentのindependent verifierを成功させる。

### 8. 完了確認とpre-merge close

- 成果: 全実装・検証完了後だけふりかえりとcloseを行い、mainへのactive change持込みを防ぐ。
- 依存: 7。
- 対象:
  - `docs/template/retrospectives.md`
  - `openspec/changes/simplify-skill-ownership-and-lock`
- [ ] 実装: workflow所定のふりかえりを記録し、実装PRのmerge前にこのchangeをcloseする。
- [ ] 検証: 全checkboxと受け入れ条件を確認し、close後の `task openspec:validate` と影響入力の必要checkを実行する。

## 初回文書作成時の証跡（74ae330）

- 状態: 初回文書snapshot `74ae3309417799abe4ad69a9c9a1d8ccab6ca14a` の文書作成・initial review・project checks・文書independent verifier完了。実装承認なし。全実装taskと新挙動の検証は未着手。
- 基準source commit: `cae73342c1b25755fe3a7abceb4032b1f9b21837`。
- 以下のcommandは2026-09-23の再開後、上記source commitにこのbranchの文書差分を加えた入力でfresh実行した。既存green evidenceの再利用ではない。
  Node.js 24.14.1、Python 3.14.6、locked npm / uv依存、OpenSpec 1.3.1を使用した。実装のgreen evidenceには流用しない。
- `openspec validate simplify-skill-ownership-and-lock --strict --no-interactive`: 成功。
- `task openspec:validate`: 1 change成功、失敗0。
- `uv run --no-sync pytest tests/test_openspec_direct_workflow_contract.py tests/test_execute_openspec_change_skill.py -q --no-cov`: 30 tests成功。
- `task check`: exit 0。Node tests 160、Python tests 175成功。contracts / skills:verify / typecheck / ruff / basedpyrightも成功。
- `git diff --cached --check`: 成功。Pythonによるread-only文書監査で、10 Markdown files、8 requirements、26 scenarios、
  96分類判断、8依存順task / 16未完了checkbox、相対リンクを確認した。
- 未検証: V1–V8の新挙動、実remote取得、WSL実機、移行・中断seam、変更後rename smoke / check:isolated。
  理由は今回の利用者指示が文書作成のみで、実装していないためである。change close不可。
- 文書self-review: 合意・対象scope・task依存・検証対応を確認。初期v2モデルを既存CLIと並行検証する順序、
  repinの名前指定範囲、cohort単位の取得前検査、対象path形式、canonicalのNUL表記を明確化した。
- 文書initial independent review: 完成状態のsource / lock一致と、承認済み変更を適用する入口条件の衝突を1件検出。
  旧lockがA/x、sourceがB/y、旧本文は一致する入力で、repin許可と入口拒否が同時に成立した。
  iteration 1でschema / R1 / interfaces / spec-holes / V1・V4・V8を限定transition validationへ統一した。
  文書の仕様矛盾であり、実装禁止のためcode testは追加せず、反例と将来の検証群を記録した。
- 同initial reviewerによるiteration 1のdiff review: PASS。上記blocker解消、新規blockerなし。
- 別agentの文書independent verifier: PASS。合意・要件・schema・公開操作・隔離・移行・task依存・検証対応を確認し、文書としてpush可能と判定。
  初回起動は利用上限により成果なしで終了し、利用者の再開指示後に完了した。
  verifier自身もstrict OpenSpec検証とdiff whitespace検査をfresh実行した。新挙動の実装検証ではない。

## 外部レビュー反映cycleの状態・証跡

- 基準source commit: `74ae3309417799abe4ad69a9c9a1d8ccab6ca14a`。このcommitに文書修正差分を加えた入力を検証する。
- 合意済み修正: 指名repinのlicense / legalMappings遷移、R2の共通Skill構造・identity検証、
  WSL Linux filesystemへの保証限定、skills:linksの現在checkout修復を反映した。
- 状態: 文書修正・self-review・initial independent review・project checks・別agentのindependent verifierを完了。初回cycleの成功証跡は今回の差分の検証へ流用していない。
- 文書self-review: 4件の合意・規範要件・公開操作・検証計画の対応を確認し、linksの例外と同commitの無変更判定を整合させた。
- 文書initial independent review: PASS。10 Markdown差分と全16未完了checkboxを確認し、blockerなし。
- 以下は2026-09-23、上記source commitに今回の文書差分を加えた入力でfresh実行した。
  Node.js 24.14.1、Python 3.14.6、locked npm / uv依存、OpenSpec 1.3.1を使用した。
- `openspec validate simplify-skill-ownership-and-lock --strict --no-interactive`: 成功。
- `task openspec:validate`: 1 change成功、失敗0。
- `uv run --no-sync pytest tests/test_openspec_direct_workflow_contract.py tests/test_execute_openspec_change_skill.py -q --no-cov`: 30 tests成功。
- `git diff --check`: 成功。Pythonによるread-only監査で10 Markdown files、8 requirements、32 scenarios、
  96分類判断、8依存順task、16未完了checkbox、相対リンク、文書限定のdiffを確認した。
- `task check`: 再開後にfresh再実行しexit 0。Node tests 160、Python tests 175、contracts / skills:verify / typecheck / ruff / basedpyright成功。
  中断前の実行結果は確認できなかったため成功証跡に使用しない。
- 別agentの文書independent verifier: PASS。合意4点、10 Markdown限定の差分、16未完了checkboxを確認し、blockerなし。
  strict OpenSpec検証、diff whitespace検査、構造監査をfresh実行して成功した。
- 未検証: 新挙動V1–V8、WSL実機、移行・中断seam。実装は承認されておらず、全16 checkboxを未完了のまま保持する。
