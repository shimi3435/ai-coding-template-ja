## Context

先行 `revise-openspec-gsd-execution-boundary` は `adaptive-change-execution` policy を定め、MVP
`automate-openspec-gsd-handoff` は discovery、canonical Markdown read、progress、最小 manifest、preflight を
提供する。本 change はその上に長期 lifecycle の機械検査だけを追加する。OpenSpec 原本の最終検証、
一つの phase と一つの change の対応、route switch の承認など、先行 policy の MUST はここで再定義しない。

`handoff.json` の commit / gitignore、保持、archive 方針は MVP の契約を入力として受ける。本 change が
独自の保存場所や追跡 semantics を決めると resume の正が二重化するため、dependency gate で整合を確認する。

## Goals / Non-Goals

**Goals:**

- requirement / scenario の ID を source の並び替えや中断を越えて安定させる。
- source-to-phase / plan / evidence mapping と lifecycle drift を操作前に検査する。
- 複数 manifests の ownership と共有参照を repository 全体で検査する。
- partial failure から既知状態を失わず、preview と再承認を経て再開できるようにする。
- finalize / cleanup の副作用を完全 preview、直前再検査、receipt で制御する。

**Non-Goals:**

- `adaptive-change-execution` の policy、route、acceptance、close 条件を変更・複製しない。
- MVP の artifact discovery、Markdown reader、progress parser、基本 capability probe を作り直さない。
- 意味的に変更された requirement を heuristic で同一視しない。
- 自動 route switch、destructive rollback、所有不明 artifact の修復・削除を行わない。
- `handoff.json` の追跡・保持方針をこの change で再決定しない。

## Decisions

### Gate A. MVP v1とhandoff開始契約を固定する

以下はdependency commit `d96e451`に固定したMVP manifest schema v1の契約snapshotである。実装時は
merge済みreader / writerのfixturesとの一致を検査し、表だけを独立したschema正本として扱わない。root fieldsは
次の7件だけで、追加fieldを許すextension pointはない。

| root field | v1 value contract |
| --- | --- |
| `schema_version` | integer `1` |
| `change_id` | 1〜128 byte ASCII lower-kebab |
| `handoff_state` | `prepared` または `started` |
| `artifacts` | schema上は1〜64件のexact `{kind,path,sha256}`。kind構成制約により実効最小4件（proposal / design / tasks各1・spec 1以上）、`kind/path`順 |
| `source_commit` | 40文字lowercase hex commit |
| `progress` | exact `{total,complete,remaining,tasks}`、1〜4096 tasks |
| `capabilities` | exact `{openspec,gsd,host}` |

`progress.tasks`はexact `{id,description,done}`、`capabilities.openspec`はexact
`{version,probe,schema_name,input_route}`、`capabilities.gsd`はexact
`{version,probe,project_initialized,entrypoint}`、`capabilities.host`はexact
`{spawn_agent_schema,dispatch,agent_role_source}`だけを許す。rootを含む全objectはunknown fieldを拒否する。
永続化は最大8 MiBのlimit+1 read、
stagingへのcanonical serialize、bounded再読とstrict parse、`os.replace`の順で行う。許可遷移は
manifest不在→`prepared`と、内容を変えない`prepared`→`started`だけで、`started`からの再遷移、
上書き、完了 / finalize stateはない。

`.planning/openspec/<change-id>/handoff.json`はcanonical artifactsを固定したsource commitの後続commitで
feature branchへ追跡する復帰用索引であり、仕様の正本ではない。`.planning/`がignoreまたはrepository
policy上untrackedならprepare前に停止する。テンプレート自身では対象changeとともにpre-mergeで削除し、
自動archive / cleanupは行わない。

OpenSpec入力は1.3.1 exactのJSON candidateをdiscovery / progress metadataにだけ使い、canonical本文は
Markdownから読む。candidate不整合は入力を混ぜず`markdown-fallback`を最初から実行するが、valid candidateの
`blocked` / `missingArtifacts` / `all_done`はfallbackで隠さない。GSD capabilityは1.5.0 exactのVERSION、
required files、`init progress --raw`のstructured signal、対象repository root、agents complete、全falseまたは
全trueの初期化状態の複合signalである。public operationsはread-only `inspect`、明示承認後の`prepare`、
structured host successとroute別postcondition後だけの`mark-started`に固定する。generic host workaroundは
selected workflow、全reachable spawn、active TOMLの完全role preamble、全isolation要件をpreview前に解決できる
場合だけ許可し、不明・typed-only・worktree-isolated・非互換ならfail-closedする。

### Gate B. hardening schema v2はv1の明示migrationとして導入する

v1にextension pointがないため、hardeningはv1へfieldを足さずschema version `2`を導入する。v2 rootはv1の
7 fieldsを同じ意味で保持し、次の4 fieldsを加えたexact 11 fieldsとする。

| v2 field | exact value contract |
| --- | --- |
| `source_items` | exact `{next_requirement_id,next_scenario_id,active,tombstones}` |
| `mappings` | stable source IDごとのexact mapping entry配列 |
| `ownership` | exact `{owned,referenced}`のpath declaration |
| `lifecycle` | exact `{checkpoints,receipts,archives}`のrecord reference |

active source itemはexact `{id,category,source_path,raw_heading,parent_id,fingerprint}`、tombstoneはexact
`{id,category,last_source_path,last_raw_heading,last_parent_id,fingerprint}`とする。`category`は
`requirement` / `scenario`だけを許す。requirement IDは`REQ-`と6桁zero-padded decimalを結合した
`REQ-000001`〜`REQ-999999`、scenario IDは同様の`SCN-000001`〜`SCN-999999`に固定し、categoryとprefixの
一致を要求する。`0`、負数、6桁でないpadding、wrong prefix、非ASCII、範囲外suffixは拒否する。
IDは一つのmanifest / change内で`active`と`tombstones`を通して一意である。

`next_requirement_id` / `next_scenario_id`は各categoryで次に割り当てるsuffixを示すintegerである。初期値は`1`、
割当可能範囲は`1..999999`とし、割当後に1増やす。`1000000`は割当不可のexhausted sentinelであり、
`1000001`以上、`0`、負数、非整数を拒否する。counterより小さいsuffixだけが同categoryのactive / tombstoneに
存在でき、削除時もcounterを戻さず欠番を再利用しない。counterが`1000000`なら新規割当はfail-closedする。

active requirementの`parent_id`は`null`、active scenarioの`parent_id`は同じmanifest / change内にあるactive
requirement IDを必須とする。tombstoneの`last_parent_id`はrequirementなら`null`、scenarioなら削除直前に
参照したrequirement IDを保持し、親requirementもtombstoneになった後のidentity再利用・衝突検査に使う。
mapping entryはexact `{source_id,phase_id,phase_path,plan_paths,evidence_paths,policy_references}`とし、
namespaced `source_id`だけでcategoryを含めず一意に参照できる。migration直後の空mappingはschema-validだが
plan / execute等のoperation-readyではない。

source itemはUTF-8をstrict decodeし、invalid UTF-8を拒否する。`source_path`は各segmentをUnicode NFCにした
repository root内のcanonical POSIX relative pathとし、空path、absolute path、`.` / `..` segment、backslash、NUL、
repo外解決、symlink escape、Unicode / platform case alias collisionを拒否する。source textはCRLFとCRをLFへ
変換してUnicode NFCにする。`raw_heading`はstrict decodeした原文heading lineをline terminatorなし、ATX marker
を含む形でNFC / whitespace normalization前のまま保持する。identity用headingはopening markerと任意のclosing
markerを除き、外側のhorizontal whitespaceを除去し、内部のhorizontal whitespace runをsingle ASCII spaceへ
正規化する。horizontal whitespaceはU+0009とUnicode category `Zs`に限定し、改行を空白へfoldしない。
ここでsource pathの「各segmentをUnicode NFCにした」はnon-NFC入力を変換して受理する意味ではない。各segmentが
入力時点でNFCと完全一致することをfilesystem access前に検査し、NFD-only、NFC / NFD alias、non-NFC persisted
recordを拒否する。暗黙正規化、alias探索、legacy recordの自動修復は行わない。source textとheadingのNFC正規化は、
このpath入力契約を通過した後にだけ適用する。

normalized source blockは対象ATX heading直後から、fenced code block外にある次の同level以上のATX heading直前まで
とする。fenced code block内のheading-like textは境界にしない。blockは各line末尾のhorizontal whitespaceだけを
除去し、leading indentation、先頭・内部のblank lines、内部改行、タブ等のcontentを保持し、末尾newlineをexactly
oneにする。閉じていないfence、同じsource itemに解釈できるheadingの重複、unsupported / ambiguous Markdown、
bounded readで全blockを確定できない入力はfail-closedする。

normalized source identityは順に`category`、canonical `source_path`、normalized heading、scenarioでは
`parent_id`（requirementでは`null`）から作る。fingerprintは、version tag `openspec-source-v1\0`、これらの
identity components、normalized source blockをこの順で並べ、各componentを8-byte unsigned big-endian lengthと
UTF-8 bytesの組として結合したbytesのSHA-256 lowercase hexとする。`null` parent componentはzero-length bytesで
表す。source順、表示上のheading空白、line ending、NFC-equivalentな表記だけの変更はidentityを維持する。
normalized source blockも同じならfingerprintを維持し、同じidentityのblock内容が変われば同じIDを維持して
fingerprint更新をpreviewする。heading、path、scenario parentの変更はheuristicで紐付けず、既存recordとの
explicit unique matchがない限りnew allocationと旧IDのtombstone化、またはcollision / manual resolutionを要求する。

ownership entryはexact `{kind,path}`とし、manifest自身のownerはmanifest pathから暗黙に当該changeと決まる。
`owned` kindは`handoff-brief` / `phase` / `plan` / `verification` / `checkpoint` / `receipt` / `archive`、
`referenced` kindは`canonical-source` / `policy` / `repository-document`だけを許す。canonical OpenSpec、ADR、
workflowは参照対象であって所有対象ではない。checkpoint、receipt、archiveはすべてmanifestと同じchangeが所有し、
repository-wide graphと直前再検査を経ずに移動・削除・別changeへ移管しない。テンプレートのpre-merge closeでは
manifest、checkpoint、receipt、一時archive / briefを対象changeと同じpreviewへ載せる。出荷物として残すarchiveは
自動判定せず、明示的なrepository policyで所有解除・参照再分類されるまでcloseを停止する。

`lifecycle`内の各record referenceはexact `{operation_id,path,sha256,state}`とし、stateは
`pending` / `completed` / `failed` / `unknown`だけを許す。checkpoint / receipt本体はeffectごとのexact
`{effect_id,operation,precondition,status,evidence}`を順序付きで持ち、statusは
`pending` / `completed` / `unknown`に限定する。archiveは同じreference形式で索引し、内容をmanifestへ複製しない。
v2 manifestと各record fileはv1と同じ8 MiB limit+1 readを適用し、`active`、`tombstones`、`mappings`、
`owned`、`referenced`、各lifecycle配列、各recordのeffectsはそれぞれ最大4096件とする。path / ID / heading / evidence
のUTF-8 aggregateがfile上限を越える場合は切り捨てず停止する。source itemは最大4096件と8 MiB file上限に加え、
category別counterの`999999`割当上限にも従う。

v1 readerは残し、v1 / v2を判別して読み取る。migration previewはv1 bytes hash、生成予定v2 hash、stable ID
割当、作成・更新候補、除外理由を副作用なしで返す。applyはpreview hashと明示承認を再検査し、v2を同directoryの
stagingへ書き、bounded再読で完全validateしてからだけatomic replaceする。staging作成・write・validation失敗時は
target v1 bytesを一切変更せず、staging cleanup結果を報告する。replace失敗時はtargetを再読して元v1 hashと一致すれば
v1保持、一致を証明できなければ`unknown`として停止し、自動rollbackしない。unknown schema、v2→v1、callerがdisk
schemaより低いschemaを要求するdowngradeはpreviewもapplyもfail-closedし、既存bytesを変更しない。

Phase 2はmigration済みのstarted schema v2に対し、全active source IDへexactly oneの`phase_id` / `phase_path`を
割り当てるphase-assignment baselineを作る。mapping entryの`phase_path`はrepository root内のcanonical POSIX relative
pathとして常に宣言し、空、repo外、symlink escape、Unicode / platform case aliasを拒否する。structural validationは
将来phaseのpath実在を要求しないが、対象phaseがoperationのreadiness horizonへ入った時点で宣言先の実在と同じchangeへの
所属を要求する。`plan_paths` / `evidence_paths`は未実体化の将来phaseでは空を許すが、その空をoperation-ready successに
使わない。activeからtombstoneへ移ったsource IDはbaseline coverageに数えず、tombstoneを参照するmappingはstaleとして
structured non-successにする。複数active source IDsが同じphaseを共有することは許すが、同じsource IDの複数entries、
同じ`phase_id`に対する異なる`phase_path`、または同じcanonical phase pathに対する異なる`phase_id`はconflictとして拒否する。

readiness horizonは次に固定する。各rowの範囲内でunknown、cross-change、duplicate、conflict、path不在が一件でもあれば、
部分的なgreenを返さずstructured non-successにする。

| operation | readiness horizon | operation-readyに必要な実体 |
| --- | --- | --- |
| `plan` | 全active source IDから対象phaseへの割当 | 対象phaseのexactly one `phase_id` / 実在`phase_path`。plan / evidenceは未作成でよい |
| `execute` | 対象phaseと、そのphaseへ割り当てた全active source ID | 対象phaseの実在pathと実行対象の全`plan_paths`。evidenceは未作成でよい |
| `verify` | 対象phaseの全active source ID、全plans、必要evidence | 対象phaseの実在path、全plan paths、各source / planに要求される全`evidence_paths` |
| `finalize` | 全active source ID、全phases、全plans、全required evidence | repository-wideに実在し同じchangeへ属する完全なmapping graph |

mapping readinessは各pathをno-follow、bounded、identity-checkedで検査したpoint-in-time observation resultであり、
atomic filesystem snapshotまたはleaseではない。各pathは自身の観測時点で上表の契約を満たす必要があり、観測中に
検出したmissing、alias、symlink、identity changeは部分的なgreenにしない。一方、非協調な外部processが各pathの
final observation後に変更することまでは保証しない。consumerは結果を将来の操作へ流用せず、実operation直前に同じ
mapping readinessとPhase 3のdrift / preflightを再実行する。actual mutation seamも自身のstate guardsを持ち、失敗時に
自動retry、repair、route switchを行わない。

started v2へsource identity、phase assignment、canonical artifact hash、source commit、checkbox progressを反映する操作は、
v1 migrationとは別のPhase 2 application seamとする。read-only refresh previewは現在のv2 bytes hash、更新前後のsource /
artifact / progress / mapping、生成予定v2 hash、除外理由、immutable preview hashを完全に返す。差分0件も完全なno-op preview
として返す。target v2、各canonical artifact、candidate v2、serialized machine previewはそれぞれ8 MiBのlimit+1を適用し、
完全に生成できない場合は切り捨てたpreviewを返さずnon-successにする。applyはpreview表示後に得た
exact preview hashへの新たな明示承認と、disk bytes、source commit、canonical source、phase assignmentのstate guardを
再検査する。`handoff_state=started`、capabilities、既存ownership、既存lifecycleは各subtreeのcanonical bytesを候補生成前後で
比較して保持し、v2を同directoryのbounded stagingへwrite、limit+1再読、strict v2 validationしてからだけatomic replaceする。
stale approval、unknown state、staging / reread / validation / replaceのpartial failureはtargetを変更しないか、
変更前hashの維持を証明できない
場合は`unknown`として停止し、自動retry / rollback / repairを行わない。このseamはPhase 2のmapping refreshに限定し、MVPの
public `inspect` / `prepare` / `mark-started`の入力、状態遷移、CLI surfaceを変更しない。

### Gate C. adaptive policyはcurrent-tree stable reference recordで参照する

policy本文の正はcurrent treeの`docs/agents/workflow.md`とし、
`docs/template/adr/0008-adaptive-openspec-gsd-execution-boundary.md`はテンプレート内で利用可能な補強根拠とする。
実装時に
`docs/agents/adaptive-change-execution.references.json`を追加し、record version、stable requirement / scenario ID、
current-tree source path、section heading、section normalized SHA-256、非規範のhistorical provenanceを保持する。
旧change specの`a2eb744`は利用可能なrepository cloneでの由来確認だけに使う。branch ref消滅や履歴省略により
blobへ到達できない環境でも契約判定を変えず、runtime / 通常CIはcommitの存在やblob到達性を要求しない。
通常CIはrecord内IDの一意性、参照先current-tree path / heading / section hash、hardening mapping内IDの存在だけを検査する。
全stable IDの必須anchorはprune後も残る`docs/agents/workflow.md`に置くため、`task prune-template-docs`で
`docs/template/`を削除した下流repositoryでも参照検査を継続できる。ADR-0008の存在やhashは通常CIの成功条件にしない。
policy本文をrecord、manifest、GSD artifactsへ複製しない。

section fingerprintはversioned `adaptive-policy-section-v1` normalizerで生成する。source fileは8 MiBのlimit+1 read後に
strict UTF-8 decodeし、CRLF / CRをLFへ変換してUnicode NFCにする。fenced code block外で、source normalizerと同じ規則で
正規化したheadingに一致するATX headingをexactly one要求し、そのheading line直後からfence外にある次の同level以上の
ATX heading直前までをsection bodyとする。horizontal whitespaceはsource normalizerと同じU+0009とUnicode category `Zs`に
限定する。bodyは各line末尾のhorizontal whitespaceだけを除去し、leading indentation、
内部改行、先頭・内部blank lineを保持して末尾LFをexactly oneにする。version tag
`adaptive-policy-section-v1\0`、canonical POSIX source path、normalized heading、normalized bodyをこの順に、各componentを
8-byte unsigned big-endian lengthとUTF-8 bytesの組にして結合し、SHA-256 lowercase hexを記録する。duplicate heading、
unclosed fence、repo外path / symlink escape、Unicode / platform case alias、oversizeはsection hashを作らずfail-closedする。

stable reference namespaceは次に固定する。

| ID | current policy concept |
| --- | --- |
| `ACE-R1` / `ACE-S1-START-GATES` | 経路判定と開始前gate |
| `ACE-R2` / `ACE-S2-OPEN-SPEC-AUTHORITY` | OpenSpecがWHAT/WHY、受け入れ基準、最終完了判定の正本を所有 |
| `ACE-S2-GSD-PROGRESS` | GSDが詳細plan / phase進捗を所有 |
| `ACE-S2-ONE-PHASE-ONE-CHANGE` | 一つの phase へ複数 changes を混在させない |
| `ACE-S2-SPEC-CHANGE-REPLAN` | 仕様判断時はOpenSpec更新後に再計画 |
| `ACE-R3` | 小規模changeの直接実行policy。本hardeningでは参照しないが、active IDとして保持して再利用しない |
| `ACE-R4` / `ACE-S4-SOURCE-PINNED` | 専用 branch の reviewable source commit |
| `ACE-S4-CONTEXT-PARITY` | canonical paths / source / gates / unresolvedのhandoff |
| `ACE-S4-NO-AUTO-FALLBACK` | capability不足・継続不能時に自動経路変更しない |
| `ACE-S4-RESUME` | sourceと完了済み進捗を再確認して復帰 |
| `ACE-R5` / `ACE-S5-OPEN-SPEC-FINAL` | OpenSpec原本との独立最終検証 |
| `ACE-S5-REVALIDATE-ON-DRIFT` | 原本変更後は完了gateを再検証 |
| `ACE-S5-SINGLE-ACTIVE-CLOSE` | 一PR一active changeとpre-merge close |

`ACE-R2`は正本の所有権を表し、`ACE-R5`はその正本に対して独立した最終検証を実行する手順を表す。
`ACE-R3` は current policy で有効だが GSD lifecycle enforcement の参照対象ではないため、scenario IDを本 change で
新設せずrequirement IDだけをstable namespaceに保持する。
`ACE-S2-SPEC-CHANGE-REPLAN`と`ACE-S5-REVALIDATE-ON-DRIFT`は、どちらも
`docs/agents/workflow.md`の「OpenSpec / GSD の責務境界（ADR-0008）」をanchorにできる。同じpolicy sectionが
仕様変更時の再計画と最終完了判定の再評価をともに定めるため、stable IDは一意に保ちつつ同一section path /
heading / hashの共有を許す。

hardening scenarioからpolicy referenceへの対応は次のとおりである。`HARD-R1`〜`HARD-R6`はspec deltaの
stable requirement IDであり、要件の並び順とは独立して参照する。これはenforcementの由来であり、
hardening requirementの振る舞いをpolicyへ逆輸入しない。adaptive policyを直接enforceしないmigration等の
mechanical contractも、参照対象外である理由を表へ明記する。

| hardening scenario | stable policy references |
| --- | --- |
| `HARD-R1`: 新規ID / 等価表記 / 意味内容変更 / rename / 曖昧衝突 | `ACE-S2-OPEN-SPEC-AUTHORITY`, `ACE-S2-SPEC-CHANGE-REPLAN` |
| `HARD-R1`: exact ID・counter・親参照・source normalizer | 適用なし。stable identity wire formatとbounded parsingのmechanical contract |
| `HARD-R1`: phase mapping完全性 | `ACE-S2-ONE-PHASE-ONE-CHANGE`, `ACE-S4-CONTEXT-PARITY` |
| `HARD-R1`: v1 migration preview / staging failure / unknown schema | 適用なし。MVP schema互換性とatomic persistenceのmechanical contract |
| `HARD-R1`: started v2 refresh / no-op / bounded failure / stale approval / persistence failure | 適用なし。mapping applicationとatomic persistenceのmechanical contract |
| `HARD-R1`: policy reference traceability | `ACE-S2-OPEN-SPEC-AUTHORITY`, `ACE-S5-OPEN-SPEC-FINAL` |
| `HARD-R2`: canonical specification変化 / checkbox-only | `ACE-S2-SPEC-CHANGE-REPLAN`, `ACE-S5-REVALIDATE-ON-DRIFT` |
| `HARD-R2`: phase graph / capability変化 | `ACE-S4-SOURCE-PINNED`, `ACE-S4-NO-AUTO-FALLBACK` |
| `HARD-R2`: 検査不能 | `ACE-S1-START-GATES`, `ACE-S4-NO-AUTO-FALLBACK` |
| `HARD-R3`: 単独所有 / 共有参照 / 競合・不明 | `ACE-S2-OPEN-SPEC-AUTHORITY`, `ACE-S5-SINGLE-ACTIVE-CLOSE` |
| `HARD-R3`: ownership境界外path | `ACE-S4-SOURCE-PINNED`, `ACE-S5-SINGLE-ACTIVE-CLOSE` |
| `HARD-R3`: lifecycle record owner | `ACE-S2-OPEN-SPEC-AUTHORITY`, `ACE-S2-ONE-PHASE-ONE-CHANGE` |
| `HARD-R3`: template pre-merge close | `ACE-S5-SINGLE-ACTIVE-CLOSE`, `ACE-S5-OPEN-SPEC-FINAL` |
| `HARD-R4`: 副作用前 / 部分成功の中断 | `ACE-S4-RESUME`, `ACE-S4-SOURCE-PINNED` |
| `HARD-R4`: source / capability変化 | `ACE-S2-SPEC-CHANGE-REPLAN`, `ACE-S4-NO-AUTO-FALLBACK` |
| `HARD-R4`: 自動回復不能 | `ACE-S4-NO-AUTO-FALLBACK`, `ACE-S4-RESUME` |
| `HARD-R5`: preview / no-op | `ACE-S5-OPEN-SPEC-FINAL`, `ACE-S5-SINGLE-ACTIVE-CLOSE` |
| `HARD-R5`: stale preview / 部分失敗 | `ACE-S5-REVALIDATE-ON-DRIFT`, `ACE-S4-RESUME`, `ACE-S4-NO-AUTO-FALLBACK` |
| `HARD-R6`: optional toolsなしの通常CI / fixtures / properties / integration / smoke | `ACE-S1-START-GATES`, `ACE-S5-OPEN-SPEC-FINAL` |

### Gate D. Phase 3のgraph authorityとevidence roleを固定する

Phase 3 / HND-03 / HARD-R2のgap closureでは、`planning_inventory`だけをcurrent treeのinventory authorityとする。
`observed_nodes`はその`planning_inventory.phases`とphase ID / canonical pathを完全一致させる。
`expected_nodes`は`observe_phase_graph(..., source_commit)`が返すsource-pinned observationであり、
current inventoryとの集合差は正規のdrift入力である。`expected_inventory`は追加しない。expected / observed graphは
片方の結果を流用せず、それぞれruntime shape、canonical phase ID / POSIX path、dependency参照、DAG、件数、
aggregate bytesを独立に検査する。duplicate node / edge、self-edge、unknown dependency、cycleはmalformedである。
node / edgeは各4096件、canonical aggregate inputは8 MiBを上限とし、N-1 / Nを受理してN+1を
decision identityなしの`UNKNOWN`にする。boundまたはcountを表すscalarはexact positive integerだけを許し、
`bool`、float、負数、NaN、infを拒否する。malformed、不完全、timeout、切捨てなど比較を完了できないgraphだけを
identityとremediation projectionなしの`UNKNOWN`とし、独立検査を通る完全なgraphの集合差は`DRIFTED`とする。

両graphが空ならgraph比較自身は`CLEAN`である。ただしtarget必須operationでtargetが両方に不在ならtarget relationにより
`UNKNOWN`となる。expectedが空でobservedが非空なら全observed phaseのadd、expectedが非空でobservedが空なら
全expected phaseのremoveである。0 / 1 phase、全phase削除、add / remove / path / dependencyの同時変更を通常の
完全比較として扱う。dependency tupleは集合として比較し、順序だけの違いはdriftにしない。同じphaseにpathと
dependencyの変更があれば`phase-path-changed:<id>`と`phase-dependencies-changed:<id>`を両方保持する。
add / removeはそれぞれ`phase-added:<id>` / `phase-removed:<id>`を保持する。

downstreamは変更phaseへ直接または推移的に依存するphaseと定義し、expected / observed graphのnodeと旧edge /
新edgeの和集合から決定的に求める。revalidation targetは削除済みphaseを含むdrift証拠を保持するが、最終replanning
targetはobserved graphとの積集合にする。各変更phase自身をrevalidation targetとし、変更phaseと和集合上の
downstreamを合わせたreplanning候補をobserved graphと積集合してreplanning targetにする。issues、
revalidation targets、replanning targets、next action codesはそれぞれset-likeに重複排除し、UTF-8 bytes順に
整列する。input tupleの並び替えはprojectionとidentityを変えない。

| graph change | revalidation / replanning projection |
| --- | --- |
| added phase | added phase自身と和集合上のdownstreamを再計画する |
| removed phase | removed phaseをrevalidation targetへ残し、observedに存在しないremoved phase自身はreplanning targetへ入れない。旧edge側だけに存在するdownstreamも和集合で検出し、observedとの積集合後に再計画する |
| path change | 当該phaseと、旧path側または新path側のgraphで影響を受けるdownstreamを再計画する |
| dependency change | 当該phaseと、旧edgeまたは新edgeのいずれかだけに存在するdownstreamも再計画する |

完全なgraph drift decisionは`admitted=false`とし、state、issues、revalidation / replanning targets、
next actionsの最終projectionを含む再利用可能なdecision identityを持つ。graph driftでは
`revalidate-mapping`を返し、最終replanning targetsが非空の場合だけ`replan-affected-phases`を返す。
全phase削除またはtarget / downstreamの同時削除で積集合が空なら後者を返さない。

target phaseはgraph completenessとは別に、mapping readinessやその他のgraph change集約より先にrelationを分類する。
runtime shapeまたはcanonical phase ID scalarが空文字、`None`、wrong type、その他malformedならgraph比較前にinput
errorとする。valid targetが変更phaseと一致するか否かはrelation classificationを変えず、その他のgraph changesは
その後に別集約する。

| target relation | state / issue / next action |
| --- | --- |
| expectedに存在しobservedから消えた | `DRIFTED` / `phase-removed:<id>` / `lifecycle-target-phase-removed` |
| observedにだけ存在する | `DRIFTED` / `phase-added:<id>` / target relation固有actionなし |
| expected / observedの両方に存在する | target relation固有issue / actionなし。graph全体の差分に従う |
| expected / observedの両方に存在しない | identityなしの`UNKNOWN` / issueなし / `lifecycle-target-phase-unknown` |
| malformed | identityなしの`UNKNOWN` / issueなし / `lifecycle-input-invalid` |

`lifecycle-target-phase-removed`と`lifecycle-target-phase-unknown`はnext action codes専用でissue codesへ複製しない。
expected-only targetはmapping readinessに失敗する前にidentityありの`DRIFTED`として保持する。targetとdownstreamが
すべて削除済みなら`revalidate-mapping`と`lifecycle-target-phase-removed`だけを返し、
`replan-affected-phases`は返さない。

phase path、plan path、evidence pathは非空のcanonical POSIX repository-relative pathだけを許し、backslash、
absolute path、`.` / `..` component、NUL、empty、wrong type、malformed encodingを暗黙に正規化しない。
PlanningInventoryは4096 entriesとcanonical aggregate 8 MiBのN-1 / Nを受理し、N+1を拒否する。
検査順序は (1) runtime shape / canonical scalar / limit、(2) role disjointness、(3) filesystem observation /
readiness / hash / identity とする。

role namespaceはphase=plan、phase=evidence、plan=evidenceのexact collisionだけでなく、Unicode NFC / NFD、
platform caseのalias keyが等しいcross-role collisionも拒否する。alias keyは比較専用であり、入力pathを
暗黙変換して受理しない。separator変形や`.` / `..`除去後に別pathと一致し得る入力はcanonicalizeせず、
role比較前の形式不正として拒否する。plan artifact自身をevidence artifactとして数えない。一つの独立したevidence artifactについて、
一つの`EvidenceDeclaration`内にsource ownerとplan ownerの両方を宣言することと、同じownerが異なるevidenceを持つことは
許可する。同じevidence pathを複数の`EvidenceDeclaration`へ分割することは拒否する。
`PlanningInventory`のcross-role collisionまたは同一evidence pathの宣言分割は`mapping-path-role-conflict`、
public builderを迂回して直接構築されたderived `ManifestMapping`の同じrole不変条件違反は
`mapping-set-invalid`とする。malformed / oversizeは既存のdimension-specificなstructured failure codeを維持する。
lifecycle gateでは不正構造全体をidentity・remediation projectionなしの`UNKNOWN`にする。
fixed public contract testは拒否時のfilesystem boundary call countが0であることを観測する。

wire compatibilityとして`PhaseGraphObservation`にfieldを追加せず、`lifecycle-gate-decision-v1`、
manifest schema、関連versionをbumpしない。valid clean decisionの既存identity bytesを維持する。完全なgraph driftを
`UNKNOWN`からidentityありの`DRIFTED`へ戻す変更は既存契約の回復であってschema変更ではない。同じvalid inputの再実行は
同じoutputs / identity、valid driftはtuple順序によらない決定的identityを返す。保存済みdecisionのreplayではcurrent
inputからfresh decisionを計算し、identity mismatchをidentityありの`DRIFTED`、
`lifecycle-decision-stale`として扱う。identityなしはmalformed、不完全、検査不能な`UNKNOWN`だけに限定する。
互換性を破るのは従来誤ってadmitしていたinvalid graph / path-role inputの拒否だけとする。

Phase 3の再実装はPlan A「phase graph drift contract」とPlan B「path role separation」の二つの独立したTDD planに
分ける。Plan Aはpure graph / remediation Hypothesis properties、固定public graph / target / compatibility examples、
source-pinned handoff manifest、旧49-ID mapping / expected preview fixture、lifecycle golden / tracked evidenceその他の
派生authorityのrepinを一括所有する。今回の5 scenario追加によりcanonical active source items / mappingsは49から54、
scenario headingsは43から48となる。Plan Bはcanonical path-role Hypothesis propertiesと固定builder / readiness /
gate examplesを所有し、Plan Aの派生authorityを再repinしない。I/O / filesystem raceはproperty対象にせず、
観測中のmissing / alias / symlink / identity changeをfixed integrationで検証する。非協調なexternal processによる
各pathのfinal observation後の変更保証はスコープ外とし、consumerが実operation直前に再検査する。

Phase 3のexit gateは`task check`成功、code review reportが存在してstatus `clean`かつCritical 0 / Warning 0、
verifier reportが存在して`passed`かつ10/10、`behavior_unverified: 0`、`overrides_applied: 0`、
HND-03 / HARD-R2 traceability `Complete`、security reportが存在してopen threats 0の同時成立である。
一つでも欠落、失敗、未実行ならPhase 3は未完了であり、Phase 4を開始しない。

### Gate E. Phase 3 rebaseline は publication、total boundary、fresh proof を固定する

Gate EはGate A〜Dのschema、stable identity、graph authority、path role contractを維持したまま、Phase 3のrefreshと
public boundaryを再基準化する。Gate Dに記録した特定changeの49→54 active mappings、43→48 scenario headings、
旧49-ID mapping、Plan A / B、fixture repinは当時のsource-pinned execution evidenceであり削除しない。ただし後続の
rebaseline acceptanceは固定change ID、source / scenario / mapping count、`Phase 02`などのphase label、特定fixture、
planning inventory / policy registryのdefault pathを成立条件にしない。任意の正規change入力に対する契約検証を正とする。

started v2 refreshはoperation-ready判定ではなくchange-wide publicationである。全active source IDにexactly oneの
mappingを要求し、source ID、phase ID / path、重複、unknown、cross-change、tombstone、policy referenceを含むmapping
構造全体を検査する。一方、未実体化の将来phaseの`phase_path`、`plan_paths`、`evidence_paths`のfilesystem実在は
refreshで要求しない。Gate Bのreadiness horizonはplan / execute / verify / finalizeの直前だけに適用し、refreshへ
流用しない。将来path未実体化の許容は構造不正の許容ではない。
active sourceが0件ならtombstone / empty mappingの有無にかかわらず`publication-active-source-empty`、effect 0で停止し、
vacuous coverageまたはall-source deletionをrefresh successにしない。all-empty graphの比較契約は変更しない。

planning inventoryとpolicy registryのcanonical repository-relative authority pathはpreviewの必須入力とする。
default pathでの補完は禁止する。previewは各authorityのpath、bounded exact bytes、no-followで得たfile identity、
registryが指すpolicy sectionのsource path、heading、canonical section bytes / hash evidenceをimmutable preview hashに
含める。applyは同じrepository anchorから両authority fileとpolicy sectionをfreshに再観測し、path、bytes、identity、
section evidenceの全一致を副作用前に証明する。一項目でも変化すれば旧approvalはstaleであり、新previewと別承認を
要求する。値が同じでもfile identityが変わったauthorityは同じapprovalとして扱わない。
inventory、registry、policy sourceのrole間はcanonical path、Unicode / case alias key、physical identityでdisjointとする。
applyは単一anchorからregistry → policy sections → inventoryを観測・cross-validationし、inventory → registry → sections →
anchorをfinal recheckして直後にlockを取得する。authority別anchorやdefault path fallbackは使わない。

packageが公開する全`Result` APIとdecision APIはtotal boundaryを持つ。malformed root / scalar、property getter、
adapter method、callback、hash / serialization、`Sequence` traversalからのordinary `Exception`は、`Result` APIでは
structured `Failure`、decision APIではidentityとremediation projectionのない`UNKNOWN`へ変換する。例外前の観測を
partial result、partial green、またはdecision identityとして返さない。`BaseException`は捕捉して結果へ変換せず、
owned resourceのcleanupを試行した後に元の例外を再伝播する。
inventoryは関数名ではなくsemantic operationで固定し、read / preview / apply / observation / ownership / resume / finalize /
custom persistence unionを`Result`、canonical drift / lifecycle admissionをdecisionに分類する。failure後の新invocationはroot
validation、freeze、mutable observationをfreshにやり直し、effect-capable failure後はfresh previewと別承認を要求する。

collection入力は外部effectより前にruntime shape、canonical scalar、protocol、count、canonical aggregate bytesの上限を
検査し、bounded immutable snapshotへ一度だけfreezeする。以後はsnapshotだけを使用し、元collectionを再走査しない。
malformed collection、途中でordinary `Exception`を送出する`Sequence`、またはunsupported adapterはstructured invalid、
decisionではidentityのない`UNKNOWN`とし、filesystem access、adapter method、lock、staging createを呼ばない。
adapter supportはeffectを伴うduck-typing probeではなく明示されたsupported contractで判定する。
public collectionはbuiltinまたはnominal subclassの`Sequence`だけ、adapterはversioned nominal contractだけを受理する。
empty / `None`はsource paths / files / artifacts、optional auxiliary、complete-state、bootstrap previous sourceで区別し、
authoritative duplicateは同値でも拒否する。新complete-stateは4096 records / 8 MiB、artifactは64 files / 4 MiBとし、
nested collectionは親budgetへ算入する。新structured collectionは`gate-e-collection-v1` framingのstream全長を数える。
`len()` / `iter()`は各一度、`next()`はN+1、encodingはB+1までで停止し、単一call永久blockは保証外とする。

supported persistence adapterの全callに同じfailure taxonomyを適用する。対象はlock、create、write、reread、validate、
replace、cleanup、release、closeである。ordinary `Exception`はcall位置を保持するprimary structured failureに変換し、
adapter例外後に`Success`を返さない。owned stagingが作成された、または作成された可能性がある場合はcleanupを一度
試行する。cleanup例外はprimary failureを上書きしない。target、staging、effectの現状態をfresh observationで証明
できなければ`UNKNOWN`とする。`BaseException`でもcleanupを試行し、そのcleanup結果で元の`BaseException`を置換しない。
各callはexact nominal outcomeを要求し、malformed returnを同じcall位置の`return-invalid`とする。primary failure後は
cleanup → release → close → fresh observationを続け、最初のprimaryと発生順のsecondary evidenceを維持する。

atomic replaceとno-opのどちらも、`Success` return直前にrepository anchorからfresh canonical proofを作る。
proofはcanonical parentのidentityがpreview時と同じこと、targetが同じcanonical pathへ解決されること、fresh targetの
exact bytesがcandidate bytesと一致すること、strict parseした値がcandidate objectと一致することを要求する。
no-opも同じproofを省略しない。fresh read / parse失敗、parent rebind、target path差、bytes mismatch、parse mismatch、
adapter例外では`Success`を禁止し、effectを証明できなければ`UNKNOWN`とする。各pathのfinal observation後に
非協調な外部processが変更することは保証外であり、Gate Eは新しいlease / transaction契約を導入しない。
replace直前にはparent / target / current bytes / approved old object・hash / live lockを再guardする。cleanup / release /
close後のfinal proofはanchor、parent、target、descriptor bytes、strict object、target identity、parent / anchorの順で再確認し、
proof resourceをcloseした後だけ`Success`を返す。

rebaseline verificationはpublic API全件のmalformed root / scalar / getter / method / `Sequence` matrix、persistenceの
lock / create / write / reread / validate / replace / cleanup / release / close fault matrix、cleanup primary-failure保持、
`BaseException` cleanup後再伝播、fresh proofのparent rebind / bytes / parse mismatch、source pathのNFD-only / NFC-NFD
alias / persisted reuseを対象にする。正本だけを更新する段階ではproduction code、tests、fixtures、`tasks.md`、GSD
artifactsを変更せず、GSDの詳細taskも複製しない。`task openspec:validate`、`git diff --check`、`task check`を実行し、
`task check`がsource-pinned count / hash / fixture不一致だけで失敗する場合は修正せずexact RED evidenceとして記録する。
targeted spec-holesは後述の「Gate E targeted rebaseline」で、今回追加した7 behavior familiesに限定して
既存の`H01`〜`H12`を差分適用する。

### 1. stable ID は単調増加し、曖昧一致を拒否する

MVP manifest の schema migration により raw source identity と正規化 fingerprint を保存する。既存のexactな
normalized identityまたは明示された一意な対応を優先し、新しいitemだけcategory別counterからnamespaced IDを
割り当てる。削除済みIDは親参照を含むtombstoneとして残し、欠番を再利用しない。見出し、path、親変更などで
一意な対応を証明できなければ停止し、類似度による自動紐付けをしない。

### 2. mapping は policy 参照を持つ enforcement record とする

各 phase / plan / evidence mapping は source stable ID に加え、検査対象の
`adaptive-change-execution` requirement / scenario identifier を持つ。bridge は参照の存在、一意性、change 所属、
被覆だけを検査し、policy 文を manifest や GSD artifacts へ複製しない。全active source IDのphase-assignment baselineと
operation別readiness horizon、started v2のapproval-bound refreshはGate Bの表と永続化契約を単一の正とする。

### 3. lifecycle operation は共通 preflight matrix を通す

plan / execute / resume / verify / finalize ごとに必要な source hash、source commit、manifest schema、mapping、
phase graph、capability、ownership を宣言的 matrix で定める。検査不能は failure ではなく `unknown` として
fail-closed に扱う。`tasks.md` は checkbox token だけを除く normalizer を MVP と共有する。

### 4. ownership は全 manifests と repository references の集合で判定する

単一 manifest だけを見て削除可能と判定しない。MVP 追跡方針で有効とされる全 manifests を列挙し、real path、
owner、reader/reference を graph 化する。owner が一つでも他から参照される artifact は shared reference とし、
参照更新が検証されるまで保持する。case / Unicode / symlink / traversal の alias は同一 real path へ正規化する。

### 5. recovery は compensating action ではなく再検証可能な journal とする

各副作用に operation ID、input / preview hash、precondition、started / completed / unknown、evidence を記録する。
中断後は journal と現物を照合し、安全な次操作だけを新 preview に載せる。自動 rollback や壊れた manifest の
推測修復はしない。状態が不明なら人の判断へエスカレーションする。

### 6. preview と approval を immutable input hash で結び付ける

preview は順序付き operation list、対象 real paths、owners、references、期待前後 hash、除外理由を含む。
承認は preview hash と repository / source state に結び付け、いずれかが変われば失効する。0件 preview は
no-op として扱うが、finalized receipt は同じ gate を通す。

### 7. tests は pure core、filesystem integration、opt-in smoke に分ける

allocator、normalizer、manifest round-trip、ownership graph、preview builderに加え、Gate Dのpureなphase graph /
remediation projectionとcanonical path-role invariantだけをproperty tests対象にする。public lifecycle gateとmapping
builder / readinessは固定fixture / exampleを一次証拠とし、filesystem、Git、atomic journalはisolated integration tests、
実 OpenSpec / GSD signalsはopt-in smokeとする。
通常 CI は optional tools と時刻・locale に依存しない。

## Risks / Trade-offs

- **tombstone による manifest 成長**: ID 再利用事故を避けるため許容し、明示上限を超えた場合は停止する。
- **厳格な曖昧一致拒否**: rename 時の手動 mapping は増えるが、誤った traceability を自動生成しない。
- **repository-wide scan cost**: correctness を優先し、bounded input を超えたら不完全な ownership 判定を返さない。
- **journal と receipt の状態増加**: MVP 追跡方針に従って保持し、独立した第二の正を作らない。
- **tool artifact drift**: MVP capability contract を再利用し、未知 schema / signal は hardening 操作を停止する。

## Migration Plan

1. 二つの依存 changes がmerge済みであることと MVP の manifest / tracking / capability contracts を確認し、
   MVP merge後のbaseから本 change だけを載せる専用 branch / PRを作る。
2. 既存 manifest を読取専用で解析し、schema migration preview と rollback 条件を fixture 化する。
3. stable ID と mapping、drift、ownership、journal / recovery、preview / receipt の順で GSD phases を実行する。
4. 全 Phase 1 holes を tests または理由付き未検証へ対応付け、通常 CI と opt-in smoke を分離して検証する。
5. `adaptive-change-execution` の参照先 scenarios と enforcement evidence の traceability を独立検査する。

Migration failure 時は旧 MVP manifest を変更せず staging を破棄する。既に side effect がある failure は journal を
保持し、自動 downgrade / rollback せず回復案を提示する。

## Resolved dependency contracts

implementation gate 1.1–1.2をblockしていた事項はGate A–Cで解決した。v1にはmigration extension
pointがないためv2を別schemaとして導入する。`handoff.json`と全derived lifecycle recordsは同じchangeの
ownership / close contractへ載せ、canonical OpenSpecとpolicy docsは参照に限定する。OpenSpec JSON、
Markdown fallback、GSD 1.5.0 composite signal、host dispatch、`inspect` / `prepare` / `mark-started`の利用可能
signalはmerge済みMVPから変更しない。新たな外部仕様判断またはpolicy矛盾が発生した場合はGSDを停止し、
このOpenSpec原本を更新・validateしてから再計画する。

## Spec holes Phase 1

全6要件へ固定12分類を順番に適用した。「1」は spec scenario への明記、「2」は明示的スコープ外を示す。

### HARD-R1: stable source identity と requirement mapping を維持する

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | source item / phase assignmentが空、将来phaseのplan / evidenceが空、refresh候補が空 | 1: 全active sourceのphase割当は必須。将来pathの空はschema上許すがoperation horizon到達時はnon-success。no-op refreshは完全previewで明示 |
| 2 | 境界値 | 該当 | 初回ID、`999999`、exhausted sentinel、番号枯渇、0/1/N phases / plans / evidence | 1: counterは`1..1000000`、sentinelからは割り当てず停止。operation別horizonで必要件数を検査 |
| 3 | 重複・衝突 | 該当 | active / tombstoneを跨ぐID、normalized identity、親参照、phase assignment、cross-change pathの衝突 | 1: global uniquenessとcategory / prefix / change所属を検査し自動mergeしない |
| 4 | 順序 | 該当 | source並び替えで再番号付け、mapping入力順でcoverage判定が変わる | 1: normalized identity一致時は既存IDを再利用し、同じ集合は同じ判定 |
| 5 | 型・形式不正 | 該当 | malformed ID / counter / category / parent / fingerprint / Markdown / phase path / policy section | 1: exact schema、strict parser、versioned normalizerで停止 |
| 6 | エラー経路 | 該当 | migration / started v2 refreshの部分失敗 | 1: stagingを採用せずtarget bytesを保持。不明ならunknown停止 |
| 7 | 冪等性・再実行 | 該当 | 再実行でIDが変わる、stale approvalで旧refreshを適用する | 1: 同じsource/mappingは同じpreview。exact hashとstate guardsを再検査し、自動retryしない |
| 8 | 時刻・タイムゾーン | 非該当 | IDへ時刻を含めない | 2: timestampによるidentity判定は対象外 |
| 9 | 文字列 | 該当 | invalid UTF-8、NFC、改行、heading空白、fence内見出し、source / phase / policy path alias | 1: exact canonicalization、raw heading保持、曖昧Markdownとaliasを停止 |
| 10 | 数値 | 該当 | 0・負数・非整数・overflow・noncanonical padding | 1: suffix`1..999999`とcounter`1..1000000`だけ許容 |
| 11 | 巨大入力・リソース枯渇 | 該当 | source / policy section / refresh preview / tombstone / mappingの肥大 | 1: 8 MiB / 4096 / counter上限で切捨てず停止 |
| 12 | 状態遷移の未定義パス | 該当 | deleted ID の復活・親消失・再利用、started v2をMVP transitionでrefresh | 1: tombstoneをcoverage外のstale参照として扱い、専用refresh seamだけを許可 |

### HARD-R2: lifecycle 操作前に source と派生状態の drift を検査する

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | expected / observedの片方または両方が空、全phase削除、必須targetの空文字 / `None`、空path、空remediation | 1: 両graph空はgraph比較としてclean、片方空は全add / remove、全削除は全removedをrevalidationかつreplanning空。必須target両方不在はtarget unknown、malformed target / pathはinput invalid。空replanningでは`replan-affected-phases`を出さない |
| 2 | 境界値 | 該当 | 0 / 1 phase、node / edge / aggregate bytesとPlanningInventoryのN-1 / N / N+1、変更・issue・targetが各1件 | 1: node / edge各4096、canonical aggregate 8 MiBとinventory 4096件 / 8 MiBはNまで受理しN+1をidentityなしUNKNOWN。1 phaseも完全graphとして比較する |
| 3 | 重複・衝突 | 該当 | duplicate node / edge、同phaseのpath+dependency変更、phase=plan / phase=evidence / plan=evidence、evidence宣言の共有 / 分割、重複projection | 1: duplicate graph要素はmalformed UNKNOWN。変更issueを種類別に両方保持する。cross-role aliasと複数宣言への同一evidence分割を拒否し、同一宣言内のsource / plan owner共有と同ownerの異なるevidenceは許可。各outputはset-likeに重複排除 |
| 4 | 順序 | 該当 | dependency / input tuple / declarationsの順序でdrift、downstream、identity、issue/action順が変わる | 1: dependencyを集合比較し順序差はno drift。graph / role projectionは入力順不変、outputsはUTF-8 bytes順。structural validationをfilesystem observationより先に行う |
| 5 | 型・形式不正 | 該当 | malformed graph / target / path、wrong type、duplicate/self/unknown edge、cycle、backslash / absolute / dot component / NUL | 1: runtime shape→canonical scalar→limit→graph / role invariantの順に検査し、暗黙normalizeせずidentity / remediationなしUNKNOWN。role不変条件はPlanningInventoryで`mapping-path-role-conflict`、直接ManifestMappingで`mapping-set-invalid`、その他は既存のdimension-specific code |
| 6 | エラー経路 | 該当 | graph片側のparse / read / probe timeout、部分・切捨て、filesystem観測中のrace、stale replay | 1: expected / observedを独立検査して比較不能だけをUNKNOWN。観測中のmissing / alias / symlink / identity changeはfixed integrationでfail-closed。replayはfresh再計算しidentity mismatchをidentityありDRIFTED / `lifecycle-decision-stale`にする |
| 7 | 冪等性・再実行 | 該当 | 同じvalid inputの再実行でoutputs / identityが変わる、clean identity byte互換、valid drift identity、二重repin | 1: 同じinputは同じUTF-8順projectionとidentity。valid clean identity bytesとv1 discriminatorを維持し、Plan Aだけが派生authorityを一括repin、Plan Bは再repinしない |
| 8 | 時刻・タイムゾーン | 非該当 | graph / target / role / identity / exit判定にmtime、timezone、DST、TTLを使わない | 2: mtime / timezone / TTLによる判定はスコープ外。point-in-time filesystem observationは時刻値ではなく観測結果を検査する |
| 9 | 文字列 | 該当 | phase / plan / evidenceのexact・NFC/NFD・case alias、separator変形、空白 / encoding、canonical phase ID / POSIX path | 1: strict scalarとcanonical POSIX relative pathを要求し、cross-role alias key collisionを拒否する。separator等の非canonical表記は暗黙変換せず、alias keyは比較専用で入力を書き換えない |
| 10 | 数値 | 該当 | bound / count / length fieldの0、負数、`bool`、float、NaN、inf、上限off-by-one | 1: exact positive integerだけを許可し、node / edge 4096とaggregate 8 MiBをNまで受理、N+1とnon-integerをUNKNOWNにする。fuzzy scoreは使用しない |
| 11 | 巨大入力・リソース枯渇 | 該当 | graph / inventoryが件数・aggregate bytes上限超過、timeout、完全projection生成不能 | 1: graphごとに4096 node / edge・8 MiB、inventory 4096件・8 MiBを切捨てず検査し、超過 / timeoutはidentityなしUNKNOWN。HypothesisへI/O stressを混ぜずfixed bounded example / integrationで検証 |
| 12 | 状態遷移の未定義パス | 該当 | targetのexpected-only / observed-only / both / neither、targetとgraph変更の一致 / 不一致、全削除、stale decision、exit evidence欠落 | 1: target relationをmapping readiness / graph集約より先に4分類し、その他変更を別集約。removed actionとunknown actionはnext action専用。driftは再検証まで操作禁止。review / verifier / security / `task check`の欠落・失敗・未実行を未達としてPhase 4を禁止 |

### Gate E targeted rebaseline（HARD-R1 / HARD-R2 差分のみ）

既存のHARD-R1 / HARD-R2表は維持し、Gate Eで7 scenariosが追加した境界だけに
`H01`〜`H12`を再適用する。結果`a`は既存scenario / Gate Eが固定するnormative behavior、
`b`はexplicit out-of-scopeまたは当該familyに非該当な分類である。従来`c`だった19 classification rowsは
下記の合意済み決定台帳で`a`へ確定した。`N/A`も理由と`b`を明記する。

#### GE-1: public API totality matrix

- `GE-TOT-H01` 空・ゼロ長・None — 該当。各APIの既存入力契約上malformedなempty / `None` root・scalarが生の例外を出す境界。結果`a`: `Result`はstructured `Failure`、decisionはidentity / remediationなし`UNKNOWN`。empty自体の有効性は各API契約を変更しない。
- `GE-TOT-H02` 境界値 — 該当。既存のN-1 / N / N+1でvalidationやserializationが例外化する境界。結果`a`: 既存上限を維持し、ordinary `Exception`をpartial resultにせず各total resultへ変換。全API共通の新しい数値上限は導入しない。
- `GE-TOT-H03` 重複・衝突 — `N/A`。duplicateの有効性はmapping / graph / path等の既存API契約が所有し、totalityは例外変換だけを追加する。結果`b`: family共通のduplicate semanticsは対象外。
- `GE-TOT-H04` 順序 — `N/A`。入力順序の意味は各APIの既存契約が所有する。結果`b`: totalityから新しいsort / stability契約を導入しない。
- `GE-TOT-H05` 型・形式不正 — 該当。malformed root / scalar / getter / method / callback / hash / serialization / `Sequence`を検査する。結果`a`: semantic operation inventoryでread / preview / apply / observation / ownership / resume / finalizeとcustom persistence unionを`Result`、canonical drift / lifecycle admissionをdecisionに分類する。root `__all__`、全non-underscore symbol、現行関数名だけからinventoryを推測しない。
- `GE-TOT-H06` エラー・部分失敗 — 該当。ordinary `Exception`、`BaseException`、cleanup例外、例外前の部分観測。結果`a`: ordinaryはstructured non-success、`BaseException`はowned cleanup試行後に元例外を再伝播し、partial green / identityを返さない。
- `GE-TOT-H07` 冪等性・再実行 — 該当。結果`a`: ordinary `Exception`後の新invocationはroot validation、freeze、mutable observationを全再実行し、前attemptのsnapshot、identity、remediation、partial observationを再利用しない。effect-capable failure後はfresh previewと別承認を要求する。
- `GE-TOT-H08` 時刻・タイムゾーン — `N/A`。totality分類にmtime / TZ / DST / TTLを使わない。結果`b`: 時刻依存exception policyは対象外。
- `GE-TOT-H09` 文字列・Unicode — 該当。invalid UTF-8 scalar、NUL、noncanonical Unicodeによるgetter / hash / serialization例外。結果`a`: 各APIの既存string契約で検査し、ordinary例外をtotal resultへ変換。path NFC固有境界は`GE-5`が所有。
- `GE-TOT-H10` 数値 — 該当。`bool`、float、負数、NaN、inf、limit+1を数値scalarとして受けた場合。結果`a`: Gate Dのexact integer契約を維持し、検査例外もstructured non-success化。
- `GE-TOT-H11` 巨大入力・リソース枯渇 — 該当。oversize、timeout、`MemoryError`等のordinary `Exception`。結果`a`: 切捨て / partial resultなしの`Failure` / identityなし`UNKNOWN`。プロセス終了等、Python結果境界へ戻らない障害の変換は`b`として対象外。
- `GE-TOT-H12` 未定義状態遷移 — 該当。例外前のpartial green / reusable identityからadmitted / `Success`へ進むパス。結果`a`: 常にidentity / remediationなし`UNKNOWN`またはstructured `Failure`で停止。

#### GE-2: bounded freeze / supported・unsupported adapter 境界

- `GE-FRZ-H01` 空・ゼロ長・None — 該当。結果`a`: source paths / files / artifactsはempty / `None`を拒否、optional auxiliaryはemptyだけ許可、complete-stateはemptyをshape-validとするが`None`を拒否する。`previous_source_items=None`だけはbootstrap emptyとする。
- `GE-FRZ-H02` 境界値 — 該当。結果`a`: 既存domain boundsを維持し、新complete-state documentは4096 records / 8 MiB、artifact collectionは64 files / 4 MiBとする。nested collectionは親budgetへ算入し、切捨てない。
- `GE-FRZ-H03` 重複・衝突 — 該当。結果`a`: authoritative inputのsemantic-key duplicateは同値でも拒否し、silent dedupe / first / last winsを禁止する。multi-ownerは単一record内だけ許可し、set-like dedupeはoutput projectionだけに適用する。
- `GE-FRZ-H04` 順序 — 該当。結果`a`: unordered inputはvalidation後canonical sortし、task / journal / effect / receipt / secondary failureは入力順を保存する。persisted authorityのnoncanonical orderは拒否し、graph identityへtopological orderを使わない。
- `GE-FRZ-H05` 型・形式不正 — 該当。結果`a`: public collectionは`collections.abc.Sequence`だけを受理して`str` / `bytes` / `bytearray`とgeneric iterable / generator / set / mappingを拒否する。persisted / internal stateはexact tupleだけとする。`ObservationAdapterV1` / `PersistenceAdapterV1`のbuiltinまたはnominal subclassだけをsupportedとし、virtual registration、structural判定、method probeを禁止する。
- `GE-FRZ-H06` エラー・部分失敗 — 該当。getter / traversal中のordinary `Exception`、上限計算失敗、unsupported adapter。結果`a`: structured invalid / identityなし`UNKNOWN`、effect count 0、partial snapshot非公開。
- `GE-FRZ-H07` 冪等性・再実行 — 該当。結果`a`: 1 invocation内は一度だけfreezeする。exact immutable tupleは再投入可能だが再検証し、その他の`Sequence`はtraversal開始後attempt-scoped、いずれかのmethod callを開始したadapter instanceは新invocationには消費済みとしてretry時にfresh instanceを要求する。
- `GE-FRZ-H08` 時刻・タイムゾーン — `N/A`。freeze / adapter supportはmtime / TZ / DST / TTLを判定に使わない。結果`b`: 時刻依存support / expiryは対象外。
- `GE-FRZ-H09` 文字列・Unicode — 該当。結果`a`: Gate E新規structured collectionは`gate-e-collection-v1`のtype tag、field tag、8-byte big-endian length framing、固定field順でencodeしたstream全長をbound判定する。既存Gate D encoding / metricsは変更しない。
- `GE-FRZ-H10` 数値 — 該当。結果`a`: 新public limitはexact frozen limits dataclassのexact `int`で1以上field hard maximum以下とし、callerは縮小だけできる。`bool` / subclass / float / `None`を拒否する。
- `GE-FRZ-H11` 巨大入力・リソース枯渇 — 該当。結果`a`: `len()`一度、`iter()`一度、`next()`最大N+1、encoding最大B+1で停止する。length invalid、reported count超過、reported / observed mismatch、byte超過、traversal failure、`MemoryError`をそれぞれ`collection-length-invalid`、`collection-count-limit-exceeded`、`collection-length-mismatch`、`collection-byte-limit-exceeded`、`collection-traversal-failed`、`collection-resource-exhausted`へ分類してpartial snapshotを破棄する。単一call永久blockは保証外とする。
- `GE-FRZ-H12` 未定義状態遷移 — 該当。freeze / support validation前にadapter / filesystem / lock / stagingへ進むパス。結果`a`: 全検査完了とimmutable snapshot確定までeffect 0。拒否後に操作を継続しない。

#### GE-3: persistence fault taxonomy / cleanup優先順位

- `GE-PER-H01` 空・ゼロ長・None — 該当。結果`a`: 9 callは`PersistenceAdapterV1`のexact nominal outcomeだけを返し、bare `None` / bool / string / bytes / empty tokenを成功扱いしない。`BoundedBytes(b"")`だけはtransport observationとして受理し、後続strict validationで`CandidateInvalid`とする。
- `GE-PER-H02` 境界値 — 該当。lockからcloseまでの最初 / 最後 / 各1 callと、staging作成前 / 作成済み / 作成可能性あり。結果`a`: 9 call位置を全件fault injectionし、owned stagingがあるまたは作成可能性がある時だけcleanupを1回試行。
- `GE-PER-H03` 重複・衝突 — 該当。結果`a`: 最初のordinary primaryを維持し、cleanup / release / closeの複数secondary failureを発生順のevidenceとして保持する。最初の`BaseException`はsecondary evidenceを付記して再伝播し、単一codeへの圧縮や`ExceptionGroup`への置換をしない。
- `GE-PER-H04` 順序 — 該当。結果`a`: cleanup → release → close → fresh state observationの順とし、secondary failure後もownedな後続処理を継続する。
- `GE-PER-H05` 型・形式不正 — 該当。結果`a`: wrong return type / malformed token / malformed rereadは同じcall位置の`return-invalid`とし、cleanup等ならsecondary evidenceへ記録する。
- `GE-PER-H06` エラー・部分失敗 — 該当。ordinary `Exception`、`BaseException`、cleanup failure、effect証明不能。結果`a`: ordinaryはcall位置を保持するprimary structured failure、不明状態は`UNKNOWN`。`BaseException`はcleanup試行後に元例外を再伝播。
- `GE-PER-H07` 冪等性・再実行 — 該当。adapter fault後の自動retry、cleanup二重実行、古いapproval再利用。結果`a`: 自動retryせず、当該attemptのcleanupは最大1回。staleは新preview / 別承認を要求。
- `GE-PER-H08` 時刻・タイムゾーン — `N/A`。fault優先度をmtime / TZ / elapsed timeで変えない。結果`b`: TTL自動retry / rollbackは対象外。
- `GE-PER-H09` 文字列・Unicode — `N/A`。例外messageの文字列自体をidentityや優先度に使わず、call位置のstructured codeを使う。結果`b`: exception message canonicalizationは対象外。
- `GE-PER-H10` 数値 — 該当。cleanup call countの0 / 1 / 2。結果`a`: owned stagingなしは0回、あるまたは可能性ありは1回、2回以上は禁止。
- `GE-PER-H11` 巨大入力・リソース枯渇 — 該当。disk full、timeout、lock exhaustion、read / write allocation failure。結果`a`: 各call位置のordinary exceptionとして同taxonomy、partial `Success`禁止。
- `GE-PER-H12` 未定義状態遷移 — 該当。adapter exception後の`Success`、effect不明からpreserved / replacedへの飛越、cleanup failureによるprimary上書き。結果`a`: `Success`禁止、fresh observationで証明できなければ`UNKNOWN`、primary保持。

#### GE-4: fresh canonical proof / TOCTOU保証境界

- `GE-PRF-H01` 空・ゼロ長・None — 該当。missing / empty target bytes、parse resultなし、parent / target observationなし。結果`a`: candidateとexact一致しない限りnon-success、effect不明は`UNKNOWN`。
- `GE-PRF-H02` 境界値 — 該当。replace / no-opの両分岐とreturn直前の最終proof。結果`a`: 両分岐で同じ4条件を証明し、no-opも省略しない。
- `GE-PRF-H03` 重複・衝突 — 該当。parent rebind、同一表示pathの別identity、canonical target alias。結果`a`: preview parent identity / canonical target pathとの全一致を要求。
- `GE-PRF-H04` 順序 — 該当。結果`a`: authorityはregistry → policy sections → inventoryの観測とcross-validation後にreverse final recheckしてlockへ進む。replace直前guardを行い、cleanup → release → close後のfinal proofはrepository anchor → parent → target resolution → descriptor bytes → strict parse / candidate比較 → target identity再確認 → parent / anchor再確認 → proof resource close → `Success`の順に固定する。
- `GE-PRF-H05` 型・形式不正 — 該当。wrong target path、malformed bytes、strict parse failure、candidate object mismatch。結果`a`: structured non-success、effect不明は`UNKNOWN`。
- `GE-PRF-H06` エラー・部分失敗 — 該当。fresh read / parse / adapter例外、replace後のproof failure。結果`a`: `Success`禁止。target / staging / effectをfresh observationで証明できなければ`UNKNOWN`。
- `GE-PRF-H07` 冪等性・再実行 — 該当。安定したcandidateのno-op再実行、replace後の再実行。結果`a`: 各`Success` returnごとにfresh proofを新しく作り、前回proofを再利用しない。
- `GE-PRF-H08` 時刻・タイムゾーン — `N/A`。mtime / TZ / TTLでfreshnessを決めない。結果`b`: final observation後の非協調external mutation保証は明示的に対象外。lease / transactionは導入しない。
- `GE-PRF-H09` 文字列・Unicode — 該当。canonical pathのUnicode alias、exact bytes、strict parserのstring canonicality。結果`a`: pathはcanonical resolution、contentはexact bytes + strict object equalityの両方を要求。
- `GE-PRF-H10` 数値 — `N/A`。freshnessにfuzzy score、mtime差、確率、retry countを使わない。結果`b`: 数値的近似判定は対象外。
- `GE-PRF-H11` 巨大入力・リソース枯渇 — 該当。bounded fresh read不能、parse timeout、memory / descriptor exhaustion。結果`a`: 既存candidate / target上限を維持し、切捨てproofを禁止。失敗はnon-success / `UNKNOWN`。
- `GE-PRF-H12` 未定義状態遷移 — 該当。preview→replace / no-op→`Success`、parent rebind / mismatch後の続行。結果`a`: 副作用前guardとreturn直前proofの両方を必須とし、mismatch後の`Success`を禁止。final observation後の外部変更だけは`b`の保証外。

#### GE-5: NFC/NFD alias / persisted identity reuse

- `GE-NFC-H01` 空・ゼロ長・None — 該当。empty path / segment、`None`、欠落persisted path。結果`a`: path入力契約の形式不正としてfilesystem access前にfail-closed。
- `GE-NFC-H02` 境界値 — 該当。1 segment / N segments、segmentごとのNFC exact match。結果`a`: 全segmentを入力時点で検査し、1件でもnon-NFCなら全体を拒否。既定path / item / aggregate上限を維持。
- `GE-NFC-H03` 重複・衝突 — 該当。NFC / NFD alias、current / explicit / active / tombstone間の等価path。結果`a`: alias候補をmerge / repairせず入力集合全体をfail-closed。
- `GE-NFC-H04` 順序 — 該当。NFDを含むitemの位置で結果やfilesystem call countが変わる可能性。結果`a`: 入力集合全体のpath形式をeffect前に検査し、順序に関係なくfail-closed / effect 0。
- `GE-NFC-H05` 型・形式不正 — 該当。non-string path、NFD-only、non-NFC persisted record、separator / traversal等の既存不正。結果`a`: 暗黙normalize / alias探索 / legacy repairなしで拒否。
- `GE-NFC-H06` エラー・部分失敗 — 該当。currentはNFCだがpersisted tombstoneだけnon-NFC、または検査中の一部失敗。結果`a`: persisted identityを再利用せず全体fail-closed、partial inventory / mappingを返さない。
- `GE-NFC-H07` 冪等性・再実行 — 該当。NFC入力の反復、non-NFC legacy recordの反復。結果`a`: canonical NFCは同じidentity、non-NFC persisted itemは毎回拒否。自動修復で結果を変えない。
- `GE-NFC-H08` 時刻・タイムゾーン — `N/A`。path NFC判定はmtime / locale / TZを使わない。結果`b`: 時刻によるalias優先は対象外。
- `GE-NFC-H09` 文字列・Unicode — 該当。NFC、NFD、combining mark、Unicode case alias、invalid scalar。結果`a`: path segmentは入力と`normalize("NFC", segment)`のexact equalityを必須とする。source text / heading normalizationはpath検査後だけに実行。
- `GE-NFC-H10` 数値 — `N/A`。path identityにnumeric score / normalization distanceを使わない。結果`b`: fuzzy Unicode similarityは対象外。
- `GE-NFC-H11` 巨大入力・リソース枯渇 — 該当。巨大path / item collection、normalization expansion。結果`a`: 既定count / aggregate bounds内で入力NFC exact checkを行い、超過はeffect前に拒否。NFDを変換して受理しない。
- `GE-NFC-H12` 未定義状態遷移 — 該当。non-NFC persisted active / tombstoneからID再利用、検査前filesystem lookup、legacy auto-repair。結果`a`: すべて禁止。manual migration自体は`b`の対象外で、今回導入しない。

#### GE-6: change-wide publication / operation readiness分離

- `GE-PUB-H01` 空・ゼロ長・None — 該当。結果`a`: active source 0件はtombstone / empty mappingの有無にかかわらず`publication-active-source-empty`、effect 0とする。vacuous coverageやall-source deletionをrefresh成功にしない。all-empty graph契約、finalize / archive後のsource消滅は変更しない。
- `GE-PUB-H02` 境界値 — 該当。1 active source / N active sources、0 / 1 / Nの未実体将来paths。結果`a`: 全active sourceにexactly one mappingを要求し、将来pathの実在件数はrefresh acceptanceに使わない。既定count / bytes上限は維持。
- `GE-PUB-H03` 重複・衝突 — 該当。duplicate / missing mapping、unknown / cross-change / tombstone source、phase / path / policy reference衝突。結果`a`: mapping構造全体を検査し、partial publicationや自動mergeを禁止。
- `GE-PUB-H04` 順序 — 該当。mapping / source / phaseの入力順でcoverageやpreview hashが変わる可能性。結果`a`: 既定のdeterministic canonical projectionとsame-set判定を維持。
- `GE-PUB-H05` 型・形式不正 — 該当。malformed source / phase ID、noncanonical path、wrong change、tombstone参照、policy ref不整合。結果`a`: refreshをstructured non-successで停止。将来path未実体化を構造不正と同視しない。
- `GE-PUB-H06` エラー・部分失敗 — 該当。mapping一部のvalidation / policy observation failure。結果`a`: change-wide全体をnon-successとし、検査済みsubsetをpublishしない。
- `GE-PUB-H07` 冪等性・再実行 — 該当。same change-wide inputのpreview / apply / no-op再実行。結果`a`: 同じcanonical inputは同じcomplete preview、applyはapproval / fresh guardsを毎回再検査。
- `GE-PUB-H08` 時刻・タイムゾーン — `N/A`。publication / readiness分離にmtime / TZ / TTLを使わない。結果`b`: 時刻による将来phase readiness推定は対象外。
- `GE-PUB-H09` 文字列・Unicode — 該当。fixed `Phase 02`等のlabel、NFC / case path alias、default authority pathへの依存。結果`a`: 固定label / path / fixtureをacceptanceに使わず、各canonical scalar / path契約で検査。
- `GE-PUB-H10` 数値 — `N/A`。固定source / scenario / mapping countをacceptanceに使わない。結果`b`: 49→54 / 43→48はGate D当時のevidenceだけで、後続publicationの数値前提外。既定safety boundsは別途維持。
- `GE-PUB-H11` 巨大入力・リソース枯渇 — 該当。change-wide mapping全体のoversize / complete preview生成不能。結果`a`: 切捨てpublicationを禁止し、既定bounds超過はstructured non-success。
- `GE-PUB-H12` 未定義状態遷移 — 該当。refreshで将来path未実体化を拒否する、またはplan / execute / verify / finalizeがreadinessなしに進むパス。結果`a`: refreshはpublicationだけ、operation固有readinessは各operation直前に必須。両者を流用しない。

#### GE-7: authority preview束縛 / apply時fresh再観測

- `GE-AUT-H01` 空・ゼロ長・None — 該当。planning inventory / policy registry pathの省略、empty、`None`、missing section。結果`a`: 両canonical pathを必須入力とし、default補完なしでpreviewをnon-success化。
- `GE-AUT-H02` 境界値 — 該当。authority exact bytes / records / policy sectionのN-1 / N / N+1。結果`a`: Gate DのPlanningInventory 4096 / 8 MiBとpolicy referenceの8 MiB limit+1契約を維持し、N+1は切捨てずnon-success。
- `GE-AUT-H03` 重複・衝突 — 該当。結果`a`: inventory、registry、policy sourceのrole間はcanonical path、Unicode / case alias key、device + inode + typeでdisjointとする。path / aliasは`authority-role-path-conflict`、physical identityは`authority-role-identity-conflict`。同一policy fileの異なるheadingだけ許可し、same normalized heading / alias pathの二重referenceを拒否する。
- `GE-AUT-H04` 順序 — 該当。結果`a`: root / scalar / adapter validation後、単一repository anchorからregistry → referenced policy sections → inventoryを観測・cross-validationし、inventory → registry → policy sections → anchorの順でidentity / bytesをfinal recheckして直後にlockを取得する。各read前後のscan identity一致を要求し、authority別anchorを禁止する。
- `GE-AUT-H05` 型・形式不正 — 該当。noncanonical path、wrong bytes / identity shape、malformed registry / section、default path省略。結果`a`: previewをnon-successとし、pathだけ同じ別identityも受理しない。
- `GE-AUT-H06` エラー・部分失敗 — 該当。read / identity / section parseの一部失敗、preview後apply再観測失敗。結果`a`: partial authority evidenceを束縛 / 採用せず、applyはtarget変更前にstale non-success。ordinary exceptionは`GE-1`に従う。
- `GE-AUT-H07` 冪等性・再実行 — 該当。same bytesだがfile identity変化、stale approvalの再apply。結果`a`: identityを含む全evidence一致がなければ新preview + 別承認。自動retryしない。
- `GE-AUT-H08` 時刻・タイムゾーン — `N/A`。approval freshnessにmtime / TZ / TTLを使わず、exact bytes / file identity / section evidenceを使う。結果`b`: 時刻だけのapproval expiryは対象外。
- `GE-AUT-H09` 文字列・Unicode — 該当。authority path、policy source path / heading / canonical section bytesのNFC / NFD / case / encoding alias。結果`a`: canonical repository-relative path、no-follow identity、exact bytes / canonical section evidenceの全一致を束縛。
- `GE-AUT-H10` 数値 — `N/A`。authority同一性にfuzzy score / mtime delta / inodeだけで判定しない。結果`b`: 近似一致は対象外。safety boundsは`H02` / `H11`が所有。
- `GE-AUT-H11` 巨大入力・リソース枯渇 — 該当。authority / policy section oversize、read timeout、descriptor exhaustion。結果`a`: bounded exact bytesを切捨てず取得できなければpreview / applyはnon-success。
- `GE-AUT-H12` 未定義状態遷移 — 該当。preview→authority drift→apply、およびfresh proofなしのeffect開始。結果`a`: applyは同repository anchorからfresh再観測し、一項目でも差があればeffect前にstale停止。final observation後の非協調external mutationは`b`の保証外。

#### Gate E 合意済み決定台帳

次の15テーマが従来の19 classification rowsをすべて確定する。各項目は採用規則、採用しなかった代替、
normative scenario、Phase 2 test oracleを一体として固定し、実装やfixtureが別のdefaultを導入することを禁止する。

1. Public API inventory / Result・decision分類（`GE-TOT-H05`）
   - Adopted rule: semantic operation単位でinventory化し、read / preview / apply / observation / ownership / resume /
     finalizeとcustom persistence unionは`Result`、canonical drift / lifecycle admissionはdecisionとする。
   - Rejected alternatives: root `__all__`限定、全non-underscore symbol、現行関数名固定。
   - Spec scenario: 「public Result と decision API の ordinary exception を閉じ込める」。
   - Test classification: `GE-E-TOTALITY`のfixed public fault-injection example。
2. Failure後retryの観測再利用（`GE-TOT-H07`）
   - Adopted rule: 新invocationはroot validation、freeze、mutable observationを全再実行し、前attemptのsnapshot、
     identity、remediation、partial observationを再利用しない。caller提供immutable scalar / valueは再投入できるが再検証し、
     prior decision identityはfresh decisionとのstale比較だけに使う。effect-capable failure後はfresh previewと別承認を要求する。
   - Rejected alternatives: effect前cache、immutable snapshot cache、failure point別再利用。
   - Spec scenario: 「public Result と decision API の ordinary exception を閉じ込める」と
     「replace または no-op Success を fresh canonical proof で確定する」。
   - Test classification: `GE-E-TOTALITY`のfixed retry / fault example。
3. Collection別empty / `None`（`GE-FRZ-H01`）
   - Adopted rule: source paths / files / artifactsは両方無効、`explicit_matches` / exclusions / 任意policy referencesは
     emptyだけ有効、active / tombstones / mappings / planning declarations / graph / ownership / checkpoint / effect等の
     complete-stateはemptyをshape-validとするが`None`無効、`previous_source_items=None`だけbootstrap emptyとする。
   - Rejected alternatives: 全empty拒否、全empty許可、`None == ()`。
   - Spec scenario: 「collection と adapter を effect 前に bounded freeze する」とchange-wide publication scenario。
   - Test classification: `GE-E-FREEZE`のfixed example。
4. Collection別bounds（`GE-FRZ-H02`）
   - Adopted rule: 既存domain boundsを維持し、新complete-state documentは4096 records / 8 MiB、artifactは64 files /
     4 MiB、nested collectionは親budgetへ算入し、切捨てない。
   - Rejected alternatives: 全collection一律化、parameterごと独立8 MiB、全operation合計8 MiB。
   - Spec scenario: 「collection と adapter を effect 前に bounded freeze する」。
   - Test classification: `GE-E-FREEZE`のfixed N-1 / N / N+1 example。
5. Duplicate semantics（`GE-FRZ-H03`）
   - Adopted rule: authoritative inputのsemantic-key duplicateは同値でも拒否し、set-like dedupeはoutput projectionだけ、
     multi-ownerは単一record内だけ許可する。stable-ID recordはID、path recordはcanonical pathとalias key、graph node / edgeは
     phase ID / `(from, to)`、explicit matchはsource locatorとtarget source ID、mappingはsource IDをkeyとする。同じpayloadでも
     異なる有効event ID / sequenceを持つevent recordはduplicateとしない。
   - Rejected alternatives: identical duplicate dedupe、first / last wins、全collection set化。
   - Spec scenario: 「collection と adapter を effect 前に bounded freeze する」とchange-wide publication scenario。
   - Test classification: `GE-P-FREEZE`のHypothesis pure invariantと`GE-E-FREEZE`のfixed negative example。
6. Snapshot ordering（`GE-FRZ-H04`）
   - Adopted rule: unordered inputはvalidation後canonical sortし、task / journal / effect / receipt / secondary failureは
     入力順を保存する。persisted authorityのnoncanonical orderは拒否し、graph identityへtopological orderを使わない。
   - Rejected alternatives: 全順序保存、全sort、persisted authorityのsilent reorder。
   - Spec scenario: 「collection と adapter を effect 前に bounded freeze する」。
   - Test classification: `GE-P-FREEZE`のHypothesis ordering invariantと`GE-E-FREEZE`のfixed ordered-record example。
7. Supported adapter contract（`GE-FRZ-H05`）
   - Adopted rule: public collectionは`collections.abc.Sequence`だけとし、scalar bytes / stringとgeneric iterable等を拒否する。
     persisted / internal stateはexact tupleとする。observationは`ObservationAdapterV1`、persistenceは
     `PersistenceAdapterV1`のbuiltinまたはnominal subclassだけとし、virtual registration、structural判定、method probeを
     禁止する。明示callback / runnerだけは`callable()`確認後にexact immutable returnを検査する。
   - Rejected alternatives: structural runtime protocol、capability tag + duck typing、builtin exact class限定。
   - Spec scenario: 「collection と adapter を effect 前に bounded freeze する」とpublic totality scenario。
   - Test classification: `GE-E-FREEZE` / `GE-E-TOTALITY`のfixed public adapter / callback fault example。
8. Stateful input retry（`GE-FRZ-H07`）
   - Adopted rule: exact immutable tupleは再投入可能だが再検証し、その他の`Sequence`はtraversal開始後attempt-scoped、
     いずれかのmethod callを開始したadapter instanceは新invocationには消費済みとしてretryにfresh instanceを要求する。
   - Rejected alternatives: 全stateful object再利用、全input fresh必須、cleanup成功時adapter再利用。
   - Spec scenario: 「collection と adapter を effect 前に bounded freeze する」とpersistence taxonomy scenario。
   - Test classification: `GE-E-FREEZE` / `GE-I-PERSISTENCE`のfixed cross-invocation retry example。
9. Aggregate byte encoding（`GE-FRZ-H09`）
   - Adopted rule: Gate E新規structured collectionは`gate-e-collection-v1`のtype tag、field tag、8-byte big-endian
     length framing、item count、固定field順でencodeしたstream全長をbound判定する。exact UTF-8 / bytes、canonical path、
     ASCII decimal integer、distinct bool、明示Optional `None`を型別にencodeし、JSON / `repr()` / pickle / platform encodingを
     使わない。既存Gate D encoding / metricsは変えない。
   - Rejected alternatives: canonical JSON、payload長合計だけ、既存identity全面移行。
   - Spec scenario: 「collection と adapter を effect 前に bounded freeze する」。
   - Test classification: `GE-P-FREEZE`のHypothesis deterministic encodingとfixed golden / boundary example。
10. Public limit scalar範囲（`GE-FRZ-H10`）
    - Adopted rule: exact frozen limits dataclassのexact `int`、1以上field hard maximum以下とし、callerは縮小だけできる。
      hard maximumはartifact files 64、source / graph / planning / mapping / policy / Gate E records 4096、artifact 1 MiB/file・
      4 MiB total、structured / source / graph / inventory / policy / manifest / preview 8 MiB、change ID 128 bytesとし、
      `bytes_per_file <= bytes_total`とnested limit <= parent limitを要求する。`bool` / subclass / float / `None`を拒否する。
    - Rejected alternatives: positive int上限なし、uint64範囲、custom limit廃止。
    - Spec scenario: 「collection と adapter を effect 前に bounded freeze する」。
    - Test classification: `GE-E-FREEZE`のfixed scalar boundary example。
11. Infinite / lazy / deceptive-length停止点（`GE-FRZ-H11`）
    - Adopted rule: `len()`一度、`iter()`一度、`next()`最大N+1、encoding最大B+1で停止し、reported / observed length
      不一致を拒否してpartial snapshotを破棄する。length invalid / count limit / mismatch / byte limit / traversal fault /
      `MemoryError`を6個のstable collection codeへ分類し、`BaseException`は再伝播する。単一call永久block、OS kill、
      process terminationは保証外とする。
    - Rejected alternatives: `len()`だけ信用、`len()`無視、worker timeout。
    - Spec scenario: 「collection と adapter を effect 前に bounded freeze する」とpublic totality scenario。
    - Test classification: `GE-E-FREEZE`のfixed deceptive `Sequence` / resource fault example。
12. Adapter return taxonomy（`GE-PER-H01`,`GE-PER-H05`）
    - Adopted rule: lockは`LockAcquired` / `LockUnavailable`、createは`StagingCreated` / `StagingNotCreated`、writeは
      `WriteCompleted`、rereadは`BoundedBytes`、validateは`CandidateValid` / `CandidateInvalid`、replaceは`Replaced` /
      `TargetChanged` / `LockLost`、cleanup / release / closeは各exact outcomeだけを返す。bare primitiveを禁止し、malformed
      returnは`persistence-<call>-return-invalid`、cleanup等ではsecondary evidenceとする。
    - Rejected alternatives: primitive return維持、adapter側も全`Result[T]`、exception-only failure。
    - Spec scenario: 「persistence adapter の全 fault を同じ taxonomy で扱う」。
    - Test classification: `GE-I-PERSISTENCE`のintegration adapter fault test。
13. Cleanup / release / close順序（`GE-PER-H03`,`GE-PER-H04`）
    - Adopted rule: cleanup → release → close → fresh observationとし、secondary failure後も継続する。最初のordinary
      primaryとcall / kind / stable codeを持つ発生順・最大3件のsecondary evidenceを保持する。usable handle欠落時は推測呼出せず
      `<call>-not-attemptable`と`UNKNOWN`を記録する。最初の`BaseException` objectへ`add_note()`し、同じobjectを再伝播する。
    - Rejected alternatives: secondary初回停止、release先行、`ExceptionGroup`、単一secondary code圧縮。
    - Spec scenario: 「persistence adapter の全 fault を同じ taxonomy で扱う」。
    - Test classification: `GE-I-PERSISTENCE`のintegration multi-fault test。
14. Fresh observation / final recheck（`GE-PRF-H04`,`GE-AUT-H04`）
    - Adopted rule: registry → policy sections → inventoryを観測・cross-validationし、reverse final recheck直後にlockを
      取得する。replace直前guardを行い、cleanup / release / close後にreplace / no-op共通のfresh canonical proofを完了して
      から`Success`を返す。
    - Rejected alternatives: replace直後だけproof、authorityの並列順不同read、returnまでlock保持、transaction / lease追加。
    - Spec scenario: 「refresh authority inputs を preview approval に束縛する」と
      「replace または no-op Success を fresh canonical proof で確定する」。
    - Test classification: `GE-I-AUTHORITY` / `GE-I-FRESH-PROOF`のfilesystem integration race / fault test。
15a. Zero-active publication（`GE-PUB-H01`）
    - Adopted rule: active source 0件はtombstone / empty mappingの有無にかかわらず
      `publication-active-source-empty`、effect 0とし、all-empty graph契約は変えない。
    - Rejected alternatives: vacuous coverage成功、tombstoneありだけ成功、operation別許可。
    - Spec scenario: change-wide publication scenario。
    - Test classification: `GE-E-PUBLICATION`のfixed zero-active exampleと`GE-P-PUBLICATION`のHypothesis invariant。
15b. Authority same-file / alias（`GE-AUT-H03`）
    - Adopted rule: inventory、registry、policy sourceのrole間はcanonical path / alias key / physical identityでdisjointとし、
      同一policy fileの異なるheadingだけ許可する。conflict時に自動path選択、merge、default fallbackを行わない。
    - Rejected alternatives: exact pathだけ拒否、same bytesなら共有、inventory / registryだけdisjointでpolicy sourceとの共有許可。
    - Spec scenario: 「refresh authority inputs を preview approval に束縛する」。
    - Test classification: `GE-I-AUTHORITY`のfilesystem integration alias / hard-link fault test。

### HARD-R3: 複数 manifests 間の artifact ownership を検査する

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | manifests 0件・owner不在 | 1: ownership不明、変更候補にしない |
| 2 | 境界値 | 該当 | owner 1件、reader 0/1/N件 | 1: ownerとreaderを別に分類 |
| 3 | 重複・衝突 | 該当 | 複数owners・alias paths | 1: real pathで照合し競合停止 |
| 4 | 順序 | 該当 | scan順でownerが変わる | 1: manifests/pathを決定的整列 |
| 5 | 型・形式不正 | 該当 | 壊れたmanifest/path/traversal | 1: 該当setをinvalidとして停止 |
| 6 | エラー経路 | 該当 | scan途中のpermission/read失敗 | 1: repository全体の判定をunknown化 |
| 7 | 冪等性・再実行 | 該当 | 同じtreeでgraphが変わる | 1: 同じinputsは同じgraph |
| 8 | 時刻・タイムゾーン | 非該当 | mtimeでownerを選ばない | 2: 時刻優先ownershipは対象外 |
| 9 | 文字列 | 該当 | Unicode/case/symlink alias | 1: repo内real pathへ正規化しescape拒否 |
| 10 | 数値 | 非該当 | ownership scoreを使わない | 2: 確率的owner推定は対象外 |
| 11 | 巨大入力・リソース枯渇 | 該当 | manifests/references大量 | 1: bounded scan超過は停止 |
| 12 | 状態遷移の未定義パス | 該当 | owner削除後にorphan化 | 1: finalize前後にgraphを再検査 |

### HARD-R4: interruption と partial failure から検査可能に再開する

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | checkpoint/evidenceなし | 1: 安全なno-op以外は自動再開禁止 |
| 2 | 境界値 | 該当 | 0/1/N effects、最後の1件失敗 | 1: effect単位の状態を記録 |
| 3 | 重複・衝突 | 該当 | operation ID・checkpoint競合 | 1: 自動mergeせず停止 |
| 4 | 順序 | 該当 | 依存effectより先に再開 | 1: journal順序とpreconditionを再検査 |
| 5 | 型・形式不正 | 該当 | 壊れたjournal/未知state | 1: 自動修復せずunknownとして停止 |
| 6 | エラー経路 | 該当 | effect成否不明・部分failure | 1: completed/pending/unknownを分離 |
| 7 | 冪等性・再実行 | 該当 | 二重適用・二重archive | 1: 現物再検査し完了effectをskip |
| 8 | 時刻・タイムゾーン | 非該当 | 経過時間だけでstateを決めない | 2: timeout後の自動rollbackは対象外 |
| 9 | 文字列 | 該当 | path/operation名のUnicode | 1: canonical IDsとreal pathsを記録 |
| 10 | 数値 | 非該当 | retry回数で回復方法を変えない | 2: 自動retry policyは対象外 |
| 11 | 巨大入力・リソース枯渇 | 該当 | journal/evidence巨大 | 1: 証拠切捨てならunknownとして停止 |
| 12 | 状態遷移の未定義パス | 該当 | unknown→completedの飛越 | 1: 新preflight/preview/承認を要求 |

### HARD-R5: finalize と cleanup を preview と承認で制御する

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | 候補0件・approvalなし | 1: no-op preview可、receiptはgate必須 |
| 2 | 境界値 | 該当 | 1件/N件・最後の操作失敗 | 1: 全件順序化しeffect単位に記録 |
| 3 | 重複・衝突 | 該当 | duplicate target・owner競合 | 1: preview生成を拒否 |
| 4 | 順序 | 該当 | refs更新前のdelete | 1: dependency順をpreviewへ固定 |
| 5 | 型・形式不正 | 該当 | 不正preview/approval/hash | 1: 実行せず新preview要求 |
| 6 | エラー経路 | 該当 | filesystem/Git/archive部分失敗 | 1: 後続停止しreceiptに状態記録 |
| 7 | 冪等性・再実行 | 該当 | 二重finalize | 1: state再検査し済みeffectをno-op化 |
| 8 | 時刻・タイムゾーン | 非該当 | 時刻だけでapprovalを失効しない | 2: TTL policyは対象外 |
| 9 | 文字列 | 該当 | traversal/symlink/Unicode path | 1: repo内real path以外を拒否 |
| 10 | 数値 | 非該当 | 件数閾値で自動承認しない | 2: auto-approvalは対象外 |
| 11 | 巨大入力・リソース枯渇 | 該当 | preview全件表示不能 | 1: 完全機械出力不能なら実行禁止 |
| 12 | 状態遷移の未定義パス | 該当 | preview後drift・failed→finalized | 1: approval失効、再検査と再開要求 |

### HARD-R6: hardening を deterministic tests と opt-in smoke で検証する

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | empty fixture/tool不在 | 1: negative testと通常CI独立を確認 |
| 2 | 境界値 | 該当 | 0/1/N items/effects/manifests | 1: boundary fixturesを用意 |
| 3 | 重複・衝突 | 該当 | duplicate IDs/paths/owners | 1: negative fixturesで停止確認 |
| 4 | 順序 | 該当 | reverse/shuffleで結果差 | 1: order-independence propertyを検証 |
| 5 | 型・形式不正 | 該当 | malformed schema/journal/preview | 1: 種別ごとのnegative fixtures |
| 6 | エラー経路 | 該当 | partial write/probe/tool failure | 1: fault injection tests |
| 7 | 冪等性・再実行 | 該当 | 2回目で出力/effect差 | 1: propertyとintegrationで検証 |
| 8 | 時刻・タイムゾーン | 該当 | clock/locale依存flake | 1: clock/locale固定、実差異はsmoke報告 |
| 9 | 文字列 | 該当 | Unicode/空白/case/encoding/path | 1: cross-platform string fixtures |
| 10 | 数値 | 該当 | overflow/負ID/上限値 | 1: invalid/boundary fixtures |
| 11 | 巨大入力・リソース枯渇 | 該当 | stress/timeout/disk exhaustion | 1: bounded stressと明示timeout/fault test |
| 12 | 状態遷移の未定義パス | 該当 | opt-inなしの実tool起動 | 1: 通常CIから隔離しflag必須 |

## Spec holes Phase 2 の検証対応（実装時）

`tasks.md` 5.1 で上記すべての「該当」行を fixture test、例示 test、property test、または理由付き未検証へ
一対一で対応付ける。allocator / normalizer / ownership graph / manifest round-trip / preview builderに加え、
Gate Dのpure graph / remediation projectionとcanonical path-role invariantだけをproperty test候補とする。
mapping / lifecycle public seamはfixture / fixed public example、filesystem / Git / journal / actual toolsはintegration test
またはopt-in smoke候補とする。

### TDDで確認するpublic seams

テストはprivate helperではなく、次の確認済みseamから観測する。GSD planは関数配置を決められるが、このseamを
迂回したimplementation-detail testは追加しない。

1. v1 / v2 manifest read、read-only migration preview、approved migration apply。
2. canonical sourceからのstable identity allocation、source-to-phase / plan / evidence mapping validation、started v2の
   read-only refresh previewとapproval-bound atomic apply。
3. plan / execute / resume / verify / finalize共通のlifecycle preflightとdrift result。
4. repository rootからの全manifest ownership scanとownership graph result。
5. checkpoint / receiptを入力にしたresume plan result。
6. finalize read-only preview、approval-bound apply、partial-failure receipt。
7. 上記operationのstructured CLI result。optional toolsはsystem boundaryでだけfake runnerを使う。

### Phase 2 evidence catalog

| evidence ID | 検証形態 | 予定test seam |
| --- | --- | --- |
| `P-ALLOC` | Hypothesis property | namespaced allocatorの単調増加、counter sentinel、欠番非再利用、順序不変、active / tombstone衝突停止 |
| `P-NORMALIZER` | Hypothesis property | UTF-8 / LF / NFC / ATX block source normalizerとcheckbox normalizerの冪等性、等価表記、checkbox-only分離 |
| `P-MANIFEST-RT` | Hypothesis property | v2 manifest canonical round-tripとunknown-field拒否 |
| `P-OWNERSHIP` | Hypothesis property | ownership graphの順序不変、単独owner安全性、alias衝突停止 |
| `P-PREVIEW` | Hypothesis property | preview builderの決定性、冪等性、hash binding |
| `E-MIGRATION` | fixture / example | v1読取、read-only preview、staging failure時v1保持、unknown / downgrade拒否 |
| `E-REFRESH` | fixture / filesystem integration | started v2のempty / stale / partial / oversized refresh、新previewと別承認によるmanual retry、state / capabilities / ownership / lifecycle保持、atomic replace |
| `E-MAPPING` | fixture / example | category / ID prefix / parent整合、全active sourceのphase baseline、operation別horizon、空・重複・cross-change・tombstone・path不在・policy ref不整合、観測中のpath / identity変化 |
| `E-DRIFT` | fixture / example | source / phase / capability drift、checkbox-only除外、unknown停止、final observation後のdriftと実operation直前の再検査 |
| `I-OWNERSHIP` | filesystem / Git integration | 全manifest scan、shared reference、symlink / traversal / Unicode / case alias |
| `I-RECOVERY` | filesystem integration | 0/1/N effects、中断、corrupt journal、resume再検査、巨大evidence |
| `I-FINALIZE` | filesystem / Git integration | no-op、stale approval、dependency順、partial failure receipt、再実行 |
| `E-POLICY` | fixture / example | current-tree stable record、ID一意性、`adaptive-policy-section-v1`のexact section hash、duplicate / fence / alias拒否、history非依存 |
| `E-BOUNDS` | bounded example | suffix`1..999999`、counter sentinel`1000000`、source / policy section / item / manifest / journal / previewの境界とlimit+1停止 |
| `S-TOOLS` | opt-in smoke | 実OpenSpec / GSD probe、drift、中断resume、no-op finalize、未検証報告 |
| `A-P-GRAPH` | Hypothesis property（Plan A） | pure graph / remediation projectionの入力順不変、set-like重複排除、UTF-8 bytes順、旧新edge union downstream、observedとのreplanning積集合、同じvalid inputのidentity決定性 |
| `A-E-GRAPH` | fixed public example（Plan A） | expected / observed独立validation、両空 / 片側空 / 1 phase / 全削除、同時add / remove / path / dependency、同phase複数issue、dependency順序だけのno drift、duplicate / self / unknown edge / cycle、4096 / 8 MiBのN-1 / N / N+1 |
| `A-E-TARGET` | fixed public example（Plan A） | malformed / expected-only / observed-only / both / neitherの先行分類、変更phaseとの一致 / 不一致、target / downstream同時削除、removed / unknown actionのissue非重複 |
| `A-E-COMPAT` | fixed public / golden example（Plan A） | valid clean identity bytes、valid drift identity、同じinputの再実行、fresh recomputeによるstale replay、v1 discriminator / field / schema / version維持 |
| `A-E-REPIN` | source-pinned fixture / tracked evidence（Plan A） | 5 scenario追加によるactive source items / mappings 49→54（scenario headings 43→48）のhandoff manifest、旧49-ID mapping / expected preview fixture、lifecycle golden / tracked evidenceの一括repin |
| `A-E-EXIT` | fixed report / command evidence（Plan A） | `task check`、review reportのstatus clean / Critical 0 / Warning 0、verifier passed 10/10 / behavior_unverified 0 / overrides 0 / traceability Complete、security report present / open threats 0と欠落・失敗・未実行時のPhase 4拒否 |
| `B-P-PATH-ROLE` | Hypothesis property（Plan B） | canonical path-role invariantの入力順不変、phase / plan / evidenceのexact・NFC/NFD・case alias disjointness、valid owner / evidence sharing |
| `B-E-PATH-ROLE` | fixed public example（Plan B） | canonical POSIX scalar、empty / wrong type / backslash / absolute / dot / NUL、4096 / 8 MiB境界、3組のrole collision、evidence共有 / 分割、PlanningInventory / direct ManifestMappingのcode差、早期拒否時filesystem call count 0 |
| `B-I-PATH-RACE` | fixed filesystem integration（Plan B） | filesystem観測中のmissing / alias / symlink / identity changeをfail-closedし、final observation後は実operation直前に再検査する |
| `GE-E-TOTALITY` | fixed public fault-injection matrix | semantic operation inventory全件 × malformed root / scalar / getter / method / callback / hash / serialization / `Sequence` × ordinary `Exception` / `BaseException`。partial result非公開、fresh retry、owned cleanup後再伝播を観測 |
| `GE-P-FREEZE` | Hypothesis property | pure collection invariantだけ。count / framed aggregate bytes / duplicate / ordering契約に対する一度のimmutable freeze、元collection再走査なし、same valid inputの決定性 |
| `GE-E-FREEZE` | fixed public fault-injection example | collection別empty / `None`、N-1 / N / N+1、exact limit scalar、deceptive `Sequence`、stateful retry、unsupported nominal adapterをeffect前に判定し、adapter / filesystem / lock / staging call count 0 |
| `GE-I-PERSISTENCE` | fixed adapter + filesystem fault-injection | 9 callのexact nominal outcome / `return-invalid`、ordinary / `BaseException`、cleanup 0 / 1 / 2、cleanup → release → close、発生順secondary evidence、fresh observation、target / staging / effectのUNKNOWN |
| `GE-I-FRESH-PROOF` | fixed filesystem race / fault-injection | replace直前guard、replace / no-op共通のcleanup / release / close後proof、parent rebind、target re-resolution差、bytes / strict parse / candidate object / descriptor identity mismatch、read / parse exception、final observation後の外部変更は保証外である境界 |
| `GE-P-NFC-PATH` | Hypothesis property | pure path / collection invariantだけ。segment-wise NFC exactness、NFC / NFD alias collision、input order不変、canonical NFC入力のidentity決定性 |
| `GE-E-NFC-REUSE` | fixed public example | current / explicit / active / tombstoneのNFD-only、NFC-NFD alias、non-NFC persisted identity reuseをfilesystem call count 0でfail-closedし、auto-repairしない |
| `GE-P-PUBLICATION` | Hypothesis property | pure mapping graph / collection invariantだけ。active source coverage exactly-one、duplicate / unknown / cross-change / tombstone拒否、input order不変、same-set preview決定性 |
| `GE-E-PUBLICATION` | fixed public example | zero activeを`publication-active-source-empty` / effect 0、one / many activeをcoverage検査し、未実体将来pathsとoperation readiness未達についてrefresh publicationと各readinessを別々に判定 |
| `GE-I-AUTHORITY` | fixed filesystem race / fault-injection | 両authority path必須、N-1 / N / N+1、role間path / alias / hard-link conflict、registry → sections → inventory観測とreverse recheck、same bytes + replaced identity、read / parse / scan identity race、effect-before-validation call count 0 |

### Spec-holes Phase 1 → Phase 2 一対一対応

各cellは対応するPhase 1表の同番号へ一つ以上の反証可能なevidenceを割り当てる。`N/A`はPhase 1で
明示的に非該当 / スコープ外とした項目で、test未作成の理由も同じcellに残す。
`H01`〜`H12`は順に、空・ゼロ長・None、境界値、重複・衝突、順序、型・形式不正、エラー経路、
冪等性・再実行、時刻・タイムゾーン、文字列、数値、巨大入力・リソース枯渇、状態遷移の未定義パスを表す。
mapping readinessのconcurrency / TOCTOU境界は新しいholeを追加せず、観測中のmissing / alias / symlink / identity changeを
`H06`、final observation後のdriftと実operation直前の再検査を`H12`として、既存の`E-MAPPING` / `E-DRIFT`で検証する。

| requirement | H01 | H02 | H03 | H04 | H05 | H06 | H07 | H08 | H09 | H10 | H11 | H12 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `HARD-R1` stable identity / mapping | `E-MAPPING`,`E-REFRESH` | `P-ALLOC`,`E-BOUNDS`,`E-MAPPING` | `P-ALLOC`,`E-MAPPING` | `P-ALLOC`,`P-NORMALIZER`,`E-MAPPING` | `P-MANIFEST-RT`,`E-MAPPING`,`P-NORMALIZER`,`E-POLICY` | `E-MIGRATION`,`E-REFRESH`,`E-MAPPING` | `P-ALLOC`,`P-MANIFEST-RT`,`P-NORMALIZER`,`E-REFRESH` | N/A: identityへ時刻不使用 | `P-NORMALIZER`,`E-MAPPING`,`E-POLICY` | `P-ALLOC`,`E-BOUNDS` | `E-BOUNDS`,`P-NORMALIZER`,`E-REFRESH` | `P-ALLOC`,`E-MIGRATION`,`E-MAPPING`,`E-REFRESH` |
| `HARD-R2` drift | `A-E-GRAPH`,`A-E-TARGET`,`B-E-PATH-ROLE` | `A-E-GRAPH`,`B-E-PATH-ROLE` | `A-P-GRAPH`,`A-E-GRAPH`,`B-P-PATH-ROLE`,`B-E-PATH-ROLE` | `A-P-GRAPH`,`A-E-GRAPH`,`B-P-PATH-ROLE` | `A-E-GRAPH`,`A-E-TARGET`,`B-E-PATH-ROLE` | `A-E-GRAPH`,`A-E-COMPAT`,`B-I-PATH-RACE` | `A-P-GRAPH`,`A-E-COMPAT`,`A-E-REPIN` | N/A: mtime / TZ / TTL判定なし | `B-P-PATH-ROLE`,`B-E-PATH-ROLE` | `A-E-GRAPH`,`B-E-PATH-ROLE` | `A-E-GRAPH`,`B-E-PATH-ROLE` | `A-E-TARGET`,`A-E-COMPAT`,`A-E-EXIT` |
| `HARD-R3` ownership | `P-OWNERSHIP` | `P-OWNERSHIP`,`I-OWNERSHIP` | `P-OWNERSHIP`,`I-OWNERSHIP` | `P-OWNERSHIP` | `I-OWNERSHIP` | `I-OWNERSHIP` | `P-OWNERSHIP` | N/A: 時刻優先なし | `I-OWNERSHIP` | N/A: score推定なし | `E-BOUNDS`,`I-OWNERSHIP` | `I-OWNERSHIP`,`I-FINALIZE` |
| `HARD-R4` recovery | `I-RECOVERY` | `I-RECOVERY` | `I-RECOVERY` | `I-RECOVERY` | `I-RECOVERY` | `I-RECOVERY` | `I-RECOVERY` | N/A: timeout自動rollbackなし | `I-RECOVERY` | N/A: retry回数policyなし | `E-BOUNDS`,`I-RECOVERY` | `I-RECOVERY`,`E-DRIFT` |
| `HARD-R5` finalize | `P-PREVIEW`,`I-FINALIZE` | `I-FINALIZE` | `P-PREVIEW`,`I-FINALIZE` | `P-PREVIEW`,`I-FINALIZE` | `I-FINALIZE` | `I-FINALIZE` | `P-PREVIEW`,`I-FINALIZE` | N/A: TTL失効なし | `I-FINALIZE`,`I-OWNERSHIP` | N/A: 件数自動承認なし | `E-BOUNDS`,`P-PREVIEW` | `I-FINALIZE`,`E-DRIFT` |
| `HARD-R6` verification | `E-MAPPING` | `E-BOUNDS` | `E-MAPPING`,`I-OWNERSHIP` | `P-ALLOC`,`P-OWNERSHIP`,`P-PREVIEW` | `P-MANIFEST-RT`,`I-RECOVERY` | `E-MIGRATION`,`I-RECOVERY`,`I-FINALIZE` | `P-ALLOC`,`P-NORMALIZER`,`P-MANIFEST-RT`,`P-OWNERSHIP`,`P-PREVIEW` | `S-TOOLS`（通常CIはclock固定） | `E-MAPPING`,`I-OWNERSHIP` | `E-BOUNDS` | `E-BOUNDS`,`I-RECOVERY` | `S-TOOLS`（明示opt-inのみ） |

### Gate E targeted Phase 1 → Phase 2 対応

以下は上記Gate E差分IDの対応である。従来`c`だった19 rowsを含め、expected result、exact call order、bound、
retry、return taxonomy、alias判定のoracleは合意済み決定台帳とnormative scenariosで確定している。
I/O、adapter fault、filesystem race、cleanup順序はすべてfixed example / fault-injectionで検証する。
Hypothesisは`GE-P-FREEZE`、`GE-P-NFC-PATH`、`GE-P-PUBLICATION`のpure collection / path / graph invariantだけに限定する。

| behavior family | fixed public / fault-injection対応 | Hypothesis対応 | N/A / scope assertion |
| --- | --- | --- | --- |
| `GE-1` public totality | `GE-TOT-H01,H02,H05,H06,H07,H09,H10,H11,H12` → `GE-E-TOTALITY`。semantic operation inventory、fresh retryを含む | なし | `H03,H04,H08` N/A |
| `GE-2` bounded freeze / adapter | `GE-FRZ-H01,H02,H03,H04,H05,H06,H07,H09,H10,H11,H12` → `GE-E-FREEZE`。collection category、bounds、nominal contract、stateful retry、N+1停止を含む | `H03,H04,H09` → `GE-P-FREEZE` | `H08` N/A |
| `GE-3` persistence taxonomy | `GE-PER-H01,H02,H03,H04,H05,H06,H07,H10,H11,H12` → `GE-I-PERSISTENCE`。exact return、ordered secondary evidence、cleanup → release → closeを含む | なし | `H08,H09` N/A |
| `GE-4` fresh proof | `GE-PRF-H01,H02,H03,H04,H05,H06,H07,H09,H11,H12` → `GE-I-FRESH-PROOF`。replace guardとpost-close final proofを含む | なし | `H08,H10` N/A。final observation後のexternal mutationは保証外assertionを含む |
| `GE-5` NFC path / persisted reuse | `GE-NFC-H01,H02,H03,H04,H05,H06,H07,H09,H11,H12` → `GE-E-NFC-REUSE` | `H02,H03,H04,H07,H09,H11` → `GE-P-NFC-PATH` | `H08,H10` N/A |
| `GE-6` publication / readiness | `GE-PUB-H01,H02,H03,H05,H06,H07,H09,H11,H12` → `GE-E-PUBLICATION`。zero-active failureを含む | `H02,H03,H04,H07,H11` → `GE-P-PUBLICATION` | `H08,H10` N/A |
| `GE-7` authority binding | `GE-AUT-H01,H02,H03,H04,H05,H06,H07,H09,H11,H12` → `GE-I-AUTHORITY`。role disjointnessとobservation / final recheck順を含む | なし | `H08,H10` N/A |

今回はPhase 2のtest node / fixtureを実装しない。このrebaselineで15テーマのoracleとsemantic public API inventoryを
固定した。後続実装時のrepinは7 scenariosのactive source / scenario / mapping count、
source hash、handoff manifest、mapping / refresh / lifecycle fixtures、tracked evidenceを一括対象とし、Gate Dの旧evidenceを削除しない。

### HARD-R2 Phase 2検証明細とplan所有

HARD-R2の該当holeには未検証を残さない。Hypothesisはpure projection / invariantだけへ限定し、public builder /
readiness / gate、bounded failure、report gateはfixed example、filesystem observation中のraceはfixed integrationで
検証する。非協調なexternal processが各pathのfinal observation後に変更しないことの保証はH08と同様にスコープ外であり、
その代わりconsumerが実operation直前にreadinessとdrift preflightを再実行する契約を`B-I-PATH-RACE`で確認する。

| hole | 検証形態 | evidence / 反証内容 | 所有plan |
| --- | --- | --- | --- |
| H01 空・ゼロ長・None | fixed public example | `A-E-GRAPH`: 両空 / 片側空 / 全削除と空replanning action、`A-E-TARGET`: empty / `None` target、`B-E-PATH-ROLE`: empty path | Plan A / Plan B（各seamを分離） |
| H02 境界値 | fixed public bounded example | `A-E-GRAPH`: 0 / 1 phaseとgraph 4096 / 8 MiB N-1 / N / N+1、`B-E-PATH-ROLE`: inventory 4096 / 8 MiB N-1 / N / N+1 | Plan A / Plan B（各入力上限） |
| H03 重複・衝突 | Hypothesis + fixed public example | `A-P-GRAPH`,`A-E-GRAPH`: duplicate / multi-change / set-like projection、`B-P-PATH-ROLE`,`B-E-PATH-ROLE`: 3組のrole collisionとevidence共有 / 分割 | Plan A / Plan B（各invariant） |
| H04 順序 | Hypothesis + fixed public example | `A-P-GRAPH`,`A-E-GRAPH`: dependency / tuple順序不変とUTF-8順、`B-P-PATH-ROLE`: declaration順序不変 | Plan A / Plan B |
| H05 型・形式不正 | fixed public example | `A-E-GRAPH`: duplicate / self / unknown edge / cycle / scalar不正、`A-E-TARGET`: malformed target、`B-E-PATH-ROLE`: malformed pathとerror code precedence / filesystem call count 0 | Plan A / Plan B |
| H06 エラー経路 | fixed public + fixed integration | `A-E-GRAPH`: 独立validationの部分失敗 / timeout / truncation、`A-E-COMPAT`: stale replay、`B-I-PATH-RACE`: 観測中のrace | Plan A / Plan B |
| H07 冪等性・再実行 | Hypothesis + fixed golden / tracked evidence | `A-P-GRAPH`,`A-E-COMPAT`: same input / tuple shuffleのoutputs・identityとclean bytes、`A-E-REPIN`: Plan A一括repinの一回性 | Plan A |
| H08 時刻・タイムゾーン | 非該当 / scope assertion | mtime / timezone / DST / TTLをdecision inputへ含めない。`B-I-PATH-RACE`は時刻値でなくpoint-in-time observation resultを検査 | Plan B（integration境界だけ） |
| H09 文字列 | Hypothesis + fixed public example | `B-P-PATH-ROLE`,`B-E-PATH-ROLE`: canonical POSIX、NFC/NFD / case aliasと、separator / NUL / encoding / 空白を含むmalformed境界 | Plan B |
| H10 数値 | fixed public bounded example | `A-E-GRAPH`,`B-E-PATH-ROLE`: exact positive integer、`bool` / float / negative / NaN / inf拒否、4096 / 8 MiB off-by-one | Plan A / Plan B（各入力上限） |
| H11 巨大入力・リソース枯渇 | fixed public bounded example | `A-E-GRAPH`,`B-E-PATH-ROLE`: N+1 / aggregate oversize / timeoutを切捨てずidentityなしUNKNOWN | Plan A / Plan B |
| H12 状態遷移の未定義パス | fixed public / report example | `A-E-TARGET`: target 4関係と削除時action、`A-E-COMPAT`: stale→fresh DRIFTED、`A-E-EXIT`: evidence欠落 / fail / unrun時のPhase 4拒否 | Plan A |

Plan Aは`A-*` evidenceとsource-pinned handoff manifest、旧49-ID mapping / expected preview fixture、lifecycle golden /
tracked evidenceその他の派生authorityのrepinを一括所有する。Plan Bは`B-*` evidenceだけを所有し、同じauthorityを
再repinしない。第3のproduction planは追加しない。

実装完了時はevidence IDを実在するtest node ID / fixture pathへ置換または併記する。opt-in smokeを実行できない
場合は`S-TOOLS`を検証済みにせず、環境または安全なdry-run seam不在を理由付き未検証として残す。
