## ADDED Requirements

### Requirement: stable source identity と requirement mapping を維持する
bridge は MUST MVP manifest の source identity を決定論的に拡張し、OpenSpec requirements / scenarios と
GSD phases / plans / verification evidence の対応を、再実行と並び替えを越えて検査可能にする。

#### Scenario: 新しい source item に ID を割り当てる
- **WHEN** validated canonical artifact に既存 mapping を持たない requirement または scenario が追加される
- **THEN** bridge は category 内の単調増加する未使用 ID を割り当て、source path、raw heading、親子関係、fingerprint を記録する

#### Scenario: source の順序または表示上の空白だけが変わる
- **WHEN** 正規化した source identity が一意に一致し、意味内容と親子関係が保たれる
- **THEN** bridge は既存 ID を再利用し、番号を詰めず、更新した fingerprint を migration preview に示す

#### Scenario: mapping が曖昧または衝突する
- **WHEN** 一つの source が複数 IDs に一致する、複数 source が同じ ID に一致する、または Unicode 正規化後に衝突する
- **THEN** bridge は ID の再割当、自動 merge、欠番再利用を行わず、衝突候補と手動解決手順を報告する

#### Scenario: phase mapping の完全性を検査する
- **WHEN** GSD phase、plan、または verification evidence を handoff source へ対応付ける
- **THEN** bridge は stable ID 参照の存在、一意性、change 所属、必要 evidence の被覆を検査し、欠落・重複・cross-change 参照を拒否する

#### Scenario: MVP schema v1 の migration をpreviewする
- **WHEN** exact MVP schema v1 manifestからhardening schema v2へのmigrationを要求する
- **THEN** bridgeはv1 bytesを変更せず、stable ID割当、生成予定v2 hash、作成・更新候補、除外理由を持つ完全なread-only previewを返す

#### Scenario: manifest migration のstagingが失敗する
- **WHEN** v2 stagingの作成、write、再読、またはstrict validationが失敗する
- **THEN** bridgeはtarget v1 bytesを維持し、failure point、staging state、cleanup evidenceを返して自動rollbackまたはdowngradeを行わない

#### Scenario: unknown schema またはdowngradeを要求する
- **WHEN** disk schemaが未知、v2からv1を要求する、またはcallerがdisk schemaより低いversionを要求する
- **THEN** bridgeは既存bytesを変更せずfail-closedし、対応readerまたは明示的なmanual migrationを要求する

#### Scenario: policy reference のtraceabilityを検査する
- **WHEN** source mappingまたはenforcement evidenceが`adaptive-change-execution` policyを参照する
- **THEN** bridgeはcurrent-tree stable reference recordのID一意性、source path、section hash、参照存在を検査し、通常CIでGit履歴上の旧spec blobを要求しない

### Requirement: lifecycle 操作前に source と派生状態の drift を検査する
bridge は MUST plan、execute、resume、verify、finalize の各操作前に、canonical source、source commit、
manifest、stable mapping、phase state、capability evidence を同じ検査契約で照合する。

#### Scenario: canonical specification が変化する
- **WHEN** proposal、design、spec delta、または checkbox 状態以外の `tasks.md` の正規化 hash が記録値と異なる
- **THEN** bridge は対象操作を書込前に停止し、変化した artifacts / source items と再検証・再計画対象を列挙する

#### Scenario: tasks の checkbox 状態だけが変化する
- **WHEN** `tasks.md` の正規化内容は同じで checkbox progress だけが変化する
- **THEN** bridge は仕様 drift とせず、進捗 snapshot の更新候補として分離して報告する

#### Scenario: phase graph または capability evidence が変化する
- **WHEN** phase の追加・削除・依存変更、source commit 不一致、manifest schema 不一致、または必要 capability signal の変化を検出する
- **THEN** bridge は影響する操作を禁止し、再probe、migration、mapping 更新、影響 phases の再計画のうち必要な手順を示す

#### Scenario: 検査を完了できない
- **WHEN** artifact read、Git inspection、manifest parse、phase inspection、または capability probe の一部が失敗・timeout・切捨てになる
- **THEN** bridge は部分的な green 判定を採用せず、drift state を unknown として操作を停止する

### Requirement: 複数 manifests 間の artifact ownership を検査する
bridge は MUST repository 内で有効な全 handoff manifests を照合し、各派生 artifact の所有と参照を
単独所有、共有参照、競合所有、由来不明に分類してから変更候補を作る。

#### Scenario: artifact が一つの manifest に所有される
- **WHEN** repo 内 real path が一つの有効 manifest の owned artifacts にだけ含まれ、他 manifest から参照されない
- **THEN** bridge は所有根拠と manifest identity を示し、その owner の操作候補に含められる

#### Scenario: artifact が共有参照される
- **WHEN** artifact は一つの manifest が所有するが、別の有効 manifest または repository document が参照する
- **THEN** bridge は共有参照として保持し、参照更新が検証されるまで cleanup 候補から除外する

#### Scenario: ownership が競合または不明である
- **WHEN** 複数 manifests が同じ artifact を所有する、owner manifest が欠落・破損する、または artifact の由来を証明できない
- **THEN** bridge は変更・移動・削除を禁止し、競合 manifests、paths、手動解決条件を列挙する

#### Scenario: path が所有境界外へ解決される
- **WHEN** relative path、symlink、Unicode / case 正規化、または traversal により path が repo root 外または宣言した ownership root 外へ解決される
- **THEN** bridge は path を拒否し、追跡や cleanup のために追従しない

#### Scenario: lifecycle record のownerを分類する
- **WHEN** handoff brief、checkpoint、receipt、archive、phase、plan、またはverification evidenceを永続化する
- **THEN** bridgeはmanifest pathから一意に決まるchange ownerへderived artifactを所属させ、canonical OpenSpecとpolicy docsは参照として保持し、明示的な所有解除なしに別changeへ移管しない

#### Scenario: template change をpre-merge closeする
- **WHEN** 対象changeと追跡manifestをpre-mergeで削除するpreviewを生成する
- **THEN** bridgeは同じchangeが所有するcheckpoint、receipt、一時archiveとbriefを同じownership graphで列挙し、shared referenceまたは出荷archiveの明示的な再分類が残る間は削除を拒否する

### Requirement: interruption と partial failure から検査可能に再開する
skill と bridge は MUST lifecycle 操作の checkpoint、completed effects、pending effects、failure evidence を
永続化し、resume 前に現在状態との一致を再検査する。

#### Scenario: 操作が副作用前に中断する
- **WHEN** preflight または preview 中に中断し、永続 artifact を変更していない
- **THEN** recovery は安全な no-op checkpoint として記録し、同じ入力から preflight を再実行する

#### Scenario: 操作が一部成功して中断する
- **WHEN** manifest migration、参照更新、archive、または cleanup の一部だけが成功する
- **THEN** bridge は各 effect の完了証拠、残存状態、次の安全な再開点を記録し、未確認操作を完了扱いしない

#### Scenario: resume 時に source または capability が変化する
- **WHEN** checkpoint 後に canonical source、Git state、manifest set、phase graph、または必要 capability が変化する
- **THEN** skill は古い recovery plan を実行せず、drift / ownership 検査へ戻して新しい preview と承認を要求する

#### Scenario: 自動回復で収束できない
- **WHEN** effect の成否が不明、rollback が破壊的、route 変更が必要、または ownership を証明できない
- **THEN** skill は自動 rollback、自動 route switch、自動修復を行わず、既知状態と人が選べる回復案を報告する

### Requirement: finalize と cleanup を preview と承認で制御する
bridge は MUST finalize / cleanup の対象、所有根拠、参照更新、実行順序、予想差分を副作用なしで preview し、
preview に結び付いた明示承認と直前再検査後にだけ実行する。

#### Scenario: finalize preview を生成する
- **WHEN** lifecycle hardening の前提と参照先 policy gate が満たされ、finalize が要求される
- **THEN** bridge は create / update / move / archive / delete 候補、owner、参照影響、実行順序、除外理由を完全な機械可読 preview と人向け要約で返す

#### Scenario: preview 対象が空である
- **WHEN** cleanup 対象も参照更新も存在しない
- **THEN** bridge は空の no-op preview を成功として返すが、finalized receipt は承認と直前再検査後にだけ記録する

#### Scenario: preview 後に状態が変化する
- **WHEN** preview hash、source、manifest set、ownership、Git state、または参照 graph が承認時・実行時に一致しない
- **THEN** bridge は承認を期限切れとして拒否し、新しい preview を要求する

#### Scenario: finalize が部分失敗する
- **WHEN** 承認済み操作列の途中で filesystem、Git、archive、reference validation のいずれかが失敗する
- **THEN** bridge は以後の操作を停止し、完了・未完了・不明な effects と再開 checkpoint を receipt に記録する

### Requirement: hardening を deterministic tests と opt-in smoke で検証する
プロジェクトは MUST stable identity、drift、mapping、ownership、recovery、finalize を固定 fixtures で検証し、
実 OpenSpec / GSD 互換性の確認を通常 CI から分離する。

#### Scenario: optional tools なしで通常 CI を実行する
- **WHEN** OpenSpec CLI または GSD がない環境で project checks を実行する
- **THEN** manifest migration、ID allocation、mapping、normalization、ownership graph、checkpoint、preview の fixtures / tests は外部 tool を起動せず成功する

#### Scenario: malformed・境界・順序違い fixtures を検証する
- **WHEN** empty、duplicate、Unicode、reverse order、oversized、corrupt、partial failure の fixtures を入力する
- **THEN** tests は各 requirement の fail-closed 結果、決定性、冪等性、出力上限時の停止を検証する

#### Scenario: property tests を実行する
- **WHEN** pure allocator、normalizer、manifest round-trip、ownership graph、preview builder を任意の有効入力で検証する
- **THEN** stable assignment、order independence、round-trip、idempotence、ownership safety の不変条件を満たす

#### Scenario: 実 tools の smoke を実行する
- **WHEN** 開発者が対応 versions と隔離 workspace を用意して opt-in smoke を明示する
- **THEN** smoke は probe、fixture handoff、drift detection、interrupted resume、no-op finalize を実行し、versions / signals / 未検証項目を報告する
