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
`repository-taskfile.ts` は YAML 構文解析と Taskfile policy を分離した関数で処理し、全 command と
check の直接文字列を返す。AST でコメントと実データを区別し、alias の展開や shell / task graph の解釈をしない。
SemVer の薄い正規形検査は既存ファイル内に置き、他 runtime の共通化を持ち込まない。
CLI は contract module を check-contracts 分岐で遅延 import する。既存の runtime-preflight は
dependency 未導入時にも起動できる境界を維持し、runtime の受理文法は変更しない。

## 合意と境界

受理文法は spec delta と spec-holes に定義する。Taskfile の root / tasks / 各 task は mapping とする。
task の cmds は存在する場合 sequence で、欠損は空として扱う。必須 check の欠損・空は必要コマンド不在で失敗する。
cmd / task object は排他的な一方の文字列を持ち、空白のみの command / task 名、未知 command 形式、
cmd と task の同時指定、defer 等との混在を拒否する。silent 等の補助フィールドは Task に委ねる。
検査対象外の task / root 設定は保持し、Task schema 全体・動的テンプレート・includes・deps graph・shell の
到達可能性・失敗伝播は保証しない。これらに新たな禁止規則や解析機構を追加しない。
必須コマンドの一致は YAML scalar の値に対する trim 後の一致であり、引用符や block style に依存しない。
複数行の途中に埋め込まれた文字列、echo、shell comment は一致しない。

既知の標準 YAML 1.2 core tag は許可する。独自 tag / tag directive、別版の directive、parser warning は拒否し、
すべての mapping key は文字列とする（検査対象外の mapping を含む）。`<<` key は引用有無によらず拒否する。
文書サイズ・nesting の独自制限は追加しない。alias は展開前に拒否し、それ以外の resource limits は対象外とする。

## 検証

テスト seam は既存の公開 CLI `node repo-tools/cli.ts check-contracts`。一時 repository のファイルを変え、
status / stderr / read-only 性を観測する。内部 AST や private helper の形には依存しない。
SemVer、YAML parse、Task policy の順に red / green を確認する。Node 24 / Python 3.14 の CI parity は
最初の実装前に確認する。OSWF-5 の順序で self-review、独立 review、修正、task check、別 verifier を行う。
既存の runtime-preflight.test.ts にある package import 遮断テストで、解析 package の導入が startup へ
波及しないことも検証する。

## Open Questions

なし。未対応入力は明示拒否または上記スコープ外として定義済み。
