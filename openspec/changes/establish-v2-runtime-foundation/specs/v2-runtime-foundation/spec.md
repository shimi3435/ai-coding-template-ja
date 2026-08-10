## ADDED Requirements

### Requirement: V2-RUNTIME-1 Node と Python の runtime 境界を宣言する

テンプレートは MUST Node.js 24 LTS を必須管理 runtime、Python 3.14 を既定かつ CI baseline、Python `>=3.14` を対応最低 version として宣言し、実行前に検証する。

#### Scenario: 対応 runtime を使う
- **WHEN** Node の major が 24 で Python の major/minor が 3.14 である
- **THEN** runtime preflight は成功し、検出した完全 version を診断出力へ含める

#### Scenario: Node の line が異なる
- **WHEN** Node の major が 24 ではない
- **THEN** bootstrap と preflight は変更前に非ゼロ終了し、必要 line と検出 version を示す

#### Scenario: Python が最低 version 未満である
- **WHEN** Python version が 3.14 未満である
- **THEN** bootstrap と preflight は変更前に非ゼロ終了し、最低 version と検出 version を示す

#### Scenario: Python が既定 line より新しい
- **WHEN** Python version が 3.15 以上である
- **THEN** bootstrap と preflight は major/minor line 不一致だけでは拒否せず、互換性判定を通常の repository checks に委ねる

#### Scenario: patch version が更新される
- **WHEN** Node 24 または Python 3.14 の別 patch version を使う
- **THEN** line が一致する限り preflight は受理し、repository は特定 patch への downgrade を要求しない

#### Scenario: runtime の検出結果を解釈できない
- **WHEN** 必須の Node、npm、Python のいずれかが見つからない、version command が失敗する、または version 出力を解釈できない
- **THEN** runtime preflight は変更前に非ゼロ終了し、対象 runtime と検出失敗理由を示す

### Requirement: V2-RUNTIME-2 npm dependency を決定論的かつ安全に導入する

テンプレートは MUST private package、exact version、package-lock v3 を依存の正本とし、通常導入時に dependency lifecycle script を実行しない。

#### Scenario: clean install を行う
- **WHEN** 利用者または CI が Node dependency を導入する
- **THEN** 公開手順は `npm ci --ignore-scripts` を使い、lockfile と不一致なら失敗する

#### Scenario: dependency version が範囲指定される
- **WHEN** tracked `package.json` の dependency または devDependency に exact ではない version 指定がある
- **THEN** repository check は失敗し、対象 package を報告する

#### Scenario: high 以上の監査問題がある
- **WHEN** 明示的な online audit で `npm audit --audit-level=high` が high または critical finding を返す
- **THEN** audit task は非ゼロ終了する

#### Scenario: package metadata が正本契約を満たさない
- **WHEN** `package.json` または `package-lock.json` が存在しない、JSON として不正、または lockfileVersion が 3 ではない
- **THEN** repository check は非ゼロ終了し、違反した file と契約を報告する

### Requirement: V2-RUNTIME-3 TypeScript 管理 CLI を追加ランナーなしで実行する

テンプレートは MUST TypeScript ESM の `repo-tools` を Node 24 で直接実行し、`tsc --noEmit` と Node test runner で検証する。

#### Scenario: 管理 CLI を実行する
- **WHEN** Task または package script が `repo-tools` を起動する
- **THEN** repo-local entrypoint を使い、`npx`、`npm exec`、implicit package fetch を行わない

#### Scenario: Node の型除去で非対応の構文を追加する
- **WHEN** source が Node 24 の直接実行で処理できない TypeScript 構文を含む
- **THEN** Node test または実行 smoke は失敗し、build 済み `dist` へ暗黙 fallback しない

#### Scenario: 型エラーを追加する
- **WHEN** `repo-tools` に TypeScript 型エラーがある
- **THEN** `tsc --noEmit` は非ゼロ終了する

#### Scenario: 未知の管理 CLI command を指定する
- **WHEN** command を省略する、または未定義の command を `repo-tools` に渡す
- **THEN** CLI は利用可能な command を示して非ゼロ終了し、処理を暗黙選択しない

### Requirement: V2-RUNTIME-4 Task を安定した公開インターフェースにする

テンプレートは MUST 利用者向け操作を Taskfile に公開し、Node と Python の内部実装を Task の背後に置く。

#### Scenario: 既存 Python 検査を実行する
- **WHEN** 利用者が既存の lint、typecheck、test task を実行する
- **THEN** 対応する Python tool は従来の責務を維持し、Node への全面移植を要求しない

#### Scenario: 隔離検査を実行する
- **WHEN** 利用者が `task check:isolated` を実行する
- **THEN** optional GSD host がなくても repository 内の決定論的検査を実行し、旧名 `check:without-gsd` は task 一覧にも実行可能な alias にも残らない

### Requirement: V2-RUNTIME-5 Node の自動導入は明示 opt-in と検証を要求する

bootstrap は MUST 既定では runtime を検出するだけとし、`--install-node` 指定時だけ公式 Node 配布物を user-local に導入する。

#### Scenario: Node がなく opt-in もない
- **WHEN** Node 24 が見つからず `--install-node` が指定されない
- **THEN** bootstrap は filesystem を変更せず失敗し、手動導入と opt-in の選択肢を示す

#### Scenario: user-local target を安全に決定できない
- **WHEN** `--install-node` が指定されたが user-local install root を絶対 path として決定できない
- **THEN** bootstrap は取得前に非ゼロ終了し、install root の指定方法を示す

#### Scenario: 対応 architecture へ導入する
- **WHEN** Linux x64 または arm64 で `--install-node` が指定され、配布物の SHA-256 が公式 checksum と一致する
- **THEN** bootstrap は user-local directory の新規 path にだけ展開し、導入した version と path を報告する

#### Scenario: checksum が一致しない
- **WHEN** 取得した配布物の SHA-256 が期待値と異なる
- **THEN** bootstrap は導入を中止し、取得物を runtime として有効化しない

#### Scenario: target が既に存在する
- **WHEN** 導入 target に file または directory が存在する
- **THEN** bootstrap は上書きせず非ゼロ終了する

#### Scenario: architecture が非対応である
- **WHEN** Linux x64 / arm64 以外で `--install-node` が指定される
- **THEN** bootstrap は取得前に非ゼロ終了し、対応対象を示す

#### Scenario: download または展開が途中で失敗する
- **WHEN** 配布物または checksum の取得、checksum の解釈、または archive の展開が失敗する
- **THEN** bootstrap は非ゼロ終了し、最終 target を有効化せず、一時取得物を後続実行の runtime として残さない

### Requirement: V2-RUNTIME-6 統合検査は依存導入後 offline で完結する

`task check` は MUST Node typecheck / test と既存 Python checks を実行する合成基盤を提供し、検査中にネットワークへ接続しない。後続 changes は同じ合成点へ自身が所有する検査を追加できる。

#### Scenario: 全検査が成功する
- **WHEN** lock 済み dependency が導入済みで Node と Python の test failure がない
- **THEN** `task check` はネットワークアクセスなしで exit 0 を返す

#### Scenario: 一つの検査が失敗する
- **WHEN** Node または Python の必須検査が失敗する
- **THEN** `task check` は非ゼロ終了し、失敗した検査を識別できる出力を残す

#### Scenario: 後続 change が検査を追加する
- **WHEN** 後続 change が OpenSpec、skill、automation workflow の検査を登録する
- **THEN** `task check` は同じ offline 合成点から登録済み検査を実行するが、本 change の完了は未実装の後続検査を要求しない

#### Scenario: lock 済み dependency が未導入である
- **WHEN** `task check` に必要な Node または Python dependency が local 環境に存在しない
- **THEN** `task check` は network 取得を開始せず非ゼロ終了し、明示的な導入入口を示す

### Requirement: V2-RUNTIME-7 release version の所有権を分離する

本 change は MUST 現行 `1.0.0` の `TEMPLATE_VERSION` を変更せず、Node 必須化と Python 3.14 最低化を `prepare-v2-release` への dependency handoff note に記録する。`TEMPLATE_VERSION=2.0.0` 更新、移行ガイド最終化、release-ready 判定は `prepare-v2-release` が所有する。

#### Scenario: runtime foundation が完了する
- **WHEN** 本 change の requirements と checks が完了する
- **THEN** `TEMPLATE_VERSION` は `1.0.0` を維持し、`2.0.0` 更新、移行ガイド最終化、release-ready 判定は全 4 changes 完了後の `prepare-v2-release` に残る
