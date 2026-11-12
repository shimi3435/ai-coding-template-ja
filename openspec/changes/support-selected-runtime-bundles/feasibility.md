# 固定版Genshijinのmetadata feasibility

文書種別: 検証記録。配布制約を実対象の暫定候補に適用できるかを確認する。
最終runtime closure、同梱許可、製品実装の成功を示すものではない。

## 固定入力と取得範囲

対象は `InterfaceX-co-jp/genshijin` のtag `v1.5.0`、commit
`909aceb18c85b2834e4664f0d01f7053c6cec988` である。
レビュー修正cycleの基点は `5b91fc3e4e4bc66c5c392f7ad2dc7f2d1b365945`。
2026-11-12、Node.js 24.14.1から `gh api` を呼び、次のmetadataをfresh確認した。

```bash
gh api repos/InterfaceX-co-jp/genshijin/releases/tags/v1.5.0
gh api repos/InterfaceX-co-jp/genshijin/git/ref/tags/v1.5.0
gh api 'repos/InterfaceX-co-jp/genshijin/git/trees/909aceb18c85b2834e4664f0d01f7053c6cec988?recursive=1'
```

releaseはdraft=false、prerelease=false、tag_name=v1.5.0だった。
tagはlightweightで、参照先type=commit、SHAは上記固定commitと一致した。treeはtruncated=falseだった。
blob本文のrequest、取得物の実行・import、host登録、vendorへの配置は行っていない。
この観測結果は将来のrelease／ref確認を省略するtokenではない。

## 暫定候補一覧

4 Skillsの各directory、hooks、`.claude-plugin`、LICENSE、READMEを広めの候補として照合した。
下表の25 pathsを本確認の正確な対象とする。directory単位の選択はこの調査で候補を集めるためだけに使い、
製品のbundle descriptorにdirectory／globを許す変更ではない。
installerや未採用host向けfileも含むが、実際の同梱を承認した一覧ではない。

| Path | Git mode | Bytes |
| --- | --- | ---: |
| `.claude-plugin/marketplace.json` | 100644 | 437 |
| `.claude-plugin/plugin.json` | 100644 | 1961 |
| `LICENSE` | 100644 | 1073 |
| `README.md` | 100644 | 24234 |
| `hooks/genshijin-activate.js` | 100755 | 6543 |
| `hooks/genshijin-config.js` | 100755 | 9015 |
| `hooks/genshijin-mode-tracker.js` | 100755 | 10312 |
| `hooks/genshijin-stats.js` | 100755 | 19266 |
| `hooks/genshijin-statusline.ps1` | 100644 | 2329 |
| `hooks/genshijin-statusline.sh` | 100755 | 1845 |
| `hooks/install.ps1` | 100644 | 1495 |
| `hooks/install.sh` | 100755 | 860 |
| `hooks/package.json` | 100644 | 25 |
| `hooks/uninstall.ps1` | 100644 | 1452 |
| `hooks/uninstall.sh` | 100755 | 886 |
| `skills/genshijin-commit/SKILL.md` | 100644 | 2935 |
| `skills/genshijin-compress/SKILL.md` | 100644 | 6104 |
| `skills/genshijin-compress/scripts/__init__.py` | 100644 | 738 |
| `skills/genshijin-compress/scripts/__main__.py` | 100644 | 30 |
| `skills/genshijin-compress/scripts/cli.py` | 100644 | 1614 |
| `skills/genshijin-compress/scripts/compress.py` | 100644 | 13563 |
| `skills/genshijin-compress/scripts/detect.py` | 100644 | 3740 |
| `skills/genshijin-compress/scripts/validate.py` | 100644 | 5479 |
| `skills/genshijin-review/SKILL.md` | 100644 | 2981 |
| `skills/genshijin/SKILL.md` | 100644 | 9639 |

## 確認結果と限界

in-memory assertion probeはexit 0だった。既存の `validateInstalledFilePaths` と
`validateInstalledTraversalPath` を呼び、Git metadata上の祖先・種別・mode・sizeを追加照合した。
これは未実装bundle decoderの試験ではない。

- 25 files、合計128,556 bytes、最大fileはREADMEの24,234 bytes。100 files／単一1 MiB／合計2 MiB以内。
- 必要な非root祖先directoryは8件、file込み33 entries、最大directory depthは3。500 entries／depth 32以内。
- 最大pathは45 bytes、最大segmentは25 bytes。既存のpath長・NFC・POSIX形式検証に成功した。
- 全候補は通常blob、祖先は全て040000のtree。path重複、祖先を含むASCII case-fold衝突、file／directory prefix衝突なし。
- Git modeは100644または100755であり、そのままfalse／trueへ宣言できる。LICENSEは100644でlegal fileの非実行条件も満たす。

この候補について、調べた配布制約との不適合は検出しなかった。
依存fileの参照先、追加package、legal本文とhash、実行時の到達性、host adapterとの接続は未検証である。
必要なfileがこの一覧で全て揃うとは主張せず、最終runtime closureと実行権限が実利用に足りるかは#74で判断する。
候補／配布制約／固定版を変更した場合は影響するmetadata確認をやり直す。
通常CIへlive取得を追加せず、製品の機構試験はsynthetic fixtureで行う。

参照: [固定commitのtree](https://github.com/InterfaceX-co-jp/genshijin/tree/909aceb18c85b2834e4664f0d01f7053c6cec988)。
