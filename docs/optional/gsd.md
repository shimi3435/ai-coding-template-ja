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

handoff 開始の任意 automation entry は first-party `execute-openspec-change` skill である。canonical
contract は `design.md` §5 / §10 と `spec.md` §「Requirement: policyとcapabilityのpreflight後にGSD
handoffを開始する」で、skill は preview から started transition までしか扱わない。

利用順は read-only inspect / host preflight、完全な preview、表示後の新たな明示承認、structured
`prepared`、初期化状態に応じた一回の dispatch、observable acceptance、`started` である。preview の
`input_route` は決定論的な `json` / `markdown-fallback` label/state だけを表示し、fallback 原因を
推測しない。拒否または inspect failure では brief、dispatch、manifest state を変更しない。

両 route は同一の `PARITY_PAYLOAD` を渡す。payload は change ID、全 canonical paths、source commit、
完了済み境界ゲート、未解決事項、one-phase/one-change、specification nonduplication を省略なく持つ。
未初期化時はその payload だけから source-pinned brief を作り
`$gsd-new-project --auto @<brief>`へ渡す。初期化済み時は payload を change 専用 `$gsd-phase` へ inline
で渡す。GSD artifacts へ仕様、requirements、scenarios、受け入れ基準を転記しない。

dispatch は host workflow の structured completed-success **かつ** route 固有 read-only postcondition
が揃った場合だけ accepted とする。exit 0 や prose marker だけでは `started` に進めない。

- 未初期化 route: `node ${GSD_HOME}/gsd-core/bin/gsd-tools.cjs init progress --raw` を再実行し、fully
  initialized、対象 root、agents installed / missing agents なしを確認する。PROJECT / REQUIREMENTS /
  ROADMAP / STATE の集合が exact payload または exact brief reference を保持することも確認する。
- 初期化済み route: dispatch 前後の maximum phase、phase directories、ROADMAP snapshot を比較し、
  exactly one max+1 phase と対応 directory だけが追加され、新 ROADMAP section が exact inline payload
  を保持することを確認する。

不足、checkpoint、空、malformed、partial、ambiguous、dispatch failure、postcondition mismatch は
accepted ではなく、manifest を `prepared` のまま保持する。完了済み step、failure point、同じ frozen
inputs を使う manual continuation evidence を報告し、自動 retry、route switch、rollback を行わない。

Codex host に `agent_type` がなければ `generic-agent workaround` と明示し、typed dispatch と同等には
扱わない。bridge inspect で entrypoint を read-only 選択した後、承認 / prepare 前に local GSD 1.5.0
の選択 workflow、到達可能な実 spawn 名すべて、active-config TOML の完全な role preamble、isolation
requirements を解決する。不明、typed-only、worktree-isolated、非互換なら fail-closed する。

manifest 成功後は manifest path と canonical artifacts の source commit を確認し、operator がレビュー後
に**別の後続 tracking commit**を作る。skill 自身は commit しない。feature branch の manifest は source
commit と区別し、`.planning/` が ignore または repository policy 上追跡不能なら prepare 前に停止する。
handoff 後の lifecycle、final completion、retry / recovery、cleanup、push、PR、merge は自動化しない。

Phase 2 の通常 CI が確認するのは静的な SKILL / fixture instruction contract と既存 Phase 1 の動的 state
seam だけである。実 host orchestration、generic spawn、GSD route mutation、route postcondition は未検証で、
Phase 3 の opt-in / manual evidence が所有する。

GSD 実行中に仕様変更が必要になった場合は、GSD を止め、OpenSpec 原本または ADR を先に更新する。
`spec-holes` と validate を再実行してから、影響する phases を再計画する。

## GSD が不在または継続不能な場合

GSD は opt-in であり、不在は正常。小規模 change は OpenSpec CLI で直接実行でき、CLI 自体が
利用できない場合も OpenSpec の Markdown artifacts と `tasks.md` checkbox で同じ運用を維持できる。

大規模 change で GSD が不在、必要 capability を確認できない、または途中で安全に継続できない場合、
別経路へ自動切替しない。change の分割、または未完了範囲を OpenSpec の詳細 `tasks.md` へ戻す案を
提示し、人の承認後にだけ経路を変更する。完了済み phases、commits、checkbox は保持する。
`execute-openspec-change` の inspect / generic preflight が失敗した場合は pre-prepare のまま canonical
paths と source commit を使う手動 handoff を提示する。prepare 後に dispatch が accepted にならない
場合は `prepared` manifest、完了済み step、failure point、manual continuation evidence を保持して停止する。
どちらも自動 retry や別 route への切替を開始する理由にはならない。

## 最終完了は OpenSpec で判定する

GSD の全 phases が green でも、OpenSpec change の完了とはみなさない。OpenSpec 原本の全 requirements、
scenarios、`spec-holes` を実装・テスト・理由付き未検証へ対応付け、文書リンクも確認する。
`task openspec:validate` と `task check` を含む project gates が成功した後にだけ、OpenSpec の最終境界
ゲートを完了にする。

## 診断

GSD は環境レベル（`~/.claude/` 等）にインストールされ、リポジトリ内に信頼できる在席シグナルを
残さないため、`task doctor` は GSD を probe しない（docs のこの手順が導線のすべて）。
