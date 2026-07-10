# openspec-validate-gate（delta）

## ADDED Requirements

### Requirement: tasks.md のチェックボックス形式検査（FAIL 側）

`task openspec:validate`（scripts/openspec-validate-gate.py）の preflight は、各 change の tasks.md に整形式チェックボックス行（`- [ ] ` / `- [x] `・大文字 X 可・インデント可）が 1 行も無い場合、checkbox もどき行（崩れ形）がある場合、または UTF-8 で読めない場合に、CLI を実行せず非ゼロ終了すること SHALL。

#### Scenario: checkbox 行ゼロの tasks.md

- **WHEN** tasks.md が空、または箇条書きに checkbox が 1 つも無い change がある
- **THEN** gate は該当 change 名を挙げて FAIL し、CLI を実行しない

#### Scenario: 崩れた checkbox 行

- **WHEN** tasks.md に `- []` や `- [x]foo` のような checkbox もどき行がある
- **THEN** gate は行番号付きで FAIL する

#### Scenario: markdown リンクの誤検知防止

- **WHEN** tasks.md のリスト行に `- [workflow.md](path) を参照` のような markdown リンクがあり、整形式 checkbox 行も 1 行以上ある
- **THEN** gate はそれを checkbox もどきとして扱わず pass する

### Requirement: tasks.md 形式の doctor probe（WARN 側）

`task doctor` の openspec probe は、同じ検査で検出した malformed tasks.md を WARN として報告し、exit 0 を維持すること SHALL。

#### Scenario: doctor の green 維持

- **WHEN** malformed な tasks.md を持つ change がある状態で `task doctor` を実行する
- **THEN** WARN が出るが exit 0（green）は維持される

### Requirement: CI の openspec validate ジョブ

`.github/workflows/ci.yml` は openspec CLI（exact version pin）を導入して gate を実行するジョブを持つこと SHALL。

#### Scenario: PR 途中の malformed / invalid change の検出

- **WHEN** malformed または validate invalid な change ディレクトリを含むコミットが PR に入る
- **THEN** `openspec-validate` ジョブが赤になり検出される

#### Scenario: 空 changes/ での trivially green

- **WHEN** `openspec/changes/` が `.gitkeep` のみ（main への push・close 済み PR）
- **THEN** ジョブは green（CLI は「No items found to validate.」exit 0）
