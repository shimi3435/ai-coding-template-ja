## ADDED Requirements

### Requirement: DPV-1 下流共通の品質検証
システムは SHALL、`./scripts/check.sh` と内部の `task check` を下流共通の検証として提供し、テンプレート保守文書の内容・特定 release 版・到達不能な Git 履歴に依存させない。

Node.js 24 / npm、Python >=3.14、既存 runtime / dependency / Taskfile 契約、remote / legal / links の
offline 検証を維持する。`TEMPLATE_VERSION` の存在と既存の単一行 SemVer 形式を検証し、
特定値を要求しない。自作 Skill の内容 hash lock を復活させない。
通常検証に未使用 host・認証・ネットワークを要求しない。setup の既存の dependency 取得は別である。
下流向け3リファレンスは design の移設先に保持する。
Taskfile の公開受理契約は拡張しない。R01 の専用参照検出は既存 canonical validator の
成功した構造だけを対象にし、`dir` 等の既存の未対応設定は canonical 検証で拒否する。

#### Scenario: Fresh と rename 後の通常開発
- **WHEN** 必要な runtime を準備し、fresh repository または rename 後で通常 setup と正式 gate と doctor を実行する
- **THEN** 必須検証が成立し、保守文書の内容検証を通常 gate に混入させない

#### Scenario: Prune 後と別の由来版
- **WHEN** 完全除去構成で、`TEMPLATE_VERSION` が既存形式を満たす別の版である
- **THEN** 正式 gate は削除済み保守資産も特定 release 値も要求しない

#### Scenario: 保持した機能の破損
- **WHEN** remote lock、legal、link、runtime、dependency または必須共通文書に不整合がある
- **THEN** 該当検証が非ゼロ終了し、prune 済みを理由に省略しない

#### Scenario: canonical Taskfile 契約を維持
- **WHEN** Taskfile に `dir: scripts` 等の既存 validator が許可しない設定を追加する
- **THEN** canonical 検証で拒否し、prune scanner の有効入力として受理・再解釈しない。既存の受理構文では canonical 検証後に専用参照を検査する

### Requirement: DPV-2 保守検証の明示分離
システムは SHALL、保守専用の release・履歴・出荷契約を `task check:template` に分離し、テンプレート CI で通常 gate とともに実行する。

保守専用テストは通常テストの自動収集外とし、混在する共通テストは維持する。
共通側から保守側への import を残さない。保守者は同じ二つの入口をローカルで実行できる。
同梱状態として検証する場合、保守 gate の不在や内容エラーを条件付き skip 成功にしてはならない。
完全除去では保守 gate / task / 専用 workflow の不在を正常とし、通常 gate から呼び出さない。
完全除去の条件を満たさない gate の欠落は DPV-3 の不整合として拒否する。
historical records の過去の判断・本文の改変、版更新、release-ready 判断は対象外とする。
下流文書の移設に伴う link target だけの修正は [design](../../design.md) §2 の許可表に限って認め、
本文・見出し・表示名・fragment と destination 外の bytes を保持する。
tool-neutral residual contract は design §2 の固定規則に従い、M03 / M08 の exact path token
だけを追加で許可する。同じ本文の他の旧名称残存と撤去済み公開操作の拒否は維持し、
OpenSpec / ファイル全体の新しい除外を作らない。Task 1 で契約変更を検証し、
active change を残した状態で Task 5 の gate を成功させてから close する。

#### Scenario: 同梱状態の保守検査
- **WHEN** 同梱構成で保守者が `task check:template` を実行する
- **THEN** release handoff、履歴と出荷契約、prune 統合検証を実行し、失敗を伝播する

#### Scenario: CI とローカルの対応
- **WHEN** テンプレート CI とローカル保守検証を比較する
- **THEN** 共通 gate と明示保守 gate がそれぞれ同じ検証範囲を持ち、prune smoke は保守 gate を再帰実行しない

#### Scenario: 分離後も共通検証を維持
- **WHEN** 過去 ADR の検査だけを保守側へ移す
- **THEN** 現行 policy・公開 interface・安全性・下流リンクの回帰検査は通常側に残る

#### Scenario: 完全除去後の専用 gate 不在
- **WHEN** manifest に従って完全除去され、専用 task と workflow が存在しない
- **THEN** 通常 gate はその不在をエラーにせず、専用 gate の代替成功を捏造せずに共通検証を実行する

#### Scenario: 履歴リンクの移設
- **WHEN** 下流向け3文書を移設する
- **THEN** design §2 の許可表にある destination だけを変更し、履歴の他の bytes を保持して新しいリンクを解決できる

#### Scenario: 歴史 path の限定許可と active change の検証
- **WHEN** active change の manifest または実装の固定定義に M03 / M08 の exact path token がある
- **THEN** residual contract は当該 token だけを許可し、同じファイルの他の旧名称残存は拒否する。gate 成功のために change を先に削除しない

### Requirement: DPV-3 構成に基づく完全除去の判定
システムは SHALL、現在の固定対象・専用項目・live references から同梱・完全除去・不整合を判定し、完了記録ファイルや repository の名称から状態を推測しない。

固定必須集合は design §3.1 の D01〜D04 / M01〜M19 / S01〜S03 / K01〜K08 とし、
各行の path / expected type / 必須性 / prune 時の扱いを検査する。
現存 tree から必須集合を生成せず、内容 hash は判定に使わない。
通常 gate と prune は不整合を非ゼロ終了にする。doctor は同じ状態を報告し、
不整合は既存の機械コア破損に相当する FAIL、完全除去は正常な状態として扱う。
直接参照の検出は design §3.2 の R01〜R06 と C / P / J / M 構文規則に限定する。
説明文の path / 名称、comment、単なるデータと実行参照を区別する。
負例は K05 の JSON に集約し、通常 test code / import を一括除外しない。
対応範囲外の動的 task / path / wrapper / surface の検出は保証しない。
成功を任意コードの依存解消保証と表現してはならない。
R01 は canonical 検証後に root を初期基準とし、task `dir` の受理契約を追加しない。
R03 は `step > job defaults > workflow defaults > repository root` の effective cwd を反映する。
静的に解決できる cwd で直接コマンドの相対 path を解決する。解決不能な cwd や C が認識した
`cd` / `pushd` / `popd` は design §3.2 の shell 単位で cwd 依存参照を未評価とし、root を仮定しない。
固定 root 初期化・特定ファイルの例外を作らず、cwd 非依存の専用 task 名・絶対 path は検査し続ける。
構成状態と解析範囲を分けて報告し、未評価だけでは通常 gate / doctor / preview / apply /
適用後検査 / no-op を失敗させない。検出した専用参照や既存契約違反・破損・変更保護違反の拒否は維持する。
完全除去とは固定資産・専用項目の不在と評価できた範囲での専用参照非検出であり、未評価と併存できる。
未評価を「参照なし」へ置き換えず、解析範囲・理由を示して保証を限定する。
R01〜R06 は維持し、変数・任意 wrapper・呼出元 cwd の追跡へ保証を拡張しない。

#### Scenario: 部分欠落と型破損
- **WHEN** M01〜M19 のいずれか1件の欠落、空文書、残存専用 task、空ディレクトリ、dangling symlink または壊れた共有区画がある
- **THEN** 不整合として拒否し、保守検証を黙って省略しない

#### Scenario: 操作記録なしの完全除去
- **WHEN** 固定対象と専用項目・live references がすべて除去され、下流必須資産が残っている
- **THEN** 手動除去でも完全除去と認め、通常 gate を実行できる

#### Scenario: 正常な再実行
- **WHEN** Git / HEAD / repository root の前提を満たす完全除去構成で prune を再実行する
- **THEN** 直前の削除差分が未コミットでも read-only の整合確認後に no-op 成功する

#### Scenario: 旧文書だけの prune
- **WHEN** 文書だけを削除した旧構成で、保守コードや呼出設定が残る
- **THEN** 不整合として停止し、復元後の再試行を案内する

#### Scenario: Surface ごとの直接参照
- **WHEN** R01〜R06 の保持する surface に、C / P / J / M で検出する専用参照が許可所在の外に残る
- **THEN** 対象を削除する前に不整合として拒否し、surface ID / source path / 位置を報告する

#### Scenario: 説明と負例データ
- **WHEN** 専用 path / task 名が通常 prose・path だけの code span・K05 の JSON payload にだけ存在する
- **THEN** live reference に数えず、通常 test の実行コードに同じ参照を配置した負例は検出する

#### Scenario: 動的参照の保証限界
- **WHEN** 実行先が変数や文字列結合で動的に生成され、対応する直接参照構文には現れない
- **THEN** 実行して解決せず、検査結果を指定 surface と対応構文の保証だけとして報告する

#### Scenario: 静的 cwd を反映した直接参照
- **WHEN** workflow の effective cwd が `scripts` で、直接コマンドが `python ../template-maintenance/tests/test_release_contract.py` である
- **THEN** 専用参照として拒否する。設定の上書き優先順位を適用し、同じ引数が専用資産以外へ解決される場合は専用参照と誤認しない

#### Scenario: 通常 shell と動的 cwd の解析限界
- **WHEN** 専用参照のない `cd src` と `make` の通常 script、または動的 cwd が存在し、他の構成・検証・Git・差分保護条件を満たす
- **THEN** 未評価範囲と理由を報告し、それだけでは gate / doctor / preview / apply / 適用後検査 / no-op を失敗させない。apply は固定対象だけを変更し、その script は保持する

#### Scenario: 未評価と検出済み参照の併存
- **WHEN** cwd 不明の shell 単位に、対応構文による `task check:template` または repository 内の専用資産の絶対 path 呼出がある
- **THEN** その専用参照を検出して拒否し、未評価情報も報告する。他の単位の静的相対参照や canonical 契約違反も検査から外さない

### Requirement: DPV-4 固定範囲の read-only preview
システムは SHALL、既存の `task prune-template-docs` を既定の read-only preview とし、削除・書換え・保持対象と適用可否を表示する。

対象は design §3.1 の固定削除・編集対象に限定する。`--apply` なしで変更しない。
preview は一時ファイル、Git index、host 設定、network、dependency install に副作用を持たない。
Git 未導入・管理外でも読める計画は表示するが、差分保護未確認を明示して非ゼロ終了する。
不正引数・重複引数は非ゼロ、help は変更なしで成功とする。cwd に依存しない。

#### Scenario: 正常な preview
- **WHEN** 同梱構成で引数なしの prune を実行する
- **THEN** 安定順の削除予定と共有編集差分を表示し、file bytes・mode・Git index を変更しない

#### Scenario: 適用できない preview
- **WHEN** Git がない、対象内差分がある、または構成が不整合である
- **THEN** 可能な範囲の予定と blocker を示して非ゼロ終了し、何も変更しない

#### Scenario: 公開入口の互換
- **WHEN** 既存 task または Python script を別 cwd から呼び出す
- **THEN** script の repository を対象とし、同じ引数契約・結果を提供する

### Requirement: DPV-5 Git と対象範囲による変更保護
システムは SHALL、prune の書込み前に全対象の Git 所有状態・path 安全性・共有編集範囲を検査し、対象外差分を保持する。

実変更は Git top-level と一致する working tree、HEAD、対象の追跡済み・差分なしを要求する。
同梱状態で対象が未追跡、ignored、staged、unstaged、conflict、rename または mode change の場合は
変更前に停止する。対象内の symlink、特殊 file、submodule、入れ子 Git と外部到達 path を拒否する。
完全除去の read-only no-op は DPV-3 に従う。
Git status の表示だけを信頼せず、対象の実体・mode と HEAD / index の一致も確認する。
共有ファイルの対象外部分は bytes を保持し、範囲が曖昧なら全体の変更前に停止する。

#### Scenario: 対象内の利用者作業
- **WHEN** 削除・書換え対象に未コミット変更や追加ファイルがある
- **THEN** ignored ファイルも含めて検出し、全変更を開始せず停止する

#### Scenario: 対象外差分とコミット済みカスタマイズ
- **WHEN** 対象外に差分があり、対象内のカスタマイズはコミット済みで編集範囲を一意に決められる
- **THEN** preview に対象の変更を表示し、明示 apply では対象だけを変更する

#### Scenario: 曖昧な共有設定
- **WHEN** 重複 task key、重複区画、片側 marker、構文不正、区画外の専用実行参照がある
- **THEN** テンプレート版による上書きを行わず、変更前に停止する

#### Scenario: 危険な path と文字列
- **WHEN** 対象内に外部向けまたは dangling symlink 等がある、あるいは空白・改行・Unicode を含む path がある
- **THEN** 危険な file type は拒否し、通常 path の bytes を変形せず安全に判定・表示する

### Requirement: DPV-6 失敗時の停止と対象限定の復旧
システムは SHALL、全件 preflight 後の明示 apply でのみ変更し、適用後の完全除去検査が成功した場合だけ成功を返す。

共有編集、固定削除の順に実行する。書込み直前の変化を検出したら停止する。
I/O エラーや部分失敗は非ゼロ終了し、自動 rollback、stash、commit、全体 reset / clean をしない。
捕捉可能な失敗では変更済み・失敗・未処理対象と復旧基準 commit を表示する。
複数ファイルの原子性と非協調 process への完全排他は保証対象外とする。
GitHub の PR / Issue / branch 削除と host 登録解除は行わない。

#### Scenario: 正常適用
- **WHEN** 同梱構成が全事前検査を満たし、明示 apply が成功する
- **THEN** 専用資産・呼出だけを除去し、完全除去を再検査して成功する

#### Scenario: 途中の I/O 失敗
- **WHEN** 一部の共有編集または削除後に処理が失敗する
- **THEN** 非ゼロ終了し、対象限定の復旧手順を表示して停止する

#### Scenario: 中断後の再試行
- **WHEN** kill や通常エラー後に prune を再実行する
- **THEN** 残存構成が不整合なら拒否し、完全除去なら no-op 成功する

#### Scenario: 復旧後の実行
- **WHEN** 利用者が失敗後の作業を保護し、開始時 commit から対象だけを復元して再実行する
- **THEN** 同じ事前検査を行い、対象外差分を保持したまま適用できる
