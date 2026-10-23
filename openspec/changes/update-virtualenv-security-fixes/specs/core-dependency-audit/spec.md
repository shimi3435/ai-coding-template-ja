## ADDED Requirements

### Requirement: VA-1 最小の修正済み依存を固定する
lockはvirtualenv 21.14.13と解決に必要な推移依存だけを更新しなければならない（MUST）。

#### Scenario: 選択更新
- **WHEN** PR #93のlockを再解決する
- **THEN** 無関係なpackage recordと公開設定を保持し、既存の推移pinが制約を満たす場合は維持する

#### Scenario: 不整合または互換性問題
- **WHEN** 解決・locked sync・exportが失敗するか追加判断を要する
- **THEN** 停止し、暗黙の再lock・広範更新・監査除外で回避しない

### Requirement: VA-2 修正根拠と実動作を確認する
上流修正との照合、一時probe、既存監査と回帰、OSWF-5の検証、最終HEADのHosted CIを成功させなければならない（MUST）。

#### Scenario: 一時cache削除後
- **WHEN** 環境変数または設定ファイルでsymlink seedを要求し、利用不能cacheから一時app-dataへfallbackする
- **THEN** cache削除後も生成pythonとpipが動作する

#### Scenario: promptの状態遷移
- **WHEN** 環境名または明示promptにshell展開文字があり、activate後のpromptvars有効化・posix移行・子shellへのPS1継承が発生する
- **THEN** 実際のprompt再描画でもpayloadをコマンド実行せず、生成pythonとpipが動作する

#### Scenario: advisory取得不能
- **WHEN** GHSA本文を確認できない
- **THEN** 公式修正差分と配布物およびprobeで根拠を確認し、未確認のCVE番号・影響範囲を断定しない。修正根拠が不足する場合は停止する

#### Scenario: 必須検証未完了
- **WHEN** audit・gate・verifier・Hosted CIが失敗または未実施である
- **THEN** tasksに理由を記録し、現在cycleを完了扱いせずcloseしない
