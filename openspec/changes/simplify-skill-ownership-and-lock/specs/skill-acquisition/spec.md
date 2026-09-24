## ADDED Requirements

### Requirement: R3 metadata事前検査と取得integrity
システムはSHALL、公開GitHub APIで選択subtreeとlegalのmetadataを検査し、cohort内のすべての選択blob本文取得より前に件数・bytes・特殊file・pathを検査する。

取得先はgithub.com上の公開repositoryに限定し、全 `gh api` 呼出で `--hostname github.com` を明示する。
GH_HOST等の外部環境によって取得hostを変更してはならない。
保証対象はgithub.com上の公開repositoryとUbuntu / WSL Ubuntuである。WSLでは元repository・候補clone・Git metadataを
Linux filesystemに置く。Windows / DrvFS上の動作は保証対象外とする。
既存GitHub API adapterを縮小して維持し、private repository、別forge、Git取得への置換を保証しない。
1 Skillは200 files / 20 MiB、単一fileは10 MiB、cohortのunique取得元fileは500 files / 50 MiBを上限とする。
1 MiBは1,048,576 bytesであり、上限値を受理し、超過・負数・非safe integer・size欠落を拒否する。
最終配置のlegal重複排除と取得元のcohort重複排除を区別し、path衝突を隠さない。
tree応答truncated、未知type / mode、選択subtree欠落、不正path、衝突を本文取得前に拒否する。
blob取得後はmetadata SHA、Git blob SHA、size、legal hashを照合し、R2のSkill構造・identityを検証する。
配置後にcanonicalを再検証する。不正なSKILL.mdを取得成功として配置しない。
従来のfilesystem検査上限（500 entries、depth 32、path 4096 bytes、segment 255 bytes）も維持する。

API失敗・rate limit・timeout・parse不正は停止し、不完全な結果をcache成功へ読み替えない。
ghの各呼出は60秒、stdout / stderr合計64 MiBを上限とし、これは通信全体の厳密な転送量保証ではない。
認証情報をredactし、Skill内のscriptを実行しない。自動retry / resumeの管理層は追加しない。

#### Scenario: 外部環境が別hostを指定する
- **WHEN** GH_HOST等の既定hostがgithub.com以外を指している
- **THEN** repository / ref / tag / commit / tree / blob / compareを含む全API呼出でgithub.comを明示指定し、同じowner/nameの別hostを出典として受理しない

#### Scenario: 取得前上限または特殊fileで停止する
- **WHEN** tree metadataだけで上限超過、size欠落、symlink、submodule、truncated、path不正が判明する
- **THEN** 当該cohortの選択blob本文API呼出数が0のまま失敗する。他cohortの取得済み結果も全体成功とは扱わない

#### Scenario: integrityまたはlegalで停止する
- **WHEN** blobのsize / SHAがtreeと異なる、またはLICENSE / NOTICEが承認値と異なる
- **THEN** 候補を成功扱いせず停止する。legal変更は人が確認し、同じmappingのhashだけなら通常update、license / mapping構造の変更ならR4の指名repinで再実行する

#### Scenario: 境界値と共有legal
- **WHEN** 上限ちょうどの有効なtreeに同じ取得元legalを共有する複数Skillがある
- **THEN** cohortでは取得元pathを一度数え、各Skillでは配置先を数えたうえで検査する

#### Scenario: 取得したSKILL.mdが不正
- **WHEN** 取得物のroot SKILL.mdが欠落する、または取得後のUTF-8 / frontmatter / YAML / name / description検証に失敗する
- **THEN** 全体を失敗とし、候補への適用を開始しない。本文内の不正検出はblob取得後の検証として扱う

### Requirement: R4 ref追跡と明示repin
システムはSHALL、branch / commit / 明示tagを受理し、branchの履歴連続性、tagの直接object SHAと解決済みcommitの固定を検証する。

SemVer範囲探索は行わない。branchは旧lockからfast-forwardだけを通常更新で許可する。
tag移動・削除・同一commitへのtag再作成は停止する。commit指定は完全SHAで固定する。
明示repinは承認commit、tagでは承認object SHAも必須とし、観測値が不一致なら停止する。
tagを辿る際は32段以内にcommitへ到達する必要があり、循環・不明type・過大連鎖は拒否する。
通常更新でrepository / ref / subtree / license / legalMappings構造の変更を暗黙承認しない。
名前指定repinは対象名だけのlicenseとlegalMappings全体の変更も許可する。
旧配置本文・legalを旧lockで、新取得物を新sourceのpolicy / legal承認と指定SHAで別々に検証する。
redistribution: allowed、R2・R3・R6、最終offline検証を維持し、lockの手編集で検査を迂回しない。
previewにpolicy / legal差分を示し、commitが同じでもこれらに差分があれば適用する。
本文が同一でも検証済みcommitが進めばlockを更新する。

#### Scenario: legal policyを名前指定で変更する
- **WHEN** 指定名のlicense変更、LICENSEのsourcePath / targetPath移動、またはNOTICE追加を新sourceにcommitし、承認SHAを指定してrepinする
- **THEN** 旧lockによる旧実体検証と新sourceによる新取得物検証の成功後に適用する。同じcommitでも差分を反映し、全体offline検証を要求する

#### Scenario: legal policyの承認範囲を越える
- **WHEN** 通常updateにlicense / mapping構造変更を渡す、repinに別名のpolicy変更を混ぜる、旧legalが旧lockに一致しない、または新legalが新sourceに一致しない
- **THEN** 書込み前に失敗する。包括forceやlockの手編集を回復手順として提供しない

#### Scenario: branchが進むが本文は同じ
- **WHEN** fast-forward先を取得・検証し、最終treeHashが変わらない
- **THEN** treeHash / fileCount / byteCountを保ち、lockのresolvedCommitを新しい値へ進める

#### Scenario: tagが同一commitへ作り直される
- **WHEN** 解決済みcommitは同じだがtag refの直接object SHAが変わる
- **THEN** 通常更新を拒否し、両SHAを指定するrepinを要求する

#### Scenario: 明示承認の後に上流が動く
- **WHEN** repin中にrefの観測値が指定commitまたはtag objectと異なる
- **THEN** 新しい値を勝手に承認せず失敗する

#### Scenario: 履歴変更またはtag削除
- **WHEN** branchが非fast-forwardになる、tagが削除される、またはAPIで履歴を確認できない
- **THEN** 通常更新を停止する。削除tagは別refまたはcommit固定への明示repinでのみ置換できる
