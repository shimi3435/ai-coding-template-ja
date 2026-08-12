## Context

skill には remote-owned、first-party local、plugin manager-owned の異なる ownership がある。現行 lock は取得元と installed bytes の一部を記録するが、source declaration、resolved state、完全な subtree、cohort、transaction を表現しない。すべてを同じ updater で変更すると ownership と provenance が壊れるため、remote update、local integrity、plugin ownership を分離する。

旧 branch の OpenSpec と planning artifacts は現行 workflow より前の実行経路、source commit pin、GSD handoff を含む。これらは移行せず、現行 `main` の OpenSpec 直接実行契約へ仕様と実装依存順だけを再構成する。

## Goals / Non-Goals

**Goals:**

- source declaration、resolved commit、installed bytes、legal approval を機械的に対応付ける。
- 同一 repository / ref の skills を一つの cohort として観測し、回復可能な transaction で更新する。
- preview、apply、verify が同じ canonical model と immutable plan を使う。
- offline の通常 check と opt-in remote check を分離する。
- 現行 lock entry と H1〜H11 の移行を機械的に証明してから旧実装を削除する。

**Non-Goals:**

- private GitHub、GitLab、archive、local path を remote adapter にすること。
- history rewrite を v1 で上書きすること。
- plugin skill、upstream code、package hook を updater が実行または更新すること。
- local patch、自動導入、外部 Issue / PR 作成を行うこと。
- process crash を含む複数 filesystem path の不可分な OS-level atomic write を保証すること。

## Decisions

### 1. metadata path と ownership variant を固定する

source declaration は `.agents/skills/skills.sources.json`、generated lock は既存 path `.agents/skills/skills.lock.json` に置く。両方の top-level `schemaVersion` は整数 `1`、entry 配列名は `skills` とする。unknown top-level / entry field、unknown schema version、variant と矛盾する field は拒否する。

全 entry は `name`、`ownership`、`license`、`redistribution` を持つ。`license` は trim 後に非空の string とし、既存値を exact に保持する。SPDX expression は強制しない。`redistribution` は `allowed` または `blocked` とする。

- `remote`: `target`、`repository`、`ref`、`subtree`、1件以上の `legalMappings` を持つ。各mappingは`sourcePath`、`targetPath`、`expectedSha256`を持つ。
- `local`: `target` と1件以上の `legalMappings` を持ち、installed tree の canonical hash 対象になる。各mappingはrepository-relative `sourcePath`と`expectedSha256`を持つが`targetPath`は持たない。
- `plugin`: `manager` を持つが `target`、hash、legal mapping は持たず、remote fetch、local hash 更新、installed tree write の対象外になる。

remote / local の `target` は `.agents/skills/<name>` に正規化できる repository-relative canonical path だけを許す。`redistribution: blocked` は plugin entry だけに許可し、remote / local entryではinstall済みか否かにかかわらずschema / policy errorとしてvendoring、verify、update、lock-localの対象にしない。

`ref` は tagged union とし、`branch`、`commit`、`semver` のいずれか一つだけを持つ。branch は空でない explicit name、commit は lowercase 40-hex、semver は explicit npm SemVer range とする。default branch の暗黙補完は行わない。

`repository` は `owner/name` の2 segmentsだけを許し、GitHub repository identity としてASCII lowercaseへ正規化する。URL、`.git` suffix、query、fragmentはsource schemaでは受理しない。branch / tag文字列はcase-sensitiveなraw refとして保持し、canonical ref keyはvariant名とraw valueから構成する。

remote legal mappingの`sourcePath`はupstream repository-relative canonical path、`targetPath`はinstalled target-relative canonical pathとする。local legal mappingの`sourcePath`はcurrent repository-relative canonical pathであり、tracked regular fileだけを許す。local legal fileはreference-onlyとしてtargetへ複製せず、複数local entryが同じsource pathを共有できる。skill name、normalized target、lock key、remote legal targetの重複・衝突は全apply前のschema errorとし、last-winsを認めない。

sources / lock は各10 MiB以下、`skills` は500 entries以下に限定する。上限は受理し、超過は parse 前後の対応 boundary で拒否する。JSON number は safe integer だけを許し、count / byte fields に負数、fraction、NaN 相当の非JSON表現を許さない。

generated lock は source entry の `name`、`ownership`、`license`、`redistribution` を exact copyする。remote / local lock はさらに `target`、`treeHash`、`fileCount`、`byteCount`、canonical order の `legalFiles` を持つ。remote `legalFiles` entryは`sourcePath`、`targetPath`、`sha256`、local `legalFiles` entryは`sourcePath`、`sha256`を持つ。hash は lowercase 64-hex、count / bytes は非負safe integerとする。remote lock は `repository`、source `ref`、`resolvedCommit`、`verification`、SemVer sourceの場合は`selectedTag`と`selectedVersion`を持つ。`verification` は `verified`、`unverified`、`unknown` のenum。plugin lockは共通fieldsと`manager`だけを保持し、target、hash、resolved commitを捏造しない。sourcesとlockの`license` / `redistribution`不一致はintegrity errorとする。

### 2. canonical JSON と tree hash を固定する

canonical JSON は validated model から schema 定義順に新しい object を構築し、entryとlegal mappingをUTF-8 byte orderで整列した後、`JSON.stringify(value, null, 2) + "\n"` でUTF-8 serializeする。generic key sorter、locale-dependent order、入力objectのproperty orderに依存しない。同じ意味の入力は同じbytesを生成する。

tree hash v1 は次の byte frame の SHA-256 とする。

1. ASCII domain separator `skill-tree-v1\0`。
2. regular file 件数を unsigned 64-bit big-endian で格納。
3. canonical relative path の UTF-8 byte order で並べた各 file について、path byte length を unsigned 64-bit big-endian、path bytes、executable flag を1 byte（`0x00` または `0x01`）、content byte length を unsigned 64-bit big-endian、content bytesの順に連結。

directory は frame に含めない。空 directory は Git が保持しないため対象外とする。remote candidate installed treeはsubtreeの全regular filesをsubtree-relative pathへ配置し、mapped legal filesを`targetPath`へ配置した最終file集合とする。remote `treeHash`はlegal filesを含む最終file集合を対象にし、`legalFiles`でも各legal SHA-256を独立保持する。legal `targetPath`がsubtree fileと重なる場合、bytesが同一なら既存modeを保持して1 fileとして数え、bytesが異なればcollision errorにする。local `treeHash`はtarget配下だけを対象とし、repository-level legal fileは含めず`legalFiles`で独立検証する。content-change判定はtree hashとlegal hashesの両方を比較する。

### 3. canonical path と resource limit を fail-closed にする

path は UTF-8 NFC の repository-relative POSIX path に限定する。absolute、空 segment、`.`、`..`、backslash、NUL、non-NFC、exact NFC duplicate、ASCII lettersだけをlowercase化したcollisionを補正せず拒否する。非ASCII文字のcase variantは別のNFC byte sequenceとして扱う。regular fileとdirectory以外のsymlink、submodule、device、FIFO、socketは拒否する。

limit は一 skill 200 files / 20 MiB、単一 file 10 MiB、cohort 500 unique files / 50 MiB、SemVer tag candidates 500件とする。1 MiB は1,048,576 bytes。remote mapped legal blobは単一fileとcohort合計に含め、同じcommit / canonical source pathはcohort内で1回だけ数える。final installed treeでは同じtarget pathの同一bytesを1 fileとして数える。local legal fileにも単一file limitを適用し、共有repository-relative sourceは一度だけ読み取り・hashする。境界値は受理し、超過、pagination不完了、切り捨てはcohort / local plan errorにする。

### 4. SemVer と YAML parser を exact pin する

npm SemVer grammar と YAML frontmatter grammar は独自実装しない。runtime dependency は `semver@7.8.5` と `yaml@2.9.0`、TypeScript declaration は dev dependency `@types/semver@7.8.0` に固定する。別 parser、簡略 grammar、fallback は設けない。version 変更や追加 parser dependency は material expansion として停止・再計画する。

SemVer tag候補はcomplete paginationで取得したtagのうち`semver@7.8.5`がvalid versionとして解釈できるものとし、range filtering前で500件以下を要求する。invalid tagは無視する。valid range に対する highest satisfying version を選び、該当tagが0件ならsource error、exit 1にする。range が prerelease を明示しない限り prerelease を除外する。同一 canonical version の複数 tag が異なる commit を指す場合は拒否し、同じ commit なら UTF-8 byte order の先頭 tag を表示用に選ぶ。既存 lock がある場合、locked `selectedTag` が引き続き存在し、locked `resolvedCommit` を指すことを新候補選択前に要求する。tag の削除・移動はhistory rewriteとしてexit 1で拒否する。source range変更後のcandidate versionがlocked `selectedVersion`より低い場合もdowngradeとしてexit 1で拒否する。

YAML frontmatter は UTF-8、単一 document、mapping root、duplicate key 不可として parse する。root の `SKILL.md` は exactly one、`name` は declaration と一致、`description` は string かつ trim 後に非空を要求する。unknown frontmatter field は許すが、validated fields 以外を downstream model へ渡さない。

### 5. public GitHub read boundary を一つにする

remote operation は認証済み `gh api` を subprocess argument array で呼ぶ。token value や authorization header を process environment から読み取って再表示せず、human / JSON / error / debug output に含めない。repository visibility を public と確認できない場合、private、inaccessible、rate-limited、malformed response は別 URL や anonymous fetch へ fallback しない。

一つの remote observation は ref resolution、repository visibility、commit verification、full subtree、mapped legal blobsをimmutable valueとして返す。不完全pagination、欠落object、型不一致を部分成功にしない。

### 6. repo / ref cohort と ref policy を固定する

normalized `owner/repository` と canonical ref が同じ entries を一つの cohort とする。一回の observation で resolved 40-hex commit を決め、全 subtreeとlegal blobを同 commitから読む。

branch update は previous locked commit が resolved commit の ancestor である場合だけ受理する。初回 install は ancestor check のみ非該当とし、他の検証を省略しない。non-fast-forward / history rewrite は check / update とも exit 1 で拒否し、v1 に override option を設けない。commit verification は `verified`、`unverified`、`unknown` を保持し、後二者は warning だが単独では拒否理由にしない。

全 cohort の schema、target / lock collision、remote observation、policy、dirty state を mutation 前に preflight する。preflight failure は一件も apply しない。runtime apply failure の transaction 単位は cohort とし、完了済み先行 cohort は rollback しない。

### 7. legal change は source review で承認する

mapped legal blob の actual SHA-256 が source declaration の `expectedSha256` と異なる場合は policy error とし、target / lock を変更しない。利用者が新しい legal text を review し、source declaration の expected hash を明示変更した場合だけ次の preview を承認候補にできる。lock は適用した actual hash を記録する。

remote legal mapping の欠落、取得不能、source / target path 不正、target外配置、hash mismatch、異なるbytesとのtarget衝突はcohort全体を拒否する。local legal mappingの欠落、untracked / non-regular source、取得不能、path不正、hash mismatchはlocal plan全体を拒否する。取得した executable file や script-like extension は bytes と mode を検査・コピーできるが実行しない。

### 8. preview と immutable operation plan を共有する

`skills:check`、`skills:update` preview、`skills:update --apply` は同じ immutable plan factory を使う。global planはsources bytes digest、initial lock bytes / digest、canonical cohort orderを持つ。各cohort stepはmanaged target tree digest、resolved commit、remote tree / legal hashes、diff、limit、warnings、`expectedBeforeLockBytes` / digest、`candidateAfterLockBytes` / digestを持つ。先行stepのcandidate-afterは次stepのexpected-beforeとbyte-for-byteで一致するlock chainを形成する。content changeがないstepはcandidate-afterをexpected-beforeと同じbytes / digestにし、target / lockを書き換えない。

`skills:update` は dry-run 既定。`--apply` は開始前にsources、initial lock、全remote observations、全managed targetsをglobal planと照合する。各cohort開始直前にもcurrent lockがstepのexpected-before、managed targetとremote observationがstep inputsに一致することをfresh検証する。一つでも変化した場合はmutation前に停止して新しいpreviewを要求する。managed targetのtracked / untracked changeは拒否し、unrelated dirty pathは許す。force optionは提供しない。

`skills:lock-local`は全local entriesを一つのimmutable lock-only planとして扱う。planはsources digest、initial lock bytes / digest、全local target tree digests、全local legal hashes、candidate lock bytes / digestを固定する。`--apply`直前に全inputsをfresh再検証し、一つでも異なればlockを変更せずnew previewを要求する。対象0件またはcontent changeなしではwriteしない。

### 9. cohort apply は回復可能 transaction とする

候補 target、lock、before image、transaction manifest は destination と同じ filesystem の `.agents/skills/.skill-updater-txn/` に作る。transaction root は排他的に作成し、既存 root または同時 apply を検出した場合は mutation 前に拒否する。staging の full reread と validation 後、cohort target を置換し、最後に lock を置換する。各 transition 後に expected digest を検証する。

途中失敗時はbefore imageから失敗cohortの置換済みpathを逆順で復元し、そのstepのexpected-before target / lock digestを再検証する。復元を証明できた結果は`rolled-back`、証明できない結果は`unknown`とし、どちらもexit 1にする。先行cohortのapplied stateは維持し、後続cohortは`not-attempted`として同runを即停止する。`unknown`または残存transaction manifestがある間、後続applyと自動retryを拒否し、manifestとbefore imageを使う手動復旧を案内する。正常完了または証明済みrollbackのtemporary transaction directoryは削除する。

`skills:lock-local --apply`は全local entriesを一つのtransaction単位とし、targetを変更せずcandidate lockだけをsame-filesystem stagingでfull reread後に置換する。置換後のdigest検証に失敗した場合はbefore lock imageへrollbackし、復元を証明できれば`rolled-back`、証明できなければ`unknown`、いずれもexit 1とする。entry単位のpartial lock updateは行わない。

これは process crash を含む multi-path OS-level atomicity を約束しない。保証は、mutation 前 global preflight、cohort ごとの検証済み transition、失敗時 rollback、状態証明不能時 fail-closed stop である。

### 10. command と machine output を安定化する

- `skills:links`: 現行 symlink 再生成を冪等実行し、source / installed / ownership の対応を表示する。
- `skills:verify`: network と `gh` なしで installed tree、lock、metadata、symlink integrity を検証する。
- `skills:check`: remote update を検査する。update available は既定 exit 0、`--fail-on-update` では exit 3。
- `skills:update`: remote cohort の dry-run preview と explicit `--apply` だけを行う。
- `skills:lock-local`: 全local-owned entriesのlock-only planをdry-runし、explicit `--apply`だけで単一transactionとしてlockを置換する。

unknown option、衝突 option、schema / operation / policy error、history rewrite、downgrade、transaction failureはexit 1。errorとupdate availableが併存する場合はexit 1を優先する。machine outputは`schemaVersion`、`command`、`status`、canonical orderの`cohorts`、`warnings`、`errors`、`exitCode`を持つ。status vocabularyは`up-to-date`、`update-available`、`no-content-change`、`applied`、`unchanged`、`rolled-back`、`failed`、`unknown`、`not-attempted`に限定する。

### 11. migration parity 後だけ cutover する

現行 `.agents/skills/skills.lock.json` の全 entry をremote / local / pluginのいずれかへ一対一で分類する。name、source、target、commit、license、redistribution、installed bytesを黙示的に脱落させない。`license` / `redistribution`はsourcesへexact移植し、lockへexact copyする。remote entryはexplicit ref / subtree / legal mapping、local entryはtarget / local hash / repository-level legal mapping、plugin entryはtargetなしのmanager ownershipへ移す。現行local 4 entriesのroot `LICENSE`は共通repository-relative `sourcePath`としてexact移植し、各targetへ複製しない。`redistribution: blocked`のremote / local entryが存在した場合は移行を停止し、plugin ownershipへ推測変換しない。

migration は最新 `main` の tracked tree だけを入力とする。`.planning/`、旧 GSD planning artifacts、source-pinned handoff metadata を repository diff、metadata、tests、docs へ取り込まない。ignored local cacheは入力にも削除対象にもせず、tracked / branch diffが0件であることを最初のmigration taskで再検証する。

現行 H1〜H11 と rename 元 path、単一 skill repository 直下、同一 repository 複数 entry、WARN 非 gate の補助 cases を Node tests へ一対一で追跡する。新契約による結果変更は explicit ref、cohort、complete subtree、exit 0 / 3 / 1 の根拠を test 名または migration mapping に残す。

全 entry 対応、sources / lock schema、canonical JSON、installed integrity、H1〜H11 parity が green になった後だけ `scripts/skills-upstream-check.py`、`tests/test_skills_upstream_check.py`、`skills:upstream` を同じ task 内で削除する。symlink command は `skills:links` へ移し、旧 `skills:update` semantics と compatibility alias を残さない。

`task check` は offline の `skills:verify` と Node integrity tests を実行し、remote `skills:check` を含めない。最初の local parser / canonical hash vertical slice で Node.js 24 の typecheck、focused Node tests、最新入力の `task check` を実行し、CI parity を早期確認する。

## Spec Holes

[spec-holes.md](spec-holes.md) でSKUP-1〜SKUP-12に12分類を順番に適用した。採用した固定判断はmetadata path / schema、legal / redistribution保持、remote final treeへのlegal包含、local repository-level legal参照、u64 big-endian hash frame、branch / SemVer history rewriteとdowngradeのv1拒否、連鎖lockを持つ回復可能cohort transaction、全local一括lock-only transaction、runtime failure後の即停止。未解決判断はない。

## Risks / Trade-offs

- GitHub API 呼出回数が増える。cohort cache と resource limit で制御する。
- legal hash mismatch を fail-closed にするため、license 更新時は source declaration の人手 review が必要になる。
- transaction は multi-path crash atomicity を保証しない。before image、manifest、digest verification、unknown stop でデータ損失を黙殺しない。
- unsigned / unverified commit を許すため完全な identity assurance ではない。verification state と exact commit provenance を残す。
- patch 非対応により upstream と local customization を自動統合できない。初版は wrapper または local-owned skill を拡張点とする。

## Migration Plan

1. 最新 `main` 由来 branch に `.planning/` と旧 handoff が追跡・移行されていないことを検証し、現行 lock / H1〜H11 inventory を固定する。
2. source / lock decoder、variant別legal mapping、canonical JSON / path / final tree hash、frontmatter / SemVer adapter を TDD で作り、最初の CI parity を実行する。
3. fake `gh` boundary でpublic repository、ref、cohort、complete subtree、legal、limitを実装する。
4. immutable plan と read-only verify / check / update preview を接続する。
5. freshness guard、dirty guard、recoverable remote cohort transaction、全local一括lock-only transaction、links を接続する。
6. 全 lock entry と H1〜H11 を移行し、parity gate 成立後に旧 checker / command を削除する。
7. offline `task check`、self-review、OSWF-5 review / verifier、OpenSpec validation を完了する。

## Open Questions

なし。
