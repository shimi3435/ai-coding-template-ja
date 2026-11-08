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
- R1〜R6 / 8（時刻）: archive日付は実行直前のUTCで確認し、実際の保存先とJST実行日時を記録する。日付変更を衝突回避や別change扱いに使わない。例: 日付をまたいだ再実行も既存archiveを照合するreview。
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

## 外部review後の再監査

未解決判断: なし。R1〜R6の12分類を再評価し、元の処理を維持した上で以下を追補する。

- 分類1/2/5（空・境界・不正形式）: 運用未選択、変数未設定/空、spec対象0件、必要spec欠落を区別する。
  前二者は完了操作不可、対象0件は理由付き非該当、必要spec欠落はblocker。shell例の未設定/空入力でCLI未起動を確認する。
- 分類3/4/7（衝突・順序・再実行）: 既定運用への自動fallbackを禁止する。復旧・同期済み・archive後修正でも対象strict検証を行う。
  canonicalと同名changeの曖昧性は`--type spec`で除く。選択3ケースの文書contractとtarget argvを検証する。
- 分類6/12（エラー・状態）: prune後は保守案内を残さず、専用手順欠落なら停止する。
  実prune後のproject→workflow→下流手順、prune前のworkflow→release→close節をfile/headingまで検証する。
- 分類9（文字列）: 空白・Unicode・引用符・$()/backtick・先頭ハイフンを再解釈しない。
  掲載shellを一時CLI stubに対して実行し、argv往復と副作用なしを確認する。path越境停止は元の文書reviewも維持する。
- 分類8/10/11（時刻・数値・資源）: 元の判定から変更なし。新しい時刻処理・数値処理・資源管理機構を追加しない。

今回の追加テストも実agentの運用選択能力を証明するものではない。実host acceptanceは引き続き#47の対象である。

## 再reviewの引き渡し表現の監査

R3の報告名変更について全12分類を再評価。未解決判断: なし。

- 分類1/2/5/6/12: 運用未選択・専用手順欠落・未完了task・検証不足・blockerでは両readyを報告しない。
  下流はarchive-ready、保守はclose-readyと次操作を対応させる。PR未確認は併記し、収束前は実行しない。
  検証候補: 既存のhandoff contractと、保守選択／未選択／必須検証欠落の文書review。
- 分類3/4/7: 報告名を変えても実行許可・処理順序・再実行規則は変えない。
  検証候補: workflow・executor・releaseの条件対応をreviewする。
- 分類8/9/10/11: 報告表現のみの変更で時刻・入力文字列・数値・資源操作は増えない。既存監査の判断を維持する。

## PR #96追加review後の監査

R1/R4/R5/R6の全12分類を再評価。R2/R3は既存判断を維持。未解決判断: なし。

- 分類1/2/5: 新規targetは既存親を検査。既存fileは通常ファイルかつnlink=1のみ許可し、親directoryのnlinkは制限しない。
  判定不能、dangling symlink、通常file以外は停止。検証候補は一時filesystemの5ケースと文書contract。
- 分類3/9: 内部symlink・親symlink・hardlinkを含むaliasを拒否。別pathの所有者が既知でも自動修復しない。
  Unicode等の既存path規則を維持。実CLIのalias書込probeは一時環境だけとする。
- 分類4/6/7/12: CLI/手動/復旧/archive後修正の書込前検査、並行変更停止、直前再確認を要求する。
  検査後の競合を原子的に防ぐruntimeは対象外。HEAD更新後は適用される承認・thread・CIを再確認し、不明・未成立ならmerge停止。
  文書contract、実filesystem照合、PR状態のreadで確認し、既存復旧規則を維持する。
- 分類8: JST実行記録とUTC保存先を分離。直前UTCと事後CLI出力・実pathを照合し、処理中の境界越えは記録する。
  不明・部分失敗は停止し、日付差の自動修復を禁止。検証候補はJST 00:00〜08:59の前日UTCとUTC境界越えの例示。
- 分類10/11: 新しい数値処理・資源管理なし。link数の境界は分類2、既存のdisk不足等は元の復旧規則を維持する。

実CLI副作用probeはupstreamの挙動確認であり、文書規約の自動強制や実host acceptanceを証明しない。
