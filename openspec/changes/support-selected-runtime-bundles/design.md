# Runtime bundleの設計判断

## 採用するinterface

新しい管理経路を作らず、既存の `skills:verify/check/update/repin/links/migrate` を使う。
`remote` はownership、`bundle` の有無は配布形式を表す。両者を混同しない。
通常Skillとbundleが実際に異なるseamは、file選択、構造検証、配置先、link生成の要否である。
取得・固定・legal承認・隔離apply・失敗時停止は同じmoduleで所有する。

比較した案:

- 個別の通常remote Skills: 自動発見領域への配置とroot Skill要件が残り、専用bundleを表現できない。
- plugin ownershipへのtarget追加: host managerへの委譲とrepositoryの本文所有を混在させるため不採用。
- 新しいbundle CLI／source台帳: 更新・legal・隔離処理を並行管理することになるため不採用。
- schema v3への全面移行: 現在のSkill entryを変換する必要はなく、独立migrationを増やすため今回は不採用。
- **remoteに限定したbundle descriptor**: 既存entryを変えず、異なる構造だけを明示できるため採用案とする。

schema v2の追加fieldは旧readerが拒否する。これはfail-closedの互換境界として文書化する。
新readerによる既存v2の読込・serialize結果は不変とし、unknown fieldを一般的に許す変更にはしない。

## 小さい選択契約

`bundle.files` は正確な通常file path一覧であり、allowlistとrequired listを兼ねる。
optional fileやglobを持たないので、一覧にあるfileが1つでも欠ければ失敗する。
subtreeはrepository rootに固定し、source pathとtarget内pathを一致させる。
legal fileも同じ一覧に含め、legalMappingsによる一覧外取得・別名配置を許可しない。
詳細なfield、上限、lockは[metadata](metadata.md)に定める。

本changeでは100 files／単一1 MiB／全体2 MiBを各bundleの上限とする。
sourceはこれを引き下げられるが引き上げられない。より大きな汎用bundleへの拡張は本changeの対象外とする。
directoryはfile一覧の親から導出する。rootや末端に不要なdirectoryを追加しない。

`executable` はupstream Git modeと一致させ、overrideを認めない。
原本のmode変更を必要とするhost adapterは#74のproject-owned側で設計し、bundle原本の権限を書き換えない。
upstreamのmodeが変わった版へ更新する場合は、宣言変更と明示repinを経て、lockとpreviewにもmode差分を残す。
通常updateは移動tagを拒否するため、mode変更を含む別commitへのtag移動も黙って採用しない。

## 操作全体の予算を追加しない判断

単位別の上限と失敗時の保証は[metadata](metadata.md#リソース上限の適用単位)を正とする。
既存の `planner.ts` はcohortごとに観測・取得し、最後にapplyへ渡す。
共通の累積予算を追加すると通常Skillの受理条件も変わるため、最小bundle対応には含めない。
bundle専用の累積予算も今回は追加せず、通常Skillと共通のcohort契約を維持する。
これはリソース枯渇リスクの解消ではない。多数cohortによる取得量・保持メモリの増大は残存リスクとして受け入れる。

別change候補: **Skill更新操作全体のリソース予算**。
通常Skillとbundleを含む累積本文bytes／files／API metadata量の計数単位、重複排除、拒否時点と
既存入力の互換性を定義する。外部Issueは自動発行しない。
現在の上限を超える操作全体の取得を誤って拒否するtestは追加せず、複数cohort・後続失敗の既存保証をfixtureで固定する。

## 既存処理へ加えるseam

- `schema.ts`／`types.ts`: remoteのbundle有無を厳密に分岐する。`sourceFromLock`とserializerもpolicyを保持する。
  bundle固有の形・inventory検査は小さい内部moduleへ分離し、decoderを肥大化させない。
- `github.ts`: 同じcohortのref／release／tree metadataを全対象分検査した後、選択blobだけを既存runnerで取得する。
  truncated tree、Git SHA／size不一致、許可されないmodeの拒否とcredential redactを継承する。
- `metadata.ts`／`repository.ts`: 通常Skillは既存root Skill検証、bundleはexact file集合・mode・limits検証を使う。
  live filesystemとcommitted snapshotの両方で、同じ宣言に対して同じ論理treeを得る。
  通常Skill名とbundle名をrootごとに照合し、bundle宣言を理由に同名の未宣言Skill実体を許可しない。
- `planner.ts`／`ownership.ts`: 通常updateはbundle policyを変更しない。指名repinだけが承認済みpolicy差分を扱う。
  他の通常Skillをadopt-localする際、併存bundleを壊さず検証して保持する。
- `isolation.ts`／`apply.ts`: `.agents/vendor` を管理領域へ追加し、source／candidateのfingerprintと衝突検査へ含める。
  symlinkを許すのは既存のhost link領域だけとし、vendor領域へその例外を広げない。
- `links.ts`: bundleをlink生成対象から除外する。既存の利用者・host由来linkを削除したり所有したりしない。

`CanonicalTree`と `skill-tree-v1` のhash定義は変更しない。bundleにも同じbyte順序・hash算法を使い、
per-file inventoryはその同じtreeから導出する。独立した第二のhash実装を作らない。

## 更新と失敗

bundleはtag refだけを受理し、そのtagのGitHub releaseがstableであることを取得時に確認する。
stableはGitHubのdraft／prerelease属性とtag一致で定義し、SemVer上の安定性は保証しない。
branch追跡、prerelease属性true、draft属性true、release欠落を拒否する。
`-rc.1`を含むtag名だけでは拒否しない。通常更新はtag identityと履歴を既存規則で検査する。
別releaseへの更新、tag移動、legal policy、file集合／mode／上限の変更は指名repinで承認する。
bundleのrepinは `--tag` と承認commit／tag-objectを使い、`--branch`／`--pin-commit` を拒否する。
削除tagをcommit refへ暗黙変更せず、必要なら別の有効なstable releaseを選んで明示repinする。
通常Skillのref切替は変更しない。
releaseとrefはpreview／applyごとに観測し、取得後にも再確認する。過去のpreviewを永続承認tokenにしない。

repin時の旧treeは旧lockのbundle policyで検証し、新treeは新sourceのpolicyで検証する。
file削減や上限引下げを旧treeへ先に適用して、承認可能な変更を誤って拒否しない。
target／name／ownership／Skill↔bundleの変更はrepinでも許可しない。
通常updateによる同一legal mappingのhash再承認は既存規則を維持する。

previewは変更file path、mode、legal、bundle policyの差分を示す。本文・secretは結果へ出力しない。
JSONの既存envelopeを維持し、bundle policyに差分があるentryだけ `beforeBundle`／`afterBundle` を加える。
bundleの変更entryには旧／新lock inventoryから導出した `bundleFileChanges` を加え、人間向け表示も同じ値を使う。
形式は[metadata](metadata.md#previewのfile差分)に定める。通常Skillの出力fieldは変更しない。
同じcommitでもpolicyや最終treeが違えば変更として扱う。

書込は既存のindependent cloneだけへ、明示 `--apply` で行う。linked worktreeを更新candidateにしない。
全metadata／旧状態／新取得物を検証してから書込み、最後に全体offline verifyを必須とする。
失敗したcandidateは診断用に保持し、再試行は新candidateから行う。transaction／rollbackは追加しない。
apply前のcandidate管理領域にuntracked／ignored file、hardlink、symlinkがあれば書込開始前に停止する。

## Pruneと下流

既存のtemplate資産pruneは保守文書・保守test等を取り除く操作であり、Skill／bundleや共通verifyを削除しない。
synthetic bundleを含む配布fixtureで、prune後もoffline verifyと通常checkが成功することを検証する。
Genshijinの利用者向けremove操作とhost解除は#74が定める。本changeで新しいprune commandやhost cleanupを追加しない。
sourceだけを消して実体やlockを残した状態は未宣言／orphanとして拒否し、黙ってcleanupしない。

## Repository bundleの撤去

bundleの配布廃止は、保守者によるGit変更として次の順序で行う。新CLIや自動削除機構は設けない。

1. 対象name、source entry、lock entry、追跡済みvendor実体、参照する配布文書を特定する。
   関連する利用者差分・未追跡file・linkがあれば保存または所有確認を先に行い、再帰削除で巻き込まない。
   host解除が必要な製品ではその製品の手順を確認する。Genshijinでは#74が所有する。
2. 対象source entry・lock entry・vendor実体を同じ作業変更で撤去し、関連配布文書を更新する。
   他bundleと通常Skillを保持する。これは複数fileのGit変更であり、filesystem上の原子的削除を保証しない。
3. `skills:verify` を撤去後の作業ツリーに対して実行する。source／lock／実体の一部だけが残る状態なら停止する。
   vendor root自体がなくても、bundle宣言が0件で他に不整合がなければ許可する。
4. review用commitへ全差分をまとめ、`skills:check` の `--source` と `--base` にそのrepositoryと撤去後commitの完全SHAを指定する。
   旧commitを基準にしない。checkは残存remoteを通常どおり確認し、撤去したbundleを再取得・再生成しない。
   checkの実行失敗は未検証として扱う。新規source-onlyの追加を許すupdate経路を撤去完了の代替判定にしない。
5. focused tests、synthetic fixtureでの撤去後prune integration、`./scripts/check.sh` を確認する。
   通常CIはfake GitHub応答を使い、実networkへ依存させない。

source・lock・実体の3要素について、全て存在する有効状態と全て撤去された状態を成功例とする。
一部だけが残る6通りはoffline verifyの失敗例とし、snapshot検証でも未宣言vendorやorphanを見落とさない。
この手順はrepositoryの新しいsnapshotだけを変更する。旧checkout、user cache、既存host登録は自動的には消えない。

## 検証と引渡し

公開commandと既存GhRunner seamを通すfake GitHub応答、独立candidate、実filesystemの異常fixtureを使う。
既存Skillとの混在、取得前blob requestゼロ、元repository不変、通常CIのoffline性を優先する。
実upstreamのscript実行・host起動は不要であり、この配布機構の受入条件にしない。
固定版Genshijinのmetadataだけを使う[feasibility確認](feasibility.md)は本changeの受入証跡に含める。
候補のpath／祖先／type／mode／件数／bytesを確認し、未確認や不適合をsynthetic test成功で代替しない。
候補は同梱許可リストではなく、最終runtime closure、legal本文、adapterとの接続確認は#74に残す。
実装完了後は#74へdescriptorの書き方、offline integrity、repin手順、prune境界を引き渡す。
