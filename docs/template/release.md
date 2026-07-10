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
2. main を最新化する（検証と変数設定はすべて step 3 のブロック内で行う。ブロックの
   外で設定した変数を step 3 は使わない）。

   ```bash
   git switch main && git pull --ff-only
   ```

3. 検証（清潔・live main 一致・同名 tag 不在）→ annotated tag の作成 → push →
   GitHub Release の作成を**単一の `&&` ブロック**で行う（途中で失敗すると後続は
   実行されない fail-closed。分割すると「前段の失敗後に後段だけ実行」の事故が可能に
   なるため分割しない）。冒頭の `unset` で同じ shell に残った古い変数を拒否し、
   `VERSION` / `RELEASE_COMMIT` は必ずこのブロック内で導出する。`git push --tags` は
   使わない（ローカルに残る無関係な tag までまとめて公開してしまうため、対象 tag
   だけを指定して push する）。

   ```bash
   unset VERSION RELEASE_COMMIT
   test -z "$(git status --porcelain)" \
     && VERSION=$(cat TEMPLATE_VERSION) \
     && RELEASE_COMMIT=$(git rev-parse HEAD) \
     && test "$(git ls-remote origin refs/heads/main | cut -f1)" = "${RELEASE_COMMIT}" \
     && ! git rev-parse -q --verify "refs/tags/v${VERSION}" >/dev/null \
     && { git ls-remote --exit-code --tags origin "v${VERSION}" >/dev/null; test "$?" -eq 2; } \
     && git tag -a "v${VERSION}" -m "Release v${VERSION}" "${RELEASE_COMMIT}" \
     && git push origin "v${VERSION}" \
     && gh release create "v${VERSION}" --verify-tag --title "v${VERSION}" --generate-notes
   # - tag 名 = `v` + TEMPLATE_VERSION の一致は、値をファイルから読んで tag 名に
   #   使うことで担保される。
   # - refs/heads/main の live 照合は、HEAD が remote の最新 main でない（未 push
   #   commit・同期漏れ・step 2 以降に main が進んだ）場合に古い commit へ公開 tag を
   #   打つのを防ぐ（照合に失敗したら step 2 からやり直す）。
   # - tag の ls-remote は exit 2（tag 不在）のときだけ続行する。0（同名 tag が既に
   #   存在）や 128（remote 不在・認証・ネットワークエラー）は中断する（! での反転は
   #   fatal エラーまで成功扱いにするため使わない）。
   # - gh release create の --verify-tag は省略しない（省略すると tag 不在時に gh が
   #   既定 branch から非 annotated tag を自動作成し、上のガードを迂回できるため）。
   ```

   **部分完了からの再開**（途中失敗時。どちらも再実行前に失敗原因を解消しておく）:

   - **local tag は作成済みだが push が失敗した場合**: remote に tag が無いことを確認
     できれば、local tag はまだ非公開なので安全に削除でき、step 3 のブロックを最初から
     再実行すればよい。

     ```bash
     unset VERSION
     VERSION=$(cat TEMPLATE_VERSION) \
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
     unset VERSION
     VERSION=$(cat TEMPLATE_VERSION) \
       && test "$(git ls-remote --refs origin "refs/tags/v${VERSION}" | cut -f1)" = "$(git rev-parse "v${VERSION}")" \
       && gh release create "v${VERSION}" --verify-tag --title "v${VERSION}" --generate-notes
     # ls-remote の --refs は annotated tag の peeled（^{}）行を確実に除外する
     # （出力が複数行になると比較が常に失敗し、再開が dead-end になるため）。
     ```

## スコープ外

- tag の削除・打ち直しはスコープ外（通常の git 運用として扱う）。
