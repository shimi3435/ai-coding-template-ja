# 検証計画

文書種別: 検証リファレンス。V1–V8は実装時の予定であり、現在の成功証拠ではない。
各例示testは既存 `repo-tools/skill-updater-*.test.ts` 群を優先して拡張する。
独立した性質がある場合だけ新fileを追加し、proseの存在だけで動作を検証したとは扱わない。

| 群 | 対象 | 最低限の反証例／観測 |
| --- | --- | --- |
| V1 | R1 | v2 roundtrip、順序不変、0 / 500 / 501件、10 MiB境界、重複key / name / case-fold、未知field / version、orphan、remote 0件、plugin保持 |
| V2 | R2 | 既存tree-v1 golden、path / 実行bit / 本文 / count / bytes / legal / linkの各単独改変、構造・identityが有効なlocal本文編集許可、local legal改変拒否、network遮断verify |
| V3 | R3 | metadataの上限N / N+1、size欠落・負数・非safe integer、truncated、symlink / submodule、path衝突で選択blob呼出0件、blob SHA / size不一致、legal承認不一致、取得後SKILL.md構造・identity拒否、timeout / API失敗 |
| V4 | R4 | branch fast-forward / rewind / divergent、tag移動 / 削除 / 同commit再作成、軽量 / 注釈 / 連鎖 / 循環、repin両SHA不一致、取得中ref変更、本文同一commit更新 |
| V5 | R5 | 改変remoteを明示local化して全本文bytes / mode保持、origin完全保持、legal不一致・SKILL.md構造 / identity不正停止、再指定no-op、自作local捏造・自動remote復帰拒否 |
| V6 | R6 | sourceにdirty / staged / untrackedを置いた実clone実験、root包含 / 共通Git / alternates / hardlink / symlink / HEAD不一致拒否、管理path衝突、途中例外・容量不足・kill後の元本文 / index / refs / 設定不変、新clone再実行 |
| V7 | R7 | fixtureのv1 branch / commit / SemVer / local / plugin一括移行、commit / 集計保持、明示localize、未知 / 重複名、欠損 / 混在 / legal不一致 / SKILL.md構造・identity不正、v2 no-op、network呼出0件 |
| V8 | R8 | 公開CLI引数・exit / JSON、隔離更新preview書込み0、linksの直接修復・衝突事前拒否、local-lock route撤去、一部cohort失敗時の全体失敗、成功候補のtask check、失敗時にPR段階へ到達しない手順seam |

## 実行順と環境

V1 / V4 / V8には、schema.mdの3つの中間状態について次を追加する。
新規remote（lock / targetなし）、legal hash再承認、sourceのrepo / ref / subtree / license / legalMappingsを変更した指名repinの
各入力で、offline verifyは失敗し、該当操作は旧実体・新承認値の検証後に成功することを確認する。
同じ入力を対象外の操作へ渡す場合と、別名の出典・policy・legal不一致を混ぜた場合は拒否する。
license変更（MIT→Apache-2.0）、LICENSEのsourcePath移動、targetPath移動、NOTICE追加・削除を個別fixtureにし、
通常updateの拒否、指名repinの成功、旧legal改変・新legal承認hash不一致・redistribution: blockedの拒否を確認する。
同じcommitでのpolicy / mapping変更もplanned / appliedとなり、最終treeと新lockへ反映されること、
旧mappingだけに由来するfileが残らず、preview / JSONに変更前後のpolicy / mappingが表示されることを確認する。

V2 / V3 / V5 / V7では、root SKILL.md欠落、nestedにしか存在しないSKILL.md、不正UTF-8、frontmatter欠落、
不正YAML・非mapping・重複key・alias、name不一致、description欠落・空文字・空白だけを個別に拒否する。
local内容lockの廃止、adopt-local、migrate --localizeのいずれも迂回路にしない。
有効なBOM / CRLF / 追加metadata key、rootとnested両方のSKILL.mdを受理する互換fixtureも用意する。
V3の本文不正は取得後の検証とし、tree metadataだけで拒否できる例のblob呼出0件と混同しない。

V8では現在checkoutで引数なしのtask skills:linksを実行し、remote 0件でもlocalの欠落・壊れた・誤ったlinkを修復する。
2回目の無変更成功、本文・source・lockと無関係なdirty / staged編集の保持、非symlink衝突・親path逸脱が
後半の対象にある場合でも全対象への書込み0、I/O途中失敗の非ゼロ終了と同じcheckoutでの再実行を確認する。
候補指定 / --applyの拒否、通常のlink修復後検証と全体offline verifyの区別、bootstrapとの契約一致も確認する。

1. Node.js 24 / npm、Python >=3.14、Ubuntu環境で現行 `task check` を実行する。
2. 最初の環境依存vertical sliceで、実cloneの隔離検査と候補offline検証を接続し、
   CIと同じlocked dependency・runtimeで `task check` を全実装完了前に再実行する。
3. V6の失敗・中断seamを旧transaction撤去前に実証する。
4. V1–V8の例示testと必要な純粋変換propertyを実装する。TSのため既存node:testの決定的生成入力を使え、
   Hypothesisのためだけに別runtime境界や新dependencyを増やさない。
5. read-onlyの公開GitHub取得を少なくとも一つの固定commitで実行する。
   metadata→blob→候補verifyの到達を確認する。API transcript testsだけを実remote成功と呼ばない。
6. UbuntuとWSL Ubuntuで標準手順を確認する。WSLのV6 / V8は元repository・候補clone・Git metadataを
   Linux filesystemへ置き、filesystem種別とmount条件を記録する。Windows / DrvFSは保証対象に含めない。
   環境不足なら未検証とし、必要証拠が揃うまでcloseしない。
7. 通常CI / local check / rename smokeの入力を整合させ、offline `task check` と
   `task check:isolated`、OpenSpec検証を行う。AGENTS.mdのOSWF-5順序でreview / verifierを実施する。

## 失敗判定と証拠

元コピーの比較は本文だけでなく、tracked / staged状態、未追跡利用者file、refs、Git設定を含む。
mtimeだけで成功判定しない。環境が作る無関係なcacheやOSアクセスをsandbox保証に含めない。
失敗した候補でoffline verifyだけ成功するケースも用意し、それだけで更新成功・PR可能と判定しないことを確認する。

独立review / verifierは実装と文書の完了段階を混同しない。
文書段階では規範契約・合意・実装計画・検証対応の矛盾を検査し、未実装の挙動を実証したとは記録しない。
証跡はcommand、結果、source commit、fresh / 再利用、未検証理由の要約だけをtasks.mdに残す。
今回の文書作成では新testを実装・追加しない。
