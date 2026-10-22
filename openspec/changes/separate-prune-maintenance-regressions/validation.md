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
