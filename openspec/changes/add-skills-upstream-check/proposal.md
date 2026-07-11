# skills.lock の上流陳腐化検知タスクを追加する

## Why

バックログ #17。vendored skill の lock（`.agents/skills/skills.lock.json`）は
`retrieved_at` が全 null で、`task skills:doctor`（tests/test_skills_lock.py）は
**ローカルの sha256 整合のみ**を検証する。上流リポジトリで skill 本体が更新されても
誰も気づけない（上流乖離の検知線がゼロ）。

- 「外部 skill は自動で latest 更新しない」（workflow.md）方針は維持する。必要なのは
  自動更新ではなく、**乖離の可視化**（更新するかは人の判断）。
- `task doctor -- --online` と同思想の opt-in ネットワークタスクとして追加し、
  既定経路（task check / CI / doctor 既定）の green を壊さない。

## What Changes

- **scripts/skills-upstream-check.py**（新規）: lock の `source_type == "github"` エントリ
  ごとに、lock の commit と上流既定ブランチ HEAD を GitHub compare API（`gh api` read のみ）で
  比較し、`[OK]/[INFO]/[WARN]` で報告する。
- **Taskfile.yml**: `skills:upstream` タスクを追加（上記スクリプトを実行）。
- **tests/test_skills_upstream_check.py**（新規）: 判定ロジック（URL パース・パス成分一致・
  compare 結果の分類）の単体テスト。ネットワークは使わない（API 応答はフィクスチャ）。
- **docs/agents/workflow.md**: Skills 節の「外部 skill は自動で latest 更新しない」の並びに
  `task skills:upstream` の 1 行導線を追記。

spec delta は `changes/add-skills-upstream-check/specs/skills-upstream-check/spec.md` に置く。

## 設計判断

1. **報告のみ・ゲートにしない**。乖離 WARN で非ゼロ終了しない（更新判断は人起点。
   ゲート化すると上流の無関係な活動で CI 相当の運用が赤くなる）。非ゼロ終了は
   前提不成立（gh 不在・未認証・lock 不在 / 破損）のみ。
2. **skill 単位の変更判定は compare API の変更ファイル一覧で行う**。上流 HEAD が進んだ
   だけでは WARN にしない（monorepo（mattpocock/skills）では HEAD は常に進むためノイズ）。
   変更ファイルのパスに skill 名が**ディレクトリ成分として完全一致**で含まれるときのみ
   「skill 本体の変更」= WARN とし、それ以外は INFO に留める。実測で妥当性確認済み:
   上流は `skills/grilling` → `skills/productivity/grilling` の再配置があり、パス prefix
   固定では追えないが、ディレクトリ成分一致なら再配置後も検知できる
   （`docs/productivity/grilling.md` のようなファイル名一致は誤検知しない）。
3. **`gh` CLI 必須**（`gh api`）。認証・レート制限の扱いを gh に委譲し、token を
   スクリプトで扱わない（safety: secret を出力・保存しない）。gh はコアで既に
   「GitHub read の標準」（AGENTS.md Tools）。
4. **compare は `{lock commit}...HEAD`**。`HEAD` は上流既定ブランチに解決される
   （実機確認済み）。`status` が `identical` → OK / `ahead` → ファイル判定 /
   それ以外（`behind` / `diverged`）→ 履歴書き換えの可能性として WARN。
5. **files 一覧は最大 300 件で切り詰められる**（GitHub API 仕様）。skill 変更を検出済み
   なら WARN（変更あり）を優先し、未検出かつ 300 件到達なら「判定不能」WARN に倒す
   （見逃しの黙殺をしない）。
6. **lock は変更しない（read-only）**。`retrieved_at` の更新・lock の再生成・skill の
   自動更新は行わない（Non-goals）。

## spec-holes フェーズ 1 の穴リスト

確定前にタクソノミー 12 分類 × 3 要件を全数当てた。該当 11 件を「1: 仕様に明記」9 件・
「2: スコープ外と明記」2 件で潰した（ユーザ確認を要するトレードオフなし）。
非該当: 時刻（retrieved_at は不使用・Non-goals に明記）・数値。
self-review 時はこのリストとフェーズ 2 対応表を突き合わせる。

| 穴 | 分類 | 潰し方 | 潰した場所 |
| --- | --- | --- | --- |
| H1 github エントリ 0 件 / skills 空 | R1×空 | 1: 対象ゼロと報告し exit 0 | R1 Scenario |
| H2 必須フィールド欠落・URL が github 形式でない | R1×型 | 1: 該当エントリ WARN（不正エントリ）・続行 | R1 本文 |
| H3 API エラー（404 / レート制限 / オフライン） | R1×エラー経路 | 1: 該当エントリ WARN・続行・exit 0 維持 | R1/R2 本文 |
| H4 lock commit が上流に無い（force push） | R1×状態遷移 | 1: identical / ahead 以外は WARN | R1 本文 |
| H5 同一上流 repo の複数エントリ | R1×重複 | 1: エントリごとに独立比較（最適化しない） | R1 本文・Non-goals |
| H6 報告順 | R1×順序 | 1: lock 記載順 | R1 本文 |
| H7 再実行・状態変更 | R2×冪等 | 1: read のみ・何も変更しない | R2 本文 |
| H8 gh 不在・未認証・lock 不在 / 破損 | R2×エラー経路 | 1: 案内＋exit 1（唯一の非ゼロ経路） | R2 本文＋Scenario |
| H9 files 300 件切り詰め | R3×巨大入力 | 1: 検出済み WARN 優先・未検出なら判定不能 WARN | R3 本文 |
| H10 skill 名の一致規則 | R3×文字列 | 1: ディレクトリ成分の完全一致・位置不問 | R3 本文 |
| H11 ahead だが変更ファイル空 | R3×空 | 1: skill 変更なし＝INFO | R3 Scenario |

## フェーズ 2 対応表（テスト化）

| 穴 | 検証形態 | テスト | 備考 |
| --- | --- | --- | --- |
| H1 | 例示テスト | test_no_github_entries | 純ロジック |
| H2 | 例示テスト | test_invalid_entry_warns / test_parse_github_repo_* | |
| H3 | 例示テスト | test_api_error_warns | runner をフェイクに差し替え |
| H4 | 例示テスト | test_diverged_status_warns | |
| H5 | 例示テスト | test_entries_compared_independently | |
| H6 | 例示テスト | （H5 と同テストで記載順を検証） | |
| H7 | 未検証（実機） | — | read-only は実装レビュー＋実機実行で確認（書込 API を呼ばない） |
| H8 | 例示テスト | test_missing_gh_exits_nonzero 等 | which / lock パスをフェイク |
| H9 | 例示テスト | test_truncated_files_inconclusive | |
| H10 | 例示テスト | test_skill_path_match_* | 成分一致 / ファイル名不一致 |
| H11 | 例示テスト | test_ahead_without_skill_change_is_info | |
| 実 API 応答形式 | 未検証（単体では） | — | 実機 `task skills:upstream` の実行で確認（verify-change） |

## 受け入れ基準

- [ ] `task skills:upstream` が実環境で動き、現 lock（github 7 エントリ・local 3 エントリ）に
      対して分類報告を出す（local はスキップ表示）。
- [ ] 乖離 WARN があっても exit 0（報告のみ）。gh 不在 / lock 破損では非ゼロ＋案内。
- [ ] 既定経路（task check / CI / doctor 既定）に変更がない。
- [ ] 単体テストがネットワーク無しで green。
- [ ] `task check` / `task openspec:validate` green。
- [ ] close 時に本 change のふりかえり行を記録する（workflow.md の軽量ふりかえり規約）。

## Non-goals

- **skill の自動更新・lock の再生成**（乖離の可視化のみ。更新は人起点の別作業）。
- **`retrieved_at` の更新・活用**（フィールドは現状のまま触らない）。
- **doctor / CI / check への組み込み**（opt-in タスク単体。将来必要なら別 change）。
- **API 呼び出しの最適化**（同一 repo のエントリまとめ・キャッシュはしない。7 エントリで
  十分速い）。
- **plugin source_type の対応**（現 lock に存在しない。現れたら別途判断）。
