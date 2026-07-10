# python-version-matrix（delta）

## ADDED Requirements

### Requirement: CI の Python 3.14 検証線

`.github/workflows/ci.yml` の `check` job と `.github/workflows/extras-smoke.yml` の `extras-smoke` job は `python-version` の matrix（`"3.12"` / `"3.13"` / `"3.14"`・引用符付き文字列）で実行されること SHALL。

`rename-smoke` / `audit` は 3.12 単独のまま（理由は prepare-v1-release proposal に
記録済み）。3.15+ の追加はスコープ外（リリース後判断）。

#### Scenario: 3.14 での回帰検出

- **WHEN** 依存またはコードが Python 3.14 で壊れる変更が PR に入る
- **THEN** `check` job の 3.14 matrix エントリが赤になり検出される

#### Scenario: matrix 対象外 job の維持

- **WHEN** ci.yml を読む
- **THEN** `rename-smoke` / `audit` は 3.12 単独のままである

### Requirement: 検証済み Python バージョン集合の意図記録

pyproject.toml の `requires-python` 直上コメントは、CI 検証済みが 3.12 / 3.13 / 3.14 であり、3.15+ は範囲上許容するが未検証（リリース後判断）であることを記載すること SHALL。

#### Scenario: 読者が検証範囲を判別できる

- **WHEN** 読者が `requires-python = ">=3.12"` の許容範囲と実際の検証範囲の差を知りたい
- **THEN** 直上コメントから検証済み集合（3.12 / 3.13 / 3.14）と 3.15+ が未検証であることが分かる
