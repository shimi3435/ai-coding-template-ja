## ADDED Requirements

### Requirement: Hardlinkによる対象外変更を防ぐ

prune MUST 編集対象 regular file の st_nlink > 1 を事前および各操作直前に拒否し、対象外 hardlink の内容と inode を保持する。

#### Scenario: 共有編集対象のhardlink
- **WHEN** READMEなどの編集対象に対象外hardlinkがある
- **THEN** preview/applyは理由付きで失敗し、編集を開始しない

#### Scenario: preview後または途中のhardlink追加
- **WHEN** 検査時点で編集対象のlink数が増えている
- **THEN** 次の操作前に停止し、既存の途中失敗診断を返す

### Requirement: Gitの対応変換を尊重する

prune MUST HEAD/index一致を要求し、Gitの改行変換とcore.fileModeを尊重してsnapshotを比較する。未対応のfilter/ident/working-tree-encoding属性は変換前に拒否する。

#### Scenario: 正常CRLF checkout
- **WHEN** core.autocrlfまたはtext/eol属性によるclean checkoutである
- **THEN** pruneは成功し、区画外bytes・modeとindexを保持する

#### Scenario: 非対応変換と隠された実体差分
- **WHEN** 非対応変換属性または対象内の実体差分がある
- **THEN** 外部filterを実行せず拒否する。assume-unchanged/skip-worktreeで検査を回避できない

#### Scenario: 属性状態名と同名のencoding文字列
- **WHEN** working-tree-encoding=unset または working-tree-encoding=unspecified が対象に指定される
- **THEN** 空fileを含め、target bytesを変換する前に拒否し、indexとworking treeを変更しない。Gitが合成入力の変換失敗でexit 0を返しても診断を無視しない。実際の -working-tree-encoding / !working-tree-encoding は許容する

#### Scenario: 初期mode差と同時変更
- **WHEN** core.fileMode=falseなら初期実行bitだけが異なる
- **THEN** 許容する。ただしpreview以降の生bytes/mode変更は設定によらず拒否する

### Requirement: TEMPLATE_VERSION通常版契約

PythonとTypeScript MUST 同じASCIIのX.Y.Z規則を使用し、各要素の先頭ゼロを禁止する（単独0を除く）。空行を除いた非空行は1行とし、pre-release/buildと値の前後空白は拒否する。

#### Scenario: 共通版ケース
- **WHEN** 正常版、先頭ゼロ、Unicode数字、複数行、pre-release/buildを入力する
- **THEN** 共通ケースの期待値に両実装が一致する

### Requirement: 性能指摘の計測と継続検証

計測 MUST parser検証回数と時間を実測し、既知コストと未検証範囲を記録する。通常runtimeのartifact検証・fail-closed・offline性は変更しない。

#### Scenario: fixtureと実repositoryの計測
- **WHEN** scannerを計測付きで実行する
- **THEN** 解析、artifact検証、binary hash、subprocess、全体の数値と空入力の目安が得られる。wall-clock閾値でCIを不安定化させない
