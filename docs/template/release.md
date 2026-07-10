# テンプレートのリリース手順（保守側）

テンプレ保守側が新しいリリース（annotated tag ＋ GitHub Release）を出すときの手順 1 枚。
本ファイルは `docs/template/` 配下にあり、下流では `task prune-template-docs -- --apply` で
削除される（保守者向けで下流には残らない）。対になる下流側の取り込み手順は
[docs/optional/template-update.md](../optional/template-update.md)。

## semver 規律

`TEMPLATE_VERSION` は semver（`X.Y.Z`）。境界判断の基準は「**下流の互換を壊すか**」。

- **major** … 下流の bootstrap / rename / 構成互換を壊す変更。
- **minor** … 機能 / skill / docs の追加。
- **patch** … 修正。

## TEMPLATE_VERSION の bump 規律

- 変更ごとではなく**リリース単位**で bump し、リリース PR に含める
  （[ADR-0005](adr/0005-template-update-not-propagated.md) の「更新規律はリリース手順に
  含める」の消化）。
- pyproject.toml の `version` は **0.1.0 のまま `TEMPLATE_VERSION` と非同期**。
  下流が自分のプロジェクトの版として所有する値のため、テンプレ側では触らない。

## リリース前提チェック（必須）

以下を**全て満たすまでリリースしない**（1 つでも red / 不一致なら tag を打たず、
先に解消する）。

1. `task check` が green。
2. `task openspec:validate` が green（engine 必須の opt-in ゲート）。
3. `openspec/changes/` が `.gitkeep` のみ（pre-merge close 規約の帰結。規約本文は
   [openspec/project.md](../../openspec/project.md)）。

```bash
task check
task openspec:validate
ls -A openspec/changes/   # .gitkeep のみであること
```

加えて、extras の導入手順検証線 `extras-smoke.yml`（workflow_dispatch 専用・
3.12 / 3.13 matrix）のリリース前の手動実行を**推奨**する。extras はコアゲート対象外
（コア CI を extras 上流起因の赤で汚さない分離設計）のため必須にはしないが、赤の
まま出す場合はその旨と理由を Release notes に記す。

## リリース手順

**前提: step 2〜3 の間は main へ他の変更をマージ・push しない**（照合済み commit と
公開 tag の対象がずれる TOCTOU を運用で閉じる。単独保守者の直列作業を前提とし、
複数人が同時に main を動かす体制になったら freeze / lock 手順の導入を検討する）。

1. リリース PR で `TEMPLATE_VERSION` を bump し（semver 規律で判定）、main へマージする。
2. main を最新化し、tag を打つ対象が **origin/main と一致した清潔な状態**であることを
   確認してから、`TEMPLATE_VERSION` の値を読む。**tag 名 = `v` + `TEMPLATE_VERSION`**
   の一致がここで担保される（値をファイルから読んで tag 名に使う）。ブロック全体を
   `&&` で連結してあり、**途中のチェックが失敗すると後続は実行されない**（fail-closed。
   `VERSION` も設定されないため後続ステップも進まない）。

   ```bash
   git switch main \
     && git pull --ff-only \
     && test -z "$(git status --porcelain)" \
     && test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" \
     && VERSION=$(cat TEMPLATE_VERSION) \
     && RELEASE_COMMIT=$(git rev-parse HEAD) \
     && echo "tag 名: v${VERSION} → ${RELEASE_COMMIT}"
   # 清潔・origin/main 一致の確認は、未 push commit や作業中の変更を指す tag の
   # 公開を防ぐため。echo が出なければ中断し、原因を解消してからやり直す。
   # RELEASE_COMMIT はここで検証した commit の固定値。step 3 はこの値に tag を
   # 付けるため、step 2〜3 の間に HEAD が動いても検証済み commit だけが対象になる。
   ```

3. annotated tag の作成 → push → GitHub Release の作成を**単一の `&&` ブロック**で行う
   （途中で失敗すると Release 作成まで進まない fail-closed。tag と Release を別々に
   実行すると「tag 側のガード失敗後に Release だけ作成」の事故が可能になるため
   分割しない）。`git push --tags` は使わない（ローカルに残る無関係な tag まで
   まとめて公開してしまうため、対象 tag だけを指定して push する）。

   ```bash
   test -n "${VERSION:-}" && test -n "${RELEASE_COMMIT:-}" \
     && ! git rev-parse -q --verify "refs/tags/v${VERSION}" >/dev/null \
     && { git ls-remote --exit-code --tags origin "v${VERSION}" >/dev/null; test "$?" -eq 2; } \
     && test "$(git ls-remote origin refs/heads/main | cut -f1)" = "${RELEASE_COMMIT}" \
     && git tag -a "v${VERSION}" -m "Release v${VERSION}" "${RELEASE_COMMIT}" \
     && git push origin "v${VERSION}" \
     && gh release create "v${VERSION}" --verify-tag --title "v${VERSION}" --generate-notes
   # - ls-remote は exit 2（tag 不在）のときだけ続行する。0（同名 tag が既に存在）や
   #   128（remote 不在・認証・ネットワークエラー）は中断する（! での反転は
   #   fatal エラーまで成功扱いにするため使わない）。
   # - refs/heads/main の live 照合は、step 2 以降に main が進んでいた場合に古い
   #   commit へ公開 tag を打つのを防ぐ（進んでいたら step 2 からやり直す）。
   # - gh release create の --verify-tag は省略しない（省略すると tag 不在時に gh が
   #   既定 branch から非 annotated tag を自動作成し、上のガードを迂回できるため）。
   ```

   **部分完了からの再開**（途中失敗時。どちらも再実行前に失敗原因を解消しておく）:

   - **local tag は作成済みだが push が失敗した場合**: remote に tag が無いことを確認
     できれば、local tag はまだ非公開なので安全に削除でき、step 3 のブロックを最初から
     再実行すればよい。

     ```bash
     test -n "${VERSION:-}" \
       && { git ls-remote --exit-code --tags origin "v${VERSION}" >/dev/null; test "$?" -eq 2; } \
       && git tag -d "v${VERSION}"
     # 削除できたら step 3 のブロックを再実行する。remote に tag が既にある場合は
     # このブロックでは削除されない（次の「push まで成功」のケースへ）。
     ```

   - **tag の push までは成功したが `gh release create` が失敗した場合**: 上のブロックを
     再実行しても tag 存在ガードで止まる。**公開済み tag = 手元で作った tag** であることを
     remote への実問い合わせ（`ls-remote`・ローカルの remote-tracking ref を信用しない）で
     確認してから、Release 作成のみを再実行する（Release が既に存在すれば create が
     エラーで止まる=安全側。remote 問い合わせが失敗した場合は比較が空文字になり
     中断する=fail-closed）。

     ```bash
     test -n "${VERSION:-}" \
       && test "$(git ls-remote origin "refs/tags/v${VERSION}" | cut -f1)" = "$(git rev-parse "v${VERSION}")" \
       && gh release create "v${VERSION}" --verify-tag --title "v${VERSION}" --generate-notes
     ```

## スコープ外

- tag の削除・打ち直しはスコープ外（通常の git 運用として扱う）。
