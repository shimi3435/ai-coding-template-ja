# source / lock schema v2

文書種別: データ仕様リファレンス。通常操作はschemaVersion 2だけを受理する。
v1は [公開操作](skill-maintenance.md) のskills:migrateで一度だけ変換する。

## 文書と共通規則

両文書のrootは `{schemaVersion: 2, skills: [...]}` とする。
sourceはremote / local / pluginを持ち、lockはremoteだけを持つ。
remoteが0件ならlockのskillsは空配列でよい。sourceも空配列を許すが、
配置済みの未宣言Skillを成功扱いしない。欠損file、null、未知version、未知field、重複nameは拒否する。
JSON object内の重複keyも拒否し、後勝ちで承認情報を解釈しない。

nameは空でないNFCの単一路径要素で、ASCII case-foldによる衝突を拒否する。
repositoryはgithub.com上の公開repositoryの `owner/name` とし、小文字へ正規化する。
取得hostはgithub.comに固定し、GH_HOST等の外部環境によって変更しない。
通常Skillのtargetは `.agents/skills/<name>`、remote bundleは `.agents/vendor/<name>` の完全一致を要求する。任意配置先は追加しない。
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
移行履歴の `legacyRef` と配布形式の `bundle` を任意fieldとして許す。ただしbundleとlegacyRefの併用は禁止する。

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
adopt-local / migrateの変換は外部由来originを削除しない。人がmetadataごと書き換える場合の出典保持はレビューの責務である。

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
隔離更新操作（update / repin / adopt-local / migrate）は操作別の前提を検査し、最後に全体のoffline verifyを必須とする。
update / repinで許可する中間状態は次のとおりである。linksはこの遷移を適用せず、[公開操作](skill-maintenance.md)のlink修復契約に従う。

| 操作 | 許容する差分 | 適用前の検査 | 適用後の検査 |
| --- | --- | --- | --- |
| updateの新規remote | sourceにだけremoteがあり、対応lockと配置先がともに存在しない | sourceの出典・legal承認、配置先不存在、取得前検査 | 新lockを生成しsource / lock / 実体一致 |
| updateのlegal再承認 | 同じlegal mappingのexpectedSha256だけが旧lockと異なる | 旧実体・legalを旧lockで検証し、新取得物を新sourceの承認hashで検証 | 新source / lock / 配置legal一致 |
| 名前指定repin | 指定名のrepository / ref / subtree / license / legalMappings全体の変更 | 指定名の旧本文・legalを旧lockで検証し、新取得物は新sourceのpolicy・legal承認と明示承認SHAで検証 | 指定名を含む全体のsource / lock / 実体一致 |

この表の中間状態はoffline verifyでは失敗する。name / target / ownership / redistributionの不一致、
orphan、既存未管理path、対象外の出典不一致を同じ例外で受け入れない。
license変更とlegalMappingsの追加・削除・sourcePath / targetPath変更は指名repinに限り許可する。
通常updateの再承認は同じmappingのexpectedSha256変更だけであり、licenseやmapping構造の変更は拒否する。
redistribution: allowedは変更前後とも必須とする。
repinは指定名以外の欠落lockや出典・policy・legal変更を修復しない。複数の中間状態を無条件にまとめて承認しない。
adopt-localが許容する本文差分とmigrateのv1入力は、[公開操作](skill-maintenance.md)で限定した別の前提であり、
source / lock / legal不一致の一般的な許可ではない。

## canonical: skill-tree-v1

現行golden fixtureのbytesとhashを維持する。
入力はlegalを含む1 file以上の通常file列である。
pathのUTF-8 byte昇順に並べ、ASCII case-fold衝突・重複pathを拒否する。

SHA-256への入力は、ASCII文字列 `skill-tree-v1` にNUL byte（0x00）を連結したdomain、file数（u64 big-endian）、
各fileのpath長（u64）、UTF-8 path、実行bit（1 byte: 0 / 1）、本文長（u64）、本文bytesの連結とする。
本文の改行・Unicode・空白を正規化しない。modeは実行bitを検証し、所有者や全POSIX permissionの一致は保証しない。
通常Skillの配置modeは非実行file 0644、実行file 0755とする。bundleには後述のumaskとPOSIX権限契約を適用する。

## 共通のSkill構造検証

通常Skillのremote / localとも、rootの通常file `SKILL.md` を必須とする。UTF-8で復号でき、YAML frontmatterが
mappingであり、nameが宣言名と一致し、descriptionが空白だけではない文字列でなければならない。
重複keyとaliasを拒否する。BOM、CRLF、追加metadata key、nested SKILL.mdの併存は受理するが、
nestedだけのSKILL.mdではroot要件を満たさない。取得、local化、移行でもこの検査を省略しない。
local本文の編集はこの構造とlegalを保持する限り内容lock更新を要求しない。

## Remote runtime bundle

`bundle` はremoteだけに許可する配布形式であり、別のownershipではない。local／plugin、originへの追加は禁止する。
旧schema v2 readerは未知fieldとして拒否する。通常Skillのserialize bytes、hash、公開操作は変更しない。
root SKILL.mdは要求せず、nested Skillも自動登録しない。bundle用host linkは作らない。

### source descriptor

- target: `.agents/vendor/<name>` の完全一致。
- subtree: `{root: true}` だけ。
- ref: `{tag: string}` だけ。branch／commit、bundle source／lockのlegacyRefは値にかかわらず拒否する。
- bundle: `{files, limits}` のexact object。null、未知field、JSON重複keyは拒否する。
- files: 1件以上の `{path, executable}`。pathは取得元repository rootとtarget内で同じ相対POSIX path、executableはboolean必須。
  全fileがallowlistかつrequiredであり、glob、optional、directory一括選択、renameはない。
- limits: `{files, singleFileBytes, totalBytes}`。それぞれ正のsafe integerで100／1,048,576／2,097,152以下。
  宣言値で引き下げられる。legalを件数・bytesに含め、空file（0 bytes）は許可する。
- legalMappings: 既存形式のsourcePathとtargetPathが同一で、filesに非実行fileとして含まれること。
  SPDX識別子だけでは再配布を承認しない。legal本文hashと人によるレビューが必要である。

pathは全fileと全祖先directoryの元表記・種別を照合する。ASCII case-fold後に別表記となるpath、
file重複、file／directory prefix衝突は拒否する。同一表記・同一種別の祖先だけ共有できる。
`Lib/a` と `Lib/b` は許可し、`Lib/a` と `lib/b`、`Lib` と `lib/a` は拒否する。
fileと非root祖先directoryの合計は500以下、directory depthは32以下、pathは4096 bytes以下、segmentは255 bytes以下。
宣言、取得前metadata、live、snapshotで同じbundle専用inventoryを使い、通常Skillのhelperの受理範囲は変更しない。

sourceのbundleは既存remote fieldの末尾に置く。内部順はfiles、limits。filesはpathのUTF-8 byte順で
field順はpath、executable。limitsはfiles、singleFileBytes、totalBytesの順とする。

### lock inventory

bundle lockにはsourceと同じbundle、および末尾に必須fileDigestsを記録する。
fileDigestsはpathのUTF-8 byte順の `{path, sha256, byteCount, executable}` 配列。
path／executable集合は宣言と完全一致し、sha256は本文の小文字64桁、byteCountは非負safe integerとする。
fileCountとbyteCountはinventoryの件数・合計と一致し、bundle limitsを満たす。
legalのdigestはlegalFilesとsourceの承認hashにも一致する。通常SkillにfileDigestsを付けてはならない。

既存skill-tree-v1をそのまま使い、実体・inventory・legalを全て照合する。
lockに全POSIX modeやumaskは記録せず、論理的なexecutableだけを含める。
通常verifyではsource／lockのbundle policy差分を拒否する。指名repinの旧treeは旧lock policy、新treeは新source policyで検査する。

### 取得とリソース上限

GitHub releaseのdraft=false、prerelease=false、tag_nameの完全一致を要求する。属性欠落・型不正・404は拒否する。
stableはGitHubの属性による定義であり、SemVer正式版を保証しない。`v1.0.0-rc.1` も属性条件を満たせば受理する。
previewとapplyは別々に観測し、各取得でも本文取得後にreleaseとref identityを再確認する。
削除、draft化、prerelease化、tag移動を検出した場合は適用しない。最後の観測後の変更を原子的に防ぐ保証はない。

完全なGit tree metadataから選択fileと全祖先を検査する。truncated、欠落、symlink、submodule、未知mode／type、
非整数sizeを拒否する。fileはblobの100644／100755、祖先は040000のtreeが必要である。
upstream 100644はexecutable=false、100755はtrueに完全一致させ、overrideを認めない。
同じcohort全対象の上限・mode・path検査後にだけ選択blobを取得し、sizeとGit object SHA、legal hashを照合する。
選択外の正常entryの本文は取得・保存・実行・importしない。応答全体のpath重複等の構造不正は拒否する。

bundle上限に加え、同じrepository／refのcohortには通常Skillとの選択path和集合に500 files／50 MiBを適用する。
同一cohortの同一pathは重複計上しない。metadata各fileの10 MiB、source 500件、GhRunnerの起動1回あたりstdout／stderr合計64 MiBは維持する。
操作全体のcohort横断累積予算は追加しない。多数cohortの取得量・メモリ増大は残存リスクであり、
500 bundlesが各2 MiBなら本文だけで1,000 MiBになり得る。応答上限はparse後のメモリ上限ではない。
後続cohortの事前拒否時、先行本文は取得済みの場合があるが、失敗cohortのblob requestは0件、操作全体はfailed／exit 1／changes=[]、applyなしとなる。

### Live filesystemと生成権限

live treeは宣言fileと必要な祖先directoryだけを許可する。欠落、余剰file／directory、hardlink（nlinkが1以外）、
symlink／特殊fileを拒否する。vendor root自身と直下の種別も検査し、未宣言directory、直下のfile／link、
別rootにある同名の未宣言Skillでbundleを正当化しない。snapshotも全vendor pathを検査する。
全bundle撤去時はvendor root不在を許可する。verifyはネットワークもchmodも行わない。

bundleを含むapplyでは、既存vendor rootの種別・権限と直下の宣言名・種別を、本文・source・lock・host linkの
最初の書込み前に検査する。旧lockにbundleがない新規追加でも、未宣言の空directoryを拒否する。
新規root／targetの未作成は許可する。既存bundleと再利用directoryは旧lock policyで検査し、暗黙chmodしない。
`.agents`親と通常Skillの権限規則は拡張しない。

通常file／directoryの種別確認後、mode & 07777へ次の条件を適用する。

- 全対象: group／other write（0022）、setuid／setgid／sticky（07000）を禁止する。
- 非実行file: owner read（0400）が必須、全execute（0111）を禁止する。
- 実行file／directory: owner readとexecute（0500）が必須。
- owner write、group／other read、実行file／directoryのgroup／other executeは任意である。

0600／0644／0444の非実行file、0700／0755／0555の実行fileとdirectoryは受理する。
非実行fileの0700、実行fileの0600／0641、0664／0775、特殊bitは拒否する。
liveの論理実行属性はowner execute、snapshotはGit modeから得る。同一内容ならumask 022／077のcloneでhashは一致する。

bundleの新規・置換file、新規directory（削除後の再生成を含む）の予定modeは、非実行file0644、
実行file／directory0755を基準に `基準 & (~umask & 0777)` で決める。umask自体は変えない。
owner read／必要executeを欠く予定はcandidateの最初のwrite前に拒否する。
022では0644／0755、077では0600／0700となる。再利用する既存directoryはchmodしない。
通常Skill、source／lock、host linkの既存書込規則は維持する。
owner writeが落ちた新directoryは読取・実行条件を満たしても内部書込に失敗し得る。
その場合も候補を保持して停止し、新candidateで再試行する。暗黙chmodやrollbackで成功へ読み替えない。
