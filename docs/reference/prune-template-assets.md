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
