# Change: v1.0 リリース準備（宣言と実態の乖離解消＋リリース手順文書化＋VERSION bump）

## Why

v1.0 リリース準備（3 change 直列の 3 本目・最終）。「v1.0」を宣言だけでなく操作的に
定義する（TEMPLATE_VERSION 1.0.0 ＋ annotated tag ＋ GitHub Release ＋ リリース手順文書）。
その前提として、宣言と実態の乖離（requires-python `>=3.12` なのに CI は 3.12 単独・
ADR-0005 が言及する `docs/optional/template-update.md` の不在・docs/optional/codex-review.md
と実機 plugin 仕様の乖離）と、意図が記録されていない構成判断 2 件（pin 非対称・coverage
fail-under なし）を 1.0 前に解消する（backlog #2 / #3 / #4 / #5 / #9 消化）。

## What Changes

1. **(a) CI 3.13 matrix**: `.github/workflows/ci.yml` の `check` job と
   `.github/workflows/extras-smoke.yml` の `extras-smoke` job に
   `python-version: ["3.12", "3.13"]` の matrix を追加する。
   - `check` を matrix 化する理由: requires-python `>=3.12` の宣言に対しコアの検証線が
     3.12 単独だった乖離の解消（本 change の主目的）。
   - `extras-smoke` を matrix に含める理由: 「>=3.12 で導入手順が壊れていない」という
     検証線の主張は extras にも及び、workflow_dispatch 専用のため push / PR の CI コスト
     増はゼロ。
   - `rename-smoke` は 3.12 単独のまま: rename は文字列置換で Python minor に依存せず、
     置換後コードの版依存差分は `check` matrix が別途カバーする。
   - `audit` は 3.12 単独のまま: pip-audit の監査対象は `uv export --locked` の lock 由来
     依存セット、bandit は静的解析で、いずれも実行系 minor の影響が実質なく、二重監査の
     コスト増を避ける。
   - uv.lock が 3.13 で解決不能・テスト赤の場合に CI が落ちるのは検出=正常動作（それが
     このゲートの意図）。ローカルでの 3.13 実行確認は行わず CI に委ねる（後述の検証方針）。
2. **(b) pin 非対称の意図記録**: `.pre-commit-config.yaml` の `pre-commit-hooks` repo が
   tag pin（v5.0.0）で dependabot 監視外である非対称を、**意図的**として同ファイルの
   当該 repo 直上コメントに記録する（修正しない）。根拠: pre-commit hooks は CI で実行
   されず（CI は ruff 等を直接実行）secrets 曝露面が無い・dependabot に pre-commit
   ecosystem サポートが無く SHA pin にすると更新追跡手段を失う・tag pin は pre-commit
   慣行（`pre-commit autoupdate` が機能する）。
3. **(c) coverage fail-under なしの意図記録**: pyproject.toml の coverage 設定
   （`[tool.coverage.run]` 付近）に、fail-under 閾値を置かないことを**意図的**として
   コメント記録する（修正しない）。根拠: 研究テンプレで閾値ゲートは探索的コードの
   コミットを阻害する・coverage は `term-missing` の可視化（情報提供）に徹する・閾値が
   要る下流は自分で `fail_under` を足せる。
4. **(d) docs/optional/codex-review.md の現仕様点検**: 実機 plugin v1.0.5 の commands
   定義と突き合わせた点検の結果、`/codex:review` が focus（追加のレビュー観点テキスト）
   非対応であり、focus / 観点付きレビューは `/codex:adversarial-review` を使うという実態の
   記述が欠落 → 使い方節に追記する。plugin の将来更新への継続追随はスコープ外
   （version スタンプ付き記述の既存流儀を踏襲）。
5. **docs/optional/template-update.md 新規作成**: 下流向けの手動 cherry-pick 手順 1 枚。
   ADR-0005 が既に言及しているパスの実在化（乖離解消）。prune 後も下流に残る配置。
   含める: 非目的の明示（remote merge 追随は ADR-0005 で却下済み）・取り込み対象の特定
   導線（テンプレの Releases / PR 履歴）・cherry-pick 手順・rename 済み下流はコンフリクト
   前提の注意・prune 済み下流で不要な hunk はスキップ可・下流の TEMPLATE_VERSION は
   更新しない（作成時点の由来スタンプであり部分取り込みで意味が壊れるため据え置き）。
6. **docs/template/release.md 新規作成**: 保守側リリース手順 1 枚（prune で消える配置）。
   含める: semver 規律の定義（major=下流の bootstrap / rename / 構成互換を壊す・
   minor=機能 / skill / docs 追加・patch=修正。境界判断は「下流の互換を壊すか」で判定）・
   TEMPLATE_VERSION の bump 規律（リリース単位・リリース PR に含める。ADR-0005 の宿題）・
   リリース前提チェック（`task check` green・`task openspec:validate` green 必須・
   `openspec/changes/` が `.gitkeep` のみ）・pyproject version は 0.1.0 のまま非同期
   （下流所有物のため触らない・理由 1 行）・annotated tag（tag 名 = `v` +
   TEMPLATE_VERSION の一致確認を含む）→ GitHub Release の手順。
   tag の削除・打ち直しはスコープ外（通常の git 運用）。
7. **TEMPLATE_VERSION bump**: ルートの `TEMPLATE_VERSION` を `0.1.0` → `1.0.0` へ更新する。
   1.0.0 とする根拠は v1.0 宣言の操作的定義そのもの。pyproject.toml の `version` は
   触らない。既存テスト（tests/test_smoke.py）は単一行 semver 形式のみ検査するため
   壊れない（確認済み）。
8. **README「ドキュメント構成」の 2 行更新**: docs/template 行が「ADR 0001-0006」と
   既に古く（0007 実在）、release.md 追加でさらに乖離するため実態に合わせて更新する。
   docs/optional の列挙行にテンプレ更新手順（template-update）を追加する。

## Non-goals / スコープ外（spec-holes フェーズ 1 反映）

- **Python 3.14+ の matrix 追加**: grill 合意（Q4）は 3.13 まで。3.14 追加の是非は
  post-1.0 で判断する（backlog 記録）。
- **pin 非対称・coverage fail-under の「修正」**: 記録のみで消化（grill Q4）。
- **codex plugin の将来仕様変更への継続追随**: 今回の点検は v1.0.5 時点のスナップショット。
- **guide.md への template-update 配線**: guide §6 は「導入するオプション」3 グループの
  地図で、更新手順は不適合。README ドキュメント構成＋ADR-0005 参照で到達可能なため
  追加しない。
- **tag v1.0.0 / GitHub Release の作成**: 本 change のマージ後作業（外部 write のため
  人起点・事前確認。release.md の手順に従う）。
- **backlog #14（gate に tasks.md 形式 preflight 追加）**: スコープ外を維持。

## 検証方針

- `task check` / `task openspec:validate` green。
- doctor が `テンプレートバージョン v1.0.0` を INFO 表示することを実行で確認。
- CI yml は check-yaml（pre-commit）＋ PR の CI 実走で検証。**3.13 でのローカル実行は
  行わず CI に委ねる**（uv の python-version 切替で環境を汚さないため）。PR の CI で
  3.13 job が green になることをマージ条件とする。
- 追記・新規 docs のリンク先実在を実ファイルで確認（verify-change）。
