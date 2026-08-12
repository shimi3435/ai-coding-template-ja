# Change: 上流スキルを決定論的に検査・更新する

## Why

現在の `skills:upstream` は、既存 lock と上流既定 branch の比較結果を報告するだけである。取得元 ref、subtree 全体、license、同一 repository 内の複数 skill を一つの更新単位として固定できず、安全な preview と transactional apply も提供しない。

人が review する source declaration と機械生成 lock を分離し、public GitHub subtree を一つの resolved commit から検査・更新する。取得した code は実行せず、path、file type、size、metadata、license、local dirty state を fail-closed で検証する。

## Current Baseline

- 本 change は `origin/main` の `ed656b5` から作成した専用 branch だけで進める。
- `main` の active OpenSpec change は 0 件であり、本 PR の active change は `add-deterministic-skill-updater` だけとする。
- 旧 branch の `.planning/`、GSD planning artifacts、handoff、source commit pin は移行しない。
- 旧成果から引き継ぐのは、決定論的 updater の仕様意図、解決済み境界条件、local foundation → GitHub observation → read-only planning → transactional apply → migration/cutover の実装依存順だけである。

## What Changes

- `.agents/skills/skills.sources.json` を human-owned source declaration、`.agents/skills/skills.lock.json` を generated resolved state として定義する。
- public GitHub repository の explicit branch、exact commit、または opt-in SemVer tag range から subtree を取得する。
- normalized repository / ref が同じ entries を一つの cohort とし、一つの resolved commit から観測する。
- canonical path、content bytes、executable bit を versioned frame へ直列化し、SHA-256 tree hash を計算する。
- `license` / `redistribution` と review 済み legal mapping を source declaration の正本として静的検証し、generated lock へ exact copyする。取得した script や hook は実行しない。
- remote update は dry-run を既定とし、明示 apply だけを回復可能な cohort transaction として実行する。
- symlink 再生成を `skills:links`、local integrity を `skills:verify`、remote check を `skills:check`、remote preview/apply を `skills:update`、first-party hash 更新を `skills:lock-local` に分離する。
- 現行 H1〜H11 と補助 fixtures、全 lock entry の migration parity、新 metadata の整合が green になった後だけ旧 Python checker と旧 command を削除する。
- offline の `skills:verify` と integrity tests を `task check` に含め、network を使う `skills:check` は通常 check から除外する。

## Capabilities

### New Capabilities

- `deterministic-skill-updater`: source-pinned GitHub subtree の検査、差分、transactional 更新、local integrity、lock 管理を提供する。

### Modified Capabilities

- なし。

## Impact

- **Public command surface:** Taskfile と Node 管理 CLI の skill command を再編する。
- **Persistent metadata:** sources / lock schema と canonical serialization を導入する。
- **Security / trust boundary:** `gh api` の public read、取得物の静的検証、credential 非露出、managed path だけの local write を定義する。
- **Dependencies:** `semver@7.8.5`、`yaml@2.9.0`、`@types/semver@7.8.0` を exact pin で追加する。
- **Build / CI:** offline integrity validation を通常 check に追加する。remote check は opt-in のままとする。
- **Migration / deletion:** 既存 lock schema、Python checker、Taskfile command、関連 tests / docs を parity gate 後に切り替える。

## Out of Scope

- private GitHub repository、GitLab、archive URL、local path source。
- non-fast-forward / history rewrite の override。v1 は常に拒否し、必要なら別 change で扱う。
- upstream への local patch 自動再適用。
- plugin manager 所有 skill の更新。
- upstream code、package hook、取得 script の実行。
- upstream catalog discovery、自動導入、Issue / PR の自動作成。catalog discovery は core updater 完成後の別 change 候補とする。

## Spec Holes

12分類の監査結果と解決方法は [spec-holes.md](spec-holes.md) を正本とする。未解決判断はない。
