## Context

ADR-0003 は OpenSpec `tasks.md` を単一 change 内の詳細計画・進捗の正とし、GSD を複数 changes
の横断管理に限定している。この境界は二重管理を避けるが、複数セッションや依存 phases を必要と
する大規模な単一 change では GSD の計画・復帰・検証を利用できない。

本プロジェクトでは `/opsx:*` を前提にできない。`openspec instructions apply` は context と実行
指示を返すが、実装や `tasks.md` の checkbox 更新は行わない。また `--json` の実出力は canonical
内容そのものではなく、context file paths、task progress、指示を返す。したがって canonical 内容は
常に OpenSpec の Markdown artifacts から読む必要がある。

この change は責務境界と手動運用だけを決める。GSD artifact 形式へ結合する bridge、skill、manifest、
drift / ownership の機械化は後続 `automate-openspec-gsd-handoff` に分離する。

## Goals / Non-Goals

**Goals:**

- OpenSpec を仕様・受け入れ基準・最終完了判定の単一の正にする。
- 小規模 change は OpenSpec CLI / Markdown fallback で直接実行し、大規模 change は GSD phases
  へ手動で引き渡す。
- OpenSpec と GSD の詳細タスク・進捗を二重管理しない。
- `/opsx:*`、OpenSpec CLI、GSD の不在や途中の規模変更に対する手順を定義する。

**Non-Goals:**

- bridge、統一実行 skill、handoff manifest、stable requirement ID、drift / ownership / cleanup の
  機械化を実装しない。
- OpenSpec change、仕様、受け入れ基準を GSD 側で生成または再定義しない。
- GSD、OpenSpec CLI、`/opsx:*` を改造・vendoring・コア依存化しない。
- push、PR、merge、rollback を自動化しない。

## Decisions

### 1. OpenSpec は全経路の仕様と最終完了を所有する

proposal、design、spec delta、受け入れ基準、`spec-holes` は OpenSpec を正本とする。GSD は大規模
change の実装計画と phase 進捗を所有できるが、仕様を複製・再定義しない。GSD 実行中に仕様へ影響
する判断が必要なら OpenSpec を先に更新し、validate 後に再計画する。

### 2. 独立出荷可能性を先に確認してから規模で経路を選ぶ

proposal、design、spec delta、`spec-holes` Phase 1 の確定後、`tasks.md` 確定前に経路を選ぶ。
独立してレビュー・出荷可能な成果が複数あれば、規模にかかわらず OpenSpec changes を分割する。
一体の成果について、複数セッション、依存 phases、有益な隔離並列単位、単一コンテキストで安全に
完了・検証不能のいずれかがあれば GSD 候補、それ以外は直接経路とする。

### 3. 小規模経路は OpenSpec CLI の指示を人または agent が実行する

小規模 change の `tasks.md` は詳細タスクと進捗を持つ。実行主体は
`openspec instructions apply --change <id>` を読み、各タスクを実装・検証して checkbox を更新する。
CLI はコード変更や checkbox 更新を自動実行しない。CLI 不在時は同じ Markdown artifacts を直接読む。

`--json` を利用する場合、JSON は context paths と progress の discovery にだけ使い、canonical 内容は
列挙されたファイルから読む。JSON が非互換なら固定レイアウトからファイルを探索し、`tasks.md` から
進捗を数える。どちらの経路も同じ Markdown を正本とする。

### 4. 大規模経路は再現可能な手動 handoff を行う

自動 bridge が存在しない段階でも再現できるよう、実行主体は次を行う。

1. change ID、proposal / design / spec delta / tasks の相対パス、`spec-holes` 完了、validate 結果を確認する。
2. 経路を GSD とした理由を `tasks.md` に記録し、handoff / phases / 原本検証 / project checks / close
   の境界ゲートだけを置く。
3. 専用 branch 上で canonical artifacts をレビュー可能な commit に固定し、既存 dirty changes を
   自動 stash / commit しない。
4. GSD に change ID、canonical paths、source commit、完了済み境界ゲート、未解決事項を渡す。
5. GSD phases は元 change への参照と対応範囲を持ち、一つの phase に複数 changes を混在させない。
6. 各 phase 完了後に GSD の進捗を更新し、main 実行主体が対応する OpenSpec 境界ゲートを更新する。

`.planning/` が無い場合の作成方法、利用する GSD skill、capability 判定の詳細は GSD の現行導線に従う。
自動化 change が具体的な probe 契約を定めるまでは、存在を推測して artifacts を生成しない。

### 5. 経路変更と失敗は承認付きで行う

直接実行中に大規模条件を満たした場合は、完了済み checkbox を保持し、未完了範囲を境界ゲートへ
再構成してから承認付きで GSD に昇格する。GSD が利用不能または安全に収束できない場合は、自動で
直接経路へ戻さず、既存 commits、完了済み phases、未完了範囲、詳細 `tasks.md` の再構成案を提示する。

### 6. GSD の完了とは別に OpenSpec 原本で最終検証する

全 GSD phases が完了しても change は完了ではない。OpenSpec 原本の各 requirement / scenario /
`spec-holes` と実装・テスト・理由付き未検証を対応付け、`task openspec:validate` と `task check` を
通した後にだけ、main 実行主体が最終境界ゲートを完了にする。

### 7. 依存 changes は専用 branches で段階的に close / merge する

テンプレート自身は main の `openspec/changes/` を空にする pre-merge close policy を維持する。
一つの PR は一つの active change だけを運び、本 change を最初に close / merge する。blocked な
`automate-openspec-gsd-handoff` は本 change の merge 後を base とする別 branch、
`harden-openspec-gsd-handoff-lifecycle` は MVP の merge 後を base とする別 branch に保持する。
後続 proposal を main や OpenSpec backlog へ複製せず、各専用 branch の proposal をその段階の正とする。

`docs/template/grill/ai-coding-template-ja.md` は現行 guidance ではなく当時の設計入力であるため、本文の
ADR-0003 記述は書き換えない。冒頭に superseded 状態と現行 authority への案内だけを追加し、歴史的
判断と live policy を区別する。

## Risks / Trade-offs

- **経路判定に裁量が残る** → 判定条件と理由を `tasks.md` に記録し、独立出荷可能性を先に確認する。
- **手動 handoff で転記漏れが起きる** → 固定手順と境界ゲートを文書化し、最終的に OpenSpec 原本で
  独立検証する。機械化は後続 change で扱う。
- **CLI JSON を正本と誤認する** → JSON は paths と progress の discovery に限定し、内容は常に
  Markdown から読む。
- **GSD 不在時に大規模 change が止まる** → 自動 fallback はせず、change 分割または詳細 tasks への
  再構成を提示して人が選ぶ。
- **ガバナンスと自動化が分離して一時的に手作業が増える** → 先に安価で可逆な境界を出荷し、実運用で
  得た知見を後続自動化の契約へ反映する。
- **blocked proposal と pre-merge close が衝突する** → 一つの PR に一つの change だけを置き、
  後続 proposal は依存順の専用 branch に保持して main / backlog へ複製しない。

## Migration Plan

1. 本 change だけを専用 branch / PR に分離し、後続 proposals を依存順の別 branches に保持する。
2. ADR-0008 を追加し、ADR-0003 と双方向に supersession を記録する。
3. `AGENTS.md`、`openspec/project.md`、workflow の責務境界と engine / fallback の両セクションを更新する。
4. optional GSD docs と guide を新しい選択基準へ更新し、historical grill 文書へ現行 authority の注記を追加する。
5. OpenSpec 原本との対応、リンク、`task openspec:validate`、`task check` を検証する。
6. 本 change を pre-merge close して merge した後、MVP、hardening の順に各専用 branch を実装する。

Rollback は ADR-0008 を superseded / rejected として記録し、ADR-0003 の境界へ文書を戻す。既存
OpenSpec change のファイル形式は変更しないため、データ移行は不要である。

## Open Questions

本 change の手動運用を妨げる未決事項はない。ただし、次は後続自動化 change の実装開始前に決める。

- 対応する `openspec instructions apply --json` の schema / version 範囲と、非互換判定の条件。
- GSD の必要 capability を存在確認する具体的な probe signal と、利用可能な skill 間の対応。
- GSD artifact の ownership、drift、finalize を永続化する最小 manifest schema。

dependent changes の保持方法は未決ではなく Decision 7 で専用 branch / 段階 merge と確定した。

## Spec holes Phase 1

各要件に固定12分類を順番に適用した。「1」は仕様・scenarioへの明記、「2」は明示的スコープ外を示す。

### R1: change の実行経路を選択する

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | change ID / 必須 artifact 欠落 | 1: 実行準備不足として停止 |
| 2 | 境界値 | 該当 | 大規模条件が0件か1件か | 1: 0件は直接、1件以上はGSD候補 |
| 3 | 重複・衝突 | 該当 | 独立成果と一体成果が混在 | 1: 独立出荷可能性を優先してchanges分割 |
| 4 | 順序 | 該当 | 判定時期が未定義 | 1: spec-holes後、tasks確定前に判定 |
| 5 | 型・形式不正 | 該当 | 不正なchange構成 | 1: validate可能な構成になるまで停止 |
| 6 | エラー経路 | 該当 | 経路を確定できない | 1: 理由を示し、小規模開始か分割を人が判断 |
| 7 | 冪等性・再実行 | 該当 | 再判定で経路が変わる | 1: 変更理由と承認を必須化 |
| 8 | 時刻・タイムゾーン | 非該当 | 時刻を判定入力にしない | 2: スコープ外 |
| 9 | 文字列 | 該当 | 空白・Unicode change ID | 1: OpenSpecが受理するIDだけを使用 |
| 10 | 数値 | 非該当 | 数値閾値を使わない | 2: スコープ外 |
| 11 | 巨大入力・リソース枯渇 | 該当 | 単一contextで安全に扱えない | 1: GSD候補条件に含める |
| 12 | 状態遷移 | 該当 | 実行途中の規模変更 | 1: 履歴保持と承認付き昇格を定義 |

### R2: OpenSpec と GSD の所有権を分離する

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | canonical specがない | 1: handoff不可とする |
| 2 | 境界値 | 該当 | GSD phaseが1個だけ | 1: 大規模条件を満たすなら同じ境界を適用 |
| 3 | 重複・衝突 | 該当 | OpenSpecとGSDで仕様が衝突 | 1: OpenSpec優先で停止・再計画 |
| 4 | 順序 | 該当 | GSDを先に更新する | 1: OpenSpec更新・validateを先行 |
| 5 | 型・形式不正 | 該当 | requirement参照が壊れる | 1: 対応範囲を確認できるまで完了不可 |
| 6 | エラー経路 | 該当 | 仕様変更が途中失敗 | 1: 旧phaseを進めず未完了維持 |
| 7 | 冪等性・再実行 | 該当 | 同じ仕様の再handoff | 1: 新しい仕様を作らず同じ正本を参照 |
| 8 | 時刻・タイムゾーン | 非該当 | timestampで正本を選ばない | 2: スコープ外 |
| 9 | 文字列 | 該当 | Unicode見出しの参照 | 1: pathと見出しを改変せず参照 |
| 10 | 数値 | 非該当 | 数値計算なし | 2: スコープ外 |
| 11 | 巨大入力・リソース枯渇 | 該当 | 全仕様をGSDへ複製したくなる | 1: 複製せずcanonical pathsを参照 |
| 12 | 状態遷移 | 該当 | GSD中に仕様変更 | 1: 停止→OpenSpec更新→再計画を定義 |

### R3: 小規模 change を直接実行する

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | tasksが空 | 1: 実行準備不足として停止 |
| 2 | 境界値 | 該当 | taskが1件 | 1: 詳細taskとして直接実行可能 |
| 3 | 重複・衝突 | 該当 | JSON progressとcheckboxが不一致 | 1: `tasks.md`を正本とする |
| 4 | 順序 | 該当 | tasksを順不同で実行 | 1: `tasks.md`記載順と依存に従う |
| 5 | 型・形式不正 | 該当 | CLI JSONが非互換 | 1: 固定Markdown layoutへ縮退 |
| 6 | エラー経路 | 該当 | CLI不在・task失敗 | 1: Markdown fallbackまたは未完了維持 |
| 7 | 冪等性・再実行 | 該当 | 指示の再取得 | 1: checkbox済みtaskを再完了扱いしない |
| 8 | 時刻・タイムゾーン | 非該当 | 時刻依存なし | 2: スコープ外 |
| 9 | 文字列 | 該当 | MarkdownのUnicode内容 | 1: UTF-8の原本をそのまま読む |
| 10 | 数値 | 該当 | progressの0/全件 | 1: checkboxから0..totalとして算出 |
| 11 | 巨大入力・リソース枯渇 | 該当 | 直接経路で扱えない規模 | 1: 経路を再判定してGSD昇格候補 |
| 12 | 状態遷移 | 該当 | task失敗・中断・再開 | 1: 完了済みcheckboxを保持して再開 |

### R4: 大規模 change を手動で GSD へ引き渡す

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | change path / commit / phase欠落 | 1: handoff前チェックで停止 |
| 2 | 境界値 | 該当 | phaseが0件・1件 | 1: 0件は不可、1件以上を許可 |
| 3 | 重複・衝突 | 該当 | 1 phaseに複数changes | 1: 禁止し分割を要求 |
| 4 | 順序 | 該当 | commit前にGSD開始 | 1: review可能なsource commitを先行 |
| 5 | 型・形式不正 | 該当 | 壊れたpath / branch情報 | 1: 推測せず停止 |
| 6 | エラー経路 | 該当 | GSD不在・phase失敗 | 1: 状態と代替案を提示し自動fallback禁止 |
| 7 | 冪等性・再実行 | 該当 | 同一handoffの再実行 | 1: 完了済みphaseを保持してresume |
| 8 | 時刻・タイムゾーン | 非該当 | 時刻でsourceを選ばない | 2: スコープ外 |
| 9 | 文字列 | 該当 | pathの空白・Unicode | 1: repo相対pathを改変せず渡す |
| 10 | 数値 | 非該当 | 数値演算なし | 2: スコープ外 |
| 11 | 巨大入力・リソース枯渇 | 該当 | GSD入力能力を超える | 1: 切捨てず分割または停止 |
| 12 | 状態遷移 | 該当 | 直接→GSD、GSD→直接 | 1: 履歴・再構成案・承認を必須化 |

### R5: OpenSpec 原本で最終完了を判定する

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | 検証対応表が空 | 1: requirement全件対応まで未完了 |
| 2 | 境界値 | 該当 | 0件・1件の未検証 | 1: 1件でも理由なしなら未完了 |
| 3 | 重複・衝突 | 該当 | GSD greenとOpenSpec不一致 | 1: OpenSpec検証を優先 |
| 4 | 順序 | 該当 | boundary gateを先に完了 | 1: 原本検証とproject checks後に更新 |
| 5 | 型・形式不正 | 該当 | validate不能なartifact | 1: 完了不可 |
| 6 | エラー経路 | 該当 | test / validate失敗 | 1: gateを未完了のまま報告 |
| 7 | 冪等性・再実行 | 該当 | 最終検証の再実行 | 1: 同じ原本・実装なら同じ判定を要求 |
| 8 | 時刻・タイムゾーン | 非該当 | 完了を時刻で決めない | 2: スコープ外 |
| 9 | 文字列 | 該当 | scenario名の表記差 | 1: 原本のpath / headingで対応付け |
| 10 | 数値 | 該当 | progress 100%だけで完了 | 1: checkbox比率だけでは完了にしない |
| 11 | 巨大入力・リソース枯渇 | 該当 | 全検証が時間内に終わらない | 1: 未検証理由を明記し人が完了可否判断 |
| 12 | 状態遷移 | 該当 | 完了後の仕様drift、blocked後続changeとの同時close | 1: 再検証し、後続は専用branchで段階merge |

## Spec holes Phase 2 の検証方針（実装時）

本 change は process / documentation 仕様であり、純関数やruntime APIを追加しないためHypothesisや
コード単体testの対象ではない。`tasks.md` 4.2で、Phase 1の各「該当」行を次のいずれかへ一対一で
対応付ける。

- requirement / scenario と更新後の authority 文書箇所の対応確認
- 小規模直接実行、大規模手動handoff、途中昇格、失敗、段階closeの手動scenario walkthrough
- ADR / 文書リンクとactive / historical参照の検査
- OpenSpec CLIのinstructions / validateとproject checksによる例示確認
- 自動検証できない項目の理由付き未検証記録

process仕様をコードtest済みとは報告せず、対応表とself-reviewの証跡をPhase 2の検証結果とする。

### Phase 2 対応表

#### Requirement / scenario と永続文書の対応

| Requirement / scenario | 永続文書の対応先 |
| --- | --- |
| R1 小規模 change を選択する | `AGENTS.md` Workflow、workflow「実行経路の判定」1–3 |
| R1 大規模 change を選択する | 同上、optional GSD「責務境界」 |
| R1 独立出荷可能な成果を発見する | ADR-0008、workflow「実行経路の判定」1 |
| R1 直接実行中に大規模条件を満たす | ADR-0008 Consequences、workflow「実行経路の判定」後段 |
| R1 実行開始条件が不足する | workflow「大規模 change の手動 handoff」、engine / fallback |
| R2 小規模 change の tasks を作成する | AGENTS.md Workflow、workflow「小規模 change」 |
| R2 大規模 change の tasks を作成する | AGENTS.md Workflow、workflow「大規模 change」 |
| R2 GSD phase を OpenSpec change へ対応付ける | ADR-0008、workflow「大規模 change」、optional GSD「責務境界」 |
| R2 GSD 実行中に仕様変更が必要になる | ADR-0008、workflow「大規模 change」、optional GSD「手動 handoff」後段 |
| R2 GSD が内部実装を判断する | workflow「大規模 change」の可逆な内部実装規定 |
| R3 OpenSpec CLI を利用する | workflow「OpenSpec engine のアクセス形態」CLI項目 |
| R3 OpenSpec CLI JSON を利用する | workflow同節の`--json`項目、ADR-0008 Consequences |
| R3 CLI または JSON 契約を利用できない | workflow「Markdown fallback」、optional GSD「不在または継続不能」 |
| R3 task を完了する | AGENTS.md checkbox規律、workflow CLI / fallback節 |
| R3 task が失敗または中断する | workflow「実行経路の判定」後段とcheckbox規律 |
| R4 手動 handoff を準備する | workflow / optional GSD「大規模 change の手動 handoff」1–2 |
| R4 source 状態を固定する | 同手順3、ADR-0008手動handoff段落 |
| R4 GSD に context を渡す | 同手順4–5 |
| R4 GSD capability を確認できない | workflow手順4、optional GSD「不在または継続不能」 |
| R4 GSD 実行から復帰する | ADR-0008のsource / progress保持、workflowのhandoff / fallback規定 |
| R4 GSD から直接経路へ戻す | ADR-0008手動handoff段落、workflow「実行経路の判定」後段 |
| R5 GSD phases が完了する | workflow / optional GSD「最終完了は OpenSpec」 |
| R5 最終検証が成功する | AGENTS.md Workflow、workflow「原本検証 / PR前チェック」 |
| R5 対応漏れを発見する | workflowの原本対応付け、optional GSD最終完了節 |
| R5 最終コマンドまたは受け入れ検証が失敗する | workflowの境界gate規定、AGENTS.md Validation |
| R5 未実装の依存 changes が後続にある | ADR-0008 Consequences、project.md段階close、workflow pre-merge close |
| R5 完了後に OpenSpec 原本の変更を検出する | workflowの仕様変更時停止・再validate・再計画規定 |

#### Phase 1 holes と検証形態の対応

| 穴 | 検証形態 | 検証先 / 手順 |
| --- | --- | --- |
| R1-1 空・欠落 | 手動walkthrough | workflowの開始条件でchange ID / 必須artifact欠落時の停止を確認 |
| R1-2 0/1条件 | 手動walkthrough | 小規模条件0件とGSD条件1件のroute例をworkflowで確認 |
| R1-3 独立成果の混在 | 文書レビュー | proposalとworkflowのchange分割優先を確認 |
| R1-4 判定順序 | 文書レビュー | spec-holes後・tasks確定前の順序をworkflowで確認 |
| R1-5 不正change形式 | CLI例示 | `openspec validate <id> --strict`を実行 |
| R1-6 route不確定 | 手動walkthrough | 理由提示後に分割または小規模開始を選ぶ導線を確認 |
| R1-7 再判定 | 手動walkthrough | 直接実行からGSD昇格時の履歴保持・承認を確認 |
| R1-8 時刻 | 非該当確認 | route判定が時刻を入力にしないことを文書確認 |
| R1-9 change ID文字列 | CLI例示 | OpenSpec CLIが対象change IDを解決できることを確認 |
| R1-10 数値閾値 | 非該当確認 | 件数スコアではなく質的条件でrouteを選ぶことを確認 |
| R1-11 大規模入力 | 手動walkthrough | 単一contextで安全に扱えない場合をGSD候補とすることを確認 |
| R1-12 途中昇格 | 手動walkthrough | 完了checkbox保持→tasks再構成→承認→handoffを確認 |
| R2-1 canonical spec欠落 | 手動walkthrough | handoff準備チェックで停止することを確認 |
| R2-2 1 phase | 手動walkthrough | phaseが1件でもGSD条件を満たす場合の所有権を確認 |
| R2-3 OpenSpec / GSD衝突 | 手動walkthrough | GSD停止→OpenSpec更新を確認 |
| R2-4 更新順序 | 文書レビュー | OpenSpec更新・spec-holes・validateをGSD再計画より先に実行する記述を確認 |
| R2-5 壊れたrequirement参照 | リンク・対応検査 | OpenSpec原本とphase担当範囲の参照を目視確認 |
| R2-6 仕様更新の部分失敗 | 手動walkthrough | 旧phaseを進めず境界gateを未完了に保つことを確認 |
| R2-7 再handoff | 手動walkthrough | 同じ正本を参照し仕様を複製しないことを確認 |
| R2-8 timestamp優先 | 非該当確認 | timestampで仕様の正を選ばないことを確認 |
| R2-9 Unicode見出し | 文書レビュー | canonical path / headingを改変せず参照する記述を確認 |
| R2-10 数値計算 | 非該当確認 | 所有権判定に数値計算がないことを確認 |
| R2-11 仕様全体の複製 | 文書レビュー | GSDがcanonical pathsを参照し仕様を複製しないことを確認 |
| R2-12 GSD中の仕様変更 | 手動walkthrough | 停止→OpenSpec更新→validate→再計画を確認 |
| R3-1 tasks空 | CLI / gate例示 | `task openspec:validate`のcheckbox preflightを確認 |
| R3-2 task 1件 | CLI例示 | `openspec instructions apply --change <id>`が進捗を返すことを確認 |
| R3-3 JSON進捗衝突 | 文書レビュー | `tasks.md`を正本とするCLI JSON説明を確認 |
| R3-4 task順序 | 文書レビュー | `tasks.md`記載順と依存に従う規約を確認 |
| R3-5 JSON非互換 | 手動walkthrough | 固定Markdown layoutへのfallbackを確認 |
| R3-6 CLI不在 / task失敗 | 手動walkthrough | Markdown fallbackと未完了checkbox維持を確認 |
| R3-7 instructions再取得 | CLI例示 | 再取得して既存checkbox進捗が保持されることを確認 |
| R3-8 時刻 | 非該当確認 | 直接実行が時刻非依存であることを確認 |
| R3-9 Unicode Markdown | 文書レビュー | UTF-8 canonical Markdownをそのまま読む記述を確認 |
| R3-10 progress境界 | CLI例示 | `instructions apply --json`のtotal / complete / remainingを確認 |
| R3-11 直接経路の肥大 | 手動walkthrough | route再判定とGSD昇格候補化を確認 |
| R3-12 中断・再開 | 手動walkthrough | 完了済みcheckboxを保持することを確認 |
| R4-1 handoff入力欠落 | 手動walkthrough | 固定handoff checklistで書込前停止を確認 |
| R4-2 phase 0/1件 | 手動walkthrough | 0件不可・1件以上許可を確認 |
| R4-3 cross-change phase | 文書レビュー | 一つのphaseに一つのchangeだけを対応させる記述を確認 |
| R4-4 commit前開始 | 文書レビュー | 専用branchとreview可能なsource commitを先行する記述を確認 |
| R4-5 不正path / branch | 手動walkthrough | 推測せず停止することを確認 |
| R4-6 GSD不在 / failure | 手動walkthrough | 自動fallbackせず状態と代替案を提示することを確認 |
| R4-7 再handoff / resume | 手動walkthrough | sourceと完了phaseを再確認してresumeすることを確認 |
| R4-8 時刻 | 非該当確認 | source選択が時刻非依存であることを確認 |
| R4-9 Unicode path | 文書レビュー | repo相対pathを改変せずhandoffする記述を確認 |
| R4-10 数値演算 | 非該当確認 | handoff判断に数値演算がないことを確認 |
| R4-11 GSD入力上限 | 手動walkthrough | 切捨てず分割または停止することを確認 |
| R4-12 route変更 | 手動walkthrough | 履歴・再構成案・承認を必須とすることを確認 |
| R5-1 検証対応なし | self-review | requirement / scenarioと文書変更の対応表が全件あることを確認 |
| R5-2 未検証1件 | self-review | 理由なし未検証が1件でもあればgateを残すことを確認 |
| R5-3 GSD greenとの衝突 | 手動walkthrough | OpenSpec原本検証を優先することを確認 |
| R5-4 gate順序 | 文書レビュー | 原本検証とproject checks後だけ完了markする記述を確認 |
| R5-5 validate不能 | CLI例示 | changeごとのstrict validateを実行 |
| R5-6 command failure | 手動walkthrough | failure報告と未完了gate維持を確認 |
| R5-7 再検証 | CLI例示 | validate / project checksを再実行し同じ結果を確認 |
| R5-8 時刻 | 非該当確認 | 完了判定が時刻非依存であることを確認 |
| R5-9 scenario表記 | self-review | OpenSpec原本のpath / headingで文書対応を確認 |
| R5-10 progress 100% | 文書レビュー | checkbox比率だけで完了にしないことを確認 |
| R5-11 検証時間超過 | 理由付き未検証 | 長時間化を人工的に再現せず、未検証理由の記録規約を文書確認 |
| R5-12 drift / 段階close | 手動walkthrough | gate再開とone-change-per-PR、専用branchでの依存順closeを確認 |
