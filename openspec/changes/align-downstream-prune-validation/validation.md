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
| V05 | DPV-2 | 正常な保守 gate、release 内容の欠損による失敗、通常 gate が同じ内容変更を保守エラーにしないこと、通常 collection に保守 tests が含まれないこと |
| V06 | DPV-3 | 固定必須 path の各1件欠落、空文書、誤型、残存専用 task / workflow / 区画、空ディレクトリ、旧文書だけの prune を拒否。手動の完全除去は受理 |
| V07 | DPV-4 | 引数なし・help の bytes / mode / index 無変更、Git 不在 preview の計画表示と非ゼロ、未知・重複引数、別 cwd、安定した表示順 |
| V08 | DPV-5 | 対象内 staged / unstaged / conflict / rename / mode 差分、untracked / ignored を各々拒否。assume-unchanged / skip-worktree で隠れた実体差分も拒否。対象外の同種差分は保持。共有ファイル区画外の未コミット変更も拒否 |
| V09 | DPV-5 | Git 不在、HEAD 不在、bare、外側 repository だけの管理を拒否。通常 clone と linked worktree を受理。追跡済みの対象のみ変更 |
| V10 | DPV-5 | 対象 / 祖先 / 子孫の内外向き symlink、dangling symlink、特殊 file、submodule、入れ子 Git を拒否し、外部 sentinel が不変 |
| V11 | DPV-5 | コミット済み共有カスタマイズの区画外 bytes・CRLF・コメントを保持。duplicate key / marker、欠落・逆順区画、不正構文、区画外専用参照は変更前に拒否 |
| V12 | DPV-6 | 最初の変更前・共有編集後・削除途中・最終検査の失敗注入。終了値、部分状態、対象外不変、再実行の拒否、対象限定復旧後の成功を確認 |
| V13 | DPV-3,5,6 | preview 後と書込み前の入力変更、強制中断後の混在状態と完全除去状態、kill 時の一時物残存を正常不在として隠さないこと |
| V14 | DPV-1,2,4 | dependency 準備済みで空 HOME / host 設定と通信遮断を使い、通常 gate・prune が host / 認証 / network を要求しない。upstream code を実行しない |
| V15 | DPV-1,2 | 共通 CI / ローカルと保守 CI / ローカルの入口一致、prune 後の専用 workflow 不在、共通 workflow 保持、自己再帰なし、下流文書リンク解決と履歴本文不変 |
| V16 | DPV-4,5,6 | 空白・改行・Unicode path と表示 escaping、CRLF、1件 / 複数件、走査・読取・書込 resource error の非ゼロと対象外不変 |

各ケースは「機能を外せば pass する」だけでなく、残る機能の意図した負例が fail することを確認する。
V01/V02/V14 は実コマンドの disposable repository smoke、V06〜V13/V16 は隔離 filesystem / Git
fixture と失敗注入、V03〜V05/V15 は focused tests と実 gate の組合せを使う。
固定 path ごとの欠落ケースはパラメータ化する。I/O 中心なので Hypothesis を必須にしない。
純粋な区画編集については、区画外不変・同じ入力で同じ plan の property を追加できる。

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
