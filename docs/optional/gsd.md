# GSD の導入（オプション・opt-in install）

GSD（GSD Core）は、大規模な単一 OpenSpec change の詳細 plan / phase 進捗や、複数 change を
横断するロードマップを管理できるシステム。50+ の skills と installer 機構を持つ大型資産のため、
本テンプレートには **vendoring しない**（コミットしない・`.agents/skills/skills.lock.json` の
管理対象外）。導入は各自の環境への opt-in install で行い、installer が取得したファイルは
ユーザ環境（`~/.claude/` 等）に置かれる。

## インストール（要 Node.js・コアは Node 不要のまま）

```bash
npx @opengsd/gsd-core@latest
```

- installer が対話で runtime（Claude Code / Codex ほか）と global / local を選択させる。
  `agents/` / `commands/` の手動コピーはしない（installer がクロス runtime 互換を担う）。
- 供給元: npm `@opengsd/gsd-core`（<https://github.com/open-gsd/gsd-core>）。
  v1.6.1 で確認（2026-07-02）。
- 更新は同コマンドの再実行（導入済み環境では `/gsd-update` も使える）。

## OpenSpec との責務境界（[ADR-0008](../template/adr/0008-adaptive-openspec-gsd-execution-boundary.md)）

[docs/agents/workflow.md](../agents/workflow.md) の現行境界を要約する。詳細と経路判定は同文書を正とする。

- **全経路で OpenSpec が正本**: proposal、design、spec delta、受け入れ基準、`spec-holes`、
  最終完了判定は OpenSpec が所有する。GSD 側へ仕様や受け入れ基準を複製・再定義しない。
- **独立出荷可能なら先に changes を分割**: GSD phases は、一体の成果に必要な実装分割に使う。
- **小規模 change は直接実行**: 単一セッション / 単一コンテキストで安全に実装・検証できる場合、
  OpenSpec `tasks.md` が詳細タスクと進捗を持つ。`openspec instructions apply --change <id>` の
  指示、または同じ Markdown artifacts を読み、各タスク完了時に checkbox を更新する。
- **大規模 change は GSD へ handoff**: 複数セッション、依存する複数 phases、有益な隔離並列単位、
  または単一コンテキストで安全に完了・検証できない条件があれば、GSD が詳細 plan、phase 実行、
  phase 進捗を所有する。この場合、OpenSpec `tasks.md` は handoff、全 phases 完了、OpenSpec 原本検証、
  project checks、close の境界ゲートだけを持ち、GSD の詳細 plan を二重化しない。
- **一つの phase は一つの change**: 各 GSD phase は元の OpenSpec change と担当範囲を参照し、
  一つの phase に複数 changes の要件を混在させない。

## 大規模 change の手動 handoff

自動 bridge は前提にしない。GSD 経路として承認された change は次の順で引き渡す。

1. change ID、proposal / design / spec delta / tasks の相対パス、`spec-holes` Phase 1、
   OpenSpec validate の結果を確認する。
2. GSD を選んだ理由を `tasks.md` に記録し、同ファイルを境界ゲートだけへ整理する。
3. 非デフォルトの専用 branch で canonical artifacts をレビュー可能な commit に固定する。
   既存の dirty changes を自動 stash / commit しない。
4. GSD に change ID、canonical artifact paths、source commit、完了済み境界ゲート、未解決事項を渡す。
5. 各 phase に元 change と担当範囲を参照させる。仕様や受け入れ基準は GSD artifacts へ転記しない。
6. phase ごとの検証と進捗更新後、実行主体が対応する OpenSpec 境界ゲートを更新する。

GSD 実行中に仕様変更が必要になった場合は、GSD を止め、OpenSpec 原本または ADR を先に更新する。
`spec-holes` と validate を再実行してから、影響する phases を再計画する。

## GSD が不在または継続不能な場合

GSD は opt-in であり、不在は正常。小規模 change は OpenSpec CLI で直接実行でき、CLI 自体が
利用できない場合も OpenSpec の Markdown artifacts と `tasks.md` checkbox で同じ運用を維持できる。

大規模 change で GSD が不在、必要 capability を確認できない、または途中で安全に継続できない場合、
別経路へ自動切替しない。change の分割、または未完了範囲を OpenSpec の詳細 `tasks.md` へ戻す案を
提示し、人の承認後にだけ経路を変更する。完了済み phases、commits、checkbox は保持する。

## 最終完了は OpenSpec で判定する

GSD の全 phases が green でも、OpenSpec change の完了とはみなさない。OpenSpec 原本の全 requirements、
scenarios、`spec-holes` を実装・テスト・理由付き未検証へ対応付け、文書リンクも確認する。
`task openspec:validate` と `task check` を含む project gates が成功した後にだけ、OpenSpec の最終境界
ゲートを完了にする。

## 診断

GSD は環境レベル（`~/.claude/` 等）にインストールされ、リポジトリ内に信頼できる在席シグナルを
残さないため、`task doctor` は GSD を probe しない（docs のこの手順が導線のすべて）。
