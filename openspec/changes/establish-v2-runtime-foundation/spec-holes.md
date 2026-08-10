# spec-holes 再実行記録

対象: `v2-runtime-foundation` spec delta。実装 branch へ移植後の source でフェーズ 1 を再実行し、実装時テストへ接続する。

## フェーズ 1: 12 分類の再列挙

### V2-RUNTIME-1 Node と Python の runtime 境界

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | command 不在または空の version 出力 | 1: runtime 検出不能 scenario を追加 |
| 2 | 境界値 | 該当・定義済み | Node 23/24/25、Python 3.13/3.14/3.15、patch 差 | 1: 既存 4 scenarios で明記 |
| 3 | 重複・衝突 | 非該当 | runtime version は単一検出値として評価 | — |
| 4 | 順序 | 非該当 | executable 探索順は標準 PATH 解決であり、version 判定の公開結果を変えない | — |
| 5 | 型・形式不正 | 該当 | version 出力が parse 不能 | 1: runtime 検出不能 scenario を追加 |
| 6 | エラー経路 | 該当 | version command が非ゼロ終了 | 1: runtime 検出不能 scenario を追加 |
| 7 | 冪等性・再実行 | 非該当 | preflight は read-only 判定 | — |
| 8 | 時刻・タイムゾーン | 非該当 | 時刻を扱わない | — |
| 9 | 文字列 | 該当・定義済み | `v24.x.y` 等の version 表記 | 1: parse 不能を明記し、完全 version を診断出力へ要求 |
| 10 | 数値 | 該当・定義済み | major/minor/patch の比較 | 1: 最低値、上位 line、patch 非固定を既存 scenarios で明記 |
| 11 | 巨大入力・リソース枯渇 | 非該当 | OS 提供の短い version 出力だけを扱う | — |
| 12 | 状態遷移の未定義パス | 該当・定義済み | unsupported runtime から install 後 preflight への遷移 | 1: V2-RUNTIME-5 が導入成功・失敗状態を定義 |

### V2-RUNTIME-2 npm dependency の決定論的導入

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当・定義済み | dependency 集合が空なら exact 制約は空集合に対して成立 | 1: private package / lockfile 契約は依存件数に依存しない |
| 2 | 境界値 | 該当・定義済み | lockfileVersion 2/3/4 | 1: version 3 以外を repository check failure と明記 |
| 3 | 重複・衝突 | 該当 | JSON 重複 key や package/lock 不整合 | 1: 不正 metadata と `npm ci` 不整合 failure で明記 |
| 4 | 順序 | 非該当 | JSON property 順序は契約外 | — |
| 5 | 型・形式不正 | 該当 | JSON parse failure、dependency value が string 以外 | 1: 不正 metadata scenario と exact version check で明記 |
| 6 | エラー経路 | 該当・定義済み | `npm ci` 不整合、audit high/critical | 1: 既存 scenarios で非ゼロ終了を明記 |
| 7 | 冪等性・再実行 | 非該当 | repository check は read-only、`npm ci` は lock graph を再現 | — |
| 8 | 時刻・タイムゾーン | 非該当 | 時刻を扱わない | — |
| 9 | 文字列 | 非該当 | package 名と version grammar は npm の正本契約 | — |
| 10 | 数値 | 非該当 | lockfileVersion 以外の数値入力なし | — |
| 11 | 巨大入力・リソース枯渇 | 非該当 | npm が lock graph の resource limit を所有 | — |
| 12 | 状態遷移の未定義パス | 該当 | package / lock の片方欠落 | 1: 不正 metadata scenario を追加 |

### V2-RUNTIME-3 TypeScript 管理 CLI

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | command 省略 | 1: 未知 command scenario に省略時の usage failure を追加 |
| 2 | 境界値 | 非該当 | CLI が序数境界を公開しない | — |
| 3 | 重複・衝突 | 非該当 | 単一 command dispatch | — |
| 4 | 順序 | 非該当 | command と引数の順序が CLI grammar | — |
| 5 | 型・形式不正 | 該当 | 未知 command | 1: usage と非ゼロ終了を追加 |
| 6 | エラー経路 | 該当・定義済み | direct execution、Node test、typecheck failure | 1: 既存 scenarios で非ゼロ終了を明記 |
| 7 | 冪等性・再実行 | 非該当 | 本 change の CLI commands は read-only checks | — |
| 8 | 時刻・タイムゾーン | 非該当 | 時刻を扱わない | — |
| 9 | 文字列 | 非該当 | 公開 command 名は固定 ASCII identifier | — |
| 10 | 数値 | 非該当 | runtime 数値判定は V2-RUNTIME-1 が所有 | — |
| 11 | 巨大入力・リソース枯渇 | 非該当 | 任意 payload を受け取らない | — |
| 12 | 状態遷移の未定義パス | 該当・定義済み | unsupported syntax / type error / unknown command | 1: 各 failure scenario で明記 |

### V2-RUNTIME-4 Task 公開インターフェース

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 非該当 | task 名省略時の一覧表示は go-task 所有 | — |
| 2 | 境界値 | 非該当 | 数値境界なし | — |
| 3 | 重複・衝突 | 非該当 | Taskfile schema が重複 task を拒否 | — |
| 4 | 順序 | 該当・定義済み | check 内 command の順次実行 | 1: 必須 checks と failure 識別を V2-RUNTIME-6 で明記 |
| 5 | 型・形式不正 | 非該当 | Taskfile YAML schema は go-task 所有 | — |
| 6 | エラー経路 | 該当・定義済み | 内部 Node/Python check failure | 1: V2-RUNTIME-6 の failure scenario で明記 |
| 7 | 冪等性・再実行 | 非該当 | checks は read-only | — |
| 8 | 時刻・タイムゾーン | 非該当 | 時刻を扱わない | — |
| 9 | 文字列 | 非該当 | 公開 task 名は固定 ASCII identifier | — |
| 10 | 数値 | 非該当 | 数値入力なし | — |
| 11 | 巨大入力・リソース枯渇 | 非該当 | 個別 tool の入力制約が所有 | — |
| 12 | 状態遷移の未定義パス | 該当 | 旧 `check:without-gsd` が alias として残る可能性 | 1: task 一覧にも実行可能 alias にも残さないと明記 |

### V2-RUNTIME-5 Node opt-in 導入

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 該当 | Node 不在、install root 不在・相対 path | 1: Node 不在と安全な target 決定不能 scenarios で明記 |
| 2 | 境界値 | 該当・定義済み | x64/arm64 とそれ以外、target 存在/不存在 | 1: architecture / no-overwrite scenarios で明記 |
| 3 | 重複・衝突 | 該当・定義済み | 同じ target への再導入 | 1: target 存在時は上書きせず failure |
| 4 | 順序 | 該当・定義済み | architecture 判定、取得、checksum、展開、有効化 | 1: 取得前拒否と checksum 後だけの新規 target 展開を明記 |
| 5 | 型・形式不正 | 該当 | checksum file が parse 不能、archive が不正 | 1: download / 展開 failure scenario を追加 |
| 6 | エラー経路 | 該当 | HTTP、checksum、展開の部分失敗 | 1: 最終 target を有効化しない scenario を追加 |
| 7 | 冪等性・再実行 | 該当・定義済み | 成功後の同一再実行 | 1: target 存在時 no-overwrite failure |
| 8 | 時刻・タイムゾーン | 非該当 | 時刻を扱わない | — |
| 9 | 文字列 | 該当 | 空白を含む user-local path | 1: shell test fixture で quoting を検証 |
| 10 | 数値 | 非該当 | checksum と version は文字列として検証 | — |
| 11 | 巨大入力・リソース枯渇 | 該当・定義済み | disk full 等の取得・展開 failure | 1: 部分失敗 scenario に包含 |
| 12 | 状態遷移の未定義パス | 該当 | staging だけ成功した状態 | 1: 最終 target 非有効化、一時取得物を runtime として残さないと明記 |

### V2-RUNTIME-6 offline 統合検査

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 非該当 | 必須 Node/Python checks は固定で空にならない | — |
| 2 | 境界値 | 該当・定義済み | failure 0 件 / 1 件以上 | 1: 全成功と一つ失敗の scenarios で明記 |
| 3 | 重複・衝突 | 非該当 | task 名は一意、後続 change は同じ合成点へ追加 | — |
| 4 | 順序 | 該当・定義済み | check の順序と fail-fast | 1: failure の識別可能な出力を要求。全 checks 完走は要求しない |
| 5 | 型・形式不正 | 非該当 | 各 tool の入力形式は個別 check が所有 | — |
| 6 | エラー経路 | 該当・定義済み | Node または Python failure | 1: 非ゼロ終了を既存 scenario で明記 |
| 7 | 冪等性・再実行 | 非該当 | offline checks は repository を変更しない | — |
| 8 | 時刻・タイムゾーン | 非該当 | 時刻を扱わない | — |
| 9 | 文字列 | 非該当 | tool 出力を pass-through し失敗 task 名を保持 | — |
| 10 | 数値 | 非該当 | test 数や coverage threshold を公開契約にしない | — |
| 11 | 巨大入力・リソース枯渇 | 非該当 | 個別 tool が resource failure を非ゼロ終了で返す | — |
| 12 | 状態遷移の未定義パス | 該当 | lock 済み dependency が未導入 | 1: network 取得せず導入入口を示す scenario を追加 |

### V2-RUNTIME-7 release version 所有権

| # | 分類 | 判断 | 穴の内容 | 潰し方 |
| --- | --- | --- | --- | --- |
| 1 | 空・ゼロ長・None | 非該当 | `TEMPLATE_VERSION` は tracked scalar | — |
| 2 | 境界値 | 該当・定義済み | `1.0.0` と `2.0.0` の境界 | 1: 本 change は 1.0.0 維持、後続が 2.0.0 所有 |
| 3 | 重複・衝突 | 非該当 | version owner を change 単位で一意化 | — |
| 4 | 順序 | 該当・定義済み | runtime foundation 後、全 4 changes 後に release change | 1: dependency handoff を明記 |
| 5 | 型・形式不正 | 非該当 | version file 形式変更はスコープ外 | — |
| 6 | エラー経路 | 非該当 | version 更新処理を本 change で実行しない | — |
| 7 | 冪等性・再実行 | 該当・定義済み | checks 再実行でも 1.0.0 維持 | 1: repository test で固定値を検査 |
| 8 | 時刻・タイムゾーン | 非該当 | 時刻を扱わない | — |
| 9 | 文字列 | 非該当 | exact `1.0.0` を検査 | — |
| 10 | 数値 | 非該当 | semver を数値演算しない | — |
| 11 | 巨大入力・リソース枯渇 | 非該当 | scalar file | — |
| 12 | 状態遷移の未定義パス | 該当・定義済み | 本 change から release-ready へ直接遷移 | 1: 禁止し `prepare-v2-release` に残す |

## フェーズ 2: テスト対応

| 穴 | 検証形態 | テスト（予定含む） | 備考 |
| --- | --- | --- | --- |
| H1 runtime command 不在・失敗・parse 不能 | 例示 test | Node runtime preflight test | 対象 runtime と理由を検査 |
| H2 Node/Python 境界と任意 patch | property test | Node runtime version property test | Node 24.x と Python >=3.14 の受理不変条件 |
| H3 package / lock 欠落・不正 JSON・lockfileVersion 不一致 | 例示 test | Node package contract test | file と契約を検査 |
| H4 dependency exact pin | property test | Node package version property test | dependencies / devDependencies 全要素へ同じ判定 |
| H5 `npm ci` lock 不整合 | 実 CLI test | clean install fixture | npm 自身の lock validation を利用 |
| H6 CLI command 省略・未知 command | 例示 test | repo-tools CLI test | usage、非ゼロ、暗黙 command なし |
| H7 Node 型除去非対応 syntax | 実行 test | Node direct execution smoke | `dist` fallback なし |
| H8 `tsc` 型エラー | 静的 test | `tsc --noEmit` | package script / Task 入口から実行 |
| H9 禁止 runner / fetch / dist | repository property test | Node repository contract test | tracked 公開経路全体を走査 |
| H10 旧 `check:without-gsd` alias | 例示 test | Taskfile contract test | 一覧と実行入口から除去 |
| H11 Node 不在、unsupported architecture、unsafe install root | 例示 test | bootstrap shell fixture test | download 前 failure を検査 |
| H12 checksum / download / extract / no-overwrite failure | 例示 test | bootstrap shell fixture test | system boundary を local fixture command で置換 |
| H13 空白入り user-local path | 例示 test | bootstrap shell fixture test | shell quoting を検査 |
| H14 offline dependency 不足 | 隔離 integration test | `task check:isolated` | network 無効化、導入入口出力、非ゼロ |
| H15 `TEMPLATE_VERSION` 所有権 | repository test | version handoff contract test | exact `1.0.0` と handoff note を検査 |

外部 Node 公式配布サーバーの停止、実ネットワーク切断、実 disk-full は通常 test では再現しない。local fixture で HTTP/checksum/archive boundary の failure を検証し、実サービス障害は未検証として最終 evidence に残す。
