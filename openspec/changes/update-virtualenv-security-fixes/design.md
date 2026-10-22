# 設計

## 更新境界

baseはmain `9db2f3366d4f2a4bd04fcb993144b54d36ebe102`。PR #92とは独立したworktreeとbranchを使う。
`uv lock --upgrade-package virtualenv==21.14.9` で対象を指定し、他の既存pinを可能な限り維持する。
virtualenv21.14.9の配布metadataはpackaging>=26.3、python-discovery>=1.6.1を要求する。
旧pinはそれぞれ26.2 / 1.6.0のため、resolverが選ぶ26.3 / 1.6.4へ追従する。
必要な推移依存はresolverの制約を根拠として記録する。無関係な差分が発生した場合は採用せず原因を確認する。
pyprojectの公開dependency範囲、Python / Node baseline、package-lock、CIの監査除外は変更しない。

## 検証

コア監査はCIと同じlocked exportとpip-auditを使い、旧lockでのREDを確認した上で新lockのGREENを要求する。
生成環境のpython/pip実行、空白を含むpath、POSIX launcherのshell展開文字を含むpathを使い捨て領域で確認する。
検証payloadの副作用先は同じ一時領域内のsentinelだけとし、cleanupする。upstreamの全脆弱性テストは複製しない。
pre-commitは既存hookを実行する。self-review→独立review→最新正式gate→別verifier→PR/hosted CIを実行する。
close後の最新HEADも検証し、依存監査や未実施項目を成功扱いしない。

## 根拠と制限

- [CVE-2026-113722 / GHSA-c978-59m8-c77v](https://github.com/advisories/GHSA-c978-59m8-c77v) の修正版は21.14.9。
- [CVE-2026-113725 / GHSA-vxj4-q4g9-crj7](https://github.com/advisories/GHSA-vxj4-q4g9-crj7) の修正版は21.14.7。
- CIのpip-auditが報告した他3件の修正版は21.14.2 / 21.14.4であり、21.14.9を対象とする。
更新前に作成済みの生成環境を自動修復する機能や、後からpipが上書きするlauncherの修正は本changeに含めない。
