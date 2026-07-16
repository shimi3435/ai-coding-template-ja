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
`{id,category,last_source_path,last_raw_heading,fingerprint}`とする。IDはcategory別の正整数counterから単調増加し、
削除時もcounterを戻さずtombstoneを残す。mapping entryはexact
`{source_id,phase_id,phase_path,plan_paths,evidence_paths,policy_references}`とし、migration直後の空mappingは
schema-validだがplan / execute等のoperation-readyではない。

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
のUTF-8 aggregateがfile上限を越える場合は切り捨てず停止する。

v1 readerは残し、v1 / v2を判別して読み取る。migration previewはv1 bytes hash、生成予定v2 hash、stable ID
割当、作成・更新候補、除外理由を副作用なしで返す。applyはpreview hashと明示承認を再検査し、v2を同directoryの
stagingへ書き、bounded再読で完全validateしてからだけatomic replaceする。staging作成・write・validation失敗時は
target v1 bytesを一切変更せず、staging cleanup結果を報告する。replace失敗時はtargetを再読して元v1 hashと一致すれば
v1保持、一致を証明できなければ`unknown`として停止し、自動rollbackしない。unknown schema、v2→v1、callerがdisk
schemaより低いschemaを要求するdowngradeはpreviewもapplyもfail-closedし、既存bytesを変更しない。

### Gate C. adaptive policyはcurrent-tree stable reference recordで参照する

policy本文の正はcurrent treeの`docs/template/adr/0008-adaptive-openspec-gsd-execution-boundary.md`と
`docs/agents/workflow.md`である。実装時に
`docs/agents/adaptive-change-execution.references.json`を追加し、record version、stable requirement / scenario ID、
current-tree source path、section heading、section normalized SHA-256、非規範のhistorical provenanceを保持する。
旧change specの`a2eb744`は利用可能なrepository cloneでの由来確認だけに使う。branch ref消滅や履歴省略により
blobへ到達できない環境でも契約判定を変えず、runtime / 通常CIはcommitの存在やblob到達性を要求しない。
通常CIはrecord内IDの一意性、参照先current-tree path / heading / section hash、hardening mapping内IDの存在だけを検査する。
policy本文をrecord、manifest、GSD artifactsへ複製しない。

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

hardening scenarioからpolicy referenceへの対応は次のとおりである。これはenforcementの由来であり、
hardening requirementの振る舞いをpolicyへ逆輸入しない。

| hardening scenario | stable policy references |
| --- | --- |
| R1: 新規ID / 順序・空白 / 曖昧衝突 | `ACE-S2-OPEN-SPEC-AUTHORITY`, `ACE-S2-SPEC-CHANGE-REPLAN` |
| R1: phase mapping完全性 | `ACE-S2-ONE-PHASE-ONE-CHANGE`, `ACE-S4-CONTEXT-PARITY` |
| R2: canonical specification変化 / checkbox-only | `ACE-S2-SPEC-CHANGE-REPLAN`, `ACE-S5-REVALIDATE-ON-DRIFT` |
| R2: phase graph / capability変化 | `ACE-S4-SOURCE-PINNED`, `ACE-S4-NO-AUTO-FALLBACK` |
| R2: 検査不能 | `ACE-S1-START-GATES`, `ACE-S4-NO-AUTO-FALLBACK` |
| R3: 単独所有 / 共有参照 / 競合・不明 | `ACE-S2-OPEN-SPEC-AUTHORITY`, `ACE-S5-SINGLE-ACTIVE-CLOSE` |
| R3: ownership境界外path | `ACE-S4-SOURCE-PINNED`, `ACE-S5-SINGLE-ACTIVE-CLOSE` |
| R4: 副作用前 / 部分成功の中断 | `ACE-S4-RESUME`, `ACE-S4-SOURCE-PINNED` |
| R4: source / capability変化 | `ACE-S2-SPEC-CHANGE-REPLAN`, `ACE-S4-NO-AUTO-FALLBACK` |
| R4: 自動回復不能 | `ACE-S4-NO-AUTO-FALLBACK`, `ACE-S4-RESUME` |
| R5: preview / no-op | `ACE-S5-OPEN-SPEC-FINAL`, `ACE-S5-SINGLE-ACTIVE-CLOSE` |
| R5: stale preview / 部分失敗 | `ACE-S5-REVALIDATE-ON-DRIFT`, `ACE-S4-RESUME`, `ACE-S4-NO-AUTO-FALLBACK` |
| R6: optional toolsなし / fixtures / properties / smoke | `ACE-S1-START-GATES`, `ACE-S5-OPEN-SPEC-FINAL` |

### 1. stable ID は単調増加し、曖昧一致を拒否する

MVP manifest の schema migration により raw source identity と正規化 fingerprint を保存する。既存の一意な
mapping を優先し、新しい item だけ category 内の次番号を割り当てる。削除済み ID は tombstone として残し、
欠番を再利用しない。見出し変更などで一意に一致しなければ停止し、類似度による自動紐付けをしない。

### 2. mapping は policy 参照を持つ enforcement record とする

各 phase / plan / evidence mapping は source stable ID に加え、検査対象の
`adaptive-change-execution` requirement / scenario identifier を持つ。bridge は参照の存在、一意性、change 所属、
被覆だけを検査し、policy 文を manifest や GSD artifacts へ複製しない。

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

allocator、normalizer、manifest round-trip、ownership graph、preview builderだけをproperty tests対象にする。
mapping validatorは固定fixture / example、filesystem、Git、atomic journalはisolated integration tests、
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

### R1: stable source identity と requirement mapping を維持する

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | source item / mapping / evidence が空 | 1: 必須 item 欠落として mapping を拒否 |
| 2 | 境界値 | 該当 | 初回ID、最大ID、番号枯渇 | 1: 単調増加し上限超過は停止 |
| 3 | 重複・衝突 | 該当 | ID/source の一対多・多対一 | 1: 自動mergeせず衝突を報告 |
| 4 | 順序 | 該当 | 並び替えで再番号付け | 1: identity 一致時は既存IDを再利用 |
| 5 | 型・形式不正 | 該当 | malformed ID / fingerprint / mapping | 1: strict validationで停止 |
| 6 | エラー経路 | 該当 | migration の部分失敗 | 1: stagingを採用せず旧manifestを保持 |
| 7 | 冪等性・再実行 | 該当 | 再実行でIDが変わる | 1: 同じsource/mappingは同じ出力 |
| 8 | 時刻・タイムゾーン | 非該当 | IDへ時刻を含めない | 2: timestampによるidentity判定は対象外 |
| 9 | 文字列 | 該当 | Unicode正規化・空白・case衝突 | 1: raw値保持、一意でなければ停止 |
| 10 | 数値 | 該当 | 負数・浮動ID・overflow | 1: 正整数と明示上限だけ許容 |
| 11 | 巨大入力・リソース枯渇 | 該当 | tombstone / mappingの肥大 | 1: 切捨てず上限超過を報告 |
| 12 | 状態遷移の未定義パス | 該当 | deleted ID の復活・再利用 | 1: tombstone保持、再利用禁止 |

### R2: lifecycle 操作前に source と派生状態の drift を検査する

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | hash / commit / phase state 不在 | 1: unknownとして操作停止 |
| 2 | 境界値 | 該当 | 1項目だけ不一致・0 phases | 1: 必須項目1件でも不一致なら停止 |
| 3 | 重複・衝突 | 該当 | source commit / phase identity競合 | 1: 競合列挙後に再計画要求 |
| 4 | 順序 | 該当 | 操作後にpreflight | 1: 全操作の書込前に共通検査 |
| 5 | 型・形式不正 | 該当 | schema/hash/phase graph不正 | 1: 比較不能をunknownとして停止 |
| 6 | エラー経路 | 該当 | read/probe timeout・部分成功 | 1: 部分greenを採用しない |
| 7 | 冪等性・再実行 | 該当 | 同じ状態で判定が変わる | 1: 共通normalizer/matrixで決定的判定 |
| 8 | 時刻・タイムゾーン | 非該当 | mtimeでdriftを決めない | 2: mtime最適化は対象外 |
| 9 | 文字列 | 該当 | checkbox、改行、Unicode差 | 1: checkbox-only normalizerをfixture化 |
| 10 | 数値 | 非該当 | 類似度や閾値で一致させない | 2: fuzzy drift判定は対象外 |
| 11 | 巨大入力・リソース枯渇 | 該当 | 全artifact/phase検査不能 | 1: 切捨て時はunknownとして停止 |
| 12 | 状態遷移の未定義パス | 該当 | drift中のexecute/finalize | 1: 再同期まで対象操作を禁止 |

### R3: 複数 manifests 間の artifact ownership を検査する

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

### R4: interruption と partial failure から検査可能に再開する

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

### R5: finalize と cleanup を preview と承認で制御する

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

### R6: hardening を deterministic tests と opt-in smoke で検証する

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
一対一で対応付ける。allocator / normalizer / ownership graph / manifest round-trip / preview builderだけを
property test候補とし、mappingはfixture / example、filesystem / Git / journal / actual toolsはintegration test
またはopt-in smoke候補とする。

### TDDで確認するpublic seams

テストはprivate helperではなく、次の確認済みseamから観測する。GSD planは関数配置を決められるが、このseamを
迂回したimplementation-detail testは追加しない。

1. v1 / v2 manifest read、read-only migration preview、approved migration apply。
2. canonical sourceからのstable identity allocationとsource-to-phase / plan / evidence mapping validation。
3. plan / execute / resume / verify / finalize共通のlifecycle preflightとdrift result。
4. repository rootからの全manifest ownership scanとownership graph result。
5. checkpoint / receiptを入力にしたresume plan result。
6. finalize read-only preview、approval-bound apply、partial-failure receipt。
7. 上記operationのstructured CLI result。optional toolsはsystem boundaryでだけfake runnerを使う。

### Phase 2 evidence catalog

| evidence ID | 検証形態 | 予定test seam |
| --- | --- | --- |
| `P-ALLOC` | Hypothesis property | allocatorの単調増加、欠番非再利用、順序不変、衝突停止 |
| `P-NORMALIZER` | Hypothesis property | source / checkbox normalizerの冪等性とcheckbox-only分離 |
| `P-MANIFEST-RT` | Hypothesis property | v2 manifest canonical round-tripとunknown-field拒否 |
| `P-OWNERSHIP` | Hypothesis property | ownership graphの順序不変、単独owner安全性、alias衝突停止 |
| `P-PREVIEW` | Hypothesis property | preview builderの決定性、冪等性、hash binding |
| `E-MIGRATION` | fixture / example | v1読取、read-only preview、staging failure時v1保持、unknown / downgrade拒否 |
| `E-MAPPING` | fixture / example | 空・重複・cross-change・policy ref不整合・coverage不足 |
| `E-DRIFT` | fixture / example | source / phase / capability drift、checkbox-only除外、unknown停止 |
| `I-OWNERSHIP` | filesystem / Git integration | 全manifest scan、shared reference、symlink / traversal / Unicode / case alias |
| `I-RECOVERY` | filesystem integration | 0/1/N effects、中断、corrupt journal、resume再検査、巨大evidence |
| `I-FINALIZE` | filesystem / Git integration | no-op、stale approval、dependency順、partial failure receipt、再実行 |
| `E-POLICY` | fixture / example | current-tree stable record、ID一意性、section hash、history非依存 |
| `E-BOUNDS` | bounded example | ID / item / manifest / journal / previewの境界とlimit+1停止 |
| `S-TOOLS` | opt-in smoke | 実OpenSpec / GSD probe、drift、中断resume、no-op finalize、未検証報告 |

### Spec-holes Phase 1 → Phase 2 一対一対応

各cellは対応するPhase 1表の同番号へ一つ以上の反証可能なevidenceを割り当てる。`N/A`はPhase 1で
明示的に非該当 / スコープ外とした項目で、test未作成の理由も同じcellに残す。
`H01`〜`H12`は順に、空・ゼロ長・None、境界値、重複・衝突、順序、型・形式不正、エラー経路、
冪等性・再実行、時刻・タイムゾーン、文字列、数値、巨大入力・リソース枯渇、状態遷移の未定義パスを表す。

| requirement | H01 | H02 | H03 | H04 | H05 | H06 | H07 | H08 | H09 | H10 | H11 | H12 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 stable identity / mapping | `E-MAPPING` | `P-ALLOC`,`E-BOUNDS` | `P-ALLOC`,`E-MAPPING` | `P-ALLOC` | `P-MANIFEST-RT`,`E-MAPPING` | `E-MIGRATION` | `P-ALLOC`,`P-MANIFEST-RT` | N/A: identityへ時刻不使用 | `P-ALLOC`,`E-MAPPING` | `E-BOUNDS` | `E-BOUNDS` | `P-ALLOC`,`E-MIGRATION` |
| R2 drift | `E-DRIFT` | `E-DRIFT` | `E-DRIFT` | `E-DRIFT` | `E-DRIFT` | `E-DRIFT` | `P-NORMALIZER`,`E-DRIFT` | N/A: mtime判定なし | `P-NORMALIZER`,`E-DRIFT` | N/A: fuzzy判定なし | `E-BOUNDS`,`E-DRIFT` | `E-DRIFT` |
| R3 ownership | `P-OWNERSHIP` | `P-OWNERSHIP`,`I-OWNERSHIP` | `P-OWNERSHIP`,`I-OWNERSHIP` | `P-OWNERSHIP` | `I-OWNERSHIP` | `I-OWNERSHIP` | `P-OWNERSHIP` | N/A: 時刻優先なし | `I-OWNERSHIP` | N/A: score推定なし | `E-BOUNDS`,`I-OWNERSHIP` | `I-OWNERSHIP`,`I-FINALIZE` |
| R4 recovery | `I-RECOVERY` | `I-RECOVERY` | `I-RECOVERY` | `I-RECOVERY` | `I-RECOVERY` | `I-RECOVERY` | `I-RECOVERY` | N/A: timeout自動rollbackなし | `I-RECOVERY` | N/A: retry回数policyなし | `E-BOUNDS`,`I-RECOVERY` | `I-RECOVERY`,`E-DRIFT` |
| R5 finalize | `P-PREVIEW`,`I-FINALIZE` | `I-FINALIZE` | `P-PREVIEW`,`I-FINALIZE` | `P-PREVIEW`,`I-FINALIZE` | `I-FINALIZE` | `I-FINALIZE` | `P-PREVIEW`,`I-FINALIZE` | N/A: TTL失効なし | `I-FINALIZE`,`I-OWNERSHIP` | N/A: 件数自動承認なし | `E-BOUNDS`,`P-PREVIEW` | `I-FINALIZE`,`E-DRIFT` |
| R6 verification | `E-MAPPING` | `E-BOUNDS` | `E-MAPPING`,`I-OWNERSHIP` | `P-ALLOC`,`P-OWNERSHIP`,`P-PREVIEW` | `P-MANIFEST-RT`,`I-RECOVERY` | `E-MIGRATION`,`I-RECOVERY`,`I-FINALIZE` | `P-ALLOC`,`P-NORMALIZER`,`P-MANIFEST-RT`,`P-OWNERSHIP`,`P-PREVIEW` | `S-TOOLS`（通常CIはclock固定） | `E-MAPPING`,`I-OWNERSHIP` | `E-BOUNDS` | `E-BOUNDS`,`I-RECOVERY` | `S-TOOLS`（明示opt-inのみ） |

実装完了時はevidence IDを実在するtest node ID / fixture pathへ置換または併記する。opt-in smokeを実行できない
場合は`S-TOOLS`を検証済みにせず、環境または安全なdry-run seam不在を理由付き未検証として残す。
