# 利用ガイド — このテンプレートの歩き方（通し読み）

このテンプレートの主目的は、研究者が AI コーディングを安全に始める開発基盤を提供すること。
そこから研究プロジェクトを作った人（下流の研究者）向けの通し読みガイドである。最短の手順は
[README](../README.md) にある。本ガイドはその補完で、「なぜその手順か」「どのオプションを
いつ入れるか」「詰まったらどこを見るか」を一本の流れで説明する。

本ガイドは事実（コマンド名・導入手順・依存の中身）を再掲しない。それらの正は README と
各リンク先にあり、本ガイドは選び方と考え方だけを担当する。リンク先が常に最新の正である。

## 1. 位置づけ — どの文書を読むべきか

- [README](../README.md) … quickstart。新規作成 → 改名 → green の最短手順と、タスクの一覧表。
- 本ガイド（docs/guide.md）… 全体像・オプションの選び方・トラブル導線の通し読み。
- [AGENTS.md](../AGENTS.md) … AI エージェント向け作業方針の単一の正。人間が読めば、
  エージェントが何を守って動くはずかが分かる。方針を変えたいときもここを編集する。
- [docs/agents/](agents/) … エージェント運用の詳細（workflow / safety / mcp）。
- [docs/optional/](optional/) … オプション機能の個別手順。どれが要るかの選び方は本ガイドの §6。
- [docs/adr/](adr/) … あなた自身の研究判断（モデル選択・実験設計の理由など）を
  ADR として積む場所。出荷時は道標 1 枚のみの空である。

ディレクトリ構成の全体は README の「ドキュメント構成」節が正。

## 2. 全体像 — コアとオプションの 2 層

このテンプレートは 2 層でできている。

- **コア層**: 作成直後に入っているものすべて。Python 開発基盤（uv）・品質ゲート
  （整形 / lint / 型 / テスト / secret スキャン）・エージェント統合（AGENTS.md・OpenSpec・
  skills・Context7 MCP）・TypeScript 製のリポジトリ管理 CLI。管理ランタイムとして
  Node.js 24 LTS と npm、アプリケーションランタイムとして Python 3.14 以上を必要とする。
- **オプション層**: 既定では入らない。不在が正常で、要るときだけ opt-in する（§6 の決定表）。

コア層を使う上でのメンタルモデルは 3 つ:

- **task が共通入口**: 人間も AI エージェントも同じ task コマンドを叩く。何があるかは
  README のタスク表が正。人間と AI で手順が分岐しないことが再現性の土台になる。
- **green の意味**: `task check`（品質チェック一式）が通り、`task doctor`（環境診断）が
  FAIL ゼロであること。この 2 つが「壊れていない」の定義で、以後のすべての変更の基準線になる。
- **単一の正（SoT）**: エージェントの作業方針は [AGENTS.md](../AGENTS.md) が唯一の正。
  他のエージェント設定ファイルは薄い参照に留まる。方針の重複記載を作らないことで、
  「片方だけ直して食い違う」事故を防いでいる。

研究成果物（データ・結果・設定・notebook）の置き場と gitignore 方針は
README の「研究成果物の扱い」節を参照。

## 3. 立ち上げの「なぜ」 — bootstrap → rename → green

手順の実体は README の「このテンプレートから新規プロジェクトを作る」節。
ここでは順序の理由だけを述べる。

1. **bootstrap が最初**: 用意した必須runtimeを検査し、uv導入を確認してsetupへ進む。
   環境が揃う前に何をしても、失敗の原因が環境なのかコードなのか切り分けられないため、
   まず土台を固定する。
2. **rename が 2 番目**: テンプレートのパッケージ名のままコードを書き始めると、後からの
   改名が書いたコード全体に波及する。書き始める前に自分のプロジェクト名へ改名する。
   改名タスクが dry-run → 実適用の 2 段になっているのは、置換される箇所を先に目視で
   確認できるようにするためである。
3. **green の確認が最後**: 改名直後に check と doctor を green にしておくと、以後に赤が出た
   ときは「自分の変更が原因」とただちに切り分けられる。ここが基準線になる。

### Node導入と旧installerからの移行

bootstrapはNodeを導入しない。Node.js 24 LTSとnpmが必要であり、Pythonは3.14以上を用意する。
Node / npmが未導入、不適合、またはversion検査に失敗した場合は、原因と復旧案内をstderrへ出し、
uv導入や `task setup` より前に終了コード1で停止する。

1. [Node.js公式導入ページ](https://nodejs.org/en/download)で **24 LTSとnpm** を選んで手動導入する。
   既に要件を満たす環境がある場合は再導入しない。
2. 使用するshellのPATHを確認し、`node --version` と `npm --version` がその環境を参照することを確認する。
3. `./scripts/bootstrap.sh` を引数なしで再実行する。

特定runtime managerの導入・起動はbootstrapの責務に含めない。旧installerで導入したファイルや
shellのPATH設定は削除・変更しない。旧 `NODE_INSTALL_ROOT` 環境変数は無視され、
残っていても通常bootstrapを妨げない。

bootstrapの引数契約:

- 引数なし: 必須runtime検査後、通常setupへ進む。
- `--help` / `-h`: 使い方・必要版・公式導入先・旧optionの廃止をstdoutへ表示し、終了コード0。
  runtime検査、通信、環境変更は行わない。重複指定でも表示は1回。
- `--install-node`: 廃止診断と上記の移行案内をstderrへ表示し、終了コード2。
  Node導入済みでも拒否し、導入処理は行わない。
- その他の引数（空文字・位置引数を含む）: 未知引数としてstderrへ診断し、終了コード2。
  helpとの混在は順序によらずエラーを優先する。不正引数が複数なら最初のものを診断する。

## 4. 日々のループ — check / fix / doctor の読み方

日々の回し方は次の型に収まる（各コマンドの定義は README のタスク表が正）。

- **書く → `task fix` → `task check`**: fix は自動で直せるもの（整形・自明な lint 指摘）を
  直し、check は整形・lint・型・テストを一括で検査する。check が通る状態を細かく保つほど、
  赤が出たときの容疑範囲が狭くなる。
- **pre-commit は最後の網**: コミット時に軽量チェックが自動で走る。ブロックされたら大半は
  fix で直る。網を `--no-verify` でくぐらない（くぐった分だけ CI で発覚が遅れる）。
- **`task doctor` は環境の体温計**: コードではなく環境（ツールの在席・設定のずれ）を
  読み取り専用で診断する。「昨日まで動いていたのに」系の不調はまず doctor。
  出力の INFO は情報通知（オプションの在席・テンプレ由来の残存物など）であって
  問題の指摘ではない（オプションの読み方は §6）。
- テストだけ・lint だけの個別実行や、extras / notebook / セキュリティ系のタスクは
  README のタスク表を参照。

初めて OpenSpec change を切るときの最小手順は [docs/agents/workflow.md](agents/workflow.md) の
「初めての change（quickstart）」節を参照。

通常 CI の `check` と改名後の `rename-smoke` も、ローカルと同じ `task check` を実行する。
検証一覧の正は [Taskfile.yml](../Taskfile.yml) の `check`。Skill の source / lock / 実体 / legal /
symlink の整合、top-level Node tests、TypeScript、Python checks を検証する。
CI は固定版 Task と locked dependencies を事前導入し、検証段階では導入や外部 host・認証を要求しない。
依存監査・OpenSpec の独立ジョブは、この通常 offline gate とは別である。

## 5. エージェントに渡す入口

エージェント（Codex / Claude Code）は [AGENTS.md](../AGENTS.md) を作業方針の正として読む。
人間側が知っておく入口は次の 3 つ。

- **方針**: エージェントの振る舞いの期待値は AGENTS.md で揃える。読めば「何を守るはずか」が
  分かり、直せば全エージェントに効く。
- **仕様から始める文化**: このテンプレートは「先に何を・なぜ作るかを固めてから実装する」
  ための OpenSpec を同梱している。まとまった変更は `openspec/` の change として仕様と
  受け入れ基準を確定する。OpenSpec 直接実行をコア経路とし、CLI 不在時も Markdown fallback で
  同じ `tasks.md` を実装・検証・更新する。`execute-openspec-change` skill は preflight 後、依存済みの
  先頭未完了 task から直接実行する。詳細は [docs/agents/workflow.md](agents/workflow.md) が正。
- **skills**: 設計を詰める（grill 系）・テスト先行（tdd）・バグ調査（diagnosing-bugs）・
  簡素化（caveman）・コミット前の自己検査（self-review）などの skill を同梱済み。
  一覧と役割分担は [docs/agents/workflow.md](agents/workflow.md)。

破壊的操作・secret の扱いなどの安全境界は [docs/agents/safety.md](agents/safety.md)。

## 6. オプションの選び方と入れ方

**この表は「入れ忘れの点検リスト」ではなく「要るときだけ入れる選択肢の地図」であり、
どの行も入れないままでコアは完結する。**

前提（opt-in 原則）:

- どのオプションも**既定では入らない**。不在が正常で、エラーでも設定漏れでもない。
- 在席の一部は `task doctor` が **INFO** で報告する（WARN / FAIL にはしない）。ただし
  doctor が全オプションを probe するわけではなく（extras の導入状態は見ない）、
  接続・認証の検証もしない。導入できたか・使える状態かの確認は各リンク先の手順が正。
- 導入手順の実体は各行のリンク先が正。この表は選定のためだけにある。

導入機構別に 3 グループある。グループが違えば「入れる」の意味も違う。

### (a) extras — uv で入る Python 依存

プロジェクトの Python 環境に依存パッケージ群を足す。導入タスクと内訳は README
（構成節・タスク表）が正。

| 機能 | 何を足すか | いつ要る・避ける（前提） | 入れ方 | 詳細リンク |
| --- | --- | --- | --- | --- |
| 科学計算スタック | 数値計算・データ処理・可視化のライブラリ群 | 数値実験・データ解析を始めるとき。書き捨ての検証段階では依存を増やさない選択も妥当 | README のタスク表にある導入タスク | [README](../README.md)（構成節） |
| notebook 管理 | notebook 実行環境と運用ツール（出力除去・ペア管理・lint） | Jupyter notebook を研究に使うとき。使わないなら不要 | 同上 | [docs/optional/notebook.md](optional/notebook.md) |
| 実験管理 | 実験設定・実験追跡・データ版管理のツール群 | 実験本数が増えて手動管理が破綻し始めたとき。外部へ送信する面を持つツールを含むため、送信先と認証情報の管理は自分の責任になる | 同上 | [README](../README.md)（構成節） |

> 付随注: extras はコアの依存監査ゲートの対象外（コア CI を extras 起因の赤で汚さない
> ための線引きで、「監査しなくてよい」ではない）。extras を導入したら extras 込みの監査を
> 自分のゲートに足すことを推奨 → [docs/optional/extras-audit.md](optional/extras-audit.md)。

### (b) エージェント拡張 — 各自の環境へ opt-in install

リポジトリにはコミットされず、各自のエージェント環境に入る。チームで使う場合も
導入は各メンバーごとになる。

| 機能 | 何を足すか | いつ要る・避ける（前提） | 入れ方 | 詳細リンク |
| --- | --- | --- | --- | --- |
| Codex クロス AI レビュー | 別 AI（Codex）によるレビューの脚を足す | 自己レビューに別視点を足したいとき。**要 Node.js ＋ ChatGPT サブスクリプション or OpenAI API key**。コードを外部（OpenAI）へ送るため、送信できないプロジェクトでは使わない。トリガは常に人起点 | Claude Code へ plugin として導入 | [docs/optional/codex-review.md](optional/codex-review.md) |
| caveman hook 自動発火 | 簡素化モードの毎ターン自動適用 | 明示起動では足りないほど常時かけたいとき。**Claude Code 限定**（hook 機構依存）。簡素化原則自体は AGENTS.md に内包済みで、hook 無しでも方針としては効く | hook を各自の設定に登録 | [docs/optional/caveman-hook.md](optional/caveman-hook.md) |

### (c) MCP server — エージェントの外部接続を足す

コアの MCP は Context7（ドキュメント参照）のみ。以下は設定への各自追記で足す。

| 機能 | 何を足すか | いつ要る・避ける（前提） | 入れ方 | 詳細リンク |
| --- | --- | --- | --- | --- |
| Serena MCP | セマンティックなコード理解・symbol 単位編集 | 既存コードが育って大規模リファクタリングをするとき。初期の短い修正が主体のうちは過剰 | 設定 template へ snippet を各自追記 | [docs/optional/serena.md](optional/serena.md) |
| GitHub MCP | 構造化された Issue / PR / Actions 参照 | コアの gh CLI で足りないとき（構造化出力が要る等）。read-only 既定・token の扱いに注意 | 3 形態から選んで設定へ各自追記 | [docs/agents/mcp.md](agents/mcp.md) |

## 7. Skillの手動更新と旧自動化の撤去

Skill更新は手動操作と通常PRで扱う。定期更新、candidate artifact、managed branch / draft PR、
journal / receipt、finalize、recovery / reconciliation、resume closed、human smokeの提供は終了した。
保守者専用機能や下流optionalとしても残さない。取得・固定・legal・offline検証は引き続き利用する。

### 既存の自動化を停止して撤去する

以下は旧版を使用しているrepositoryの管理者が、対象repositoryを確認して順番に実施する。
新規利用で旧workflowも外部resourceも存在しない場合は、不在を確認して「手動更新」へ進む。
repository内の撤去処理はGitHub上のPR、branch、artifact、設定を自動削除しない。

1. **新規起動を止める。** 対象repositoryのActionsで旧 `Skill update PR automation`
   （`skill-update-prs.yml`）を選び、メニューから **Disable workflow** を実行する。
   `SKILLS_AUTO_UPDATE` を削除またはfalseにするだけでは、手動dispatchや進行中runの停止にはならない。
   workflowが既にない場合は再作成せず、旧runの確認へ進む。
   [GitHubの無効化手順](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows)も参照する。
2. **進行中の処理を止める。** 旧workflowのqueued / waiting / in-progress runをすべて確認し、
   Cancel workflowで取消する。再読み込みして未完了runがないことを確認する。
   取消失敗、権限不足、状態不明の場合はここで停止する。取消要求の送信だけで停止済みと判断しない。
   人による旧workflowの再有効化、過去runの再実行、旧human smoke CLIの起動も中止する。
3. **既存resourceを棚卸しし、利用者変更を保全する。** open / closed / merged PR、tracking issue、
   `automation/skill-updates/` 配下のbranch、run artifactとlog、旧smoke用repositoryを確認する。
   PRのbase/head、commit、本文・comment、利用者が追記した変更を確認し、必要な差分・記録を保存する。
   名前や古いjournal / receiptだけを根拠に所有や安全な削除を推測しない。
   未mergeの候補は新しい作業コピーで再検証し、通常PRへ引き継ぐか、人が不要と判断してcloseする。
   不明なbranchや中断状態は保持する。旧recoveryを動かして片付けない。
4. **撤去差分を反映する。** workflow、専用実装・tests・CLI・task route・専用検査と現行文書を一体で更新する。
   未コミット差分と競合する場合は保全してから人が解決する。自動stash、reset、cleanは行わない。
   localの `.agents/skills/.skill-updater-txn/` は手動updaterの中断状態であり、旧自動化のcacheとみなして削除しない。
5. **不要な設定・resourceの扱いを個別に決める。** `SKILLS_AUTO_UPDATE` variable、旧automation用の設定、
   branch、artifactは他用途と利用者変更がないことを確認してから、人が必要に応じて削除する。
   標準の旧workflowは `github.token` を使い、専用PATやrepository secretは要求していなかった。
   独自追加したsecret / GitHub App / tokenは利用先を確認し、組織共有の認証情報や通常CIの権限を一括削除しない。
   新しいtokenは作らない。tracking issueやjournalは履歴として残してよい。
6. **手動運用へ移る。** 下記の更新・検証を実施し、通常PRでレビューする。
   途中失敗後に手順を再開する場合は、再取得したworkflow/run/resourceの状態から確認する。
   既に存在しないresourceの操作は省略し、削除済みの機能を再作成しない。

### 手動更新

Node.js 24、npm、Python >=3.14、uv、Task、公開GitHubを読める `gh` を用意する。
元の作業コピーにある未コミット差分は保持し、更新用の新しいbranchとpathを選ぶ。
以下の固定例が既に存在する場合は別名に置き換える。既存directoryを上書きしない。

1. 元repositoryで最新baseを取得し、更新用worktreeを作る。

   ```bash
   git fetch origin main
   git worktree add -b chore/manual-skill-update ../manual-skill-update origin/main
   cd ../manual-skill-update
   ```

2. 更新用worktreeだけでruntimeとlocked dependencyを準備し、現状を検証する。

   ```bash
   node repo-tools/entrypoint.mjs runtime-preflight
   npm ci --ignore-scripts
   uv sync --locked
   task skills:verify
   ```

3. 上流の状態と更新previewを確認する。これらのコマンドは公開GitHubを読み取る。

   ```bash
   task skills:check
   task skills:update
   ```

4. previewのcommit、差分、source / lock、LICENSE / NOTICEを確認後、同じworktreeへ適用して検証する。

   ```bash
   task skills:update -- --apply
   task skills:verify
   task check
   git diff --stat
   git diff
   ```

5. 検証成功と差分reviewの後、通常のcommit / push / PR手順へ進む。
   取得前の件数・byte上限、特殊file、integrity、legal不一致、履歴変更などで失敗した場合は止める。
   失敗したコピーを元の作業コピーやPRへ持ち込まず、必要な調査情報と利用者変更を保全する。
   LICENSE / NOTICEの承認hash変更や移動タグ・履歴変更のrepinは、人が内容を確認して別途判断する。

worktreeはOSのセキュリティsandboxではない。取得前の上限検査は、通信全体の厳密な転送量制限を意味しない。
source / lock形式、first-partyの `task skills:lock-local`、transaction / rollbackは現行契約のままであり、
後続のSkill管理縮小・lock移行とは分けて扱う。

## 8. 詰まったとき

1. **まず `task doctor`**: 読み取り専用の環境診断。FAIL ゼロが green。ツール不在・設定の
   ずれなど環境系の不調は、ここで大半が名指しされる。ただしオプションの導入失敗は
   doctor では見えないものがある（§6）— その切り分けは各リンク先の確認手順で行う。
2. **エージェントに diagnosing-bugs**: doctor で切り分けられない失敗（セットアップ・依存の
   同期・pre-commit・MCP の起動など）は、エージェントに diagnosing-bugs skill で調査させると
   再現 → 切り分けの型で進む。
3. 典型的な詰まりと出口:
   - **MCP の設定を直接編集したら消えた** — 設定の実体は template から再生成される生成物で、
     直接編集は次の再生成で上書きされる。template 側を編集する → [docs/agents/mcp.md](agents/mcp.md)。
   - **notebook 系のタスクが何もしない** — extra 未導入の環境では案内だけ出して正常終了する
     （opt-in 原則。壊れていない）→ [docs/optional/notebook.md](optional/notebook.md)。
   - **skill が見つからない / リンク切れ** — 修復用のタスクがある → README のタスク表（skills 系）。
   - **doctor の INFO が気になる** — 情報通知（オプションの在席・テンプレ由来の残存物など）
     であって問題ではない（§6）。
