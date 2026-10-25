# 検証計画

文書種別: 手順書。実行順序と結果は tasks.md を正とする。

- V01: baseの全通常gateとpruned baseline3回。環境・wall秒・最大RSS・件数・終了コードを保存する。
- V02: 旧K05不在の構成受理をRED→GREENで確認。schema不正は保守gateで拒否する。
- V03: pytest collect-onlyで通常/保守nodeidを照合。移設8modulesの全test名とparameterを追跡し、
  schema責務移設による置換以外の回帰削除・skip追加・期待値変更を禁止する。
- V04: references.json 269件のbytes不変、全case×bundled/prunedの結果、protocol corpus12件を確認する。
- V05: fresh/rename/prune/再setupの既存実統合、部分欠落・対象外保護・Git境界・hardlink回帰を実行する。
- V06: prune後の `task check` を3回測定しV01と比較。正式 `./scripts/check.sh` とdoctorも確認する。
- V07: self-review→OSWF-5 independent review→finding対応→最新 `./scripts/check.sh`→別verifier。
  `task check:template`、strict OpenSpec validation、hosted CIを完了まで確認する。
- V08: retrospectiveと完了証跡を記録しpre-merge close。active change0、削除後gate、cleanupを確認する。

測定環境差・localeによるskipは明記し、required検証の欠落を成功と扱わない。
同一入力の全体gate再利用はworkflowの証跡規律に従い、focused validationはfreshで行う。

- V09: 保守全Pythonの型検査範囲を確認し、一時的な型不正probeで失敗伝播を確認する。
  probeはcleanupし、正常時の型検査wall秒・最大RSSを別測定する。通常includeは不変とする。
- V10: pruned Git fixtureの正常対照の後、構文エラー1ケースで解析診断、successful=False、
  解析由来plan blocker、実CLI apply非ゼロ、全fixtureファイルとindexの不変を確認する。
- V11: release notesと保持referenceの旧K05案内を照合する。自動migration・独自参照の一律削除は追加しない。

修正cycleではV09〜V11→self-review→独立review→最新通常・保守gate→V06再測定→別verifier→
PR/hosted CI→V08の順とする。beforeの入力・環境同一性が不明ならbeforeも再測定する。

2026-10-24の再開では、PR #93 merge後の同じlockをbefore / afterへ適用する。
過去の測定・gateを新しい依存環境の証跡として再利用せず、V06の各3回とV07をfreshで確認する。
依存監査は既存CIと同じexport / pip-auditを実行し、監査範囲やignoreを変更しない。

2026-10-25の最終受入では、PR #94 merge後のfilelock4.2.4を含むlockをbefore / afterへ適用する。
比較baseは `50687105f1fc6a21992ddc1d90ca959a6cd023a9`。V06の各3回とV07はfreshで確認する。
