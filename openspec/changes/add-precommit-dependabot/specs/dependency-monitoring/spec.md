# dependency-monitoring（delta）

## ADDED Requirements

### Requirement: pre-commit hooks の dependabot 監視

`.github/dependabot.yml` は `pre-commit` package-ecosystem のエントリ（`directory: "/"`・weekly）を持ち、.pre-commit-config.yaml の rev 付き repo の更新 PR が自動生成されること SHALL。

#### Scenario: pre-commit-hooks の新版検出

- **WHEN** `pre-commit/pre-commit-hooks` の新しい tag がリリースされる
- **THEN** dependabot が rev 更新 PR を weekly で自動生成し、通常の CI ゲートが検証する

#### Scenario: repo: local エントリの非対象

- **WHEN** dependabot が .pre-commit-config.yaml を走査する
- **THEN** rev を持たない `repo: local`（ruff）は更新対象にならない（version 源は uv.lock のまま）

### Requirement: pin 非対称コメントの整合

`.pre-commit-config.yaml` の tag pin コメントは、dependabot の pre-commit ecosystem 監視が有効であることと矛盾しない記述であること SHALL。

#### Scenario: 読者が監視状態を正しく判別できる

- **WHEN** 読者が tag pin の意図コメントを読む
- **THEN** tag pin は慣行として維持しつつ dependabot が rev 更新 PR を自動生成する、という現状が分かる（「監視外」の stale 記述が残らない）
