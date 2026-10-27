# 実装タスク: separate-prune-maintenance-regressions

## Execution Constraints

1. 最初の CI parity: 最初の環境依存sliceでNode 24 / Python 3.14 / lock固定の通常gateとpruned baselineを確認する。
2. 停止・再計画条件: AGENTS.md / workflow の条件に従い、scope拡張・仕様判断・必須検証失敗・明らかな性能悪化を完了扱いしない。
3. 一時 artifact cleanup: disposable repositoryと測定logをcleanupし、生logを追跡しない。closeは全実装・検証完了後に行う。

## Tasks

### 1. baseline と現在の検証境界を確定する

- 成果: マージ済みbaseと測定・収集件数を確定する。
- 依存: なし。
- 対象:
  - `openspec/changes/separate-prune-maintenance-regressions/`
- [x] 実装: 環境とcase/nodeid baselineを用意する。
- [x] 検証: V01とspec-holesの未解決判断なしを確認する。

#### Task 1 証跡（2026-10-21）

- source `9db2f3366d4f2a4bd04fcb993144b54d36ebe102`。新worktreeの開始時dirtyなし。
  active change1、6 artifacts、4 tasksの依存順と3制約、各要件12分類の解決を確認した。
- `uv sync --locked --python .../python3.14`、`npm ci --ignore-scripts`、
  `uv run --no-sync python scripts/setup-shell-parser.py`: fresh exit0。lock不変。
- `task openspec:validate` と strict target validate: fresh exit0 / valid。
- `./scripts/check.sh`: fresh exit0、Node 638 passed、Python 1403 passed / 126 skipped（en_US.UTF-8未導入）。
- `uv run --no-sync pytest --collect-only -q --no-cov`: fresh exit0、移設前nodeidを採取した。
- 基準treeのtracked filesをdisposable repositoryへコピーし、locked setup、Git初期commit、正式pruneを実行した。
  `/usr/bin/time -f '%e %M' task check` はpruned状態で直列3回すべてexit0。
  wall秒=233.33 / 220.26 / 240.28、最大RSS KiB=380180 / 379876 / 383280。
  中央値233.33秒 / 380180 KiB。Node24.14.1、Python3.14.6、同host・同locale、cache非flush。
  setup / pruneは測定外、disposable treeはcleanup済み。最終比較後に一時logを削除する。
- Context7のpytest公式文書で、testpathsは明示path引数がない場合の収集先であり、
  保守directoryの明示指定で分離可能と確認した。新たなimport-modeや依存変更は導入しない。

### 2. 回帰資産とcorpus検証を保守側へ移す

- 成果: 固定manifest、runtime、共通fixture、テスト収集、利用文書を一体で変更する。
- 依存: 1。
- 対象:
  - `repo-tools/`
  - `tests/`
  - `template-maintenance/`
  - `Taskfile.yml`
  - `docs/reference/prune-template-assets.md`
  - `docs/template/parser-cost.md`
  - `README.md`
  - `docs/agents/workflow.md`
  - `openspec/changes/separate-prune-maintenance-regressions/`
- [x] 実装: design §2〜4を実装し公開契約を保持する。
- [x] 検証: V02〜V05のfocused検証と回帰全件対応を確認する。

#### Task 2 証跡（2026-10-21）

- sourceは上記baseと本change差分。K05を除いた最小pruned構成は修正前1 failed、修正後成功。
- 8 modulesを移設し、参照corpus269件はbytes不変（SHA-256
  `c7870abe5be7d11d0392510454476b10fba533478c9b94932f2e4af1c7f4fa44`）。
  corpus schema検証は保守helperで実行し、通常helper・Node fixtureのcorpus依存を除去した。
- 移設中のfocused検証でworkflow除外がmanifest末尾indexに依存していたことを検出した。
  元と同じexact workflow pathの比較へ変更し、型・参照検査の除外範囲は拡張していない。
  境界focusedは修正後85 passed。これは実装checkbox完了前の修正である。
- `uv run --no-sync pytest --no-cov -q tests/test_downstream_prune_contract.py template-maintenance/tests/test_prune_corpus.py tests/test_template_version.py tests/test_setup_mcp.py`:
  fresh 54 passed。R01〜R06の下流参照拒否、構文失敗、公開version/setupとschema負例を確認した。
- `pytest --collect-only --no-cov -q tests template-maintenance/tests`: fresh成功。
  通常763件、保守852件（合計1615件）。変更前通常1529件とのnodeid対応で、
  旧K05保持要件を撤回する2parameterだけを除き、移設した全既存nodeidを保持した。
  既存保守15件、新規公開8件、schema11件、新規固定資産48件・directory6件を追加した。
- `node --test repo-tools/template-prune-result.test.ts`: fresh 28 passed（共通protocol corpus12件を含む）。
  `tsc --noEmit`、`basedpyright`、Ruff format/check、`git diff --check` は成功。
- `task check:template`: fresh exit0、852 passed / 427.76秒。
  全269case×2構成、Git/index/CRLF/hardlink、fresh→rename→prune→再setupの実gateを含む。
  coverage対象アプリmodule未importの既存warningはあるが、検証skipや失敗はない。
- self-review: runtimeはcorpus schema読取り削除とworkflow exact path維持だけ、parser/CLI/JSON/Git保護は不変。
  移設5 modulesはbytes不変、残りはimport/pathと新契約のschema責務・追加manifest境界だけを変更した。
  保持文書から削除先リンクを除去し、保守再現コマンドを移設先へ変更した。

### 5. 外部レビューの修正と再検証を行う

- 成果: 合意済みの型検査境界・公開安全性の回帰検証・旧K05案内を補完する。
- 依存: 2。
- 対象:
  - `pyproject.toml`
  - `Taskfile.yml`
  - `template-maintenance/tests/`
  - `tests/test_downstream_prune_contract.py`
  - `docs/reference/prune-template-assets.md`
  - `docs/template/v2-release-notes.md`
  - `openspec/changes/separate-prune-maintenance-regressions/`
- [x] 実装: 保守型検査、構文失敗の公開入口検証、旧K05案内を追加する。
- [x] 検証: V09〜V11、self-review、独立review、修正後の通常・保守gateと再測定を完了する。

#### 修正cycleの承認と開始条件（2026-10-22）

- source `165ff8dae366c464eacbd90040a1ce9864c1d53d`、専用worktreeはclean。
  active change1、必須6 artifacts、12分類と依存順、strict相当のOpenSpec gate成功を確認した。
- 外部レビューのP2は型検査対象の欠落とfail-closed検証不足の2件。P1は既知の受入未完了、
  P3は対象外migrationの利用者案内である。過去の完了checkboxと実測は当時の証跡として保持する。
- 利用者はgrillingで、保守gateへの型検査追加、通常側の代表1ケース、文書案内だけの旧K05対応、
  同条件ならbefore再利用・after3回再測定、保守型検査の別測定を承認した。
- 本cycleのcommit / push / PR作成、hosted CI、独立review / 別verifier、pre-merge closeまで承認済み。
  mergeは行わない。Task3の受入は本task完了後に再開する。
- 通常gate・保守gateのNode24/Python3.14 parityを確認し、依存・lock・parser runtimeを変更しない。

#### Task 5 focused検証とself-review

- sourceは `165ff8d` と本cycle差分。Context7のbasedpyright公式CLI仕様で明示pathがincludeを上書きすることを確認した。
- 初回の保守型検査はprune_corpus.pyの静的import未解決で1 error。extraPathsへrepo-toolsを追加し、
  通常include/basic/Python3.14を維持したまま通常・保守の両型検査でfresh 0 errorsとなった。
- 一時的に全14保守Pythonファイルへ型不正を入れた `task check:template` probeは全14件を診断し、
  exit201でpytest起動前に停止した。probeはfinallyで元bytesへ復元済み。
- successfulからanalysis_errors判定を除くmutation probeは、新しい公開契約テストが1 failedとなった。
  runtimeを元bytesへ復元後、`pytest --no-cov -q tests/test_downstream_prune_contract.py tests/test_taskfile.py template-maintenance/tests/test_prune_corpus.py` はfresh 30 passed。
- `ruff check .`、通常basedpyright、diff checkはfresh成功。実CLIの正常対照・解析診断による拒否・全fixtureとindex不変を確認した。
- self-reviewで、公開referenceの固定資産数が旧4 directory / 19 fileのままなのを発見した。
  現行manifestは6 / 31であり本文を修正した。純proseの数量訂正としてmanifestとの直接照合を行い、重複する固定文言テストは追加しない。
  これは旧実装checkbox完了後のself-review発見1件としてふりかえりへ数える。
- 自動migration、parser/CLI/runtime、dependency/lockには変更がないことをdiffで確認した。
- 前回beforeの依存環境全体の同一性を現在の記録だけでは証明できないため、本cycleではbefore/afterの両方をfreshで各3回測定する。

- independent reviewer `prune_revision_review`: APPROVE、blocker0。fresh保守型検査0 errors、
  focused30 passed / 3.02秒、corpus269件bytes・移設8modules関数・manifest/fixture照合成功。
  通常・保守fullgate、測定、hosted CI、verifierは後続工程として扱う。
- review後の `./scripts/check.sh`: fresh exit0、Node638 passed、Python637 passed / 126 skipped、
  pytest19.29秒。skipは前回と同じ未導入locale条件。

- review後の `task check:template`: fresh exit0、保守型検査0 errors、852 passed / 440.06秒。
  fresh/rename/prune/再setupの実統合を含み、coverage対象module未importの既存warningのみ。
- `/usr/bin/time -f '%e %M' uv run --no-sync basedpyright template-maintenance/tests`:
  fresh exit0、wall1.16秒 / 最大RSS325876 KiB。通常gateの全体型検査を重複実行しない。

#### Task 5 同環境でのbefore / after再測定

- source: before `9db2f3366d4f2a4bd04fcb993144b54d36ebe102`、after `165ff8d` と本cycle差分。
  両者ともdisposable Git repositoryへ出荷treeを配置し、locked setupと正式prune後に計測した。
  afterのactive OpenSpecは配布状態を揃えるため除外した。setup / pruneは計測外、直列実行、cache非flush。
- 環境: 同一Ubuntu amd64 host、Node24.14.1 / Python3.14.6 / uv0.11.26 / Task3.51.1、LANG/LC_ALL=C.UTF-8。
  uv.lock / package-lock.jsonのSHA-256が両treeで同一であることを照合した。
- `/usr/bin/time -f '%e %M' task check`: before3回ともfresh exit0。
  wall秒=196.10 / 193.13 / 196.31、最大RSS KiB=381268 / 383948 / 380832。
  各回Node638 passed、Python1403 passed / 126 skipped。
- 同commandのafter3回ともfresh exit0。
  wall秒=62.11 / 60.50 / 57.11、最大RSS KiB=344516 / 345272 / 343968。
  各回Node638 passed、Python637 passed / 126 skipped。
- 中央値: wall196.10→60.50秒（69.15%減）、最大RSS381268→344516 KiB（9.64%減）。
  before範囲193.13〜196.31秒、after範囲57.11〜62.11秒。明らかな悪化なし。
  前cycleの77.08%減を最新値として扱わず、この同環境fresh比較を採用する。
- afterのpruned `task doctor`: fresh exit0。両disposable treeはcleanup済み。
  生logは証跡転記後にcleanupし、repoへ保存しない。

### 3. 実測・review・最終検証を完了する

- 成果: 効果と互換性を検証しreview findingを解消する。
- 依存: 5。
- 対象:
  - `repo-tools/`
  - `tests/`
  - `template-maintenance/`
  - `Taskfile.yml`
  - `docs/reference/prune-template-assets.md`
  - `docs/template/parser-cost.md`
  - `README.md`
  - `docs/agents/workflow.md`
  - `openspec/changes/separate-prune-maintenance-regressions/`
- [x] 実装: self-review、independent reviewと必要なfinding修正を完了する。
- [x] 検証: V06〜V07、同一環境のafter3回、正式gate、保守gate、hosted CI、別verifierを完了する。

#### Task 3 ローカル検証・測定完了（2026-10-21）

- sourceは `9db2f3366d4f2a4bd04fcb993144b54d36ebe102` と本changeの差分。
- initial independent reviewer `prune_efficiency_review`: APPROVE、blocker0。
  fresh focused 726 passed / 109.06秒。通常→保守 / 保守→通常の収集順とも1615 nodeidsで重複0。
  corpus bytes、8 modulesの全test関数、manifest固定コピー、通常helper非依存を独立照合した。
- review 後の `./scripts/check.sh`: fresh exit0、Node638 passed、Python637 passed / 126 skipped、
  pytest16.42秒。Ruff・型検査を含む。skipはbaseと同じ未導入locale条件である。
- afterは同じhost / Node24.14.1 / Python3.14.6 / lock / locale / cache非flush、直列で測定した。
  変更後treeをdisposable repositoryへコピーし、beforeと同じ出荷状態にするためactive OpenSpecだけを除外した。
  locked setup→正式pruneの後、`/usr/bin/time -f '%e %M' task check` を3回fresh実行、すべてexit0。
  wall秒=54.07 / 53.48 / 52.84、最大RSS KiB=347716 / 343880 / 345248。
  各回Node638 passed、Python637 passed / 126 skipped。setup / pruneは計測外。
- 中央値比較: wall233.33→53.48秒（77.08%減）、最大RSS380180→345248 KiB（9.19%減）。
  before範囲220.26〜240.28秒、after範囲52.84〜54.07秒。明らかな悪化は観測されなかった。
  検証配布範囲変更の効果であり、parser実装の高速化や他hostでの保証値ではない。
- pruned `task doctor`: fresh exit0、FAIL0 / WARN3。
  disposable treeはcleanup済み。正式pruned gate・rename・再setupはTask2の実統合が検証済み。
- strict target validate / `task openspec:validate`: 最新文書でfresh exit0 / valid。
- 2026-10-22: 利用者から本changeのcommit / pushまで明示承認を得た。
  PR作成、hosted CI、別独立verifier、Task4 closeは未実施。
  hosted CIとverifier未完了のためTask3検証・Task4は未完了を保持する。

#### Task 3 修正cycleの独立verifier（2026-10-22）

- `prune_revision_verifier` はinitial reviewerとは別agentでローカル検証APPROVE、blocker0。
  source `165ff8dae366c464eacbd90040a1ce9864c1d53d` と本cycleの11 files差分。
- tasks証跡追記も通常文書testの入力になるため、verifierは正式gateを再利用せずfresh実行した。
  `./scripts/check.sh`: exit0、Node638 passed、Python637 passed / 126 skipped、pytest17.92秒。
- fresh focused30 passed / 2.94秒、保守型検査14 source / 0 errors、全14file型不正の独立probeで
  exit201・pytest前停止。corpus269 bytes、移設8modules関数、manifest6 / 31と案内文書を照合した。
- 保守gate852 passedと型コストは、gate後の実装・保守入力・依存無変更を照合して再利用した。
  before/after各3回のlog・time・lock・環境・件数・中央値を独立照合した。
- strict OpenSpec gate1 passed、diff check成功。未完了はPR/hosted CI、close後の最終HEAD検証。
  locale126 skipsを検証済みへ読み替えず、hosted側の実行結果を確認する。

#### Hosted CI blockerと依存修正への引継ぎ（2026-10-22）

- source `ced268ccc5f71bdc52594a38d339eac3d2b6e821`、draft PR #92。
  CI run39730782236のcheck / rename-smoke / security / openspec-validateは成功。
  audit job119665079900はpip-audit exit1。既存virtualenv21.7.13の
  CVE-2026-113726 / 113776 / 113732 / 113725 / 113722を報告した。
- baseと本PRのuv.lock / package-lock.jsonに差分はなく、最適化の変更で追加した依存ではない。
  ただし必須auditの失敗を免除せずTask3検証とTask4を未完了に保つ。
- 利用者は別change・別PRで最小依存更新と監査を行う方針を承認した。
  `fix/virtualenv-audit-october` の `update-virtualenv-security-fixes` をmain起点の別worktreeで進める。
  先行PRのmerge後、その修正を本branchへ反映し、変更後の入力で必要gate・測定・review/verifier・CIを再評価する。
  mergeは利用者が行う。先行する依存修正PRは #93。
- source `ced268c` のhosted結果を確定した。通常check / rename-smokeはそれぞれNode638 / Python763 passed、
  pinned Task probe11 passed。ローカルでskipした126 locale casesもhostedで実行された。
  Template maintenance run39730782542は型0 errors、852 passed / 640.15秒で成功した。
  未解決はauditの5件であり、Task3検証 / Task4の未完了を維持する。

#### Task 3 依存修正merge後の再開（2026-10-24）

- 利用者はPR #93のmergeを報告し、続行を指示した。GitHub上でmerge commit
  `2d311ad3c86afde8a7cff15a116797fd096d0def` を確認した。
- cleanな専用branchへmainをmergeし、sourceは `ccd6d2fff17bcac4d1c827bccaf7ca218d9078e9`。
  最適化の実装に競合・変更はない。mainとの差分に依存更新を含めず、virtualenv21.14.13 /
  packaging26.3 / python-discovery1.6.4をそのまま継承した。
- active change1、必須6 artifacts、全12分類の解決、依存付きtasksとdirtyなしを確認後に再開した。
  strict target / `task openspec:validate` はfresh成功。
- `uv sync --locked --group security`、`npm ci --ignore-scripts`、pinned parser setupはfresh成功。
  新lockの通常・保守gate、監査、before / after各3回、review / verifier、hosted CIはこれから確認する。
- 旧完了checkboxと測定値は当時の履歴として保持し、Task3検証とTask4は未完了のままとする。
  commit / push / PR更新 / pre-merge closeは既存承認範囲。PRのmergeは利用者が行う。

#### Task 3 新しい依存監査blocker（2026-10-24）

- source `ccd6d2fff17bcac4d1c827bccaf7ca218d9078e9` と再開記録4文書。
  self-reviewで恒久差分を再読し、mainとのlock一致と実装scope維持を確認した。
- `prune_post93_review`: 独立review APPROVE、実装finding0。初回はusage limitで成果なし、
  利用者の再開指示後の1回の再試行で完了した。監査の受入判断は以下のrootの結果を適用する。
- fresh focused `pytest --no-cov -q tests/test_downstream_prune_contract.py tests/test_taskfile.py template-maintenance/tests/test_prune_corpus.py`:
  rootは30 passed / 4.47秒、reviewerは30 passed / 5.76秒。保守basedpyrightは双方0 errors。
- fresh `uv export --locked --format requirements-txt --no-emit-project` →
  `uv run --locked --group security pip-audit -r <一時requirements>` はexit1。
  mainから継承したfilelock3.29.4にCVE-2026-112940 / CVE-2026-112913 / CVE-2026-112907の3件を検出し、
  監査が示す修正版は4.2.1だった。一時requirementsはcleanup済み。
- 上流advisoryで修正版4.2.1を確認した:
  [POSIX ReadWriteLock](https://github.com/advisories/GHSA-v4x8-3wr5-3wq8)、
  [Windows ReadWriteLock](https://github.com/advisories/GHSA-9vhv-jxww-xfm5)、
  [Windows SoftFileLock](https://github.com/advisories/GHSA-567q-5qvw-pf92)。
- `uv lock --dry-run --upgrade-package filelock==4.2.1`: fresh成功、filelock1件だけの更新候補となった。
  lock SHA-256 `f32c30a740e361776ad851c771247bf75b90c0455a5cc4ea4d1647b0dce029d5` は実行前後不変。
  installed metadataはvirtualenvのfilelock<5,>=3.24.2とpython-discoveryのfilelock>=3.16.1で、候補と整合する。
- 上流4.0.0の互換変更はSoftReadWriteLockの永続形式など。repository内の直接利用は見つからず、
  installed virtualenv / python-discoveryはFileLockをimportする。ただし実動作の互換性は未検証。
- 必須audit失敗のためTask3検証とTask4は未完了。新lockの正式gate / 保守gate / 測定 / verifier /
  hosted CIは未実行であり、成功扱いしない。
- 提案: main起点の別change・別PRでfilelockだけを修正済み版へ更新する。4.2.1を候補に上流修正・互換性を確認し、
  コア監査、virtualenv / python-discovery / pre-commitの実動作、正式gateと独立review/verifierを検証する。
  AGENTS.mdのscope拡張規律とsafety.mdのmajor更新規律により、依存変更は利用者承認まで開始しない。
  承認・先行merge後に本branchへ取り込み、最終lockでbefore / after各3回と残りの受入を再開する。

#### Task 3 依存修正PRへの引継ぎ（2026-10-25）

- 利用者はfilelockのmajor更新と互換性検証を別change・別PRで行う方針を承認した。
  先行PRは [#94](https://github.com/shimi3435/ai-coding-template-ja/pull/94)、
  changeは `update-filelock-security-fixes`、branchは `fix/filelock-audit-october`。
- 上流差分確認により、4.2.1の修正に加えてFileLockの失敗回復修正を含む4.2.4を選択した。
  先行PRではfilelock以外のlock recordを保持し、コア監査と実consumerの排他・cache・並列環境生成、
  正式gate・独立review / verifierを確認済み。先行PRはpre-merge close済みで、
  最終HEAD `da21ea63e130a25c473322181f4fd6df03db5255` の全6 CI jobs成功を確認してreadyにした。
  通常・renameは各Python1529件、保守15件が成功。先行PRのmergeは利用者待ちである。
- 本branchのlockはまだ変更しない。利用者による#94 merge後にmainを取り込み、最終lockで
  before / after各3回、通常・保守gate、独立検証、hosted CI、pre-merge closeを再開する。
  Task3検証とTask4は未完了のままとする。

#### Task 3 最終依存修正merge後の再開（2026-10-25）

- 利用者指示によりPR #94をmergeした。mainは `50687105f1fc6a21992ddc1d90ca959a6cd023a9`。
  executor所有4文書のpath・digest一致とactive1・strict validation成功を確認し、mainを競合なくmergeした。
  sourceは `0c79d82`。最適化の実装は変更せず、filelock4.2.4を含むmainのlockを継承した。
- 最新lockの監査、通常・保守gate、before / after各3回、review / verifier、hosted CIを実行する。
  Task3検証とTask4は未完了を維持し、旧測定・検証を最新の成功として扱わない。
- commit / push / PR更新 / pre-merge closeは既存承認に従う。#94へのmerge指示を#92のmerge承認とは扱わない。

#### Task 3 最終lockのfocused検証と独立review

- source `0c79d82dbf3e039303d2a82f8c6f546b351201ab` と再開記録4文書。
  `uv sync --locked --group security`、`npm ci --ignore-scripts`、pinned parser setup、strict target / 全change validationはfresh成功。
- mainと両lockのbytes一致、corpus269件のbytes不変、移設8modulesの差分をself-reviewで確認した。実装findingなし。
- `pytest --no-cov -q tests/test_downstream_prune_contract.py tests/test_taskfile.py template-maintenance/tests/test_prune_corpus.py`:
  rootはfresh30 passed / 5.33秒。保守basedpyrightは0 errors、wall1.95秒 / 最大RSS333772 KiB。
  コアexport / pip-auditはfresh exit0、既知脆弱性0。一時requirementsはcleanup済み。
- `prune_post93_review` は新しいmerge後差分を独立確認してAPPROVE、blocker0。
  reviewerのfresh focused30 passed / 4.84秒、保守basedpyright0 errors、corpusと全test関数保持、lock一致を確認した。
  正式gate・保守gate・各3回測定・別verifier・hosted CIはこれから実行する。

#### Task 3 最終lockの正式gate・保守gateと各3回測定

- sourceはbefore `50687105f1fc6a21992ddc1d90ca959a6cd023a9`、after `0c79d82dbf3e039303d2a82f8c6f546b351201ab` と再開記録。
- review後の `./scripts/check.sh`: fresh exit0、Node638 passed、Python637 passed / 126 skipped、24.70秒。
  `task check:template`: fresh exit0、保守型検査0 errors、852 passed / 559.58秒。
  fresh/rename/prune/再setupの実統合を含む。coverage対象アプリmodule未importの既存warningだけで失敗・skipはない。
- before / afterをdisposable Git repositoryへ配置し、locked setupと正式prune後に直列測定した。
  afterのactive OpenSpecだけを出荷状態に合わせて除外し、setup / pruneは測定外、cache非flushとした。
  Node24.14.1 / Python3.14.6 / uv0.11.26 / Task3.51.1、同一Ubuntu amd64 host、LANG/LC_ALL=C.UTF-8。
  両treeのuv.lock / package-lock.jsonのbytes hashが一致し、全測定後も不変だった。
- `/usr/bin/time -f '%e %M' task check`: before3回ともfresh exit0。
  wall秒=266.54 / 244.26 / 219.95、最大RSS KiB=387032 / 386496 / 382620。
  各回Node638 passed、Python1403 passed / 126 skipped。
- 同commandのafter3回ともfresh exit0。
  wall秒=66.32 / 63.56 / 63.79、最大RSS KiB=343952 / 342268 / 344620。
  各回Node638 passed、Python637 passed / 126 skipped。
- 中央値: wall244.26→63.79秒（73.88%減）、最大RSS386496→343952 KiB（11.01%減）。
  before範囲219.95〜266.54秒、after範囲63.56〜66.32秒。明らかな悪化なし。
  保守専用テストの配布境界変更による効果であり、parser自体の高速化や他hostでの保証値ではない。
- before / afterのpruned `task doctor` はfresh exit0。disposable treesはcleanup済み。
  別verifier照合後に一時script・logをcleanupする。hosted CI / closeは未完了のままとする。

#### Task 3 最終lockの独立verifier（2026-10-26）

- `prune_post94_verifier`: ローカル受入APPROVE、blocker0。初回はusage limitで最終判定前に停止し、
  利用者の再開指示後の1回の再試行で完了した。sourceは `0c79d82` と再開記録、検証開始・終了の入力は不変。
- 証跡追記後の `./scripts/check.sh`: rootのfresh exit0、Node638 passed、Python637 passed / 126 skipped、19.08秒を
  同一入力として再利用した。保守integrationはtasks本文も読むため、保守gateは旧結果を再利用しなかった。
- verifierの `task check:template`: fresh exit0、保守型0 errors、852 passed / 509.13秒。
  focusedはfresh30 passed / 3.27秒、保守型0 errors、コアexport / pip-audit指摘0、doctor FAIL0 / WARN3。
- 移設8modulesの全test関数、corpus269件bytes、全6回の測定と両lock・環境・cleanupを独立照合した。
  中央値244.26→63.79秒、最大RSS386496→343952 KiBと整合する。
- 最新push後のhosted CIとlocale126件の実行、close後の最終HEADは未検証。Task3検証とTask4は未完了を維持する。

#### Task 3 最新hosted CIによる受入完了（2026-10-26）

- source `2bd07c95122710b4ca11cabf4aaa7aa770ef07b4`。CI run40206703004の5 jobsと
  Template maintenance run40206703005が全て成功した。依存監査のblockerは解消済み。
- 通常check / rename-smokeは各Node638、Python763、追加pinned Task probe11件が成功。
  ローカルでskipしたlocale126件もhostedで実行された。
- 保守型0 errors、852 passed / 546.30秒。再開記録を含む最新commitの入力で受入を確認した。
  Task3検証を完了とし、Task4のpre-merge closeへ進む。

### 4. change を close する

- 成果: 完了証跡とretrospectiveを保存してpre-merge closeする。
- 依存: 3。
- 対象:
  - `docs/template/retrospectives.md`
  - `openspec/changes/separate-prune-maintenance-regressions/`
- [x] 実装: 完了証跡とretrospectiveを記録する。
- [x] 検証: V08を完了しactive0を確認する。

#### Task 4 close準備（2026-10-26）

- PR #92のふりかえり1行を追加した。逃した欠陥は3件（self-review1 / review2）。
  型検査対象の欠落・公開CLI拒否の検証不足はreview、固定資産数の古い記述はself-reviewによる発見である。
  既存依存の脆弱性と実行基盤のusage limitは本changeで混入した欠陥として計上しない。
- self-reviewで件数、PR番号、実装と証跡の対応を確認した。6 artifactsをcommit履歴へ保存してから削除する。
- close metadataの独立diff review `prune_post93_review`: APPROVE、finding0。
  strict target validationと全change validationはfresh成功。PRと全6 CI jobsも独立確認した。
- close後のactive0、必要gate、別verifier、最終HEADのhosted CI、cleanupは未完了。
  Task4検証checkboxは未完了を保持し、削除後に確定する結果はPR本文へ記録する。
  全必須job成功までPR ready / 最終完了を宣言しない。

#### Task 4 最終完了の確認

- source `b6e65930933ea97c49f7b1de37ada7b163bfc7d4` のCI40207851869 / 保守CI40207851914は全6 jobs成功。
  通常・renameはNode638 / Python763 / Task probe11、保守型0 / 852 passed / 533.27秒。
  2026-10-27に確認し、active0・cleanup・PR readyまで完了した。上の未完了記録は当時の履歴である。

### 6. リリース必須gateの不足を修正する

- 成果: リリース対象commitで両gate成功と公開直前の再照合を必須化する。
- 依存: 4。
- 対象:
  - `docs/template/release.md`
  - `template-maintenance/tests/test_release_contract.py`
  - `openspec/changes/separate-prune-maintenance-regressions/`
- [x] 実装: 合意済みrelease手順と保守側の失敗伝播testを追加する。
- [ ] 検証: V12、独立review、正式・保守gate、別verifier、hosted CIを完了する。

#### Task 6 開始条件（2026-10-27）

- 利用者がP2の修正方針を承認し、修正を指示した。source `b6e6593`、開始時clean、同じPR #92で再開する。
- 直前の6 artifactsを履歴から復元し、完了済みtaskを保持してtask6→7を追加した。
  release.mdの公開bashブロックというtest seamと、公開操作の代替による検証は合意済みである。
- 通常gate・Taskfile・README・runtime・lockを変更しない。pruned測定入力は不変であり、測定は繰り返さない。
  既存のcommit / push / PR更新 / pre-merge close承認を継続する。PR mergeや実releaseは行わない。

#### Task 6 focused検証とself-review

- source `b6e65930933ea97c49f7b1de37ada7b163bfc7d4` と本cycle差分。active1、6 artifacts、
  PTD-5の全12分類、task6→7の依存・対象を確認し、strict target / 全change validationが成功した。
  Context7でGitの状態確認を照会し、使い捨てrepositoryで実際のcommit / status / tag操作を確認した。
- RED: 修正前の公開ブロックは保守gateを起動せず、失敗指定でもlocal remoteへtagを作成しexit0となった。
  両gate追加後は同testがGREEN。状態再照合の追加前はdirty / HEAD変更の2ケースがREDとなり、追加後にGREENとなった。
- `pytest --no-cov -q template-maintenance/tests/test_release_contract.py`: fresh12 passed。
  通常・保守gate失敗、正常公開対照、検証中dirty / HEAD / remote変更・remote照合失敗、
  local / remote既存tag、開始時dirty、必須一覧・実行例を確認した。
  公開先は全て使い捨てlocal bare remoteで、GitHub Releaseはstub。実ネットワーク公開は行っていない。
- Ruff format / check、保守basedpyrightはfresh成功。shell fixtureの行長違反は実装中に修正した。
- self-reviewで、追加testが既存保守module内に収まりmanifest追加が不要であること、公開ブロックを複製せず
  直接検証していること、通常gate・下流・runtime・lockに変更がないことを確認した。実装findingなし。
- 正式gate、保守gate、独立review / verifier、最新hosted CIはこれから実行する。

- independent reviewer `prune_release_review`: APPROVE、blocker0 / nit0。
  fresh focused12 passed / 0.49秒、保守型0 errors、Ruff check / format、strict validation、diff check成功。
  恒久2ファイルがprune対象であることと、性能再測定の非該当判断を独立確認した。

#### Task 6 project checksと独立verifier

- source `b6e6593` と本cycle差分。review後の `./scripts/check.sh` はfresh exit0、
  Node638 passed、Python637 passed / 126 skipped、17.32秒。
  `task check:template` はfresh exit0、保守型0 errors、863 passed / 423.86秒。
  coverage対象module未importの既存warningのみであり、保守テストに失敗・skipはない。
- 別agent `prune_release_verifier`: ローカル受入APPROVE、blocker0。
  両fullgateの入力・環境同一性を確認してgreen evidenceを再利用した。
  fresh focused12 passed / 0.63秒、保守型0、strict target / 全change validation、diff check成功。
- verifierの追加一時probeで通常gate実行不可exit126・保守gate利用不可exit127の公開停止も確認した。
  使い捨てrepositoryはcleanup済みで、実ネットワーク公開は行っていない。
- 最新hosted CI、Task7再close、close後の最終HEADは未検証。Task6検証checkboxはCI成功まで未完了を維持する。

### 7. 修正cycleをcloseする

- 成果: retrospectiveと最新受入証跡を保存し、active0と最終CIを確認する。
- 依存: 6。
- 対象:
  - `docs/template/retrospectives.md`
  - `openspec/changes/separate-prune-maintenance-regressions/`
- [ ] 実装: review発見1件を追記し、close前証跡を履歴保存する。
- [ ] 検証: close後active0・正式gate・独立verifier・最終hosted CI・cleanupを確認する。

## 開始時点

- 利用者はPR #91のmerge後、前回合意のリソース最適化へ進むよう指示した。
- source: `9db2f3366d4f2a4bd04fcb993144b54d36ebe102`、branch `perf/prune-maintenance-tests`。
- main側の既存未追跡ファイルと既存worktreeは変更せず、新しい専用worktreeを作成した。
- 旧レビューの179件は269件へ増加。追加されたGit/hardlink/version回帰を保持する。
- この時点では実装・性能測定・正式gateは未検証。
