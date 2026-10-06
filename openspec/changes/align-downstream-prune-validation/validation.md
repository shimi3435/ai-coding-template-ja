# 検証計画

文書種別: 検証リファレンス。ここに列挙する実動作はすべて実装後の予定であり、現時点では未検証。
文書作成時の実行結果は tasks.md の証跡だけを参照する。

## 検証ケース

| ID | 対応要件 | 対象と反証条件 |
| --- | --- | --- |
| V01 | DPV-1,2 | fresh と rename 後の使い捨て Git repository で setup、正式 gate、doctor、保守 gate。Node 24 / Python >=3.14 の CI parity を最初の slice で確認する |
| V02 | DPV-1,2,3,6 | preview → apply → 正式 gate → doctor → 再apply。その後 prune 差分を commit した状態でも gate と再apply。setup 再実行も確認する |
| V03 | DPV-1 | 単一行の有効な別版は受理、欠落・空・複数行・既存形式外は拒否。版の値自体は prune 前後不変 |
| V04 | DPV-1 | prune 前後それぞれで remote 本文/lock、legal、Skill link の破損を検出。local 本文は構造・legal を保つ変更なら内容 lock を要求しない |
| V05 | DPV-2 | 同梱側の保守 gate 欠落・内容不正は拒否、完全除去後の gate 不在は正常。通常 gate は保守意味検証を行わず、通常 collection に M16〜M18 を混入させない。residual contract は M03 / M08 の exact path token だけを許可し、他の旧名称残存は拒否 |
| V06 | DPV-3 | design §3.1 の D / M / S / K 全行を使用し、M01〜M19 の各1件欠落・空・誤型を拒否。R01〜R06 の許可所在外の直接参照、旧文書だけの prune は拒否。手動の完全除去は受理 |
| V07 | DPV-4 | 引数なし・help の bytes / mode / index 無変更、Git 不在 preview の計画表示と非ゼロ、未知・重複引数、別 cwd、安定した表示順 |
| V08 | DPV-5 | 対象内 staged / unstaged / conflict / rename / mode 差分、untracked / ignored を各々拒否。assume-unchanged / skip-worktree で隠れた実体差分も拒否。対象外の同種差分は保持。共有ファイル区画外の未コミット変更も拒否 |
| V09 | DPV-5 | Git 不在、HEAD 不在、bare、外側 repository だけの管理を拒否。通常 clone と linked worktree を受理。追跡済みの対象のみ変更 |
| V10 | DPV-5 | 対象 / 祖先 / 子孫の内外向き symlink、dangling symlink、特殊 file、submodule、入れ子 Git を拒否し、外部 sentinel が不変 |
| V11 | DPV-3,5 | コミット済み共有カスタマイズの区画外 bytes・CRLF・コメントを保持。duplicate key / marker、欠落・逆順区画、不正構文、R01〜R06 の専用参照と JSON / 説明の対照例を変更前に検査 |
| V12 | DPV-6 | 最初の変更前・共有編集後・削除途中・最終検査の失敗注入。終了値、部分状態、対象外不変、再実行の拒否、対象限定復旧後の成功を確認 |
| V13 | DPV-3,5,6 | preview 後と書込み前の入力変更、強制中断後の混在状態と完全除去状態、kill 時の一時物残存を正常不在として隠さないこと |
| V14 | DPV-1,2,4 | dependency 準備済みで空 HOME / host 設定と通信遮断を使い、通常 gate・prune が host / 認証 / network を要求しない。upstream code を実行しない |
| V15 | DPV-1,2,3 | CI / ローカルの入口一致、prune 後の専用 workflow 不在・共通 workflow 保持・R01〜R06 の対応する直接参照なし、自己再帰なし。リンク移設は design §2 の許可 destination 以外の bytes 不変と link 解決を確認 |
| V16 | DPV-4,5,6 | 空白・改行・Unicode path と表示 escaping、CRLF、1件 / 複数件、走査・読取・書込 resource error の非ゼロと対象外不変 |

各ケースは「機能を外せば pass する」だけでなく、残る機能の意図した負例が fail することを確認する。
V01/V02/V14 は実コマンドの disposable repository smoke、V06〜V13/V16 は隔離 filesystem / Git
fixture と失敗注入、V03〜V05/V15 は focused tests と実 gate の組合せを使う。
固定 path ごとの欠落ケースはパラメータ化する。I/O 中心なので Hypothesis を必須にしない。
純粋な区画編集については、区画外不変・同じ入力で同じ plan の property を追加できる。

## V05 / V15: residual contract と close 順序

Task 1 で design §2 の限定変更を実装し、次の正例・負例を確認する。

- active change の manifest と実装の固定定義にある M03 / M08 の exact path token を許可する。
  token の両端について、入力端と列挙した区切り文字をパラメータ化する。
- basename だけ、別 prefix / suffix、旧名称単独・旧機能案内・呼出は拒否する。
  許可 token と不許可の旧名称を同じ行・同じファイルに混在させても拒否する。
- 新しい追跡ファイル名や symlink target には本文の token 例外を適用しない。
  既存の歴史ファイル allowlist を増やさず、OpenSpec 全体や特定文書の除外を導入しない。
- 現行 policy と撤去済み公開操作の回帰検証を通常側に残す。
  保守側に移す residual contract の成功だけで専用実行参照検査の成功を代用しない。
- Task 5 では本 change が存在する checkout で正式 gate と保守 gate を成功させる。
  close 後だけ成功する状態は未完了とし、Task 6 へ進めない。

## V06: manifest を基準にした欠落検証

design §3.1 の ID / exact path をテスト入力の正本とする。
現存 tree のファイル一覧を期待集合として再利用してはならない。

- D01〜D04: 各 directory の欠落・file 化・symlink 化を拒否する。
- M01〜M19: 正常 fixture から各1件ずつ除去して同梱不成立を確認する。
  各 path の空 file / directory 化 / dangling symlink も拒否する。
- S01〜S03: 共有ファイルは保持し、task / marker pair の全除去だけで正常な完全除去へ遷移する。
  個別欠落、重複、片側 marker と専用 gate だけの削除は不整合とする。
- K01〜K08: 同梱 / 完全除去の両方で保持する。prune が bytes・type を変更しないことを確認する。
- manifest 外の tracked 通常ファイルを削除 subtree に追加した場合は、同梱を壊さず preview に含める。
  これを必須集合へ自動昇格させず、untracked / ignored の場合は V08 で拒否する。

## V06 / V11 / V15: 直接参照の surface 別検証

新しい負例は design K05 の JSON に集約する。各 surface について少なくとも次の組を用意し、
許可所在の外に配置した「検出」例を、同梱 / 完全除去の両方で拒否する。
同じ例を S01 / S02 / S03 または削除 subtree の許可所在へ置く場合は、同梱状態で許可し、
apply 後にはその所在ごと消えることを確認する。通常テストの source も検査から外さない。

| surface | 検出する例 | 誤検出しない対照・境界 |
| --- | --- | --- |
| R01 Taskfile | `task: check:template`、string / cmd 本文の `task check:template` | comment / desc の説明、`check:template-extra`。重複 key は構文拒否 |
| R02 package scripts | `scripts` の `task check:template`、`pytest template-maintenance/tests` | description field の同じ文字列、無関係な script |
| R03 workflow | `run: task check:template`、local `uses`、working-directory、対象を指定する with.path / paths filter | name / env の説明、外部 uses、汎用 glob。列挙した path field を各々パラメータ化 |
| R04 shell | `task check:template`、`python template-maintenance/check.py`、quoted 引数、`bash -c` の literal 本文 | comment、echo / printf、here-document payload。変数 task 名は保証対象外として成功表示の限界を確認 |
| R04 Python | `subprocess.run(["task", "check:template"])`、`open("docs/template/release.md")`、literal importlib path | 単なる文字列・docstring・exists、write-only open。標準 import alias と root 定数の path 連結も検出 |
| R05 TS / JS | static / literal dynamic import、require、literal child_process 呼出、readFileSync の対象 path | データ文字列、comment、existsSync。任意 wrapper / 文字列結合による動的参照は保証対象外 |
| R05 通常 tests | pytest file 内の直接 subprocess / read、Node test 内の import / command | fixture JSON を読み出す通常 test は対象外にしない。同 JSON 内の payload だけは再解析しない |
| R06 Markdown | shell fence、inline `task check:template`、local inline / reference-style link と image | prose、path / task 名だけの code span、comment、外部 URL、fragment-only link |

V11 では同じ参照を marker 外へ移す・重複させる・専用区画だけ欠落させる例も確認する。
参照検出は実際に削除する前に失敗し、source path・位置・surface ID を示す。
V15 では prune 後の全 R01〜R06 に対し同じ検査を行い、専用 workflow の不在と共通 workflow の保持を確認する。
相対 import / Markdown link、`./` / `..`、percent-encoded Markdown path、prefix が似た別 path、
通常 tests の executable import を対にして、path 解決規則の一致も確認する。
動的参照を含む fixture では外部 command が実行されないことと、完全な依存解消を保証する文言が出ないことを確認する。

## V06 / V11: effective cwd と未対応入力

以下は K05 の R01 / R03 と C 規則のケースに接続する。cwd エラーは `unsupported-cwd` とする。

- R03 の workflow / job / step に `scripts` を個別指定し、
  `python ../template-maintenance/tests/test_release_contract.py` を検出する。
  全設定を同時指定する場合も、step > job > workflow の優先順位を確認する。
  下位の `docs` と上位の `scripts` を連結して解決しない。
- 設定なしでは root 基準を使い、R01 の literal `dir: scripts` でも同じ参照を検出する。
  対照として cwd を fixture の `docs/reference` にすると、同じ引数は
  `docs/template-maintenance/...` へ解決され、専用参照には該当しない。
- R01 の各 task は自身の dir を使用し、呼出元の dir を継承しない。
  R03 の `uses` / filter / `with` の path に run の cwd を適用しない。
- cwd の省略、空・null・非 string、変数・式、外部 path、欠落 directory、symlink を対にする。
  不正な下位 field が上位で上書きされても拒否する。空白・Unicode を含む有効な cwd は保持する。
- `cd scripts && python ../template-maintenance/tests/test_release_contract.py`、
  `pushd` / `popd`、関数・subshell 内の移動、literal な `bash -c` 内の移動は拒否する。
  comment・echo 引数・JSON payload の同名文字列は誤検出しない。
- R04 の scripts 直下で、design §3.2 の2種類の root 初期化を LF / CRLF の各々で受理する。
  現行4 script の初期化がこの条件を満たすことも確認し、ファイル名だけの許可を作らない。
  scripts 直下の別名 source でも同じ2行を受理し、元の名前でも構文を変えれば拒否する。
  初期化後に専用呼出を加えれば `detected`、前後に別の移動を加えれば `unsupported-cwd` とする。
  変数・移動先の変更、2行間への代入挿入、重複、関数 / subshell 内、子 directory の同形、
  他 surface の同形を対照として拒否する。K05 内の payload 自体は再解析・実行しない。
- cwd エラーは同梱 / 完全除去のどちらでも gate / doctor / preview / apply が拒否し、
  source の位置と理由を示す。対象・対象外 bytes / mode / Git index が不変であることを確認する。
  root への fallback、変数の実行評価、対象の部分削除が起きないことを確認する。

## V15: 履歴リンクの修正範囲

移設時の focused 確認では、M01〜M15 の編集前 snapshot と編集後を比較する。
design §2 の許可表に列挙した destination の byte 範囲だけを比較から除外し、
その他の本文・判断・見出し・label・title・fragment・空白・改行が一致することを確認する。
今回の許可表は M15 の1件だけである。label 改変・本文追記・別リンクの書換えを許可差分に含めない。
修正後の link target が K01 へ解決することも確認する。

これは移設作業の before / after diff 確認であり、通常 CI に過去 commit や削除予定 snapshot を要求しない。
恒久の保守テストは現行履歴の契約とリンク解決を検証する。close 時の retrospective の新しい1行は
別 diff とし、過去行不変を確認する。失敗例は専用 fixture で対象範囲の判定を検証できる場合に追加し、
文書移設のためだけの汎用 rewrite tool は作らない。

## 実行順序

1. 実装開始後、最初の slice で V01 の fresh と対象 focused tests を実行し、CI runtime と整合を確認する。
2. 状態・preview・apply の focused tests を順に実装し、V02 と V12 の実動作を早期に確認する。
3. 残る V01〜V16 を完了し、OSWF-5 の self-review / independent review / fix を行う。
4. 最新入力の `./scripts/check.sh`、`task check:template`、
   `openspec validate align-downstream-prune-validation --strict --no-interactive`、
   `task openspec:validate` を実行する。
5. initial reviewer と別の独立 verifier が実装と evidence を確認する。
   hosted CI は別途実行結果を確認し、ローカル成功で代用しない。
6. close 時は policy に従う retrospective と cleanup 後、影響する検証を再実行する。

## 実行環境と安全性

setup は既存どおり dependency 取得を許す。offline 性は setup 後の gate / prune を対象にする。
統合 fixture では自身が作成した Git repository だけを commit し、実際の作業 repository を
reset / clean / prune しない。rename による変更と prune 対象の差分保護を混同しないよう、
使い捨て repository では rename 後の状態を commit した経路と対象外 dirty の経路を別々に検証する。

保守 gate の smoke からは通常 gate だけを呼び出す。通常 tests にフル保守 smoke を置かない。
Windows / DrvFS、敵対的同時変更への sandbox 保証、任意の巨大入力への資源保証は対象外。
通信遮断、disk / permission error は制御可能な fixture を使い、認証情報や host 実設定を読み書きしない。
