# Spec-holes audit

要件IDはspec.mdの掲載順をR1〜R6とする。全分類を評価済み。未解決判断: なし。
以下は仕様へ反映する正常・エラー動作と検証候補であり、検証結果はtasks.mdへ記録する。

## 全要件への分類適用

- R1〜R6 / 1（空）: active対象なし・artifact欠落・未確認reviewを成功扱いしない。R4のdeltaなしだけ履歴移動可。例: deltaなしchangeと欠落tasksを区別する文書review。
- R1〜R6 / 2（境界）: 0/1/複数対象は明示対象とactive-only executorを区別する。例: executorにarchiveを指定して再開しない静的contract。
- R1〜R6 / 3（重複）: archive先衝突・同じcapabilityの重複をR5で停止/直列処理。例: 同名先が存在する際のoverwrite禁止をreview。
- R1〜R6 / 4（順序）: R1のreview前archive禁止、R5の実装事実に基づく適用順、R6の再検証順。例: 恒久的な手順順序テスト。
- R1〜R6 / 5（不正形式）: canonical/artifactsが不正・対応不明なら検証未完了とする。例: 手動fallbackで不明なMODIFIED対象を推測しないreview。
- R1〜R6 / 6（エラー）: R5の部分同期、移動失敗、検証失敗は三者照合・blocker。例: canonicalだけ更新済みでactiveが残るケースをreview。
- R1〜R6 / 7（再実行）: R4の同期済み内容確認、R5の無条件再試行禁止、R6の古い証跡無効化。例: 再実行境界の静的contract。
- R1〜R6 / 8（時刻）: archive日付は操作環境で確認し、実際の保存先を記録する。日付変更を衝突回避や別change扱いに使わない。例: 日付をまたいだ再実行も既存archiveを照合するreview。
- R1〜R6 / 9（文字列）: 対象pathをexactに保持し引用する。Unicode/空白は正規化しない。repository外・symlink越境・曖昧な対象は停止する。例: 空白を含むpathの手動移動前後照合をreview。
- R1〜R6 / 10（数値）: 数値計算・乱数・研究データ処理はないため非該当。task件数は分類2、日付は分類8で扱う。
- R1〜R6 / 11（資源）: disk不足・timeout・review不能な大きい入力も成功へ置換せずR5の復旧へ渡す。例: 移動途中失敗の文書review。upstreamの資源制御実装はscope外。
- R1〜R6 / 12（状態）: 実装完了/ready/archive完了/mergeは別状態。R3で未完了と既知blockerを拒否し、R6で完了を取り消す。例: executor handoffとarchive後reopenの静的contract。

## 要件別の主な検証対応

- R1: 順序と別PR例外を静的テスト・文書review。
- R2: 正本リンクとtemplate手順分離を静的テスト。prune関連の既存保守テストも確認。
- R3: readyの条件、未確認PR、Git操作境界を静的テスト・文書review。
- R4: delta4種・未変更内容の保持・CLIなしのgate分類を文書review。同期engine自体は未変更。
- R5: 衝突・部分失敗・同期順・既存dirty保護を静的テスト・文書review。
- R6: archive場所維持、task再開、stale証跡禁止、過去履歴非遡及を静的テスト・文書review。

実hostのagentによる手順遂行は後続#47のacceptance対象であり本changeでは未検証。
本changeの必須検証は静的contract、文書review、対象OpenSpec validate、project gate、独立review/verifierとする。
