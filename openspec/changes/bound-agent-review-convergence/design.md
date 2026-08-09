# Design: bounded agent review convergence

## Context

ADR-0009 は plan / evidence / review を distinct failure / seam / risk と恒久成果へ比例させる。しかし、
review finding 修正時の全スコープ読込、全体 check、fresh agent 生成を止める具体的な収束契約がない。
Issue #43 は品質 gate を減らす変更ではなく、blocker を閉じる検証を残したまま、同じ入力と同じ risk に
対する重複を有界化する変更である。

## Goals / Non-Goals

### Goals

- direct change / GSD phase のどちらでも適用できる固定 review topology を定義する。
- iteration、blocker、green evidence、soft-stop を曖昧なく定義する。
- material work と distinct verification value に比例する agent 配分へ既存規約を置換する。
- 通常 CI が main に残る恒久 policy contract だけを検査する seam を作る。

### Non-Goals

- 外部 GSD runtime、review loop、host orchestration の変更。
- review iteration を永続化または自動制御する state machine / CLI / validator。
- token、時間、行数による hard cap または blocker の成功扱い。
- 一時 OpenSpec / `.planning` artifacts と外部 runtime 文面の通常 CI 固定。

## Decisions

### 1. topology は full review を2回に固定する

cycle 単位は direct route の1 OpenSpec change、GSD route の1 phase とする。cycle 開始時に全スコープ
inventory を固定し、self-review 1回、initial full review、finding の fix / focused validation / diff review、
別の fresh reviewer による final full review、全体 check、同じ cycle の executor / reviewers と別の独立 verifier の
順に実行する。initial が clean でも final は行う。final finding は差分 review で閉じ、full review を反復しない。

self-review は tracked unstaged / staged / base diff と、`git ls-files --others --exclude-standard` が列挙する
未追跡 file の内容を検査し、ignored file を除外する。large / binary file に固定 size cap は設けず、path / size /
type を確認する。安全な全文読取または truncation 判定ができなければ未検証とし、full-scope 内の required
evidence なら blocker、scope 外または optional なら理由と影響を記録する。

1 iteration は未解決 blocker 一式の fix、focused validation、diff / direct dependency review の完了した組で
あり、finding 件数ではない。initial review 後から final review と全体 check の収束まで合計3回を上限とする。
self-review と full review 自体は数えない。correctness / contract finding は RED test または再現 probe を先行
させる。機械検査できない純 prose 誤りは矛盾 evidence と理由を記録し、mechanical typo / format / unused import
は RED を要求せず focused validation だけを行う。

blocker は label ではなく、acceptance / MUST / SHALL 未達、correctness / security / data loss / trust boundary、
必須 validation failure、必須 evidence 欠落、安全な merge / phase completion の可否で判定する。non-blocker は
defer / dismiss し、自動 Issue 作成や cycle 延長を行わない。

### 2. green evidence は command 単位で fail-closed に再利用する

evidence は command / exit 0、source commit、dirty input diff digest または検証後 input 不変の証明、lockfile、
build / CI 設定、fixtures、repository real path、worktree、source snapshot、dependency environment、影響する
OS / locale / auth 等を持つ。同一性を証明できない項目が一つでもあれば再実行する。`task check` と
`task openspec:validate` は入力集合が異なるため別判定とする。証跡変更も command が読むなら evidence を無効にする。

standalone self-review の reusable evidence も実行 command と exit 0 を最低条件とし、他の identity 全項目を
維持する。bounded cycle 内の self-review は full check を要求しない。`verify-change` では acceptance criteria、
MUST / SHALL、project gate の required evidence 欠落または required 性不明を blocker とする。理由・影響付きの
未検証を non-blocker にできるのは optional seam、明示的 out-of-scope、研究環境制約だけとする。

各 fix は focused validation を行い、全 review 収束後に最新入力の `task check` を1回実行する。隔離できない
integration finding は理由付きで全体 check を早く実行でき、その後入力不変なら最終 evidence に再利用する。
全体 check の source failure は残 iteration へ戻し、full review は反復しない。infrastructure / flaky failure の
同一入力 retry は1回だけ、source 修正なしなら iteration 外とし、再現時は soft-stop する。

close 前は strict target validate、全 change validate、全体 check、verifier を完了する。その後 retrospective / tasks
更新で影響した command だけを再実行し、change directory 削除後は `task openspec:validate` で active change 0 と
green を確認する。通常 CI test が削除 artifacts を入力にしないことを契約化できた場合だけ `task check` evidence を
再利用する。

### 3. material work は継続 executor、検証は独立 reviewer / verifier に配分する

一体の change / phase は原則1 executor が material tasks と finding fix を継続する。executor が終了、失敗、
context contamination の場合だけ同じ fixer を1名追加する。finding ごとの fresh fixer は作らない。initial reviewer と
final reviewer は別の fresh agent とする。verifier は同じ cycle の executor / reviewers と別の独立 agent とする。
soft-stop 後の新 cycle では、旧 cycle の verifier が fix に関与せず、context が健全で、最新入力との evidence
identity を再確認できる場合に限り再利用できる。

main は成果検証後に `STATE`、`ROADMAP`、checkbox、report path の機械的補正を処理する。agent 追加は
独立・非重複・個別検証可能な実装単位、failure、contamination
だけに限る。独立単位は実行予算へ記録した場合だけ並列可能だが、review topology は直列にする。失敗 agent の未採用成果は
iteration 外、採用差分は検証と review 後に iteration とする。同じ役割が2回連続失敗、または working state の安全性が
不明なら停止する。明示選択された vendored `code-review` の Standards / Spec 2軸だけ例外配分とし、標準 reviewer を
重ねない。

### 4. soft-stop 後の継続は新 cycle とする

3 iterations exhaustion、仕様判断、material expansion、連続 agent failure、working state 不明、再現する infrastructure
failure は成功扱いせず停止する。material expansion は trust boundary、公開 API、永続形式 / migration、runtime dependency /
lockfile、build / CI / distribution、独立成果、change、phase、外部依存の追加・拡張を含む。

停止時は既存 report または応答に cycle / iteration、未解決 blocker、各差分、focused / green evidence、agent と追加理由、
停止理由、4選択肢を残す。専用 file は作らない。継続承認は単なる追加3回ではなく、scope、残予算、inventory を再計画した
iteration 0の新 cycle とする。恒久測定は Issue または retrospective の一方へ optional suffix を1行だけ記録する。

### 5. 恒久 policy anchors だけを通常 CI で検査する

1つの静的 test file が `docs/template/adr/0009-proportional-agent-workflow-evidence-economy.md`、`AGENTS.md`、
`CONTEXT.md`、`docs/agents/workflow.md`、`.agents/skills/self-review/SKILL.md`、
`.agents/skills/verify-change/SKILL.md` の stable headings / policy anchors、重要数値、topology 順序を検査する。
OpenSpec artifacts、外部 GSD 文面、`.planning`、全文 snapshot は通常 CI 入力にしない。

### 6. Standards judgement: minimum evidence fields の重複を許容する

workflow、`self-review`、`verify-change` に minimum evidence fields が重複するという Standards finding は
dismiss する。各 skill は standalone で利用されるため、owner 文書への参照だけへ縮退させるより自己完結性を
優先する。共通 fixture / abstraction は新設せず、1つの静的 contract test で各 skill の minimum fields が
workflow と整合することを確認する。重複量の削減自体は distinct failure / seam / risk を追加しない。

### 7. 旧 cycle は iteration 3/3 で soft stop した

旧 cycle は iteration 3/3 まで使っても Issue #43 本文との整合 blocker が残ったため、成功扱いせず soft stop
した。旧 task 15.3 は差分収束、全体 check、verifier、OpenSpec gate を一つに束ねていたため、soft stop 時点で
task 全体を完了扱いできない。実際に完了した範囲は既存 evidence と照合し、未完了 gate は新 cycle へ移す。

[Issue #43](https://github.com/shimi3435/ai-coding-template-ja/issues/43) の本文は
2026-08-09T12:43:36Z に更新され、RED / probe の適用境界と main の機械的補正責務が canonical contract と
一致した。旧 blocker は外部 source の更新によって解消した。

### 8. 新 convergence cycle は iteration 0から再開する

新 cycle の scope は Issue #43 と本 change のままで material expansion はない。iteration budget は新しく3回を
割り当て、0/3から開始する。full-scope inventory は canonical artifacts、恒久 policy docs、2 local skills、
`skills.lock.json` の2 digest、静的 contract test、直接依存 / 利用元、更新済み Issue #43 を含む。無関係な
repository 全体、外部 GSD runtime、一時 `.planning` は含めない。

新 cycle は full-scope initial review、必要な fix / focused validation / diff review、initial reviewer と別の
reviewer による final full review、最新入力の `task check`、独立 verifier の再確認を順に行う。旧 cycle の full
review は代用しない。既存 verifier は executor / reviewers と別役割で、fix に関与せず context contamination が
ないことを再確認し、最新入力との evidence identity を検査する。今回の旧 verifier は agent tree に存在せず
条件を満たさなかったため、新しい独立 verifier を1名割り当てた。

## spec-holes Phase 1

### Requirement 1: bounded review topology

| # | 分類 | 判断 | 穴の内容 | 潰し方（1: 明記 / 2: スコープ外 / 3: ユーザ確認） |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | finding が0件の場合の final review、tracked diff が空で未追跡 file だけある場合の inventory が未定義になり得る | 1: clean でも fresh final full review を行い、未追跡 file も列挙・検査する scenarios を仕様化 |
| 2 | 境界値 | 該当 | iteration の 0 / 1 / 3 / 4 回目と計数単位が曖昧になり得る | 1: 完了した fix・focused validation・diff review を1回とし最大3回、4回目を開始しないと明記 |
| 3 | 重複・衝突 | 該当 | 同一 finding の重複報告や severity label 衝突が計数を増やし得る | 1: 未解決 blocker 集合単位と意味分類を仕様化 |
| 4 | 順序 | 該当 | self / initial / fix / final / check / verifier の順序が入れ替わり得る | 1: topology の固定順序を requirement と scenarios に明記 |
| 5 | 型・形式不正 | 該当 | malformed finding report、binary file、truncated output の判定が不能になり得る | 1: path / size / type と未検証状態を記録し、required evidence 欠落を blocker と明記 |
| 6 | エラー経路 | 該当 | final review の新 finding、check failure、安全な全文読取不能の戻り先が未定義になり得る | 1: review finding は残 iteration へ戻し、読取不能は required 性で blocker / 理由付き未検証に分類すると明記 |
| 7 | 冪等性・再実行 | 該当 | clean initial review 後の final 省略や full review の無限再実行が起こり得る | 1: full review は initial / final の各1回、final clean でも必須と明記 |
| 8 | 時刻・タイムゾーン | 非該当 | topology は時刻や日付を入力にしない | 2: 時間 hard cap と時刻依存の制御をスコープ外に明記 |
| 9 | 文字列 | 該当 | severity の表記揺れや未追跡 path の空白 / Unicode で inventory が変わり得る | 1: label は意味分類し、Git の未追跡列挙結果を path として検査すると明記 |
| 10 | 数値 | 該当 | NaN / inf / 負数を含む外部 iteration counter を想定すると不正状態になる | 2: runtime counter / state machine はスコープ外。運用上の完了組だけを0〜3で計数すると明記 |
| 11 | 巨大入力・リソース枯渇 | 該当 | repository 全体または large / binary file の全文読取を無条件に要求すると資源枯渇し得る | 1: 限定 inventory、固定 size cap 不採用、path / size / type、読取不能時の未検証分類を明記 |
| 12 | 状態遷移の未定義パス | 該当 | final finding、check failure、non-blocker 残存後の遷移が曖昧になり得る | 1: diff loop、soft-stop、defer / dismiss の scenarios を追加 |

### Requirement 2: validation cadence and reusable green evidence

| # | 分類 | 判断 | 穴の内容 | 潰し方（1: 明記 / 2: スコープ外 / 3: ユーザ確認） |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | evidence の入力集合、required 性、実行 command、exit 0、環境情報が欠落する場合がある | 1: reuse identity 欠落は再実行、required evidence 欠落 / 不明は blocker と明記 |
| 2 | 境界値 | 該当 | retry 0 / 1 / 2回、check 0 / 1 / 複数回の境界が曖昧になり得る | 1: 全体 check 原則1回、infrastructure retry 1回だけを仕様化 |
| 3 | 重複・衝突 | 該当 | 同じ command 名でも入力、worktree、環境が異なり得る | 1: command と全 identity の組で判定し、別環境は証明時だけ例外と明記 |
| 4 | 順序 | 該当 | check を final review 前に行う、close 後検証を誤順序で行う可能性がある | 1: review 収束後 check と close 前後の固定順序を明記 |
| 5 | 型・形式不正 | 該当 | command、exit status、digest、source commit、required 性が malformed / 不明な場合がある | 1: identity 不明は再実行、required 性不明は blocker と明記 |
| 6 | エラー経路 | 該当 | source / infrastructure failure と optional / required evidence 欠落が同じ処理になり得る | 1: retry 遷移と、required は blocker / optional 制約だけ理由付き未検証を分離した scenarios を追加 |
| 7 | 冪等性・再実行 | 該当 | 証跡だけの変更や同一入力で全 check を重複実行し得る | 1: command 入力集合に応じた再利用と focused seam 非省略を明記 |
| 8 | 時刻・タイムゾーン | 該当 | locale / TZ / OS 差が command 結果へ影響し得る | 1: 影響する環境 identity が不明なら再実行すると明記 |
| 9 | 文字列 | 該当 | path の Unicode、空白、real path 差で同一性を誤認し得る | 1: repository real path / worktree identity を文字列自己申告でなく証明対象に含める |
| 10 | 数値 | 非該当 | evidence は浮動小数値を扱わず、NaN / inf / 精度問題がない | 2: timing / coverage 数値による evidence identity はスコープ外 |
| 11 | 巨大入力・リソース枯渇 | 該当 | 全入力 digest、全体 check 反復、研究環境制約下の実動作が高コストになり得る | 1: reuse 条件を明記し、研究環境制約だけ理由・影響付き未検証を許可 |
| 12 | 状態遷移の未定義パス | 該当 | check failure、入力変更、close 削除後、required 性不明の evidence 状態が曖昧になり得る | 1: invalidation、残 iteration、close 後 validate、required 性不明 blocker の scenarios を追加 |

### Requirement 3: proportional agent allocation

| # | 分類 | 判断 | 穴の内容 | 潰し方（1: 明記 / 2: スコープ外 / 3: ユーザ確認） |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | executor / reviewer の無応答、成果ゼロが iteration を消費するか不明 | 1: 未採用・成果ゼロは非計上、採用差分は検証後計上と明記 |
| 2 | 境界値 | 該当 | agent 失敗1回 / 2回と追加 agent 数の境界が曖昧になり得る | 1: 同じ役割2回連続失敗で soft-stop、追加理由記録を明記 |
| 3 | 重複・衝突 | 該当 | Standards / Spec reviewer と標準 reviewer が重複し得る | 1: vendored skill 明示選択時の例外配分と追加 reviewer 禁止を仕様化 |
| 4 | 順序 | 該当 | reviewer / fixer / final reviewer / verifier を並列化し得る | 1: review topology は規定順序で直列と明記 |
| 5 | 型・形式不正 | 該当 | agent role 不明、部分報告、context contamination が起こり得る | 1: role 分離、working state 安全確認、contamination 時追加条件を明記 |
| 6 | エラー経路 | 該当 | agent failure 後の部分差分の扱いが未定義になり得る | 1: 採用 / 不採用と iteration 計上の scenario を追加 |
| 7 | 冪等性・再実行 | 該当 | finding ごとに同じ役割の fresh agent を増やし得る | 1: executor / fixer 継続と finding 単位追加禁止を明記 |
| 8 | 時刻・タイムゾーン | 非該当 | agent 配分は日時を入力にしない | 2: 経過時間による hard cap をスコープ外に明記 |
| 9 | 文字列 | 非該当 | role 名の自由入力を処理する runtime は導入しない | 2: agent schema / parser の実装をスコープ外に明記 |
| 10 | 数値 | 該当 | agent 数を固定 quota と誤解し、必要な独立価値を失い得る | 1: 標準配分と distinct value / failure 例外を明記し、固定 token quota は不採用 |
| 11 | 巨大入力・リソース枯渇 | 該当 | task ごとの fresh agent が大量 context と agent を生成し得る | 1: 一体成果の継続 executor、独立単位だけの並列化を仕様化 |
| 12 | 状態遷移の未定義パス | 該当 | executor 終了、2回失敗、安全性不明後の遷移が曖昧になり得る | 1: fixer 追加または soft-stop の遷移を明記 |

### Requirement 4: soft stop and replanning

| # | 分類 | 判断 | 穴の内容 | 潰し方（1: 明記 / 2: スコープ外 / 3: ユーザ確認） |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | unresolved finding や evidence が空・欠落した停止報告を成功扱いし得る | 1: 必須 report fields と evidence 欠落を blocker と明記 |
| 2 | 境界値 | 該当 | 3回完了時、4回目開始、new cycle の counter reset が曖昧になり得る | 1: 3回後停止、4回目禁止、再計画後0から開始を scenarios に明記 |
| 3 | 重複・衝突 | 該当 | Issue と retrospective に同じ soft-stop 計測を重複記録し得る | 1: どちらか一方へ1行だけと明記 |
| 4 | 順序 | 該当 | 人間承認前に追加 iteration や material expansion を進め得る | 1: 即時停止、再計画、full review の順序を明記 |
| 5 | 型・形式不正 | 該当 | iteration / cycle / reason の不正形式で復帰不能になり得る | 1: 固定 report field と optional suffix 形式を明記 |
| 6 | エラー経路 | 該当 | 仕様判断、agent failure、CI failure の停止条件が漏れ得る | 1: 各停止条件を requirement と scenarios / requirement 2・3へ明記 |
| 7 | 冪等性・再実行 | 該当 | 「継続」を単なる追加3回として同じ cycle で再開し得る | 1: 新 cycle / inventory / full review を必須化 |
| 8 | 時刻・タイムゾーン | 非該当 | soft-stop は時刻に依存しない | 2: 時間 hard cap と日時ベース自動再開をスコープ外に明記 |
| 9 | 文字列 | 該当 | material expansion 名称や理由の表記揺れで停止漏れが起こり得る | 1: 対象カテゴリを列挙し、ラベルでなく意味で判定すると明記 |
| 10 | 数値 | 該当 | 負数、NaN、inf の外部 counter を想定すると不正遷移になる | 2: runtime counter はスコープ外。運用上の完了組を0〜3で扱うと明記 |
| 11 | 巨大入力・リソース枯渇 | 該当 | token / elapsed time hard cap を追加して blocker を打ち切り得る | 2: 一律 hard cap をスコープ外とし、意味ベース停止条件を仕様化 |
| 12 | 状態遷移の未定義パス | 該当 | 継続、再計画、別 change、中断後の扱いが曖昧になり得る | 1: 4選択肢提示と、継続時だけ新 cycle を開始すると明記 |

## Phase 2 verification mapping

policy 文書は純粋関数やデータ変換ではないため Hypothesis は使用せず、静的な例示 test と目視 review を
用いる。`R<n>#<n>` は上記 Phase 1 の requirement と分類番号を指し、次の表で R1〜R4 の各 #1〜#12 を
重複なく一度ずつ対応付ける。

| Phase 1 ID | Phase 1 判断 | 検証形態 | テスト / review / 未検証理由 |
| --- | --- | --- | --- |
| R1#1〜#4, R1#7 | 該当 | 例示 test＋initial / final full-scope 目視 review | 既存 topology test と task 15.2 の untracked inventory assertion が順序・数値・空 tracked diff を固定し、重複 finding 等は全スコープ review で照合する |
| R1#5〜#6, R1#9, R1#12 | 該当 | 例示 test＋initial / final full-scope 目視 review | 既存 semantic backstop test と task 15.2 の unreadable / truncation assertion が代表 anchor を固定し、malformed report と全遷移は全スコープ review で照合する |
| R1#11 | 該当 | 例示 test＋initial / final full-scope 目視 review | task 15.2 の large / binary inventory assertion が固定 size cap 不採用と path / size / type を固定し、実 scope の有限性は全スコープ review で照合する |
| R1#10 | 該当（runtime counter はスコープ外） | 目視 review | 0〜3の運用境界を上記 test で確認し、runtime counter を追加していないことを差分 review する |
| R1#8 | 非該当 | 理由付き未検証 | topology は時刻入力を持たず、時間 hard cap も導入しない |
| R2#1, R2#3〜#5, R2#7〜#9, R2#11 | 該当 | 例示 test＋initial / final full-scope 目視 review | 既存 evidence test と task 15.2 の standalone command / exit 0・required evidence assertion が minimum identity を固定し、環境差と入力全体は全スコープ review で照合する |
| R2#2, R2#6 | 該当 | 例示 test＋initial / final full-scope 目視 review | 既存 failure test と task 15.2 の required / optional classification assertion が retry / failure 遷移を固定し、実際の分類は全スコープ review で照合する |
| R2#12 | 該当 | 例示 test＋initial / final full-scope 目視 review | 既存 close transition test と task 15.2 の required 性不明 blocker assertion が状態遷移を固定し、command ごとの invalidation は全スコープ review で照合する |
| R2#10 | 非該当 | 理由付き未検証 | evidence identity は浮動小数値、timing、coverage 数値を入力にしない |
| R3#2, R3#4〜#5, R3#11 | 該当 | 例示 test＋initial / final full-scope 目視 review | `tests/test_review_convergence_contract.py::test_agent_allocation_and_soft_stop_are_reachable_from_agents_policy` と `tests/test_review_convergence_contract.py::test_adr_terms_and_skills_preserve_the_policy_boundaries` が標準配分を固定する。runtime agent 配分は実装せず、役割遷移を全スコープ review で照合する |
| R3#1, R3#3, R3#6〜#7, R3#10, R3#12 | 該当 | 例示 test＋initial / final full-scope 目視 review | `tests/test_review_convergence_contract.py::test_allocation_covers_partial_results_exceptions_and_main_corrections` が部分成果 / 例外 / main 責務の代表 anchor を固定し、全 failure state は全スコープ review で照合する |
| R3#8〜#9 | 非該当 | 理由付き未検証 | agent 配分は日時や自由入力 role parser を持たない |
| R4#2, R4#4, R4#6〜#7, R4#9, R4#11 | 該当 | 例示 test＋initial / final full-scope 目視 review | `tests/test_review_convergence_contract.py::test_agent_allocation_and_soft_stop_are_reachable_from_agents_policy` と `tests/test_review_convergence_contract.py::test_adr_terms_and_skills_preserve_the_policy_boundaries` が代表停止境界を固定し、全停止原因は全スコープ review で照合する |
| R4#1, R4#5, R4#12 | 該当 | 例示 test＋initial / final full-scope 目視 review | `tests/test_review_convergence_contract.py::test_soft_stop_reports_recovery_fields_without_obsolete_delegation_policy` が report fields を固定し、field 内容は全スコープ review で照合する |
| R4#3 | 該当 | 例示 test＋initial / final full-scope 目視 review | `tests/test_review_convergence_contract.py::test_inventory_close_partial_results_and_measurement_have_explicit_edges` が Issue / retrospective の片方だけという anchor を固定し、実記録先は全スコープ review で照合する |
| R4#10 | 該当（runtime counter はスコープ外） | 目視 review | iteration 0 / 3の運用境界を文書差分で確認し、数値 parser / state machine を追加していないことを確認する |
| R4#8 | 非該当 | 理由付き未検証 | soft stop は時刻に依存せず、時間 hard cap や日時ベース再開を導入しない |

変更した first-party skill の integrity は taxonomy の追加穴ではなく恒久 policy interface の直接依存であり、
`tests/test_skills_lock.py::test_allowed_skill_md_exists_and_sha256_matches` で実体と digest の一致を検査する。
task 15.2 では同じ `tests/test_review_convergence_contract.py` に assertions を追加し、共通 fixture / abstraction を
新設せず、workflow / `self-review` / `verify-change` の minimum evidence fields 整合も固定する。

### Canonical requirement / scenario / acceptance coverage

| Canonical requirement | Scenarios と acceptance の恒久 seam | 検証 evidence |
| --- | --- | --- |
| bounded review topology | workflow の inventory、固定順序、blocker 意味分類、RED probe、full review 上限 | R1 の例示 test、initial / final full-scope 目視 review |
| validation cadence and reusable green evidence | workflow / `verify-change` の再利用、invalidation、source / infrastructure failure、pre-merge close | R2 の例示 test、initial / final full-scope 目視 review、focused test、最終 `task check`、独立 verifier |
| proportional agent allocation | ADR / AGENTS / workflow の executor 継続、独立 verifier、独立単位、部分成果、vendored `code-review` 例外 | R3 の例示 test、skill integrity test、initial / final full-scope 目視 review |
| soft stop and replanning | ADR / AGENTS / workflow の exhaustion、新 cycle、仕様判断、material expansion、non-blocker defer | R4 の例示 test、initial / final full-scope 目視 review、最終 acceptance 照合、独立 verifier |

外部 GSD runtime の実動作は明示的スコープ外であり未検証とする。OpenSpec artifacts、外部 GSD 文面、
`.planning`、全文 snapshot は静的 test の入力にしない。

## Risks / Trade-offs

- policy contract は runtime 強制ではないため、静的 test は文言退行を防げても実 host の遵守を保証しない。
- final full reviewer を常に別 agent とするコストは残るが、initial reviewer と異なる独立検証価値を持つため標準配分に含める。
- fail-closed evidence identity は不明時に check 再実行を増やすが、異なる入力を green と誤認する危険を優先して避ける。
