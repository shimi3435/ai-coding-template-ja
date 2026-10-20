# PR #91 review修正

## Execution Constraints

1. 最初の環境依存sliceでCI parity（Ubuntu amd64、Node 24、Python 3.14、Task 3.51.1、既存lock依存とparser）を確認する。
2. 仕様拡張、OSWF-5の停止条件、同じ環境・command・入力のinfrastructure failure 2回で停止・再計画する。
3. disposable fixtureと一時計測logはcleanupし、永続証跡は本tasksの要約と保守計測文書のみとする。

## Tasks

### T1: Hardlink保護
- 成果: 事前・各操作直前のhardlink拒否と対象外不変。
- 依存: なし
- 対象: `repo-tools/template_prune_plan.py`, `tests/test_template_prune_hardlinks.py`
- [x] 実装
- [x] 検証: hardlink回帰、既存plan/apply、runtime parity。
- 証跡（ee7a8d0 + working diff、fresh）: `uv run --no-sync pytest tests/test_template_prune_hardlinks.py -q -x` は修正前に対象外bytes変更を検出して失敗。修正後 `uv run --no-sync pytest tests/test_template_prune_hardlinks.py tests/test_template_prune_plan.py tests/test_template_prune_apply.py -q` は50 passed。Node 24.14.1 / npm 11.11.0 / Python 3.14.6 / Task 3.51.1。初回system Python 3.10のpreflight失敗はvenv PATHで解消。

### T2: Git変換と差分保護
- 成果: 対応改行変換・fileMode、非対応属性拒否、raw snapshot保護。
- 依存: T1
- 対象: `repo-tools/template_prune_plan.py`, `repo-tools/template_prune_apply.py`, `tests/test_template_prune_hardlinks.py`, `tests/test_template_prune_git.py`, `docs/reference/prune-template-assets.md`
- [x] 実装
- [x] 検証: clean CRLF、attributes、mode、未対応filter、対象内外差分、各操作直前保護。
- 証跡（ee7a8d0 + working diff、fresh）: CRLF clean checkoutで修正前のOID不一致を再現。`uv run --no-sync pytest tests/test_template_prune_git.py tests/test_template_prune_hardlinks.py tests/test_template_prune_plan.py tests/test_template_prune_apply.py -q` は67 passed。no-opのhardlink拒否を回帰テストで検出し、実際の編集集合だけを検査するよう修正。

### T3: 版契約
- 成果: 通常版規則のPython/TypeScript一致。
- 依存: T2
- 対象: `repo-tools/template_prune_state.py`, `repo-tools/repository-contracts.ts`, `repo-tools/repository-contracts.test.ts`, `tests/test_template_version.py`, `tests/fixtures/template_versions.json`, `tests/test_smoke.py`, `docs/reference/repository-contracts.md`, `docs/template/release.md`
- [x] 実装
- [x] 検証: 共通正常/異常ケース、Node gate、Python scanner/smoke。
- 証跡（ee7a8d0 + working diff、fresh）: 01.2.3の誤受理をPython/Node両方で修正前に検出。`uv run --no-sync pytest tests/test_template_version.py tests/test_smoke.py -q` は63 passed、`node --test repo-tools/repository-contracts.test.ts` は68 passed。共通ケース31件にはUnicode空行とBOMも含む。

### T4: Parser計測
- 成果: fixtureと実repositoryのコスト・既知制約の記録。
- 依存: T3
- 対象: `tests/test_shell_parser_cost.py`, `docs/template/parser-cost.md`
- [x] 実装
- [x] 検証: 計測回帰、実repository測定、artifact破損/identity変更の既存tests。
- 証跡（ee7a8d0 + working diff、fresh）: `uv run --no-sync pytest tests/test_shell_parser_cost.py tests/test_shell_parser_artifact.py -q -s` は28 passed。`uv run --no-sync python tests/test_shell_parser_cost.py` はbundled/successful、各395回、scanner 3.1813秒。内訳と再現方法は docs/template/parser-cost.md。最適化は未実施。

### T5: Reviewと全体検証
- 成果: self-review、OSWF-5 independent review、最新project checks、別verifier。
- 依存: T4
- 対象: `openspec/changes/fix-prune-review-boundaries/tasks.md`, `openspec/changes/fix-prune-review-boundaries/design.md`, `openspec/changes/fix-prune-review-boundaries/specs/prune-boundaries/spec.md`, `repo-tools/template_prune_plan.py`, `tests/test_template_prune_git.py`, `docs/reference/prune-template-assets.md`
- [x] 実装: self-reviewとindependent review、必要なfinding修正（cycle 2）。
- Diff review iteration 1: initial reviewerが元probe（clean/process両方・required=falseを含む）で拒否を確認。追加blockingなし。独立 `python -m pytest tests/test_template_prune_git.py -q` は24 passed。
- Self-review: 全diff・新規成果・直接呼出元を確認。focused checks / ruff / basedpyright / tsc成功。
- Initial review: P1 1件（filter=unset / filter=unspecifiedが状態名許可を迂回し外部filter実行）。修正iteration 1で解消。
- GREEN（ee7a8d0 + working diff、fresh）: `uv run --no-sync pytest tests/test_template_prune_git.py tests/test_template_prune_hardlinks.py tests/test_template_prune_plan.py tests/test_template_prune_apply.py -q` は75 passed。clean/process/driver未定義の同名literalを拒否し、実際の無効属性状態を許容。
- RED（ee7a8d0 + working diff、fresh）: `uv run --no-sync pytest tests/test_template_prune_git.py -q -k literal_filter -x` でpreviewのfilter実行を検出。
- [x] 検証: task check / ./scripts/check.sh、task check:template、OpenSpec validation、別verifier（cycle 2）。
- Project checks（ee7a8d0 + working diff、fresh）: `./scripts/check.sh`（内部で `exec task check`）は成功。Node 638 passed、Python 1521 passed、skipなし。ruff format/check、basedpyright、tscも成功。
- Integration（同入力、fresh）: `task check:template` は15 passed（856.31秒）。実fixtureでfresh setup/check/doctor、rename後check/doctor、offline preview/apply、prune後check/doctor/no-op、再setup後check/doctorを実行した。`node --test repo-tools/integration/repository-taskfile-gate.test.ts` は11 passed。
- 環境: Node 24.14.1 / npm 11.11.0 / Python 3.14.6 / Task 3.51.1、Ubuntu 22.04.5 LTS amd64。en_US.UTF-8はローカルの一時LOCPATHに生成し、locale検証467件もskipなしで成功。
- OpenSpec（ee7a8d0 + working diff、fresh）: `task openspec:validate` はexit 0、active change 1件 passed / 0 failed。`git diff --check` もexit 0。
- 再開時にfull gateの最終成功結果とsource変更時刻を確認。実装・tests・lockfile・設定はgate開始前のまま保持。別verifierが未対応encodingの拒否回避を検出したためsoft stop。hosted CIはcommit/push未依頼のため未実行。


- Verifier（ee7a8d0 + working diff、fresh）: `uv run --no-sync pytest tests/test_template_prune_git.py tests/test_template_prune_hardlinks.py tests/test_template_version.py tests/test_shell_parser_cost.py tests/test_shell_parser_artifact.py -q` は90 passed。`node --test repo-tools/repository-contracts.test.ts` は68 passed。repository外hardlinkの内容・inode不変も実probeで確認。
- **Blocker P2 / soft stop**: `repo-tools/template_prune_plan.py` の属性値判定は `working-tree-encoding=unset` / `working-tree-encoding=unspecified` の文字列値を無効状態と混同する。Gitは変換エラーをstderrへ出してもhash-objectがexit 0で生bytesのOIDを返すため、両方で `blockers=[] / apply_ok=True / changed=26` をverifierが再現した。未対応encoding拒否の受入条件未達。T5検証は未完了、change close禁止。
- 再開条件: 利用者が新cycleを承認した後、literal値の拒否・無変更と実際の `-working-tree-encoding` / `!working-tree-encoding` の許容を回帰テスト化し、修正、独立review、最新project checks、前cycleと別のverifierを実行する。今回のverifier指摘後はコード修正していない。
- Cleanup: 計測・checkの一時logとローカル生成localeは、要約を本tasksへ記録した後に削除する。再検証時のlocaleは `localedef -i en_US -f UTF-8 "$temporary_locale_root/en_US.UTF-8"` で一時directoryへ生成し、LOCPATHを設定する。


### Cycle 2（利用者承認済み）

- 2026-10-20の「ok」により新cycleを承認。再開時に19件のexecutor-owned path集合・type・mode・digest一致を確認した。
- 対応範囲は前verifierのencoding拒否漏れ。T1〜T4の完了状態は保持し、T5を修正・review・最新checks・別verifierから再実行する。
- `check-attr --all`で実際のunspecified状態（出力なし）と同名literalを区別する。残るencodingのunset衝突は、非空の合成入力をGitへ渡して、本来の無効状態では起きない変換診断を検出する。対象ファイルが空でも判定を省略しない。合成入力検査はexit 0でもstderrがあれば拒否し、target bytesの変換には進まない。
- filterのcommand単位無効化は維持し、合成入力でも独自filterは実行しない。正常な改行変換のwarningを過剰拒否しないよう、stderr必須空条件は合成入力の識別検査に限定する。
- RED（ee7a8d0 + working diff、fresh）: `uv run --no-sync pytest tests/test_template_prune_git.py -q -k literal_encoding -x` でencoding=unsetの拒否漏れを再現した。
- Focused（同入力、fresh）: `uv run --no-sync pytest tests/test_template_prune_git.py tests/test_template_prune_hardlinks.py tests/test_template_prune_plan.py tests/test_template_prune_apply.py -q` は83 passed。通常/空file、両literalの拒否・無変更、実際の無効状態のLF/CRLF成功を確認。ruff/diffcheck成功。
- Self-review: 変更した属性照会・合成入力・stderr判定と直接依存、spec-holes対応を確認。新しい未解決判断なし。cycle2 initial independent review成功。

- Independent review cycle 2: P2解消、追加blockingなし。空/非空×literal/実際の無効状態の8条件で対象bytes/index不変を独立probeで確認。`python -m pytest tests/test_template_prune_git.py -q` は32 passed。
- Project checks cycle 2（ee7a8d0 + working diff、fresh）: `./scripts/check.sh`（内部で `exec task check`）はexit 0。Node 638 passed、Python 1529 passed（174.85秒）、skipなし。ruff format/check、basedpyright、tscも成功。`node --test repo-tools/integration/repository-taskfile-gate.test.ts` は11 passed。環境は前cycleと同じruntime versionsで、今回生成した一時LOCPATHを使用した。
- OpenSpec cycle 2（同入力、fresh）: `task openspec:validate` はexit 0、1 passed / 0 failed。`git diff --check` もexit 0。
- Integration cycle 2（同入力、fresh）: `task check:template` はexit 0、15 passed（902.85秒）。fresh / rename / prune / 再setupと、各段階のcheck / doctor、offline preview / apply / 再実行を含む。再開時に全コマンドの最終exit 0とsource変更時刻を照合し、検証対象の追加変更がないことを確認した。
- Final verifier cycle 2（前cycleおよびinitial reviewerとは別担当）: PASS、追加blockerなし。前cycleのencoding拒否漏れは解消。全diff、新規仕様・tests・計測文書と受入条件を独立照合した。
- Verifier focused（ee7a8d0 + working diff、fresh）: `uv run --no-sync pytest tests/test_template_prune_git.py tests/test_template_prune_hardlinks.py tests/test_template_version.py tests/test_shell_parser_cost.py tests/test_shell_parser_artifact.py -q` は98 passed（25.79秒）。`node --test repo-tools/repository-contracts.test.ts` は68 passed。`git diff --check` はexit 0。
- Verifier実動作（同入力、fresh）: 独立probe 10条件で、属性macro経由のencoding literal/実際の無効状態×空/非空、repository外hardlink不変、encodingとfilter複合指定時の外部filter未実行・無変更を確認。`uv run --no-sync python tests/test_shell_parser_cost.py` はbundled/解析エラー0、各395回、論理読取り1,820,052,560 bytes、scanner 3.3717秒。今回の実装は計測のみで、性能最適化は行っていない。
- Verifierがcycle 2の最新入力の全体check成功証跡を再利用し、3コマンドのexit 0を照合した。cycle 1の全体check成功は今回のsource変更後へ再利用していない。hosted CIはcommit/push未依頼のため未検証。focused実行のcoverage警告はアプリ本体をimportしない対象によるもので、テスト失敗はない。
- 完了: T1〜T5の実装と指定検証が成功。実装完了時点ではcommit/push/closeを行わず、成果と検証要約を未コミットで保持した。独立probeの一時fixtureは削除済み。checkの一時logと生成localeも検証要約記録後に削除済み。
- 公開承認: 2026-10-21に利用者からcommitとpushの依頼を受けた。検証済み成果をPR #91の既存branchへcommit/pushする。change closeは今回の対象に含めない。

## 開始状態

- Source commit: ee7a8d04cf0d8cd6727f4068646810b9f2866664。
- 作業場所: PR #91の既存worktree ai-coding-template-ja-issue-51。開始時tracked/untracked差分なし。
- 元worktreeの利用者ファイル docs/template/issue-71-ownership-poc.md は対象外で変更しない。
- 仕様は会話で承認済み。commit/push/closeは今回行わず、未コミット成果と証跡を保持する。
