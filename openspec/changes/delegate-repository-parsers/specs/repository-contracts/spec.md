## ADDED Requirements

### Requirement: Canonical exact dependency versions
The checker MUST delegate dependency version parsing to the existing semver package and accept only canonical exact versions.

dependencies / devDependencies の version は ASCII SemVer で、major / minor / patch はそれぞれ
0..9007199254740991、全体は256文字以下とする。prerelease と build metadata を許可し、build の数字の
先頭ゼロは許可する。数値 prerelease の先頭ゼロ、core の先頭ゼロ、prefix、空白、range、tag は拒否する。
数値 prerelease は core の安全整数上限を適用せず、全体長の範囲で package が解析する文法を採用する。
build を含む正規形と入力の完全一致を要求し、補正した入力を受理しない。
不正な依存は現行の診断経路で報告し、入力ファイルを書き換えない。

#### Scenario: Canonical prerelease and build
- **WHEN** a dependency is `1.2.3-rc.1+build.01`
- **THEN** the checker accepts its version without dropping build metadata

#### Scenario: Numeric and length boundaries
- **WHEN** any core component exceeds 9007199254740991 or the full version exceeds 256 characters
- **THEN** the checker rejects it, including inputs accepted by the former unbounded implementation

#### Scenario: Noncanonical or nonstring input
- **WHEN** a version has a prefix, surrounding whitespace, a range, invalid identifiers, or a nonstring value
- **THEN** the checker fails without normalizing or writing the input

### Requirement: Restricted YAML syntax delegated to yaml
The checker MUST parse the whole Taskfile through the existing yaml package and reject unsupported YAML constructs before checking routes.

YAML 1.2 の単一 document、root mapping を要求する。どこにあっても parse error、duplicate key、parser warning、
独自 tag / tag directive、別版指定、anchor、alias、merge key `<<` を拒否する。mapping key は文字列とする。
通常の quote、flow style、コメント、LF / CRLF、UTF-8 BOM、複数行 string、標準 core tag は許可する。
shell string 内の記号は YAML 構造として扱わない。空 document / 複数 document / 配列 root は失敗する。

#### Scenario: Equivalent YAML presentation
- **WHEN** the same Taskfile data uses different indentation, quoted keys, flow style, CRLF, or comments
- **THEN** it has the same validation result

#### Scenario: Invalid or unsupported YAML
- **WHEN** a duplicate key, syntax error, alias, anchor, merge key, custom tag, or incompatible directive occurs anywhere
- **THEN** the checker fails with a Taskfile diagnostic before accepting any required route

### Requirement: Taskfile project policy uses parsed commands
The checker MUST validate required routes and forbidden runners using parsed task keys and command strings, independently of YAML parsing.

tasks と各 task は mapping。task 本体の string / array / cmd 省略形は拒否する。cmds は欠損可で、存在する場合
sequence とする。項目は空でない string、cmd string object、task string object のみとし、後二者は排他的とする。
未対応の command 形式を黙って無視しない。許可 key は root が version / tasks、check task が desc / cmds、
その他の task が desc / cmds / silent、cmd object が cmd / silent、task 呼出 object が task / silent だけとする。
未知 key は false / null / 空の値でも拒否する。desc は string、silent は boolean とする。vars は全て禁止する。
command と task 呼出名に任意の Task template を許可しない。解析後の文字列に `{{` があれば拒否するが、
次の task 名と command 全文の組だけは、末尾1回の `{{.CLI_ARGS}}` を許可する（前後空白は trim する）。

- doctor: `uv run --no-sync python scripts/doctor.py {{.CLI_ARGS}}`
- rename: `uv run python scripts/rename-package.py {{.CLI_ARGS}}`
- skills:links / skills:verify / skills:check / skills:update / skills:repin / skills:adopt-local / skills:migrate:
  `node repo-tools/entrypoint.mjs <同じ task 名> {{.CLI_ARGS}}`
- prune-template-docs: `uv run --no-sync python scripts/prune-template-docs.py {{.CLI_ARGS}}`

string と cmd object の本文には同じ条件を適用する。task 呼出名の template は例外なく拒否する。
追加の例外は policy 変更として扱う。説明文中の template 記号は実行対象でないため許可する。

skills:links、skills:verify、skills:check、skills:update、skills:repin、skills:adopt-local、skills:migrate の
task key を要求する。check.cmds の直接 string に `node repo-tools/entrypoint.mjs skills:verify` と
`node --test repo-tools/*.test.ts` を要求する。trim 後に完全一致する独立項目のみを数え、cmd object / task 呼出
では代用できない。npm ci --ignore-scripts と npm audit --audit-level=high は、全 task の直接 string または
cmd string の trim 後完全一致で要求する。task 名は固定しない。説明文・YAMLコメントは数えない。
既存の禁止 runner pattern は全 task の直接 string / cmd string に適用する。補助 field の shell 実行は
許可リストで拒否する。許可しない template は評価せず拒否する。任意 shell の解釈はしない。成功表示は
`forbidden Node runners in static command text: none` とし、実行時の全コマンド不在を保証しない。

#### Scenario: Required commands appear only in prose
- **WHEN** required commands occur only in descriptions, comments, echo statements, or inside a longer shell block
- **THEN** the checker fails for missing routes

#### Scenario: Explicit commands and task calls
- **WHEN** other cmds contain string commands, cmd objects, and task calls
- **THEN** they are accepted structurally, cmd bodies are inspected for forbidden runners, and task calls do not satisfy required commands

#### Scenario: Missing or malformed task structure
- **WHEN** tasks/check is absent, tasks is not a mapping, a task uses shorthand, or cmds contains unsupported/nonstring/ambiguous entries
- **THEN** the checker fails with a Taskfile diagnostic

#### Scenario: Repeated read-only validation
- **WHEN** the same valid or invalid repository is checked twice
- **THEN** both results agree and its input files are unchanged

#### Scenario: Executable auxiliary fields and task suppression
- **WHEN** if / status / preconditions / sources / generates / platforms / run / ignore_error / includes or another unlisted key occurs at a restricted location
- **THEN** the checker rejects it even if its value is false, null, or empty, without executing any auxiliary shell

### Requirement: Independent gate before Task execution
The CI and local final validation MUST invoke check-contracts independently before task check and stop when it fails.

正式な project gate は実行可能な `scripts/check.sh` とする。引数は受け付けず、指定時は診断して非ゼロ終了する。
script の配置先を基準に repository root へ移動し、`node repo-tools/entrypoint.mjs check-contracts` を実行する。
成功した場合だけ `task check` を起動し、その終了コードを伝播する。依存導入・自動修正・外部通信を追加しない。
CI の check / rename-smoke job は依存導入後（rename-smoke は改名後）に `./scripts/check.sh` を実行する。
gate step と job に skip 条件・continue-on-error を追加しない。AGENTS / README / CONTEXT / bootstrap の案内、
現行手順と関連 local skill の完了判定を同じ入口に統一する。task check 単独は内部品質処理であり最終判定に使わない。
Taskfile を自分自身の検査の起動元として信用しない。Task が gate 全体を skip / 成功扱いにする設定は拒否する。
Task の vars / 任意 template による合成を閉じるが、shell の文字列連結・eval・外部環境・CLI_ARGS 入力の
安全性を証明する sandbox ではない。成功表示は静的 command 本文の検査結果に限定する。

#### Scenario: Skipped check cannot bypass independent validation
- **WHEN** check contains if: "exit 1" or status: ["true"]
- **THEN** independent validation fails before task check is invoked, even though Task alone would exit successfully

#### Scenario: Allowed Taskfile reaches the real runner
- **WHEN** the independent checker accepts the fixture
- **THEN** the installed Task executes its check commands and propagates a command failure

#### Scenario: Hosted CI remains a merge condition
- **WHEN** a pull request is created for the corrected branch
- **THEN** hosted CI must succeed before merge; local evidence is not reported as hosted CI success

#### Scenario: Canonical invocation from another directory
- **WHEN** the script is invoked from a subdirectory or unrelated current directory
- **THEN** it validates the repository containing the script, without using the caller directory

#### Scenario: Unexpected arguments
- **WHEN** an argument is supplied to scripts/check.sh
- **THEN** it fails before invoking Node or Task

### Requirement: Local Task compatibility without exact pin
The ordinary project gate MUST verify real Task execution without requiring a local exact Task version.

通常 Node tests は独立拒否、正常実行、失敗伝播を確認し、Task version の完全一致を要求しない。
旧 if / status / auxiliary shell のバージョン依存の再現は、通常の top-level Node test glob に入らない
`repo-tools/integration/repository-taskfile-gate.test.ts` へ分離する。CI check / rename-smoke は正式 gate 成功後に
この test を明示実行する。CI の Task 3.51.1 pin は既存 Python contract test で保証する。
ローカルの新しい最低版や exact pin は導入しない。

#### Scenario: Ordinary local validation
- **WHEN** an installed compatible Task runs the ordinary project gate
- **THEN** validation does not fail merely because its version differs from the CI pin

#### Scenario: Pinned CI regression probes
- **WHEN** CI runs after pinned setup and the canonical gate
- **THEN** it explicitly executes the version-dependent regression probes outside the ordinary test glob
