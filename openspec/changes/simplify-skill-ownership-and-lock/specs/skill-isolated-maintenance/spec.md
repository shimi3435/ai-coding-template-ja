## ADDED Requirements

### Requirement: R6 元repositoryを変更しない隔離書込み
システムはSHALL、元repository・完全な開始commit・独立候補cloneを明示入力とし、書込みを検査済み候補だけへ限定する。

開始commitのtracked snapshotを読み、元の未コミット変更を含めない。
同一または包含するroot、共有Git common directory、alternates、候補HEAD不一致、
dirtyな候補、管理対象内のuntracked / ignored衝突、symlink / hardlinkによる書込み逸脱を拒否する。
元のworking tree・index・refs・設定を変更しない。
候補に依存導入物があること自体は許容するが、管理対象の差分を上書きしない。
書込み直前に観測可能な入力変更を再確認する。同一候補の並行writerは保証対象外であり手順で禁止する。
独立cloneをOS sandboxとは説明しない。

全取得・検査後に候補へ適用し、最終offline検証の成功後だけappliedを返す。
書込み途中の失敗・中断では候補の部分状態を許すが元へ波及させず、候補を診断用に残す。
再実行は新しいcloneから行い、途中再開・rollback・候補管理サービスを提供しない。
旧transactionはこの保護境界を実証してから撤去する。

#### Scenario: 元コピーに未コミット編集がある
- **WHEN** 開始commitから作成したcleanな独立候補へ更新する
- **THEN** 元の編集・index・refs・設定を保持し、commitに含まれない編集を候補へコピーしない

#### Scenario: 分離を証明できない候補
- **WHEN** linked worktree、同じroot、包含root、共有object、差替えpath、HEAD不一致を指定する
- **THEN** 候補本文の書込み前に失敗し、元repositoryを変更しない

#### Scenario: 書込み途中の失敗と再実行
- **WHEN** 候補本文またはmetadataの書込みで例外・容量不足・強制中断が起きる
- **THEN** 元snapshotは不変で、失敗候補をPRへ進めず、新しいcloneで最初から再実行する

### Requirement: R7 固定先と編集を保つoffline移行
システムはSHALL、v1 source / lockを移行専用処理で一度だけv2へ変換し、固定commit・本文・出典・legal・利用者編集を保持する。

移行はnetworkを使わず、通常CLIに旧形式decoderを混在させない。
remoteの固定commitとcanonical集計を検証・保持し、SemVerはlockのcommitへ固定して旧選択情報を履歴に残す。
local本文hashだけを除去し、pluginは一致する宣言だけをsourceに残す。
本文不一致remoteは明示されたlocalize対象だけを本文保持でlocal化する。
source / lock / legalの不整合を明示指定で迂回しない。
移行用codeとfixtureは配布に含め、削除予定changeや到達不能Git履歴へ依存しない。
v2同士は検証して無変更成功、旧新混在・欠損・未知versionは停止する。
失敗・中断した部分移行候補はR6の手順で破棄・再作成する。

#### Scenario: v1の固定済みSemVerとlocal / plugin
- **WHEN** 正しいv1 metadataと実体をoffline移行する
- **THEN** remoteのresolvedCommitを保持し、SemVer探索をせず、local本文とplugin宣言を失わない

#### Scenario: 編集済みremoteを名前指定する
- **WHEN** v1本文不一致remoteをlocalizeに指定し、出典・legalは整合する
- **THEN** 元の本文bytesを保持した外部由来localへ移行する。未指定の不一致remoteは停止する

#### Scenario: 移行済みまたは部分状態
- **WHEN** 有効なv2同士を再入力する、またはv1 / v2混在を入力する
- **THEN** 前者は無変更成功し、後者は推測で完成させず失敗する

### Requirement: R8 公開操作と検証済み候補の引渡し
システムはSHALL、[interfaces.md](../../interfaces.md)のcommand・引数・出力・終了コードと、短絡停止する標準ツール手順を提供する。

既定previewは書込みを行わず、applyだけが検査済み候補を書き換える。
clone作成・破棄・push・PRは標準Git / ghの人起点操作とし、専用管理CLI・自動PRを提供しない。
一つでも対象が失敗した場合は操作全体をfailedとする。
apply成功、最終offline verify、task check、差分レビューのすべてを通過した候補だけを通常PRへ進める。
candidateの存在、一時report、部分的verify成功を完了証拠にしない。
実装時の実体・metadata・CLI / task・tests・CI・文書の移行は同じchangeで整合させる。
review / verifierとcloseはAGENTS.mdのOSWF-5およびproject workflowに従う。

#### Scenario: 不正引数とpreview
- **WHEN** 必須の候補指定を欠く、未知引数を渡す、または有効なpreviewを行う
- **THEN** 前二者は書込みなしでexit 1、有効previewは書込みなしでexit 0になる

#### Scenario: 一部成功と後続停止
- **WHEN** 複数cohortのうち一つが取得または検査で失敗する
- **THEN** 全体をfailedとし、成功部分だけのcommit / push / PRへ自動で進まない

#### Scenario: 文書作成だけの段階
- **WHEN** 本changeの文書を検証してpushする
- **THEN** 実装・移行・新挙動の実動作確認を完了扱いにせず、実装tasksとchangeを未完了のまま保持する
