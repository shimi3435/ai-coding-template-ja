# v2配布境界の監査と実装引き渡し（Issue #67）

## 読み方と監査固定点

本書はテンプレート保守者向けのリファレンスである。判断の理由は[ADR-0011](adr/0011-v2-distribution-boundaries.md)、
進捗・実行結果は作業中のOpenSpec `define-v2-distribution-boundaries` の `tasks.md` が所有する。
pre-merge close後の仕様と検証証跡は[PR #68](https://github.com/shimi3435/ai-coding-template-ja/pull/68)のclose前commitから参照する。
本ADRによる削除/migration契約の確定は[AGENTS.md](../../AGENTS.md)のOSWF-5対象である。
文書のみを理由に対象外とした当初の判定は撤回し、[既存workflow](../agents/workflow.md)の独立reviewと別verifierを適用する。
通常CIから本書や作業中のchange、close前のGit履歴へ依存させない。下流利用手順の正本を本書へ移さない。

監査対象はmain `00d3a9713a8eecbe3e0a1af594293f97121e0c5c`（2026-09-13再確認）。
入力は[Issue #67](https://github.com/shimi3435/ai-coding-template-ja/issues/67)、
[#51](https://github.com/shimi3435/ai-coding-template-ja/issues/51)、
[#65](https://github.com/shimi3435/ai-coding-template-ja/issues/65)、
[#66](https://github.com/shimi3435/ai-coding-template-ja/issues/66)の最新本文・コメントである。
#65/#66の古い「Change 1を#67より先行」というコメントは最新#67/#65本文により更新済みと扱う。

以下の分類は移行先の責務を示す。現在の実装がその境界を満たすという意味ではない。
「保持」は新規実装不要の意味だけでなく、後続修復が壊してはならない条件も含む。

- **M = downstream mandatory**: 研究開始と通常開発に必要な基盤・検証・安全契約。
- **O = downstream optional**: 明示的に使う機能。同梱中のoffline検証は必要だが、利用やhost導入は必須ではない。
- **T = template-maintainer only**: テンプレート自身のrelease・履歴・出荷契約。下流の通常checkは存在を要求しない。

## 後続決定への導線（2026-09-16）

以下の監査本文は固定点の記録として保持する。[Issue #71](https://github.com/shimi3435/ai-coding-template-ja/issues/71)と
[#75](https://github.com/shimi3435/ai-coding-template-ja/issues/75)により、Skill更新PR自動化はoptional移管ではなく本体撤去へ変更された。
現行の[手動更新・停止移行手順](../guide.md#7-skillの手動更新と旧自動化の撤去)を参照する。
本文中の旧automationの利用・prune案を現行の提供機能として扱わない。

2026-09-22追記: #71 / [Issue #52](https://github.com/shimi3435/ai-coding-template-ja/issues/52)により、
自前Node installerも維持・分離から撤去へ変更された。本文中のinstaller維持・専用fixture保持は
監査当時の記録であり、現行方針ではない。Node.js 24 / npmは引き続き必要とし、
未導入・不適合時は案内して停止する。[現行移行手順](../guide.md#node導入と旧installerからの移行)を参照する。

## ファイル・機能別の監査

pathはrepository root基準。`*` / `**` は明示的な集合表記であり、存在しない単独ファイル名ではない。
「検証」は移行を受け入れる際の方法であり、実行済みかどうかはtasks.mdで区別する。

| ファイル・機能 | 分類・利用者価値と根拠 | 依存先・共有コード | 通常setup / check / doctorとの関係 | 移行・検証・実装owner |
| --- | --- | --- | --- | --- |
| `pyproject.toml`, `uv.lock`, `.python-version`, `src/ai_coding_template_ja/`, `tests/test_smoke.py`の開発基盤部分 | M: Python >=3.14の再現可能な研究環境、lint/type/test | uv、dev group、ruff/basedpyright/pytest、rename | setupで導入、checkで実行、doctorで基盤診断 | 保持。fresh/rename後のsetup/check/doctorを#51で回帰検証 |
| 同じ`pyproject.toml`のresearch/notebook/experiment extras、`data/.gitkeep`, `results/.gitkeep`, `configs/README.md` | O: 数値処理・notebook・実験追跡は用途別 | 全体uv.lock、notebook task、extras-smoke | extrasは通常setupで導入しない。未使用は通常check/doctor失敗にしない | 既存opt-in維持。#51は共有lockを巻き込まない。最終導線#62 |
| `repo-tools/entrypoint.mjs`, `repo-tools/runtime.ts`, `.node-version`, `package.json`, `package-lock.json`, `tsconfig.json` | M: #76 offline整合・local構造 / legal検証を動かすNode.js 24 / npm基盤 | native TypeScript、node:test、typescript、semver、yaml、Python version probe | setup/checkでpreflight、setupでnpm ci、doctorでruntime診断 | Node/npm保持。#51でruntime/lock/runner安全契約を保持。版数形式の別課題#50は本監査で修正しない |
| `repo-tools/cli.ts`のruntime/check-contracts/#57分岐 | M: 人とagentの共通入口。手動更新の実行自体はO | runtime、repository-contracts、skill-updater/index | 通常checkから共有分岐を利用 | #51で#64分岐だけを分離可能にする。既存共有コマンド回帰検証 |
| `repo-tools/repository-contracts.ts`, `repo-tools/repository-contracts.test.ts` | M/O/T混在: runtime/lock安全性=M、同梱#64整合=O、release固定値/履歴=T | Taskfile、package/lock、workflow、CLI、README/guide/safety、release.md | 現在checkが全責務を無条件要求。doctorはこのvalidatorを呼ばない | #51が入力と責務を分離。集約entrypointを可能な限り維持。prune状態と破損状態の例示検証 |
| `repo-tools/skill-updater/`全体、`repo-tools/skill-updater-*.test.ts`, `repo-tools/skill-updater-{github-test-fixture,test-fixture,test-temp}.ts`, `repo-tools/fixtures/skill-updater/` | offline検証・リンク・local構造 / legal検証はM、upstream手動更新はO | canonical/schema/legal/repository、planner/isolation/apply、gh経由remote取得 | checkはverifyとoffline testsのみ。更新は明示操作。doctorはlinks/lockを助言診断 | #57として全体保持。#51の#64 pruneで削除しない。#65 Change 2は必要な最小拡張だけ |
| `repo-tools/skill-update-automation/`全体 | O: 明示更新をPRレビューへつなぎ、復旧を支援 | #57の型/実行結果、GitHub adapter、candidate/publish/finalize/recovery、model/workflow/smoke | setup/checkでhost導入しない。同梱testsはoffline。実host smokeは別の人起点操作 | #51が専用subtreeと外側参照を一体prune。利用する場合は既存権限・外部write・復旧契約を保持 |
| `repo-tools/entrypoint.test.ts`, `repo-tools/runtime-preflight.test.ts` | M: runtime拒否と公開実行入口の回帰防止 | entrypoint/runtime、Python/Node fixture | 通常checkとCIで実行 | #51で保持。#64を除去しても実行 |
| `scripts/bootstrap.sh`のpreflight/setup、`tests/test_bootstrap.py` | M: 変更前runtime検査と初期導入 | task setup、uv、Node/npm、設定/Skillリンク用script | onboarding入口。通常checkが実installerを起動する設計ではない | 保持。fixtureで変更前拒否を検証。#51は下流成立を確認 |
| 同じbootstrapの`--install-node`分岐 | O: Node未導入利用者への明示的支援 | download/checksum/archive検証、限定install先 | 明示指定時だけ導入。通常check/doctorでdownloadしない | 維持。分離リファクタ#52はv2.x。既存installer fixtureを保持 |
| `scripts/doctor.py` | M: read-onlyで通常環境を診断する | runtime/lock、Skillリンク、OpenSpec gateとの共有helper | defaultは接続なし。gh未導入等WARN、任意機能不在は失敗理由にしない | #51はprune後も診断可能にする。#65はcaveman診断から任意Genshijinへ、#66はarchive検証のhelper責務を整える |
| `scripts/rename-package.py`, `tests/test_rename_package.py` | M: コピー先固有のpackage名で開発開始できる | src/pyproject/uv.lock、固定されたlive文書の置換対象 | 明示renameのみ実変更、適用後uv sync。通常checkはfixture検証 | 保持。#51がrename→pruneの成立を検証 |
| `scripts/prune-template-docs.py`, `tests/test_smoke.py`のprune部分 | O: 不要な保守情報を明示除去する | 固定`docs/template/`、不可侵`docs/adr/`/TEMPLATE_VERSION | default dry-run。現在は削除自体成功しても通常check失敗 | #51が参照・tests・専用検証も整合させる。template pruneと#64 pruneを分ける |
| `.agents/skills/skills.sources.json`, `.agents/skills/skills.lock.json`, 各Skillの`LICENSE`, root `LICENSE` | M: 配布物の出所・固定版・再配布権限を検証できる | installed tree hash、legal mappings、remote/local ownership | `skills:verify`はoffline必須。local本文変更にlock更新不要。host不要 | #51は保護、#65のSkill選別/移行時にcatalogとlegalを整合。license不整合を負例検証 |
| `.agents/skills/{grilling,grill-with-docs,code-review,diagnosing-bugs,domain-modeling,tdd}/` | M: 仕様明確化・設計・検証をrepository単独で運用する共通Skills | sources/lock/legal、各hostリンク、policy | 同梱検証必須。各Skill呼出は作業に応じる。host自体を通常setupへ要求しない | #65 Change 1で保持。code-reviewの未同梱setup前提は既存入力/導線/最小補助を比較し、ownershipもauthoringで決定 |
| `.agents/skills/{spec-holes,self-review,verify-change,execute-openspec-change}/` | M: 仕様の穴、差分review、未検証の非完了扱い、直接実行を担う | workflow、root policy、local構造 / legal検証 | offline testsと構造 / legal検証。実agent acceptanceは別 | #65 Change 1で簡素化。executorのarchive-ready handoffは#66、最終実hostは#47 |
| `.agents/skills/grill-me/`, `.agents/skills/caveman/`, `docs/optional/caveman-hook.md` | O: 重複する対話補助/スタイル機能。v2では置換対象 | catalog/legal、各hostリンク、live文書、doctor、fixtures | 同梱中はoffline検証。hookは任意 | grill-meは#65 Change 1で除去。cavemanはChange 3まで保持し、Genshijin提供と一緒に撤去 |
| `.claude/skills/*`, `.codex/skills/*`, `scripts/setup-skills.sh`, `tests/test_setup_skills.py` | M: 同じSkill実体を両hostへ提示し、リンク不整合を検出 | `.agents/skills/`、#57 links/verify | bootstrap/明示skills:linksで整合。doctorは助言、verifyがhard gate | #51/#65で保持。削除Skillだけリンクを除去し、dangling link/衝突を検証 |
| `CONTEXT.md`, `AGENTS.md`, `CLAUDE.md`, `docs/agents/workflow.md`, `docs/agents/safety.md` | MのpolicyとO/Tの詳細が混在: 可搬な作業・安全契約が価値 | AGENTSは作業方針、CONTEXTは用語定義、CLAUDEはhost補足、workflow/Skills | 通常checkでlive contract検証。保守文書の不在を失敗にしない移行が必要 | #65 Change 1はowner整理と意味のあるreview参照名、#51は#64専用説明のprune、#66は通常archive/保守close分離 |
| `.mcp.json.template`, `.codex/config.toml.template`, `.env.example`, `scripts/setup-mcp.sh`, `docs/agents/mcp.md`, `tests/test_setup_mcp.py` | 接続可能性と説明はO、secret保護の共通契約はM | Context7、任意Serena/GitHub MCP、gitignore済み生成設定 | 明示設定生成。接続/認証なしで通常check。doctor onlineはopt-in | #65 Change 1で現行資料確認の適用範囲を明確化。#51でpruneと秘密保護を回帰検証。実設定の秘密は監査出力へ含めない |
| `openspec/project.md`, `openspec/specs/.gitkeep`, `openspec/changes/.gitkeep`, `scripts/openspec-validate-gate.py` | Mの構成/仕様整合、CLI補助はO、空出荷と削除close契約はT | doctorのdirectory/task helpers、任意OpenSpec CLI、workflow、executor | 通常checkはCLI不要。現gateはCLI必須かつactive changesだけ。doctorでCLI不在WARN | #66: workflowを下流archive正本、projectを構成参照にする。canonical/archive/CLI不在を検証 |
| `tests/test_execute_openspec_change_skill.py`, `tests/fixtures/execute_openspec_change/`, `tests/fixtures/review_convergence/` | M: 実行・所有差分保護・review境界を検証 | live Skills/policy、静的fixtures | offlineの通常tests。実agentの動作保証とは区別 | #65 Change 1/#66で意味のある契約を保持。実agentは#47 |
| `tests/test_runtime_foundation_contract.py`, `tests/test_review_convergence_contract.py`, `tests/test_openspec_direct_workflow_contract.py`, `tests/test_tool_neutral_documentation_contract.py` | Mのlive契約とTの履歴/release契約が混在 | ADR/release notes/retrospectives、runtime、workflow | 現在通常pytestがprune対象を直接読む | #51で責務分離。live安全性検査は保持、履歴専用は保守検証へ移す。歴史文書を書換えてgreenにしない |
| `tests/test_removed_handoff_contract.py`, `tests/test_taskfile.py`, `tests/test_setup_skills.py`, `tests/test_setup_mcp.py` | M: 廃止入口の再導入防止・共有task・設定安全性 | live treeとfixture、公開入口 | 通常checkでoffline実行 | #51/#65/#66の該当成果で必要な契約だけ整合。#67の監査文言自体を恒久テスト化しない |
| `TEMPLATE_VERSION`, `docs/template/release.md`, `docs/template/v2-release-notes.md` | TEMPLATE_VERSION=Mの由来、releaseとv2出荷判定=T | template versionはPython package versionとは別 | 現在checkが1.0.0/handoffを要求。下流にrelease準備を要求してはいけない | #51で境界分離。#70が版更新/最終移行ガイド/出荷判定を所有 |
| `docs/template/adr/*.md`, `docs/template/retrospectives.md`, 本監査 | T: テンプレートの判断履歴と保守引き渡し | 保守release手順、既存履歴 | 下流では任意prune。通常checkから必須参照しない | #51で専用検証へ。#66の保守close手順はこの領域に限定。#63の新機能はv2対象外 |
| `docs/adr/0000-template.md`, `README.md`, `docs/guide.md`, `docs/optional/template-update.md` | 下流の入口/研究ADR=M、テンプレート変更の手動取り込み=O | live owner文書、TEMPLATE_VERSION、上流の公開差分 | docs/template prune後も利用可能である必要がある | #51で壊れる参照を整合、#62で最終構成の情報設計。更新は自動伝播しない |
| `docs/optional/{notebook,extras-audit,serena,codex-review}.md`, `notebooks/README.md`とnotebook文書内のoverlay snippet | O: 研究用途・host別の追加手順 | extras、任意host/MCP、notebook overlay | host不在で通常checkを壊さない。online audit/送信は明示 | 同梱方針維持。#62で導線。#51は除去時に共通securityやbase hookを保持 |
| 将来のGenshijin専用vendor subtree・project-owned adapter・操作入口（現行treeには未実装） | O: 有効化は任意。ただし提供とcaveman移行はv2必須 | #51の検証/prune境界、必要な場合だけ#57最小拡張 | fresh clone無効、同梱中offline integrity、通常setup/check/doctorでhost不要 | #65 Change 3が具体path/host/version/解除を所有。Change 2条件付き。#64統合は別判断、実host最終受け入れ#47 |

補足: `.gitignore`はMのsecret・生成物・研究データ保護を所有する。#64 prune時も、Node dependencies、
旧#57 transaction stateの残存物保護、`.env`と生成MCP設定の除外を保持する（#51）。root `LICENSE`はlocal Skillのlegal sourceでもあり、
保守文書と一緒に削除しない。Taskfile自体の混在責務は次節に入口ごとに示す。
`AGENTS.md`冒頭の「CONTEXT.md」という括弧表記と、実ファイルの用語定義/方針の分担には不整合がある。
#65 Change 1のowner整理時に解消し、端末のglobal policyとの重複だけを理由にrepositoryの規則を削除しない。

## 全public task

Taskfileの入口を列挙する。分類は入口の責務であり、Mでも毎回の実行を強制する意味ではない。
依存・検証は上のファイル別行と対応する。修復ownerは原則#51、Skill整理は#65、archiveは#66、文書導線は#62。

| public task | 分類・価値 / 依存 | 通常経路・移行と検証 / owner |
| --- | --- | --- |
| `setup` | M: lock済みNode/Python開発環境 / npm,uv,pre-commit | 通常setup。fresh/rename/prune後導入確認 / #51 |
| `setup:node` | M: Node deps復元 / preflight,npm ci | lifecycle scriptsなし。lockを保持 / #51 |
| `setup:research` | O: 数値処理 / uv research extra | 加算導入、未使用は通常経路不要。extras smoke / #51保持、#62導線 |
| `setup:notebook` | O: notebook / uv notebook extra | 同上、nb操作との組合せ確認 / #51保持、#62導線 |
| `setup:experiment` | O: 実験追跡 / uv experiment extra | 同上、既存extras契約保持 / #51保持、#62導線 |
| `setup:all` | O: 全extras / uv sync --all-extras | 明示導入、通常checkの必須化なし / #51保持、#62導線 |
| `check` | Mの集約入口、Oは同梱時、Tは分離対象 | offline。#57保持・#64 prune後専用route除去 / #51、CI同等性は#69 |
| `check:isolated` | M: host/CLI/接続不要の証明 / task check,隔離HOME等 | 通常checkと別の検証入口。環境隔離は完全network sandboxではない / #51 |
| `audit:node` | M: 依存安全性 / npm audit | 明示online操作、check/doctorに混ぜない / #51保持 |
| `fix` | M: Python整形/lint修正 / ruff | 明示変更。通常checkは検査だけ / #51保持 |
| `test` | M: Python tests / pytest | 下流でT不在でも実行可能にする / #51 |
| `lint` | M: Python lint / ruff | offline、保持 / #51 |
| `typecheck` | M: Python型検査 / basedpyright | offline、保持 / #51 |
| `hooks` | M: ローカル品質入口 / pre-commit | 明示登録、通常checkは登録しない / #51保持 |
| `doctor` | M: read-only診断 / doctor.py | 既定offline、online/githubはopt-in、prune整合 / #51/#65/#66 |
| `openspec:validate` | O: CLIによる追加gate、仕様整合の責務はM | 通常checkから独立。active/canonical/archiveへの移行 / #66 |
| `rename` | M: 下流名へ変更 / rename-package.py,uv | default dry-run。rename後check/prune確認 / #51 |
| `mcp:setup` | O: 明示接続設定 / templates,.env | secret保護と設定fixture保持、host不要 / #65 Change 1、#51保持 |
| `skills:links` | M: 共通Skillリンク / #57,setup-skills.sh | offline、両hostリンク検証 / #51/#65 |
| `skills:verify` | M: source/lock/tree/legal/links整合 / #57 | 同梱中のOも検証、#64除去後も保持 / #51/#65 |
| `skills:check` | O: upstream更新有無の手動確認 / #57,gh,network | 通常setup/check/doctorでは呼ばない。下流でも入口を保持 / #51 |
| `skills:update` | O: upstream手動preview/apply / #57,gh,独立clone | 候補への明示apply、失敗時は新cloneで再実行、通常checkはremote取得しない / #51保持、#65条件付き最小拡張 |
| `skills:repin` / `skills:adopt-local` / `skills:migrate` | O: 明示再固定 / 本文保持local化 / v1移行 / #76 | sourceと開始commit・独立候補を指定。通常CIにnetworkを持ち込まない |
| `security` | M: secret/依存/SAST / gitleaks,pip-audit,bandit | online依存監査は明示実行。残存基盤の検証をpruneしない / #51 |
| `nb:strip` | O: notebook出力除去 / nbstripout | 未導入/対象なしno-op。overlayと一体で扱う / #51保持、#62導線 |
| `nb:sync` | O: notebookペア同期 / jupytext | 未導入/対象なしno-op / #51保持、#62導線 |
| `nb:check` | O: notebook lint / nbqa | 未導入/対象なしno-op / #51保持、#62導線 |
| `prune-template-docs` | O: 保守文書除去 / prune-template-docs.py | default dry-run。通常検証のT依存も整合 / #51 |
| `clean` | M: 開発cache除去 / shell | 明示操作。Skill tree/lockや由来情報を消さない / #51保持 |

#64の`skills:automation:candidate` / `skills:automation:smoke`はTaskfileのpublic taskではなく、
`repo-tools/cli.ts`の公開CLI分岐である。両方Oとしてprune対象に含める。workflowが直接呼ぶcommand modulesも専用subtreeに属する。
`package.json`のscriptsは`repo-tools`, `preflight`, `check:contracts`, `typecheck`, `test`, `audit`。
共有入口はMとして保持し、`repo-tools`のO分岐と`check:contracts`のO/T契約だけを責務分離する。
`npm test`は現状top-level Node testsだけであり、完全な`task check`と同義ではない。

## CI・自動更新単位

| workflow / job / 設定 | 分類・価値 / 依存 | 現状と移行・検証 / owner |
| --- | --- | --- |
| `.github/workflows/ci.yml` / `check` | M: Node/Python品質保証 / locked deps,contracts,typecheck,tests | skills:verifyとautomation testsが欠落。#69で同等性を確保。#51で構成別の範囲を反映 |
| 同`rename-smoke` | M: 下流名で通常開発が成立 / rename,check相当 | 同じ2経路が欠落。#69。#51でprune組合せを検証 |
| 同`security` | M: secret検出 / gitleaks,read権限 | 保持。orgのlicense等host事情は専用CI側の設定で扱い、通常offline checkへ持ち込まない / #51保持 |
| 同`audit` | M: npm/Python依存監査とsrc SAST / advisory DB,bandit | 明示onlineのCI job。extrasは既定監査対象外。保持 / #51 |
| 同`openspec-validate` | O: CLI追加gate、整合要件はM / exact pin 1.3.1,Python gate | 現状active changesのみ。#66でcanonical/archive検証とCLI不在fallback境界を設計。通常checkへengineを混入しない |
| `.github/workflows/extras-smoke.yml` / `extras-smoke` | O: extras導入可否 / all-extras,numpy/pandas/jupytext import | workflow_dispatch専用。保持、用途別prune時は専用入口も整合 / #51保持、#62導線 |
| `.github/workflows/skill-update-prs.yml` / `detect` | O: 更新候補検出 / #57,candidate,read権限 | scheduleはSKILLS_AUTO_UPDATE=trueだけ。workflow_dispatchは明示起動。#51で一体prune |
| 同`publish-draft` | O: 候補をdraft PR化 / publish,限定write権限 | 通常checkではfake adapter testsのみ。既存権限分離を保持 / #51 |
| 同`recover` | O: 中断から復旧 / recovery,journal,限定write | 同上。復旧経路も専用subtreeと一体 / #51 |
| 同`cleanup-merged` | O: merge後管理branch整理 / finalize,contents write | repository pruneから外部branch削除を呼ばない / #51 |
| 同`validate` | O: 候補の品質確認 / shared task check + focused tests,readのみ | 同梱中offline tests保持。通常CIの不足をこのjobで代替しない / #51、#69 |
| 同`publish-finalize` | O: ready化/結果追跡 / finalize,PR/Issue write | no auto-merge、既存安全境界を保持 / #51 |
| `.github/dependabot.yml` / `github-actions` | O: action pin更新PR / GitHub Dependabot | 既存weekly設定。同梱=mandatoryとはしない。#64の既定無効設定とは別。通常checkから外部更新を要求しない / #51境界、#62導線 |
| 同`pre-commit` | O: rev更新PR / rev付きremote hooks | repo:localは対象外。削除時もbase hook/lock検証を残す / #51境界、#62導線 |
| `.pre-commit-config.yaml` | M: 軽量ローカル品質・secret guard / uv,remote hook rev | vendored Skillを整形しない。型/testはcheck/CIが所有。notebook overlayはO / #51保持 |

## #57を保持して#64をpruneする具体境界

以下は#51へ渡す変更対象であり、今このtreeで実行してよい削除手順ではない。

| 区分 | 対象 | 移行時に必要な処理 |
| --- | --- | --- |
| 専用ファイルを除去 | `.github/workflows/skill-update-prs.yml` | 6 jobs、schedule/dispatch、permissions、artifact/cleanup経路を一体で除去 |
| 専用subtreeを除去 | `repo-tools/skill-update-automation/`のcandidate/finalize/github/model/publish/recovery/smoke/workflow | 実装と配下`*.test.ts`、fake adapters、artifact/journal型を一体で除去 |
| 混在CLIを編集 | `repo-tools/cli.ts` | usageのautomation名、2分岐、専用dynamic imports、smokeだけが使うexecFileSync importを除去。runtimeと#57の5分岐は保持 |
| 混在validatorを編集 | `repo-tools/repository-contracts.ts` | validateSkillUpdateWorkflow、validateSkillUpdateSafetyPermissions、validateSmokeCliBoundary、requireDocumentMarkersと専用helper/戻り値/呼出を同梱契約へ分離。shared runtime/lock/runner/network安全契約は残す |
| 混在testsを編集 | `repo-tools/repository-contracts.test.ts` | #64必須fixture/permission/smoke/runbook検査を同梱側へ分離。fresh disabled/整合pruned/部分欠落の公開動作を別状態で検証。ファイル全体を消さない |
| task/CIを整合 | `Taskfile.yml`のautomation test行、`ci.yml`の構成別検査 | #64不在時に空globでnode:testを失敗させない。#69のCI修正が先行してroute追加済みならそこも除去。全Node testsやskills:verifyを削らない |
| typecheckを保持 | `tsconfig.json`の`repo-tools/**/*.ts` / `**/*.mjs` | broad include自体は削除subtreeの不存在を要求しない。残存importをtscで検出し、残した共有sourceを引き続き検査 |
| 混在文書を編集 | `README.md`, `docs/guide.md`, `docs/agents/safety.md` | #64有効化・復旧・human smokeの専用説明/参照とpermission markersを除去または専用ownerへ移す。README/guide/safety全体は保持。#57の手動更新と一般的な外部write安全境界を残す |
| 保守履歴を保持 | `docs/template/retrospectives.md`などの#64履歴 | #64 pruneだけでは削除しない。現在機能の有無を履歴文字列で判定しない。保守文書pruneは独立操作 |
| #57を保持 | `repo-tools/skill-updater/`全体と関連top-level tests/fixtures、`scripts/setup-skills.sh`、catalog/lock/license/links | #64→#57の依存を切る。#57から#64への逆importは現行にない。commands/planner/isolation/apply/github/schema/legal/canonical等を保守専用と誤分類しない |
| Node基盤を保持 | entrypoint/runtime、package/lock/tsconfig、Node/Python version宣言 | #64削除を依存削除の理由にしない。yaml/semverは#57でも利用する。共有index exportを一括削除しない |
| local stateを保護 | `.agents/skills/.skill-updater-txn/`とそのgitignore、下流の変更 | #76でtransaction機構を撤去した後も、旧状態や不明な利用者差分を無断cleanupしない |

### 同梱・無効・欠落の扱い

- 完全同梱・未有効化: offline source/lock/license、静的検査、外部接続不要のtestsを実行する。host認証は不要。
- 完全同梱・有効化済み: 同じoffline検証に加えて、外部操作時だけ既存の権限・承認境界を適用する。
- 正常prune: 専用資産と専用参照/検証が整合して不在で、共有資産が健全。#64専用検証を外し、#57と残存基盤を検証する。
- 部分欠落・catalog破損・dangling import/link・残存専用task: 正常な未導入扱いにせず失敗させ、欠落対象と復旧案を示す。
- 単にworkflowがない、または環境変数がfalseという理由だけで関連検証を全skipしない。

現行#64には専用manifestによるprune状態宣言はない。構成判定の具体的な保存形式や判定集合、pruneのCLI名、
事前検査、再実行・部分失敗の復旧方式は#51のOpenSpec authoringで確定する。上記の正常/不正境界を満たし、
新しい汎用profile engineを導入しないことが本監査の引き渡し条件である。

### template文書pruneとhost側の処理

`docs/template/`は全体Tであり、本監査とADRも同じprune対象になる。`docs/adr/`、TEMPLATE_VERSION、
下流workflow/安全方針、Skill基盤は保持する。#51は通常testsの履歴参照、release読み込み、README/guide等の
導線を整合させる。#64専用資産はこの操作では除去しない。

稼働中の#64では、利用者が新規起動を止め、進行中runとmanaged PR/branchの状態を確認してからrepositoryをpruneする。
repository内pruneからGitHub上のPR・Issue・branchを削除しない。残存resourceの整理は人起点の別操作として#51が案内する。
Genshijinでは#65がreceiptで所有を確認してhost登録を解除し、その後repository資産をpruneする順序を設計する。
receipt欠落/不一致、移動済みrepository、複数cloneの競合は自動削除せず復旧案内とする。
「host解除」と「repository内削除」を一つの無条件操作へまとめない。

## 既知問題の再確認と担当

以下は固定mainで確認した問題である。実装上の欠陥は本changeでは修復しない。追跡先の欠落だけは承認された起票で解消した。

| 問題 | 確認箇所・観測 | 修復owner |
| --- | --- | --- |
| template prune後validator失敗 | repository-contracts.tsのreleaseHandoffPath/readFileSync（345行付近）。使い捨てmainでprune成功後、check-contractsがrelease.mdのENOENT | #51 |
| 通常Python testsが履歴に依存 | runtime_foundation / review_convergence / openspec_direct_workflowの3ファイルをprune後実行し5 failed・23 passed。tool_neutral_documentationもADR/release notes/retrospectivesのread_textがある（静的確認） | #51 |
| #64無効でも専用資産必須 | validatorがworkflow/CLI/smokeディレクトリ/文書markersを無条件要求。workflow単独欠落でENOENT。これは部分欠落であり正常pruneの成功例ではない | #51 |
| 通常CIとcheckの範囲不一致 | Taskfileはskills:verifyとautomation/**/*.test.tsを実行。ci.ymlのcheck/rename-smokeは両方なし。#64 validate jobは通常CIの代替にならない | #69 |
| release準備契約が通常検証へ固定 | validatorのTEMPLATE_VERSION==1.0.0、release handoff markers。test_runtime_foundation_contract.pyは「全 4 changes」を要求 | #51が下流から分離、#70が出荷契約を更新 |
| prepare-v2-releaseの追跡先が監査開始時に未確定 | 当初はrelease.mdとruntime testに名前だけ残っていた。全stateで重複確認後に起票 | #70へ接続済み。release準備実装は未完了 |
| 同梱=コアの利用説明 | docs/guide.md §2「作成直後に入っているものすべて」が同梱任意機能と不整合 | #51は変更経路の説明を最小修正、最終情報設計#62 |

## 後続Issueへの引き渡しと受け入れ条件

### #51: 検証境界とprune後の通常開発

#67の監査をbaseにauthoringする。責務分離を先に行う必要がある場合でも、利用者に独立価値のある成果で区切る。
推奨する独立受け入れ単位は、(a) template文書prune後の通常開発成立、(b) #57を保持する#64専用資産prune。
各単位に必要なvalidator・tests・task/CI・docsは同じchangeに置き、ファイル種類だけで分割しない。
(a)の共通検証分離を(b)が利用する場合は、(a)のclose/merge後のmainをbaseとする。

受け入れ条件:

1. fresh、rename後、template文書prune後、#64 prune後、両方prune後で通常setup/check/doctorが成立する。
2. template文書が残っていても下流の通常checkはrelease-readyや特定versionを要求しない。保守者が明示的に専用検証を実行できる。
3. #76 verify、links、手動check/update/repin/adopt-local/migrateの入口を提供する。remote操作はfake ghで検証でき、通常checkに認証/ネットワーク不要。
4. 同梱#64の破損と部分削除は検出する。正常prune後だけ専用tests/routesを外す。必須Skillのlock/license不一致は引き続き失敗する。
5. previewは無変更、applyは対象限定、再実行と部分失敗は仕様どおり。repository外pathと対象外の利用者差分を保護する。
6. template pruneと#64 pruneは独立であり、GitHub resourceやhost登録の無断削除を行わない。
7. 同じ構成ではローカルcheckと通常CI/rename smokeのoffline検証範囲が一致する。既存漏れの独立修正とは担当を分け、後続変更で再発させない。
8. 公開入口の変更に必要なfocused validationと現行policyのreview/project checksを完了する。

### #65: policy整理、条件付きbundle対応、Genshijin移行

Change 1は#67と必要な#51修復後に行う。root policyはrepository固有境界、workflowはtask/checkbox/fallback/evidence/review手順を所有する。
固定12分類、未検証の非完了扱い、dirty ownership、外部write境界を保持する。live OSWF-5参照は意味のある名称にし、歴史文書は書き換えない。
grill-me除去とcatalog/lock/links/tests/docsを同一成果として整合する。cavemanはChange 3まで残す。
code-reviewの未同梱setup前提は既存policy/Issue/specを使う最小案から評価し、remote原本変更のownershipを曖昧にしない。

Change 2はChange 3の必要能力から判断する。既存#57と明示更新手順で満たせるなら新規bundle updaterは不要。
現行の`ownership: "plugin"`はschema/typesに存在するが、repository.tsではinstalled tree検証をskipし、
commands.tsではlinks対象から外す外部manager宣言である。Genshijin bundleのoffline integrityが実装済みという意味ではない。
不足時だけ固定版・offline integrity・更新に必要な最小拡張を行う。#64へのplugin更新PR統合は別changeの判断とし、v2の無条件blockerにしない。

Change 3の受け入れ条件:

1. 専用subtreeにstable releaseのruntime closureを固定commitで同梱し、project-owned adapterを分離する。具体pathはauthoringで確定する。
2. #65本文のallowlist/required paths、entry type/path traversal、file/mode/size、provenance/hash、SPDX/license hashを満たす。通常検証はvendored hooks/installers/MCP/lifecycle codeを実行・importしない。
3. fresh cloneは無効。preview/setup/status/removeの最終公開名を定義し、setupはofflineかつ明示的。複数hostなら選択必須、未導入hostは通常setup/check/doctorの失敗理由にしない。
4. 同じsource/scopeの再setup、競合拒否、Git-local receiptの0600、所有resourceだけのremove、receipt欠落/不一致、移動/複数clone、解除後pruneを検証する。
5. Claude Code/Codex CLI/Codex IDEの対応機能を公式仕様と対象versionで確認する。未確認parityを出荷済み扱いにしない。対応不能なら新規仕様判断へ戻す。
6. caveman実体・hook guide・live references・診断・catalog・links・fixturesを同じ移行成果で撤去する。無効時にも同梱integrityは検証し、prune後は専用検証だけを外す。
7. host境界はfake executables/隔離設定で検証し、重要境界は実装中に実host smoke、最終workflowは#47へ渡す。

### #66: 下流archiveと保守close、canonical specs、executor handoff

#65 Change 1で整理したownerをbaseにする。下流正本は`docs/agents/workflow.md`、`openspec/project.md`は構成規約と参照、
`docs/guide.md`は導線だけとする。template専用の削除型pre-merge closeは`docs/template/`の明示手順へ移す。

受け入れ条件:

1. prune前の下流でも通常archiveを既定とし、repository名・remote・保守文書の有無から削除closeを推測しない。
2. 実装/focused validation→verify→review収束→同じPRでspec同期/archive→canonical/archive後diff review→変更入力の再検証/最終CI→mergeの順序を定義する。
3. 組織のmerge/deploy後完了等だけを別PR archiveの明示例外にする。archive追加差分もreview対象とする。
4. CLI不在Markdown fallback、deltaなし、未完了task/blocker、archive後修正、同一capability競合、再実行/同名衝突、非対話の境界を解決する。
5. 現gateのactive changesだけの検証を見直し、canonical specsとarchiveの必要な整合検証を明示する。通常checkにCLIを必須化しない。
6. executorは実装完了とarchive完了を区別し、PR review未収束ならarchive-ready handoff。自動archive/commit/push/PR/mergeを追加しない。
7. live workflow・gate・Skill・tests/docsを同じ受け入れ成果で整合させる。仕様同期処理を別途自動化する必要が出た場合だけ別changeをauthoringする。

### 残る順序と対象外

#67 → 必要な#51修復と#69のCI修正 → #65 Change 1 → #65 Change 3に必要な範囲判断 → 必要なChange 2 → Change 3。
#66はChange 1後に整理済みownerへ実装する。#65/#66を含む出荷構成が確定したら#62、最終workflowで#47、最後にprepare-v2-release（#70）へ渡す。
#52のinstaller分離はv2.x、#61・#63はv2対象外。新しいscheduler/配布基盤/汎用plugin managerは追加しない。

## 独立成果の追跡

利用者の明示承認を受け、2026-09-13に全stateのIssue一覧で重複を確認して次の2件を起票した。
受け入れ条件の正本は各Issueとし、貼り付け用文面は本書に重複保持しない。どちらも実装は未完了である。

- [#69: 通常CIとrename smokeをtask checkのoffline検証範囲へ揃える](https://github.com/shimi3435/ai-coding-template-ja/issues/69):
  同じ構成でskills:verifyとautomation testsの実行範囲を一致させる。#51のprune実装とは独立して受け入れ、
  #51による構成変更後も必須検証を保持する。外部host・認証・ネットワークを通常offline検証へ追加しない。
- [#70: prepare-v2-releaseで版更新・移行ガイド・release-ready判定を確定する](https://github.com/shimi3435/ai-coding-template-ja/issues/70):
  #51、#69、#65の必須成果、#66、#62、#47の検証完了後に版更新・移行ガイド・保守専用の出荷判定を仕上げる。
  #65の条件付き拡張だけを必要性判断に応じて前提とし、#52/#61/#63や#64のplugin更新PR統合を無条件の前提にしない。

#67の完了判断には、この2件への接続と監査changeの必須review・検証完了が必要である。
Issueの起票は修復完了やv2出荷可能を意味しない。PR #68のpre-merge closeもIssue #67のcloseやPR mergeとは別操作である。
