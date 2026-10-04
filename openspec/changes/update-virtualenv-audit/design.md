# 最小依存更新の設計

virtualenv 21.7.13はCIが報告した修正版の最大下限であり、PyPIで非yankとPython 3.14対応を確認した。新しい要求python-discovery >=1.6を満たすため1.6.0へ更新する。uv lockの対象package指定を使い、他packageのversionは保持する。ロックの解決・locked syncが失敗した場合は原因を確認し、無関係な更新を広げない。

根拠: [virtualenv release history](https://virtualenv.pypa.io/en/latest/changelog.html#v21-7-13-2026-09-18)、[PyPI metadata](https://pypi.org/pypi/virtualenv/21.7.13/json)、Context7で確認したuv lock --upgrade-packageの公式仕様。

コア監査はCIと同じuv exportの既定依存セットをpip-auditへ渡す。監査例外やignore-vulnは追加しない。locked sync、virtualenvによる一時環境作成、pre-commitと全体checkで互換性を確認する。extrasは既存の解決済みlockを保持し、実インストールは対象外。

## spec-holes
12分類を以下で監査した。未解決判断はない。

1. 空・ゼロ長・None: lock欠落・空はuv lock --checkで拒否する。
2. 境界値: virtualenv 21.7.13、python-discovery 1.6.0を使い、Python 3.14で検証する。
3. 重複・衝突: 全packageのname/version集合を比較し、2package以外の変更を拒否する。
4. 順序: 独立review、全体check、別verifier、hosted CI、closeと最終CIの順で先行mergeする。
5. 型・形式不正: TOMLとしてparseし、uv lock --checkとlocked syncで検証する。
6. エラー経路: 解決・インストール・監査失敗は完了にせず、監査例外で回避しない。
7. 冪等性・再実行: uv lock --checkとlocked syncでlock無変更を確認する。
8. 時刻・タイムゾーン: 脆弱性DBは実行時点の監査結果として記録し、恒久greenを保証しない。
9. 文字列: package名・version・hashはuv生成物を使う。
10. 数値: version比較はresolverに委ね、手書き比較を追加しない。
11. 巨大入力・リソース枯渇: 既存resolver / 監査の資源管理を維持し、新しい入力経路は追加しない。
12. 状態遷移: lock更新後にlocked syncし、close後active change 0とhosted CI成功を確認してmergeする。
