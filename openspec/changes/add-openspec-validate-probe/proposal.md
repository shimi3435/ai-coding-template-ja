# Change: doctor に OpenSpec validate probe を追加し、通知とゲートを分離する

## Why

v1.0 リリース準備（3 change 直列の 1 本目）。現状は change の spec / proposal が
invalid でも気づく仕組みがなく、また doctor の OpenSpec 未導入案内が
「導入する場合は openspec init を各自で実行」と書いており、workflow.md の
in-repo `openspec init` 非推奨（project.md → config.yaml 移行ハザード）と矛盾する
（下流がテンプレートの OpenSpec レイアウトを壊す導線・Codex adversarial-review [high]）。

通知とゲートは分離する（Codex [medium]）: doctor は助言のみ（WARN・exit 0 維持・
ADR-0002 整合で CI ゲートなし）、FAIL するゲートは opt-in の `task openspec:validate`
が担う。

## What Changes

1. `scripts/doctor.py` の `check_openspec` に validate probe を追加:
   openspec CLI 在席 かつ `openspec/changes/` に change ディレクトリが 1 つ以上ある
   ときだけ `openspec validate --changes --no-interactive` を実行し、invalid は WARN
   （非ゲート・exit 0 維持）。CLI 不在時は既存 WARN がカバーするため probe は静かに skip。
2. `check_openspec` の未導入案内から「導入する場合は openspec init を各自で実行」を
   削除し、Markdown fallback 運用可＋ docs/agents/workflow.md 参照のみにする。
   doctor 出力に `openspec init` が含まれないことの回帰テストを追加する。
3. `Taskfile.yml` に `task openspec:validate` を新設: invalid で FAIL する opt-in
   ゲート。engine 必須（不在なら導入案内を出して非ゼロ終了）。CI には入れない
   （ADR-0002: Node 非コア依存）。
4. `docs/agents/workflow.md` の validate 導線に PR 前チェックとして
   `task openspec:validate` を 1 行追記する。

## Impact

- Affected specs: `openspec-validation`（新規 capability delta）
- Affected code: `scripts/doctor.py` / `tests/test_smoke.py` / `Taskfile.yml` /
  `docs/agents/workflow.md`
- 互換性: doctor の既定 green（exit 0）は維持。CI 変更なし。新 task は opt-in。
