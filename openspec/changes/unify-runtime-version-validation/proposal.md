# Issue #50: runtime version の受理契約を統一する

## Why
bootstrap、doctor、CLI preflightで、同じruntimeのsuffix、接頭辞、空白、標準エラーの扱いが異なる。
#52を含むmain `9904295c8f26cef4de1c30de79341912b889e8f5` を基点に、利用者が合意した正式版の契約へ統一する。

## What Changes
- Node.js 24、npm、Python >=3.14の形式・コマンド結果の判定を揃える。
- 各言語の実装を維持し、恒久的な共通fixtureと公開入口のテストで差を検出する。
- doctorは自身のPython、bootstrap / CLIはPATH上のpython3を検査する。
- 現行の最低対応版、.python-versionの既定値、既存の診断分類を維持する。
- 詳細仕様と穴の対応はdesign.mdおよびspecs/runtime-validation/spec.mdを正本とする。

## Impact
公開runtime preflight契約の変更。OSWF-5に従い独立review / verifierを実行する。
新しい依存、Node installer、配布境界（#51）、parser依存の変更（#77）、CIの再設計は含まない。
失敗時はbootstrapのsetupや導入処理に進まない。外部write、commit、push、PR作成は含まない。
