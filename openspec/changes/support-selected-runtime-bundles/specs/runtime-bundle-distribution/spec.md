## ADDED Requirements

### Requirement: BD-1 Bounded remote bundle schema
The metadata decoder MUST accept an explicit remote bundle descriptor without weakening existing Skill or ownership validation.

schemaVersion 2を維持し、bundleのtargetは `.agents/vendor/<name>`、subtreeはroot、refはtagに限定する。
exact file一覧をallowlist兼required listとし、全bundleを100 files／単一1 MiB／全体2 MiB以下に制限する。
旧entryの意味とserialize結果を変えず、未知field・不正値・衝突は拒否する。
bundleのsource／lockにlegacyRefを認めず、通常Skillのmigration契約は維持する。

#### Scenario: Existing Skills mixed with a bundle
- **WHEN** 通常remote/local/pluginとbundleを同じsourceで宣言する
- **THEN** 通常entryの契約を維持し、bundleだけへ専用targetと構造規則を適用する

#### Scenario: Bundle claims legacy migration provenance
- **WHEN** bundle sourceまたはlockにlegacyRefが存在する
- **THEN** 値にかかわらず拒否し、v1 migration由来として扱わない

### Requirement: BD-2 Metadata preflight before selected blob acquisition
Acquisition MUST validate the stable release, selected paths, legal mappings, and applicable limits for the entire cohort before requesting its selected blob bodies.

選択外本文を取得しない。取得したinstallerやlifecycle scriptを含むupstream codeは実行・importしない。
metadata不完全、特殊file、missing path、
上限超過、Git object SHA／size不一致を拒否する。既存GitHub API adapterとcredential保護を再利用する。
upstream Git modeは宣言したexecutableと一致させる。100644はfalse、100755はtrueに限り、overrideを認めない。
stableはGitHub releaseのdraft=false、prerelease=false、tag一致を意味し、SemVer正式版は保証しない。
既存のcohort上限を継承し、操作全体の累積files／bytes／API metadata予算は追加しない。

#### Scenario: Last selected file exceeds a limit
- **WHEN** 選択集合の末尾fileが上限を超えるかrequired pathが欠落する
- **THEN** 先行するfileも含めblob requestを送らず失敗する

#### Scenario: Release is unavailable or unstable
- **WHEN** 指定tagのreleaseが欠落、draft、prereleaseである
- **THEN** bundle取得を拒否し、branch headや別releaseへfallbackしない

#### Scenario: Upstream mode disagrees with the declaration
- **WHEN** upstreamが100644でexecutable=true、または100755でexecutable=falseである
- **THEN** そのcohortのblob requestを一切送らず失敗する

#### Scenario: Release name contains a prerelease identifier
- **WHEN** v1.0.0またはv1.0.0-rc.1のreleaseがstable属性・tag一致と他の取得条件を満たす
- **THEN** tag名のSemVer解釈を理由に拒否せず受理する

#### Scenario: Independent cohorts exceed one cohort's aggregate budget
- **WHEN** 各bundleと各cohortは上限内だが、独立cohortの本文合計が50 MiBを超える
- **THEN** 操作全体の50 MiB上限は存在しないため、その累積値だけでは拒否しない

#### Scenario: A later cohort fails metadata preflight
- **WHEN** 先行cohortのblob取得後に後続cohortのmode・path・上限などの事前検査が失敗する
- **THEN** 後続cohortのblob取得と操作全体のapplyを行わず、status=failed、exit code=1、changes=[]とする

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

#### Scenario: Invalid entries exist at the vendor root
- **WHEN** vendor root直下に通常file・symlink・特殊file・未宣言directory、またはpathのcase-fold／prefix衝突がある
- **THEN** offline verifyは拒否し、snapshot検証でも宣言外のvendor pathを見落とさない

### Requirement: BD-4 Explicit policy changes and isolated application
Updates MUST preserve bundle policy unless a named repin explicitly approves its change, and application MUST remain confined to an independently cloned candidate.

移動・削除tag、履歴不連続、未承認legal変更は通常更新を停止する。repinは旧treeを旧lockで、
新treeを新sourceで検証し、name／target／ownership／形式を変更しない。
previewは無変更、apply失敗時は候補を保持して停止し、元repositoryへ波及させない。
release／refはpreviewとapplyで別々に観測し、各取得処理の本文取得後にも再確認する。

#### Scenario: Only upstream mode changes in a new version
- **WHEN** 同じ本文でupstream modeだけが異なる新commitを採用する
- **THEN** 通常updateでは採用せず、modeと一致する宣言変更と明示repinを経てlock／previewへ実行bit差分を記録する

#### Scenario: Policy changes without a file change
- **WHEN** 同一commitでlimitsだけを明示repinにより変更し、実体は新しい上限を満たす
- **THEN** policy変更をplannedとして表示し、bundleFileChanges=[]でも適用後のsource／lockを一致させる

#### Scenario: Release becomes ineligible after preview
- **WHEN** preview後または本文取得中にreleaseが削除・draft化・prerelease化されるかtagが移動し、再観測で検出する
- **THEN** 過去のpreviewを再利用して適用せず、操作全体を失敗させる

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
The change MUST preserve existing Skill workflows, define explicit repository bundle retirement, retain offline validation after template-assets prune, and record metadata-only feasibility for the pinned Genshijin candidate.

通常Skillのadopt-local／migrateを維持し、bundleのadopt-localは明示拒否する。
新CLI・新updater・host cleanupは追加しない。新bundleを旧readerで利用可能とは主張しない。
配布廃止はsource／lock／vendor実体と関連文書を同じGit変更で撤去し、撤去後verifyから順に検証する。
固定版のfeasibilityは候補path・祖先・type・mode・件数・bytesを確認する。最終runtime closureは#74が所有する。

#### Scenario: Pruned distribution containing a synthetic bundle
- **WHEN** template保守資産を既存pruneで除去する
- **THEN** bundleと共通verifyは残り、通常checkが削除済み保守資産やnetworkへ依存しない

#### Scenario: A bundle is retired in a Git change
- **WHEN** 対象source／lock／vendor実体を同じ変更で撤去し、関連文書も更新する
- **THEN** 撤去後verify、撤去commit基準のcheck、prune後の検証が成功し、撤去bundleの再取得や他資産の削除を行わない

#### Scenario: A retirement leaves partial state
- **WHEN** source entry・lock entry・vendor実体の一部だけが残る6通りのいずれかである
- **THEN** offline verifyは失敗し、撤去完了として次のcheckへ進めない

#### Scenario: Pinned upstream metadata fits the distribution constraints
- **WHEN** 固定tag／commitに対して明示した候補一覧のmetadataをread-onlyで照合する
- **THEN** 配布制約との適合または不適合を記録し、本文取得・実行・host登録なしの結果をruntime互換性の保証と区別する
