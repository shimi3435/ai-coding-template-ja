# task-delegation（task 単位のサブエージェント委譲）仕様差分

本 change による capability `task-delegation` への追加分。archive せず close 時に
ディレクトリごと削除するため、`openspec/specs/` へはマージされない。

## ADDED Requirements

### Requirement: 実装系 task の委譲原則
change を実行する主体は、成果物（コード / docs）を新規作成または大幅変更する task を、原則として新しいコンテキストのサブエージェントへ委譲すべきであり（SHOULD）、委譲を見送る場合は理由を一言記録しなければならない（SHALL）。検査・進捗マーク・git 操作・確認系の task は main が直接行い、委譲対象としない。本ルールはサブエージェント機構が利用できる環境でのみ適用され、機構不在時は main の直接実行で可（理由記録も不要）。

#### Scenario: 実装系 task の実行
- **WHEN** change の task が新規ファイルの作成または既存成果物の大幅変更を含む
- **THEN** main はその task を原則としてサブエージェントへ委譲し（見送る場合は理由を一言記録する）、main のコンテキストを実装詳細で埋めない

#### Scenario: 小規模 change で見送る
- **WHEN** main が小規模 change 等の理由で委譲を見送る
- **THEN** 見送り理由を一言（応答内で可）記録し、黙って無視しない

#### Scenario: 軽量 task は委譲しない
- **WHEN** task が検査（grep / task check）・tasks.md の進捗マーク・close のディレクトリ削除等である
- **THEN** main が直接実行する（委譲のオーバーヘッドが本体より重いため対象外）

#### Scenario: 委譲対象がゼロの change
- **WHEN** change の全 task が検査・確認・close 系で、成果物を作る task が無い
- **THEN** 委譲ゼロで正常であり、見送り理由の記録も要しない（対象外のため）

#### Scenario: 「大幅変更」の判定に迷う
- **WHEN** task が数行の編集等で、新規作成 / 大幅変更に当たるか判定が割れる
- **THEN** 委譲するかは main の判断とし、見送る場合は理由を一言残す（境界事例は SHOULD ＋理由記録で吸収する）

#### Scenario: 1 回の委譲で終わらない規模の task
- **WHEN** task が大きすぎてサブエージェント 1 回の実行で完了が見込めない
- **THEN** main は委譲の前に `tasks.md` の task 分割（OpenSpec のタスク分解の責務）を検討する

### Requirement: 文脈受け渡しはファイルを単一の正とする
委譲時、main はサブエージェントに change ディレクトリ一式（そこに存在するファイル全部。spec delta は無い change では不要）を読ませなければならない（SHALL）。task の成果・受け入れ基準・設計判断に影響するファイル未記載の決定は、委譲の前に proposal / design / spec delta へ追記しなければならない（SHALL）。prompt で渡すのは対象 task 番号と実行上の一時情報（作業パス・環境等の指示）のみとし、main が proposal / spec の内容を要約して代替したり、prompt のみで決定事項を渡したりしてはならない（SHALL NOT）。

#### Scenario: サブエージェントの cold start
- **WHEN** サブエージェントが委譲された task を開始する
- **THEN** change ディレクトリのファイル群から仕様・受け入れ基準・タスク一覧を自身で読み、main の記憶に依存しない

#### Scenario: ファイル外の合意が存在する
- **WHEN** 委譲したい task にファイル未記載の口頭合意・セッション内決定が関わる
- **THEN** main はその決定を委譲の前に proposal / design 等のファイルへ追記する（prompt のみで渡さない。後続の委譲・再開・レビューで決定が失われないため）

#### Scenario: prompt の内容がファイルと矛盾する
- **WHEN** prompt で渡そうとする一時情報や main の認識が change ディレクトリのファイル記載と食い違う
- **THEN** ファイルが単一の正であり、main は委譲の前にファイル側を更新して矛盾を解消する（prompt でファイルを上書きしない）

### Requirement: 検証と進捗マークは main が行う
委譲された task の成果は main が受け入れ検証（diff 確認・必要に応じ task check）を行い、検証後に main が `tasks.md` のチェックを `- [x]` へ更新しなければならない（SHALL）。サブエージェントは `tasks.md` の進捗マークを更新してはならない（SHALL NOT）。サブエージェントの失敗・無応答・空の完了報告・成果物ゼロは不合格として扱う。不合格時、main は working tree の diff を確認し、残った部分成果物を採用・修正・破棄のいずれかで明示的に処理して作業ツリーを既知の状態へ収束させてから、再委譲または main による直接修正に進まなければならない（SHALL）。再委譲するか直接修正するかは main が判断する。

#### Scenario: 委譲 task の完了
- **WHEN** サブエージェントが成果物と完了報告を返す
- **THEN** main が成果を検証し、合格を確認してから該当 task を `- [x]` にする

#### Scenario: 成果が不合格
- **WHEN** 検証で成果物が受け入れ基準を満たさない、またはサブエージェントが失敗・無応答・空報告に終わる
- **THEN** main は該当 task を未完のまま残し、working tree の部分成果物を採用・修正・破棄のいずれかで明示的に処理してから、再委譲または直接修正に進む（後続のサブエージェントが壊れた中間状態を正として読まないため）

#### Scenario: サブエージェントが誤ってマークした
- **WHEN** サブエージェントが規約に反して `tasks.md` のチェックを更新していた
- **THEN** main は検証が済むまでそのチェックを未完（`- [ ]`）へ戻し、検証合格後にあらためてマークする

### Requirement: 委譲は直列で行う
main は task を `tasks.md` の番号順に 1 つずつ委譲し、検証と進捗マークを終えてから次の task に進まなければならない（SHALL）。複数 task の並列委譲は行わない。

#### Scenario: 同一ファイルを触る連続 task
- **WHEN** 連続する複数 task が同一ファイルを変更する
- **THEN** 直列実行により競合が生じず、後続 task のサブエージェントは前 task の成果を反映済みのファイルを読める

### Requirement: ルール本文はエージェント中立に記述する
委譲ルールの本文（AGENTS.md / workflow.md）は特定エージェントの機構名に依存しない中立表現で記述しなければならない（SHALL）。機構名（Claude Code: Agent tool / Codex: `multi_agent`）の言及は workflow.md 詳細節の例示に限る。

#### Scenario: どちらのエージェントが読んでも成立
- **WHEN** Codex または Claude Code が AGENTS.md の委譲原則を読む
- **THEN** 自身の subagent 機構でそのまま適用でき、他方専用の手順を読み飛ばす必要が無い
