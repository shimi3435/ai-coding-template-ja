# 設計: prune テスト配布境界

文書種別: 仕様リファレンス。前回合意の「保守専用回帰を下流から除去」を実現する。

## 1. 現在との差分

base は PR #91 merge `9db2f3366d4f2a4bd04fcb993144b54d36ebe102`。
references corpus は旧レビューの179件ではなく269件、protocol corpus は12件である。
merge 前の追加修正で Git境界 / hardlink / version 検査と parser cost 計測が加わった。
これらの修正を取り消さず、回帰検証を移設する。parser artifact の公開準備契約は通常側に残す。

## 2. 移設と保持

次の8 test modules は同名で `tests/` から `template-maintenance/tests/` へ移す。

- `test_template_prune_apply.py`
- `test_template_prune_plan.py`
- `test_template_prune_state.py`
- `test_template_prune_diagnostics.py`
- `test_template_prune_git.py`
- `test_template_prune_hardlinks.py`
- `test_template_prune_tokens.py`
- `test_shell_parser_cost.py`

`tests/template_prune_fixture.py` は保守専用 helper と共通 helper へ責務分離する。
保守 helper は `template-maintenance/tests/template_prune_fixture.py`、共通 helper は
`tests/downstream_repository_fixture.py` とする。共通 helper は実 runtime の配置と最小構成生成だけを担い、
corpus を import / 読取りしない。共通 CLI smoke に必要な bundled fixture の生成は維持する。

`references.json` は `template-maintenance/fixtures/prune/references.json` へ移す。
既存269件の id / source / expected / coverage を変更しない。schema validator は保守側へ移し、
通常 runtime の検証済み surface 判定を利用する。payload は実行しない。
`tests/fixtures/template_prune/protocol.json` と `repo-tools/template-prune-result.test.ts` は
公開 JSON contract の共通入力として残す。`tests/test_shell_parser_artifact.py`、
`tests/test_template_version.py`、`tests/test_smoke.py`、`tests/test_setup_mcp.py` も共通側に残す。

## 3. manifest と runtime

旧 K05 は KEEP_FILES から除去し、新規保守pathを MAINTENANCE_FILES / DIRECTORIES に列挙する。
旧 K05 の欠落・不正schemaは通常 runtime の構成エラーにしない。保守 corpus の存在・型・非空は
他の固定保守資産と同じく bundled 構成の検査対象だが、JSONの意味検証は保守 gate に限定する。
pruned では corpus / helper / 保守 test modules が存在しなくても通常 check / doctor / preview / no-op が成立する。
既に旧形式で prune 済みの利用者の残存 corpus は本 change の自動削除対象に追加しない。
更新済みテンプレートから新規に prune する配布経路を対象とし、既存下流のmigrationは範囲外とする。
参照走査の surface・分類・エラー伝播、公開 CLI / JSON、Git・hardlink 保護には触れない。

## 4. gate / 文書

`task check` の pytest testpaths=tests を維持する。
`task check:template` は保守 tests directory を明示収集し、既存3 modulesと移設8 modulesを含める。
保守gateは `uv run --no-sync basedpyright template-maintenance/tests` をpytestより先に実行する。
静的importの探索先として `pyproject.toml` のextraPathsにrepo-toolsだけを追加する。
明示directory指定で既存のbasic/Python3.14型設定を継承し、通常includeは変更せず全repositoryの重複型検査を避ける。
対象は移設8modules、新規helper、既存保守testsを含む全Pythonファイルとする。
型検査・corpus schema・収集失敗を skip 成功にしない。保守 gate から通常 gate を再帰起動しない。
既存 full lifecycle test の disposable repository 内に限る正式 gate 実行は維持する。
保持文書から削除予定の corpus へのリンクを除き、契約本文を恒久 reference に残す。
`docs/template/parser-cost.md` の現行再現コマンドだけを移設先へ変更する（過去観測値は保持）。

## 5. 測定と受入

同一host / Node / Python / lock / locale、直列、準備済みの disposable pruned repository で
`/usr/bin/time -f '%e %M' task check` を変更前後各3回実行する。wall秒と最大RSS（KiB）、
中央値・範囲・pytest件数を記録する。setup / prune の時間は含めず、cacheを強制flushしない。
最大RSSはtimeが報告するprocess系指標で、全子processの同時メモリ総量とは呼ばない。
旧 / 新のテスト内容が異なるため、時間差をparserそのものの改善と解釈しない。
速度向上率・固定wall-clock閾値をCI要件にはしない。全3回のafterがbefore範囲を上回る等、
明らかな悪化なら環境差を確認して利用者へ採用判断を戻す。未実施や失敗の測定を成功に数えない。
Node / parser / Git 起動数、doctor / preview / apply の性能比較はこのテスト分離changeでは測定対象外とする。

## 6. review と非目標

review 発火条件は AGENTS.md OSWF-5 を参照する。独立 reviewer / 別 verifier を実施する。
全 regression の移設前後対応を確認し、fixture 269件は両構成の判定を保持する。
通常チェックが旧 K05 や保守 helper を必要としないことを実際にpruneしたtreeで確認する。
プロセス削減・解析のcache/batch化・apply再検証削減・review policy変更・依存更新は行わない。

## 7. 外部レビュー修正cycle（2026-10-22合意）

通常gateの構文エラー代表1ケースは、corpusなしのpruned Git fixtureで、analysis_errors非空、
successful=False、解析失敗由来のplan blocker、実CLI applyの非ゼロ、ファイルとindexの不変を確認する。
正常入力の対照を先に確認し、Git未初期化やdependency不足による偶然の拒否を成功にしない。
保守helperには依存せず、詳細な組合せ回帰は保守側に維持する。
旧K05は新規pruneで配布されず、既存下流では自動削除しないこと、手動整理前の独自参照確認、
自動migrationは必要時に別Issueで扱うことをrelease notesと保持referenceに明記する。
修正後のpruned task checkは3回再測定する。beforeの環境・依存・測定条件の同一性が不明ならbeforeも
再測定する。保守型検査の時間・最大RSSは別に記録し、旧after値を修正後の結果として流用しない。

## 8. 依存修正merge後の再開（2026-10-24）

PR #93 merge `2d311ad3c86afde8a7cff15a116797fd096d0def` を新しい比較baseとする。
同PRの最終lockはvirtualenv21.14.13 / packaging26.3 / python-discovery1.6.4である。
本changeでは追加の依存更新を行わず、merge済みmainのlockをそのまま継承する。
旧lockによる測定値は履歴として保持し、新lockでbefore / after各3回をfresh測定する。
通常・保守gate、監査、独立review / verifier、hosted CIを更新後の入力で確認する。

## 9. filelock修正merge後の最終受入（2026-10-25）

PR #94 merge `50687105f1fc6a21992ddc1d90ca959a6cd023a9` を最終比較baseとする。
filelock4.2.4を含むmainのlockをそのまま継承し、本changeでは依存を変更しない。
beforeは同baseの出荷tree、afterは本branchの出荷treeを使い、同一host・lock・実行環境で各3回をfresh測定する。
過去のgate・測定は履歴として保持し、最新入力の正式gate・保守gate・監査・review/verifier・CIを確認する。

## 10. リリース必須gateの補完（2026-10-27承認）

外部reviewでrelease.mdの必須手順が通常gateだけを要求していたP2を確認した。
同じPR / changeの新cycleとして、release.mdの必須条件・実行例・公開用bashブロックへ
`./scripts/check.sh` と `task check:template` の両方を追加する。通常gateや下流へ詳細回帰を戻さない。
リリース用の清潔なcommitをブロック内で取得し、両gateの後に作業tree・HEAD・live remote mainを
再照合してからtagを作る。失敗・未導入・途中の変更・照合不能は非成功として公開へ進めない。
両gateの実行中もcheckout / commit / ファイル変更とmainへのmerge / pushを行わない運用を明記する。
一時変更を元へ戻す等の並行操作を完全に排除するsandboxやrelease lockの実装は範囲外とする。
既存のtag衝突・部分完了からの再開手順は維持する。hosted CIのSHA照合を新しいリリース条件にしない。

合意済みtest seamはrelease.mdの公開用bashブロックをそのまま実行する境界である。
使い捨てGit repositoryとlocal bare remoteで実Gitを使い、品質gateと外部公開操作だけを代替する。
各gate失敗でtag / push / Release作成が始まらないこと、両gate成功の対照、gate後のdirty / HEAD / remote変更の
拒否を検証する。実ネットワーク公開は行わない。テストは既存の保守test_release_contract.pyへ追加する。
新しいmanifest対象は増やさない。変更pathはprune時に除去され、pruned測定入力は不変のため再測定は不要。
