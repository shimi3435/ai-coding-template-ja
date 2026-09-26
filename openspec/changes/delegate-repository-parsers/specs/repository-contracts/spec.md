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
未対応の command 形式を黙って無視しない。補助設定の全 schema、参照先 task の解決は検証しない。

skills:links、skills:verify、skills:check、skills:update、skills:repin、skills:adopt-local、skills:migrate の
task key を要求する。check.cmds の直接 string に `node repo-tools/entrypoint.mjs skills:verify` と
`node --test repo-tools/*.test.ts` を要求する。trim 後に完全一致する独立項目のみを数え、cmd object / task 呼出
では代用できない。npm ci --ignore-scripts と npm audit --audit-level=high は、全 task の直接 string または
cmd string の trim 後完全一致で要求する。task 名は固定しない。説明文・YAMLコメントは数えない。
既存の禁止 runner pattern は全 task の直接 string / cmd string に適用する。shell の解釈はしない。

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
