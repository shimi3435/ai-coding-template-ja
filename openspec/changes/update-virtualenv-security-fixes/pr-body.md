# PR #93 本文更新案（外部反映前）

コア依存監査が旧virtualenv 21.7.13で失敗していたため、virtualenvを21.14.13へ更新します。
当初の更新先21.14.9には上流の追加修正が未反映でした。最終候補は、一時app-data削除後のseed利用と
bash promptの状態遷移に対応する修正を含む21.14.13です。
PR全体でpackaging 26.2→26.3、python-discovery 1.6.0→1.6.4が必要な推移更新です。
今回の21.14.9→21.14.13再解決では、両者は同じ依存条件を満たすため維持しました。
恒久差分はuv.lockとふりかえり1行です。

## 修正根拠と確認限界

- [公式変更履歴](https://virtualenv.pypa.io/en/latest/changelog.html)と
  [一時app-data修正 #3437](https://github.com/pypa/virtualenv/pull/3437)、
  [prompt修正 #3466](https://github.com/pypa/virtualenv/pull/3466)を照合しました。
- PyPI配布metadata、wheel SHA-256、配布wheel内の修正実装2箇所を確認しました。
- 2026-10-24時点で提示されたGHSA 2件の公開ページは404でした。
  公式変更履歴はGHSA-cx6f-vjhg-g3ccを記載していますが、advisory本文、CVE番号、完全な影響範囲、公開日は未確認です。
- pip-auditの成功は対象データソースでの検出0を示す結果です。全脆弱性の不存在を保証しません。
  上流修正と監査結果が一致しない原因は未特定です。

## 検証

source: f1219718be3540d9a6ca4c630109903cc7e5b9f5 + 今回の変更。以下はfresh実行です。

- locked sync/export、CI同一pip-audit、npm audit、bandit成功。監査指摘0。
- 一時probeは21.14.9で8ケースRED、21.14.13で同じ8ケースGREEN。
  環境変数/設定ファイルによるsymlink seed要求と一時cache削除後のpython/pip動作を確認しました。
  環境名/明示promptに空白・command substitution・backtick・backslashを含め、
  promptvars有効化、posix移行、PS1継承先の子shellで実際にpromptを描画しました。
  新版でsentinel生成なし、生成python/pipは正常動作しました。
- 隔離PRE_COMMIT_HOMEで既存全8hook成功。OpenSpec strict validation成功。
- self-review、独立review、別verifierはいずれもblocker0。verifierはprobeとコア監査をfresh再実行しました。
- `./scripts/check.sh`（内部の`task check`を含む）成功。Node638 passed、Python1403 passed / 126 skipped。
  skipはローカルのen_US.UTF-8未導入による非C locale追加検証です。Hosted CIで確認します。
  初回はhost Python3.10が選ばれて失敗しましたが、既存.venvのPython3.14をPATH先頭に置き再実行して成功しました。
- 一時probe、生成環境、requirements、hook cache、配布wheelとlogはcleanup済みです。
- 更新HEADのHosted CIとTemplate maintenanceは未確認です。旧HEADの成功を代用しません。
- OpenSpec changeは再開中です。Hosted CI確認とpre-merge close、close後の最終HEAD検証が残っています。

## 範囲

公開設定、CI、監査範囲・ignoreを変更しません。既存環境の自動修復や後続pip操作によるlauncher上書きの防止は対象外です。
監査データソースの補完は別Issue候補として提案し、本PRに監査基盤の改修を追加しません。
PR #92とは独立した修正です。mergeは利用者が行います。
