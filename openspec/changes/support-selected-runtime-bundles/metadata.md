# Remote bundle descriptor案

文書種別: データ仕様。既存の `docs/reference/skill-metadata-v2.md` を補う設計案であり、未実装である。

## Source

rootは既存の `{schemaVersion: 2, skills: [...]}`。remote entryにだけ `bundle` を任意追加する。
`bundle` がないentryの必須field、target、構造、legal、serializationは変更しない。
local／plugin entryの `bundle`、bundleなしentryのbundle用lock fieldは拒否する。
bundle source／lockの `legacyRef` は、値にかかわらず拒否する。v1にはbundleが存在しないため、
migration由来の例外を新規bundleへ持ち込まない。通常SkillのlegacyRef契約は変更しない。

bundle entryは既存remoteの共通fieldと次の制約を持つ。

- `target`: `.agents/vendor/<name>` の完全一致。通常Skillは引き続き `.agents/skills/<name>`。
- `subtree`: `{root: true}` だけを許可する。
- `ref`: `{tag: <valid-short-tag>}` だけを許可する。取得時にそのtagのstable releaseを確認する。
- `license`: 期待SPDX識別子。実fileとの適合はlegal mappingと人のreviewで承認し、文字列だけで再配布を許可しない。
- `legalMappings`: 既存形式を使用するが、各mappingの `sourcePath === targetPath` を必須とする。
  全pathを `bundle.files` に含め、legal fileの `executable` はfalseとする。
- `bundle`: 次のexact fieldsを持つobject。null、未知field、重複keyを拒否する。

`bundle.files` は1件以上の `{path, executable}` 配列。
pathは既存のcanonical relative POSIX path規則に従い、source repository rootおよびtarget内の同じpathを表す。
全pathがallowlistかつrequiredであり、任意fileやdirectoryを表す要素はない。
重複、ASCII case-fold衝突、file／directory prefix衝突を拒否する。
衝突検査は選択fileだけでなく、その全祖先directoryを含むpath inventoryに対して行う。
ASCII case-foldしたkeyに元のpath表記と種別を対応させ、異なる表記またはfile／directoryの種別衝突を拒否する。
同じ表記・同じ種別の祖先directoryだけは複数fileから共有できる。fileの重複宣言は共有として受理しない。
例えば `Lib/a.txt` と `Lib/b.txt` は許可し、`Lib/a.txt` と `lib/b.txt` は祖先表記衝突として拒否する。
`Lib/a.txt` と `lib/a.txt` のfile衝突、`Lib` と `lib/a.txt` のfile／directory衝突も拒否する。
宣言のdecode、取得前metadata、live tree、committed snapshotで同じbundle専用規則を使い、
通常Skillの既存helperの受理条件を厳格化しない。自動的な表記統合・改名は行わない。

`executable` はboolean必須であり、upstream／snapshotのGit実行属性とlive filesystemのPOSIX権限を区別する。
liveの受理条件とumaskを反映した生成規則は[権限契約](#bundleのposix権限契約)に定める。
これはupstream modeのoverrideではない。取得する固定commitのGit treeで、
100644はfalse、100755はtrueとの一致を必須とする。どちら向きの不一致も同じcohortの本文取得前に拒否する。
upstream modeを変更した版の採用には、対応する宣言変更と明示repinを必要とする。
mode overrideの承認field・暗黙の権限正規化は提供しない。通常Skillのmode／hash規則は変更しない。

`bundle.limits` は `{files, singleFileBytes, totalBytes}` のexact object。
全値は正のsafe integerで、それぞれ100、1,048,576、2,097,152以下とする。
宣言file数はfiles以下、取得時の全選択file合計はtotalBytes以下とする。
空fileのsize 0は許可する。legal fileも件数／bytesへ含める。
巨大整数、小数、NaN、Infinity、boolean、文字列の数値は拒否する。

nameの全ownership間一意性、NFC、path長・深さ・metadata bytesの既存上限は継承する。
選択fileと必要な非root祖先directoryの合計は既存filesystem entry上限500以下、directory depthは32以下とする。
これも本文取得前に確認する。選択外の巨大なsubtreeを走査対象の実体へ展開しない。
sourceはUTF-8 byte順のname、filesはpath順、legalMappingsは既存順でcanonical化する。
`bundle` は既存remote fieldsの末尾に置き、内部順はfiles、limitsとする。
files要素はpath、executable、limitsはfiles、singleFileBytes、totalBytesの順にする。

## リソース上限の適用単位

- bundle単位: 上記の100 files／単一1 MiB／合計2 MiBを上限とし、宣言値で引き下げられる。
- cohort単位: 同じrepository／refの通常Skillとbundleが選択するpathの和集合に、既存の500 files／50 MiBを適用する。
  同じcohortの同じpathは重複計上しない。bundle単位の上限は各bundleへ別々に適用する。
- metadata単位: source／lock各fileは既存の10 MiB以下、sourceは最大500 entriesとする。
  GitHub応答は既存GhRunnerの1回の起動につきstdout／stderr合計64 MiB上限を継承する。
  これらは操作全体のmetadata累積上限ではなく、parse後のメモリ上限でもない。
- 操作全体: cohort横断の累積file数・bytes・API metadata量の新しい予算は設けない。
  source件数などによる間接的な有限性はあるが、低い総取得量・メモリ使用量を保証しない。
  例えば500の独立bundleが各2 MiBなら、選択本文だけで計1,000 MiBになり得る。

cohortは既存の決定的順序で順次検査・取得する。後続cohortの失敗時、先行cohortの本文を取得済みの場合がある。
失敗したcohortの事前検査で拒否した場合、そのcohortのblob requestは0件とする。
操作全体はstatus=failed、exit code=1、changes=[]となり、candidateへのapplyを開始しない。
前半の取得コストを取り消したり、全cohort検査前のblob requestを0件にしたりする保証はない。
この既存制約の継承理由と残存リスクは[design](design.md#操作全体の予算を追加しない判断)に定める。

## Lock

通常remote lockは不変。bundle lockにはsourceの `bundle` と、必須の `fileDigests` を追加する。
`fileDigests` は `{path, sha256, byteCount, executable}` をpathのUTF-8 byte順で列挙する。
sha256は本文の小文字64桁、byteCountは非負safe integer、executableはbooleanとする。
pathとexecutableの集合はsourceのfilesと完全一致し、重複・欠落・余剰を拒否する。
fileCountはinventory件数、byteCountはinventory合計と一致し、limits内であることを検証する。
treeHashは既存 `skill-tree-v1` で計算し、実体・inventory・legalFilesの全てと照合する。
inventoryのlegal sha256とlegalFilesおよびsourceの承認hashも一致させる。

resolvedCommit、tagObjectSha、verification、legalFilesは既存remote lock規則を継承する。
source／lockのbundle policy差分は通常offline verifyでは拒否する。
repinが許す中間状態だけは旧lockで旧treeを検証し、適用後は新source／lock／treeを一致させる。
sourceをlockから復元する処理でもbundleを失わない。
sourceのbundle位置を継承し、lock固有末尾fieldとしてfileDigestsを追加する。
時刻、実行log、秘密情報、独自transaction stateは追加しない。

## 取得前検査

既存のGitHub API adapterでreleaseとrefを解決し、commitの完全tree metadataを読む。
releaseはdraft=false、prerelease=false、tag_nameがsource refと一致することを要求する。
本changeのstableはこのGitHub release属性による定義であり、SemVer正式版を意味しない。
`v1.0.0` と `v1.0.0-rc.1` のどちらも、上記条件と既存tag名検証を満たせば受理する。
属性の欠落・型不正は拒否する。SemVer parserやtag名からの安定性推測は追加しない。
truncated／不正応答は拒否する。commitとtag objectの既存provenance検証を維持する。
previewとapplyは別々にrelease／refを観測する。各取得処理でも本文取得後にrelease条件とref identityを再確認し、
失敗・削除・draft化・prerelease化・tag移動を検出した場合は候補へ適用しない。
過去のpreviewやこの文書のfeasibility記録を承認済みの永続tokenとして再利用しない。
最後の観測後のGitHub側変更を原子的に防ぐ保証はない。

選択fileと祖先directoryをmetadataから照合する。fileはblobかつ100644／100755、
祖先は通常treeでなければ拒否する。symlink、submodule、未知mode/type、欠落、非整数sizeは拒否する。
同じcohort内の各bundle上限と既存cohort上限を全対象分確認した後にだけ、選択blob本文を取得する。
別cohortの後続検査で失敗した場合も操作全体をfailedとし、先行取得分だけを適用しない。
選択外の正常entryは無視し、本文は取得・保存しない。応答全体のpath重複等の構造不正は拒否する。
upstream modeと宣言値の一致を確認し、配置時も論理的な実行属性を保持する。
取得した本文はmetadataのsizeとGit object SHAに照合し、legal hashを検証してから候補treeを作る。

## Offline検証とfilesystem

bundleにroot `SKILL.md` は要求せず、nested Skillを自動実行入口として登録しない。
live treeは宣言fileとその親directoryだけで構成する。余剰file／余剰directoryを拒否する。
存在するvendor root、target、内部directoryとfileには下記のbundle権限契約を適用する。
0644／0755との完全一致は要求せず、verifyはread-onlyとし、暗黙のchmodを行わない。
regular fileでもlink countが1以外ならhardlinkとして拒否する。symlink／device等も拒否する。
読込前metadata検査、bounded read、読込前後のidentity／size確認を既存readerの方針で行う。
committed snapshotではGitの通常file modeとpath／本文／実行bitを確認し、live権限検査とは区別する。
`.agents/vendor` がない場合はbundle宣言0件なら許可し、宣言があれば欠落として拒否する。
管理root内の未宣言bundle、source／lockのorphan、path種別不正を成功扱いしない。
`.agents/vendor` 自身のsymlinkや通常file、直下の通常file・symlink・特殊file、未宣言directory、
ASCII case-fold衝突とfile／directory prefix衝突も拒否する。
committed snapshotでも宣言外のvendor pathを列挙して拒否し、宣言済みtargetだけの読込で見落とさない。
通常Skillとbundleの宣言集合はそれぞれのrootで照合し、別形式の宣言名で未宣言実体を正当化しない。

## BundleのPOSIX権限契約

liveの権限判定は通常file／directoryの種別確認後、`mode & 07777` に対して行う。
全対象でgroup／other write（0022）とsetuid／setgid／sticky（07000）を拒否する。

- 非実行file: 所有者read（0400）が必須。owner／group／otherの全execute（0111）を禁止する。
- 実行file: 所有者readとexecute（0500）が必須。
- directory: 所有者readとexecute（0500）が必須。
- 所有者write、group／otherのread、および実行file／directoryのgroup／other executeは任意とする。

例えば非実行fileの0600／0644／0444、実行fileとdirectoryの0700／0755／0555は受理する。
非実行fileの0700、実行fileの0600／0641、group writeを持つ0664／0775、特殊bitを持つmodeは拒否する。
read-only配置のverify成功はapplyの書込み可能性を保証しない。I/O失敗は既存の失敗契約で扱い、
verifyやapplyが既存directoryの権限を広げて回復しない。

lock／canonical treeが記録するのは論理的なexecutableだけであり、umaskや全POSIX modeは記録しない。
bundleのlive fileは上記の条件を満たした上でowner executeからその属性を得る。
snapshotは従来どおりGit modeの100644／100755から属性を得る。同じ本文・path・宣言なら、
umask 022と077のcloneで同じinventory／treeHashになる。通常Skillのmode／hash契約は変更しない。

### Applyで生成する権限

bundleを書き込む操作では、書込開始前に現在のumaskを読み、予定する全新規・置換fileと新規directoryのmodeを決める。
非実行fileの基準を0644、実行fileとdirectoryの基準を0755とし、生成modeは `基準 & (~umask & 0777)` とする。
umask自体は変更せず、通常Skill、source／lock、host link領域の既存書込規則を変更しない。
bundleの置換時に削除・再生成するdirectoryも新規生成に含む。再利用する既存directoryはchmodしない。

予定modeが上記の所有者read／executeを欠くなら、candidateへの最初のwriteより前に操作全体を拒否する。
生成後のfile／directoryは予定modeを満たすように設定・確認し、fileを後から一律0644／0755へ戻さない。
umask 022では0644／0755、077では0600／0700となる。生成・確認途中のI/O失敗は候補を保持して停止し、
自動rollbackや既存directoryのchmodで成功扱いにしない。

## 非対応操作と互換性

- bundleを選択したadopt-localはwrite前に拒否する。通常Skillのadopt-localは併存bundleを検証・保持する。
- v1→v2 migrateの既存変換は不変。完成済みv2のbundle混在入力は検証してno-opとする。
- 通常Skillとbundleの相互変換、name／target変更はupdate／repinの対象外とする。
- 旧v2 readerがbundleを読めないことを明記する。旧reader用の偽root Skillやfield除去を自動生成しない。
- bundleの廃止は[明示的な撤去手順](design.md#repository-bundleの撤去)に従うGit変更として扱い、update／repinへ削除操作を追加しない。
  撤去完了時のoffline verifyはsource entry・lock entry・vendor実体が全てない状態だけを受理する。
  3要素の一部だけが残る6通りは拒否する。追加操作でsource-onlyから候補を作る既存経路とは区別する。

## Previewのfile差分

bundleの変更entryには `bundleFileChanges` を追加する。要素は `{path, before, after}` で、
before／afterはそれぞれ `null` または `{sha256, byteCount, executable}` とする。
旧／新lock inventoryのpath和集合を照合し、片方がない場合はnull、両方同じ場合は要素を出力しない。
全要素をpathのUTF-8 byte順にし、両方nullは許可しない。内容・mode・sizeのどれかが変われば列挙する。
policy変更だけでfileに差分がなければ空配列とし、新規bundleではbeforeが全てnullになる。
人間向けpreviewも同じ差分から追加／変更／削除、path、modeを表示し、本文は表示しない。
通常Skillのchangesにはこのfieldを追加しない。上限は旧／新の最大100 filesの和集合200 entriesとなる。

## 外部interfaceの確認元

2026-11-12にContext7でGitHub REST APIをresolveし、次の公式文書を確認した。
releaseはGit tagとは別のresourceであり、tag名によるrelease取得の404を成功扱いしない。
Git treeのtruncated応答は本changeでは拒否し、暗黙の追加探索機構を導入しない。

- [Get a release by tag name](https://docs.github.com/en/rest/releases/releases#get-a-release-by-tag-name)
- [Get a tree](https://docs.github.com/en/rest/git/trees#get-a-tree)
