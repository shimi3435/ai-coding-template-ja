## ADDED Requirements

### Requirement: VA-1 最小の修正済み依存を固定する
lockはvirtualenv 21.14.9と解決に必要な推移依存だけを更新しなければならない（MUST）。

#### Scenario: 選択更新
- **WHEN** lockを更新する
- **THEN** 無関係なpackage pinと公開設定を保持し、必要な推移更新の理由を記録する

#### Scenario: lock不整合
- **WHEN** locked sync / exportに失敗する
- **THEN** 検証失敗として扱い、暗黙の再lockや監査除外で回避しない

### Requirement: VA-2 修正と既存動作を検証する
正式gate・コア依存監査・生成環境とhookの実動作・独立検証・最新hosted CIを成功させなければならない（MUST）。

#### Scenario: 生成launcherのpath
- **WHEN** 空白とshell展開文字を含む一時pathへ環境を生成してpipを実行する
- **THEN** python/pipが正常実行され、path文字列をコマンドとして実行しない

#### Scenario: 必須検証未完了
- **WHEN** audit / gate / verifier / CIが失敗または未実施となる
- **THEN** tasksへ理由を記録しcloseしない
