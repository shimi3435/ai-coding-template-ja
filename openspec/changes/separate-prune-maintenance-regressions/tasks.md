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
- [ ] 検証: V06〜V07、同一環境のafter3回、正式gate、保守gate、hosted CI、別verifierを完了する。

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

### 4. change を close する

- 成果: 完了証跡とretrospectiveを保存してpre-merge closeする。
- 依存: 3。
- 対象:
  - `docs/template/retrospectives.md`
  - `openspec/changes/separate-prune-maintenance-regressions/`
- [ ] 実装: 完了証跡とretrospectiveを記録する。
- [ ] 検証: V08を完了しactive0を確認する。

## 開始時点

- 利用者はPR #91のmerge後、前回合意のリソース最適化へ進むよう指示した。
- source: `9db2f3366d4f2a4bd04fcb993144b54d36ebe102`、branch `perf/prune-maintenance-tests`。
- main側の既存未追跡ファイルと既存worktreeは変更せず、新しい専用worktreeを作成した。
- 旧レビューの179件は269件へ増加。追加されたGit/hardlink/version回帰を保持する。
- この時点では実装・性能測定・正式gateは未検証。
