# 設計: 縮小する責務と保護境界

文書種別: 設計リファレンス。schemaの正本は[schema.md](schema.md)、
公開操作は[interfaces.md](interfaces.md)、規範要件は `specs/` とする。

## 現状と採択理由

基準commitは `cae73342c1b25755fe3a7abceb4032b1f9b21837`。
sourceはremote 8件（すべてbranch main）、local 4件、plugin 0件で、SemVer利用は0件である。
下流の利用実態は未確認であり、0件と推測せず有効なv1 SemVer / plugin宣言を移行対象に含める。

現行 `types.ts` / `schema.ts` は3 ownershipをsourceとlockの両方へ記録する。
`canonical.ts` はpath・実行bit・本文の決定的SHA-256集約を行う。
`github.ts` はGit tree metadataによる事前検査とblob integrityを持つ。
`transaction.ts` は元repository内のbefore image、manifest、rollbackを管理する。
これらの実装事実と既存testsを再利用し、保証の削除を行数削減の手段にしない。

## 1. 宣言・結果・出典の分離

sourceは利用者がレビューする取得方針、ownership、legal承認の正本とする。
lockはremoteの取得結果とsourceとの対応を記録する。sourceとlockを同時改変した内容の承認はレビューが担い、
offline検証を上流作者の認証やGitHubへの問い合わせの代用とは説明しない。

localは本文hashを持たず、Gitとレビューで変更を管理する。外部由来localには最後の取得元repository、
subtree、固定commit、ref、必要なtag情報を `origin` として保存する。これは現在本文の一致証明ではない。
純粋な自作localはoriginを省略できる。pluginはsource上の宣言だけであり、managerを実行しない。

## 2. 取得と固定

同じrepositoryとrefのremoteを一つのcohortとして解決する。一回の通常更新ではcohort内で一つのcommitを共有する。
branch更新は各既存lockからfast-forwardであることを確認する。ref / repository / subtree / license / legalMappings構造の変更は
通常更新に紛れ込ませず、明示repinの対象とする。既存本文のlock不一致はrepinでも上書きしない。
新規remoteは承認済みsourceがあり、配置先が存在しない場合だけ取得する。既存の未管理pathは拒否する。

tagは直接object SHAと、tagを辿ったcommit SHAを保存する。軽量tagでは両者が同じになる。
注釈付きtagはcommitへ到達するまで型とobject SHAを検証し、循環、commit以外の終端、
過大な連鎖は拒否する。連鎖は32段を上限とし、32段到達までにcommitを解決できなければ停止する。
tagの削除、直接objectの変化、commitの変化を通常更新で拒否する。
repinは指定されたcommit、tagの場合は直接object SHAとも解決結果を照合する。
通信中のref変更を検知した場合も、新しい固定先を暗黙に選び直さず停止する。

選択subtreeとlegal sourceをtree metadataで列挙し、cohort内の全選択blobの本文取得より前に
R3の上限・mode・path・衝突を検査する。選択外blob本文は取得しない。
取得後はGit blob SHA・size、R2のSkill構造・identity、legal hash、配置後canonicalを別々に検査する。
treeやAPI応答全体を含む通信量の厳密な制限を保証したとは扱わない。

取得したcommitが変われば、本文が同一でもlockのcommitを更新する。GitHubの署名検証状態は
従来どおり記録・警告に留め、署名必須という新しい受入条件にはしない。

## 3. legal承認の変更

remote更新中にLICENSE / NOTICEのhashがsourceの承認値と異なれば停止する。
同じmappingのhash変更だけなら、人が内容を確認してsourceの承認hash変更をcommitし、
新しい開始commitから通常updateの候補を作り直す。
license変更、LICENSEのsourcePath / targetPath移動、NOTICE追加・削除等のlegalMappings構造変更は、
新sourceをcommitしたうえで `skills:repin --name ...` により対象名と固定SHAを明示承認する。
repin previewはpolicy / mapping変更を表示し、redistribution: allowedと全取得前検査を維持する。
同じcommitでも宣言や最終legalが変われば適用し、新subtreeと新mappingから最終treeを構成する。
更新前の配置済みlegalは旧lockと照合し、更新候補のlegalは新sourceの承認値と照合する。
この二段階を区別し、旧lockのhashまで手編集して既存実体の検証を回避する手順は提供しない。
通常のoffline verifyはsource / lock / 配置済みlegalの三者一致を要求するため、
承認値だけ変更した中間状態は配布・PR完了の合格状態ではない。

local化・offline移行ではlegal承認の変更を兼ねない。旧source / lock / legalに矛盾があれば停止する。

## 4. 隔離書込み

update / repin / adopt-local / migrateは元repository、完全な開始commit SHA、候補cloneを必須入力とする。元の未コミット変更をsnapshotへ
取り込まず、開始commitからtracked source / lock / 本文 / legalを読む。
開始commitを元repositoryで解決できることと候補HEADの一致を検査する。

候補は事前作成した独立cloneである。作成・破棄・branch・push・PRをCLIが管理しない。
realpathで同一・包含関係を拒否し、Git common directoryの共有、alternates、環境変数によるGit directory差替え、
書込み先のsymlink経由逸脱・hardlink共有を拒否する。Git状態照会は元側のindex refresh等を避ける。
開始時の候補はtracked差分なし、index差分なしとし、管理対象内のuntracked / ignored fileも拒否する。
通常の依存導入で生じる `node_modules/` や `.venv/` は管理対象外であり、存在だけでは拒否しない。

元の作業コピーの本文、index、refs、設定へ書き込まない。remote Skill内のscriptやhookを実行しない。
保証は、文書化した単一writer手順と検査済み配置先に対するものである。
同一ユーザー権限の敵対process、悪意ある実行環境、任意のOS資源アクセスを隔離するsandboxではない。
同じ候補への並行書込みは禁止し、観測可能な入力変更は書込み直前にも検出して停止する。

書込みは全対象の取得・検証後に始め、本文、metadata、必要なlinkを候補に配置し、最後にoffline verifyする。
途中のI/O失敗・killで候補に部分状態が残ることは許容する。元へrollbackする経路は持たない。
失敗候補を修復して途中再開せず、診断後に新しいcloneから同じ開始commitで再実行する。
成功候補も次の書込み操作の入力としてそのまま重ねて使わず、reviewしてcommitした状態を新しい開始点とする。
移行済み入力の再実行は、新しい候補上で検証して無変更成功する。

旧transactionを消す前に、例外・ENOSPC相当・強制中断・候補汚染の実験で元コピー不変を実証する。
削除予定manifestや一時reportを通常CIの完了証拠にしない。
失敗候補のPR進行禁止は、操作成功→候補検証→project checks→差分レビュー→commit / push / PRという
短絡停止する手順で担保する。任意の人手pushをシステムが阻止するとは保証しない。

`skills:links` は隔離更新の対象外とし、現在checkoutで既定の直接修復を維持する。
本文・source・lockは変更せず、所定のlink配置領域だけを修復する。全対象の非symlink衝突と親path逸脱を
書込み前に拒否し、bootstrapの `scripts/setup-skills.sh` と契約を揃える。
この操作は候補引数・preview / applyを要求せず、修復後link検証の成功を返す。
全体offline verifyとは別操作であり、本文の不正を修復成功によって承認しない。

## 5. ownershipと一度だけの移行

通常local化は対象名を一つ指定し、snapshot内の本文を変更せずsourceをlocalへ変換し、remote lockを除く。
本文が旧lockと異なる場合も明示操作なら保持するが、regular file / path安全性、R2のSkill構造・identity、legalの検査は省略しない。
不一致本文を取得元の原本と誤表示しない。すでに同じoriginを持つlocalへの再指定は検証して無変更成功とする。
純粋な自作localやpluginをremote由来として捏造する操作は拒否する。

移行はv1 source / lockの組からv2へのoffline変換である。v1以外の旧形式を推測して変換しない。
SemVerは旧lockのresolvedCommitをcommit refへ変換し、旧範囲、selectedTag、selectedVersionを
履歴情報として保持する。tag object SHAはofflineで推測せず、移行後の明示tag追跡が必要なら別のrepinを行う。
branch / commitは固定先を保持する。旧remoteのtreeHash / fileCount / byteCountを再計算結果と照合する。
local本文の差分は内容lockを再生成せず保持する。remote / localともR2のSkill構造・identityを検証し、
legalは旧承認値との一致を要求する。localizeを明示しても不正なSKILL.mdは停止し、自動修復しない。
pluginはsource / lockの宣言一致を確認してsourceだけ残す。

編集済みremoteは `--localize` で名前を指定した場合だけ本文を保持してlocal化する。
名前の重複、未知名、remote以外の指定は拒否する。すべての検証後に候補だけへ変換結果を出す。
v2同士は通常検証のうえ無変更成功する。v1 / v2混在、片方欠落、情報不足は停止する。

旧decoderは独立した移行entrypointに閉じ込め、通常CLIからimportしない。
移行専用処理はv1→v2だけを提供し、恒久的な多世代互換層や通常CLIの自動変換へ発展させない。
利用者が一度実行できるよう、移行処理とfixtureは配布可能な追跡対象として保持する。
close時に消えるchange directoryや到達不能な履歴から実行させない。

## 6. module境界と削減順

| 境界 | 責務 | 持たせない責務 |
| --- | --- | --- |
| schema / types / canonical / legal | v2構造、純粋検証、決定的表現 | GitHub I/O、作業コピー管理 |
| GitHub adapter | 公開APIによるref解決、履歴、metadata事前検査、blob取得 | filesystem配置、承認の推測 |
| repository / ownership | committed snapshot、offline検証、local化の純粋変換 | 上流自動merge |
| isolation / apply | 元と候補の検査、候補への書込み、最終verify | clone / push / PR管理、rollback / resume |
| CLI / task | 入力検証、preview / apply、exit code、出力 | 独自orchestrator、tool内部API |
| v1 migration entrypoint | 旧decoder、offline変換、明示local化 | 通常CLIの旧形式受理 |

既存moduleを縮小・分割してこの境界へ合わせる。ファイル名だけの再配置や抽象化を目的にしない。
最初にv2の純粋モデルを独立moduleとしてfixtureから検証し、既存v1 CLIと配布物はまだ切り替えない。
この状態で隔離境界のvertical sliceと通常checkを通し、その後に取得・ownership・migrationを接続する。
task 5の切替時に暫定v2 moduleを最終境界へ統合し、旧decoderは移行処理だけに残す。
最後にlocal lock更新、SemVer探索、不要transaction状態を撤去し、CLI / tests / CI / 文書を整合する。
schema library、追加runtime、外部tool内部APIやforkは導入しない。

## 7. 検証と残る実装上のリスク

全要件と12分類の対応は[spec-holes.md](spec-holes.md)、実験・負例は[validation.md](validation.md)を参照する。
実装時の独立review / verifierはAGENTS.mdのOSWF-5に従う。本書は発火条件を再定義しない。
今回の文書検証は新挙動の実証ではなく、実装tasksを完了へ進めない。
Ubuntu / WSL Ubuntuを保証対象とする。WSLでは元repository・候補clone・Git metadataをすべてLinux filesystemに置く。
`/mnt/c` 等のWindows / DrvFSは保証対象外とし、特別なmode / symlink互換処理は追加しない。
既存のmode・path・symlink・Git共有検査は維持する。WSL実機ではfilesystemとmount条件を記録する。
結果は実装時に取得し、未実行を成功へ読み替えない。

## 参照

- [WSL file permissions](https://learn.microsoft.com/en-us/windows/wsl/file-permissions): Linux filesystemとWindows上のpermission処理の違い。
- [WSL filesystems](https://learn.microsoft.com/en-us/windows/wsl/filesystems): Linux filesystem上の配置方針。
- [Git clone](https://git-scm.com/docs/git-clone): local最適化を避ける `--no-local` と共有objectの注意点。
- [Git rev-parse](https://git-scm.com/docs/git-rev-parse): Git common directoryの確認。
- [OpenSpec delta format](https://github.com/Fission-AI/OpenSpec/blob/main/docs/getting-started.md): requirement / scenarioの形式。
