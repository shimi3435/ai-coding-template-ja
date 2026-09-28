# 設計

## 残存 call sites と責務

| 現行処理 | 呼出元 / 責務 | 変更 |
| --- | --- | --- |
| `isExactSemver` / `validIdentifiers` | `dependencyRecord` 後の dependencies / devDependencies 検査 | `semver` の公開 parse API と build を含む正規形比較へ委譲 |
| `yamlBlock` / `indentation` | `tasks.check` 抽出 | `yaml` の公開 parseDocument API へ委譲し旧関数を削除 |
| Taskfile 全文の npm / Skill route 検索 | 必須入口の存在検査 | task key と command scalar で検査 |
| `insideCommands` 行走査 | Taskfile の禁止 runner 検査対象抽出 | 全 task の cmds 内の文字列 / cmd 本文を収集 |
| `skill-updater/metadata.ts` | Skill frontmatter | 既に yaml へ委譲済み。変更不要 |
| `skill-updater/migration/semver-policy-v1.ts` | 旧 v1 metadata の range 検証 | 既に semver.validRange へ委譲済み。移行専用の検証として維持 |
| workflow / bootstrap / repo-tools 検査 | 禁止 runner・native network の静的検査 | 現行の責務を維持 |

automation parser と SemVer range selector は base に存在せず、置換対象にしない。

## module 境界

`repository-contracts.ts` は I/O と既存検査の orchestration を維持する。
`repository-taskfile.ts` は YAML 構文解析と Taskfile policy を分離した関数で処理し、check の直接文字列を検査した後、
全 command を返す。AST でコメントと実データを区別し、alias の展開や shell / task graph の解釈をしない。
SemVer の薄い正規形検査は既存ファイル内に置き、他 runtime の共通化を持ち込まない。
CLI は contract module を check-contracts 分岐で遅延 import する。既存の runtime-preflight は
dependency 未導入時にも起動できる境界を維持し、runtime の受理文法は変更しない。

## 合意と境界

受理文法は spec delta と spec-holes に定義する。Taskfile の root / tasks / 各 task は mapping とする。
task の cmds は存在する場合 sequence で、欠損は空として扱う。必須 check の欠損・空は必要コマンド不在で失敗する。
cmd / task object は排他的な一方の文字列を持ち、空白のみの command / task 名を拒否する。
cycle 2 では補助設定を無条件に許可する旧方針を廃止し、root / task / command の許可 key を spec に固定する。
許可した desc / silent の型だけを小さく検査し、Task schema 全体を追跡しない。
check の skip / cache / platform / error suppression、root の継承設定、includes、補助 shell 実行を拒否する。
vars を全面禁止し、任意 template は評価せず拒否する。shell の意味解析は対象外とし、成功表示も静的な command text の検査に限定する。
必須コマンドの一致は YAML scalar の値に対する trim 後の一致であり、引用符や block style に依存しない。
複数行の途中に埋め込まれた文字列、echo、shell comment は一致しない。

既知の標準 YAML 1.2 core tag は許可する。独自 tag / tag directive、別版の directive、parser warning は拒否し、
すべての mapping key は文字列とする（検査対象外の mapping を含む）。`<<` key は引用有無によらず拒否する。
文書サイズ・nesting の独自制限は追加しない。alias は展開前に拒否し、それ以外の resource limits は対象外とする。

## 検証

テスト seam は既存の公開 CLI `node repo-tools/cli.ts check-contracts`。一時 repository のファイルを変え、
status / stderr / read-only 性を観測する。内部 AST や private helper の形には依存しない。
SemVer、YAML parse、Task policy の順に red / green を確認する。Node 24 / Python 3.14 の CI parity は
最初の実装前に確認する。OSWF-5 の順序で self-review、独立 review、修正、scripts/check.sh、別 verifier を行う。
既存の runtime-preflight.test.ts にある package import 遮断テストで、解析 package の導入が startup へ
波及しないことも検証する。

## Open Questions

なし。未対応入力は明示拒否または上記スコープ外として定義済み。

## Cycle 2: 敵対的 review 後の再計画

80e83c4 に対する外部 review の P1 2件を実機で再現した。Taskfile の補助 field を対象外にした境界と、
Task 内でのみ contract checker を起動する構造が原因である。利用者は grilling で許可リスト、静的表示、
CI / ローカルの独立先行検査を承認した。元の完了 checkbox と証跡は cycle 1 の記録として保存する。
CI の両 job の直列順序を既存 Python contract test で検証し、Task 3.51.1 の実行境界を Node CLI fixture
で検証する。fake node / npx は marker を書くだけとし、外部取得を行わない。Task 本体は fake にしない。
初回の環境依存 slice で既存 baseline と real Task tests を確認する。hosted CI は PR 作成後の merge 条件であり、
未実行のまま green と扱わない。前 cycle と別の reviewer / verifier で OSWF-5 の順序を実施する。

## Cycle 3: 正式入口と template 境界

前 cycle の static vars 受理、SoT / Quickstart の入口不一致、通常 test の Task exact assertion を修正する。
利用者は vars 全禁止、CLI_ARGS の現行10組だけの例外、正式 scripts/check.sh、ローカル exact pin 撤去を承認した。
テンプレート評価器を追加せず、AST で得た本文に開始区切りがあれば例外の完全一致だけを許可する。
Task 呼出名の template も拒否する。shell 全体の安全性を証明するものではない。
script は POSIX sh、配置先から root を決め、引数拒否後に独立 checker と exec task check を順に実行する。
root からの通常使用に加え、空白を含む path と別 cwd、checker 失敗、Task 失敗を公開入口 test で検証する。
Task 3.51.1 固有の旧挙動再現は CI 用の明示 test へ移し、通常 gate には実行結果の一般的契約だけを残す。
AGENTS / CONTEXT / README / bootstrap / local skills / 現行ガイドを更新し、過去の ADR・証跡は書き換えない。
独立 review、正式 gate、前 cycle と別 verifier を経て commit / push する。PR / merge / close は含まない。
