## ADDED Requirements

### Requirement: V2-RUNTIME-1 Node と Python の runtime line を固定する

テンプレートは MUST Node.js 24 LTS と Python 3.14 をサポート対象の既定・最低 runtime line として宣言し、実行前に検証する。

#### Scenario: 対応 runtime を使う
- **WHEN** Node の major が 24 で Python の major/minor が 3.14 である
- **THEN** runtime preflight は成功し、検出した完全 version を診断出力へ含める

#### Scenario: Node または Python の line が異なる
- **WHEN** Node の major が 24 ではない、または Python の major/minor が 3.14 ではない
- **THEN** bootstrap と管理 CLI は変更前に非ゼロ終了し、必要 line と検出 version を示す

#### Scenario: patch version が更新される
- **WHEN** Node 24 または Python 3.14 の別 patch version を使う
- **THEN** line が一致する限り preflight は受理し、repository は特定 patch への downgrade を要求しない

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

### Requirement: V2-RUNTIME-4 Task を安定した公開インターフェースにする

テンプレートは MUST 利用者向け操作を Taskfile に公開し、Node と Python の内部実装を Task の背後に置く。

#### Scenario: 既存 Python 検査を実行する
- **WHEN** 利用者が既存の lint、typecheck、test task を実行する
- **THEN** 対応する Python tool は従来の責務を維持し、Node への全面移植を要求しない

#### Scenario: 隔離検査を実行する
- **WHEN** 利用者が `task check:isolated` を実行する
- **THEN** optional GSD host がなくても repository 内の決定論的検査を実行し、旧名 `check:without-gsd` を正規入口として扱わない

### Requirement: V2-RUNTIME-5 Node の自動導入は明示 opt-in と検証を要求する

bootstrap は MUST 既定では runtime を検出するだけとし、`--install-node` 指定時だけ公式 Node 配布物を user-local に導入する。

#### Scenario: Node がなく opt-in もない
- **WHEN** Node 24 が見つからず `--install-node` が指定されない
- **THEN** bootstrap は filesystem を変更せず失敗し、手動導入と opt-in の選択肢を示す

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

### Requirement: V2-RUNTIME-6 統合検査は依存導入後 offline で完結する

`task check` は MUST Node typecheck / test、Python checks、skill integrity、OpenSpec generated drift、repo-local OpenSpec validate を実行し、検査中にネットワークへ接続しない。

#### Scenario: 全検査が成功する
- **WHEN** lock 済み dependency が導入済みで repository に drift や test failure がない
- **THEN** `task check` はネットワークアクセスなしで exit 0 を返す

#### Scenario: 一つの検査が失敗する
- **WHEN** Node、Python、skill、OpenSpec のいずれかの必須検査が失敗する
- **THEN** `task check` は非ゼロ終了し、失敗した検査を識別できる出力を残す

### Requirement: V2-RUNTIME-7 v2 の破壊的変更を release 境界で明示する

テンプレートは MUST version を `2.0.0` に更新し、Node 必須化と Python 3.14 最低化を移行ガイドに記録する。

#### Scenario: v1 利用者が v2 へ移行する
- **WHEN** 利用者が v2 移行ガイドを読む
- **THEN** 前提 runtime、依存導入、変更された Task、手動移行手順、rollback 境界を確認できる

#### Scenario: 自動移行を要求する
- **WHEN** v1 下流 repository に v2 を適用する
- **THEN** テンプレートは未確認の自動 rewrite を実行せず、手動ガイドを正規経路とする
