# virtualenvの監査失敗を解消する

## Why
PR #85のhosted CIで、既存lockのvirtualenv 21.5.1に対するpip-auditが失敗した。runtime変更と独立した依存修正として先行mergeする。

## What Changes
- uv.lockのvirtualenvを修正版21.7.13へ更新する。
- virtualenvが要求するpython-discovery >=1.6への必要最小限の更新を含める。
- pyprojectの依存宣言、監査範囲、例外設定、runtime実装は変更しない。

## Impact
既定dev環境の推移依存の更新。OSWF-5の独立review / verifier、hosted CI成功、PR番号付きふりかえりとchange close後に先行mergeする。利用者はこの独立PRの作成・先行mergeを承認済み。
