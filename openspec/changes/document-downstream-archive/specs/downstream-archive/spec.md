## ADDED Requirements

### Requirement: 同一PRでの下流archive
The workflow SHALL define implementation, verification, review convergence, same-PR archive and spec synchronization, post-archive review, affected validation and final CI before merge, in this order.

#### Scenario: 通常の下流change
- **WHEN** 実装・検証・必要なreviewが完了する
- **THEN** 明示操作で同一PRのspec同期とarchiveを行い、canonical・archive・最終diffをreviewし、必要な再検証と最終CI成功後にmergeする

#### Scenario: 別PRが必要な組織
- **WHEN** merge/deploy済みが完了条件、またはspec管理・reviewの責任分離が必要である
- **THEN** 理由と引き渡し対象を明記して別PRで同じvalidationとreviewを行う

### Requirement: 運用の責務分離
The repository MUST keep downstream archive in workflow, layout in project, and explicitly selected template deletion close in template maintenance documentation.

#### Scenario: template由来の下流
- **WHEN** template名・remote・保守文書が残っている
- **THEN** それを削除型closeの選択根拠にせず、guideとprojectから通常archiveへ到達できる

#### Scenario: 完了操作の運用選択
- **WHEN** close/archiveの実行を開始する
- **THEN** 会話・承認済み仕様の選択を確認し、下流archiveまたは明示された保守手順へ分岐する。未選択または必要手順がない場合は操作前に停止する

#### Scenario: 保守資産のprune
- **WHEN** 保守資産をpruneする
- **THEN** projectには存在しない保守手順への案内を残さず、通常workflowへの参照を保持する。prune前は既存workflow markerから保守手順へ到達できる

### Requirement: Executorの引き渡し
The executor MUST remain active-only and report implementation completion separately from archive readiness and archive completion, without automatically archiving or publishing Git changes.

#### Scenario: PRレビュー待ち
- **WHEN** 運用を選択済みで全taskと必須検証・reviewが完了し既知blockerがないがPRレビューは未完了または未確認である
- **THEN** archive-readyとPR状態を併記し、archiveはレビュー収束後の明示操作へ引き渡す

#### Scenario: 未完了taskまたはblocker
- **WHEN** 必須検証未実行・未完了task・既知の未解決blockerがある
- **THEN** CLIが警告だけでもarchive-readyとは報告しない

#### Scenario: 運用未選択の引き渡し
- **WHEN** 運用が未選択である
- **THEN** 実装・検証は進められるが、完了操作の選択待ちを報告してarchive-ready判定を保留する

### Requirement: 手動同期と検証境界
The archive procedure MUST preserve unaffected canonical content, support a manual Markdown fallback with explicit paths and results, and never treat unexecuted required gates as passed.

#### Scenario: CLI不在
- **WHEN** CLIを使用できない
- **THEN** 同じ順序でdeltaの意味を反映し履歴を移動・照合するが、必須gate未実行なら完了としない

#### Scenario: deltaなしまたは同期済み
- **WHEN** deltaが存在しない、または全効果をcanonicalの内容から確認できる
- **THEN** 不要な同期をせず履歴移動と事後review・検証を行う

#### Scenario: 特殊文字を含む既存change名
- **WHEN** 使用版で受理され、既存の単一active directoryと確認した名前をarchiveへ渡す
- **THEN** 新規作成時の命名制約で改名せず、shell変数の引用とoption終端でliteralに渡す。未設定・空名ならCLIを起動しない

#### Scenario: archive後のcanonical strict検証
- **WHEN** CLIが利用でき、同期・修正されたcanonical specsがある
- **THEN** 期待する対象の存在を照合し、各capabilityをstrict検証する。active-only gateや対象0件のexit 0は代用しない。再修正時も検証し、失敗ならarchive完了を取り消す

### Requirement: 衝突と中断の復旧
The procedure MUST check destination conflicts and implementation-based synchronization order, inspect canonical, active and archived state after failure, and forbid blind retry, overwrite and automatic rollback.

#### Scenario: 同一capabilityへの並行変更
- **WHEN** 複数changeが同じspecを変更する
- **THEN** 実装と順序を確定して一件ずつ同期し、不明なら停止する

#### Scenario: 同名衝突・部分失敗・再実行
- **WHEN** 既存archiveまたは途中書込がある
- **THEN** 無変更・成功と推測せず三者を開始前状態と照合し、復旧方針が不明なら停止する

### Requirement: Archive後の修正
The workflow MUST retain archive location for same-scope pre-merge corrections, reopen affected task verification, realign implementation and artifacts, and repeat affected validation and review without stale evidence.

#### Scenario: archive後のreview指摘
- **WHEN** 同じscopeの修正が必要になる
- **THEN** 明示したarchive内で既存差分を保護して修正・再検証し、active-only executorを再呼出しない

#### Scenario: 新しい仕様判断または過去の履歴
- **WHEN** scope拡大が必要、または今回変更しない過去archiveが存在する
- **THEN** 前者は再合意まで停止し、後者へ最新tasks形式の移行を要求しない
