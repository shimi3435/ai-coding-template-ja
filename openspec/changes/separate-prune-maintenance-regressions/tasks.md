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

### 3. 実測・review・最終検証を完了する

- 成果: 効果と互換性を検証しreview findingを解消する。
- 依存: 2。
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
