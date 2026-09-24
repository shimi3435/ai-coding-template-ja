## ADDED Requirements

### Requirement: R1 sourceとremote専用lock
システムはSHALL、[schema.md](../../schema.md)のschemaVersion 2だけを通常操作で受理し、sourceにremote / local / pluginを、lockにremoteだけを記録する。

完成配布状態とoffline verifyではremote sourceとlockは一対一で、identity、ref、subtree、policy、legalが対応する。
隔離更新操作の入口だけはschema.mdの限定された中間状態（新規remote、legal再承認、名前指定repin）を検査できる。
型・field・上限検査を省略せず、隔離更新の適用後は必ず全体の完成状態を検証する。
linksはR8のlink修復・検証契約に従う。
local / plugin lock、orphan、未知field、重複key / name、path衝突、欠損、型不正を拒否する。
source / lock各10 MiB、source 500件を上限とし、上限値は受理、超過は拒否する。
配列順序を意味に使わず決定的に直列化する。local本文のhash生成・専用更新は行わない。
pluginは宣言だけを維持し、外部managerを実行しない。

#### Scenario: localとpluginだけを宣言する
- **WHEN** 有効なlocal / plugin sourceと空のremote lockを検証する
- **THEN** remoteが0件であることだけでは失敗せず、localのSkill構造・identity・legalとlinkを検証する

#### Scenario: 重複または不明な入力を受け取る
- **WHEN** metadataのkey / nameが重複する、未知fieldがある、または片方のfileが欠落する
- **THEN** 推測・後勝ち・自動生成によって補完せず、書込み前に失敗する

#### Scenario: 決定的なmetadata
- **WHEN** 同じ宣言を異なる配列順で入力する
- **THEN** nameとlegal pathのUTF-8順で同じbytesを出力し、時刻や乱数へ依存しない

#### Scenario: 承認済み中間状態と完成状態を区別する
- **WHEN** 新規remoteのlock欠如、legal承認hashだけの変更、または名前指定repin対象の出典・license・legalMappings変更を入力する
- **THEN** offline verifyは失敗するが、該当操作は旧実体と新承認値を別々に検証して適用できる。対象外の不一致は拒否し、適用後は全体一致を要求する

### Requirement: R2 canonicalとoffline配布物検証
システムはSHALL、外部Skillを下流Gitに同梱し、通常CIでnetworkなしにpath・実行bit・本文・lock・legal・linkを検証する。

canonicalは[schema.md](../../schema.md)のskill-tree-v1を維持し、既存golden値を変更しない。
remote本文はlegalを含めてtreeHash / fileCount / byteCountと一致しなければ失敗する。
許されるGit file modeは100644 / 100755であり、symlink / submodule / 特殊fileを拒否する。
remote / local共通で、Skill rootの通常file `SKILL.md` がexactly one存在することを要求する。
これはroot相対pathの検査であり、nested SKILL.mdの存在自体は拒否理由にしない。
SKILL.mdはvalid UTF-8で、先頭frontmatterの区切りとYAML mappingを持たなければならない。
現行parseSkillMetadata()の受理形式を維持し、BOM・LF / CRLF・追加metadata keyを許可する。
不正YAML・重複key・aliasを拒否し、nameはsourceのnameと完全一致、descriptionは空白だけでない文字列を必須とする。
localは本文hash一致を要求しないが、存在・安全なpath・上記構造とidentity・必要legal・linkを検証する。
この共通検証はremote取得後、local化、v1移行にも適用し、編集済み本文の保持を理由に省略しない。
LICENSE / NOTICEはsource承認hashと照合する。本文とlockの同時変更の承認はレビューが担う。

#### Scenario: 配布物をoffline検証する
- **WHEN** networkを遮断した環境で有効な配布物にskills:verifyと通常checkを実行する
- **THEN** GitHub、移行用旧履歴、削除予定change artifactsに依存せず成功する

#### Scenario: 改変を検出する
- **WHEN** remoteのpath、実行bit、本文、件数、legal、lock、またはlinkを単独で変更する
- **THEN** 対応する不一致を非ゼロ終了で報告する

#### Scenario: local本文を編集する
- **WHEN** local本文だけを編集し、Skill構造・identity・必要legal・linkは正しい
- **THEN** 本文hash lockの再生成を要求せず成功する

#### Scenario: localのSkill構造またはidentityが壊れる
- **WHEN** localのroot SKILL.mdが欠落する、不正UTF-8 / frontmatter / YAMLになる、nameが異なる、またはdescriptionが欠落・空白だけになる
- **THEN** skills:verifyと通常checkは失敗する。local内容lockの廃止によって構造検証を省略しない

### Requirement: R5 出典を保つlocal ownership
システムはSHALL、remoteからlocalへの明示操作で本文を保持し、取得元・固定commit・legal承認をsourceのoriginへ保存して通常更新対象から除外する。

本文が旧lockと異なる場合も名前指定によるlocal化では保持するが、R2のSkill構造・identity検証を必須とする。originを現本文の一致証明とは扱わない。
source / lockのidentity・出典・legal不整合は停止し、remote lockを削除する前に必要情報を確認する。
外部由来localのlegalをroot LICENSEへ置き換えず、元のLICENSE / NOTICEを保持する。
localからremoteへの自動復帰、local本文へのupstream自動mergeは提供しない。

#### Scenario: 編集済みremoteをlocal化する
- **WHEN** R2の構造・identityとlegal検証を通るcommit済み本文差分を持つremoteをadopt-localで名前指定する
- **THEN** 本文bytesと実行bitを保持し、出典を保存してremote lockだけを除く

#### Scenario: legal不一致を伴う切替
- **WHEN** LICENSE / NOTICEが旧承認hashと異なる、または出典の対応が確認できない
- **THEN** 明示指定があっても切替を拒否し、本文や承認値を推測で変更しない

#### Scenario: 再指定と逆方向の変更
- **WHEN** 同じoriginを持つlocalへ再度adopt-localを指定する
- **THEN** Skill構造・identity・legalと出典を検証して無変更成功し、ownership書換えだけによるremote本文上書きは許可しない
