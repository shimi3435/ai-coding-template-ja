# Repository contracts の受理仕様

文書種別: リファレンス。`node repo-tools/entrypoint.mjs check-contracts` と、それを呼ぶ `task check` の
exact dependency version / Taskfile 検査を定義する。Issue #77 で構文解析を既存 dependency に委譲した。
検査は read-only で、入力を正規化して書き戻したり、Taskfile のコマンドを実行したりしない。
不正入力は非ゼロ終了し、対象と理由を報告する。

## Exact dependency version

対象は `package.json` の `dependencies` / `devDependencies`。両 field は欠損を許可し、存在する場合は
package name と string version の object を要求する。JSON の同名 key は従来どおり最後の値を使用する。

構文解析は既存の `semver` package の公開 API に委譲する。受理条件は以下すべてである。

- `major.minor.patch` の3要素はそれぞれ整数 `0..9007199254740991`。
- version 全体は256文字以下。ASCII の SemVer grammar のみを許可する。
- core の先頭ゼロを拒否する。ただし `0` 自体は許可する。
- prerelease と build metadata を許可する。識別子は ASCII 英数字・ハイフンから成る空でない要素を `.` で区切る。
- 数字のみの prerelease 識別子は先頭ゼロを拒否する。core の安全整数上限は適用せず、package の文法と全体長上限に従う。
- build metadata の数字の先頭ゼロは許可する。
- build metadata を含む正規形と入力が完全一致する。`v` / `=` prefix、前後空白、改行、range、tag、URL は拒否する。

`1.2.3`、`1.2.3-rc.1`、`1.2.3+build.01`、`1.2.3-rc.1+build.01` は受理する。
`semver` の version 表現から build metadata が落ちることを理由に、有効な build 付き入力を拒否しない。
従来受理していた core 上限超過と256文字超過は、新たに拒否する意図的な変更である。

## Taskfile の YAML

`Taskfile.yml` 全体を既存の `yaml` package で解析する。

| 項目 | 受理契約 |
| --- | --- |
| YAML version | YAML 1.2。別版の明示指定は拒否 |
| Document | 単一 document、root は mapping。空 / null / array root は拒否 |
| Mapping key | すべて string。重複は検査対象外 field の中でも拒否 |
| Parse error / warning | どちらも拒否。部分解析結果を使わない |
| Anchor / alias / merge key | `&anchor`、`*alias`、mapping key `<<` は拒否。引用した `"<<"` key も拒否 |
| Tags | 標準 YAML 1.2 core tag（map、seq、str、null、bool、int、float）のみ。独自 tag / tag directive は拒否 |
| 表示形式 | 引用符、flow / block style、コメント、インデント差、UTF-8 BOM、LF / CRLF を許可 |
| Shell 文字列 | 文字列内の `*` / `&` / `<<` 等を YAML 構造として検査しない |

alias は展開しない。ファイルサイズ・nesting に独自の上限は追加せず、任意の巨大入力に対する
resource 保証はこの検査の対象外とする。

## Task / command の構造

- `tasks` と `tasks.<名前>` は mapping。task 名は空白だけでない string とする。
- task 本体を string / array にする省略形、task 直下の `cmd` は拒否する。コマンドは `cmds` に置く。
- `cmds` は欠損を許可する。存在する場合は sequence とし、空配列は許可する。ただし必須入口の不足は別途拒否する。
- `cmds` の各項目は、空白だけでない string、`cmd` に同様の string を持つ object、`task` に同様の task 名を持つ object の3形式。
- `cmd` と `task` の同時指定、`defer` および未対応形式の項目は拒否する。

許可キーは以下に限定する。未知キーは `false` / `null` / 空の値でも拒否する。

| 場所 | 許可キー |
| --- | --- |
| root | `version`, `tasks` |
| `tasks.check` | `desc`, `cmds` |
| その他の task | `desc`, `cmds`, `silent`, `vars` |
| `cmd` object | `cmd`, `silent` |
| `task` 呼出 object | `task`, `silent`, `vars` |

`desc` は string、`silent` は boolean、`vars` は空白だけでない文字列名から string 値への mapping とする。
空の `vars` と空文字値は許可する。`sh` / `ref` object、array、非string値は拒否する。
`if`、`status`、`preconditions` による補助実行、`sources` / `generates` によるキャッシュ、`platforms`、
`run`、`ignore_error`、`includes`、`deps`、root の `env` / `vars` 等は許可しない。
必須 `check` 全体の非実行化・失敗抑止も拒否の対象である。

全 task の直接 string / `cmd` 本文に、既存の禁止 Node runner pattern を適用する。
YAMLコメント・説明文・静的な `vars` のデータは shell command として数えない。
成功表示 `forbidden Node runners in static command text: none` は静的本文の検査結果であり、
テンプレート展開後を含む全実行コマンドの不在を保証しない。

## 必須入口

以下の task key を `tasks` に要求する。説明文・コメントに書いてあるだけでは満たさない。

`skills:links`、`skills:verify`、`skills:check`、`skills:update`、`skills:repin`、`skills:adopt-local`、`skills:migrate`、`check`。

| 必須 command | 記載先 | 許可形式 |
| --- | --- | --- |
| `node repo-tools/entrypoint.mjs skills:verify` | `tasks.check.cmds` | 独立した直接 string 項目 |
| `node --test repo-tools/*.test.ts` | `tasks.check.cmds` | 独立した直接 string 項目 |
| `npm ci --ignore-scripts` | 任意の task の `cmds` | 直接 string または `cmd` string |
| `npm audit --audit-level=high` | 任意の task の `cmds` | 直接 string または `cmd` string |

一致判定は YAML scalar の値の前後空白を除いた完全一致である。引用符・block style 自体は判定を変えない。
1項目が必須 command そのものなら許可するが、`echo`、コメント、複数コマンドの shell block の途中への埋込みは
不合格とする。check の2項目は `cmd` object、別 task 呼出、外部 script への移動で代用できない。
順序を固定せず、同じ command の反復も禁止しない。

## 検査の境界

この仕様は Task の全機能の代替 schema ではない。許可リスト外の設定を拒否した上で、文字列内の
動的テンプレート、task 呼出の参照先、task graph、任意 shell の到達可能性・意味は検証しない。
必須 command の存在を、その実行成功の保証として扱わない。外部環境や任意 shell の故意の迂回を
防ぐ sandbox でもない。

## 独立した先行検査

依存導入後、ローカル最終検証は次の順に実行する。前半が失敗した場合、Task を起動しない。

```bash
node repo-tools/entrypoint.mjs check-contracts && task check
```

CI の `check` / `rename-smoke` も、locked dependencies 導入後（改名 job は改名後）に独立した
`check-contracts` step を置き、成功した場合だけ次の `task check` step へ進む。両 step と job に
skip 条件・`continue-on-error` を置かない。Taskfile 自身の検査起動を Taskfile に依存させない。
ローカル検証成功だけで merge-ready とせず、PR の hosted CI 成功を merge 条件とする。

Skill frontmatter は既存の `skill-updater/metadata.ts`、旧 metadata 移行の range 検証は既存の
`skill-updater/migration/semver-policy-v1.ts` が所有する。いずれも既に library へ委譲されており、本変更では
書き換えない。廃止済み automation / SemVer 範囲選択を復活させず、runtime version の契約統一は Issue #50 が所有する。
