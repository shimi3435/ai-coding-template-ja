# openspec-validation（delta）

## ADDED Requirements

### Requirement: doctor の OpenSpec validate probe

`task doctor` は、openspec CLI が在席し かつ `openspec/changes/` に change ディレクトリが 1 つ以上あるときに限り `openspec validate --changes --no-interactive` を実行し、invalid を WARN として報告する（FAIL とせず exit code 0 を維持する）こと SHALL。

probe は read-only であり、リポジトリのファイルを変更しない。validate の実行自体が
失敗した場合（クラッシュ・タイムアウト等）も WARN に留め、FAIL にしない。
`openspec/changes/` ディレクトリ自体が存在しない場合も「change ゼロ」と同様に skip する。
`changes/archive/`（openspec の archive 規約ディレクトリ）と dot ディレクトリは change として
数えない。invalid 時の WARN は要約に留め、詳細確認の導線として `task openspec:validate` を
案内する。`proposal.md` / `tasks.md` を欠く change ディレクトリは CLI の validate 対象から
漏れる（fail-open）ため、probe が WARN で検出し、その場合は「全 change valid」の OK を
出さない。

#### Scenario: CLI 在席・changes 非空・全 change valid

- **WHEN** openspec CLI が在席し、`openspec/changes/` に valid な change ディレクトリがある状態で `task doctor` を実行する
- **THEN** validate probe が実行され OK が報告される

#### Scenario: CLI 在席・changes 非空・invalid な change あり

- **WHEN** openspec CLI が在席し、`openspec/changes/` に invalid な change がある状態で `task doctor` を実行する
- **THEN** WARN が報告され、exit code は 0 のまま（doctor の green を壊さない）

#### Scenario: CLI 在席・changes 空

- **WHEN** `openspec/changes/` に change ディレクトリが 1 つも無い（`.gitkeep` のみ等）状態で `task doctor` を実行する
- **THEN** probe は validate を実行せず、probe 由来の出力を出さない

#### Scenario: CLI 不在

- **WHEN** openspec CLI が不在の状態で `task doctor` を実行する
- **THEN** probe は静かに skip し、既存の engine 不在 WARN のみが出る

#### Scenario: validate 実行自体の失敗

- **WHEN** validate の子プロセスがクラッシュまたはタイムアウトする
- **THEN** WARN に留め、FAIL にしない（exit code 0 を維持する）

#### Scenario: 必須ファイルを欠く change ディレクトリ

- **WHEN** `proposal.md` または `tasks.md` を欠く change ディレクトリがある状態で `task doctor` を実行する
- **THEN** 当該ディレクトリごとに WARN が報告され（exit code 0 維持）、「全 change が valid」の OK は出ない

### Requirement: doctor 出力の openspec init 不含

`task doctor` の出力は、いかなる診断経路でも文字列 `openspec init` を含まないこと MUST。

engine 未導入時の案内は「Markdown fallback で運用できる」ことと
docs/agents/workflow.md への参照のみとする（in-repo `openspec init` は
project.md → config.yaml 移行ハザードがあり workflow.md が非推奨としているため、
その導線を doctor が提示しない）。

検査対象は小文字の literal `openspec init` のみとし、大文字小文字の変種
（`OpenSpec Init` 等）はスコープ外（コマンド導線として機能するのは literal のみ）。

#### Scenario: engine 不在時の案内文言

- **WHEN** openspec CLI が不在の状態で `task doctor` を実行する
- **THEN** WARN 文言は Markdown fallback 運用可と workflow.md 参照のみを含み、`openspec init` を含まない

#### Scenario: 回帰テスト

- **WHEN** テストスイートを実行する
- **THEN** doctor の出力（engine 不在案内の経路を含む）に `openspec init` が含まれないことを検証するテストが存在し、pass する

### Requirement: opt-in の validate ゲート（task openspec:validate）

`task openspec:validate` は、openspec CLI 在席時に `openspec validate --changes --no-interactive` を実行し、invalid な change があれば非ゼロ終了すること SHALL。openspec CLI 不在時は導入案内を出して非ゼロ終了すること SHALL（このゲートは engine 必須であり、silent pass しない）。

このゲートは opt-in であり、CI・`task check`・pre-commit には組み込まない
（ADR-0002: Node をコア依存にしない）。`openspec/changes/` が空のときは
validate 対象ゼロとして正常終了（exit 0）する。ゲートは read-only であり
再実行しても同じ結果を返す。validate 子プロセス自体の実行失敗（クラッシュ等）は
fail-closed（非ゼロのまま伝播）とする。`openspec/` ディレクトリ自体の不在は
テンプレート構成の前提外でありスコープ外（CLI のエラーに委ねる）。

`openspec validate --changes` は `proposal.md` を欠くディレクトリを検証対象から除外する
（fail-open）ため、ゲートは CLI 実行前に preflight として `openspec/changes/*`
（archive・dot ディレクトリを除く）に `proposal.md` / `tasks.md` が揃っていることを検査し、
欠落があれば非ゼロ終了する。

#### Scenario: engine 在席・全 change valid

- **WHEN** openspec CLI 在席・全 change が valid の状態で `task openspec:validate` を実行する
- **THEN** exit 0 で終了する

#### Scenario: engine 在席・invalid な change あり

- **WHEN** invalid な change がある状態で `task openspec:validate` を実行する
- **THEN** 非ゼロ終了する（ゲートとして FAIL）

#### Scenario: engine 不在

- **WHEN** openspec CLI が不在の状態で `task openspec:validate` を実行する
- **THEN** 導入案内（インストール方法と workflow.md 参照）を出力し、非ゼロ終了する

#### Scenario: changes 空

- **WHEN** `openspec/changes/` に change ディレクトリが無い状態で `task openspec:validate` を実行する
- **THEN** validate 対象ゼロとして exit 0 で終了する

#### Scenario: 必須ファイルを欠く change ディレクトリ（preflight）

- **WHEN** `proposal.md` または `tasks.md` を欠く change ディレクトリがある状態で `task openspec:validate` を実行する
- **THEN** preflight が欠落を報告して非ゼロ終了する（CLI が対象外として skip しても green にしない）
