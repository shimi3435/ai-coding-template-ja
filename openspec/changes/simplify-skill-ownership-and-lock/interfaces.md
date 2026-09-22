# 公開操作と手順

文書種別: 公開interfaceリファレンス／実装後のランブック設計。
以下の新引数・commandは**未実装**であり、現行CLIの使い方として実行しない。

## CLI

entrypointは `node repo-tools/entrypoint.mjs <command> [options]`。
既存task名は維持し、新操作にも同名taskを追加する。命名は以下とする。

| command | 操作 | network |
| --- | --- | --- |
| skills:verify | 指定repositoryのv2 metadata・実体・legal・linkを検証 | 不要 |
| skills:check | 元snapshotと上流を比較し、更新候補を表示 | 必要 |
| skills:update | remoteを検証・取得し、候補cloneへ適用 | 必要 |
| skills:repin | 一つのremoteのref / 固定先を明示承認して候補へ適用 | 必要 |
| skills:adopt-local | 一つのremoteを本文保持でlocal化 | 不要 |
| skills:links | 候補内の宣言済みSkill linkを修復 | 不要 |
| skills:migrate | 移行専用entrypointへdispatchし、v1→v2をoffline変換 | 不要 |

`skills:lock-local` は撤去し、非ゼロ終了と代替説明を返す。互換aliasは残さない。
`skills:migrate` は通常v2 decoderと分離した移行処理だけを動的に読み込む。
通常CLIは旧形式を受理・自動変換しない。

### 共通入力

- verify: `--root <repository>`。省略時だけ現在repositoryを読む。
- check: `--source <repository> --base <full-commit-sha>`。
- 全書込み操作: `--source <repository> --base <full-commit-sha> --candidate <independent-clone>` 必須。
  既定は書込みなしのpreview。`--apply` がある場合だけ候補へ書き込む。
- `--json` は全commandで指定できる。`--fail-on-update` はcheckだけで指定できる。
- 未知引数、必須欠落、重複した単一値引数、相反する引数を非ゼロで拒否する。
- 元のworking treeのsource / lock / legalは読まず、base commitから読む。未コミット変更を暗黙に含めない。
- preview結果をapplyの恒久tokenとして保存しない。applyは入力と上流を再検証する。
  branch追跡のpreview後に新しいfast-forward commitが現れた場合、applyは新commitを検査して採用できる。
  厳密に同じcommitを承認したい場合はrepinの指定SHAを使う。
- 書込み前に完成状態のverifyを一律適用しない。schema.md「完成状態と操作前の中間状態」に従い、
  当該操作が許容する差分だけを検証する。適用後の全体verifyは必須である。

### repin

`--name <skill> --commit <approved-full-sha>` 必須。
任意のref切替は `--branch <name>` / `--tag <name>` / `--pin-commit` の相互排他で表す。
指定なしは現在refを維持する。`--pin-commit` は `--commit` の値をsource refにも設定する。
tagを採用・維持する場合は `--tag-object <approved-full-sha>` も必須とし、tag以外では拒否する。
repository / subtree変更が必要ならsource変更を開始commitへ記録し、repinでその対象名と固定先を承認する。
tag削除後は別refまたはcommit固定へ明示的に切り替える。

repinが省略できるのは旧固定先からの履歴連続性・旧tag同一性の検査だけである。
承認SHAとの一致、本文の旧lock一致、取得前上限、integrity、legal、配置先検査は必須とする。
repinは名前指定したSkillだけを変更する。他のSkillの固定先を暗黙に承認しない。
同じrefの他のSkillにも履歴変更がある場合、それぞれ明示repinするまで通常更新は停止する。
通常のupdateは同じrefの全対象を同じ観測commitへ揃えるが、repin後の既存lockが一時的に異なるcommitを
持つこと自体はoffline検証の失敗理由にしない。

### adopt-local / migrate / links

adopt-localは `--name <remote-skill>` 必須。本文差分は明示切替で許容し、legal差分は許容しない。
migrateは `--localize <remote-skill>` を複数回指定できるが、同名重複は拒否する。
v2入力にlocalize指定を併用しない。v2のlocal化はadopt-localを使う。
linksはmetadataを変更せず、検証済み候補内の `.claude/skills/<name>` と
`.codex/skills/<name>` を `../../.agents/skills/<name>` へ揃える。
既存の通常fileやdirectoryをlinkとして上書きしない。
既存bootstrapの `scripts/setup-skills.sh` の役割は変更せず、本CLIの書込み契約と区別する。

## 出力と失敗

JSONは `{schemaVersion: 2, command, status, changes, warnings, errors}`。
statusは `unchanged | planned | applied | failed`。
changesはname順の `{name, beforeCommit, afterCommit, beforeOwnership, afterOwnership}` とし、
該当しない値はnull、unknown fieldは出力しない。tag変更時の両SHAとref変更は人間向けpreviewにも表示し、
JSON changesには該当時だけ `beforeRef, afterRef, beforeTagObjectSha, afterTagObjectSha` を追加する。
approval入力と観測結果を比較できるようrepin previewに表示する。
stdoutは結果、stderrは診断とし、secretをredactする。生の認証情報を候補やlogへ書かない。

exit 0は検査成功／preview成功／applyと最終verify成功。
exit 1は引数・前提・取得・検査・書込みの失敗。
exit 3はcheckの `--fail-on-update` 指定時に更新が存在する場合だけとする。
更新なし、remote 0件、同じ固定先への再指定は検証して無変更成功する。
一つのcohortが失敗すれば操作全体をfailedとし、成功部分だけをPRへ進めない。

## 手順書に実装する順序

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
実装後の手順書に用いない。candidateの存在や部分的なoffline成功だけを更新操作全体の成功証拠としない。
