# 設計

## 決定済み方針

1. 共有編集対象の regular file に st_nlink > 1 があれば拒否する。削除専用 file の unlink は他の hardlink の内容・inode を変えないため許容する。snapshot の取得を通じて各操作直前にも検査する。既存仕様どおり、非協調 process との完全排他は保証しない。
2. HEAD / index と対象 path 集合の一致を維持する。対象全体の有効な filter / ident / working-tree-encoding 属性を確認し、unset / unspecified 以外は未対応として変換前に拒否する。check-attrの表示が状態名と衝突するliteral filter=unset / filter=unspecifiedは、Gitのコマンド単位設定で両driverをclean/process空・required=trueにして外部コマンドなしで拒否する。全属性の--all出力でunspecified状態（出力なし）とliteralを分ける。working-tree-encodingのunset表示は非空の合成NUL入力で変換診断の有無を確認し、exit 0のstderrも失敗としてtarget bytesの変換前に拒否する。空fileも同じ経路で検査し、filterの無効化を適用する。Git hash-object --stdin --path で snapshot の bytes を改行正規化した blob OID と比較する（-w は使わない）。core.fileMode=false の場合だけ初期 executable bit 比較を省略する。Git の stat cache、assume-unchanged、skip-worktree に差分検出を委ねない。Git status が clean でも実体比較・属性対応範囲・構成検査が失敗すれば拒否する。
3. apply の再確認は生 bytes / mode を比較し、正規化して同時変更を隠さない。区画外 bytes / 改行 / mode、対象外差分、index を保持する。
4. TEMPLATE_VERSION の各要素は 0 または [1-9][0-9]* とする。pre-release / build は対象外。既存の空行除外・非空行1行という扱いは維持し、値の前後空白は拒否する。Python / TypeScript の正規表現を同じ規則にし、共通 JSON ケースを各実入口に入力する。
5. parser は現行の各解析での検証を維持する。テスト側の計測で解析数、artifact 検証数、binary hash 数・bytes・時間、subprocess 起動＋解析時間、走査時間、空入力の起動＋解析時間を測る。重複した時間区間は加算しない。wall-clock の固定閾値はCIに設けない。1281.50秒の主因とは断定しない。

## Open Questions

なし。利用者は上記4方針と通常日本語での文書化を承認済み。

## Spec-holes

各列は要件 H（hardlink）、G（Git）、V（version）、P（計測）への分類の適用を示す。「非」は非該当、理由を併記する。

| # | 分類 | H | G | V | P |
| --- | --- | --- | --- | --- | --- |
| 1 | 空・欠損 | 該当:既存欠落拒否 | 該当:HEADなし拒否 | 該当:空拒否 | 該当:0解析も件数0 |
| 2 | 境界値 | 該当:nlink 1/2 | 該当:mode有効/無効 | 該当:0と先頭0 | 該当:1/N単位 |
| 3 | 重複・衝突 | 該当:同inode共有拒否 | 該当:conflict拒否 | 該当:複数非空行拒否 | 非:集計で識別子衝突なし |
| 4 | 順序 | 該当:全編集前検査 | 該当:属性拒否後hash | 非:固定3要素 | 該当:各scan別集計 |
| 5 | 型・形式不正 | 該当:symlink/特殊file拒否維持 | 該当:未対応属性拒否・filter/encoding状態名literal衝突も拒否 | 該当:ASCII通常版のみ | 該当:解析失敗を隠さない |
| 6 | エラー経路 | 該当:書込み前拒否と既存診断 | 該当:Git失敗で拒否 | 該当:既存診断 | 該当:計測例外時もpatch復元 |
| 7 | 冪等性 | 該当:正常prune再実行維持 | 該当:正常削除差分no-op維持 | 非:純判定 | 該当:計測後の挙動不変 |
| 8 | 時刻・TZ | 非:時刻不使用 | 非:stat cache不使用 | 非:時刻不使用 | 該当:monotonic clock |
| 9 | 文字列 | 非:nlink数値 | 該当:CRLF・Unicode path・NUL区切り・空fileのencoding属性検査 | 該当:Unicode数字拒否・既存空行規則 | 該当:入力を変更しない |
| 10 | 数値 | 該当:nlink整数 | 非:blob OIDは文字列 | 該当:数値型変換せず大整数受理 | 該当:時間非負・加算重複禁止 |
| 11 | 巨大入力 | 非:既存読込み量と同じ | 該当:stdinでsnapshotを送信 | 該当:新しい桁数上限を導入しない | 該当:既存timeout維持・batch最適化対象外 |
| 12 | 状態遷移 | 該当:preview後/途中のlink追加拒否 | 該当:preview後のraw bytes/mode変更拒否 | 該当:両validator一致 | 該当:破損・identity変更拒否維持 |

## 検証対応

- H: disposable fixture の preview/apply、途中link追加、対象外内容・inode、削除専用link、既存symlink/FIFO検査。
- G: autocrlf checkout、text/eol、fileMode、staged/unstaged/untracked、index保持、filter未実行、raw bytes/mode同時変更。
- V: 共通JSONケースを scanner / Node gate に入力し、smokeの規則も更新する。
- P: 計測テストと実repository走査。artifact破損・identity変更・offline性は既存focused/integration testsを再実行する。
- 環境差: ローカルにないlocaleはローカル生成の可否を確認し、実行できなければ未検証として記録する。hosted CIは外部writeが未依頼なので未実行。
