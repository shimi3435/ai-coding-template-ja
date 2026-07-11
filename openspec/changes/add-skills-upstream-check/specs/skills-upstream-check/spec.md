# skills-upstream-check（skills.lock の上流陳腐化検知）仕様差分

本 change による capability `skills-upstream-check` への追加分。archive せず close 時に
ディレクトリごと削除するため、`openspec/specs/` へはマージされない。

## ADDED Requirements

### Requirement: 上流乖離の検知と分類報告
`task skills:upstream` は `.agents/skills/skills.lock.json` の `source_type == "github"` の各エントリについて、lock の `commit` と上流リポジトリの既定ブランチ HEAD を GitHub compare API（`gh api` の read）で比較し、lock 記載順に次の分類で報告しなければならない（SHALL）: 一致（identical）は OK、上流先行（ahead）かつ skill 本体の変更なしは INFO、上流先行かつ skill 本体の変更ありは WARN、それ以外の status（behind / diverged 等・履歴書き換えの可能性）は WARN。`source_type` が `local` / `plugin` のエントリは比較せずスキップを表示する。未知の `source_type`（enum 外・欠落）・`source` が GitHub リポジトリ URL として解釈できない・`commit` 等の必須フィールドを欠くエントリは WARN（不正エントリ）として報告し、処理を続行する（黙ってスキップしない）。エントリ単位の API エラー（404 / レート制限 / タイムアウト / オフライン）も WARN として報告し、残りのエントリの処理を続行する。同一上流リポジトリを指す複数エントリはそれぞれ独立に比較する。

#### Scenario: 上流で skill 本体が更新されている
- **WHEN** lock の commit から上流 HEAD までの変更ファイルに skill 本体のパスが含まれる
- **THEN** 該当エントリを WARN で報告する（更新するかは人の判断・自動更新しない）

#### Scenario: 上流 HEAD は進んだが skill は無変更
- **WHEN** 上流が ahead だが変更ファイルに skill 本体のパスが含まれない
- **THEN** INFO で報告する（monorepo の無関係な活動を WARN にしない）

#### Scenario: 比較対象がゼロ
- **WHEN** lock に `source_type == "github"` のエントリが 1 件も無い（skills 配列が空を含む）
- **THEN** 対象ゼロである旨を報告して exit 0 で終了する

#### Scenario: 一部エントリの API 呼び出しが失敗する
- **WHEN** あるエントリの compare 呼び出しがエラー（404 / レート制限等）になる
- **THEN** そのエントリを WARN で報告し、残りのエントリは処理を続行する

### Requirement: opt-in・報告のみ・read-only
本タスクはネットワークを要する opt-in の報告タスクであり、task check / CI / task doctor の既定経路に組み込んではならず（SHALL NOT）、乖離や API エラーの WARN で非ゼロ終了してはならない（SHALL NOT）。非ゼロ終了は前提不成立（gh CLI 不在・gh 未認証＝ローカルに資格情報が無い・lock 不在または解析不能）の場合のみとし、その際は導入・復旧の案内を表示する（SHALL）。前提の認証確認はネットワークを使わずローカルに判定し、オフライン・GitHub 側障害等の到達性問題を前提不成立として扱ってはならない（SHALL NOT・エントリ単位の WARN として報告する）。実行は read のみで、lock・vendored skill・リポジトリの状態を一切変更しない（SHALL）。

#### Scenario: 乖離 WARN のみで終了する
- **WHEN** 複数エントリが WARN（上流乖離）と報告される
- **THEN** exit 0 で終了する（ゲートではない・更新判断は人起点）

#### Scenario: gh が使えない
- **WHEN** gh CLI が未導入、またはローカルに資格情報が無い（未認証）
- **THEN** 導入 / 認証の案内を表示して非ゼロ終了する（黙って成功扱いにしない）

#### Scenario: オフラインで実行した
- **WHEN** gh と資格情報は揃っているがネットワークに到達できない
- **THEN** 前提チェックは通過し、各エントリの compare 失敗を WARN として報告して exit 0 で終了する（到達性問題で hard fail しない）

#### Scenario: 再実行
- **WHEN** 同じ環境で本タスクを連続して 2 回実行する
- **THEN** どちらも同じ報告を返し、lock やリポジトリの状態は変化しない

### Requirement: skill 本体変更の判定規則
skill 本体の変更有無は、compare API の変更ファイル一覧のパス（rename 時の元パス `previous_filename` を含む）に skill 名が**ディレクトリ成分として完全一致**で含まれるか（位置は問わない）で判定しなければならない（SHALL）。ファイル名部分の一致（例: `docs/productivity/grilling.md` と skill `grilling`）は変更とみなさない。ただし上流リポジトリ名が skill 名と一致する場合（単一 skill リポジトリ・大文字小文字は区別しない）は、リポジトリ直下のファイル変更も skill 本体の変更とみなす（SKILL.md を直下に置く形態の見逃しを防ぐ・見逃しより誤検知に倒す）。変更ファイル一覧が API の上限（300 件）で切り詰められている可能性がある場合、skill 変更を検出済みなら WARN（変更あり）を優先し、未検出なら判定不能として WARN で報告する（見逃しを黙殺しない）。

#### Scenario: 単一 skill リポジトリの直下ファイルが更新された
- **WHEN** 上流リポジトリ名が skill 名と一致し（例: skill `caveman` と repo `JuliusBrussee/caveman`）、リポジトリ直下のファイル（SKILL.md / README.md 等）が変更一覧に現れる
- **THEN** skill 本体の変更として WARN と判定する（ディレクトリ成分一致だけでは直下配置を見逃すため）

#### Scenario: 上流で skill が再配置された
- **WHEN** 上流が skill ディレクトリを再配置し（例: `skills/grilling` → `skills/productivity/grilling`）、その配下のファイルが変更一覧に現れる
- **THEN** パス prefix に依存しないディレクトリ成分一致により WARN（変更あり）と判定する

#### Scenario: skill ディレクトリが別名へ改名された
- **WHEN** 上流が skill ディレクトリを skill 名を含まない別名へ移動し（例: `skills/tdd/SKILL.md` → `skills/testing/SKILL.md`）、変更一覧の `filename` には skill 名が現れず `previous_filename`（rename 元パス）にのみ現れる
- **THEN** 元パスの成分一致により WARN（変更あり）と判定する（改名・移動・削除相当を見逃さない）

#### Scenario: ahead だが変更ファイル一覧が空
- **WHEN** compare の status が ahead で変更ファイル一覧が空
- **THEN** skill 本体の変更なしとして INFO で報告する

#### Scenario: 変更ファイル一覧が切り詰められている
- **WHEN** 変更ファイルが 300 件に達し一覧が切り詰められている可能性があり、skill 名に一致するパスが見つからない
- **THEN** 判定不能（要手動確認）として WARN で報告する
