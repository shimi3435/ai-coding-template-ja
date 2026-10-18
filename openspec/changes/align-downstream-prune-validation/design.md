# 設計: 下流とテンプレート保守の検証境界

文書種別: 設計リファレンス。承認済みの挙動を固定し、内部関数の命名や分割を過剰に規定しない。

## 1. 検証入口と責務

- `./scripts/check.sh`: 下流の正式 gate。Task 起動前の `check-contracts` と、
  成功後の `task check` を維持する。保守文書の内容検証を自動選択しない。
- `task check`: runtime、npm / Python dependency、Taskfile の安全契約、
  remote / legal / links の offline 検証、通常の型・lint・テストを維持する。
- `task check:template`: 保守専用の履歴・release・出荷契約と、使い捨て repository の
  prune 統合検証を実行する。内部で通常 gate を無条件再帰実行しない。
  同梱構成が不完全なら失敗し、資産不在を skip 成功に置き換えない。
- テンプレート保守者のローカル完了確認は `./scripts/check.sh` 成功後に
  `task check:template` を実行する。専用 CI は `task check:template` を使い、
  通常 CI の正式 gate と合わせて両方の成功を必要とする。専用 CI で同一 checkout の
  共通 gate を重複実行せず、二つの workflow の完了順には依存しない。
- repository 名、remote URL、GitHub owner、環境変数によって検証責務を推測しない。

共通 gate は prune 構成の整合を検査するが、同梱状態でも保守文書の記述内容・特定 release 版を
検査しない。通常の lint / format が存在する保守コードを走査することは許す。
保守専用の意味検証・統合テストを通常の pytest / Node test の自動収集へ混入させない。

`TEMPLATE_VERSION` は既存の単一行 SemVer 形式検証を維持し、特定値との一致だけを共通 gate
から外す。本 change ではファイル自体の値を変更しない。出荷版の判断は #70 が所有する。

## 2. 恒久資産の配置と移設

### 下流に残す文書

以下は保守履歴ではなく現在の下流 interface の説明である。実装時に内容を移設し、
prune 実行時に移動や内容推測を行わない。

| 現在 | 移設先 |
| --- | --- |
| `docs/template/repository-contracts.md` | `docs/reference/repository-contracts.md` |
| `docs/template/skill-maintenance.md` | `docs/reference/skill-maintenance.md` |
| `docs/template/skill-metadata-v2.md` | `docs/reference/skill-metadata-v2.md` |

相互リンク、README、guide、workflow の live links を移設先へ揃える。
`docs/reference/prune-template-assets.md` に対象、interface、状態、復旧手順を置く。
README の変更は入口・リンク・削除範囲の説明に限定する。

### 保守側へ移す検証

- `repo-tools/repository-contracts.ts` と対応 tests / fixtures の release handoff と版固定。
- `tests/test_runtime_foundation_contract.py` の release handoff。
- `tests/test_openspec_direct_workflow_contract.py` の過去 ADR の supersede 関係。
- `tests/test_review_convergence_contract.py` の過去 ADR 参照部分。
- `tests/test_tool_neutral_documentation_contract.py` の履歴・出荷 residual allowlist・
  historical release notes・retrospective 内容検証。
- `tests/test_project_gate_contract.py` の保守専用文書に対する検査。

混在するファイルはテスト単位で分ける。現行 policy、公開入口、安全性、下流文書リンク、
撤去済み公開操作の拒否等の回帰テストは通常側に残す。
保守検証の実体は §3.1 の M16〜M18 の3ファイルに固定し、既存 pytest で明示実行する。
保守テストは通常側の fixture を利用できるが、逆向きの import は禁止する。

`docs/agents/workflow.md` 内のテンプレート限定の retrospective 手順は、
M12 `docs/template/release.md` の末尾へ、見出しと本文を保持して移す。
archive / close の既定動作や executor 手順は変更しない。#66 が所有する設計を先行実装しない。
既存 historical records の本文や過去の判断を現行方針で上書きしない。

### Tool-neutral residual contract の限定変更

本 change は `tests/test_tool_neutral_documentation_contract.py` の residual contract の変更を
正式な scope に含める。M03 / M08 の exact path は manifest にそのまま記載し、分割・符号化しない。
既存の歴史ファイル3件の allowlist と、追跡 path / symlink target を含む検査を維持した上で、
allowlist 外の通常ファイルの本文にある **M03 / M08 の完全な repository 相対 path token**
だけを旧名称検出から除外する。参照先の現存・prune 状態から許可集合を生成しない。

token は §3.1 の path と bytes が一致し、直前・直後が入力端、ASCII 空白、または
`'`、`"`、backtick、丸括弧、角括弧、山括弧、comma、semicolon のいずれかであるものに限る。
一致した token の範囲だけを除外し、同じ行・ファイルの残りの bytes は既存規則で検査する。
basename だけ、prefix / suffix を加えた path、旧名称単独、旧機能の案内・呼出は許可しない。
新しいファイル単位の例外、OpenSpec directory 全体の除外、任意に追加できる allowlist は作らない。
この例外は旧名称検査だけの規則であり、§3.2 の専用実行参照・link の禁止を解除しない。

Task 1 で契約とその正例・負例を変更してから gate を確認する。出荷固有の検査を保守側へ移す際も
この限定規則を保持し、撤去済み公開操作の拒否などの通常側の回帰検証を削除しない。
Task 5 では active change を残したまま正式 gate と保守 gate を成功させ、Task 6 の close に進む。
close による仕様文書の削除を、検査失敗の解消策にしてはならない。

### 履歴文書の不変条件

「historical records は書き換えない」とは、過去の判断・記述内容を現行方針で改変しないことをいう。
上表の3文書の移設に限り、既存の Markdown link / reference definition の destination を、
同じ参照対象の新しい相対 path に置き換える機械的修正を許可する。
link label、title、fragment、本文、見出し、過去のコマンド、空白・改行を含む destination 外の bytes は保持する。
外部 URL の書換えや内容修正、リンク切れを口実とする追記・整理はこの例外に含めない。

現在の履歴集合 M01〜M15 にある該当リンクは、M15 の次の1件である。

| 文書 | 表示名 | 修正前 destination | 修正後 destination |
| --- | --- | --- | --- |
| `docs/template/v2-release-notes.md` | repository contracts の受理仕様 | `repository-contracts.md` | `../reference/repository-contracts.md` |

このリンク1件と、M12 末尾への retrospective 手順の移設追記だけを許可する。
M12 の既存 bytes はすべて保持し、追記する本文は workflow の現行手順と一致させる。
この限定例外は2026-10-08の利用者承認に基づき、manifest の追加・他の履歴編集を許可しない。
これら以外の履歴本文の bytes は本移設で変えない。追加の該当リンクが判明した場合は、
編集前に同じ移設先3文書への参照であることを確認し、本表と V15 を更新する。
close 時の policy が要求する retrospective の新しい1行は別の既存義務であり、
過去行の変更を許可しない。V15 はリンク移設差分と close の追記差分を分けて確認する。

## 3. prune の対象と保持境界

公開入口は既存の `task prune-template-docs` と `-- --apply` を維持する。
`scripts/prune-template-docs.py` は直接呼出も含め同じ契約を提供する。

固定削除対象:

- `docs/template/`: 下流向け3文書を移設した後の保守文書と履歴。
- `template-maintenance/`: 分離した保守専用コード・テスト・fixtures。
- `.github/workflows/template-maintenance.yml`: 新設する保守専用 workflow。

固定編集対象:

- `Taskfile.yml`: `check:template` task の除去。
- `README.md`: 保守専用のローカル実行案内・リンクを囲む専用区画の除去。
- `docs/agents/workflow.md`: 保守手順への専用リンク区画の除去。

新しい保守 CI は独立 workflow に置き、既存 `.github/workflows/ci.yml` の共通 job を
prune 時に書き換える必要をなくす。同ファイルの既存 job を prune で消さない。
共通文書に残る「prune で何を除去するか」の説明中の path は実行依存や live link と区別する。
通常テストの負例 fixture 内の文字列も実行依存と見なさない。

prune 実装・状態検査・固定対象定義は下流に残す。下流の3リファレンス、`docs/adr/`、
`TEMPLATE_VERSION`、Skill 本体・source / lock・legal・links、通常 CI、通常テストは削除しない。
既存の保守履歴へ除去可能な区画 marker を後付けしない。

区画 marker は `template-maintenance:start` / `template-maintenance:end` とし、
Markdown では HTML comment を使う。重複、片側欠落、入れ子、順序逆転は拒否する。
区画外に専用実行参照が残る場合も拒否する。共有ファイル全体を再生成しない。
Taskfile は task key と対応する source 範囲を特定して編集し、重複 key や曖昧な範囲は拒否する。
対象外部分の bytes、改行、コメント、順序を保持する。

### 3.1 固定資産 manifest（規範）

以下は本 change 完了後の manifest の全件であり、現存ディレクトリの走査結果から必須集合を作らない。
`regular` は symlink でない空でない通常ファイル、`directory` は symlink でないディレクトリである。
「必須」は同梱状態での必須性を表す。M / D の欠落は1件でも同梱状態不成立となる。
K は下流に残る資産であり、完全除去でも必須である。一般の共通資産の検証は既存の担当を維持する。

| ID | path | expected type | 同梱状態で必須 | prune 時の扱い |
| --- | --- | --- | --- | --- |
| D01 | `docs/template/` | directory | はい | subtree 全削除 |
| D02 | `docs/template/adr/` | directory | はい | D01 とともに削除 |
| D03 | `template-maintenance/` | directory | はい | subtree 全削除 |
| D04 | `template-maintenance/tests/` | directory | はい | D03 とともに削除 |
| M01 | `docs/template/adr/0001-skill-distribution-vendoring.md` | regular | はい | 削除 |
| M02 | `docs/template/adr/0002-mcp-remote-default-node-not-core.md` | regular | はい | 削除 |
| M03 | `docs/template/adr/0003-openspec-gsd-boundary.md` | regular | はい | 削除 |
| M04 | `docs/template/adr/0004-github-mcp-optional-gh-cli-core.md` | regular | はい | 削除 |
| M05 | `docs/template/adr/0005-template-update-not-propagated.md` | regular | はい | 削除 |
| M06 | `docs/template/adr/0006-template-meta-docs-isolated.md` | regular | はい | 削除 |
| M07 | `docs/template/adr/0007-downstream-usage-guide-sot-boundary.md` | regular | はい | 削除 |
| M08 | `docs/template/adr/0008-adaptive-openspec-gsd-execution-boundary.md` | regular | はい | 削除 |
| M09 | `docs/template/adr/0009-proportional-agent-workflow-evidence-economy.md` | regular | はい | 削除 |
| M10 | `docs/template/adr/0010-openspec-direct-execution.md` | regular | はい | 削除 |
| M11 | `docs/template/adr/0011-v2-distribution-boundaries.md` | regular | はい | 削除 |
| M12 | `docs/template/release.md` | regular | はい | 削除 |
| M13 | `docs/template/retrospectives.md` | regular | はい | 削除 |
| M14 | `docs/template/v2-boundary-audit.md` | regular | はい | 削除 |
| M15 | `docs/template/v2-release-notes.md` | regular | はい | 削除 |
| M16 | `template-maintenance/tests/test_release_contract.py` | regular | はい | 削除 |
| M17 | `template-maintenance/tests/test_history_contract.py` | regular | はい | 削除 |
| M18 | `template-maintenance/tests/test_prune_integration.py` | regular | はい | 削除 |
| M19 | `.github/workflows/template-maintenance.yml` | regular | はい | 単独ファイル削除 |
| S01 | `Taskfile.yml` | regular / `tasks.check:template` mapping が1件 | はい | 専用 task だけ除去、ファイル保持 |
| S02 | `README.md` | regular / 専用 marker pair が1組 | はい | 専用区画だけ除去、ファイル保持 |
| S03 | `docs/agents/workflow.md` | regular / 専用 marker pair が1組 | はい | 専用区画だけ除去、ファイル保持 |
| K01 | `docs/reference/repository-contracts.md` | regular | はい | 保持 |
| K02 | `docs/reference/skill-maintenance.md` | regular | はい | 保持 |
| K03 | `docs/reference/skill-metadata-v2.md` | regular | はい | 保持 |
| K04 | `docs/reference/prune-template-assets.md` | regular | はい | 保持 |
| K05 | `tests/fixtures/template_prune/references.json` | regular / JSON データ | はい | 保持 |
| K06 | `scripts/prune-template-docs.py` | regular | はい | 保持 |
| K07 | `docs/adr/` | directory | はい | subtree 保持 |
| K08 | `TEMPLATE_VERSION` | regular / 既存の単一行版形式 | はい | bytes 不変で保持 |

M01〜M15 の15文書を必須とし、ADR を glob や「最新のものだけ」で選択しない。
M16 は release handoff・版固定、M17 は ADR・履歴・出荷契約、M18 は使い捨て repository の
統合検証を担当する。S01 は既存 pytest でこの3ファイルを明示実行する。追加 runner は作らない。
補助コード・fixture をテンプレート保守側へ追加する場合は、追加前に本表と実装側の固定定義、
欠落テストを同時更新する。現在必須とする補助ファイルはない。

削除 subtree 内の利用者が追加した通常ファイルは必須集合へ自動追加しない。
同梱判定では追加自体を破損とせず、apply では追跡済み・変更なしのものを含め全件 preview して削除する。
未追跡・ignored・危険な file type は従来の preflight で拒否する。
`docs/template/` の下流向け旧3文書は移設後の manifest に含めず、K01〜K03 を正とする。
固定削除対象外の asset を marker・拡張子・名前の類似から自動的に削除対象へ加えない。

### 3.2 直接参照の検査契約（規範）

`live reference` と「専用実行参照」は、本節の surface / 構文で検出する参照だけを指す。
任意コードの実行時依存を完全に解析する意味には使わない。検査はコード・コマンドを実行せずに行う。
検査結果には surface ID、source path、位置、検出した task 名または参照先を含める。

参照先集合は task 名 `check:template` と、D01 / D03 配下の path および M19 の exact path である。
単語の部分一致で `check:template-extra` や `docs/template-example/` を拒否しない。
引用・escape はその言語の literal として解釈するが、変数展開・評価・名前解決による実行はしない。
path の `.` / `..` を字句的に解決して component 単位で比較し、実体の存在を比較条件にしない。
コマンド引数は以下で定める effective cwd 基準、相対 import は import 元基準、
Markdown リンクは文書の親基準とする。P / J のファイル読取りは repository root 基準とする。
repository 内の絶対 path も同じ対象へ正規化する。
repository 外の参照はこの prune 参照集合には含めず、既存の安全検査を代替しない。
Unicode 正規化・case-fold はせず、Markdown の fragment / query は path 比較から除く。

surface の path pattern は検査対象を選ぶ規則であり、manifest の必須集合を生成する glob ではない。
列挙された directory 内で該当する現存ファイルは追跡状態にかかわらず検査する。
symlink は追跡せず、該当 source が symlink / 読取不能 / 構文不正なら診断付きで拒否する。
通常 tests は production code と同じ構文規則で検査し、ファイル名を理由に除外しない。

| ID | 検査 surface | live とする構文 |
| --- | --- | --- |
| R01 | `Taskfile.yml` | canonical Taskfile 検証が成功した構造だけを対象とする。`tasks.*.cmds[].task` の専用 task 名、`cmds` 内の string / `cmd` 本文を C 規則で検査。`tasks.check:template` 自体の所在は S01 の構造検査 |
| R02 | `package.json` の `scripts` 値 | command string を C 規則で検査。ほかの metadata field は対象外 |
| R03 | `.github/workflows/` 直下の `.yml` / `.yaml` | `jobs.*.steps[].run` は effective cwd を反映した C 規則。job / step の `uses` が `./` で始まる local path、step の `working-directory`、root / job の `defaults.run.working-directory`、step の `with.path` / `with.paths` / `with.cache-dependency-path`、`on.push` / `on.pull_request` の `paths` / `paths-ignore` の literal path |
| R04 | `scripts/` 配下の `.sh` / `.py` | shell は C 規則、Python は P 規則。docstring・comment・単なる文字列代入は参照ではない |
| R05 | `repo-tools/` 配下の `.ts` / `.mjs`、`tests/` 配下の `.py` | TypeScript / JavaScript は J 規則、Python は P 規則。Node tests と pytest の実行コード・import も対象 |
| R06 | `README.md`、`AGENTS.md`、`CLAUDE.md`、`CONTEXT.md`、`docs/guide.md`、`docs/agents/`・`docs/reference/`・`docs/optional/` 配下の `.md`、`.agents/skills/` 直下各 Skill の `SKILL.md` | 下記 M 規則による command / link。通常の prose と path / task 名だけの code span は対象外 |

R03 の path field は string または string sequence を対象とし、複数行の値は空行を除く各行を扱う。
path filter は先頭 `!` を除き、参照先集合の root が literal prefix として現れる場合を検出する。
`docs/template/**` は検出し、`**/*.md` のような汎用 glob の全展開はしない。
`name`、`env`、任意の `with` field、GitHub expression を評価した値は本規則の対象外である。
cwd field の式は以下の解析範囲の規則に従い、未評価の範囲と理由を報告する。

#### R01 の canonical validation と effective cwd

R01 は既存の `repo-tools/repository-taskfile.ts` の canonical validation を最初に実行し、
成功した構造だけに prune 固有の参照検出を適用する。解析済み構造を内部で共有し、
YAML / Taskfile の許可 key・型・template・必須 route 等の判定を scanner に複製しない。
公開契約を拡張せず、`dir` / `includes` / `deps` / `defer` / `if` / `status` /
`preconditions` 等、既存 validator が拒否する入力はそこで停止する。
R01 の初期 cwd は repository root とし、各 task の `dir` の受理・解決は実装しない。

R03 の `run` は `step.working-directory > job.defaults.run.working-directory >
workflow.defaults.run.working-directory > repository root` の順で選択する。
選択した値が非空の literal path なら、下位設定と連結せず、repository root 基準で字句的に解決する。
専用参照の比較に path の存在を要求せず、生成前・削除後の path も比較する。
`uses` / path filter / `with` の path 判定へ `run` の cwd を流用しない。
優先順位は [GitHub Actions defaults](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/set-default-values-for-jobs) に従う。

cwd field の省略だけは下位設定へ進む。選択した field が式・変数・空・null・非 string 等で
解決できない場合は cwd 不明とし、下位設定や root へフォールバックしない。
上書きされた下位設定が動的であっても、それだけで選択済みの静的 cwd を未評価にしない。
repository 外の cwd や既知の symlink 等で字句的な repository 相対解決を保証できない場合も
cwd 不明とする。これは scanner の保証限界であり、新しい workflow schema / filesystem policy
として拒否しない。既存 gate の独立した構文・安全性検証は維持する。

R02 / R04 / R05 / R06 の C 規則は repository root を初期の検査基準とする。
任意の呼出元・起動 API の cwd option・プロセスの cwd 変更を追跡する保証は追加しない。
C が認識した shell 内移動は次節の単位で未評価とし、workflow から script 内へ状態を伝播しない。
既知の cwd は literal な相対 executable / 引数の解決と `sh -c` / `bash -c` の検査へ渡す。
不明な場合は相対 path を未評価とするが、cwd 非依存の task 名・絶対 path の検査は継続する。

#### C: 直接コマンド

shell の単純コマンドと literal argv sequence を対象とする。shell の構文解析・位置情報・
R06 の文書記法は §8 に従い、以下は AST に対する意味判定とする。
shell は改行・`;`・`&&`・`||`・pipe で区切られた単純コマンドを認識し、literal の引用と
backslash-newline を処理する。先頭の literal 環境変数代入、`command` / `exec` を取り除いて判定する。
function body 内に直接書かれた単純コマンドも検査するが、関数呼出や alias を展開して追跡しない。
comment、here-document の payload、変数展開、command substitution の内容は検査しない。
未対応の構文を「参照なしの実行保証」と表現しない。

C が `cd` / `pushd` / `popd` を command word として認識した場合、移動先が literal でも
分岐・関数・subshell の cwd を追跡しない。当該 shell 単位全体の cwd 依存参照を未評価とする。
単位は R01 の各 `cmds` string / `cmd` 値、R02 の各 script 値、R03 の各 `run` 値、
R04 の各 `.sh` file、R06 の各 shell fence / command code span、P / J の各 shell command string
である。再帰解析する literal な `sh -c` / `bash -c` 本文もその単位に含める。
実行順序を解析しないため移動前の相対参照も含むが、別の task command・step・file へは波及させない。
comment / echo 引数 / JSON payload 内の同名文字列は移動として認識しない。

未評価にしても source 全体の検査は省略せず、以下の cwd 非依存の参照は検出し続ける。
専用参照のない `cd src` と `make` の通常 script を、この解析限界だけで拒否してはならない。
root 初期化の2構文、特定のファイル名・変数名に対する個別例外は設けない。

- executable の basename が `task` で、literal 引数の一つが exact `check:template` なら参照とする。
- executable 自体が参照先 path、または `sh` / `bash` / `python` / `python3` /
  `python3.14` / `node` / `pytest` / `uv` の literal 引数が参照先 path なら参照とする。
  絶対 path は cwd 不明でも比較し、相対 path は cwd 既知の場合だけ比較する。
  `uv run python ...`、`node --test ...`、`pytest ...` もこの規則に含む。
- `sh -c` / `bash -c` の直後の literal 本文は同じ C 規則で検査する。
  `python -c`、`node -e` 等の別言語の文字列内プログラムは評価・再解析しない。
- `echo` / `printf` の表示引数、単なる prose 中の文字列をコマンド参照にしない。

#### P / J: import・プロセス起動・ファイル読取り

検査する callee / 構文を以下に限定する。標準 import の単純な alias は元の名に対応付けるが、
代入による別名、user wrapper、反射、関数間のデータフローは追跡しない。

| 規則 | 検出する構文 |
| --- | --- |
| P-import | `import` / `from ... import` の module 名を path 要素へ対応付けた参照、`importlib.import_module` の literal module 名、`importlib.util.spec_from_file_location` の第2引数の literal path |
| P-command | `subprocess.run` / `Popen` / `call` / `check_call` / `check_output` の第1引数に直接置かれた literal list / tuple は C の argv 規則。literal string は shell 実行を指定した場合に C 規則。`os.system` の literal string も C 規則 |
| P-read | `open` / `io.open` の第1引数と、`Path(...).read_text` / `read_bytes` の path 式。write-only の mode だけを指定する open は除く |
| J-import | literal module specifier を持つ `import ... from` / side-effect `import` / `export ... from` / `require(...)` / `import(...)` |
| J-command | `node:child_process` または `child_process` の `spawn` / `spawnSync` / `execFile` / `execFileSync` の直接 literal command と literal argv は C 規則。`exec` / `execSync` の literal string は C 規則 |
| J-read | `node:fs` / `node:fs/promises` または prefix なしの同 API の `readFile` / `readFileSync` / `createReadStream` の第1引数 |

path 式の対応範囲は literal string、`Path` / `PurePath`、`os.path.join` / `path.join` /
`path.resolve` の literal 要素、および Python の `/` 連結とする。
これらの先頭に `REPO_ROOT` / `ROOT` / `repositoryRoot` がある形は repository 相対の
静的 path 表現として扱う。これ以外の変数の値を追跡しない。
path を組み立てるだけの式、`exists` / `existsSync`、表示・assertion用の文字列は読取参照ではない。
fixture のソース文字列を代入しただけでは import と解釈しないが、
新しい負例は後述の JSON に集約し、通常 test file を blanket exclusion にしない。

#### M: 共有文書

- info string が空、`sh`、`bash`、`shell`、`console` の fenced code block は C 規則で検査する。
  `console` の行頭 `$ ` は prompt として除く。インライン code span も C 規則で
  完全な専用コマンドと認識できる場合は参照とする。
- inline link / image、および reference-style link / image の定義先が local path の場合、
  参照先集合に解決されれば参照とする。定義だけの link target も検査する。
  escaped Markdown delimiter・山括弧で囲った destination・percent encoding を解釈し、
  fragment-only と scheme を持つ外部 URL は対象外とする。destination は fragment / query を
  分離してから percent decode し、字句的な path 解決を行う。
- `template-maintenance/` のような path だけ、`check:template` のような task 名だけの
  code span、HTML comment、通常 prose は参照にしない。
  `text` / `json` 等、上記以外の code fence と raw HTML の href は対応範囲外である。
  live な保守コマンドをこの除外形式に隠してはならない。

#### 許可された所在・除外・保証限界

同梱時に専用参照を置けるのは、削除する D01 / D03 / M19 と、S01 の task 本体、
S02 / S03 の専用区画だけである。削除する subtree の内容は保守 gate の担当とし、
残存参照検査は保持する surface を対象にする。同梱時も、それ以外の surface にある
検出対象参照は不整合として拒否する。完全除去時はこの許可所在も存在してはならない。

負例データは K05 の JSON 配列に集約する。空配列と重複 ID は拒否する。
各 case は string の `id`、`surface`（R01〜R06）、`path`（surface 内の repository 相対 path）、
`source`（ソース文字列）、`expected`（`detected` / `not-detected` / `invalid-syntax`）と、
`coverage`（`evaluated` / `partial` / `not-run`）を持つ。`invalid-syntax` は canonical contract
違反も含み、その場合の coverage は `not-run` とする。cwd による未評価は `partial` とし、
`detected` と併存できる。`not-detected` / `partial` は未評価参照の不存在を意味しない。
`evaluated` は列挙した構文の cwd 依存参照に未評価がないことだけを表し、列挙外の依存解析を保証しない。
R01〜R06 の各 surface に検出・非検出の両 case を要求し、各対応構文と構文拒否は V06 / V11 の
パラメータ化したケースで確認する。
JSON は import / 実行しないデータであり、その中のソースを再帰的に参照検査しない。
テストは使い捨て repository の該当 surface に内容を配置してから実 scanner を呼び出す。
既存の fixture 全体や通常 tests を除外する規則、利用者が自由に追加する skip comment / allowlist は作らない。

動的に作った task 名・path、変数だけの argv、user wrapper、呼出元由来の実行時 cwd、列挙外 API /
言語 / surface、実行時に生成した source の依存切れは検出保証外である。
これらを動かして調べること、専用識別子の全文 grep を完全な代替検査とすることは禁止する。
構成状態とは別に、評価した範囲と未評価の source path / 位置 / surface ID / 理由を報告する。
未評価がある場合の表示は §8 に従い、cwd・placeholder・文書断片・解析エラーを区別する。
未評価を「参照なし」や不整合へ置き換えず、候補文字列の有無で未評価を隠さない。
報告は通常 gate / doctor / preview / apply / 適用後検査 / no-op で共通とし、
未評価だけでは非ゼロ終了・doctor の FAIL・apply blocker にしない。追加の force / 承認操作も要求しない。
検出した専用参照、canonical contract 違反、資産の破損、Git・変更保護の失敗は引き続き拒否する。
動的参照と同様、未評価先が実際に保守資産へ到達する可能性は残る。任意コードの依存解消を保証せず、
利用者はこの限界を踏まえて別途確認する。解析限界を既存の独立した検証の skip に使わない。

#### 実装規模の判断

R01〜R06 を維持する。設定だけへ絞ると通常 scripts / tests の呼出・読取や文書リンクの残存を
手作業に委ねるため、この change では列挙した静的解析の保守コストを意図的に引き受ける。
shell 構文解析は §8 の固定 mvdan/sh と限定 patch を使用する。新規依存はこの承認範囲に限る。
変数追跡、任意 wrapper、実行時解析、列挙外の参照構文は追加しない。
R01 の canonical validation を共有し、Taskfile の受理言語を scanner 側で拡張しない。
これを口実に構文保証を黙って減らさず、仕様拡張・dependency 追加が必要なら停止・再計画する。

## 4. 状態判定

判定は §3.1 の manifest、file type、共有ファイルの専用項目、§3.2 の直接参照の整合で行う。
実装の固定対象定義は path / 種別 / 区画を列挙するだけとし、利用者が profile を選ぶ設定、
本文 hash、実行 receipt、Git の過去 commit への参照は持たない。
必須集合は §3.1 の各行で固定し、current tree から推測しない。M01〜M19 の各1件欠落も検出する。
新しい保守必須ファイルを追加する変更では、定義と対応 tests を同時に更新する。

- **同梱**: 全必須保守資産と専用 task / workflow / 区画が揃い、型と参照が整合する。
  文書内容の正しさは保守 gate が検査する。
- **完全除去**: 固定削除対象と専用項目が存在せず、§3.2 の評価できた範囲に専用参照の検出がない。
  S01〜S03 の共有ファイルと K01〜K08 を含む下流必須資産は保持されている。
  専用 gate 自体の不在は正常であり、通常 gate は保守 gate を呼び出さない。
- **不整合**: 上記のどちらでもない。欠落、空の必須文書、壊れた link、誤った file type、
  空ディレクトリだけの残存、共有設定の片側変更等を含む。

解析失敗は §8 の analysis_errors として構成状態から分離し、全入口で非成功とする。
未評価は構成状態と独立した解析範囲の情報であり、第4の構成状態にしない。
同梱 / 完全除去と未評価は併存できる。完全除去を任意の実行時依存の不存在と解釈しない。

一般の下流破損は共通 gate の該当検査が拒否する。完全除去によって共通検証を skip しない。
操作記録がないため、手動で同じ最終構成にした状態も完全除去として受理する。
旧 prune の文書だけ欠落した状態は不整合であり、自動移行・自動補完しない。

完全除去での再実行は、変更を一切しない構成検査を先に行い no-op 成功する。
直前の prune 差分が未コミットであるだけでは拒否しない。
ただし shared file の構文破損、残存参照、再出現した対象資産は成功扱いしない。
この read-only no-op は、実際の変更に必要な「削除対象が追跡済み」という条件の例外である。
prune コマンドとしての Git / HEAD / repository root の確認は no-op でも行う。
共通 gate の構成分類そのものに、新たな Git 履歴照会や prune の差分なし条件は追加しない。

## 5. preview と適用前検査

引数なしは preview、`--apply` は適用、`--help` は説明のみとする。
任意 path、force、profile、修復、復元の引数は追加しない。未知引数と `--apply` の重複は非ゼロで拒否する。
対象 repository は script の配置場所から決定し、呼出 cwd に依存させない。

preview は削除 path、共有ファイルの編集差分、保持対象、判定状態、解析範囲、適用 blocker を表示する。
未評価の参照範囲は blocker と分けて表示し、他の条件が成立すれば apply を許可する。
書込み・一時ファイル・Git index 更新・dependency install・外部接続は行わない。
成功 preview は exit 0、適用不能な構成・差分・Git 不在等を検出した preview は非ゼロとする。
Git 不在でも読み取れる削除予定は表示し、差分保護が未確認であることを明記する。

変更する apply は以下をすべて満たすまで一件も書き込まない。

1. runtime / dependency が利用可能で、構成が同梱状態である。
2. 対象 root は Git working tree の top-level と一致し、HEAD が存在する。
   bare repository や外側 repository に偶然含まれるだけの配置は拒否する。
   通常 clone と正規の linked worktree は許す。Skill updater の別の隔離制約を流用しない。
3. 削除・書換え対象の現存ファイルが HEAD / index で追跡済みで、
   staged / unstaged / conflict / rename / mode change がない。
   削除ディレクトリ内の追加ファイルは ignored を含め拒否する。
   共有ファイルの区画外だけの未コミット変更も、そのファイルを書き換える場合は拒否する。
   Git status の表示だけを根拠にせず、対象の実体・mode と HEAD / index の一致を確認する。
   assume-unchanged / skip-worktree 等で隠された変更も許可しない。
4. 対象 root より内側の祖先・対象・子孫に symlink、特殊 file、submodule、
   入れ子の Git 管理領域がない。dangling symlink も不在として扱わず拒否する。
   固定対象外・repository 外へ到達する path を拒否する。
5. すべての共有編集範囲を一意に決められ、編集後の構文と完全除去構成を検査できる。
6. 全体 plan 作成後、書込み直前に対象の状態を再確認する。変更検知時は停止する。
   協調しない他 process による任意の同時書換えに対する OS sandbox / 完全排他は保証しない。

コミット済みの対象内カスタマイズは preview に表示され、`--apply` の削除対象になる。
対象外差分は staged / unstaged / untracked / ignored を問わず変更・stash・commit しない。
Git の path は NUL 区切りで扱い、空白・改行・Unicode を shell 展開や trim で変形しない。

## 6. 適用・失敗・復旧

同一入力の表示順と適用順は repository 相対 path の安定順とし、共有編集後に固定削除を行う。
各共有ファイルは必要な部分だけ変更し、変更成功した対象を追跡する。
適用後は構成が完全除去であり、§8 の共通成功条件を満たすことを再検査してから exit 0 を返す。
ここで full setup / gate を暗黙に実行したり、install / network を開始したりしない。

I/O 失敗・検査失敗は非ゼロ終了する。通常の例外を捕捉できた場合は、変更済み・失敗箇所・
未処理対象、開始時 HEAD と対象限定の復旧方法を表示する。
複数ファイルの原子的 commit や自動ロールバックは提供しない。
共有編集用の一時ファイルが必要なら、自分で作った一時ファイルだけを通常終了時に cleanup する。

kill / host crash 時の最終診断や cleanup は保証しない。次回は残存構成を再判定し、
部分状態なら停止する。全変更が完了していた場合だけ完全除去として no-op 成功できる。
部分変更を推測で継続・巻き戻ししない。

復旧は利用者が現在の差分を確認し、失敗後に追加した作業を保護した上で、
表示された開始時 commit から対象だけを復元する手順とする。
全 repository の reset / clean は案内しない。旧 prune が既に commit 済みの場合は
対象資産が揃っていた commit を利用者が選ぶ。`TEMPLATE_VERSION` から復元 commit を推測しない。
GitHub の PR / Issue / branch、host の登録や設定は操作しない。

## 7. 検証・残る責務

[validation.md](validation.md) の実動作を優先し、[spec-holes.md](spec-holes.md) の全分類を対応付ける。
通常 CI とローカル gate、保守 CI と明示保守 gate の組をそれぞれ一致させる。
prune smoke は使い捨てコピーの通常 gate だけを呼び、保守 gate を再帰呼出しない。

#74 への引き渡しは「同梱中は offline 検証、完全除去後は専用検証を要求しない、
host 登録解除は別操作」という境界だけとする。今回の固定対象に任意 Skill を混ぜない。

## 8. shell parser と解析報告の契約（規範）

2026-10-15に利用者が改訂全体、依存採用、本実装再開を承認した。本節は §1〜7 と一体の規範である。
候補比較と個別判断の経緯・試作証跡は tasks.md に保持する。
BSD-3-Clause の mvdan/sh v3.14.1（commit `a3f0c75d21d918756fa38de8b5d3429efde7948b`）を採用し、
評価済みの限定 patch を保守する。patch は redirection 行継続、heredoc delimiter の quote removal /
引用情報集約 / 終端比較前の行継続処理、および raw AST に対応する既存展開処理の調整に限る。
Go 1.27.2 linux-amd64 を setup 専用とし、archive / patch の hash は tracked manifest に固定する。
上流更新時は patch 再適用と upstream suite / 恒久 fixture を検証する。広範な grammar 改造が
必要なら停止・再計画する。旧 lexer fallback と実行用 shell の独自前処理による構文補修は禁止する。

shell 構文解析全体を置換するが、C の意味判定、cwd 方針、展開内部・heredoc payload の非検査境界は
維持する。既存の有効な Bash 入力を拒否する変更で対応範囲を縮小しない。通常検査は入力を実行しない。
Taskfile の canonical validation 先行と受理構文は変更しない。

R06 だけで未引用・未 escape の `<name>` を文書用 placeholder とする。name は
`[A-Za-z_][A-Za-z0-9_-]*`、語中表記も対象とし、引用済み / escape 済みなら通常の literal である。
placeholder をリダイレクトより優先し、`task <input> check:template` は専用参照、
`task < input > check:template` はリダイレクトとする。実行用 shell にはこの読み替えを適用しない。
検査対象が placeholder に依存する範囲は理由付き partial とし、混在する既知の参照を拒否する。

### 固定 parser と setup / runtime

通常検査では shfmt CLI 全体を使わず、`syntax` / `syntax/typedjson` と標準 library だけを
直接利用する専用 bridge を準備する。内部依存の `fileutil` も同じ固定 source に含まれる。
入力は stdin の shell source、成功出力は typed JSON AST とし、解析失敗時は非成功・診断を返す。
成功 AST を解析失敗と混在させず、入力コマンドは実行しない。bridge の version / source も
固定入力に含め、旧 lexer や PATH 上の別 parser へ fallback しない。

準備先は repository 内の gitignore 対象 `.cache/` 配下とし、HOME や system Go に依存しない。
Go archive、upstream source archive、patch を固定 hash と照合してから展開・適用・実行する。
bridge、build option、OS / CPU を artifact identity に含める。専用 Go の絶対 path を使い、
`GOTOOLCHAIN=local`、`GOENV=off`、`GOWORK=off`、`CGO_ENABLED=0`、`GOPROXY=off`、
`GOSUMDB=off` と専用 cache を指定する。build は `-mod=readonly -trimpath -buildvcs=false` とし、
parser-only bridge の build 中に追加 module や別 toolchain を取得しない。

setup は staging 領域で build と最小の parse smoke を成功させ、入力 identity と binary hash を
対応付けた artifact を準備した後、参照先を atomic に更新する。checksum 不一致や build 失敗で
以前の artifact を上書きしない。同じ入力で検証済み artifact があれば再 build は不要とする。
runtime は現在の固定入力と artifact identity / binary hash を照合し、欠落・破損・別入力の
artifact なら setup の再実行を案内して非成功とする。以前の版を保持していても、現在の入力と
一致しなければ利用しない。gate / doctor / preview / apply / 適用後検査 / no-op から取得・
install・build を開始しない。この provenance は dependency 準備の検査用であり、prune の
構成状態を記録する receipt や、状態判定の正本にはしない。

既存 `task setup` と CI の dependency 準備段階に組み込み、通常の offline gate より前に済ませる。
`task setup:node` の Node-only の責務は維持する。prune 後にも scanner が使うため、bridge の
準備処理・固定入力・license・runtime artifact を保守資産の削除集合へ追加しない。
採用と実装再開は承認済みである。isolated probe の成功を全入口の成功と読み替えない。

利用者は選択肢1により、parser の初期保証範囲を Ubuntu amd64（x86_64）とする方針を承認した。
既存文書の Ubuntu 対象記述には CPU 制限がなかったため、採用時は追加制約として明示する。
他 OS / CPU は parser の取得・build 前に対象外の理由を示して停止し、別 architecture の
artifact を実行しない。arm64 の保証や未検証環境での自動継続は追加しない。
本実測は Ubuntu 22.04.5 LTS / x86_64 であり、全 Ubuntu release の実動作検証を意味しない。

### Markdown の入力分類

利用者は選択肢1により、以下の閉じた一覧を採用する方針を承認した。記法追加時は仕様と
対照テストを更新する。parser のエラー結果から除外条件を増やさない。
分類の単位は既存 R06 の code span または fence body とし、shell 言語指定
（`sh` / `bash` / `shell`）は合意した placeholder 以外の説明断片を許可しない。
`console` の行頭 `$ ` 除去は維持する。block quote 内も fence の言語区分を保持し、
非 shell 言語の fence を inline shell として再走査しない。

inline / 言語指定なし fence / console では、次の順序で分類する。

1. 全体が JSON object / array、HTML comment、または既存の `printf [label](target)` 表示例に
   一致する入力は説明データとする。部分一致で同じ単位の別コマンドを除外しない。
2. 単位全体が Python 文法で成立する assignment / augmented assignment / call expression の
   列なら、理由付き partial とする。shell 明示 fence にはこの規則を適用しない。
3. 混在入力では、ASCII identifier を dot で連結した名前と、括弧・semicolon・改行を含まない
   引数部からなる call 形 `name(args)` を説明候補とする。shell function 宣言に該当する
   後続 `{` は除く。候補が AST 上で未引用のコマンド位置に現れた場合だけ理由付き partial とし、
   同じ単位の separator 後の認識可能なコマンドは引き続き検査する。
   引用済み文字列は literal のまま保持し、認識済みコマンドの未引用引数や展開内の不正構文を
   この規則で受理しない。例: `foo(); task check:template` は partial と専用参照を併記する。
4. コマンド位置が `-` で始まる option 断片、先頭が `||` / `&&` / `|` の演算子断片は
   理由付き partial とする。後続の認識可能なコマンドの検査は継続する。
5. 残りは placeholder 規則を適用して Bash AST へ渡す。列挙した説明・断片に該当しない
   構文エラーは非成功とし、任意の自然言語・他言語の推測で成功へ読み替えない。

例えば `task foo(bar)` と `printf "$(foo(bar))"` は構文エラー、
`printf "foo(bar)"` と `printf "$(printf 'foo(bar)')"` は通常の引用として扱う。
unknown executable を専用参照と推定する変更はせず、C の限定検出範囲は維持する。
この一覧は個別判断として承認済みだが、試作28対照例の成功から任意の文書記法への適合性を
保証しない。説明候補の追加は仕様と正例・負例を更新して行い、実装中に黙って追加しない。

仮 token は入力内に存在しない値を選び、同じ placeholder の同じ表記は同一 token にする。
引用・展開の判別は AST に従い、引用済みの元 literal を復元する。仮 token の bytes や長さを
元 source の位置として表示しない。置換区間の対応表を持ち、行数・CRLF・Unicode・前後の
offset を元 source に戻す。対応不能なら診断付き非成功とし、位置を推測しない。
quoted / escaped heredoc の delimiter、payload、終端は parser の位置情報に基づいて保護し、
仮 token 化で quote removal 前後の対応を壊さない。文書全体の正規表現だけで shell の引用・
heredoc 範囲を推測しない。
これらの衝突・位置不変条件は validation.md の対象とし、実施結果は tasks.md に記録する。

### 解析エラー・位置情報・全入口の成功条件

JSON の既存 `state`、`coverage`、`references`、`unevaluated`、`errors`、`edits` を維持し、
`analysis_errors` 配列を追加する。`state` は確認できた資産構成、canonical 契約、既知参照から
bundled / pruned / inconsistent を判定する。`errors` は構成・既存契約の違反、
`analysis_errors` は走査の syntax / dependency / protocol / io / position の失敗を持つ。
走査の失敗だけで `state` を inconsistent にせず、unknown も追加しない。
Taskfile の canonical validation 違反、必須資産の欠落・誤型、marker の破損等は引き続き
構成・既存契約の違反である。通常 source の shell 解析エラーと混同しない。
R01 の canonical validation は shell parser の利用・専用参照検査より先に行う。

各解析エラーには `kind`、`surface`、`source`、`line`、`reason` を含める。source が特定できる
エラーは対応する R01〜R06 と元 source の位置を示す。全体の parser 準備・protocol 失敗などで
source 単位に帰属できない場合だけ、source は対象 artifact / bridge の repository 相対 path、
surface と line は null とし、表示も「共通解析基盤・位置なし」とする。架空の行番号を作らない。
`unevaluated` は従来の情報に `kind` を加え、cwd / placeholder / document-fragment / analysis-error
を区別する。解析エラーで検査できない範囲も残し、失敗前・他の単位で確認できた参照は消さない。

全体 `coverage` は evaluated / partial の二値を維持し、未評価または解析エラーがあれば partial とする。
全 shell 単位の解析ができない場合も、資産構成などの検査結果と区別して partial と表示する。
K05 の個別入力の構文エラーは従来どおり expected=invalid-syntax / coverage=not-run とし、
この fixture の単位別ラベルを全体 coverage の新しい状態に流用しない。
成功には `state != inconsistent`、`references` / `errors` / `analysis_errors` が空であることを
すべて要求する。state と配列の矛盾を成功として受け入れない。
既知の専用参照は従来どおり inconsistent にし、解析エラーと同時でも双方を保持する。
JSON の必須 field 欠落・誤型・不明な列挙値は protocol 失敗とし、空のエラー配列を補って成功させない。

- 通常 gate は共通成功条件を満たさなければ非成功。構成と coverage を併記し、
  partial だけなら理由別の件数・source / 位置を集約表示する。doctor は各件を詳細表示する。
  cwd 以外の partial を「cwd 依存だけが未評価」と表示しない。解析エラーは明示的な FAIL とし、
  検査できなかった範囲について「専用参照なし」と断定しない。
- doctor は共通成功条件の失敗を既存の必須検査 FAIL とする。他の既存必須検査も維持する。
- preview は共通成功条件と既存の Git 前提・差分保護を確認し、不成立なら読める予定と診断を
  示して exit 1 とする。解析エラー時に編集範囲を推測して埋めない。
- apply は直前の再検査でも同じ条件を要求し、解析エラーがあれば最初の書込みより前に停止する。
  postcheck は state=pruned に加えて共通成功条件を要求する。解析エラー時は exit 1 とし、
  変更済み・失敗・未処理・復旧基準 commit と解析診断を保持する。自動 rollback はしない。
- no-op も state=pruned だけで早期成功せず、共通成功条件と既存の Git / HEAD / root 前提を要求する。
  正常な完全除去で直前の削除差分が未コミットであることだけは引き続き許容する。

Python の公開 prune CLI は失敗 exit 1、引数エラーは既存の exit 2、help は exit 0 を維持する。
Task / Node 等の wrapper は既存の非ゼロ伝播を維持し、全 wrapper を同じ数値へ変更しない。
内部 inspect の JSON 取得成功と公開検査成功は別である。内部 process が exit 0 でも上記 field に
失敗があれば caller は非成功とする。canonical 検査基盤の故障等で構成状態そのものを算出できない
致命的な失敗は、内部 process を非ゼロにして caller が診断付きで停止する。成功形の JSON や
unknown 状態を捏造しない。これは構成を算出できる通常の shell 解析失敗と区別する。
Git 保護違反は構成状態を書き換えず blocker として拒否する。

行番号は1始まり、行範囲の終端は inclusive とする。元 bytes の offset は0始まりで扱う。
`field_path` は string / 0以上の整数の配列で key と sequence index を区別する。`alias_uses` は source / line / field_path の配列、
`shell_range` は decoded shell の line / line_end とする。位置情報は既存の `source` / `line` を
主表示に使い、shell では `line_end` と
`position_kind=statement-range` を添える。Workflow では主表示を YAML field value の定義位置とし、
`field_path` と `position_kind=field-value` を添える。alias の利用位置は `alias_uses`、
decoded shell の top-level statement の相対行範囲は `shell_range` として別情報にする。
別 source への埋込みや escape / folded scalar の行を単純加算せず、位置対応が保証できなければ
推測値を返さず解析エラーとする。別 step / field の同値は field path と node range で区別する。
