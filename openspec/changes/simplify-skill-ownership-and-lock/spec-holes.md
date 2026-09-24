# 仕様の穴と検証対応

文書種別: 仕様監査リファレンス。spec-holesフェーズ1として、全8要件に12分類を順番に適用した。
各行の仕様はproposal / design / schema / interfaces / spec deltaと一体で解釈する。
「1」は振る舞いを明記、「2」は保証対象外を明記する解決方法を表す。未解決判断の黙殺はしない。
数値はsize・count・limitだけに使い、乱数・浮動小数点の計算結果・dataframeを扱わない。

検証欄は[validation.md](validation.md)の例示test群と実装後の対応先を参照する。
実行結果と未検証事項は[tasks.md](tasks.md)を正本とする。文書段階の成功を実装検証へ流用しない。

## R1

| # | 分類 | 判断 | 穴と確定した振る舞い | 潰し方 | 検証群 |
| --- | --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | 空source / remote 0件を許可。欠損file / nullは拒否する。 | 1 | V1 |
| 2 | 境界値 | 該当 | source 500件、metadata 10 MiBを含め上限ちょうどを受理し、超過を拒否する。 | 1 | V1 |
| 3 | 重複・衝突 | 該当 | JSON重複key、name、case-fold target衝突、orphanを拒否する。 | 1 | V1 |
| 4 | 順序 | 該当 | 入力順に依存せずUTF-8 byte順へ整列する。 | 1 | V1 |
| 5 | 型・形式不正 | 該当 | v2の既知field / ownership / ref型だけ受理する。 | 1 | V1 |
| 6 | エラー経路 | 該当 | decode不正・対象外の対応不一致は停止。schema.mdの限定中間状態だけ操作別に検査し、最後は全体一致を要求する。 | 1 | V1 |
| 7 | 冪等性・再実行 | 該当 | 同値serializeは同じbytesとなり、local内容lockを再生成しない。 | 1 | V1 |
| 8 | 時刻・タイムゾーン | 非該当 | 日時field・有効期限・時刻順序を持たない。 | — | —（適用理由なし） |
| 9 | 文字列 | 該当 | NFC / path規則を適用し、空白だけの値・不正encodingを拒否する。 | 1 | V1 |
| 10 | 数値 | 該当 | schemaVersionを厳密判定し、集計値は非負safe integerだけ受理する。 | 1 | V1 |
| 11 | 巨大入力・リソース枯渇 | 該当 | metadata bytesとentry数を検査してから各宣言を処理する。 | 1 | V1 |
| 12 | 状態遷移の未定義パス | 該当 | local / plugin lockの新規生成、通常CLIによる旧形式受理を拒否する。license / mapping構造変更は指名repinだけ受理し、旧lockと新sourceを別検証する。 | 1 | V1 |

## R2

| # | 分類 | 判断 | 穴と確定した振る舞い | 潰し方 | 検証群 |
| --- | --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | remote / localともrootの通常file SKILL.md exactly oneと非空descriptionを必須とする。remote 0件でもlocalの構造・identity・legal・linksを検証する。 | 1 | V2 |
| 2 | 境界値 | 該当 | 既存filesystemのentry / depth / path / file上限を維持する。 | 1 | V2 |
| 3 | 重複・衝突 | 該当 | path / ASCII case-fold衝突、legal target衝突を拒否する。 | 1 | V2 |
| 4 | 順序 | 該当 | tree-v1のUTF-8 path順とbinary構成を維持する。 | 1 | V2 |
| 5 | 型・形式不正 | 該当 | regular file以外、不正mode / hash / countに加え、SKILL.mdの不正UTF-8 / frontmatter / YAML・重複key・alias・name不一致・description欠落を拒否する。 | 1 | V2 |
| 6 | エラー経路 | 該当 | 一つでも検証不一致ならexit 1。networkによる自動修復をしない。 | 1 | V2 |
| 7 | 冪等性・再実行 | 該当 | 繰返しverifyは書込み0、同じ判定を返す。 | 1 | V2 |
| 8 | 時刻・タイムゾーン | 非該当 | mtimeや日時を内容hashへ含めない。 | — | —（適用理由なし） |
| 9 | 文字列 | 該当 | 本文bytesは正規化しない。pathだけNFCを要求する。SKILL.mdは現行parserのBOM / CRLF / 追加metadata key受理を維持する。 | 1 | V2 |
| 10 | 数値 | 該当 | fileCount / byteCountはsafe integerとし、hash前にoverflowを拒否する。 | 1 | V2 |
| 11 | 巨大入力・リソース枯渇 | 該当 | bounded traversalとfile上限を維持し、超過で停止する。 | 1 | V2 |
| 12 | 状態遷移の未定義パス | 該当 | 構造・identityが有効なlocal本文差分は許可し、local legal / remote本文差分は拒否する。 | 1 | V2 |

## R3

| # | 分類 | 判断 | 穴と確定した振る舞い | 潰し方 | 検証群 |
| --- | --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | 空cohortを取得しない。選択subtree / SKILL.md / legal欠落を拒否する。 | 1 | V3 |
| 2 | 境界値 | 該当 | file / Skill / cohort上限はNを受理、N+1を本文取得前に拒否する。 | 1 | V3 |
| 3 | 重複・衝突 | 該当 | 取得元重複と配置先重複を分け、異なる本文のlegal衝突を拒否する。 | 1 | V3 |
| 4 | 順序 | 該当 | cohort内の全metadata検査を当該cohortの選択blob取得より前に完了する。 | 1 | V3 |
| 5 | 型・形式不正 | 該当 | truncated、特殊mode、size欠落、応答型不正、blob integrity不一致を拒否する。取得後にR2のSKILL.md構造・identityを検証する。 | 1 | V3 |
| 6 | エラー経路 | 該当 | API / timeout / rate-limit / legal不一致は全体失敗とし、secretをredactする。 | 1 | V3 |
| 7 | 冪等性・再実行 | 該当 | 自動resumeなし。同じ固定入力は同じtreeになる。 | 1 | V3 |
| 8 | 時刻・タイムゾーン | 該当 | 各gh呼出60秒のtimeoutを設け、wall-clock日時やtimezoneを固定結果に使わない。 | 1 | V3 |
| 9 | 文字列 | 該当 | refはURL pathへ正しくencodeし、本文はbytesとして照合する。 | 1 | V3 |
| 10 | 数値 | 該当 | sizeの負数・NaN・Infinity・非safe integerと合計overflowを拒否する。 | 1 | V3 |
| 11 | 巨大入力・リソース枯渇 | 該当 | 64 MiBの子process出力上限を維持。通信全量の厳密上限とは呼ばない。 | 1 | V3 |
| 12 | 状態遷移の未定義パス | 該当 | 不完全metadataからのblob取得、Skill script実行、private / 別forge保証は行わない。 | 1 / 2 | V3 |

## R4

| # | 分類 | 判断 | 穴と確定した振る舞い | 潰し方 | 検証群 |
| --- | --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | 空ref / 承認SHA欠落を拒否し、tag削除も停止する。 | 1 | V4 |
| 2 | 境界値 | 該当 | 40桁SHAを要求。tag解決は32段以内にcommitへ到達する。 | 1 | V4 |
| 3 | 重複・衝突 | 該当 | branch / tag / commitの複数同時指定を拒否し、曖昧なref解決を行わない。 | 1 | V4 |
| 4 | 順序 | 該当 | 履歴・tag固定の確認後に取得し、repin承認値を再照合する。 | 1 | V4 |
| 5 | 型・形式不正 | 該当 | 非commit終端・循環tag・不明object type・不正refを拒否する。 | 1 | V4 |
| 6 | エラー経路 | 該当 | 履歴不明、非FF、tag移動 / 削除、承認値不一致を停止する。 | 1 | V4 |
| 7 | 冪等性・再実行 | 該当 | 固定先・policy・legal・配置結果まで同じ場合だけ無変更成功。同commitでもpolicy / legal差分は適用し、本文同一でも新commitならlockを進める。 | 1 | V4 |
| 8 | 時刻・タイムゾーン | 非該当 | tag選択や履歴を日時順に判定しない。 | — | —（適用理由なし） |
| 9 | 文字列 | 該当 | ref名を暗黙trim・SemVer解釈せず、Git ref名として検証する。 | 1 | V4 |
| 10 | 数値 | 非該当 | version数値比較を廃止し、SHAは文字列として扱う。 | — | —（適用理由なし） |
| 11 | 巨大入力・リソース枯渇 | 該当 | tag循環 / 深さ上限でAPI呼出をboundedにする。 | 1 | V4 |
| 12 | 状態遷移の未定義パス | 該当 | 指名repinだけ対象repo / ref / subtree / license / legalMappings変更を許容し、旧本文・legalは旧lock、新取得物は新sourceで別検証する。別名の変更・包括forceは拒否する。 | 1 | V4 |

## R5

| # | 分類 | 判断 | 穴と確定した振る舞い | 潰し方 | 検証群 |
| --- | --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | 名前欠落・未知対象・出典欠落・legal欠落を拒否する。 | 1 | V5 |
| 2 | 境界値 | 該当 | 保持するtree / legal / pathは既存の安全上限を検証する。 | 1 | V5 |
| 3 | 重複・衝突 | 該当 | origin / source / lockの対応とlocal legal path重複を確認する。 | 1 | V5 |
| 4 | 順序 | 該当 | 必要出典とlegalを確認してからremote lockを除去する。 | 1 | V5 |
| 5 | 型・形式不正 | 該当 | remote以外を外部由来と捏造せず、origin構造不正を拒否する。 | 1 | V5 |
| 6 | エラー経路 | 該当 | 本文不一致は明示切替だけで許可し、legal不一致・R2のSKILL.md構造 / identity不正は停止する。 | 1 | V5 |
| 7 | 冪等性・再実行 | 該当 | 同じoriginを持つlocal再指定は検証して無変更成功。 | 1 | V5 |
| 8 | 時刻・タイムゾーン | 非該当 | 切替日時を出典の識別に使わない。 | — | —（適用理由なし） |
| 9 | 文字列 | 該当 | 本文bytes / 実行bitと既存pathを保持し、出典文字列を勝手に補完しない。 | 1 | V5 |
| 10 | 数値 | 非該当 | local本文の件数・bytes・hashをlock値として更新しない。 | — | —（適用理由なし） |
| 11 | 巨大入力・リソース枯渇 | 該当 | 特殊fileや危険pathを本文保持の理由で検査除外しない。 | 1 | V5 |
| 12 | 状態遷移の未定義パス | 該当 | local→remote自動復帰、upstream自動merge、origin自動削除は対象外。 | 1 / 2 | V5 |

## R6

| # | 分類 | 判断 | 穴と確定した振る舞い | 潰し方 | 検証群 |
| --- | --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | 隔離更新操作ではsource / base / candidate欠落、候補未作成を拒否する。linksには要求しない。 | 1 | V6 |
| 2 | 境界値 | 該当 | source / candidate root一致・包含、開始commit不一致を拒否する。 | 1 | V6 |
| 3 | 重複・衝突 | 該当 | 共有Git領域 / alternates / hardlink / path aliasによる共有を拒否する。 | 1 | V6 |
| 4 | 順序 | 該当 | 候補preflight→全取得検査→書込み→最終verifyの順とする。 | 1 | V6 |
| 5 | 型・形式不正 | 該当 | bare / linked worktree / 非repository / Git環境差替え / dirty候補を拒否する。 | 1 | V6 |
| 6 | エラー経路 | 該当 | ENOSPC相当・例外・killで候補だけに部分状態を許し、元を保護する。 | 1 | V6 |
| 7 | 冪等性・再実行 | 該当 | 失敗候補を再利用せず新cloneから再実行する。成功候補もcommitして新しい開始点にする。 | 1 | V6 |
| 8 | 時刻・タイムゾーン | 非該当 | 元不変をmtime比較だけで証明しない。lease / journalの有効期限は設けない。 | — | —（適用理由なし） |
| 9 | 文字列 | 該当 | realpathと境界で検証し、似たprefixやUnicode名だけで包含判定しない。 | 1 | V6 |
| 10 | 数値 | 非該当 | 候補IDや連番で保護境界を判定しない。 | — | —（適用理由なし） |
| 11 | 巨大入力・リソース枯渇 | 該当 | 容量不足時は失敗し、元側へ退避書込み・rollbackしない。 | 1 | V6 |
| 12 | 状態遷移の未定義パス | 該当 | 同一候補の並行writerを禁止し、観測した入力変化は停止する。OS sandbox保証は対象外。WSLはsource・candidate・Git metadataがLinux filesystem上の場合だけ保証し、DrvFSを含めない。 | 1 / 2 | V6 |

## R7

| # | 分類 | 判断 | 穴と確定した振る舞い | 潰し方 | 検証群 |
| --- | --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | source / lock片方欠落を拒否する。local / pluginのみの有効v1は移行できる。 | 1 | V7 |
| 2 | 境界値 | 該当 | v1のmetadata / tree上限を確認し、v2の上限を緩めて通さない。 | 1 | V7 |
| 3 | 重複・衝突 | 該当 | localize名重複 / 未知名 / 非remote指定、宣言重複・不一致を拒否する。 | 1 | V7 |
| 4 | 順序 | 該当 | 全入力を確認し、出典を保存してからlocal / plugin lockを除去する。 | 1 | V7 |
| 5 | 型・形式不正 | 該当 | v1一組かv2一組だけ受理。未知version・混在・旧field不足は停止する。 | 1 | V7 |
| 6 | エラー経路 | 該当 | legal不一致・未指定remote本文不一致・出力失敗に加え、localize指定でもR2のSKILL.md構造 / identity不正を停止する。 | 1 | V7 |
| 7 | 冪等性・再実行 | 該当 | v2は検証して無変更成功。部分候補は新cloneから再作成する。 | 1 | V7 |
| 8 | 時刻・タイムゾーン | 非該当 | 最新tagや現在日時に基づく移行をしない。 | — | —（適用理由なし） |
| 9 | 文字列 | 該当 | 旧SemVer範囲 / 選択tag / versionの文字列と本文bytesを保持する。 | 1 | V7 |
| 10 | 数値 | 該当 | 旧resolvedCommitは文字列の完全SHA。count / bytesと内容hashは照合して保持する。 | 1 | V7 |
| 11 | 巨大入力・リソース枯渇 | 該当 | offlineでも既存上限を維持し、巨大legacy入力でfallbackをしない。 | 1 | V7 |
| 12 | 状態遷移の未定義パス | 該当 | 本文不一致の自動local化、通常CLIの旧形式自動移行を禁止する。 | 1 | V7 |

## R8

| # | 分類 | 判断 | 穴と確定した振る舞い | 潰し方 | 検証群 |
| --- | --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | 操作別の必須引数欠落はexit 1。更新対象remote 0件・変更0件は検査して無変更成功する。linksは候補引数不要でlocalのlinkも修復する。 | 1 | V8 |
| 2 | 境界値 | 該当 | exit 0 / 1 / 3の用途を限定し、終了code 3を成功扱いでapplyへ進めない。 | 1 | V8 |
| 3 | 重複・衝突 | 該当 | 重複単一引数・相反指定・同じlocalize名を拒否する。linksは全対象の非symlink衝突・親path逸脱を全書込み前に拒否する。 | 1 | V8 |
| 4 | 順序 | 該当 | 隔離更新はapply成功→verify→task check→差分review→commit / push / PRの順とする。linksは現在checkoutで全対象preflight→直接修復→link検証とする。 | 1 | V8 |
| 5 | 型・形式不正 | 該当 | 未知command / flag、legacy route、JSON出力形式不正を拒否する。 | 1 | V8 |
| 6 | エラー経路 | 該当 | 一部cohort失敗でも全体failed。後続PR段階へ自動進行しない。 | 1 | V8 |
| 7 | 冪等性・再実行 | 該当 | 隔離更新のpreviewは書込み0、再実行はR6 / R7の条件に従う。linksは既定で直接修復し、I/O途中失敗後も同じcheckoutで冪等に再実行できる。 | 1 | V8 |
| 8 | 時刻・タイムゾーン | 非該当 | scheduler、期限、時刻による自動PR条件を設けない。 | — | —（適用理由なし） |
| 9 | 文字列 | 該当 | JSONを安定serializeし、診断のsecretをredactする。 | 1 | V8 |
| 10 | 数値 | 該当 | exit code以外の進捗率・成功件数を全体成功の代理にしない。 | 1 | V8 |
| 11 | 巨大入力・リソース枯渇 | 該当 | 診断にblob本文やsecretを出力せず、失敗時に巨大reportを必須生成しない。 | 1 | V8 |
| 12 | 状態遷移の未定義パス | 該当 | 文書pushと実装完了を区別し、未実装taskを完了扱いしない。 | 1 | V8 |
