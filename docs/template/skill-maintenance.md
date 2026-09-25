# 公開操作と手順

文書種別: 公開interfaceリファレンス／ランブック。metadataの正本は [schema v2](skill-metadata-v2.md)。

## CLI

entrypointは `node repo-tools/entrypoint.mjs <command> [options]`。
既存task名は維持し、新操作にも同名taskを追加する。命名は以下とする。

| command | 操作 | network |
| --- | --- | --- |
| skills:verify | 指定repositoryのv2 metadata・実体・legal・linkを検証 | 不要 |
| skills:check | 元snapshotと上流を比較し、更新候補を表示 | 必要 |
| skills:update | remoteを検証・取得し、候補cloneへ適用 | 必要 |
| skills:repin | 一つのremoteの出典・固定先・legal policyを明示承認して候補へ適用 | 必要 |
| skills:adopt-local | 一つのremoteを本文保持でlocal化 | 不要 |
| skills:links | 現在checkoutの宣言済みSkill linkを直接修復 | 不要 |
| skills:migrate | 移行専用entrypointへdispatchし、v1→v2をoffline変換 | 不要 |

`skills:lock-local` は撤去し、非ゼロ終了と代替説明を返す。互換aliasは残さない。
`skills:migrate` は通常v2 decoderと分離した移行処理だけを動的に読み込む。
通常CLIは旧形式を受理・自動変換しない。

### 共通入力

remote取得はgithub.com上の公開repositoryだけを対象とする。全 `gh api` 呼出で
`--hostname github.com` を明示し、GH_HOST等の既定host設定には依存しない。

- verify: `--root <repository>`。省略時だけ現在repositoryを読む。
- check: `--source <repository> --base <full-commit-sha>`。
- 隔離更新操作（update / repin / adopt-local / migrate）: `--source <repository> --base <full-commit-sha> --candidate <independent-clone>` 必須。
  既定は書込みなしのpreview。`--apply` がある場合だけ候補へ書き込む。
- links: 現在checkoutを対象とし、既定で修復する。`--source / --base / --candidate / --apply` は不要かつ受理しない。
- `--json` は全commandで指定できる。`--fail-on-update` はcheckだけで指定できる。
- 未知引数、必須欠落、重複した単一値引数、相反する引数を非ゼロで拒否する。
- checkと隔離更新操作はbase commitのsource / lock / 本文 / legalを読む。元の未コミット変更を暗黙に含めない。
  verifyとlinksは対象の現在checkoutを読む。
- preview結果をapplyの恒久tokenとして保存しない。applyは入力と上流を再検証する。
  branch追跡のpreview後に新しいfast-forward commitが現れた場合、applyは新commitを検査して採用できる。
  厳密に同じcommitを承認したい場合はrepinの指定SHAを使う。
- 隔離更新操作の書込み前に完成状態のverifyを一律適用しない。skill-metadata-v2.md「完成状態と操作前の中間状態」に従い、
  当該操作が許容する差分だけを検証する。適用後の全体verifyは必須である。

### repin

`--name <skill> --commit <approved-full-sha>` 必須。
任意のref切替は `--branch <name>` / `--tag <name>` / `--pin-commit` の相互排他で表す。
指定なしは現在refを維持する。`--pin-commit` は `--commit` の値をsource refにも設定する。
tagを採用・維持する場合は `--tag-object <approved-full-sha>` も必須とし、tag以外では拒否する。
repository / subtree / license / legalMappingsの変更はsourceへ記載して開始commitに記録し、
repinでその対象名と固定先を承認する。legalMappingsはhash変更だけでなく、LICENSEの移動やNOTICEの追加・削除を含む。
通常updateは同じmappingの承認hash変更だけを許し、licenseまたはmapping構造の変更は拒否する。
tag削除後は別refまたはcommit固定へ明示的に切り替える。

repinは旧固定先からの履歴連続性・旧tag同一性を要求せず、skill-metadata-v2.mdで限定した対象名の出典・legal policy遷移を許可する。
承認SHAとの一致、旧本文・旧legalの旧lock一致、取得前上限、integrity、新sourceのlegal承認、配置先検査は必須とする。
redistribution: allowedは維持する。lockの手編集は承認手順に含めない。
新しいsubtreeとlegalMappingsから最終treeを構成し、旧mappingだけに由来する配置fileは引き継がない。
最終treeの追加・削除を含む差分をレビューし、同じcommitでもpolicy / legalが変われば適用対象とする。
repinは名前指定したSkillだけを変更する。他のSkillの固定先を暗黙に承認しない。
同じrefの他のSkillにも履歴変更がある場合、それぞれ明示repinするまで通常更新は停止する。
通常のupdateは同じrefの全対象を同じ観測commitへ揃えるが、repin後の既存lockが一時的に異なるcommitを
持つこと自体はoffline検証の失敗理由にしない。

### adopt-local / migrate

adopt-localは `--name <remote-skill>` 必須。本文差分は明示切替で許容し、legal差分は許容しない。
adopt-local / migrateとも[共通のSkill構造検証](skill-metadata-v2.md#共通のskill構造検証)を省略せず、不正なSKILL.mdを自動修復しない。
migrateは `--localize <remote-skill>` を複数回指定できるが、同名重複は拒否する。
v2入力にlocalize指定を併用しない。v2のlocal化はadopt-localを使う。

### linksの直接修復

`task skills:links` は現在checkoutの `.claude/skills/<name>` と `.codex/skills/<name>` を
`../../.agents/skills/<name>` へ揃える。欠落・壊れたlink・誤ったlinkだけを作成・修復し、正しいlinkは変更しない。
source / lockの構造・宣言対応、対象Skill directoryの存在、全対象linkの衝突と親pathの安全性を事前検査する。
既存の通常file / directoryとの衝突、親symlink等によるrepository外への逸脱が一つでもあれば、全linkへの書込み前に失敗する。
必要な親directoryの作成を含め、書込みはrepository内の所定link配置領域だけとし、本文・source・lock・無関係な編集を変更しない。
全体offline verifyは修復前の必須条件にしない。修復後に全対象linkを検証して成功を返すが、本文検証成功の代用にはしない。
`scripts/setup-skills.sh` も同じin-place修復・衝突事前検査・親path保護の契約へ揃える。
I/O失敗時は非ゼロ終了し、部分的に修復したlinkが残り得る。衝突を解消して同じcheckoutで冪等に再実行できる。

## 出力と失敗

JSONは `{schemaVersion: 2, command, status, changes, warnings, errors}`。
statusは `unchanged | planned | applied | failed`。
changesはname順の `{name, beforeCommit, afterCommit, beforeOwnership, afterOwnership}` とし、
該当しない値はnull、unknown fieldは出力しない。tag変更時の両SHAとref変更は人間向けpreviewにも表示し、
JSON changesには該当時だけ `beforeRef, afterRef, beforeTagObjectSha, afterTagObjectSha` を追加する。
license / legalMappings変更時は該当する `beforeLicense, afterLicense, beforeLegalMappings, afterLegalMappings` を追加する。
legalMappingsはsource形式とし、before側は旧lockのlegalFiles.sha256をexpectedSha256へ対応させる。
人間向けrepin previewにもpolicy / mappingの差分と承認SHA・観測SHAを表示する。
stdoutは結果、stderrは診断とし、secretをredactする。生の認証情報を候補やlogへ書かない。

exit 0は検査成功／preview成功／隔離更新のapplyと最終offline verify成功／linksの修復後link検証成功。
linksは変更ありでapplied、修復不要でunchangedを返す。
exit 1は引数・前提・取得・検査・書込みの失敗。
exit 3はcheckの `--fail-on-update` 指定時に更新が存在する場合だけとする。
check / updateのremote 0件、または固定先・policy・legal・配置結果を含め操作対象に変更がない場合は検証して無変更成功する。
repin / adopt-localの未知名は拒否し、migrateはremote 0件でも必要なschema変換を行う。
同じcommitだけでは無変更と判定しない。linksはremote 0件でもlocalのlinkを検査・修復する。
一つのcohortが失敗すれば操作全体をfailedとし、成功部分だけをPRへ進めない。

## 隔離更新の実行順序

対象はupdate / repin / adopt-local / migrateである。linksの修復は現在checkoutで `task skills:links` を実行する。
WSL Ubuntuでは元repository・候補clone・双方のGit metadataをLinux filesystemに置く。
`/mnt/c` 等のWindows / DrvFSは保証対象外であり、専用の互換処理は提供しない。

1. Node.js 24 / npm、Python >=3.14、Git、必要な場合は認証済みghを準備する。
2. 元repositoryのcommit済み変更から完全SHAを開始点として選ぶ。未コミット編集は事前に利用者がcommitする。
3. 標準Gitの `clone --no-local` で独立候補を作り、開始commitをcheckoutする。
   `--shared`、`--reference`、linked worktreeで代用しない。
4. 候補内でlocked dependencyを準備する。Skill本体のscriptを実行しない。
5. 元repository・開始SHA・候補を指定してpreviewし、適用する操作と対象を確認する。
6. 同じ引数と明示承認値でapplyする。失敗・中断時はここで停止し、候補を診断用に残す。
7. 成功候補でoffline verifyと `task check` を実行し、許可された差分だけであることをレビューする。
8. 検証した最終差分だけをcommitし、push先を確認して標準Git / ghで通常PRを作る。
   cloneのoriginがローカル元repositoryを指したままpushしない。自動PRやmanaged branchは作らない。
9. 失敗後に再実行する場合は新しい候補を作り、手順3からやり直す。破棄は利用者が対象pathを確認して行う。

各段階は直前の成功を条件とする。失敗時に後続へ進む `;` 連結や、失敗を隠す `|| true` を
手順書に用いない。candidateの存在や部分的なoffline成功だけを更新操作全体の成功証拠としない。

### 実行例（Bash）

以下をscriptとして保存し、独立した元repositoryの絶対path、新規候補の絶対path、操作名、
操作固有引数を順に渡す。例えば `bash maintain.sh /path/source /path/new-candidate skills:update`。
repinでは後ろに `--name <name> --commit <full-sha>` と必要なref承認値を渡す。
元がlinked worktreeの場合は、まず `git clone --no-local` で独立した元repositoryを用意する。
Node.js 24とPython >=3.14がPATHにあり、Taskとuvが利用できることを前提とする。

```bash
set -eu
skill_source="$1"
skill_candidate="$2"
skill_operation="$3"
shift 3
skill_base="$(git -C "$skill_source" rev-parse HEAD)"
test ! -e "$skill_candidate"
git clone --no-local -- "$skill_source" "$skill_candidate"
git -C "$skill_candidate" checkout --detach "$skill_base"
cd "$skill_candidate"
uv sync --locked
npm ci --ignore-scripts
export PATH="$skill_candidate/.venv/bin:$PATH"
task "$skill_operation" -- --source "$skill_source" --base "$skill_base" --candidate "$skill_candidate" "$@"
printf 'previewを確認し、applyする場合だけ APPLY を入力: '
read -r skill_confirmation
test "$skill_confirmation" = APPLY
task "$skill_operation" -- --source "$skill_source" --base "$skill_base" --candidate "$skill_candidate" "$@" --apply
task skills:verify
task check
git diff --check
git diff --stat
git diff
```

scriptがexit 0になった後も、差分の対象とlegalを人がレビューする。失敗時はそこで停止し、
後続のcommit / push / PRを実行しない。成功後に通常branchを作り、検証済み差分をcommitする。
`git remote -v` で確認してoriginを意図したGitHub repositoryへ変更してからpushし、通常のPRを作成する。
公開先やbranch名をこのscriptで決めたり、認証情報を引数へ埋め込んだりしない。
