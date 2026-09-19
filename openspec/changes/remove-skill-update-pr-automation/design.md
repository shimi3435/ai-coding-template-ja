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
