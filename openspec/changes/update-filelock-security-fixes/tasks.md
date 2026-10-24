# 実装タスク: update-filelock-security-fixes

## Execution Constraints

1. 最初のCI parity: Node24 / Python3.14 / locked環境で監査とconsumer実動作を最初のsliceで確認する。
2. 停止・再計画条件: AGENTS.md / workflowの条件を適用し、filelock以外の更新や必須検証失敗を完了扱いしない。
3. 一時artifact cleanup: 監査requirements、cache、環境、probe、logは一時領域へ置きcleanupする。

## Tasks

### 1. 最小lock更新とconsumer検証

- 成果: filelockだけを更新し、修正根拠と監査・実動作を確認する。
- 依存: なし。
- 対象:
  - `uv.lock`
  - `openspec/changes/update-filelock-security-fixes/`
- [x] 実装: 4.2.4へ選択更新する。
- [x] 検証: validation 1〜5の監査RED/GREEN、差分・consumer・上流修正を確認する。

#### Task 1 証跡（2026-10-24）

- source `2d311ad3c86afde8a7cff15a116797fd096d0def` と本change差分。開始時clean、active1、必須6 artifacts、
  全12分類の解決とtasks依存順を確認した。Node24.14.1 / Python3.14.6 / uv0.11.26 / Task3.51.1。
- Context7でfilelock4の互換変更を確認し、tag4.2.4のchangelogと3件のadvisoryを照合した。
  PyPI配布metadataのPython>=3.11 / 追加実行時依存なしと、実consumerの版制約・FileLock利用を確認した。
- 旧REDは同一main lockのPR #92 worktreeでfresh実行したコアexport / pip-audit exit1、filelock3.29.4の3件。
- `uv lock --upgrade-package filelock==4.2.4`、`uv sync --locked --group security`: fresh成功。
  TOML全record比較でfilelock1件だけの変更を確認し、lock metadata / 他packageは不変。
- 同じコアexport / pip-audit、`npm audit --audit-level=high`、`bandit -c pyproject.toml -r src -ll`: fresh成功、指摘0。
- 一時Python probe: FileLockのnested hold、別processのTimeout、解放後再取得、既存fileのbytes/mode保持、
  消滅cwdでのacquire失敗後のhold count回復がfresh成功。ReadWriteLockのsymlink拒否とsentinel不変も成功。
- python-discovery DiskCacheのlocked cold/write/warm/read、同一app-dataを使う空白pathの2環境並列生成、
  各生成pythonのsys.prefixとpip --versionがfresh成功。使い捨て環境・cacheはcleanup済み。
- 隔離PRE_COMMIT_HOMEで `uv run --no-sync pre-commit run --all-files`: fresh全8 hooks成功、cacheはcleanup済み。
- `npm ci --ignore-scripts`、pinned parser setup、strict target / 全change validationはfresh成功。
  lock SHA-256は `a4d2062860fca31e0def4585ef5ef2880a0d00d69a266133d6e7b6675bf841ac`。
- self-review: lock全差分と6 artifactsを読み、恒久変更がfilelockだけであること、監査scope / CI / public設定不変、
  各holeの検証接続と範囲外を確認した。実装findingなし。Windows / macOS / 別UID攻撃 / 全extras実機は範囲外の未検証。

### 2. 独立reviewとローカル受入

- 成果: reviewと全体gateを通過する。
- 依存: 1。
- 対象:
  - `uv.lock`
  - `openspec/changes/update-filelock-security-fixes/`
- [x] 実装: self-reviewと独立reviewを完了する。
- [x] 検証: validation 6の正式gate・別verifier・strict validationを完了する。

#### Task 2 review証跡

- sourceはbaseとstage済み7 files。`filelock_october_review`: APPROVE、blocker0 / nit0。
  fresh lock全比較・consumer制約・上流changelog/advisory照合、`uv lock --check` とコアaudit指摘0。
  一時consumer probeも独立fresh実行して全項目成功、開始/終了の入力は不変。
- 上流fix包含の追加照合: POSIX修正5e3f2ecとoplock修正e1e825bは4.2.4の祖先。
  Windows修正PR854のmerge SHAは祖先比較だけでは確認できなかったため、修正関数をreleaseと直接比較した。
  ACL判定・private link生成/削除の4関数はAST一致、接続関数の差分はoplock_wait=timeoutの追加だけで、修正機構の残存を確認した。
  これはsource確認でありWindows実機の成功とは扱わない。
- strict target / 全change validationとfocused文書contract63件はfresh成功。

#### Task 2 ローカル受入証跡（2026-10-25）

- source `2d311ad3c86afde8a7cff15a116797fd096d0def` と本change差分。
  `./scripts/check.sh`: fresh exit0、Node638 passed、Python1403 passed / 126 skipped、169.49秒。
  先行実行はtool終了コードと成功logが不整合だったため成功根拠に使わず、同じ入力で再実行してexit0を確定した。
- initial reviewerとは別の `filelock_october_verifier`: APPROVE、blocker0。
  正式gateは同一入力・環境を照合して上記green evidenceを再利用した。
  fresh consumer probe、lock全record比較、`uv lock --check`、コアexport / pip-audit指摘0、
  strict target validation、`task openspec:validate` 1 passed、diff checkも成功した。
- locale126 casesはローカル未導入によるskipであり、hosted CIでの結果を確認する。
  Windows / macOS / 別UID / 全extrasの実機動作はdesignの範囲外として未検証を維持する。

### 3. pre-merge closeと最終PR検証

- 成果: ふりかえり、active0、最終HEADのhosted CIを確認する。
- 依存: 2。
- 対象:
  - `docs/template/retrospectives.md`
  - `openspec/changes/update-filelock-security-fixes/`
- [ ] 実装: PR番号を確定し、ふりかえりとclose前証跡を保存する。
- [ ] 検証: validation 7のclose後gate・hosted CI・cleanupを確認する。

## 開始条件

- 2026-10-24利用者承認: 別OpenSpec・別PRでfilelock更新と互換性検証を行う。
- base `2d311ad3c86afde8a7cff15a116797fd096d0def`。専用branch `fix/filelock-audit-october`、開始時clean。
- PR #92のdirty再開記録と他worktreeは保持する。commit / push / PR作成は既存の依存修正方針の範囲で行う。mergeは利用者が行う。
- 旧REDは同一lockのPR #92 worktreeでfresh確認済み: export / pip-audit exit1、filelock3.29.4に3 CVE。
- 4.2.1は初期候補だったが、上流確認で4.2.2のFileLock回復修正などを確認し、同じ4.2系列の最新patch4.2.4を固定する。
