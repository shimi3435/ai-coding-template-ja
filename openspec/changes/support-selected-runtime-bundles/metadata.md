# Remote bundle descriptor案

文書種別: データ仕様。既存の `docs/reference/skill-metadata-v2.md` を補う設計案であり、未実装である。

## Source

rootは既存の `{schemaVersion: 2, skills: [...]}`。remote entryにだけ `bundle` を任意追加する。
`bundle` がないentryの必須field、target、構造、legal、serializationは変更しない。
local／plugin entryの `bundle`、bundleなしentryのbundle用lock fieldは拒否する。

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
`executable` はboolean必須であり、trueのpathだけを0755、falseを0644へ配置する。

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
truncated／不正応答は拒否する。commitとtag objectの既存provenance検証を維持する。

選択fileと祖先directoryをmetadataから照合する。fileはblobかつ100644／100755、
祖先は通常treeでなければ拒否する。symlink、submodule、未知mode/type、欠落、非整数sizeは拒否する。
同じcohort内の各bundle上限と既存cohort上限を全対象分確認した後にだけ、選択blob本文を取得する。
別cohortの後続検査で失敗した場合も操作全体をfailedとし、先行取得分だけを適用しない。
選択外の正常entryは無視し、本文は取得・保存しない。応答全体のpath重複等の構造不正は拒否する。
Gitのfile modeによる暗黙実行許可は与えず、配置時の実行bitは宣言値に限定する。
取得した本文はmetadataのsizeとGit object SHAに照合し、legal hashを検証してから候補treeを作る。

## Offline検証とfilesystem

bundleにroot `SKILL.md` は要求せず、nested Skillを自動実行入口として登録しない。
live treeは宣言fileとその親directoryだけで構成する。余剰file／余剰directoryを拒否する。
target／内部directoryは0755、fileは宣言に従う0644／0755とし、特殊bit・別modeを拒否する。
regular fileでもlink countが1以外ならhardlinkとして拒否する。symlink／device等も拒否する。
読込前metadata検査、bounded read、読込前後のidentity／size確認を既存readerの方針で行う。
committed snapshotではGitの通常file modeとpath／本文／実行bitを確認し、live権限検査とは区別する。
`.agents/vendor` がない場合はbundle宣言0件なら許可し、宣言があれば欠落として拒否する。
管理root内の未宣言bundle、source／lockのorphan、path種別不正を成功扱いしない。
通常Skillとbundleの宣言集合はそれぞれのrootで照合し、別形式の宣言名で未宣言実体を正当化しない。

## 非対応操作と互換性

- bundleを選択したadopt-localはwrite前に拒否する。通常Skillのadopt-localは併存bundleを検証・保持する。
- v1→v2 migrateの既存変換は不変。完成済みv2のbundle混在入力は検証してno-opとする。
- 通常Skillとbundleの相互変換、name／target変更はupdate／repinの対象外とする。
- 旧v2 readerがbundleを読めないことを明記する。旧reader用の偽root Skillやfield除去を自動生成しない。

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
