## ADDED Requirements

### Requirement: SKUP-1 source declaration と generated lock を分離する

updater は MUST `.agents/skills/skills.sources.json` を human-owned declaration、`.agents/skills/skills.lock.json` を generated resolved state として別 schema で検証し、暗黙 source や unknown field を補完しない。

#### Scenario: remote skill を宣言する
- **WHEN** remote entry が name、target、public GitHub repository、explicit ref、subtree、review 済み legal mappings を持つ
- **THEN** updater は entry を正規化し、resolved commit、canonical tree hash、legal hashes を lock 候補にできる

#### Scenario: ref が省略される
- **WHEN** remote entry が branch、exact commit、SemVer range のいずれも明示しない
- **THEN** updater は default branch を推測せず schema error、exit 1 にする

#### Scenario: unknown schema または field を読む
- **WHEN** sources / lock の schema version が非対応、または top-level / entry に unknown field がある
- **THEN** updater は file を変更せず schema error、exit 1 にする

#### Scenario: remote source が0件である
- **WHEN** declaration に remote-owned entry がない
- **THEN** remote check / update は対象0件の no-op、exit 0 にし、local-owned と plugin-owned entry を変更しない

#### Scenario: declaration が衝突する
- **WHEN** skill name、normalized target、lock key、remote legal target、または ownership が重複・衝突する
- **THEN** updater は全 apply 前に schema error とし、暗黙 merge や last-wins を行わない

#### Scenario: legal policy fields を lock へ生成する
- **WHEN** source entry の `license` がtrim後に非空で、`redistribution` が対応enumである
- **THEN** updater は両値をexactにgenerated lockへcopyし、sources / lockのdriftをintegrity errorにする

#### Scenario: metadata input が上限を超える
- **WHEN** sources / lock が10 MiBを超える、または `skills` が500 entriesを超える
- **THEN** updater は入力を切り捨てず schema / resource error、exit 1 にする

### Requirement: SKUP-2 ownership variant を守る

updater は MUST remote、local、plugin の ownership variant と許可 field / operation を検証し、remote / localだけにtargetとhashを許可し、variant間の推測変換を行わない。

#### Scenario: local-owned skill を検査する
- **WHEN** local entry が valid target を持つ
- **THEN** `skills:verify` と `skills:lock-local` は canonical local hash を扱い、remote check / update は source 解決しない

#### Scenario: local-owned skill が repository-level legal file を参照する
- **WHEN** local entry が tracked regular file の repository-relative `sourcePath` と expected hash を宣言する
- **THEN** updater は legal file を target へ複製せず独立 hash で検証し、local mapping / lock へ `targetPath` を要求または生成しない

#### Scenario: plugin-owned skill を検出する
- **WHEN** plugin entry が manager を宣言する
- **THEN** updater はtarget / hashを要求または生成せずownershipを表示するだけで、remote fetch、local hash更新、installed tree writeを行わない

#### Scenario: redistribution が blocked である
- **WHEN** remote または local entry が `redistribution: blocked` を宣言する
- **THEN** updater は既存installed bytesの有無にかかわらずinstall / verify / update / lock-localを許可せずschema / policy errorにし、plugin ownershipへ推測変換しない

#### Scenario: ownership と fields が矛盾する
- **WHEN** ownership value が非対応、または remote / local / plugin の許可 fields と一致しない
- **THEN** updater は ownership を推測せず schema error、exit 1 にする

### Requirement: SKUP-3 public GitHub subtree だけを取得する

updater は MUST 認証済み `gh api` から public GitHub repository の content だけを取得し、credential value を読み取り、保存、表示しない。

#### Scenario: public repository を取得する
- **WHEN** `gh` authentication が有効で repository と explicit ref を read できる
- **THEN** updater は API response から visibility、commit、tree、blob metadata を完全検証する

#### Scenario: private または inaccessible repository を指定する
- **WHEN** visibility を public と確認できない、または API が access / rate-limit error を返す
- **THEN** updater は別 URL、anonymous fetch、cached partial response へ fallback せず source error、exit 1 にする

#### Scenario: response が不完全である
- **WHEN** pagination が完了しない、required object が欠落する、または response type が不正である
- **THEN** updater は partial subtree を作らず cohort を拒否する

#### Scenario: output を生成する
- **WHEN** human、JSON、error、debug output を作る
- **THEN** token value と authorization header を含めない

### Requirement: SKUP-4 ref 移動を fail-closed で検証する

updater は MUST explicit ref を一つの 40-hex commit に解決し、branch fast-forward と SemVer selection を検証し、history rewrite を v1 では拒否する。

#### Scenario: branch が fast-forward する
- **WHEN** previous locked commit が newly resolved branch commit の ancestor である
- **THEN** updater は update 候補として継続する

#### Scenario: remote skill を初回 install する
- **WHEN** valid explicit ref はあるが previous locked commit がない
- **THEN** updater は ancestor check だけを非該当とし、resolved commit と他の全 validation を実行する

#### Scenario: SemVer tag range を解決する
- **WHEN** source が explicit npm SemVer range を opt-in で指定する
- **THEN** updater は highest satisfying tag を選び、range が prerelease を明示しない限り prerelease を除外する

#### Scenario: SemVer range を満たす tag がない
- **WHEN** complete pagination後のvalid SemVer tagsにsource rangeを満たす候補がない
- **THEN** updaterはsource error、exit 1にし、target / lockを変更しない

#### Scenario: 同一 canonical version の tags が異なる commit を指す
- **WHEN** 同じ canonical version に正規化される複数 tag が異なる commit へ解決される
- **THEN** updater は任意の tag を選ばず source error、exit 1 にする

#### Scenario: branch history が rewrite される
- **WHEN** previous locked commit が resolved commit の ancestor ではない
- **THEN** check / update は mutation せず exit 1 にし、v1 は override option を提供しない

#### Scenario: locked SemVer tag が移動または削除される
- **WHEN** locked `selectedTag` が存在しない、またはlocked `resolvedCommit`以外を指す
- **THEN** updater は新しいhighest satisfying tagを選ぶ前にhistory rewriteとしてmutationなしのexit 1にする

#### Scenario: SemVer range 変更が downgrade を選ぶ
- **WHEN** review済みsource range変更後のcandidate versionがlocked `selectedVersion`より低い
- **THEN** updater はdowngradeとしてmutationなしのexit 1にし、v1はoverrideを提供しない

#### Scenario: commit が未署名または未検証である
- **WHEN** GitHub verification state が verified ではない
- **THEN** updater は `unverified` または `unknown` を warning と machine output に残すが、それだけを理由に拒否しない

### Requirement: SKUP-5 同じ repository / ref を cohort として観測する

updater は MUST normalized repository / canonical ref が同じ entries を一つの resolved commit から観測し、全 cohort の preflight 完了前に mutation を開始しない。

#### Scenario: cohort の全 skill が valid である
- **WHEN** 全 subtree、legal mapping、limit、collision、dirty guard が成功する
- **THEN** preview と apply は同じ resolved commit を全 entries に使用する

#### Scenario: 一つの skill が invalid である
- **WHEN** cohort 内の一 entry が validation または policy failure になる
- **THEN** cohort 内の target と lock を一つも変更しない

#### Scenario: 異なる cohort の target が衝突する
- **WHEN** 複数 cohort が同じ normalized target、lock key、または legal target を所有する
- **THEN** updater は mutation 前の global preflight で全 apply を拒否する

#### Scenario: 後続 cohort の runtime apply が失敗する
- **WHEN** global preflight 後に先行 cohort が成功し、後続 cohort の transaction が失敗する
- **THEN** updater は先行 cohort を rollback せず、cohort ごとの状態を列挙して exit 1 にする

#### Scenario: commit だけ進み content は変わらない
- **WHEN** resolved commit が新しいが全 subtree / legal bytes が locked content と同じである
- **THEN** updater は lock-only change を作らず `no-content-change`、exit 0 にする

### Requirement: SKUP-6 canonical path と tree hash を固定する

updater は MUST canonical regular files を UTF-8 byte order で並べ、`skill-tree-v1\0` domain separator、unsigned 64-bit big-endian lengths、executable flag、content bytes から SHA-256 tree hash を計算する。

#### Scenario: file 内容または executable bit が変わる
- **WHEN** canonical path が同じ file の content bytes または executable bit が locked state と異なる
- **THEN** tree hash と diff は変化を表す

#### Scenario: 同じ files が異なる入力順で渡される
- **WHEN** file set と bytes / mode は同じだが列挙順だけが異なる
- **THEN** updater は UTF-8 byte order へ整列し、同じ frame と hash を返す

#### Scenario: traversal または alias path がある
- **WHEN** path が absolute、empty segment、`.`、`..`、backslash、NUL、non-NFC、exact NFC duplicate、ASCII case-fold collision を含む
- **THEN** updater は path を補正せず cohort を拒否する

#### Scenario: unsupported file type がある
- **WHEN** subtree に symlink、submodule、device、FIFO、socket、その他 special file がある
- **THEN** updater は対象を無視せず cohort を拒否する

#### Scenario: empty subtree である
- **WHEN** subtree に regular file がない、または root `SKILL.md` がない
- **THEN** updater は empty tree を install せず metadata validation error にする

#### Scenario: remote candidate tree へ legal file を配置する
- **WHEN** remote subtree と review 済み legal mappings から candidate installed tree を構築する
- **THEN** updater は subtree files と `targetPath` へ配置した legal files の最終集合を tree hash 対象にし、legal hash も独立して lock する

#### Scenario: legal target が subtree file と重なる
- **WHEN** mapped legal bytes が既存 subtree file の同じ target-relative path へ配置される
- **THEN** bytes が同一なら既存 mode を保持して1 fileとして数え、異なるなら collision error として cohort を拒否する

### Requirement: SKUP-7 resource limit を切り捨てず適用する

updater は MUST 一skill 200 files / 20 MiB、単一file 10 MiB、cohort 500 unique files / 50 MiB、SemVer tag candidates 500件の上限を適用する。

#### Scenario: 値が上限と等しい
- **WHEN** count または bytes が対応上限と等しい
- **THEN** 他の条件を満たせば受理する

#### Scenario: 値が上限を一つ超える
- **WHEN** count または bytes が対応上限を超える
- **THEN** updater は partial tree を作らず cohort を拒否する

#### Scenario: legal blob が重複する
- **WHEN** cohort 内の複数 mapping が同じ commit / canonical source path を参照する
- **THEN** updater は単一 file limit を各 blob に適用し、cohort file / byte 合計では unique blob を1回だけ数える

#### Scenario: tag pagination が上限内で完了しない
- **WHEN** 取得済みSemVer tag candidatesが500件以下でもpagination完了を証明できない
- **THEN** updater は取得済み範囲を完全とみなさずcohortを拒否する

### Requirement: SKUP-8 SKILL metadata と legal approval を静的検証する

updater は MUST 各 remote subtree root の単一 `SKILL.md` と source declaration の review 済み remote / local legal mappings を、取得 code の実行なしで検証する。

#### Scenario: SKILL.md が valid である
- **WHEN** root に exactly one `SKILL.md` があり、UTF-8 YAML mapping の `name` が declaration と一致し、`description` が trim 後に非空である
- **THEN** unknown frontmatter fields があっても recognized metadata の validation は成功する

#### Scenario: YAML が複数 document または mapping 以外である
- **WHEN** frontmatter が複数 document、duplicate key、parse error、または mapping 以外の root を持つ
- **THEN** updater は metadata validation error とする

#### Scenario: SKILL.md が欠落または重複する
- **WHEN** root の `SKILL.md` が0件または複数として解決される
- **THEN** updater は cohort を拒否する

#### Scenario: legal hash が declaration と異なる
- **WHEN** mapped legal blob の actual SHA-256 が `expectedSha256` と異なる
- **THEN** updater は policy error とし、target / lock を変更しない

#### Scenario: local legal source が利用不能である
- **WHEN** local legal `sourcePath` が repository 外、untracked、欠落、または regular file 以外である
- **THEN** updater は local plan 全体を policy error にし、target / lock を変更しない

#### Scenario: 利用者が legal change を承認する
- **WHEN** 利用者が新しい legal text を review し、source declaration の `expectedSha256` を明示更新する
- **THEN** 次の fresh preview は新 hash を承認候補として検証し、lock には適用した actual hash を記録する

#### Scenario: license または redistribution が変化する
- **WHEN** 利用者がsource declarationの`license`または`redistribution`をreview済みchangeとして更新する
- **THEN** updaterはnew valueとlegal mappingsをfresh previewで検証し、remote / localの`blocked`は拒否し、成功時だけlockへexact copyする

#### Scenario: subtree に executable script がある
- **WHEN** 取得 file が executable bit または script-like extension を持つ
- **THEN** updater は bytes と mode を検査・コピーできるが、更新処理中に実行しない

### Requirement: SKUP-9 preview と apply を同じ immutable plan へ束縛する

`skills:update` は MUST 既定で副作用なしpreviewを返し、global plan内の各cohort stepへ連鎖するexpected-before / candidate-after lock bytesとdigestを固定し、`--apply`時だけsources、current step lock、managed targets、remote observationのfresh digestがstep planと一致した場合にmutationする。

#### Scenario: dry-run を実行する
- **WHEN** `--apply` なしで update を実行する
- **THEN** filesystem とGit working treeを変更せず、commit、diff、warnings、各stepのexpected-before / candidate-after lock digestと予定lockを表示する

#### Scenario: managed target が dirty である
- **WHEN** cohort の target path に tracked または untracked local change がある
- **THEN** apply は force overwrite せず mutation 前に停止する

#### Scenario: unrelated path が dirty である
- **WHEN** managed target 外だけに working tree change がある
- **THEN** updater はその理由だけでは apply を拒否しない

#### Scenario: preview 後に input が変化する
- **WHEN** apply開始前または各cohort開始直前の再検査でsource commit、remote tree、sources、current expected-before lock、managed targetのいずれかがpreviewと異なる
- **THEN** updater は新しい observation を未承認のまま apply せず、新しい preview を要求する

#### Scenario: 先行 cohort が lock を更新する
- **WHEN** 先行cohortのcandidate-after lockが適用され、次cohortを開始する
- **THEN** 次cohortは同じbytes / digestをexpected-beforeとしてfresh検証し、initial lock digestとの比較でstale扱いしない

#### Scenario: 同じ apply を再実行する
- **WHEN** target / lock が承認済み content と一致する状態で同じ update を再実行する
- **THEN** updater は `no-content-change` を返し、target / lock bytes を書き換えない

### Requirement: SKUP-10 cohort apply を回復可能 transaction にする

updater は MUST destination filesystem 上の staging、before image、manifest、transition digest を使い、失敗時に rollback を試み、状態を証明できない場合は `unknown` で停止する。

#### Scenario: transaction が成功する
- **WHEN** staged candidate の full reread、freshness validation、target replacement、lock-last replacement、post-state digest が成功する
- **THEN** updater は cohort を `applied` とし、temporary transaction directory を削除する

#### Scenario: apply が途中で失敗し rollback を証明できる
- **WHEN** 一部 path 置換後に失敗し、before image から original target / lock digest を復元・再検証できる
- **THEN** updaterは失敗cohortを`rolled-back`、後続cohortを`not-attempted`、exit 1にして同runを即停止し、temporary transaction directoryを削除する

#### Scenario: apply 後状態を証明できない
- **WHEN** rollback、digest reread、または process interruption 後の状態を original / applied のいずれとも証明できない
- **THEN** updater は `unknown`、exit 1 にし、自動 retry と後続 apply を拒否して manual recovery を案内する

#### Scenario: transaction manifest が残存する
- **WHEN** `.agents/skills/.skill-updater-txn/` に未解決 manifest がある
- **THEN** updater は新しい mutation を開始せず、残存 before image と digest を使う復旧を案内する

#### Scenario: apply が同時実行される
- **WHEN** 別 process が transaction root を保持中に apply を開始する
- **THEN** updater は排他的 transaction root を取得できない process を mutation 前に exit 1 で停止する

#### Scenario: 複数 cohort がある
- **WHEN** 先行 cohort の transaction が完了後、後続 cohort が失敗する
- **THEN** updaterは先行cohortとそのcandidate-after lockを維持し、失敗cohortだけをexpected-beforeへrollbackし、残りを`not-attempted`として返す

#### Scenario: 全 local entries の lock を更新する
- **WHEN** `skills:lock-local --apply` の全 target tree / legal hash / sources / expected-before lock が preview と一致する
- **THEN** updater は target を変更せず、全 local entries を含む candidate lock を single transaction で置換し、entry 単位の partial update を行わない

#### Scenario: local lock 置換後の検証が失敗する
- **WHEN** `skills:lock-local --apply` が candidate lock 置換後の digest を証明できない
- **THEN** updater は before lock image へ rollback し、復元を証明できれば `rolled-back`、できなければ `unknown`、いずれも exit 1 にする

### Requirement: SKUP-11 command と machine output を安定させる

repository は MUST links、verify、check、update、lock-localの責務、schema-versioned JSON、`not-attempted`を含むstatus vocabulary、exit 0 / 3 / 1を分離し、旧command semanticsのcompatibility aliasを残さない。

#### Scenario: skill symlink を再生成する
- **WHEN** `skills:links` を実行する
- **THEN** vendored skill の symlink を冪等に再生成し、source / installed / ownership の対応を表示する

#### Scenario: local integrity だけを検査する
- **WHEN** `skills:verify` を実行する
- **THEN** network と `gh` を使わず installed tree、lock、metadata、symlink integrity を検査する

#### Scenario: remote update を preview する
- **WHEN** `skills:update` を `--apply` なしで実行する
- **THEN** symlink 再生成ではなく remote cohort update の副作用なし preview を返す

#### Scenario: update が利用可能である
- **WHEN** `skills:check` が valid update を検出する
- **THEN** 既定は exit 0、`--fail-on-update` は exit 3 を返す

#### Scenario: error と update available が併存する
- **WHEN** ある cohort に valid update があり、別 cohort に schema、operation、policy、transaction error がある
- **THEN** machine output は両方を列挙し、exit 1 を exit 3 / 0 より優先する

#### Scenario: option が unknown または衝突する
- **WHEN** command が unknown option または両立しない mode を受け取る
- **THEN** updater は mutation 前に usage error、exit 1 にする

#### Scenario: first-party hash を更新する
- **WHEN** `skills:lock-local --apply` を明示する
- **THEN** updater は全 local-owned entries を一つの immutable lock-only plan として fresh 検証し、remote / plugin entries を保持した candidate lock だけを単一 transaction で更新する

#### Scenario: machine output を生成する
- **WHEN** JSON output mode を選ぶ
- **THEN** updater は `schemaVersion`、`command`、`status`、canonical order の `cohorts`、`warnings`、`errors`、`exitCode` を返す

### Requirement: SKUP-12 parity gate 後に legacy checker を置換し offline integrity を通常 check に含める

repository は MUST 現行 H1〜H11、補助 fixtures、全 lock entries を新契約へ一対一で移行し、schema / canonical serialization / installed integrity の検証後だけ legacy checker / command を削除し、offline `skills:verify` を `task check` に含める。

#### Scenario: migration branch の planning 境界を検証する
- **WHEN** 最初の migration task が tracked files と `origin/main...HEAD` の diff を検査する
- **THEN** `.planning/`、GSD planning artifacts、source-pinned handoff metadata は0件であり、ignored local cache を移行または削除しない

#### Scenario: H1〜H11 を移行する
- **WHEN** parity suite を実行する
- **THEN** H1〜H11 と rename 元 path、単一 skill repository 直下、同一 repository 複数 entry の cases は Node tests に追跡され、結果変更の根拠が explicit ref、cohort、complete subtree、exit semantics に対応する

#### Scenario: 全既存 entry を移行する
- **WHEN** 現行 lock から new sources / lock を生成する
- **THEN** 全entryはremote、local、pluginのいずれかとして追跡され、license / redistributionはsourcesからlockへexact copyされ、pluginだけがtargetなしとなり、source、target、commit、legal mappings、installed bytesの黙示的な脱落がない

#### Scenario: 現行 local entries の root LICENSE を移行する
- **WHEN** `self-review`、`verify-change`、`spec-holes`、`execute-openspec-change` の現行 `license_file: LICENSE` を移行する
- **THEN** updater は root `LICENSE` を共有 repository-relative local `sourcePath` として exact 移植し、各 skill target へ複製せず、local tree hash と独立した legal hash で検証する

#### Scenario: deletion gate が未成立である
- **WHEN** parity、全 entry 対応、new JSON validation、canonical serialization、installed integrity のいずれかが失敗する
- **THEN** repository は Python checker、旧 test、`skills:upstream` を削除しない

#### Scenario: deletion gate が成立する
- **WHEN** parity、全 entry 対応、new JSON validation、canonical serialization、installed integrity がすべて成功する
- **THEN** repository は Python checker、旧 test、`skills:upstream` を同じ task 内で削除し、旧入口残存検査を有効にする

#### Scenario: 通常 check を offline で実行する
- **WHEN** network と `gh` がない環境で `task check` を実行する
- **THEN** installed tree、lock、metadata、symlink integrity を検証し、remote API を呼ばず完了する

#### Scenario: remote update を確認する
- **WHEN** 利用者が `skills:check` を明示実行する
- **THEN** network を使って remote state を観測し、通常 `task check` から独立した exit 0 / 3 / 1 を返す

#### Scenario: 旧 command 入口が残る
- **WHEN** `skills:upstream`、symlink 再生成としての `skills:update`、または compatibility alias が Taskfile、scripts、docs に残る
- **THEN** offline contract test と `task check` は失敗する
