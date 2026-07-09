# first-change-quickstart（delta）

## ADDED Requirements

### Requirement: workflow.md の「初めての change」quickstart 節

`docs/agents/workflow.md` は「初めての change」quickstart 節を持ち、proposal 作成 → spec delta 作成（振る舞い変更時のみ）→ tasks 作成 → 実装（`openspec instructions apply` または Markdown fallback）→ PR 前チェック（`task openspec:validate`）→ pre-merge close の最小手順を一連の順序で 1 箇所に示すこと SHALL。

節は最低限次の 6 項目を含む:

1. change ディレクトリ構成（`proposal.md` / `tasks.md` 必須・振る舞いが変わる場合のみ
   `specs/<capability>/spec.md`）
2. spec delta の requirement 本文 1 行目に SHALL / MUST を置く制約
3. `tasks.md` のチェックボックス規律（各タスク完了時に実行主体が `- [x]` へ更新）
4. proposal 確定前に `spec-holes` フェーズ 1 で穴を列挙して潰すこと（1 行言及）
5. PR 前チェック `task openspec:validate`（`proposal.md` / `tasks.md` を欠く change は
   preflight で FAIL する旨の 1 行言及を含む）
6. pre-merge close（main に change ディレクトリを載せない・openspec/project.md 参照）

制約の本文は既存の定義箇所（workflow.md の Markdown fallback 節・CLI 導線・
openspec/project.md の close 規約）が owner のままとし、quickstart は複製せず
リンク・簡潔参照で束ねる。各ステップは engine 不在（Markdown fallback）でも
辿れる導線にする。

#### Scenario: 初めての読者が一連の順序を辿れる

- **WHEN** 読者が workflow.md の quickstart 節だけを起点に読む
- **THEN** proposal → spec delta → tasks → 実装 → validate → pre-merge close の順序と必須 6 項目が 1 箇所で得られ、詳細は既存節・openspec/project.md へのリンクで到達できる

#### Scenario: engine 不在の読者

- **WHEN** openspec CLI を導入していない読者が quickstart を辿る
- **THEN** 実装ステップに Markdown fallback の導線（該当節への参照）があり、engine 前提で手順が途切れない

#### Scenario: preflight FAIL の言及

- **WHEN** 読者が quickstart の PR 前チェック項目を読む
- **THEN** `proposal.md` / `tasks.md` を欠く change ディレクトリは `task openspec:validate` の preflight で FAIL することが 1 行で分かる

#### Scenario: 本文の二重化なし

- **WHEN** quickstart 節と既存節（Markdown fallback 最小形式・CLI 導線・project.md close 規約）を突き合わせる
- **THEN** 制約の定義本文は既存の owner 箇所にのみ存在し、quickstart 側はリンク・簡潔参照に留まる

### Requirement: guide §4 からの 1 行参照

`docs/guide.md` の §4 は、初めて OpenSpec change を切るときの最小手順として `docs/agents/workflow.md` の quickstart 節への参照を 1 行含むこと SHALL。guide 側には手順本文を書かない（手順の owner は workflow.md）。

リンクは guide の既存流儀どおりファイルへの Markdown リンクとし、節名は文中で
言及する（見出しアンカーは見出し変更で壊れるため使わない）。§5 の既存
workflow.md 参照（change 運用の詳細）と役割を分け、§4 の参照は
「初めての change の最小手順」への導線に限定する。

#### Scenario: 参照の存在と形式

- **WHEN** guide §4 を読む
- **THEN** workflow.md の quickstart 節への 1 行参照（ファイルリンク＋節名の文中言及・アンカーなし）が存在する

#### Scenario: SoT 境界の維持

- **WHEN** guide §4 の追記部分を読む
- **THEN** 手順のステップ本文（proposal 作成方法・validate コマンド等の手順記述）は含まれず、参照のみである
