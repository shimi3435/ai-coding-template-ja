## ADDED Requirements

### Requirement: BD-1 Bounded remote bundle schema
The metadata decoder MUST accept an explicit remote bundle descriptor without weakening existing Skill or ownership validation.

schemaVersion 2を維持し、bundleのtargetは `.agents/vendor/<name>`、subtreeはroot、refはtagに限定する。
exact file一覧をallowlist兼required listとし、全bundleを100 files／単一1 MiB／全体2 MiB以下に制限する。
旧entryの意味とserialize結果を変えず、未知field・不正値・衝突は拒否する。

#### Scenario: Existing Skills mixed with a bundle
- **WHEN** 通常remote/local/pluginとbundleを同じsourceで宣言する
- **THEN** 通常entryの契約を維持し、bundleだけへ専用targetと構造規則を適用する

### Requirement: BD-2 Metadata preflight before selected blob acquisition
Acquisition MUST validate the stable release, selected paths, legal mappings, and applicable limits for the entire cohort before requesting its selected blob bodies.

選択外本文を取得しない。取得したinstallerやlifecycle scriptを含むupstream codeは実行・importしない。
metadata不完全、特殊file、missing path、
上限超過、Git object SHA／size不一致を拒否する。既存GitHub API adapterとcredential保護を再利用する。

#### Scenario: Last selected file exceeds a limit
- **WHEN** 選択集合の末尾fileが上限を超えるかrequired pathが欠落する
- **THEN** 先行するfileも含めblob requestを送らず失敗する

#### Scenario: Release is unavailable or unstable
- **WHEN** 指定tagのreleaseが欠落、draft、prereleaseである
- **THEN** bundle取得を拒否し、branch headや別releaseへfallbackしない

### Requirement: BD-3 Exact offline inventory and legal integrity
Offline verification MUST match the bundle's declared file set, per-file digests, canonical tree, modes, and approved legal content without network or upstream execution.

root Skillを要求しない一方、欠落・余剰・改ざん・orphan・symlink・hardlink・特殊fileを拒否する。
通常Skillのroot Skill検証とgolden hashは維持する。file modeとsizeは宣言と一致させる。

#### Scenario: Nested Skills without a root Skill
- **WHEN** bundleの全file・mode・hash・legalが一致し、root `SKILL.md` はない
- **THEN** bundleは検証成功し、同じ構造を通常Skillとして渡した場合は拒否する

#### Scenario: Same bytes exposed through a hardlink
- **WHEN** bundle内fileが同じ内容でも別pathとinodeを共有する
- **THEN** live filesystem検証は失敗し、hash一致だけで受理しない

### Requirement: BD-4 Explicit policy changes and isolated application
Updates MUST preserve bundle policy unless a named repin explicitly approves its change, and application MUST remain confined to an independently cloned candidate.

移動・削除tag、履歴不連続、未承認legal変更は通常更新を停止する。repinは旧treeを旧lockで、
新treeを新sourceで検証し、name／target／ownership／形式を変更しない。
previewは無変更、apply失敗時は候補を保持して停止し、元repositoryへ波及させない。

#### Scenario: Only file content changes
- **WHEN** bundle policyは同じで選択fileの本文だけが変わる
- **THEN** JSONと人間向けpreviewは旧／新inventory由来のpathと変更情報を表示し、本文は出力しない

#### Scenario: Reduce the selected file list through repin
- **WHEN** 利用者が新file集合をsourceへ記録し、名前とstable tagのcommit／tag objectを明示repinする
- **THEN** 旧treeを新file集合で誤判定せず、新候補の正確な集合を検証して適用する

#### Scenario: Conflicting untracked file in the vendor target
- **WHEN** candidateの管理領域にuntracked／ignored fileまたは不正なlinkがある
- **THEN** 全writeの開始前に拒否し、既存fileを置換しない

### Requirement: BD-5 No implicit host registration
Link repair and ordinary setup MUST NOT generate host links or activate plugins for bundle entries.

bundleの本文所有をplugin managerへ転嫁しない。既存の通常Skill linkは検証・修復を維持する。
利用者やhostが別途作ったlinkを自動撤去しない。

#### Scenario: Link repair with a valid bundle present
- **WHEN** 通常Skillとbundleが併存するcheckoutでlinksを実行する
- **THEN** 通常Skillだけを修復し、bundle由来のhost link・登録・認証処理を追加しない

### Requirement: BD-6 Compatibility and downstream validation
The change MUST preserve existing Skill workflows and retain offline bundle validation after the existing template-assets prune operation.

通常Skillのadopt-local／migrateを維持し、bundleのadopt-localは明示拒否する。
新CLI・新updater・host cleanupは追加しない。新bundleを旧readerで利用可能とは主張しない。

#### Scenario: Pruned distribution containing a synthetic bundle
- **WHEN** template保守資産を既存pruneで除去する
- **THEN** bundleと共通verifyは残り、通常checkが削除済み保守資産やnetworkへ依存しない
