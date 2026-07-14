## ADDED Requirements

### Requirement: OpenSpec change の実行経路を選択する
プロジェクトは MUST 仕様と `spec-holes` Phase 1 の確定後かつ `tasks.md` 確定前に、独立出荷可能性を確認してから change の実行経路を選択し、実行中に前提が変わった場合は再判定する。

#### Scenario: 小規模 change を選択する
- **WHEN** change が単一セッションと単一コンテキストで安全に実装・検証でき、依存 phase や有益な隔離並列単位を持たない
- **THEN** 実行主体は OpenSpec CLI または Markdown fallback の直接経路を選び、理由を `tasks.md` に記録する

#### Scenario: 大規模 change を選択する
- **WHEN** change が複数セッション、依存順序を持つ複数 phase、有益な隔離並列単位、または単一コンテキストで安全に完了・検証できない条件のいずれかを満たす
- **THEN** 実行主体は GSD 候補と理由を `tasks.md` に記録し、GSD が opt-in で利用可能であることを確認してから handoff する

#### Scenario: 独立出荷可能な成果を発見する
- **WHEN** 一つの change に独立してレビュー・出荷可能な成果が複数含まれる
- **THEN** 実行主体は実行 engine で分割せず、OpenSpec changes と依存関係を再定義する

#### Scenario: 直接実行中に大規模条件を満たす
- **WHEN** 実装途中で複数セッションまたは依存 phases が必要になる
- **THEN** 実行主体は完了済み checkbox を保持し、未完了範囲を境界ゲートへ再構成して、承認後にだけ GSD へ昇格する

#### Scenario: 実行開始条件が不足する
- **WHEN** change ID、必須 artifact、`spec-holes` Phase 1、validate可能な構成、経路と理由、または安全な branch 状態のいずれかが不足する
- **THEN** 実行主体は不足項目を報告し、書き込みを開始しない

### Requirement: OpenSpec と GSD の所有権を分離する
プロジェクトは MUST OpenSpec の proposal、design、spec delta、受け入れ基準、`spec-holes`、最終完了判定を正本とし、GSD を大規模 change の詳細計画・phase 実行・phase 進捗の所有者として扱う。

#### Scenario: 小規模 change の tasks を作成する
- **WHEN** change が直接経路に分類される
- **THEN** OpenSpec `tasks.md` は実装・検証の詳細タスクと checkbox 進捗を持つ

#### Scenario: 大規模 change の tasks を作成する
- **WHEN** change が GSD 経路に分類される
- **THEN** OpenSpec `tasks.md` は handoff、全対応 phases 完了、OpenSpec 原本検証、project checks、close の境界ゲートだけを持ち、GSD の詳細タスクを複製しない

#### Scenario: GSD phase を OpenSpec change へ対応付ける
- **WHEN** GSD が一体の成果を複数 phases に分割する
- **THEN** 各 phase は一つの OpenSpec change と担当範囲を参照し、一つの phase に複数 changes の要件を混在させない

#### Scenario: GSD 実行中に仕様変更が必要になる
- **WHEN** 外部動作、受け入れ基準、公開 API、永続データ、trust boundary、重要アーキテクチャ、または既存 ADR に影響する判断が必要になる
- **THEN** 実行主体は GSD を停止し、OpenSpec または ADR を先に更新して `spec-holes` と validate を再実行してから影響 phases を再計画する

#### Scenario: GSD が内部実装を判断する
- **WHEN** 判断が可逆で外部仕様や後続 changes を拘束しない
- **THEN** GSD はファイル分割、関数配置、テスト方法、plan、wave などの内部実装を決定できる

### Requirement: 小規模 change を OpenSpec artifacts から直接実行する
実行主体は MUST 小規模 change について OpenSpec CLI の apply 指示または同じ Markdown artifacts を読み、各詳細 task の実装・検証後に `tasks.md` の checkbox を更新する。

#### Scenario: OpenSpec CLI を利用する
- **WHEN** `openspec instructions apply --change <id>` が利用できる
- **THEN** 実行主体は返された context と指示に沿って task を実行し、CLI がコード変更や checkbox 更新を自動実行するとはみなさない

#### Scenario: OpenSpec CLI JSON を利用する
- **WHEN** `openspec instructions apply --change <id> --json` が期待する context paths と task progress を返す
- **THEN** 実行主体は JSON を artifact discovery と進捗取得にだけ使い、canonical 内容は列挙された Markdown ファイルから読む

#### Scenario: CLI または JSON 契約を利用できない
- **WHEN** OpenSpec CLI が不在、または JSON の context paths / progress 契約が非互換である
- **THEN** 実行主体は固定された OpenSpec directory 規約から同じ Markdown files を読み、`tasks.md` の checkbox から進捗を算出する

#### Scenario: task を完了する
- **WHEN** task の成果物と対象に近い検証が完了する
- **THEN** 実行主体は対応する `tasks.md` の checkbox を `- [x]` に更新する

#### Scenario: task が失敗または中断する
- **WHEN** 実装または検証が完了しない
- **THEN** 実行主体は該当 checkbox を未完了に保ち、完了済み checkbox を保持して再開する

### Requirement: 大規模 change を手動で GSD へ引き渡す
実行主体は MUST 自動 bridge がなくても再現可能な固定手順で大規模 change を GSD へ引き渡し、部分状態または capability 不足から別経路へ自動切替しない。

#### Scenario: 手動 handoff を準備する
- **WHEN** change が GSD 経路として承認される
- **THEN** 実行主体は change ID、canonical artifact paths、`spec-holes` と validate の状態、経路理由、完了済み境界ゲート、未解決事項を確認する

#### Scenario: source 状態を固定する
- **WHEN** GSD 実行を開始する
- **THEN** 実行主体は非デフォルトの専用 branch 上で canonical artifacts をレビュー可能な commit に固定し、既存 dirty changes を自動 stash または自動 commit しない

#### Scenario: GSD に context を渡す
- **WHEN** handoff 前提が満たされる
- **THEN** 実行主体は GSD に change ID、canonical artifact paths、source commit、完了済み境界ゲート、未解決事項を渡し、GSD phases から正本を参照させる

#### Scenario: GSD capability を確認できない
- **WHEN** 必要な GSD skill、workspace、または安全な実行 capability の存在を確認できない
- **THEN** 実行主体は存在を推測して artifacts を生成せず、change 分割または OpenSpec 詳細 tasks への再構成案を提示する

#### Scenario: GSD 実行から復帰する
- **WHEN** 中断後に同じ change の実行を再開する
- **THEN** 実行主体は source commit、OpenSpec artifacts、完了済み phases、未解決事項を再確認し、完了済み進捗を失わずに resume する

#### Scenario: GSD から直接経路へ戻す
- **WHEN** GSD 内で安全に継続できず直接経路への fallback が提案される
- **THEN** 実行主体は既存 commits、完了済み phases、未完了範囲、詳細 `tasks.md` の再構成案を提示し、承認後にだけ経路を変更する

### Requirement: OpenSpec 原本に対して最終完了を検証する
プロジェクトは MUST 実行経路の内部検証とは別に OpenSpec 原本の全 requirement、scenario、`spec-holes` 項目へ実装と検証を対応付け、すべての境界ゲート通過後にだけ change を完了とする。

#### Scenario: GSD phases が完了する
- **WHEN** 対応する全 GSD phases が各自の verification を通過する
- **THEN** 実行主体は OpenSpec 原本を再読し、実装・テスト・理由付き未検証との対応を確認する

#### Scenario: 最終検証が成功する
- **WHEN** OpenSpec 原本の全受け入れ基準、`task openspec:validate`、`task check`、文書リンク、実装と検証の対応が成功する
- **THEN** main 実行主体だけが OpenSpec `tasks.md` の最終境界ゲートを完了にする

#### Scenario: 対応漏れを発見する
- **WHEN** OpenSpec requirement、scenario、または `spec-holes` 項目が実装・テスト・理由付き未検証のいずれにも対応していない
- **THEN** change を未完了に保ち、不足 task または仕様更新を要求する

#### Scenario: 最終コマンドまたは受け入れ検証が失敗する
- **WHEN** validate、project checks、リンク検査、または受け入れ検証が失敗する
- **THEN** 実行主体は失敗内容を報告し、該当する完了 gate を未完了のまま維持する

#### Scenario: 未実装の依存 changes が後続にある
- **WHEN** 現在の change を close する時点で依存順の後続 changes が blocked または未実装である
- **THEN** 実行主体は現在の PR に一つの active change だけを含めて pre-merge close し、後続 proposals を main や backlog へ複製せず依存順の専用 branches に保持する

#### Scenario: 完了後に OpenSpec 原本の変更を検出する
- **WHEN** 最終検証後に proposal、design、spec delta、または進捗以外の `tasks.md` 内容が変更される
- **THEN** 実行主体は完了 gate を再度未完了として、影響範囲と受け入れ基準を再検証する
