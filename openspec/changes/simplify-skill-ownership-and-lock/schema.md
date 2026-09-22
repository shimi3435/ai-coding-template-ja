# source / lock schema v2

文書種別: データ仕様リファレンス。以下は実装予定のinterfaceであり、現行v1 fileをこの文書作成で変更しない。
R1、R2、R5、R7の詳細を定義する。

## 文書と共通規則

両文書のrootは `{schemaVersion: 2, skills: [...]}` とする。
sourceはremote / local / pluginを持ち、lockはremoteだけを持つ。
remoteが0件ならlockのskillsは空配列でよい。sourceも空配列を許すが、
配置済みの未宣言Skillを成功扱いしない。欠損file、null、未知version、未知field、重複nameは拒否する。
JSON object内の重複keyも拒否し、後勝ちで承認情報を解釈しない。

nameは空でないNFCの単一路径要素で、ASCII case-foldによる衝突を拒否する。
repositoryは公開GitHubの `owner/name` とし、小文字へ正規化する。
targetは `.agents/skills/<name>` の完全一致を要求する。任意配置先は追加しない。
pathは相対POSIX形式とし、絶対path、NUL、backslash、空segment、`.`、`..`、非NFCを拒否する。
SHA-256は小文字64桁、Git SHAは小文字40桁とする。SHA-256 Git repositoryへの対応は対象外である。
文字列は空・空白だけを拒否し、path / refを暗黙にtrimしない。
件数・bytesは非負safe integerであり、NaN / Infinity / 小数を拒否する。

metadataは各file 1 byte以上10 MiB以下、sourceは最大500件とする。
source順序を意味に使わず、nameのUTF-8 byte順で直列化する。
object field順は本書の列挙順、2-space indent、末尾LFとし、日時や乱数IDを追加しない。
legal配列はtargetPath（localはpath）、次にsourcePathのUTF-8 byte順とする。
originの履歴は時刻ではなくcommitで識別する。

## source

共通必須fieldは `name, ownership, license, redistribution`。
remote / localのredistributionは `allowed` 必須。pluginは `allowed | blocked`。
licenseは空でない識別文字列であり、文字列だけで再配布可否を推論しない。

### remote

共通fieldに `target, repository, ref, subtree, legalMappings` を必須とし、
移行履歴の `legacyRef` だけを任意fieldとして許す。

- ref: `{branch: string}` / `{commit: SHA}` / `{tag: string}` の厳密な一択。
  branch / tagはGit refとして有効な短い名前を指定する。完全refや略SHAとの曖昧な解決を行わない。
- subtree: `{root: true}` / `{path: canonicalPath}` の一択。
- legalMappings: 1件以上の `{sourcePath, targetPath, expectedSha256}`。
  取得元pathと配置先Skill相対pathを分け、targetPath重複を拒否する。
- legacyRef: `{semver, selectedTag, selectedVersion}`。v1の文字列を履歴として保持するだけで、
  範囲解決・tag監視へ使用しない。新規sourceでのSemVer指定には使えない。

### local

共通fieldに `target, legalMappings` を必須、`origin` を任意とする。
legalMappingsは1件以上の `{path, expectedSha256}` で、pathはrepository相対のtracked regular fileを指す。
同じpathの重複を拒否する。自作Skillはroot LICENSEを複数Skillから参照できる。
外部由来localはvendored LICENSE / NOTICEの配置先を参照し、既存のroot LICENSEで代用しない。

外部由来のoriginは `{repository, subtree, ref, resolvedCommit, legalMappings}` を必須とする。
tag refでは `tagObjectSha` も必須、移行由来では `legacyRef` を任意とする。
origin.legalMappingsは元の `{sourcePath, targetPath, expectedSha256}` を保持する。
localのlegalMappingsはそのtargetPathを `.agents/skills/<name>/` からのrepository相対pathへ変換したものとする。
originは元配布物の出典であり、local本文hash・現本文のverified状態・自動更新条件は持たせない。
本changeの変換は外部由来originを削除しない。人がmetadataごと書き換える場合の出典保持はレビューの責務である。

### plugin

共通fieldに `manager`（空でない文字列）だけを加える。
target、ref、treeHashは持たせず、取得・配置・link生成・manager起動をしない。

## remote lock

必須fieldは `name, ownership, license, redistribution, target, repository, ref, subtree,
resolvedCommit, verification, treeHash, fileCount, byteCount, legalFiles`。
ownershipはremote固定、redistributionはallowed固定とする。
tag refだけ `tagObjectSha` を必須とする。移行時の `legacyRef` はsourceと同じ値を保持できる。
local / plugin entry、orphan entry、remote sourceに対応しないentryは拒否する。

- ref / subtree / policy / identityは対応sourceと一致する。
- commit refのSHAはresolvedCommitと一致する。
- verificationは従来の `verified | unverified | unknown`。未署名だけを理由に取得を拒否しない。
- treeHash、fileCount、byteCountはlegalを含む最終配置treeを表す。
- legalFilesは `{sourcePath, targetPath, sha256}`。sourceの承認値、実体と一致する。
- subtreeは旧sourceから引き継いで明記し、取得元pathの変更が通常更新に紛れないようにする。
- 時刻、candidate journal、transaction manifest、local本文hashは記録しない。

## 完成状態と操作前の中間状態

source / lock / 実体の完全一致は、offline verifyと配布可能な最終状態の条件である。
各文書の型・field・上限検査と、完成状態の対応検査を分離する。
書込み操作は次の中間状態だけを許可し、最後に全体のoffline verifyを必須とする。

| 操作 | 許容する差分 | 適用前の検査 | 適用後の検査 |
| --- | --- | --- | --- |
| updateの新規remote | sourceにだけremoteがあり、対応lockと配置先がともに存在しない | sourceの出典・legal承認、配置先不存在、取得前検査 | 新lockを生成しsource / lock / 実体一致 |
| updateのlegal再承認 | 同じlegal mappingのexpectedSha256だけが旧lockと異なる | 旧実体・legalを旧lockで検証し、新取得物を新sourceの承認hashで検証 | 新source / lock / 配置legal一致 |
| 名前指定repin | 指定名のrepository / ref / subtreeの変更、および上記legal再承認 | 指定名の旧本文を旧lockで検証し、新取得物は新sourceと明示承認SHAで検証 | 指定名を含む全体のsource / lock / 実体一致 |

この表の中間状態はoffline verifyでは失敗する。name / target / ownership / license / redistributionの不一致、
orphan、既存未管理path、対象外の出典不一致を同じ例外で受け入れない。
repinは指定名以外の欠落lockや出典変更を修復しない。複数の中間状態を無条件にまとめて承認しない。
adopt-localが許容する本文差分とmigrateのv1入力は、それぞれR5 / R7で限定した別の前提であり、
source / lock / legal不一致の一般的な許可ではない。

## canonical: skill-tree-v1

現行golden fixtureのbytesとhashを維持する。
入力はlegalを含む1 file以上の通常file列である。
pathのUTF-8 byte昇順に並べ、ASCII case-fold衝突・重複pathを拒否する。

SHA-256への入力は、ASCII文字列 `skill-tree-v1` にNUL byte（0x00）を連結したdomain、file数（u64 big-endian）、
各fileのpath長（u64）、UTF-8 path、実行bit（1 byte: 0 / 1）、本文長（u64）、本文bytesの連結とする。
本文の改行・Unicode・空白を正規化しない。modeは実行bitを検証し、所有者や全POSIX permissionの一致は保証しない。
配置modeは非実行file 0644、実行file 0755とする。
