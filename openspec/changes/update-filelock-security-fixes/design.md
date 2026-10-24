# 設計

## 更新境界と版の選択

baseはPR #93 merge `2d311ad3c86afde8a7cff15a116797fd096d0def`。
専用worktreeとbranchで `uv lock --upgrade-package filelock==4.2.4` を実行し、他のpackage recordとlock metadataを保持する。
選択時点のPyPI最新安定版は4.2.4、Requires-Pythonは>=3.11、実行時の追加依存はない。
プロジェクトはPython>=3.14であり、virtualenv21.14.13はfilelock<5,>=3.24.2、python-discovery1.6.4は>=3.16.1を要求する。
監査が示す最初の修正版4.2.1だけで止めず、4.2.2の消滅cwdでのacquire失敗後のhold count修正、
4.2.3の終了時・symlink診断修正を含む同系列patch4.2.4を採用する。4.2.4自体はrelease notes整形の変更である。

## 互換性と実利用経路

4.0.0はSoftReadWriteLockの永続形式を変更し、旧版との混在で相互排他できない。
repositoryの直接利用はなく、コアconsumerのvirtualenvとpython-discoveryはFileLockを使う。
既存のSoftReadWriteLock利用者の状態移行や全extrasの互換性保証は本changeに含めない。
推移依存であるため、resolverが全lockを解決できることと、実際のconsumer動作を検証する。

FileLockのnested acquire / release、別processの競合timeout、解放後再取得を使い捨てpathで検証する。
既存lock fileを破壊しない変更と、消滅cwdで失敗した後の相対path lock再利用も確認する。
python-discoveryのdisk cacheをcold / warmで利用し、同じvirtualenv app-dataを使う並列環境生成と、
生成python / pip実行、既存pre-commit全hookを確認する。空白pathも含める。

## セキュリティ証跡と限界

監査GREENだけで修正済みと判断せず、上流advisory・release差分と対象版を照合する。
Linux上ではReadWriteLockのsymlink拒否を一時領域で確認し、被参照fileのbytes不変を確認する。
Windowsのoplock / ACL、別UIDによる攻撃、macOS / NFS / SMBは本changeの実機検証対象外であり、未検証と明記する。
上流の全脆弱性再現器をrepositoryへ複製しない。Linuxで使用するFileLockの実動作とhosted Ubuntu CIを必須にする。
既存環境のロック所有者を停止・削除したり、利用者のcacheを一括削除したりしない。

## 受入とclose

self-review、OSWF-5の独立review、最新正式gate、別verifierを順に実行する。
strict validationとローカル受入の完了後、ふりかえりとtasksをcommitして履歴へ保存し、change directoryを削除する。
削除後のactive0と必要gateを確認し、最終HEADのhosted CI全job成功を確認するまでPRをreadyにせず完了と宣言しない。
削除後に初めて確定するCI結果はPR本文へ記録する。失敗なら未完了として再開条件を残す。

## 一次資料

- [POSIX ReadWriteLock](https://github.com/advisories/GHSA-v4x8-3wr5-3wq8)
- [Windows ReadWriteLock](https://github.com/advisories/GHSA-9vhv-jxww-xfm5)
- [Windows SoftFileLock](https://github.com/advisories/GHSA-567q-5qvw-pf92)
- [4.0.0の互換変更](https://github.com/tox-dev/filelock/releases/tag/4.0.0)
- [4.2.4時点のchangelog](https://github.com/tox-dev/filelock/blob/4.2.4/docs/changelog.rst)
- [配布metadata](https://pypi.org/pypi/filelock/4.2.4/json)
