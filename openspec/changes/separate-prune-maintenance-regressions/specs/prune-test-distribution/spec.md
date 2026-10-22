## ADDED Requirements

### Requirement: PTD-1 保守回帰を下流へ配布しない
テンプレートは design §2 の詳細回帰8 modulesと参照corpusを保守専用領域へ移設し、通常pytestから分離しなければならない（MUST）。

#### Scenario: bundled での検証分担
- **WHEN** 通常checkと保守gateをそれぞれ実行する
- **THEN** 通常側は共通検証、保守側は既存検証と移設回帰全件を収集し、失敗は非成功となる

#### Scenario: corpus 不正
- **WHEN** corpus が空・型不正・重複id・coverage不正となる
- **THEN** 保守gateが非成功となり、不正payloadを実行しない

#### Scenario: 保守Pythonの型検査
- **WHEN** 保守gateを実行する
- **THEN** 移設8modulesとhelperを含む保守tests全体を既存型設定で検査し、型エラーなら非成功となる。通常includeは拡張しない

### Requirement: PTD-2 runtime は回帰corpusに依存しない
通常 runtime は旧K05の必須保持とschema検証を撤回し、更新した固定manifestで保守資産の存在を判定しなければならない（MUST）。

#### Scenario: 完全除去
- **WHEN** 新テンプレートを正常にpruneする
- **THEN** 保守corpus / helper / 詳細testsは削除され、check / doctor / preview / no-op は共通入力だけで成立する

#### Scenario: 部分欠落
- **WHEN** bundled の固定保守資産の一部だけが欠落・空・誤型となる
- **THEN** 構成不整合として拒否し、完全除去と区別する

#### Scenario: 既存下流に旧K05が残る
- **WHEN** 旧形式でprune済みの利用者が更新を取り込む
- **THEN** 旧corpusは自動削除せず、独自参照確認後の手動整理と別Issueでのmigration検討を文書で案内する

### Requirement: PTD-3 共通安全性と公開契約を保持する
実装は公開CLI / JSON / R01〜R06、Git・hardlink保護、offline性、共通version・parser artifact・Skill / legal / links検証を維持しなければならない（MUST）。

#### Scenario: corpusなしの共通テスト
- **WHEN** 保守領域を除去した実repositoryで通常checkを実行する
- **THEN** 保守helperのimportやfixture欠落は起きず、構成・参照安全性と公開smokeの検証が実行される

#### Scenario: 回帰期待値の維持
- **WHEN** 移設した269件の参照corpusをbundled / pruned fixtureへ適用する
- **THEN** 各idの検出・coverage期待値が移設前と一致し、構文エラーを成功へ読み替えない

#### Scenario: 解析失敗を公開入口まで伝播する
- **WHEN** 正常なpruned Git fixtureに代表的なshell構文エラーを与える
- **THEN** 通常gateでanalysis_errors非空、successful=False、解析由来のplan blocker、実CLI apply非ゼロ、ファイルとindexの不変を検証する

### Requirement: PTD-4 効果を測定して受入を判断する
変更前後のpruned task checkを同一環境で各3回測定し、時間・最大RSS・件数を記録しなければならない（MUST）。

#### Scenario: 速度差が小さい
- **WHEN** 検証が成功し明らかな悪化が認められない
- **THEN** 特定の短縮率を要求せず、保守資産の下流残存と検証負担の削減で評価する

#### Scenario: 明らかな悪化または未測定
- **WHEN** 悪化が観測される、または必要な測定・検証が完了しない
- **THEN** 完了扱いせず、理由と必要な再判断をtasksへ記録する

#### Scenario: 修正後の再測定
- **WHEN** 通常gateのテスト入力を修正する
- **THEN** 同条件と証明できるbeforeだけを再利用してafter3回を再測定し、保守型検査の追加コストは別に記録する
