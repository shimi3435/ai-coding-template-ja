# 設計

## 更新境界

新cycleのsourceはPR #93 HEAD f1219718be3540d9a6ca4c630109903cc7e5b9f5。
既存の専用worktreeとfix/virtualenv-audit-october branchを使用する。開始時clean。
`uv lock --upgrade-package virtualenv==21.14.13`を使用し、全package recordとlock metadataを比較する。
2026-10-24のPyPI配布metadataで21.14.9と21.14.13の依存条件は同一。
既存packaging 26.3 / python-discovery 1.6.4は条件を満たすため、再解決しても更新を強制しない。
無関係なpin変更、互換性問題、追加の仕様判断は停止して再計画する。

## 修正根拠と限界

- [公式変更履歴](https://virtualenv.pypa.io/en/latest/changelog.html)は21.14.10の一時app-data修正と21.14.13のprompt状態遷移修正を記載している。
- [上流PR #3437](https://github.com/pypa/virtualenv/pull/3437)はtransient app-dataの場合にseedのsymlink指定を無効化する。
- [上流PR #3466](https://github.com/pypa/virtualenv/pull/3466)はbashのPS1値を初期状態にかかわらず両展開段階に対応してescapeする。
- 2026-10-24のGHSA-4f8h-vr72-p32c / GHSA-cx6f-vjhg-g3cc公開ページ取得は404。
  公式変更履歴には後者のIDがあるが、advisory本文、CVE番号、完全な影響範囲、公開日は未確認。
- 同日のPyPI JSONで21.14.9 / 21.14.13のvulnerabilitiesは空。pip-audit成功との不一致の原因は未特定。
- 上流差分、配布物の版・hash・該当実装、実動作probeを照合する。根拠不足なら停止する。
  監査GREENを全脆弱性不存在の保証とせず、確認した修正と結果だけを記録する。

## 一時probe

旧版で再現し、新版で同じprobeを実行する。副作用はTemporaryDirectory内のsentinel作成だけに限定する。
一時app-dataは通常ファイル配下をcacheに指定してfallbackを発生させ、環境変数または設定ファイル経由で
symlink seedを要求する。transientであることとcache削除を確認後、生成pythonとpipを実行する。
bashは空白・command substitution・backtick・backslashを含む環境名と明示promptを対象とし、
promptvars無効でactivate後に有効化、posix移行、exportしたPS1を継承する子shellで実際にpromptを描画する。
source成功だけでは合格としない。起動設定を隔離し、sentinelが作成されずpython/pipが動くことを確認する。
既存launcher probeと隔離PRE_COMMIT_HOMEでの既存全hookも確認する。
probeを恒久CIへ追加せず、実行条件・結果をtasksへ、close後の要約をPR本文へ記録してcleanupする。
upstream全テストの移植、全shell/OS保証、既存環境修復、後続pipによるlauncher上書きは範囲外。

## 完了と公開

OSWF-5に従いself-review、initial review、必要な修正、最新正式gate、別verifierを順に行う。
正式gateは対象branchのAGENTS.mdに従い`./scripts/check.sh`とし、その内部で`task check`も実行する。
commit / push / PR本文更新の具体的な差分と文面を準備してから、未承認の外部反映を確認する。
公開後にCIとTemplate maintenanceを確認する。pre-merge close後も最終HEADで成功を確認する。
未実施のHosted CIをローカル検証や旧HEADの成功で代用しない。

## 別Issue候補（未発行）

件名: セキュリティ更新時の脆弱性データソース補完を検討する
本文案: PR #93ではpip-auditの成功だけでは上流の追加修正を把握できなかった。
対象advisory・修正版との照合方法、データソース間の収録差と反映時期、補完監査の保守負担を調査し、
必要な恒久対応を別changeで判断する。現時点で見逃し原因をDB反映遅延と断定しない。
