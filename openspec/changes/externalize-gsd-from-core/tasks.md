## Execution Constraints

- **Route:** OpenSpec直接経路。本changeは実行予算契約そのものを5項目から3項目へ変更するbootstrap changeであるため、完了までは現行5項目契約に従う。変更後の通常changeは最初のCI parity、停止・再計画条件、一時artifact cleanupだけを記録する。
- **恒久成果:** OpenSpec直接実行規約、再設計した`execute-openspec-change` skill、tool-neutralなisolated check、GSD固有integrationを除いたcode / tests / docs、Superseded ADR、v2移行記録。
- **最初の CI parity:** `execute-openspec-change` の直接実行 contract と GSD handoff package / task の削除を最初の vertical slice とし、対象 skill contract tests、handoff 残存検査、`task check:isolated`、最新入力の `task check` を後続文書整理前に実行する。
- **一時実行証跡 / cleanup:** test用一時repository、cache、実行log、生成manifest / briefを追跡しない。実装後にGSD固有package、fixtures、task、文書、参照の残存検査を行う。
- **停止・再計画:** 仕様判断、公開interface、security / trust boundary、外部write、永続データ、dependency / lockfile、build / CIの新規変更、削除対象外の独立成果、OpenSpec CLI必須化、外部orchestrator固有supportが必要になった時点で停止する。同一役割・taskのagentが利用可能な成果を返さず連続2回失敗した場合、または環境・command・入力を固定した1回の再試行でも同じinfrastructure failureが再現した場合も停止する。影響とOpenSpec更新案を提示し、利用者承認後に`spec-holes`、validation、tasks再構成を行う。initial review blockerの修正は最大3回とし、未解決なら停止する。

## Tasks

- [ ] 1. Superseding ADR とコア規約を OpenSpec 直接経路へ更新する
  - **成果:** GSD を品質条件と経路選択から外し、OpenSpec scope、change 分割、tasks 正本、外部 orchestrator の提案・選択境界を現行規約に反映する。
  - **依存:** なし。
  - **対象:** `AGENTS.md`、`CONTEXT.md`、`openspec/project.md`、`docs/agents/workflow.md`、`docs/template/adr/0010-openspec-direct-execution.md`、既存 ADR の status / link。
  - [ ] 1.1 実装: 現行規約を更新し、ADR-0003 / ADR-0008 をADR-0010から Superseded として参照する。
  - [ ] 1.2 検証: OpenSpec直接経路、列挙型scope、最小task契約、明示opt-in、再計画条件が単一の規範として矛盾なく記載されていることを静的contract testで確認する。

- [ ] 2. `execute-openspec-change` を直接 executor へ再設計する
  - **成果:** 明示呼出後、4条件の preflight、詳細tasksの順次実装、検証、checkbox更新、リスク比例reviewを実行する skill。
  - **依存:** Task 1。
  - **対象:** `.agents/skills/execute-openspec-change/SKILL.md`、`.agents/skills/skills.lock.json`、skill contract tests。
  - [ ] 2.1 実装: active change一つ、必須artifacts有効、spec-holes未解決なし、詳細tasksありを fail-closed で確認する。
  - [ ] 2.2 実装: 呼出を実装・必要reviewer / verifier起動の承認とし、重複dirty差分だけ停止し、commit / push / PRを自動実行しない契約を追加する。
  - [ ] 2.3 検証: 未成立preflight、依存順、検証未完了、dirty重複、無関係dirty、再実行、禁止Git操作をfixture / static contract testsで確認する。

- [ ] 3. GSD handoff 実装と公開入口を互換 shim なしで削除する
  - **成果:** GSD package、CLI、smoke task、scripts、fixtures、専用testsがコアからなくなる。
  - **依存:** Task 2。
  - **対象:** `src/ai_coding_template_ja/openspec_gsd_handoff/`、`scripts/openspec-gsd-handoff-smoke.py`、`tests/fixtures/openspec_gsd_handoff/`、`tests/test_handoff_*.py`、旧skill tests、`pyproject.toml`、`Taskfile.yml`、rename / repository contracts。
  - [ ] 3.1 実装: package、entry point、task、script、fixtures、専用testsを同じ変更で削除し、互換aliasを追加しない。
  - [ ] 3.2 実装: rename、doctor、repository contracts、isolated environmentからGSD固有path、command、environment変数を除く。
  - [ ] 3.3 検証: 削除済みCLI / task / importが利用不能であり、case-insensitiveな`gsd` token境界scanが`-`、`_`、`/`を含むallowlist外のtracked path / textを拒否することを確認する。

- [ ] 4. 現行文書をtool-neutralなOpenSpec運用へ整理する
  - **成果:** 利用者向け文書からGSD導入・handoff・経路選択を除き、Markdown fallbackと直接skill実行を案内する。
  - **依存:** Task 1、Task 3。
  - **対象:** `README.md`、`docs/guide.md`、`docs/optional/gsd.md`、`docs/template/grill/ai-coding-template-ja.md`、`docs/template/retrospectives.md`、関連ADR / release notes。
  - [ ] 4.1 実装: `docs/optional/gsd.md` を削除し、旧grill / retrospectiveのGSD前提を削除または現方針へ更新する。
  - [ ] 4.2 実装: Superseded ADRとv2 release notesだけを最終残存allowlistにする。実装中は本change directoryだけを一時例外にし、現行docsに外部orchestrator固有名を残さない。
  - [ ] 4.3 検証: quickstart、workflow、OpenSpec fallback、release migrationのリンクと用語が矛盾しないことを文書contract testsとlink scanで確認する。

- [ ] 5. リスク比例reviewと検証証跡の契約を更新する
  - **成果:** 全変更のself-review / 適用可能なfocused validationと、OSWF-5の列挙条件で発火する独立review / verifierがGSD phaseなしで完結する。
  - **依存:** Task 1、Task 2。
  - **対象:** `AGENTS.md`、`CONTEXT.md`、`docs/agents/workflow.md`、`tests/test_review_convergence_contract.py`、self-review / verify-change contracts。
  - [ ] 5.1 実装: review発火条件の全列挙をOSWF-5だけに置き、現行規約とtestsはrequirement IDを参照する。
  - [ ] 5.2 実装: self-review、独立review、最大3修正cycle、`task check`、別verifierの順序、verifier blocker時のsoft-stop / 新cycle承認、結果要約だけを`tasks.md`へ残す契約を定める。
  - [ ] 5.3 検証: risk非該当 / 該当、focused validationのN/A / 環境未実行、3回上限、agent連続2回失敗、同一入力のinfrastructure failure 2回再現、verifier blocker、外部tool state不使用をcontract testsで確認する。

- [ ] 6. tool-neutral isolation と最終品質gateを通す
  - **成果:** 外部orchestrator、OpenSpec CLI、networkがない隔離環境でcore checksが通り、OpenSpec engine使用時のvalidationもgreenになる。
  - **依存:** Task 1〜5。
  - **対象:** `Taskfile.yml`、`repo-tools/repository-contracts.ts`、関連tests、OpenSpec artifacts。
  - [ ] 6.1 実装: `check:isolated` からGSD固有HOME / command検査を除き、外部tool非依存のcontractへ変更する。
  - [ ] 6.2 検証: focused tests、現在のchange directoryだけを一時例外にした残存参照scan、`task check:isolated`、`task openspec:validate`、`task check`を最新入力で実行し、commandと結果を本tasksへ要約する。
  - [ ] 6.3 検証: 全requirements / scenarios / spec-holesと実装・testsを再対応付けし、未完了の検証checkboxがないことを確認する。

## Post-merge Follow-up

本 change の merge 後、`add-deterministic-skill-updater` を最新 `main` から再構成する。GSD planning artifacts と source-pinned handoffは移植せず、有用な実装順序だけを同 change の詳細 `tasks.md` へ移し、`spec-holes` と OpenSpec validation を再実行する。同changeの最初のmigration taskには、`.planning/`を移植しない実装checkboxと、再構成後のtracked treeに`.planning/`が存在しないことを確認する検証checkboxを置く。

pre-merge closeでは本change directoryを削除し、最終残存allowlistがSuperseded ADRとv2 release notesだけになることを確認する。
