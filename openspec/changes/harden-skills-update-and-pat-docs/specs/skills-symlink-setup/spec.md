# skills-symlink-setup（vendored skill symlink 再生成の安全性）仕様差分

本 change による capability `skills-symlink-setup` への追加分。archive せず close 時に
ディレクトリごと削除するため、`openspec/specs/` へはマージされない。

## ADDED Requirements

### Requirement: 非 symlink 実体の保護
`task skills:update`（`scripts/setup-skills.sh`）は、vendored skill 名に対応するリンク先パス（`.claude/skills/<name>` / `.codex/skills/<name>`）に symlink 以外の実体（ディレクトリ・通常ファイルその他すべて）が存在する場合、リンク再生成を含む一切のファイルシステム変更を行わずに、衝突している全パスを列挙し復旧手順（退避 `mv` または手動削除→再実行の案内）を表示して非ゼロ終了しなければならない（SHALL）。実ディレクトリを置換する明示フラグは提供しない（置換はユーザーが退避／削除してから再実行する）。リンク先パスに何も存在しない場合は従来どおり symlink を新規作成する。link root（`.claude/skills` / `.codex/skills` 自体）が非ディレクトリである異常はスコープ外とし、`mkdir -p` の失敗（`set -e`）に委ねる。

#### Scenario: 実ディレクトリと名前衝突する
- **WHEN** vendored skill 名のリンク先パスにユーザーの実ディレクトリ（手動配置 skill 等）が存在する状態で実行する
- **THEN** そのディレクトリと内容は無傷のまま、衝突パスと復旧手順を表示して非ゼロ終了する

#### Scenario: 衝突が複数ある
- **WHEN** 複数の skill 名／複数の link root で非 symlink 衝突がある
- **THEN** 最初の 1 件で停止せず全衝突を列挙してから非ゼロ終了する

#### Scenario: 衝突時は他の修復も行わない（部分変更なし）
- **WHEN** 片方の link root に非 symlink 衝突があり、もう片方の link root に壊れた symlink がある
- **THEN** 壊れた symlink の修復も含め一切の変更を行わず非ゼロ終了する（衝突解消後の再実行で修復される）

#### Scenario: 退避後の再実行
- **WHEN** ユーザーが衝突ディレクトリを退避（`mv`）してから再実行する
- **THEN** symlink が正常に生成され exit 0 で終了する

### Requirement: 置換削除の unlink 限定
リンク再生成で既存パスを削除する操作は、symlink（壊れた symlink・期待先と異なる先を指す symlink）に対する unlink に限定し、再帰削除（`rm -rf` 相当）を用いてはならない（SHALL NOT）。unlink は symlink 自体のみを削除し、指し先の実体には触れない（symlink chain の場合も第一段の symlink のみ削除する）。既に正しい相対 symlink が存在する場合は変更しない。

#### Scenario: 壊れた symlink を修復する
- **WHEN** リンク先パスに解決不能な symlink が存在する
- **THEN** unlink して正しい相対 symlink を張り直し exit 0 で終了する

#### Scenario: 誤った先を指す symlink を置換する
- **WHEN** リンク先パスに期待先と異なる先（ユーザーの実ディレクトリ等）を指す symlink が存在する
- **THEN** symlink のみ unlink して張り直し、指し先の実体は無傷のまま exit 0 で終了する

#### Scenario: 再実行の冪等性
- **WHEN** 全 symlink が正しい状態で再実行する
- **THEN** 何も変更せず「変更なし」を報告して exit 0 で終了する
