## ADDED Requirements

### Requirement: ローカル setup は導入済み extras を保持する

`task setup` と個別の `task setup:<extra>` は、すでにローカル環境へ導入されている optional dependencies を削除せずに同期しなければならない（SHALL）。

#### Scenario: 異なる extra を順番に導入する

- **WHEN** 利用者が個別 extra setup を実行した後に別の個別 extra setup を実行する
- **THEN** 後の同期後も先に導入した extra 固有パッケージが保持される

#### Scenario: extra 導入後に通常 setup を再実行する

- **WHEN** 利用者が extra 導入後に `task setup` を実行する
- **THEN** 導入済み extra 固有パッケージが保持される

#### Scenario: コア環境へ戻す

- **WHEN** 利用者が明示的に exact な `uv sync` を実行する
- **THEN** 選択されていない extras と余剰パッケージが環境から削除される
