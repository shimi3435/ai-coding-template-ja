## ADDED Requirements

### Requirement: Shared offline validation gate
通常 CI の check と rename-smoke は同じ構成・入力のローカル task check と同じ検証範囲を MUST 実行する。

#### Scenario: Fresh checkout
- **WHEN** runtime と locked dependencies の準備が成功する
- **THEN** check job は task check を一度実行し、失敗を job の失敗にする

#### Scenario: Renamed package
- **WHEN** rename-smoke の準備と改名が成功する
- **THEN** 改名後に同じ task check を一度実行する

#### Scenario: Shipped but disabled automation
- **WHEN** automation が同梱され、更新機能は無効である
- **THEN** Skill integrity と automation tests を認証や外部 host なしで実行する

#### Scenario: Broken input
- **WHEN** fresh または rename 後の Skill lock が破損する、または automation test が失敗する
- **THEN** task check とそれを呼ぶ CI 相当経路が非ゼロ終了する。条件分岐や continue-on-error で成功へ変換しない

#### Scenario: Future prune
- **WHEN** #51 が残存構成に合わせて task check を更新する
- **THEN** CI は同じ task check を呼ぶ。今回 prune や存在チェックによる検証スキップを追加しない

### Requirement: Pinned preparation separate from offline checks
両ジョブは Task の action を commit SHA、Task 本体を exact version に MUST 固定し、offline check より前に準備する。

#### Scenario: Installation and check ordering
- **WHEN** job が開始する
- **THEN** runtime preflight、Task 導入、locked Python / Node dependency 導入を check より前に完了し、rename-smoke は改名も先に完了する

#### Scenario: Preparation failure
- **WHEN** Task または依存の導入が失敗する
- **THEN** job は失敗し、検証段階で再導入や network fallback を行わない

#### Scenario: Repeat execution
- **WHEN** 同じ入力で check を再実行する
- **THEN** 同じ検証を実行し、検証成功のキャッシュによるスキップを追加しない
