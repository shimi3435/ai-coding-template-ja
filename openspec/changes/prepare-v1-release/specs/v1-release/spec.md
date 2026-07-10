# v1-release（delta）

## ADDED Requirements

### Requirement: CI の Python バージョン検証線

`.github/workflows/ci.yml` の `check` job と `.github/workflows/extras-smoke.yml` の `extras-smoke` job は `python-version` の matrix（`"3.12"` / `"3.13"`）で実行されること SHALL。

`rename-smoke`（rename は文字列置換で Python minor 非依存・置換後の版依存差分は
`check` matrix がカバー）と `audit`（lock 由来依存セットの監査・静的解析で実行系
minor の影響が実質なし）は 3.12 単独のままとする。3.14+ の追加はスコープ外
（post-1.0 判断）。

#### Scenario: 3.13 での回帰検出

- **WHEN** 依存またはコードが Python 3.13 で壊れる変更が PR に入る
- **THEN** `check` job の 3.13 matrix エントリが赤になり検出される

#### Scenario: matrix 対象外 job の維持

- **WHEN** ci.yml を読む
- **THEN** `rename-smoke` / `audit` は 3.12 単独であり、その理由が proposal に記録されている

### Requirement: pin 非対称の意図記録

`.pre-commit-config.yaml` は `pre-commit-hooks` repo の tag pin（SHA pin でなく dependabot 監視外）が意図的である旨のコメントを当該 repo 定義の直上に持つこと SHALL。

#### Scenario: 読者が非対称の意図を判別できる

- **WHEN** 読者が CI action の SHA pin 方針と `.pre-commit-config.yaml` の tag pin を突き合わせる
- **THEN** tag pin が意図的であることと根拠（CI 非実行で secrets 非曝露・dependabot 非サポート・pre-commit 慣行）がコメントで分かる

### Requirement: coverage fail-under なしの意図記録

pyproject.toml の coverage 設定は fail-under 閾値を置かないことが意図的である旨のコメントを持つこと SHALL。

#### Scenario: 読者が閾値なしの意図を判別できる

- **WHEN** 読者が pyproject.toml の coverage 設定を読む
- **THEN** 閾値ゲートを置かない意図（可視化に徹する・要る下流は自分で足す）がコメントで分かる

### Requirement: codex-review.md の focus 導線

`docs/optional/codex-review.md` の使い方節は、`/codex:review` が focus（追加のレビュー観点テキスト）非対応であり、focus / 観点付きレビューは `/codex:adversarial-review` を使うことを記載すること SHALL。

#### Scenario: focus 付きレビューをしたい読者

- **WHEN** 読者が観点を指定して Codex レビューを回したい
- **THEN** `/codex:review` では不可で `/codex:adversarial-review` を使うことが使い方節から分かる

### Requirement: 下流向けテンプレ更新手順（template-update.md）

`docs/optional/template-update.md` が存在し、下流リポジトリがテンプレの後続改善を手動 cherry-pick で取り込む手順を 1 枚で示すこと SHALL。

含める: 非目的の明示（remote merge 追随は ADR-0005 で却下済み）・取り込み対象の特定
導線（テンプレの Releases / PR 履歴）・cherry-pick 手順・rename 済み下流はコンフリクト
前提の注意・prune 済み下流で不要な hunk はスキップ可・下流の `TEMPLATE_VERSION` は
更新しない（作成時点の由来スタンプのため据え置き）。

#### Scenario: ADR-0005 の言及パスが実在する

- **WHEN** 読者が ADR-0005 から `docs/optional/template-update.md` を辿る
- **THEN** ファイルが実在し手順が読める

#### Scenario: rename 済み下流の読者

- **WHEN** `task rename` 適用済みの下流が cherry-pick を行う
- **THEN** コンフリクトが前提であることと手動解決の注意が手順から分かる

#### Scenario: 取り込み後の TEMPLATE_VERSION

- **WHEN** 下流が一部の PR だけを cherry-pick した
- **THEN** `TEMPLATE_VERSION` を更新しない（据え置き）ことが手順に明記されている

### Requirement: 保守側リリース手順（release.md）

`docs/template/release.md` が存在し、テンプレ保守側のリリース手順を 1 枚で示すこと SHALL。

含める: semver 規律の定義（major=下流の bootstrap / rename / 構成互換を壊す・
minor=機能 / skill / docs 追加・patch=修正）・`TEMPLATE_VERSION` の bump 規律
（リリース単位・リリース PR に含める）・リリース前提チェック（`task check` green・
`task openspec:validate` green・`openspec/changes/` が `.gitkeep` のみ）・
pyproject.toml の `version` は 0.1.0 のまま非同期とする理由（下流所有物）・
annotated tag（tag 名 = `v` + `TEMPLATE_VERSION` の一致確認）→ GitHub Release の手順。

#### Scenario: リリース前に validate red

- **WHEN** `task openspec:validate` が red のままリリースしようとする
- **THEN** 前提チェックが満たされずリリース手順を進められないことが手順から分かる

#### Scenario: pyproject version との混同

- **WHEN** 読者が pyproject.toml の `version` と `TEMPLATE_VERSION` の関係を確認する
- **THEN** 非同期（pyproject は下流所有物のため触らない）であることと理由が手順から分かる

#### Scenario: tag と TEMPLATE_VERSION の一致

- **WHEN** 保守者が tag を打つ
- **THEN** tag 名が `v` + `TEMPLATE_VERSION` と一致することの確認ステップが手順にある

### Requirement: TEMPLATE_VERSION 1.0.0

ルートの `TEMPLATE_VERSION` は `1.0.0`（単一行・semver 形式）であること SHALL。pyproject.toml の `version` は変更しない。

#### Scenario: doctor の由来表示

- **WHEN** `task doctor` を実行する
- **THEN** `テンプレートバージョン v1.0.0` が INFO 表示される

### Requirement: README ドキュメント構成の整合

README の「ドキュメント構成」節は docs/template/ の実内容（ADR 0001-0007・grill 記録・release.md）と docs/optional/ の実内容(テンプレ更新手順を含む)に整合すること SHALL。

#### Scenario: README から新規文書へ到達できる

- **WHEN** 読者が README のドキュメント構成節を読む
- **THEN** docs/template/ にリリース手順、docs/optional/ にテンプレ更新手順があることが分かる
