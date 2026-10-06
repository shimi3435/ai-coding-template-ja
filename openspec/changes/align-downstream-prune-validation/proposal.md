# 下流 prune と repository 品質検証の境界を整合する

文書種別: 変更提案。
Issue: https://github.com/shimi3435/ai-coding-template-ja/issues/51
設計入力: origin/main `b5a70047a294c7424c0c0398bd5eb434edb42b9a`。
作成日: 2026-10-05。

## Why

通常検証が `docs/template/release.md`、テンプレートの ADR・履歴、および
`TEMPLATE_VERSION=1.0.0` の固定条件を要求している。そのため既存の
`task prune-template-docs -- --apply` で文書を削除すると、下流の通常検証が成立しない。
また、現在 `docs/template/` にある Skill 操作・metadata・repository contracts の説明は
下流にも必要であり、ディレクトリ名だけを理由に削除してはならない。

#71 の判断と、実装済みの #75・#52・#76・#77・#50 を受け取る。
削除済みの更新 PR 自動化や自作 Skill の内容 hash lock を復活させず、
下流共通の検証とテンプレート保守だけの検証を分離する。

## What Changes

- 正式入口 `./scripts/check.sh` と内部の `task check` を下流共通検証にする。
  保守検証は明示的な `task check:template` に分離し、テンプレート CI では両方を実行する。
- 下流向けリファレンスを `docs/reference/` へ移し、保守専用のテストを
  `template-maintenance/` へ分離する。一般のテストや安全検証を一括で除外しない。
- 既存の prune 入口を維持し、保守文書・専用テスト・専用 CI と共有ファイル内の専用項目を
  一回の明示操作で整合させる。削除・書換え対象は固定し、preview を既定にする。
- 同梱・完全除去・不整合を現在のファイルと呼出設定から判定する。
  完了 receipt、利用者が切り替える profile、内容 hash lock は追加しない。
- design §3.1 で保守文書15件・保守テスト3件・専用 workflow を含む全対象の
  path / 型 / 必須性 / prune 時の扱いを固定する。欠落したファイルを現存 tree から推測しない。
- 直接参照の surface と構文を design §3.2 で限定する。通常 tests も検査し、
  負例は専用 JSON fixture に集約する。動的参照の完全検出は保証しない。
- 適用は Git 管理下で対象が追跡済みの場合に限る。対象の未コミット差分、未追跡・ignored
  ファイル、危険な path、判別不能な共有設定を全変更の前に拒否する。
- 途中失敗は非ゼロ終了し、部分変更を成功扱いしない。自動ロールバックは行わず、
  対象だけの復旧方法を案内する。GitHub や host 設定には書き込まない。
- **互換変更**: 文書だけを削除した旧 prune 済み構成は完全除去と見なさない。
  対象資産を復元してから現行操作を使う。prune の削除範囲が文書以外にも広がることを明記する。

## Capabilities

### New Capabilities

- `downstream-prune-validation`: 下流共通検証、保守検証、prune の状態・安全性・失敗時契約。

### Modified Capabilities

なし。テンプレートの `openspec/specs/` は空のため、本 change の delta に要件を置く。

## Impact

対象責務と具体的な移設先は [design.md](design.md)、実装順は [tasks.md](tasks.md) に記載する。
Node.js 24 / npm、Python >=3.14、既存 dependency / lockfile、remote Skill の固定・legal・links・
offline 検証を維持する。新規 dependency や汎用 profile engine / plugin manager は導入しない。

変更は一つの prune 操作を成立させる一体の成果であり、コード・テスト・CI・文書を別 change に分割しない。
#74 へ同梱中の offline 検証と repository 資産の除去境界を引き渡すが、
Genshijin の取得・host 登録解除・caveman 撤去は実装しない。
#73 の policy 全体整理、#66 の archive semantics、#62 の README 全体設計、
#70 の版更新・release-ready 判定も対象外である。historical records の過去の判断・本文は
改変しない。下流文書の移設に伴う link target だけの機械的修正は、design §2 の許可表に従う。

## Acceptance Criteria

- fresh、rename 後、prune 後の使い捨て repository で setup、正式 gate、doctor が成立する。
- 通常検証は release 版固定や保守文書の内容に依存せず、下流必須リファレンスが prune 後も残る。
- 保守検証は明示実行でき、テンプレート CI とローカルで同じ検証を実行できる。
- remote lock 不一致、legal 不整合、link 破損を検出し、自作内容 lock を要求しない。
- 部分欠落を完全除去と混同せず、dry-run 無変更、再実行、対象外差分保護、途中失敗を検証する。
- manifest 各行と各参照 surface の負例を検証し、説明・JSON fixture を実行参照と誤認しない。
- 移設に伴う履歴の変更が許可した link target だけであることと、新しいリンク解決を確認する。
- 通常 offline 検証に未使用 host・認証・ネットワークを要求しない。
- [validation.md](validation.md) の検証と、AGENTS.md OSWF-5 に従う実装後の review / verifier が成功する。

## Authorization and Status

今回の承認はレビュー後の合意に基づく OpenSpec 6文書の修正・検証までであり、
実装開始は明示的に禁止されている。
本提案の作成・形式検証を、実装・実動作検証・change 完了の代わりにしない。
実装 tasks は未着手のまま保持し、別途実装開始の指示を受けるまで実行しない。
レビューで指摘された manifest・直接参照・履歴リンクの判断を対話で確定し、仕様へ反映した。
この合意と §3.1 / §3.2 の明文化を前提に、仕様上の未解決判断はない。
12分類の再監査と検証対応は [spec-holes.md](spec-holes.md) を参照する。
