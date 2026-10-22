# Shell parser の既知コスト

PR #91 のレビューに対する計測記録。artifact 検証の再利用と batch 解析は別 change とし、
今回の修正は通常 runtime の固定入力・checksum 検証を省略しない。

## 再現方法

setup 済みの Ubuntu amd64、Node 24、Python 3.14 で repository root から実行する。

```bash
uv run --no-sync pytest template-maintenance/tests/test_shell_parser_cost.py -q -s
uv run --no-sync python template-maintenance/tests/test_shell_parser_cost.py
```

計測はテスト側で parse、artifact 検証、binary hash、parser subprocess を包み、終了時に元へ戻す。
scanner の構成判定と解析失敗はそのまま報告する。通常 gate / doctor / prune に計測処理は追加しない。
事前の artifact 確認1回と、走査後の空入力起動は scanner 集計の外で行う。

## 2026-10-20 の観測

source は `ee7a8d04cf0d8cd6727f4068646810b9f2866664` に本レビュー修正を加えた working tree。
Ubuntu 22.04.5 LTS x86_64、Node 24.14.1、Python 3.14.6、準備済み parser 4,607,728 bytes。
以下は各条件1回の観測であり、性能保証値ではない。

| 入力 | shell解析 / artifact検証 / binary hash / parser起動 | binary読取りbytes | scanner秒 | artifact検証秒 | binary hash秒 | parser起動＋解析秒 |
| --- | --- | --- | --- | --- | --- | --- |
| 最小fixture＋shell file 1個 | 各12 | 55,292,736 | 0.2203 | 0.0431 | 0.0337 | 0.0375 |
| 最小fixture＋shell file 8個 | 各19 | 87,546,832 | 0.2014 | 0.0609 | 0.0501 | 0.0303 |
| 実repository、bundled、解析失敗0 | 各395 | 1,820,052,560 | 3.1813 | 1.1533 | 0.9423 | 0.5119 |

空入力の起動＋解析中央値は、実repository測定後の16回で0.000980秒。
fixtureでは各3回の中央値が0.001306秒と0.001251秒だった。空入力でもparser初期化・AST出力・
pipe処理を含むため、純粋なprocess生成時間ではない。

binary hash秒はartifact検証秒に含まれる。scanner秒も下位区間を含むため、列を重複加算しない。
読取りbytesはhash対象の論理byte量であり、OS page cache を含む。物理disk I/Oの実測ではない。
fixtureの基礎11解析はTaskfileなどに由来し、shell fileを7個追加すると各呼出数も7増えた。
時間は負荷やcacheで変動するため、CIにはwall-clockの固定閾値を置かない。

## 後続changeの論点

1. scanner単位で検証済みidentity/pathを再利用し、binary読取り量を削減する。
2. 再利用中のartifact・固定入力変更をどう検出するかを定義し、破損・identity不一致時の拒否を維持する。
3. 空入力測定を目安にprocess起動コストを再測定し、必要ならstdin batch化を別途設計する。

保守CI全体の1,281.50秒はこの測定と環境・入力・繰返し回数が異なる。今回の単独scanner測定から、
保守CIの主因や最適化後の短縮時間は断定しない。preview / doctor / gate のoffline性と固定hash検証は
継続する。後続Issueは未発行であり、この記録を提案文の根拠とする。
