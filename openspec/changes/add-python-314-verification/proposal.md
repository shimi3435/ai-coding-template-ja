# Change: Python 3.14 を CI 検証線に追加（backlog #15 消化）

## Why

requires-python `>=3.12` は 3.14 を範囲上許容するが、CI 検証線は 3.12 / 3.13 まで
（prepare-v1-release でスコープ外とし post-1.0 判断と記録・backlog #15）。3.14 は
2025-10 リリース済みで、3.15 リリース（2026-10 予定）が近づくほど「許容だが未検証」の
乖離が広がる。ローカル実測（2026-07-11）で 3.14 の green を確認済みのため、判断材料が
揃った今、検証線を 3.14 へ拡張する。

実測結果（uv 管理 cpython-3.14.6・クリーンな local clone・`.python-version` を 3.14 に
整合させた CI 同条件）:

- `uv sync --locked` 成功（lock は 3.14 で解決可能）
- ruff format --check / ruff check / basedpyright / pytest 全 green（28 passed）
- `uv sync --all-extras` ＋ import smoke（numpy 2.5.0 / pandas 2.3.3 / jupytext 1.19.4）green

## What Changes

1. **ci.yml `check` job の matrix に `"3.14"` を追加**: `["3.12", "3.13", "3.14"]`。
   - 引用符付き文字列で追記（YAML の float 化ハザード回避・既存形式踏襲）。
   - CI コスト増は check +1 ジョブのみ（uv キャッシュ有効・許容と判断）。
   - 3.14 で依存解決不能・テスト赤になる将来変更で CI が落ちるのは検出＝正常動作。
   - doctor の pin / 実行系整合は既存の「Align .python-version to matrix」ステップが
     matrix 値をそのまま pin に書く経路で 3.14 でも成立（上記実測で確認済み）。
2. **extras-smoke.yml の matrix に `"3.14"` を追加**: 検証線の主張（>=3.12 で導入手順が
   壊れていない）は extras にも及び、workflow_dispatch 専用のため push / PR の CI コスト
   増はゼロ（prepare-v1-release の 3.13 追加と同じ根拠）。
3. **pyproject.toml の requires-python 直上コメント更新**: 「CI 検証済みは
   3.12 / 3.13 / 3.14・3.15+ は範囲上許容するが未検証（リリース後判断）」へ更新
   （検証済み集合を明示列挙し、暗黙の範囲拡大を防ぐ意図記録の維持）。
4. **docs/template/release.md の版列挙を owner 参照へ**: extras-smoke の説明が
   「3.12 / 3.13 matrix」と版を再掲しており本 change で stale になる（self-review 検出）。
   版の列挙をやめ「対象版は同ファイルが正」に変える（SoT 境界の既存ガードレール:
   事実は owner 参照・再掲禁止。ADR-0007 と同方針）。

## Non-goals / スコープ外（spec-holes フェーズ 1 反映）

- **Python 3.15+**: 未リリース（2026-10 予定）。リリース後に同じ手順（ローカル実測 →
  matrix 追加判断）で対応する。requires-python の上限明示はしない（検証済み集合の
  コメント列挙で代替・prepare-v1-release の方針踏襲）。
- **rename-smoke / audit の matrix 化**: 3.12 単独のまま（理由は prepare-v1-release
  proposal 1 に記録済み・本 change で変更しない）。
- **basedpyright `pythonVersion` の変更**: 3.12 固定のまま（最低サポート版で型検査する
  既存方針。3.14 特有の型面が検査対象外なのは 3.13 と同様の既知特性）。
- **ruff `target-version` の変更**: py312 のまま（最低サポート版基準・同上）。
- **`.python-version` 既定 pin の変更**: 3.12 のまま（下流の既定は最低サポート版）。
