## ADDED Requirements

### Requirement: HARD-R1 stable source identity と requirement mapping を維持する
bridge は MUST MVP manifest の source identity を決定論的に拡張し、OpenSpec requirements / scenarios と
GSD phases / plans / verification evidence の対応を、再実行と並び替えを越えて検査可能にする。

#### Scenario: 新しい source item に ID を割り当てる
- **WHEN** validated canonical artifact に既存 mapping を持たない requirement または scenario が追加される
- **THEN** bridge は requirement に`REQ-000001`〜`REQ-999999`、scenario に`SCN-000001`〜`SCN-999999`の
  category別counterが示す未使用IDを割り当て、canonical POSIX source path、raw heading、親子関係、
  normalized source fingerprintを記録し、counterを戻さない

#### Scenario: source の順序または表示上の空白だけが変わる
- **WHEN** source順、ATX headingの表示上のhorizontal whitespace、CRLF / CR / LF、または
  NFC-equivalentな表記だけが変わり、正規化したsource identityと意味内容と親子関係が保たれる
- **THEN** bridge は既存IDを再利用して番号を詰めず、normalized source blockが同じなら同じfingerprint、
  blockの配置内容が変われば更新したfingerprintをmigration previewに示す

#### Scenario: 同じ source identity の意味内容が変わる
- **WHEN** category、canonical source path、normalized heading、scenarioの親requirementが同じまま、
  normalized source blockの意味内容が変わる
- **THEN** bridgeは既存IDを再利用し、変更後のfingerprint、影響mapping、再検証・再計画対象をmigration previewに示す

#### Scenario: mapping が曖昧または衝突する
- **WHEN** 一つのsourceが複数IDsに一致する、複数sourceが同じIDに一致する、active / tombstoneを跨いでIDが
  重複する、またはUnicode NFC、heading、path、親参照の正規化後に衝突する
- **THEN** bridge は ID の再割当、自動 merge、欠番再利用、heuristic mappingを行わず、衝突候補と手動解決手順を報告する

#### Scenario: source item schema または counter が不正である
- **WHEN** categoryとID prefixが一致しない、ID suffixが0・負数・7桁・noncanonical paddingである、
  counterが0・負数・非整数・1000001以上である、ID suffixが同categoryのcounter以上である、またはcounterが
  exhausted sentinel `1000000`で新規割当を要求する
- **THEN** bridgeはmanifestを変更せずfail-closedし、不正fieldまたはID枯渇を報告する

#### Scenario: source item の親参照を検査する
- **WHEN** activeまたはtombstone source itemをstrict validationする
- **THEN** bridgeはactive requirementの`parent_id`とrequirement tombstoneの`last_parent_id`をnull、
  active scenarioの`parent_id`を同じchange内のactive requirement ID、scenario tombstoneの
  `last_parent_id`を削除直前のrequirement IDとして要求する

#### Scenario: source identity を正規化する
- **WHEN** canonical Markdownからsource identityとfingerprintを生成する
- **THEN** bridgeはstrict UTF-8、LF、Unicode NFC、canonical POSIX relative path、正規化ATX heading、親ID、
  fenced code blockを考慮したbounded source blockを用い、versioned length-prefixed bytesのSHA-256 lowercase
  hexを生成し、曖昧Markdown、path / symlink escape、巨大入力を拒否する

#### Scenario: source path を入力時点の NFC に限定する
- **WHEN** current source、explicit match、またはpersisted active / tombstone itemからsource pathを受け取る
- **THEN** bridgeは各path segmentが入力時点でUnicode NFCと完全一致することをfilesystem accessより前に要求し、
  NFDだけのpath、同一入力集合内のNFC / NFD alias、およびnon-NFC pathを持つpersisted itemの再利用をfail-closedする
- **AND** bridgeは入力pathを暗黙にNFCへ変換せず、alias候補をfilesystemから探索せず、legacy recordを自動修復しない。
  source本文とheadingに対する既存のNFC-equivalent identity規則は、source pathがこの入力契約を通過した後にだけ適用する

#### Scenario: heading path または親が変化する
- **WHEN** source itemのnormalized heading、canonical source path、またはscenario parentが既存recordから変化する
- **THEN** bridgeは自動heuristicで既存IDへ紐付けず、explicit unique matchがある場合だけIDを維持し、
  それ以外はnew allocationと旧IDのtombstone化またはcollision / manual resolutionをpreviewする

#### Scenario: phase mapping の完全性を検査する
- **WHEN** GSD phase、plan、または verification evidence を handoff source へ対応付ける
- **THEN** bridge は stable ID 参照の存在、一意性、change 所属、必要 evidence の被覆を検査し、欠落・重複・cross-change 参照を拒否する

#### Scenario: phase assignment baseline を作る
- **WHEN** migration済みのstarted schema v2へsource-to-execution mappingを初めて固定する
- **THEN** bridgeは全active source IDへexactly oneの`phase_id`とcanonical repository-relative `phase_path`を割り当て、
  複数source IDsによる同じphaseの共有と未実体化の将来phaseで空の`plan_paths` / `evidence_paths`をschema-validとして
  許すが、同じsource IDの複数entries、phase ID / pathの不整合、unknown、cross-change、repo外・symlink・Unicode /
  case alias path、tombstone参照をstructured non-successとして報告する

#### Scenario: operation ごとの mapping readiness を検査する
- **WHEN** plan、execute、verify、またはfinalizeのoperation-ready判定を要求する
- **THEN** bridgeはplanでは全active sourceから対象phaseへの割当と対象`phase_path`の実在、executeでは対象phaseの
  全`plan_paths`、verifyでは対象phaseの必要`evidence_paths`、finalizeでは全active source / 全phase / 全plan / 全required
  evidenceの実在と同じchangeへの所属を要求し、horizon外の将来pathが空であることをgreen判定へ流用しない。readinessは
  各pathをno-follow、bounded、identity-checkedで検査したpoint-in-time observation resultであってatomic filesystem
  snapshotまたはleaseではなく、各pathは自身の観測時点で契約を満たさなければならない。観測中に検出したmissing、alias、
  symlink、identity changeは部分的なgreenにせず、非協調な外部processによる各pathのfinal observation後の変更までは
  保証しない。consumerは結果を将来の操作へ流用せず、実operation直前に同じreadinessとPhase 3のdrift / preflightを
  再実行し、actual mutation seamは自身のstate guardsを持つ。bridgeは失敗時に自動retry、repair、route switchを行わない

#### Scenario: MVP schema v1 の migration をpreviewする
- **WHEN** exact MVP schema v1 manifestからhardening schema v2へのmigrationを要求する
- **THEN** bridgeはv1 bytesを変更せず、stable ID割当、生成予定v2 hash、作成・更新候補、除外理由を持つ完全なread-only previewを返す

#### Scenario: manifest migration のstagingが失敗する
- **WHEN** v2 stagingの作成、write、再読、またはstrict validationが失敗する
- **THEN** bridgeはtarget v1 bytesを維持し、failure point、staging state、cleanup evidenceを返して自動rollbackまたはdowngradeを行わない

#### Scenario: unknown schema またはdowngradeを要求する
- **WHEN** disk schemaが未知、v2からv1を要求する、またはcallerがdisk schemaより低いversionを要求する
- **THEN** bridgeは既存bytesを変更せずfail-closedし、対応readerまたは明示的なmanual migrationを要求する

#### Scenario: started schema v2 の refresh をpreviewする
- **WHEN** started v2へcurrent source identity、phase assignment、canonical artifact hashes、source commit、checkbox progressを
  反映するrefreshを要求する
- **THEN** bridgeはtarget bytesを変更せず、更新前後のsource / artifact / progress / mapping、生成予定v2 hash、除外理由、
  immutable preview hashを完全に返し、`handoff_state=started`、capabilities、既存ownership、既存lifecycleを保持する

#### Scenario: started schema v2 のrefresh候補が空である
- **WHEN** current source、artifacts、progress、mappingがdisk上のstarted v2と一致する
- **THEN** bridgeはtarget bytesを変更せず、差分0件を明示した完全なno-op previewを決定論的に返す

#### Scenario: started schema v2 のrefresh previewをboundedに生成できない
- **WHEN** target v2、canonical artifact、candidate v2、またはserialized machine previewが8 MiBのlimit+1を超え、
  完全なrefresh previewを生成できない
- **THEN** bridgeはpreviewを切り捨てずstructured non-successを返し、target bytesを変更せずapplyを許可しない

#### Scenario: started schema v2 のrefresh承認がstaleである
- **WHEN** 承認されたpreview hash、disk bytes、source commit、canonical source、またはphase assignmentがapply直前のstateと一致しない
- **THEN** bridgeはtarget bytesを変更せずstructured non-successを返し、新しいread-only previewと別の明示承認を要求して
  自動retry、MVP state transition、repairを行わない

#### Scenario: started schema v2 のrefresh persistenceが失敗する
- **WHEN** approved refreshのbounded staging write、limit+1再読、strict v2 validation、またはatomic replaceが失敗する
- **THEN** bridgeはtargetの変更前hash維持を検証して停止し、維持を証明できなければstateをunknownとして報告し、
  自動rollbackを行わない

#### Scenario: started schema v2 refresh を change-wide publication として判定する
- **WHEN** started v2のrefresh previewまたはapplyを、未実体化の将来phaseを含むchange全体に対して要求する
- **THEN** bridgeはrefreshを特定operationやtarget phaseに属さないchange-wide publicationとして扱い、全active source IDが
  exactly oneの構造的に整合するmappingを持つことを要求する。source ID、phase ID / path、重複、unknown、
  cross-change、tombstone、policy referenceを含むmapping全体を検査するが、plan / execute / verify / finalize固有のreadinessを
  refreshの成功条件にせず、将来phaseの`phase_path`、`plan_paths`、`evidence_paths`がまだ実体化していないことを許す
- **AND** operation-specific readinessは既存のlifecycle operation直前契約として維持する。refreshのrebaseline acceptanceは
  固定change ID、active source / scenario / mapping count、`Phase 02`などの固定phase label、特定test fixture、または
  planning inventory / policy registryのdefault authority pathに依存しない
- **AND** active sourceが0件なら、tombstoneまたは空mappingの有無にかかわらず
  `publication-active-source-empty`のstructured failureとしてeffect前に停止する。bridgeはvacuousなexactly-one coverageを
  publication成功とせず、all-source deletionをrefreshによる正常なstate transitionとして承認しない。
  all-empty phase graphの既存比較契約とfinalize / archive後のsource消滅はこのpublication判定で変更しない

#### Scenario: refresh authority inputs を preview approval に束縛する
- **WHEN** planning inventoryとpolicy registryをauthorityとしてstarted v2 refresh previewを生成する
- **THEN** bridgeは両authorityのcanonical repository-relative pathを必須preview入力とし、各path、bounded exact bytes、
  no-followで得たfile identity、およびregistryから選択したpolicy sectionのpath / heading / canonical bytes / hash evidenceを
  preview hashへ束縛する。
  省略されたpathをdefaultで補完せず、pathだけ同じ別fileや同じ値を返す別identityを同じapprovalとして扱わない
- **AND** applyは副作用前に同じrepository anchorから両authorityをfreshに再観測し、path、bytes、file identity、policy sectionの
  いずれかがpreview時から変化した場合は旧approvalをstaleとしてtargetを変更せず、新しいpreviewと別の明示承認を要求する
- **AND** planning inventory、policy registry、選択したpolicy sourceはauthority roleを跨いでcanonical path、platformの
  Unicode / case alias key、no-followで得たdevice・inode・typeのphysical identityが互いに異なることを要求する。
  canonical pathまたはaliasの衝突は`authority-role-path-conflict`、physical identityの衝突は
  `authority-role-identity-conflict`としてpreview時とapply時のeffect前に拒否する。同じpolicy source file内の異なる
  normalized headingは許すが、同じnormalized headingの重複referenceまたはalias pathによる二重参照は拒否する。
  conflict時に自動path選択、merge、default fallbackを行わない
- **AND** applyはcollection / scalar / adapter validation後、repository anchor、policy registry、registryが参照するpolicy
  sections、planning inventoryの順にpath、identity、bounded exact bytes、strict parseまたはcanonical section evidenceを
  観測してcross-validationする。その後inventory、registry、policy sections、repository anchorの逆順でidentityとbytesを
  final recheckし、全一致直後に最初のeffectであるlock acquisitionへ進む。一つのinvocationでauthorityごとに別anchorを
  使用せず、各readの前後でdevice・inode・type・size・mtime / ctimeを含むscan identityの一致を要求する

#### Scenario: persistence adapter の全 fault を同じ taxonomy で扱う
- **WHEN** supported persistence adapterのlock、create、write、reread、validate、replace、cleanup、release、またはclose callが
  ordinary `Exception`を送出する
- **THEN** bridgeはcall位置を保持したstructured persistence failureを返し、owned stagingが作成済みまたは作成された可能性が
  ある場合はcleanupを必ず一度試行する。cleanup例外はprimary failureを上書きせず、target、staging、またはeffectの状態を
  証明できなければ`UNKNOWN`とし、adapter例外後に`Success`を返さない
- **AND** adapter callが`BaseException`を送出した場合もowned stagingのcleanupを試行し、cleanupの成否で元の
  `BaseException`を置換せず再伝播する
- **AND** `PersistenceAdapterV1`の9 callはexact nominal outcomeだけを返す。lockは
  `LockAcquired(LockHandle)` / `LockUnavailable`、createは`StagingCreated(StagingHandle)` / `StagingNotCreated`、
  writeは`WriteCompleted`、rereadは`BoundedBytes(exact bytes)`、validateは`CandidateValid` / `CandidateInvalid`、
  replaceは`Replaced` / `TargetChanged` / `LockLost`、cleanupは`Removed` / `AlreadyAbsent` / `CleanupFailed` /
  `CleanupUnknown`、releaseは`Released` / `ReleaseFailed` / `ReleaseUnknown`、closeは`Closed` / `CloseFailed` /
  `CloseUnknown`だけを許す。`BoundedBytes(b"")`はtransport observationとして受理して後続strict validationで
  `CandidateInvalid`にするが、bare `None`、`bool`、string、bytes、wrong type、foreign / empty token、attempt不一致、
  unknown outcome、oversized bytesは成功として扱わない。malformed returnは同じcall位置の
  `persistence-<call>-return-invalid` failureとし、cleanup / release / closeで生じた場合はsecondary evidenceへ記録する
- **AND** primary failure後はcleanup、release、close、fresh state observationの順に実行し、手前のsecondary failure後も
  所有する後続処理を続ける。usable handleがなく安全に試行できないcallは推測実行せず
  `<call>-not-attemptable`と`UNKNOWN`を記録する。ordinary failureでは最初のprimaryを維持し、各secondaryのcall position、
  `exception | negative-outcome | return-invalid | not-attemptable`、stable codeを発生順の最大3 semantic recordsとして保持し、
  raw exception messageをidentityへ含めない。最初の`BaseException` objectは置換せず、earlier ordinary primaryとsecondary stable codeを
  `add_note()`で付記し、後続cleanup / release / close後に同じobjectを再伝播する。`ExceptionGroup`へ置換しない

#### Scenario: replace または no-op Success を fresh canonical proof で確定する
- **WHEN** approved persistenceをatomic replaceまたはno-op `Success`として確定しようとする
- **THEN** bridgeはreturn直前にrepository anchorからcanonical parentとtargetをfreshに再観測し、preview時と同じparent identity、
  canonical target path、exact candidate bytes、およびstrict parse結果とcandidate objectの一致をすべて証明する。
  no-opでもfresh target bytesがcandidate bytesと一致することを要求する
- **AND** fresh proofの失敗、parent rebind、target pathの再解決差、canonical bytes mismatch、strict parse mismatch、または
  proof中のadapter例外は`Success`にせずstructured non-successとし、effectを証明できなければ`UNKNOWN`とする。
  final observation後の非協調な外部変更は保証せず、新しいleaseまたはtransaction契約を導入しない
- **AND** replace直前にはcanonical parent identity、target pathの再解決、current targetのbounded exact bytes、strict parseと
  approved old object / hashの一致、lockのlive状態、parent / target identityの順にguardし、全一致の場合だけconditional
  atomic replaceを行う
- **AND** cleanup、release、closeの完了後にreplace / no-op共通のfinal proofとして、fresh repository anchor、preview時と
  同じcanonical parent identity、同じcanonical target path、target descriptorから得たbounded exact bytes、strict parse、
  candidate bytes / objectとの一致、target pathとdescriptor / scan identityの再一致、parent / repository anchor identityの
  再一致をこの順に検査し、proof用resourceをcloseしてからだけ`Success`を返す。replace後に状態を証明できなければ
  `UNKNOWN`とし、ordinary exceptionはstructured non-success、`BaseException`はowned cleanup後に再伝播する
- **AND** final proofのbounded readでもread前後のdevice、inode、type、size、mtime / ctimeを含むscan identity一致を要求する

#### Scenario: policy reference のtraceabilityを検査する
- **WHEN** source mappingまたはenforcement evidenceが`adaptive-change-execution` policyを参照する
- **THEN** bridgeはcurrent-tree stable reference recordのID一意性と参照存在を検査し、strict UTF-8・8 MiB limit+1・
  LF・NFC、fence外のexactly one normalized ATX heading、同level以上の次heading境界、行末horizontal whitespaceだけの除去、
  末尾LF exactly oneを使う`adaptive-policy-section-v1`のcanonical path / heading / body length-prefixed SHA-256と
  source pathを照合し、duplicate heading、unclosed fence、path / symlink escape、Unicode / case alias、oversizeを拒否して、
  通常CIでGit履歴上の旧spec blobを要求しない

### Requirement: HARD-R2 lifecycle 操作前に source と派生状態の drift を検査する
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

#### Scenario: 完全な phase graph drift を分類して remediation を投影する
- **WHEN** `planning_inventory`、source commitで`observe_phase_graph(..., source_commit)`が返した
  `expected_nodes`、およびcurrent treeの`observed_nodes`を比較する
- **THEN** bridgeはexpected / observed graphを互いに独立してruntime shape、canonical scalar、node / edge各4096件、
  canonical aggregate 8 MiB、duplicate node / edge、self-edge、unknown dependency、cycleまで検査する。
  malformed、不完全、または検査不能ならidentityとremediation projectionのない`UNKNOWN`とし、上限の
  N-1 / Nは受理してN+1は`UNKNOWN`とする。`observed_nodes`はcurrent treeの正本である
  `planning_inventory.phases`と完全一致させ、`expected_nodes`はsource-pinned observationとし、
  `expected_inventory`または同等の第二のinventoryを要求しない
- **AND** 両graphが完全なら、両方空はgraph比較として`CLEAN`、expectedだけ空は全observed phaseのadd、
  observedだけ空は全expected phaseのremoveとして`DRIFTED`にする。0 / 1 phase、全phase削除、add / remove /
  path / dependencyの同時変更を通常の完全な比較として扱い、dependency tupleの順序だけの違いはdriftにしない。
  同じphaseにpathとdependencyの両変更があれば両issueを保持する
- **AND** 完全な差分は`DRIFTED`、`admitted=false`、再利用可能なdecision identityを返す。downstreamは
  expected / observed graphのnodeと旧edge / 新edgeの和集合で求め、added phaseは自身とdownstream、
  path / dependency changed phaseは自身と旧新いずれかで影響を受けるdownstream、removed phaseは自身と
  downstreamをreplanning候補に含める。各変更phase自身をrevalidation targetにし、最終replanning targetは
  変更phaseとdownstreamの和集合をobserved graphと積集合したものに限定し、
  全phase削除またはtargetとdownstreamの同時削除で空になれば`replan-affected-phases`を出さず
  `revalidate-mapping`だけをgraph drift actionとして返す
- **AND** issues、revalidation targets、replanning targets、next action codesをそれぞれset-likeに重複排除して
  UTF-8 bytes順に整列し、input tupleの順序にかかわらず同じprojectionとdecision identityを返す

#### Scenario: lifecycle target phase を分類する
- **WHEN** lifecycle gateが必須のtarget phaseをexpected / observed graphと照合する
- **THEN** bridgeはtargetのruntime shapeとcanonical phase ID scalarをgraph比較とmapping readinessより先に検査し、
  空文字、`None`、wrong type、その他malformed targetをidentityとremediation projectionのない`UNKNOWN`、
  next action `lifecycle-input-invalid`として停止する
- **AND** valid targetをexpectedにだけ持つ場合は`DRIFTED`、issue `phase-removed:<id>`、next action
  `lifecycle-target-phase-removed`、observedにだけ持つ場合は`DRIFTED`、issue `phase-added:<id>`、
  両方に持つ場合はtarget relation自身のissue / actionを追加せずgraph全体の差分に従い、両方に持たない場合は
  identityなしの`UNKNOWN`、next action `lifecycle-target-phase-unknown`とする。
  `lifecycle-target-phase-removed`と`lifecycle-target-phase-unknown`はnext action codes専用でissue codesへ複製しない
- **AND** targetが変更phaseと一致するか否かにかかわらずtarget relationを先に確定し、その他のgraph changesを
  別に集約する。expected-only targetはmapping readinessより先にidentityありの`DRIFTED`として保持し、
  targetとdownstreamがすべて削除済みなら`replan-affected-phases`を出さず、
  `revalidate-mapping`と`lifecycle-target-phase-removed`を返す。同じvalid inputの再実行は同じ分類、
  projection、decision identityを返す

#### Scenario: mapping artifact の path role を分離する
- **WHEN** phase、plan、evidence pathを持つ`PlanningInventory`、またはそこから派生した
  `ManifestMapping`をlifecycle gateへ入力する
- **THEN** bridgeはruntime shape、canonical scalar、PlanningInventoryの4096件 / canonical aggregate 8 MiB上限を
  検査してからrole disjointnessを検査し、その後にだけfilesystem observation、readiness、hash、identity生成へ進む。
  pathは非空のcanonical POSIX repository-relative pathだけを許し、backslash、absolute path、空、
  `.` / `..` component、NUL、wrong type、malformed encodingを暗黙に正規化せず拒否する
- **AND** phase / plan / evidenceのpath roleを互いに素とし、phase=plan、phase=evidence、plan=evidenceの
  exact collision、Unicode NFC / NFD alias、case alias、
  plan artifact自身のevidence利用、および同じevidence pathを複数の`EvidenceDeclaration`へ分割する入力を拒否する。
  separator変形や`.` / `..`の除去後に別pathと一致し得る入力はcanonicalizeして受理せず、形式不正として先に拒否する。
  一つの独立したevidence artifactが同一宣言内でsourceとplanの両ownerを持つことと、同じownerが異なる
  evidence pathsを持つことは許可する
- **AND** `PlanningInventory`のcross-role collisionまたは同一evidence pathの宣言分割は
  `mapping-path-role-conflict`、public builderを迂回して直接構築されたderived `ManifestMapping`の同じ
  role不変条件違反は`mapping-set-invalid`として報告する。malformed / oversizeは既存のdimension-specificな
  structured failure codeを維持する。lifecycle gateはこれらの不正構造をdecision identityとremediation projectionの
  ない`UNKNOWN`として停止し、public contract testからfilesystem boundaryのcall countが0であることを観測可能にする

#### Scenario: 検査を完了できない
- **WHEN** artifact read、Git inspection、manifest parse、phase inspection、または capability probe の一部が失敗・timeout・切捨てになる
- **THEN** bridge は部分的な green 判定を採用せず、malformed、不完全、または検査不能なgraphだけを
  decision identityとremediation projectionのない`UNKNOWN`として操作を停止し、完全なexpected / observed graphの
  差分を`UNKNOWN`へ縮退させない

#### Scenario: public Result と decision API の ordinary exception を閉じ込める
- **WHEN** packageが公開する任意の`Result` APIまたはdecision APIで、malformed root / scalar、property getter、adapter method、
  callback、hash / serialization、または`Sequence` traversalがordinary `Exception`を送出する
- **THEN** bridgeは`Result` APIではstructured `Failure`、decision APIではdecision identityとremediation projectionのない
  `UNKNOWN`へ変換し、例外前に得た要素や観測をpartial result、partial green、または再利用可能なidentityとして返さない
- **AND** この境界契約を全public APIのroot / scalar / getter / method / callback / hash / serialization /
  `Sequence` matrixで検証し、
  `BaseException`だけは必要なowned-resource cleanup後に元の例外を再伝播する
- **AND** public inventoryはsemantic operation単位で管理し、read、preview、apply、observation、ownership、resume、finalizeと
  custom persistence unionを`Result` API、canonical driftとlifecycle admissionをdecision APIとして分類する。
  root `__all__`だけ、全non-underscore symbol、または現時点の関数名だけからinventoryを導出しない
- **AND** boundary failure後の新しいinvocationはroot validation、freeze、mutable observationをすべてfreshに再実行し、
  前attemptのsnapshot、identity、remediation、partial observationを再利用しない。effect-capable failure後のretryはfresh
  previewと別の明示承認を要求する

#### Scenario: collection と adapter を effect 前に bounded freeze する
- **WHEN** public APIがcollection、途中で例外を送出する`Sequence`、またはpersistence / observation adapterを受け取る
- **THEN** bridgeは外部effectより前にroot shape、scalar、collection protocol、件数、canonical aggregate bytes、adapter supportを
  検査し、collectionをbounded immutable snapshotへ一度だけfreezeする。malformed collection、freeze途中のordinary
  `Exception`、またはunsupported adapterはstructured invalid、decision APIではidentityのない`UNKNOWN`として停止する
- **AND** validation後の処理はfreeze済みsnapshotだけを利用し、元collectionを再走査せず、拒否時はadapter call、filesystem
  access、lock、staging createを含むeffectが0件であることをpublic contract matrixから観測可能にする。
  adapter supportはeffectを伴うduck-typing probeではなく、明示されたsupported contractだけで判定する
- **AND** public collectionは`collections.abc.Sequence`だけを受理し、`str` / `bytes` / `bytearray`、generic iterable、
  generator、set、mappingをcollectionとして受理しない。persisted / internal immutable stateはexact tupleだけを受理する。
  observation adapterは`ObservationAdapterV1`としてsource commit、phase graph、capability、authority observationから
  `Success[exact immutable observation] | Failure`だけを返し、persistence adapterは`PersistenceAdapterV1`とする。
  builtinまたはnominal subclassだけをsupportedとし、virtual registration、structural protocol判定、method probeを行わない。
  明示callback / command runnerだけは`callable()`確認後にexact immutable returnを検査する
- **AND** いずれかのmethod callを開始したadapter instanceは新invocationへの再投入について消費済みとする。pure validationで
  adapter call 0のまま拒否した場合だけ同一instanceを再投入できる。exact immutable tupleは新invocationへ再投入できるが
  毎回再検証し、それ以外の`Sequence`はtraversal開始後attempt-scoped、retry時のadapterはfresh instanceを要求する
- **AND** source paths / files / artifacts collectionはemptyと`None`を拒否し、optional auxiliary collectionはemptyを許すが
  `None`を拒否する。optional auxiliaryは`explicit_matches`、exclusions、任意policy referencesを含む。active、tombstones、
  mappings、phases、assignments、plans、evidence、policy observations、graph nodes / edges、ownership references、
  checkpoint / effect recordsを含むcomplete-state collectionはemptyをshape-validとするが`None`を拒否する。
  `previous_source_items=None`だけはbootstrap emptyを表す。authoritative inputでsemantic keyが重複した場合は内容が同じでも
  拒否し、silent dedupeまたはfirst / last winsを行わない。source / assignment / policy / checkpoint / effect / receiptは
  stable ID、artifact / phase / plan / evidence / authorityはcanonical pathとalias key、graph nodeはphase ID、edgeは
  `(from, to)`、explicit matchはsource locatorとtarget source ID、mappingはsource IDをsemantic keyとする。multi-ownerは
  単一record内の明示だけを許し、set-like dedupeはissue codes、changed IDs、revalidation / replanning targets、next actionsの
  output projectionだけに適用する
- **AND** 既存domainのcount / bytes boundsを維持し、新しいcomplete-state documentは4096 records / 8 MiB、artifact
  collectionは64 files / 4 MiBを上限とする。nested collectionは親budgetへ算入し、parameterごとに独立budgetを再付与せず、
  超過時に切り捨てない。新しいpublic limitはexact frozen limits dataclassのexact `int` fieldとして1以上field hard maximum
  以下だけを受理し、callerは縮小だけできる。`bool`、`int` subclass、float、`None`を拒否する
- **AND** Gate Eで新設するstructured collectionのaggregate bytesは`gate-e-collection-v1`としてtype tag、field tag、
  collection semantic name、8-byte big-endian length framing、8-byte item count、固定field順でencodingしたstream全長を数える。string / enumは
  検証済みexact UTF-8、pathは入力時NFC検証済みcanonical POSIX UTF-8、bytesはexact bytes、integerはcanonical ASCII
  decimal、boolはintegerと区別した`T` / `F`、`None`は明示Optional fieldだけの`N`としてencodeする。JSON、`repr()`、
  pickle、delimiter-only連結、platform encodingを使わず、既存Gate D encoding / metricは変更しない。
  unordered inputはvalidation後にcanonical sortし、task、journal、effect、receipt、secondary failureは入力順を保存する。
  persisted authorityのnoncanonical orderは拒否し、graph identityにtopological orderを用いない
- **AND** bridgeは`len()`を一度、`iter()`を一度だけ呼び、`next()`をcount上限N+1回まで、encodingをbytes上限B+1までで
  停止し、各item field getterを一度だけ読む。
  `len()`のordinary exception / non-integer / negative / overflowは`collection-length-invalid`、reported lengthが
  N超過ならtraversal前に`collection-count-limit-exceeded`、reported lengthがN以下でもN+1番目を得た場合または終了時の
  observed count不一致は`collection-length-mismatch`、B+1到達は`collection-byte-limit-exceeded`、`iter()` / `next()` /
  item getter / encodingのordinary exceptionは`collection-traversal-failed`、bounded snapshot / encodingの`MemoryError`は
  `collection-resource-exhausted`とする。partial snapshotは破棄し、`BaseException`は再伝播する。単一call自体が永久に
  blockする場合、OS kill、process terminationの停止 / 結果化は保証しない

#### Scenario: Phase 3 public contract の互換性を維持する
- **WHEN** phase graph authority、target phase分類、またはpath role separationを実装する
- **THEN** bridgeは`PhaseGraphObservation`へfieldを追加せず、`lifecycle-gate-decision-v1`とschema / versionを維持し、
  valid clean decisionの既存identity bytesを変えない。完全なgraph driftの`UNKNOWN`から`DRIFTED`への変更は
  既存契約の回復としてschema bumpを行わず、同じvalid inputの再実行は同じoutputsとidentity、valid driftは
  input tuple順序によらない決定的identityを返す。意図的な非互換は従来誤って受理されていたinvalid graph /
  path-role inputの拒否だけとする
- **AND** 保存済みdecisionをreplayするときはcurrent inputからfresh decisionを再計算し、保存済みidentityと
  不一致ならidentityありの`DRIFTED`、issue `lifecycle-decision-stale`として扱う。
  malformed、不完全、検査不能なinputを`UNKNOWN`とした場合だけidentityを返さない

#### Scenario: Phase 3 の完了を判定する
- **WHEN** HND-03 / HARD-R2の後続実装を完了扱いにする、またはPhase 4へ進もうとする
- **THEN** projectはphase graph drift contractとpath role separationを別々のTDD planとして実行し、固定public
  contract testsとHypothesis propertiesのREDからGREENへの証拠を作る。5つのscenario追加でcanonical active source
  items / mappingsが49から54、scenario headingsが43から48になったsource-pinned handoff manifest、旧49-ID mapping /
  expected preview fixture、lifecycle golden / tracked evidenceその他の派生authorityのrepinはphase graph drift contract
  planが一括所有し、path role separation planは再repinしない
- **AND** phase graph drift contract planはpure graph / remediationのHypothesis propertiesと固定public examples、
  path role separation planはcanonical path-roleのHypothesis propertiesと固定builder / readiness / gate examplesを
  所有する。I/Oとfilesystem raceはHypothesisへ入れず固定integration exampleで観測中のraceを検証する
- **AND** `task check`成功、code review reportが存在してstatus `clean`かつCritical 0 / Warning 0、verifier reportが
  存在して`passed`かつ10/10、`behavior_unverified: 0`、`overrides_applied: 0`、HND-03 / HARD-R2 traceability
  `Complete`、security reportが存在してopen threats 0をすべて満たすまでPhase 3を未完了としてPhase 4を開始しない。
  いずれかのevidenceの欠落、失敗、未実行も未達とする
- **AND** 上記の固定changeに対する49→54 active mappings、43→48 scenario headings、旧49-ID mapping、Plan A / B、
  fixture repinはGate D時点のsource-pinned execution evidenceとして保持するが、後続のPhase 3 rebaseline acceptanceは
  固定change ID / count / `Phase 02` / test fixture / default authority pathを前提にせず、本requirementへ追加した7 scenariosの
  public API matrix、persistence fault matrix、fresh proof、NFC fail-closed contractを任意の正規入力に対して満たすことを要求する

### Requirement: HARD-R3 複数 manifests 間の artifact ownership を検査する
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

### Requirement: HARD-R4 interruption と partial failure から検査可能に再開する
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

### Requirement: HARD-R5 finalize と cleanup を preview と承認で制御する
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

### Requirement: HARD-R6 hardening を deterministic tests と opt-in smoke で検証する
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

#### Scenario: filesystem と Git の integration tests を実行する
- **WHEN** migration persistence、repository-wide ownership、recovery、またはfinalizeの副作用境界を検証する
- **THEN** testsはisolated repositoryとfault injectionを使い、path escape、partial failure、v1保持、receipt、再実行のpostconditionを外部OpenSpec / GSD toolsなしで検証する

#### Scenario: 実 tools の smoke を実行する
- **WHEN** 開発者が対応 versions と隔離 workspace を用意して opt-in smoke を明示する
- **THEN** smoke は probe、fixture handoff、drift detection、interrupted resume、no-op finalize を実行し、versions / signals / 未検証項目を報告する
