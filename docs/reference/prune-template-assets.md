# テンプレート保守資産の除去

文書種別: 公開 interface リファレンス / 復旧手順。

`task prune-template-docs` は read-only preview、`task prune-template-docs -- --apply` は明示適用。
`scripts/prune-template-docs.py` の直接実行も同じ契約であり、対象は script の配置 repository。
引数は `--apply` または `--help` のみ。重複・未知引数は拒否する。

固定削除対象は `docs/template/`、`template-maintenance/`、`.github/workflows/template-maintenance.yml`。
`Taskfile.yml` の `check:template` task と、README / workflow の専用 marker 区画も除去する。
下流向け `docs/reference/`、`docs/adr/`、`TEMPLATE_VERSION`、Skill・lock・legal・links、通常 CI は保持する。
旧版の文書だけを消す prune とは削除範囲が異なる。

構成状態は同梱・完全除去・不整合。scanner coverage は evaluated / partial の別軸である。
検査対象は Taskfile、package scripts、workflow、scripts、repo-tools / tests、共有 Markdown の
列挙した直接 import / 読取 / command / link。変数・任意 wrapper・動的 path・呼出元 cwd は追跡しない。
workflow の cwd は step、job defaults、workflow defaults、root の順で選ぶ。
動的 cwd や shell の cd / pushd / popd は当該単位の相対参照を未評価にする。
未評価だけでは gate / doctor / prune は失敗しない。source / 位置 / surface / 理由を表示し、
専用 task 名・絶対 path と他の単位の検査は継続する。成功は任意コードの依存解消を保証しない。

適用には Git working tree の top-level、HEAD、追跡済みで差分のない対象が必要。
共有ファイルの区画外の差分も、そのファイルを編集する場合は拒否する。
対象外の staged / unstaged / untracked / ignored 差分は保持する。
symlink、特殊 file、submodule、入れ子 Git、対象内の未追跡 / ignored file は拒否する。
編集対象 regular file の hardlink（st_nlink > 1）は事前検査と各操作直前に拒否する。
削除専用 file の hardlink は unlink だけを行い、対象外の内容・inode は保持する。
編集しない完全除去状態の no-op は共有ファイルの hardlink を理由に拒否しない。

HEAD と index の path・mode・blob OID は一致が必要。working tree の内容は Git の改行変換
（core.autocrlf、text / eol 属性）を適用した blob OID で比較し、core.fileMode=false では
初期の実行 bit 差だけを許容する。assume-unchanged / skip-worktree や stat cache による
clean 判定は信用せず、対象の実体を検査する。Git status が clean でも、本検査の対応範囲外や
構成・実体の不整合があれば拒否する。
filter / ident / working-tree-encoding 属性は unset / unspecified 以外を変換前に拒否し、
独自 clean / process filter は実行しない。状態名と同名の文字列値 filter=unset / filter=unspecified
も拒否する。Git側で両driverを必須・実装なしに上書きし、外部commandなしで失敗させる。
実際の属性状態 unset / unspecified はこのdriverを使用しないため、引き続き許容する。
working-tree-encoding=unset / working-tree-encoding=unspecified も無効状態ではなく
未対応の文字列値として拒否する。全属性照会で実際の unspecified 状態（出力なし）を区別し、
unset の衝突は非空の合成入力による変換診断で検査する。対象ファイルが空でも検査し、
Git が exit 0 で変換エラーを出した場合も拒否する。実際の -working-tree-encoding /
!working-tree-encoding は許容する。合成入力の検査にも filter の無効化を適用する。
対象外だけに設定された属性は拒否理由にしない。
preview 後と各操作直前の同時変更検出は、正規化しない生 bytes / mode で行う。
改行正規化で同じ blob になる変更や、core.fileMode=false 下の mode 変更も停止理由となる。
完全除去の再実行は Git / HEAD / root を確認後、未コミットの正常削除差分があっても no-op。

## 途中失敗と旧 prune からの復旧

1. 失敗時は終了値、変更済み・失敗・未処理対象、開始時 HEAD を確認する。
2. 現在の差分を確認し、失敗後に追加した作業を別の安全な場所へ保存する。
3. 診断が示す開始時 commit から、固定削除・編集対象だけを復元する。
   旧 prune が commit 済みなら、全資産が揃っていた commit を利用者が選ぶ。
4. preview を再実行し、すべての事前検査成功後に明示 apply を実行する。
5. `./scripts/check.sh` と `task doctor` を実行する。

自動 rollback / stash / commit / 全体 reset / clean は行わない。
適用は共有編集→固定削除→完全除去再検査の順。途中失敗は非ゼロ。
複数ファイルの原子性、非協調 process への完全排他、kill 時の最終診断は保証しない。
GitHub や host 登録解除は操作しない。#74 の Skill 除去・host 操作は別の責務であり、
同梱中の Skill offline 検証はこの prune で省略しない。

## 判定契約

[固定 manifest](../../repo-tools/template_prune_manifest.py) の D / M に相当する
4 directory と19 regular file、専用 task と2つの marker pair がすべて存在する場合に同梱となる。
必須 file は空を許可しない。削除資産と専用区画がすべて不在で、保持資産が健全な場合が完全除去であり、
その他は不整合となる。内容の歴史的な意味検証は同梱側の保守 gate が担当する。
削除 subtree に追加した通常 file は必須集合に昇格しないが、追跡済み・差分なしなら削除対象に含む。

専用参照の許可所在は削除 subtree、専用 workflow、専用 task 本体、README / workflow の
`<!-- template-maintenance:start -->` と `<!-- template-maintenance:end -->` の間だけである。
共有編集は区画外 bytes・改行・mode を保持する。重複・片側欠落・逆順 marker は拒否する。
Taskfile は既存 canonical validation を先行させ、解析済み AST の専用 task だけを編集する。
`dir` / `deps` / `defer` / `if` / `status` / `preconditions` / `includes` を新たに受理しない。

解析 surface と対応構文は次のとおり。通常 test source も検査し、fixture のソース文字列は再解析しない。

- R01: `Taskfile.yml` の canonical validation 済み `cmds` の string / `cmd` と task 呼出。
- R02: `package.json` の `scripts` 値。
- R03: `.github/workflows/` の YAML。`run`、local `uses`、`working-directory`、
  `with.path` / `paths` / `cache-dependency-path`、push / pull_request の `paths` / `paths-ignore`。
- R04: `scripts/` の shell / Python。
- R05: `repo-tools/` の TypeScript / MJS と `tests/` の Python。
- R06: README、AGENTS、CLAUDE、CONTEXT、guide、docs/agents・reference・optional の Markdown と
  `.agents/skills/*/SKILL.md`。shell fence、command code span、local link / image の destination。

C 規則は単純コマンドを改行・`;`・`&&`・`||`・pipe で分け、引用・backslash-newline、
先頭の環境変数代入と `command` / `exec` を扱う。関数本文は検査するが呼出は展開しない。
executable basename が `task` で引数に exact `check:template` を持つ場合、または executable 自体が
専用 path の場合を検出する。`sh` / `bash` / `python` / `python3` / `python3.14` / `node` /
`pytest` / `uv` の literal path 引数も検査する。sh / bash の `-c` の literal 本文は再解析する。
echo / printf の表示引数、comment、here-document payload、変数展開、command substitution は検査しない。

P 規則は Python の import / from、`importlib.import_module` / `importlib.util.spec_from_file_location`、
`subprocess.run` / `Popen` / `call` / `check_call` / `check_output`、`os.system`、
`open` / `io.open`、Path の `read_text` / `read_bytes` を扱う。write-only open は除く。
list / tuple の literal argv と shell 指定の literal command は C 規則を使う。

J 規則は literal な import / export-from / require / dynamic import、child_process の
`spawn` / `spawnSync` / `execFile` / `execFileSync` / `exec` / `execSync`、fs / fs/promises の
`readFile` / `readFileSync` / `createReadStream` を扱う。node prefix と標準 import の単純 alias に対応する。

P / J の path 式は literal string、Path / PurePath、os.path.join / path.join / path.resolve、Python の
`/` 連結に限定する。先頭の `ROOT` / `REPO_ROOT` / `repositoryRoot` は repository 相対の表記とする。
値の追跡、任意 wrapper、exists、表示・assertion のための文字列は読取参照にしない。

M 規則の fence は info が空 / sh / bash / shell / console のものを扱い、console の `$ ` prompt を除く。
local inline / reference-style link と image は escape、山括弧、query / fragment の分離後の percent decode に対応する。
path / task 名だけの code span、HTML comment、通常 prose、外部 URL、fragment-only link、
その他の fence、raw HTML href は対象外である。実際の保守コマンドを説明データへ隠してはならない。

負例と境界例は [JSON fixture](../../tests/fixtures/template_prune/references.json) を参照する。
`expected` と `coverage` は独立し、`detected` / `partial` も成立する。


## 固定 parser と解析診断

shell 構文は mvdan/sh v3.14.1 と限定 patch を使用する。固定 commit、Go 1.27.2 linux-amd64、
source / toolchain archive と patch の SHA-256 は
[manifest](../../repo-tools/shell-parser/manifest.json)に記録する。bridge と license も配布する。
patch の対象は redirection の行継続、heredoc delimiter の quote removal・引用情報・行継続と、
raw AST に対応する upstream 展開処理である。更新時は patch 再適用、upstream suite、恒久 fixture を確認する。

- 準備入口: `task setup`。CI も dependency 準備時に `scripts/setup-shell-parser.py` を実行する。
  `task setup:node` は Node dependency だけを扱う。
- 初期保証範囲: Ubuntu amd64（x86_64）。対象外は download / build 前に停止する。
  実測は Ubuntu 22.04.5 LTS であり、全 release の実動作検証を意味しない。
- 準備: archive / patch の hash 検証後、専用 Go の絶対 path と独立 HOME / cache で build する。
  `GOTOOLCHAIN=local`、`GOENV=off`、`GOWORK=off`、`CGO_ENABLED=0`、`GOPROXY=off`、
  `GOSUMDB=off`、`-mod=readonly -trimpath -buildvcs=false` を使用する。
- 保存: gitignore 対象 `.cache/shell-parser/`。bridge / build option / OS / CPU を含む入力 identity と
  binary hash を照合する。staging build と parse smoke 成功後に参照先を atomic に更新する。
- runtime: stdin の shell source から AST を生成し、入力コマンドは実行しない。system Go / HOME / PATH の
  別 parser へ fallback しない。gate / doctor / preview / apply / postcheck / no-op から取得・build は行わない。
- 欠落・破損・別入力の artifact: 診断付き失敗とし、`task setup` の再実行を案内する。
  これは dependency の準備情報であり、prune の構成状態を記録する receipt ではない。
- prune 後も準備処理・固定入力・license・artifact は保持する。

構成状態 `state` は bundled / pruned / inconsistent、全体 `coverage` は evaluated / partial。
`errors` は構成・canonical 契約の違反、`analysis_errors` は syntax / dependency / protocol / io /
position の解析失敗を保持する。解析失敗だけで構成を inconsistent にしない。
`unevaluated.kind` は cwd / placeholder / document-fragment / analysis-error を区別する。
解析エラーにも未評価範囲を残し、他の単位で検出できた参照を消さない。

成功条件は state が inconsistent でなく、references / errors / analysis_errors が全て空であること。
JSON 必須 field の欠落・誤型・不明な列挙値は失敗する。partial だけなら成功できるが、解析エラー、
既知の参照、Git 保護違反は拒否する。postcheck / no-op も pruned だけでは成功しない。
構成そのものを算出できない基盤故障では内部 process も非ゼロにし、unknown 状態を作らない。
Python CLI の失敗は exit 1、引数エラーは exit 2、help は exit 0。

診断は source / surface / line / reason を持つ。行番号は1始まり、line_end は inclusive。
shell は最外の statement 範囲を position_kind=statement-range として示す。
Workflow は YAML field value の定義位置を主表示し、position_kind=field-value と field_path を添える。
field_path は string key / 非負整数 index の配列。alias_uses は source / line / field_path の利用位置、
shell_range は decoded shell の相対 line / line_end である。folded / escaped source の行を単純加算しない。
共通 artifact にしか帰属しない解析失敗だけは surface / line を null とし、対象 artifact path と
「共通解析基盤・位置なし」を示す。gate は理由別に集約し、doctor は個別診断を表示する。

### Markdown の閉じた分類

R06 の code span / shell fence だけで、未引用・未 escape の `<name>` を placeholder として扱う。
name は `[A-Za-z_][A-Za-z0-9_-]*`。語中も対象、引用・escape 済みは literal。
placeholder に依存する範囲は partial とし、同じ入力の既知参照を検査し続ける。
placeholder は redirection より優先するが、空白を含む `"< input >"` は redirection のままである。
実行用 shell にこの読み替えは適用しない。

inline / 言語指定なし fence / console は次の順序で分類する。

1. 全体が JSON object / array、HTML comment、既存の printf と Markdown link の表示例なら説明データ。
2. 全体が Python 文法の assignment / augmented assignment / call expression の列なら partial。
3. 混在入力の call 形は、ASCII identifier を dot で連結した名前と、括弧・semicolon・改行を含まない
   引数部を持つものに限定する。後続の `{` は shell function として扱う。
   未引用のコマンド位置だけ partial とし、引用済みは literal、コマンド引数や展開内の不正構文は拒否する。
4. `-` から始まるコマンド位置の option 断片、先頭 `||` / `&&` / `|` の演算子断片は partial。
5. 残りは placeholder 規則の適用後に Bash AST へ渡す。構文エラー後に任意の prose と推測して除外しない。

各 partial と同じ単位の separator 後も検査を続ける。sh / bash / shell fence は placeholder 以外の
説明断片を許可しない。console の行頭 `$ ` は除去する。blockquote 内も fence の言語区分を維持し、
非 shell fence を inline shell として再走査しない。記法追加時は仕様と対照テストを更新する。
仮 token は元入力と衝突させず、元 bytes の位置に戻して報告する。位置対応不能は解析失敗とする。
