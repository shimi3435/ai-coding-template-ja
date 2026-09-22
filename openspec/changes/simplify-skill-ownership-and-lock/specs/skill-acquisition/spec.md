## ADDED Requirements

### Requirement: R3 metadata事前検査と取得integrity
システムはSHALL、公開GitHub APIで選択subtreeとlegalのmetadataを検査し、cohort内のすべての選択blob本文取得より前に件数・bytes・特殊file・pathを検査する。

保証対象は公開GitHub repositoryとUbuntu / WSL Ubuntuである。
既存GitHub API adapterを縮小して維持し、private repository、別forge、Git取得への置換を保証しない。
1 Skillは200 files / 20 MiB、単一fileは10 MiB、cohortのunique取得元fileは500 files / 50 MiBを上限とする。
1 MiBは1,048,576 bytesであり、上限値を受理し、超過・負数・非safe integer・size欠落を拒否する。
最終配置のlegal重複排除と取得元のcohort重複排除を区別し、path衝突を隠さない。
tree応答truncated、未知type / mode、選択subtree欠落、不正path、衝突を本文取得前に拒否する。
blob取得後はmetadata SHA、Git blob SHA、size、legal hashを照合し、配置後にcanonicalを再検証する。
従来のfilesystem検査上限（500 entries、depth 32、path 4096 bytes、segment 255 bytes）も維持する。

API失敗・rate limit・timeout・parse不正は停止し、不完全な結果をcache成功へ読み替えない。
ghの各呼出は60秒、stdout / stderr合計64 MiBを上限とし、これは通信全体の厳密な転送量保証ではない。
認証情報をredactし、Skill内のscriptを実行しない。自動retry / resumeの管理層は追加しない。

#### Scenario: 取得前上限または特殊fileで停止する
- **WHEN** tree metadataだけで上限超過、size欠落、symlink、submodule、truncated、path不正が判明する
- **THEN** 当該cohortの選択blob本文API呼出数が0のまま失敗する。他cohortの取得済み結果も全体成功とは扱わない

#### Scenario: integrityまたはlegalで停止する
- **WHEN** blobのsize / SHAがtreeと異なる、またはLICENSE / NOTICEが承認値と異なる
- **THEN** 候補を成功扱いせず停止する。legal変更は人がsource承認hashを更新して再実行する

#### Scenario: 境界値と共有legal
- **WHEN** 上限ちょうどの有効なtreeに同じ取得元legalを共有する複数Skillがある
- **THEN** cohortでは取得元pathを一度数え、各Skillでは配置先を数えたうえで検査する

### Requirement: R4 ref追跡と明示repin
システムはSHALL、branch / commit / 明示tagを受理し、branchの履歴連続性、tagの直接object SHAと解決済みcommitの固定を検証する。

SemVer範囲探索は行わない。branchは旧lockからfast-forwardだけを通常更新で許可する。
tag移動・削除・同一commitへのtag再作成は停止する。commit指定は完全SHAで固定する。
明示repinは承認commit、tagでは承認object SHAも必須とし、観測値が不一致なら停止する。
tagを辿る際は32段以内にcommitへ到達する必要があり、循環・不明type・過大連鎖は拒否する。
通常更新でrepository / ref / subtree変更を暗黙承認しない。repinでもR3・R6・legal検査は省略しない。
本文が同一でも検証済みcommitが進めばlockを更新する。

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
