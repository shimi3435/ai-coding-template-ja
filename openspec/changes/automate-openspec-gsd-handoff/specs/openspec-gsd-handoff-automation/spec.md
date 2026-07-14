## ADDED Requirements

### Requirement: canonical OpenSpec artifactsを正確に発見して読む
bridgeは MUST 対応済みOpenSpec CLI JSONをpath discoveryと進捗メタデータにだけ使い、canonical contentを発見したMarkdown filesから読み取る。

#### Scenario: 対応するCLI JSONを利用する
- **WHEN** exit 0の`openspec --version`が`1.3.1`を返し、`instructions apply --json`が固定schemaと進捗invariantを満たす`state=ready`のJSONを返す
- **THEN** bridgeはartifact pathsを検証してMarkdown contentをディスクから読み、JSONをcanonical本文とみなさない

#### Scenario: CLI JSONを利用できない
- **WHEN** CLIが不在、version probeまたはapplyがnon-zero、versionが`1.3.1`以外、JSONがmalformed、またはschema / path / cardinality / progressが非対応である
- **THEN** bridgeはJSON入力を一部採用せず、固定されたchange directory規約からMarkdown filesの発見を最初からやり直し、使用したfallback経路を記録する

#### Scenario: CLIが準備不足を報告する
- **WHEN** schemaがvalidでもapply JSONが`state=blocked`または`missingArtifacts`を含む
- **THEN** bridgeはMarkdown fallbackで準備不足を隠さず、永続artifactを書かずにhandoffを停止する

#### Scenario: CLIが全task完了を報告する
- **WHEN** schemaがvalidなapply JSONが`state=all_done`を返す
- **THEN** bridgeは新規GSD handoffを開始せず、OpenSpec原本の最終境界ゲートへ案内する

#### Scenario: discovery結果が不正である
- **WHEN** pathがrepoまたは対象change外を指す、必須artifactが空・重複・欠落する、symlink解決後にrepo外へ出る、またはMarkdownを読めない
- **THEN** bridgeはpathを推測・補完・重複排除して続行せず、永続artifactを書かずに停止する

#### Scenario: artifact入力が上限を超える
- **WHEN** lower-kebab change IDが128 UTF-8 bytes、canonical Markdownが64 files、各1 MiB / 合計4 MiB、またはtasksが4096件のいずれかの上限を超える
- **THEN** bridgeは入力を切り捨てず、超過対象と上限を報告して手動handoffを提示する

### Requirement: task progressを決定論的に算出する
bridgeは MUST `tasks.md`の整形式checkboxを正本としてtotal、complete、remainingを算出し、CLI進捗メタデータとの不一致を黙って採用しない。

#### Scenario: task progressを算出する
- **WHEN** `tasks.md`が一件以上の行頭`- [ ] <description>`または`- [x] <description>` taskを含む
- **THEN** bridgeはMarkdown内の番号をdescriptionとして保持し、出現順の1始まり連続文字列IDを付け、total、complete、remainingを非負整数として算出する

#### Scenario: CLI進捗と一致する
- **WHEN** 対応CLI JSONの`progress` / `tasks`が`tasks.md`からの算出結果と一致する
- **THEN** bridgeは同じ正規化progressを採用し、入力経路だけを区別して記録する

#### Scenario: CLI進捗と一致しない
- **WHEN** CLI metadataの件数、完了状態、task ID、または本文が`tasks.md`からの算出結果と一致しない
- **THEN** bridgeは`tasks.md`を正本として不一致を報告し、対応schemaの異常としてJSON経路を続行しない

#### Scenario: tasks形式が不正である
- **WHEN** taskが空、checkboxが壊れている、大文字`X`、`*` bullet、indent、CLI task ID重複、またはprogress値が負数・非整数・total超過になる
- **THEN** bridgeは部分progressを返さず、修正されるまでhandoffを停止する

### Requirement: minimal handoff manifestを原子的かつ追跡可能に保存する
bridgeは MUST change ID、canonical paths / hashes、source commit、progress、capabilities、handoff stateだけを持つ最小manifestを原子的に生成し、cross-session resumeを主張する前にGit追跡可能性を確認する。

#### Scenario: manifestを生成する
- **WHEN** validated source commitに対するGSD handoffが承認される
- **THEN** bridgeはschema version、change ID、sorted repo-relative paths / hashes、source commit、progress、検出capabilities、`prepared` handoff stateをstaging fileで検証してから`.planning/openspec/<change-id>/handoff.json`へ置換する

#### Scenario: GSD entrypointがhandoffを受け付ける
- **WHEN** `prepared` manifestに対応する契約済みGSD entrypointがhandoffを受け付ける
- **THEN** bridgeはmanifestを原子的に`started`へ更新し、MVP外の完了 / finalize / cleanup stateへ進めない

#### Scenario: manifestをfeature branchで追跡する
- **WHEN** manifest生成が成功する
- **THEN** skillはcanonical artifactsを固定したsource commitとは別の後続commitでmanifestを追跡する手順を提示し、source commitとmanifest commitを区別する

#### Scenario: planning stateがignoreされる
- **WHEN** `.planning/openspec/<change-id>/handoff.json`がGit ignore対象またはrepo policy上の非追跡対象である
- **THEN** skillはcross-session resume可能とみなさず、永続化方針が明示されるまでhandoff stateを`prepared`または`started`へ進めない

#### Scenario: manifest入力または既存stateが不正である
- **WHEN** 必須field欠落、unsupported schema、repo外path、hash不正、source commit不在、解析不能、または部分生成を検出する
- **THEN** bridgeは既存manifestを自動修復・上書きせず、staging状態と修復要求を報告する

#### Scenario: テンプレート自身でcloseする
- **WHEN** テンプレートのpre-merge closeを行う
- **THEN** 実行主体は先行changeのclose policyに従って追跡manifestを手動処理し、本MVPは自動finalizeまたはcleanupを行わない

### Requirement: policyとcapabilityのpreflight後にGSD handoffを開始する
`execute-openspec-change` skillは MUST `adaptive-change-execution`の準備条件と実装前gateで固定したMVP capabilityをread-onlyで検査し、入力表示と明示承認後にだけbridgeと契約済みGSD handoffを起動する。

#### Scenario: preflightが成功する
- **WHEN** 参照policyの準備条件、OpenSpec 1.3.1 contract、GSD 1.5.0のVERSION / required files / read-only init progress signal、host spawn schema、source commit、manifest追跡先がすべて確認できる
- **THEN** skillはchange ID、canonical paths、経路理由、source commit、manifest path、検出capabilitiesを表示して承認を求める

#### Scenario: handoffを承認する
- **WHEN** 利用者が表示内容を明示承認する
- **THEN** skillはbridgeでminimal manifestを生成し、未初期化GSDにはcanonical paths、source commit、one-change制約、仕様非複製を持つidea documentを`$gsd-new-project --auto`へ渡し、初期化済みGSDには同じ参照を持つchange専用`$gsd-phase`を追加する

#### Scenario: Codex hostがgeneric agent schemaを提供する
- **WHEN** runtime preflightで`spawn_agent` schemaに`agent_type`がない
- **THEN** skillは対応agent `.toml`をrole-preambleとして注入して`generic-agent workaround`と明示し、typed dispatchまたはworktree isolationが必須なら起動せずfail-closedする

#### Scenario: preflightが不足する
- **WHEN** policy条件、固定tool contract、tool signal、host spawn schema、branch / working tree、source commit、入力上限、または追跡可能性のいずれかを確認できない
- **THEN** skillは不足項目と手動handoff手順を報告し、永続artifact生成やGSD起動を行わない

#### Scenario: bridgeまたはGSD起動が部分失敗する
- **WHEN** manifest生成後またはGSD handoff起動中に処理が失敗する
- **THEN** skillは自動route switch、rollback、retryを行わず、manifest state、完了済み操作、失敗点、手動再開手順を報告する

#### Scenario: handoff後のlifecycle操作を要求する
- **WHEN** plan / execute / resume / verify / finalizeの自動制御、stable mapping、ownership、またはcleanupを要求される
- **THEN** skillは本MVPのスコープ外として先行policyの手動手順または後続hardening changeを案内する

### Requirement: オプション依存をコアCIから分離する
プロジェクトは MUST GSDをopt-inに保ち、MVP bridgeの通常CIを決定論的fixturesで成立させ、実tool smokeを明示的なopt-inとする。

#### Scenario: GSDなしで通常CIを実行する
- **WHEN** GSDがインストールされていない環境で`task check`を実行する
- **THEN** discovery、Markdown read、progress、minimal manifest、path safety、atomic write、preflightのfixture testsは成功する

#### Scenario: JSON経路とfallbackを比較する
- **WHEN** 同一changeを対応JSON fixtureと固定directory fixtureから読み込む
- **THEN** 両経路は同じcanonical Markdown contentと正規化progressを生成し、入力経路だけを区別する

#### Scenario: malformed入力を検証する
- **WHEN** empty、duplicate、unordered、Unicode、traversal、壊れたJSON / Markdown / manifest、partial writeのfixturesを実行する
- **THEN** testsは各入力が仕様どおり決定論的に処理またはfail-closedされることを確認する

#### Scenario: 実tool互換性を確認する
- **WHEN** 開発者がopt-in smoke testを明示的に実行する
- **THEN** testはローカルOpenSpec path discovery、progress parity、GSD read-only probe、entrypointにdry-runがないことを確認し、versions、schema、signalsを報告する
