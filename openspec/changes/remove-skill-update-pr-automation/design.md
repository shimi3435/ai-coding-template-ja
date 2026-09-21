# 設計

## 決定

撤去の単位は機能の所有責務とする。automation subtreeはcandidate、publish、finalize、recovery、journal/receipt、workflow、human smokeを含めて削除する。逆importがないことを確認し、共通updaterは変更しない。専用YAML/permission/doc marker validatorとそのfixturesを除去し、残るTaskfile構造解析・SemVer解析はそのまま使う。

通常checkは既存のtop-level Node testsとoffline skills:verifyを継続する。automation test globだけを除去する。CIのcheckとrename-smokeは既にtask checkへ委譲しているため、その同等性を既存Python testsと実行で検証する。存在しなくなった機能のために新しい恒久validatorは作らない。既存repository-contracts fixtureをautomationなしにし、旧CLIがusage/exit 2で拒否される回帰testを追加する。

## 保護境界

元worktreeの利用者所有 `docs/template/issue-71-ownership-poc.md` は読み取りだけとし、SHA-256 `392fe2e3395ffbaa8836e41bf1ae10b5df6f83d791d3918b8d450f1ec554c144` を維持する。
独立worktree `../ai-coding-template-ja-issue-75`、branch `fix/issue-75-remove-skill-update-prs` で作業する。既存worktreeを切替・stash・復元しない。

移行では人が対象repositoryを確認し、旧workflow無効化、queued/in-progress run取消・停止確認、旧resource棚卸し、撤去反映、手動更新の順に進む。variableをfalseにするだけではworkflow_dispatchや進行中runを止められない。run停止を確認できなければ先へ進まない。
既存PR、tracking issue、journal、branch、artifactは自動cleanupしない。PRやbranchの利用者変更を精査・保全した上で人が通常運用へ引き継ぐ。不明な所有者・状態は保持する。組織共有設定/credentialは一括削除しない。新tokenも不要。
新しい作業コピーで既存updaterを手動実行し、失敗したコピーの差分を持ち込まない。隔離コピーはOS sandboxではない。transaction/rollbackやlocal lockは#76まで現状維持する。

## Validation

初回にlocked dependencyを準備し、runtime preflightとtask checkを実行する。focused testsはrepository-contracts、残存skill-updater、Taskfile/CI契約。実動作はskills:verify、旧CLI拒否、offline隔離check、使い捨てコピーでrename apply後task check。
source/tests/dependency/CI入力が変わった場合にだけ必要な全体checkを再実行する。
外部writeの実行は不要であり、移行手順の静的reviewとCLIの副作用なし拒否で境界を検証する。実hostでの停止とWSL実機は対象外・未検証として記録する。
OpenSpec CLIが利用可能ならstrict validationとrepository gateを行う。未導入の場合はMarkdown fallbackを使う。

## Open Questions

なし。削除の承認は#71、#75と今回の利用者指示で確定済み。

## Correction cycle 2

guide §4のCI説明を実際のTaskfileの残存構成と一致させる。検証一覧の正はTaskfileのcheckとし、現行説明から専用automation testsとcandidate validate jobを除去する。
回帰検査は既存tests/test_tool_neutral_documentation_contract.pyに追加し、§4だけを対象に空白・改行・backtick・英字大小の表記差を正規化して既知の旧機能の表現を検出する。§7の撤去手順とhistorical文書は対象外。新しいvalidatorやrepository全体の禁止語ルールを追加しない。
README・guide・agents文書の現行説明は、表記揺れを含む検索と目視でも再確認する。過去のレビューとverifierはこの文書不整合を見逃していたため、以前のPASSを今回の修正完了の代用にしない。
ふりかえりはclose後・merge前のreview発見として計1件、review=1、merge後=0とする。
今回の変更は文書と静的testだけで、runtime/updater/CI/rename経路を変更しない。cycle 2ではRED/GREEN、focused documentation/Taskfile/CI tests、最新task checkとOpenSpec gateをfresh実行し、独立reviewと前cycleとは別のverifierを実施する。隔離checkと実renameの再実行は変更に対応する新しい検証観点がないため必須に追加しない。cycle 1の結果は当時の証跡として保持する。

## Correction cycle 3

ADR-0011のStatusに部分改訂への参照を明示し、直後のAmended in part byで#71/#75へリンクする。#64の任意提供/opt-in/prune方針とplugin更新PR統合案は撤回されたと記載し、現在の手動更新・撤去手順へリンクする。文脈以降の当時の本文はbyte単位で保持する。新ADRの作成や他の責務境界の改訂は行わない。
既存documentation contractで冒頭の部分改訂・撤回範囲と履歴本文の代表記述を検証する。恒久CIを過去commitや削除するOpenSpecへ依存させない。本文全体の不変は今回のdiff/probeで確認する。
PR番号は推測しない。修正・focused検証・独立review後にレビュー可能なcommitをpushし、mainへのDraft PRを作成する。その戻り値から番号を取得し、ふりかえりを規定形式へ更新する。番号反映後の最新task checkと別verifierが成功してからclose・pushし、最終headのGitHub checksを確認する。取得失敗・PR作成失敗時は再取得で実在状態を確認し、重複PRを作らずcloseを保留する。
