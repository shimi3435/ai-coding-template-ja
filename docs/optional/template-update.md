# テンプレート更新の取り込み（オプション・手動 cherry-pick）

「Use this template」で作成した下流リポジトリへ、テンプレの後続改善を**手動 cherry-pick**で
取り込む手順。テンプレ更新は下流へ自動伝播せず、upstream remote を追加して `git merge` で
全体追随する方式は [ADR-0005](../template/adr/0005-template-update-not-propagated.md) で
**却下済み**（rename 後のコンフリクト大量化が理由。詳細は ADR 参照。prune 済み下流では
`docs/template/` が削除済みのため、ADR はテンプレリポジトリ側で参照する）。本ページは
必要な変更だけを人が選んで取り込む手順に徹する。

## 取り込み対象を特定する

- テンプレの GitHub リポジトリの **Releases** を見る（`vX.Y.Z` tag ごとの変更一覧。
  `v` に続く部分は `TEMPLATE_VERSION` と対応する）。
- より細かい単位では **PR 履歴**（merged PR）を見る。取り込みたい PR の
  merge commit SHA（または個別コミット SHA）を控える。
- 自分のリポジトリの由来版はルートの `TEMPLATE_VERSION` で分かる（`task doctor` も
  INFO 表示する）。それ以降のリリース / PR が取り込み候補。

## cherry-pick 手順（最小形）

コンフリクト解決・prune 済み分岐（後述）を含め、全手順は手順 0 の clean preflight を
通した作業ブランチ上で行うことが共通前提。

```bash
# 0. 作業ツリー・index が清潔なことを確認してから作業ブランチを切る（fail-closed。
#    汚れたまま進めると WIP がテンプレ更新コミットへ混入し、TEMPLATE_VERSION の
#    未コミット編集が手順 4 の restore で破棄される。汚れていたら先に
#    commit / stash してから再実行する）
test -z "$(git status --porcelain)" \
  && git switch -c template-update

# 1. テンプレを remote として追加（初回のみ）
git remote add template <template-repo-url>

# 2. テンプレの履歴を取得
git fetch template

# 3. 取り込みたいコミットを cherry-pick（--no-commit でコミット前に一旦止める。
#    clean apply でも TEMPLATE_VERSION の bump 等の不要な変更が自動コミットされる
#    のを防ぐため）
git cherry-pick --no-commit <commit-sha>

# PR の merge commit を取り込む場合は親を指定する
git cherry-pick --no-commit -m 1 <merge-commit-sha>

# 4. TEMPLATE_VERSION の変更が紛れていたら除外し（由来スタンプは据え置き・後述）、
#    取り込み内容を確認してからコミットする
git restore --staged --worktree TEMPLATE_VERSION
git status
git commit
```

コンフリクトが出たら手動で解決し、`git add` の後、`--no-commit` 運用ではそのまま
上記 4 の確認 → `git commit` に進む（やめる場合は `git cherry-pick --abort`）。

## rename 済み下流の注意（コンフリクト前提）

- `task rename` 適用後はパッケージ名（`src/<module>/`）・pyproject の名前・import パスが
  テンプレと異なるため、それらに触る hunk は**コンフリクト前提**。
- 機械的には解決できない。テンプレ側のパッケージ名を自分の module 名へ読み替えながら
  手動で解決する。

## prune 済み下流の注意

- `task prune-template-docs` 実行後は `docs/template/` が存在しないため、同配下への hunk は
  当たらない（削除済みパスへの変更としてコンフリクトになり得る）。
- 不要な hunk はスキップ / 削除でよい。cherry-pick 全体を諦める必要はなく、該当ファイルを
  `git rm` で外したら、上記手順 4 の流れ（`TEMPLATE_VERSION` の restore と `git status`
  確認 → `git commit`）に合流する。`git cherry-pick --continue` は使わない（コミット前の
  確認を迂回して自動コミットされるため。コンフリクト解決後も必ず手順 4 を通す）。

## TEMPLATE_VERSION は更新しない

- 下流の `TEMPLATE_VERSION` は**テンプレ作成時点の由来スタンプ**。一部の PR だけを
  cherry-pick する部分取り込みで更新すると「この版までを反映済み」という意味が壊れるため、
  **据え置き**とする（cherry-pick で hunk が来ても取り込まない）。
