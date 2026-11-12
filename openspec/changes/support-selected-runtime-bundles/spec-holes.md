# Spec-holes audit

BD-1〜BD-6について固定12分類を確認した。以下は仕様案と検証候補であり、製品検証結果ではない。

## Coverage

- BD-1: 該当1,2,3,4,5,6,7,9,10,11,12。8は時刻でschemaを選ばないため非該当。
- BD-2: 該当1,2,3,4,5,6,7,9,10,11,12。8はpublished_atではなくstable属性と固定SHAで判定するため非該当。
- BD-3: 該当1,2,3,4,5,6,7,9,10,11,12。8はmtimeによるintegrity判定をしないため非該当。
- BD-4: 該当1,2,3,4,5,6,7,9,10,11,12。8は経過時間から承認・所有を推測しないため非該当。
- BD-5: 該当1,2,3,4,5,6,7,9,11,12。8は時刻判断なし、10は数値を操作入力にしないため非該当。
- BD-6: 該当1,2,3,4,5,6,7,9,11,12。8は日付による互換判定なし、10は数値算術を完了条件にしないため非該当。

## 仕様上の処理と検証候補

1. BD-1（1〜7,9〜12）: files空、bundle=null、未知field、duplicate key、数値文字列、小数、巨大整数を拒否する。
   bundle source／lockのlegacyRefはnullや正常な旧形式を含めて拒否し、通常SkillのlegacyRefは従来どおり検証する。
   files=1/100/101、bytes上限と+1、空file、NFC/非NFC、空白、case-fold、prefix衝突をdecoderと公開verifyで検証する。
   配列順の入替えは同じcanonical結果を返すpropertyを使う。処理先: metadata、Task 2。
2. BD-2（1〜7,9〜12）: 当該cohort内のfiles全件存在・祖先・size・typeとbundle／cohort上限を先に確認する。
   後半entryの欠落／上限超過、symlink祖先、submodule、truncated、unknown modeをfake GhRunnerへ渡し、
   当該cohortのblob requestが0件であることを確認する。選択外の正常fileは取得しない。
   100644→executable=true、100755→falseも同じ取得前拒否とする。
   選択file数が小さくても祖先込み501 entries／depth 33を拒否する。処理先: metadata取得前検査、Task 3。
3. BD-2/4（3,4,6,7,12）: preview後／本文取得中のtag移動・release削除・draft化・prerelease化、release/tag_name不一致、
   同一tagの再取得、非fast-forwardを検証する。applyは再観測して拒否し、古いpreviewを承認tokenにしない。
   人の明示repinだけが新しいstable tag／identityを採用する。処理先: design更新と失敗、Task 3/5。
4. BD-3（1〜7,9〜12）: 欠落／余剰file・directory、異なるhash/bytes/mode、inventory不整合、
   legalの一覧外path、未宣言vendor、orphanを拒否する。通常Skillのroot欠落は引き続き失敗する。
   bundle宣言と同名の `.agents/skills/<name>` 実体も未宣言Skillとして拒否する。
   vendor root自身のsymlink／file、直下の通常file／symlink／特殊file、未宣言directory、
   case-fold／prefix衝突を公開verifyと可能なGit snapshot fixtureで検証する。Gitで表現できない特殊fileはlive検証だけに適用する。
   同じtreeから算出するinventoryと既存canonical hashの整合をpropertyで検証する。処理先: metadata Lock、Task 2/4。
5. BD-3/4（3,4,6,9,11,12）: live fileのhardlink、親symlink、device、読込中size／identity変化、
   書込前candidateの差替え、ignored衝突を実filesystem fixtureで確認する。元repository不変を比較する。
   同一ユーザーによる任意の敵対的processの完全排除は保証せず、既存の前後照合・隔離・fail-closedを維持する。
   処理先: metadata filesystem／design apply、Task 4/5。
6. BD-4（1〜7,9〜12）: 同一commitでfile削減、上限引下げ、legal変更を指名repinする例を検証する。
   mode変更は同じ本文・異なるGit modeを持つ新commitで検証し、宣言不変なら拒否、一致する宣言と明示repinなら成功させる。
   旧treeは旧policy、新treeは新policyを使い、対象外entryの変更を拒否する。
   policy不変の本文差分、追加／削除／mode差分、policyだけの変更でfile差分配列が正確に出力されることを確認する。
   limitsだけの変更でbundleFileChanges=[]でもplannedとなり、apply後のsource／lockが一致し再実行でunchangedとなることを確認する。
   candidate途中write失敗は保持・停止し、新candidateから再実行する。処理先: design更新、Task 5。
7. BD-5（1〜7,9,11,12）: bundle 0件/1件/複数件、通常Skill混在、欠損metadata、通常link衝突、
   bundleと同名の利用者linkを確認する。bundleはlink対象から除外し、利用者linkを変更しない。
   通常Skillの既存all-before-write契約を維持する。処理先: design seam、Task 4。
8. BD-6（1〜7,9,11,12）: 旧v2→新reader、v1 migrate、bundle入り完成v2のmigrate no-op、
   他Skillのadopt-localとbundle選択拒否、旧readerの拒否を検証する。
   template資産prune前後のbundle verifyと通常checkを確認する。処理先: metadata互換性、Task 4/6。
9. BD-2/4（2,4,6,11,12）: 多数の独立cohortを小さいfakeデータで検証し、処理順と後続cohort失敗を確認する。
   各bundle／cohortの上限を満たす2 cohorts各26 MiBの例では、累積50 MiB超過だけで拒否しない。
   後続cohortの事前拒否時は先行blob取得を許容するが、後続blob取得0件、applyなし、failed／exit 1／changes=[]とする。
   操作全体の累積予算の強制はscope外であり、成功した取得例から低い総メモリ保証を導かない。
   処理先: metadataリソース上限、design残存リスク、Task 3/5。
10. BD-2（1,5,6,9,12）: v1.0.0とv1.0.0-rc.1を同じGitHub属性条件で受理する。
    releaseなし、draft／prerelease true、属性欠落／型不正、tag_name不一致は拒否する。
    SemVerによる正式版判定はscope外とする。処理先: metadata取得前検査、Task 3。
11. BD-3/6（1〜7,9,11,12）: source／lock／vendorの全有無8通りをfixture化する。
    有効な全在席と全撤去は成功、一部残存6通りはoffline verifyで拒否する。
    全撤去commit基準のcheckでは撤去bundleのAPI requestが0件で、他の通常Skill／bundleを保持する。
    残存bundleあり／なしの両方で撤去後pruneを検証する。host解除・旧checkout cleanupはscope外とする。
    処理先: design撤去手順、Task 4/6。
12. BD-6（1〜7,9,11,12）: 固定版の候補一覧をmetadataだけで照合し、path／祖先／type／mode／件数／bytesを確認する。
    candidate欠落や制約不適合をsynthetic test成功で代替しない。本文・runtime・最終closureは本確認のscope外とする。
    処理先: feasibility、Task 1/6。

## 判断状態

仕様案の中で処理先を持たない未定義ケースは残さない。上記でscope外とした保証は明示する。
ただし**remoteへのbundle追加、schema v2維持、exact required list、tag限定、bundle adopt-local非対応**は
この設計で具体化した選択であり、実装前に利用者の仕様承認を必要とする。
現段階ではexecutorを起動せず、未承認をpreflight成功へ読み替えない。
外部レビューへの上記修正方針と独立再レビューは利用者が承認した。
操作全体の累積予算を今回追加しない残存リスクと、stableをGitHub属性だけで定義する判断もこの承認に含む。
これは製品実装開始の承認ではない。Task 2〜7の検証候補は未実行である。
実装時に新しい仕様判断が必要になった場合は完了済みcheckboxを保持して停止する。
