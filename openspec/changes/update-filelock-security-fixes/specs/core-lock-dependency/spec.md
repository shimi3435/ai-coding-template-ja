## ADDED Requirements

### Requirement: FL-1 修正済みの単一依存へ更新する
lockはfilelock4.2.4だけを更新し、他のpackage recordと公開dependency範囲を保持しなければならない（MUST）。

#### Scenario: 選択更新
- **WHEN** lockを更新する
- **THEN** filelock以外の変更がないこととconsumerの版制約を照合する

#### Scenario: resolver失敗
- **WHEN** locked解決や同期に失敗する
- **THEN** 未完了とし、監査除外や無関係なupgradeで回避しない

### Requirement: FL-2 コア監査とconsumer互換性を検証する
変更はdesignのコア監査・Linux実動作・正式gate・独立検証・最終hosted CIを成功させなければならない（MUST）。

#### Scenario: 競合と再取得
- **WHEN** あるprocessがFileLockを保持し別processが同じpathを取得する
- **THEN** contenderはtimeoutし、holderの解放後は同じpathを再取得できる

#### Scenario: 生成環境とcache
- **WHEN** python-discoveryのcacheと共有app-dataを使うvirtualenvを実行する
- **THEN** cacheのcold/warmと並列生成が成功し、生成python / pipとpre-commitが動作する

#### Scenario: 不正pathと失敗回復
- **WHEN** ReadWriteLockがsymlinkを渡される、またはFileLockの相対path解決時にcwdが消滅する
- **THEN** 前者は拒否して被参照fileを変更せず、後者は失敗後の再取得・解放でholdを残さない

#### Scenario: 未検証と失敗
- **WHEN** 必須gateに失敗または未実施がある
- **THEN** 完了と宣言せず、理由と再開条件を記録する
